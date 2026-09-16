/**
 * Browser-backed HTTP transport.
 *
 * Why this exists: fd-api is fronted by PerimeterX (the "Access to this page has
 * been denied" / px-captcha wall). Anonymous or cookie-less fetch() calls get a
 * 403 challenge payload before the API ever sees the request, which is exactly
 * what we measured from a French IP against both ph.fd-api.com and
 * hk.fd-api.com. A real browser context solves the challenge once and then holds
 * the _px3 cookie, so requests issued *from that context* are served normally.
 *
 * Everything goes through one persistent Playwright context:
 *   - it is the same context the login flow uses, so login cookies are reused;
 *   - cookies (auth, PX, session) live in one place;
 *   - the browser profile on disk keeps the PX clearance between runs.
 */

import { mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { getRegionConfig } from "./config.js";

export interface TransportResponse {
  status: number;
  ok: boolean;
  text: string;
}

const PROFILE_DIR = join(homedir(), ".foodpanda-mcp", "browser-data");

interface BrowserLike {
  launchPersistentContext: (dir: string, options: Record<string, unknown>) => Promise<any>;
}

export class BrowserTransport {
  private context: any = null;
  private launch: Promise<any> | null = null;
  private warmed = false;

  private async getBrowser(): Promise<BrowserLike> {
    try {
      const pw: any = await import("playwright-extra");
      const stealthModule: any = await import("puppeteer-extra-plugin-stealth");
      const StealthPlugin = stealthModule.default;
      pw.chromium.use(StealthPlugin());
      return pw.chromium as BrowserLike;
    } catch {
      throw new Error(
        "Playwright is not installed. Run: npm install playwright-extra puppeteer-extra-plugin-stealth && npx playwright install chromium"
      );
    }
  }

  /** Shared persistent context — reused by the login flow and by API calls. */
  async getContext(): Promise<any> {
    if (this.context) return this.context;
    if (this.launch) return this.launch;

    this.launch = (async () => {
      const cfg = getRegionConfig();
      const chromium = await this.getBrowser();
      mkdirSync(PROFILE_DIR, { recursive: true, mode: 0o700 });
      try {
        const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
          headless: cfg.headless,
          ...(cfg.browserChannel ? { channel: cfg.browserChannel } : {}),
          viewport: { width: 1280, height: 900 },
          args: ["--no-sandbox", "--disable-dev-shm-usage"],
        });
        this.context = ctx;
        return ctx;
      } catch (err) {
        throw new Error(
          `Failed to launch browser (run 'npx playwright install chromium'): ${(err as Error).message}`
        );
      } finally {
        this.launch = null;
      }
    })();

    return this.launch;
  }

  /**
   * Visit the storefront once so PerimeterX hands out its clearance cookie.
   * Subsequent API calls from this context inherit it.
   */
  async warmUp(): Promise<void> {
    if (this.warmed) return;
    const cfg = getRegionConfig();
    const ctx = await this.getContext();
    const page = ctx.pages()[0] || (await ctx.newPage());
    try {
      await page.goto(cfg.webHost, { waitUntil: "domcontentloaded", timeout: 60000 });
      // Give the PX sensor script a chance to run and set _px3.
      await page.waitForTimeout(4000);
      const title: string = await page.title().catch(() => "");
      if (/denied|px-captcha/i.test(title)) {
        throw new Error(
          `PerimeterX still challenging ${cfg.webHost} from this network (page title: "${title}"). ` +
            `Run this server from a network that foodpanda serves (a HK residential/mobile IP works).`
        );
      }
      this.warmed = true;
    } finally {
      if (ctx.pages()[0] !== page) await page.close().catch(() => {});
    }
  }

  async fetch(
    url: string,
    init: { method?: string; headers?: Record<string, string>; body?: string } = {}
  ): Promise<TransportResponse> {
    const ctx = await this.getContext();
    const response = await ctx.request.fetch(url, {
      method: init.method || "GET",
      headers: init.headers || {},
      data: init.body,
      timeout: 60000,
      failOnStatusCode: false,
    });
    const text = await response.text();
    return { status: response.status(), ok: response.ok(), text };
  }

  async close(): Promise<void> {
    if (this.context) await this.context.close().catch(() => {});
    this.context = null;
    this.warmed = false;
  }
}

let singleton: BrowserTransport | null = null;

export function browserTransport(): BrowserTransport {
  if (!singleton) singleton = new BrowserTransport();
  return singleton;
}
