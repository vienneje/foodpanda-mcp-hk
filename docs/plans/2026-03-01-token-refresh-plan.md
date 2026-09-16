# Token Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `refresh_token` MCP tool that uses Playwright to automate session token extraction via browser login, with token persistence and tokenless startup support.

**Architecture:** New `src/token-manager.ts` module encapsulates token persistence (`~/.foodpanda-mcp/token.json`) and Playwright browser automation. `FoodpandaClient` gets updated to accept null tokens and support hot-swapping. `index.ts` loads tokens with priority: persisted file > env var > null. `server.ts` registers the new `refresh_token` tool.

**Tech Stack:** TypeScript, Playwright (chromium), Node.js `fs` + `os` + `path`

**Design Doc:** `docs/plans/2026-03-01-token-refresh-design.md`

---

### Task 1: Add Playwright Dependency

**Files:**
- Modify: `package.json`

**Step 1: Install Playwright**

Run:
```bash
npm install playwright
```

This adds `playwright` to `dependencies` in `package.json`.

**Step 2: Install Chromium browser binary**

Run:
```bash
npx playwright install chromium
```

**Step 3: Verify installation**

Run:
```bash
node -e "const { chromium } = require('playwright'); console.log('Playwright OK');"
```

Expected: `Playwright OK`

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add playwright dependency for browser-based token refresh"
```

---

### Task 2: Create `src/token-manager.ts`

**Files:**
- Create: `src/token-manager.ts`

**Step 1: Write the token manager module**

```typescript
import { homedir } from "os";
import { join } from "path";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";

const TOKEN_DIR = join(homedir(), ".foodpanda-mcp");
const TOKEN_FILE = join(TOKEN_DIR, "token.json");

interface PersistedToken {
  token: string;
  savedAt: string;
}

/**
 * Load a previously persisted session token from ~/.foodpanda-mcp/token.json.
 * Returns null if no file exists or the file is malformed.
 */
