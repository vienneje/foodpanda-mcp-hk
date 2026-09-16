import { homedir } from "os";
import { join } from "path";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { getRegionConfig } from "./config.js";
import { browserTransport } from "./browser-transport.js";

const STATE_DIR = process.env.FOODPANDA_STATE_DIR || join(homedir(), ".foodpanda-mcp");
const TOKEN_DIR = STATE_DIR;
const TOKEN_FILE = join(TOKEN_DIR, "token.json");
const BROWSER_DATA_DIR = join(TOKEN_DIR, "browser-data");

interface PersistedToken {
  token: string;
  savedAt: string;
  region?: string;
}

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

export function persistToken(token: string): void {
  mkdirSync(TOKEN_DIR, { recursive: true, mode: 0o700 });
  const cfg = getRegionConfig();
  const data: PersistedToken = {
    token,
    savedAt: new Date().toISOString(),
    region: cfg.apiBase,
  };
  writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
}

export function browserProfileDir(): string {
  mkdirSync(BROWSER_DATA_DIR, { recursive: true, mode: 0o700 });
  return BROWSER_DATA_DIR;
}

/**
 * Open the regional storefront in the SHARED persistent browser context and
 * intercept the Bearer token the web app sends to the regional fd-api host.
 *
 * Reusing the shared context matters: that context is also the one the API
 * transport uses, so it already holds the PerimeterX clearance cookie plus the
 * login cookies after the user authenticates.
 */
export async function refreshTokenViaBrowser(
  timeoutSeconds: number = 300
): Promise<string> {
  const cfg = getRegionConfig();
  const apiHost = new URL(cfg.apiBase).host;

  const context = await browserTransport().getContext();
  const page = context.pages()[0] || (await context.newPage());

  try {
    return await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `Login timed out after ${timeoutSeconds} seconds. Please try again.`
          )
        );
      }, timeoutSeconds * 1000);

      page.on("request", (request: any) => {
        const url = request.url();
        if (!url.includes(apiHost)) return;

        const authHeader = request.headers()["authorization"];
        if (!authHeader || !authHeader.startsWith("Bearer ")) return;

        const token = authHeader.slice("Bearer ".length).trim();
        if (token.length === 0) return;

        // Validate JWT structure (header.payload.signature)
        if (token.split(".").length !== 3) return;

        clearTimeout(timer);
        resolve(token);
      });

      page.goto(cfg.webHost).catch((err: Error) => {
        clearTimeout(timer);
        reject(new Error(`Failed to navigate to ${cfg.webHost}: ${err.message}`));
      });
    });
  } finally {
    if (context.pages()[0] !== page) await page.close().catch(() => {});
  }
}