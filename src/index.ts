#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FoodpandaClient } from "./foodpanda-client.js";
import { createServer } from "./server.js";
import { loadPersistedToken } from "./token-manager.js";
import { getRegionConfig } from "./config.js";

// Region (endpoints, locale, currency, GraphQL hashes) — FOODPANDA_COUNTRY=hk by default.
const cfg = getRegionConfig();

// Token loading priority: persisted file > env var > null (tokenless startup)
const sessionToken =
  loadPersistedToken() || process.env.FOODPANDA_SESSION_TOKEN || null;

const latitude = parseFloat(process.env.FOODPANDA_LATITUDE || "");
const longitude = parseFloat(process.env.FOODPANDA_LONGITUDE || "");

if (isNaN(latitude) || isNaN(longitude)) {
  console.error(
    "Error: FOODPANDA_LATITUDE and FOODPANDA_LONGITUDE environment variables are required.\n" +
      "These should be the coordinates of your delivery address.\n" +
      "Example: FOODPANDA_LATITUDE=22.2793 FOODPANDA_LONGITUDE=114.1628"
  );
  process.exit(1);
}

console.error(
  `foodpanda-mcp: region=${cfg.countryLabel} api=${cfg.apiBase} web=${cfg.webHost} ` +
    `locale=${cfg.locale} currency=${cfg.currency} transport=${cfg.browserTransport ? "browser" : "fetch"}`
);

if (!cfg.searchHash || !cfg.vendorListHash) {
  console.error(
    "foodpanda-mcp: WARNING — GraphQL persisted-query hashes are missing for this region.\n" +
      "  search_restaurants / list_outlets will fail until you harvest them:\n" +
      "  node scripts/discover-hashes.mjs   (run from a network foodpanda serves)\n" +
      "  then export FOODPANDA_GQL_SEARCH_HASH / FOODPANDA_GQL_VENDOR_LIST_HASH"
  );
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
