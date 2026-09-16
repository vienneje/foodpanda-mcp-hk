# Token Refresh via Browser Automation — Design

**Issue:** https://github.com/johnwhoyou/foodpanda-mcp/issues/1
**Date:** 2026-03-01

## Problem

Session tokens expire periodically, requiring users to manually open DevTools, find a request to `ph.fd-api.com`, and copy the Bearer token. This is the biggest friction point in the setup.

## Solution

Add a `refresh_token` MCP tool that uses Playwright to automate token extraction via a human-in-the-loop browser login flow.

## Scope

- Token refresh via Playwright browser automation
- Token persistence to disk (`~/.foodpanda-mcp/token.json`)
- Tokenless startup (server starts without a token, AI calls `refresh_token` on first use)

Out of scope (future work):
- Latitude/longitude extraction from intercepted requests
- Auto-detect token expiry before it happens (JWT `expires` field)

## Architecture

### New File: `src/token-manager.ts`

Encapsulates all token persistence and browser refresh logic:

- `loadPersistedToken(): string | null` — reads from `~/.foodpanda-mcp/token.json`
- `persistToken(token: string): void` — writes to `~/.foodpanda-mcp/token.json`
- `refreshTokenViaBrowser(timeoutSeconds: number): Promise<string>` — Playwright browser flow

### Token Storage

**File:** `~/.foodpanda-mcp/token.json`

```json
{
  "token": "eyJ...",
  "savedAt": "2026-03-01T12:00:00Z"
}
```

**Loading priority on startup:**
1. `~/.foodpanda-mcp/token.json` (persisted file)
2. `FOODPANDA_SESSION_TOKEN` env var
3. No token — server starts anyway, first tool call guides AI to call `refresh_token`

### The `refresh_token` Tool

**Input:** Optional `timeout` (number, seconds, default 120).

**Flow:**
1. Launch Playwright Chromium in headed mode (`headless: false`)
2. Navigate to `https://www.foodpanda.ph`
3. Intercept requests to `ph.fd-api.com` with `Authorization: Bearer` header
4. Wait for user to log in manually (handles CAPTCHAs, MFA)
5. On token interception: close browser, validate JWT, update client, persist to disk
6. On timeout: close browser, return error

**Error handling:**
- Playwright not installed: "Run `npx playwright install chromium`"
- Browser crash: clean error message
- Timeout: "Login timed out after {n} seconds"

### Changes to Existing Files

**`index.ts`:**
- Remove hard exit on missing `FOODPANDA_SESSION_TOKEN`
- Load token with priority: persisted file > env var > null
- Create `FoodpandaClient` with available token or null

**`foodpanda-client.ts`:**
- Allow construction with null token
- Add `updateSessionToken(token: string)` method
- Throw clear error if API called with no token

**`server.ts`:**
- Register `refresh_token` tool
- Dynamic import of Playwright (only when tool is called)

### Dependencies

- Add `playwright` to `dependencies`
- Users run `npx playwright install chromium` after `npm install`
