#!/usr/bin/env node
/**
 * Harvest the Apollo persisted-query hashes used by the regional foodpanda web app.
 *
 * Why: `search_restaurants` and `list_outlets` send an Apollo "persisted query"
 * (a sha256 hash) instead of a full GraphQL document. Those hashes are baked into
 * each regional web build, so the PH hashes shipped upstream do not work against
 * foodpanda.hk — the API answers `PersistedQueryNotFound`.
 *
 * How: open the storefront in the same persistent browser profile the MCP server
 * uses, watch every POST to /graphql, and match the request body shape to the
 * query it belongs to.
 *
 * Usage (run from a network foodpanda serves — a HK connection works; a French
 * residential IP gets the PerimeterX wall instead):
 *
 *   FOODPANDA_COUNTRY=hk node scripts/discover-hashes.mjs            # headless
 *   FOODPANDA_COUNTRY=hk FOODPANDA_HEADLESS=0 node scripts/discover-hashes.mjs
 *
 * The script types a restaurant-ish search into the page so the search query
 * fires, then writes ~/.foodpanda-mcp/gql-hashes.json and prints the two env
 * vars to export.
 */

import { mkdirSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const COUNTRY = (process.env.FOODPANDA_COUNTRY || "hk").toLowerCase();
const PRESETS = {
  hk: { web: "https://www.foodpanda.hk", locale: "en_HK" },
  ph: { web: "https://www.foodpanda.ph", locale: "en_PH" },
};
const preset = PRESETS[COUNTRY];
if (!preset) {
  console.error(`Unknown FOODPANDA_COUNTRY='${COUNTRY}'. Known: ${Object.keys(PRESETS).join(", ")}`);
  process.exit(1);
}

const WEB = process.env.FOODPANDA_WEB_HOST || preset.web;
const HEADLESS = !["0", "false", "no"].includes(
  (process.env.FOODPANDA_HEADLESS || "1").toLowerCase()
);
const PROFILE_DIR = join(homedir(), ".foodpanda-mcp", "browser-data");
const OUT_FILE = join(homedir(), ".foodpanda-mcp", "gql-hashes.json");

/** Which tool each persisted query belongs to, keyed by a distinctive variable name. */
const SIGNATURES = [
  { kind: "search", marker: "searchResultsParams" },
  { kind: "vendor_list", marker: "CHAIN_LISTING_PAGE" },
];

const found = new Map();

function record(bodyText) {
  let parsed;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return;
  }
  const hash = parsed?.extensions?.persistedQuery?.sha256Hash;
  if (!hash) return;
  const variables = JSON.stringify(parsed?.variables ?? {});
  for (const sig of SIGNATURES) {
    if (variables.includes(sig.marker) && !found.has(sig.kind)) {
      found.set(sig.kind, hash);
      console.error(`  captured ${sig.kind} -> ${hash}`);
    }
  }
}

const pw = await import("playwright-extra");
const stealthModule = await import("puppeteer-extra-plugin-stealth");
pw.chromium.use(stealthModule.default());

mkdirSync(PROFILE_DIR, { recursive: true, mode: 0o700 });
const context = await pw.chromium.launchPersistentContext(PROFILE_DIR, {
  headless: HEADLESS,
  ...(process.env.FOODPANDA_BROWSER_EXECUTABLE
    ? { executablePath: process.env.FOODPANDA_BROWSER_EXECUTABLE }
    : process.env.FOODPANDA_BROWSER_CHANNEL === ""
      ? {}
      : { channel: process.env.FOODPANDA_BROWSER_CHANNEL || "chromium" }),
  ...(process.env.FOODPANDA_PROXY ? { proxy: { server: process.env.FOODPANDA_PROXY } } : {}),
  viewport: { width: 1280, height: 900 },
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const page = context.pages()[0] || (await context.newPage());

page.on("request", (request) => {
  if (request.method() !== "POST") return;
  if (!request.url().includes("/graphql")) return;
  record(request.postData() || "");
});

console.error(`Opening ${WEB} ...`);
await page.goto(WEB, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(6000);

const title = await page.title();
if (/denied|px-captcha/i.test(title)) {
  console.error(
    `\nPerimeterX is blocking this network (page title: "${title}").\n` +
      `Run this script from a HK connection (mobile hotspot or local wifi is enough).`
  );
  await context.close().catch(() => {});
  process.exit(2);
}

// Nudge the app into firing its search query.
try {
  const searchSelector = 'input[type="search"], input[placeholder*="earch"], input[placeholder*="搜"]';
  await page.waitForSelector(searchSelector, { timeout: 20000 });
  await page.fill(searchSelector, "mcdonald");
  await page.waitForTimeout(3000);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(5000);
} catch {
  console.error(
    "Could not drive the on-page search box — navigate the storefront manually (a search\n" +
      "or a chain listing page is what fires these queries) while this script keeps watching."
  );
}

if (found.size > 0) {
  const payload = Object.fromEntries(found);
  mkdirSync(join(homedir(), ".foodpanda-mcp"), { recursive: true, mode: 0o700 });
  writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2), { mode: 0o600 });
  console.error(`\nWrote ${OUT_FILE}\n`);
  for (const [kind, hash] of found) {
    const env =
      kind === "search" ? "FOODPANDA_GQL_SEARCH_HASH" : "FOODPANDA_GQL_VENDOR_LIST_HASH";
    console.log(`${env}=${hash}`);
  }
} else {
  console.error(
    "\nNo persisted-query hashes captured. Leave the browser open and search something on\n" +
      "the storefront, then re-run with FOODPANDA_HEADLESS=0."
  );
}

if (!HEADLESS) {
  console.error("Press Ctrl+C when done.");
  await new Promise(() => {});
}

await context.close().catch(() => {});
process.exit(found.size > 0 ? 0 : 1);