export function loadPersistedToken(): string | null {
  try {
    if (!existsSync(TOKEN_FILE)) return null;
    const data = JSON.parse(readFileSync(TOKEN_FILE, "utf-8")) as PersistedToken;
    if (data && typeof data.token === "string" && data.token.length > 0) {
      return data.token;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Persist a session token to ~/.foodpanda-mcp/token.json so it survives
 * server restarts. Creates the directory if it doesn't exist.
 */
export function persistToken(token: string): void {
  mkdirSync(TOKEN_DIR, { recursive: true });
  const data: PersistedToken = {
    token,
    savedAt: new Date().toISOString(),
  };
  writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Launch a headed Chromium browser to foodpanda.ph, wait for the user to log in,
 * and intercept the Bearer token from requests to ph.fd-api.com.
 *
 * Playwright is dynamically imported so it's only loaded when this function is called.
 *
 * @param timeoutSeconds — how long to wait for login before giving up (default 120)
 * @returns the extracted Bearer token string
 */
export async function refreshTokenViaBrowser(
  timeoutSeconds: number = 120
): Promise<string> {
  // Dynamic import — Playwright is only loaded when refresh is actually called
  let chromium: typeof import("playwright").chromium;
  try {
    const pw = await import("playwright");
    chromium = pw.chromium;
  } catch {
    throw new Error(
      "Playwright is not installed. Run: npx playwright install chromium"
    );
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: false });
  } catch (err) {
    throw new Error(
      `Failed to launch browser. Make sure Chromium is installed: npx playwright install chromium\n${(err as Error).message}`
    );
  }

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    return await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `Login timed out after ${timeoutSeconds} seconds. Please try again.`
          )
        );
      }, timeoutSeconds * 1000);

      // Listen for any request to ph.fd-api.com that carries a Bearer token
      page.on("request", (request) => {
        const url = request.url();
        if (!url.includes("ph.fd-api.com")) return;

        const authHeader = request.headers()["authorization"];
        if (!authHeader || !authHeader.startsWith("Bearer ")) return;

        const token = authHeader.slice("Bearer ".length).trim();
        if (token.length === 0) return;

        clearTimeout(timer);
        resolve(token);
      });

      page.goto("https://www.foodpanda.ph").catch((err) => {
        clearTimeout(timer);
        reject(new Error(`Failed to navigate to foodpanda.ph: ${(err as Error).message}`));
      });
    });
  } finally {
    await browser.close().catch(() => {});
  }
}
```

**Step 2: Verify it compiles**

Run:
```bash
npx tsc --noEmit
```

Expected: No errors

**Step 3: Commit**

```bash
git add src/token-manager.ts
git commit -m "feat: add token-manager module for persistence and browser refresh"
```

---

### Task 3: Update `FoodpandaClient` to Support Null Token and Hot-Swap

**Files:**
- Modify: `src/foodpanda-client.ts:93-149` (constructor and extractCustomerCode)
- Modify: `src/foodpanda-client.ts:155-165` (commonHeaders)
- Modify: `src/foodpanda-client.ts:167-225` (restRequest, graphqlRequest)

**Step 1: Change constructor to accept null token**

In `src/foodpanda-client.ts`, change the class fields and constructor:

Change line 94:
```typescript
// Before:
private sessionToken: string;
// After:
private sessionToken: string | null;
```

Change line 116:
```typescript
// Before:
constructor(sessionToken: string, latitude: number, longitude: number) {
// After:
constructor(sessionToken: string | null, latitude: number, longitude: number) {
```

Change line 120:
```typescript
// Before:
this.customerCode = this.extractCustomerCode(sessionToken);
// After:
this.customerCode = sessionToken ? this.extractCustomerCode(sessionToken) : "";
```

**Step 2: Add `updateSessionToken` method**

Add after the `extractCustomerCode` method (after line 149):

```typescript
/**
 * Hot-swap the session token (e.g. after a browser-based refresh).
 * Re-extracts the customer code from the new JWT.
 */
public updateSessionToken(token: string): void {
  this.sessionToken = token;
  this.customerCode = this.extractCustomerCode(token);
}
```

**Step 3: Add token guard to `commonHeaders`**

Change `commonHeaders()` to throw if called with no token:

```typescript
private commonHeaders(): Record<string, string> {
  if (!this.sessionToken) {
    throw new Error(
      "No session token configured. Please call the refresh_token tool to log in."
    );
  }
  return {
    Authorization: `Bearer ${this.sessionToken}`,
    "x-fp-api-key": "volo",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "perseus-client-id": this.perseusClientId,
    "perseus-session-id": this.perseusSessionId,
  };
}
```

**Step 4: Verify it compiles**

Run:
```bash
npx tsc --noEmit
```

Expected: No errors

**Step 5: Commit**

```bash
git add src/foodpanda-client.ts
git commit -m "feat: allow FoodpandaClient to start without a token and support hot-swap"
```

---

### Task 4: Update `index.ts` for Token Loading Priority and Tokenless Startup

**Files:**
- Modify: `src/index.ts`

**Step 1: Rewrite index.ts**

Replace the entire file with:

```typescript
#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FoodpandaClient } from "./foodpanda-client.js";
import { createServer } from "./server.js";
import { loadPersistedToken } from "./token-manager.js";

// Token loading priority: persisted file > env var > null (tokenless startup)
const sessionToken =
  loadPersistedToken() || process.env.FOODPANDA_SESSION_TOKEN || null;

const latitude = parseFloat(process.env.FOODPANDA_LATITUDE || "");
const longitude = parseFloat(process.env.FOODPANDA_LONGITUDE || "");

if (isNaN(latitude) || isNaN(longitude)) {
  console.error(
    "Error: FOODPANDA_LATITUDE and FOODPANDA_LONGITUDE environment variables are required.\n" +
      "These should be the coordinates of your delivery address.\n" +
      "Example: FOODPANDA_LATITUDE=14.5623 FOODPANDA_LONGITUDE=121.0137"
  );
  process.exit(1);
}

if (sessionToken) {
  console.error("foodpanda-mcp: loaded session token");
} else {
  console.error(
    "foodpanda-mcp: no session token found. Use the refresh_token tool to log in."
  );
}

const client = new FoodpandaClient(sessionToken, latitude, longitude);
const server = createServer(client);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("foodpanda-mcp server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

**Step 2: Verify it compiles**

Run:
```bash
npx tsc --noEmit
```

Expected: No errors

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: support tokenless startup with persisted file > env var > null priority"
```

---

### Task 5: Register `refresh_token` Tool in `server.ts`

**Files:**
- Modify: `src/server.ts`

**Step 1: Add imports and register the tool**

Add import at the top of `server.ts` (after the existing imports):

```typescript
import { refreshTokenViaBrowser, persistToken } from "./token-manager.js";
```

Add the `refresh_token` tool registration after the `place_order` tool block (before the `return server;` line):

```typescript
// --- refresh_token ---
server.registerTool(
  "refresh_token",
  {
    title: "Refresh Session Token",
    description:
      "Opens a browser window to foodpanda.ph so the user can log in. Intercepts the session token from network requests and updates the server. Call this when: (1) other tools return a 'session token expired' or 'No session token configured' error, or (2) the user wants to switch accounts. The browser window is visible — the user logs in manually (handling any CAPTCHAs or MFA). Once logged in, the token is captured automatically and saved for future sessions.",
    inputSchema: z.object({
      timeout: z
        .number()
        .optional()
        .describe(
          "How long to wait for login in seconds (default 120). Increase if the user needs more time."
        ),
    }),
  },
  async ({ timeout }) => {
    try {
      const timeoutSeconds = timeout ?? 120;
      const token = await refreshTokenViaBrowser(timeoutSeconds);

      // Update the in-memory client
      client.updateSessionToken(token);

      // Persist to disk for future sessions
      persistToken(token);

      // Show a masked preview of the token
      const masked =
        token.length > 16
          ? `${token.slice(0, 8)}...${token.slice(-8)}`
          : "****";

      return {
        content: [
          {
            type: "text" as const,
            text: `Token refreshed successfully (${masked}). You can now continue using other tools.`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error refreshing token: ${(error as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);
```

**Step 2: Verify it compiles**

Run:
```bash
npx tsc --noEmit
```

Expected: No errors

**Step 3: Commit**

```bash
git add src/server.ts
git commit -m "feat: register refresh_token MCP tool for browser-based auth"
```

---

### Task 6: Build and Smoke Test

**Files:** None (verification only)

**Step 1: Full build**

Run:
```bash
npm run build
```

Expected: Clean compilation, `build/` directory updated.

**Step 2: Verify the server starts without a token**

Run (with no FOODPANDA_SESSION_TOKEN set):
```bash
FOODPANDA_LATITUDE=14.5623 FOODPANDA_LONGITUDE=121.0137 node build/index.js 2>&1 | head -5
```

Expected: Should print "no session token found" message and "server running on stdio" — NOT exit with an error.

**Step 3: Verify the build output includes token-manager**

Run:
```bash
ls build/token-manager.js
```

Expected: File exists.

**Step 4: Commit build if needed (skip if build/ is gitignored)**

The `build/` directory is gitignored, so no commit needed.

---

### Task 7: Update README

**Files:**
- Modify: `README.md`

**Step 1: Update the README**

Make these changes to `README.md`:

1. In the **Features** section, add a bullet:
   ```
   - Automatic token refresh via browser login (no more copying tokens from DevTools)
   ```

2. Replace the **Quick Start** section 1 ("Get your foodpanda credentials") with:
   ```markdown
   ### 1. Get your delivery coordinates

   Get the latitude and longitude of your delivery address (right-click on [Google Maps](https://maps.google.com) → copy coordinates).

   > **Note:** You no longer need to manually copy a session token. The `refresh_token` tool handles authentication by opening a browser window for you to log in.
   ```

3. Update the **Claude Desktop** config example to remove `FOODPANDA_SESSION_TOKEN`:
   ```json
   {
     "mcpServers": {
       "foodpanda": {
         "command": "npx",
         "args": ["-y", "foodpanda-mcp"],
         "env": {
           "FOODPANDA_LATITUDE": "14.5623",
           "FOODPANDA_LONGITUDE": "121.0137"
         }
       }
     }
   }
   ```

4. Update the **Other MCP Clients** paragraph:
   ```
   Any MCP-compatible client that supports stdio transport will work. Set the two coordinate environment variables and run `npx foodpanda-mcp`. On first use, the AI will open a browser for you to log in to foodpanda.
   ```

5. Add `refresh_token` to the **Available Tools** table:
   ```
   | `refresh_token` | Open a browser to log in and refresh the session token |
   ```

6. Update the **Environment Variables** table — change `FOODPANDA_SESSION_TOKEN` from Required to Optional:
   ```
   | `FOODPANDA_SESSION_TOKEN` | No | JWT bearer token (optional — use `refresh_token` tool instead) |
   ```

7. Add a **Building from Source** note after the `npm install` line:
   ```
   npm install
   npx playwright install chromium   # Required for token refresh
   npm run build
   ```

8. Update the **Limitations** section — replace the "Session tokens expire" bullet:
   ```
   - **Session tokens expire.** The `refresh_token` tool handles this automatically — the AI opens a browser for you to log in when needed.
   ```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README for automatic token refresh via browser"
```

---

### Task 8: Final Verification and Feature Commit

**Files:** None (verification only)

**Step 1: Clean build**

Run:
```bash
rm -rf build && npm run build
```

Expected: Clean compilation, no errors.

**Step 2: Verify all new files are tracked**

Run:
```bash
git status
```

Expected: Clean working tree (all changes committed).

**Step 3: Verify the token-manager module loads**

Run:
```bash
node -e "import('./build/token-manager.js').then(m => { console.log('loadPersistedToken:', typeof m.loadPersistedToken); console.log('persistToken:', typeof m.persistToken); console.log('refreshTokenViaBrowser:', typeof m.refreshTokenViaBrowser); })"
```

Expected: All three functions should print `function`.
