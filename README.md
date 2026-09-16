# foodpanda-mcp (Hong Kong fork)

An MCP server that lets an AI assistant search restaurants, browse menus, build a cart and place
foodpanda orders on your behalf.

This is a fork of [johnwhoyou/foodpanda-mcp](https://github.com/johnwhoyou/foodpanda-mcp), which
targets **foodpanda.ph only**. Upstream hardcodes the Philippine API host, locale and currency, so it
cannot talk to any other country. This fork makes the region a configuration value and ships a Hong
Kong preset (plus a working PH preset), and replaces the bare `fetch()` transport with one that runs
inside a real browser context — necessary because fd-api sits behind a PerimeterX bot wall.

Nothing personal is baked in: delivery coordinates, session token and region all come from
environment variables.

## What changed vs upstream

| Area | Upstream | This fork |
|---|---|---|
| API host | hardcoded `https://ph.fd-api.com` | `src/config.ts` preset per country, env-overridable |
| Storefront / login / payment redirect | hardcoded `foodpanda.ph` | preset (`foodpanda.hk` for HK), env-overridable |
| Locale and language id | `en_PH`, `language_id=1` | configurable (`en_HK`, configurable id) |
| Currency | `PHP` baked into baskets, purchase intents and checkout | from config (`HKD` for HK) |
| GraphQL persisted-query hashes | PH constants | env-overridable + `scripts/discover-hashes.mjs` to harvest a region's own hashes |
| HTTP transport | bare `fetch()` | browser-context transport, so requests carry the `_px3` clearance cookie |
| PerimeterX failures | surfaced as a misleading "session expired" | detected and reported for what they are |
| Login | its own throwaway browser profile | shares the transport's persistent context, so login cookies and PX clearance are reused |

## Requirements

- Node.js 20 or newer
- `npx playwright install chromium` (the transport and the login flow both need a browser)
- A foodpanda account in the region you configure, **with the delivery address you intend to use
  already saved in that account** (checkout picks the saved address nearest your configured
  coordinates)
- A network foodpanda serves (see [Known limitations](#known-limitations))

## Install

### 1. Get the code and build it

```bash
git clone https://github.com/vienneje/foodpanda-mcp-hk.git
cd foodpanda-mcp-hk
npm install --ignore-scripts     # --ignore-scripts skips the bundled Chrome download
npx tsc -p tsconfig.json         # produces build/
npx playwright install chromium  # the full Chromium build, used in new-headless mode
```

The transport launches Chromium with `channel: "chromium"` (the full build, new headless mode),
so Playwright's separate `chromium-headless-shell` download is not needed. If you prefer the
headless shell, set `FOODPANDA_BROWSER_CHANNEL=` (empty) and run
`npx playwright install chromium-headless-shell` instead.

### 2. Hermes Agent

Add a server entry to `~/.hermes/config.yaml` (or `$HERMES_HOME/config.yaml`):

```yaml
mcp_servers:
  foodpanda:
    command: "node"
    args: ["/path/to/foodpanda-mcp-hk/build/index.js"]
    env:
      FOODPANDA_COUNTRY: "hk"
      FOODPANDA_LATITUDE: "22.2793"      # your delivery coordinates
      FOODPANDA_LONGITUDE: "114.1628"
      # FOODPANDA_GQL_SEARCH_HASH: "..."      # see "Harvest the region's hashes"
      # FOODPANDA_GQL_VENDOR_LIST_HASH: "..."
    timeout: 180
    connect_timeout: 60
```

MCP subprocesses do **not** inherit your shell environment, so every setting must be listed under
`env:`. Restart Hermes (MCP servers are connected at startup, there is no hot reload); the tools then
appear as `mcp_foodpanda_*`.

### 3. Claude Desktop or any other stdio MCP client

```json
{
  "mcpServers": {
    "foodpanda": {
      "command": "node",
      "args": ["/path/to/foodpanda-mcp-hk/build/index.js"],
      "env": {
        "FOODPANDA_COUNTRY": "hk",
        "FOODPANDA_LATITUDE": "22.2793",
        "FOODPANDA_LONGITUDE": "114.1628"
      }
    }
  }
}
```

### 4. Run it directly (no client)

```bash
FOODPANDA_COUNTRY=hk \
FOODPANDA_LATITUDE=22.2793 \
FOODPANDA_LONGITUDE=114.1628 \
node build/index.js
```

Startup writes one line to stderr telling you which region it resolved:

```
foodpanda-mcp: region=foodpanda Hong Kong api=https://hk.fd-api.com web=https://www.foodpanda.hk locale=en_HK currency=HKD transport=browser
```

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `FOODPANDA_COUNTRY` | `hk` | preset selector: `hk`, `ph` |
| `FOODPANDA_API_BASE` | preset (`https://hk.fd-api.com`) | API host, for another country |
| `FOODPANDA_WEB_HOST` | preset (`https://www.foodpanda.hk`) | storefront, login, payment redirects |
| `FOODPANDA_LOCALE` | preset (`en_HK`) | API locale |
| `FOODPANDA_LANGUAGE_ID` | preset (`1`) | API language id |
| `FOODPANDA_CURRENCY` | preset (`HKD`) | basket currency |
| `FOODPANDA_LATITUDE` / `FOODPANDA_LONGITUDE` | **required** | delivery address coordinates |
| `FOODPANDA_GQL_SEARCH_HASH` | unset | Apollo hash used by `search_restaurants` |
| `FOODPANDA_GQL_VENDOR_LIST_HASH` | unset | Apollo hash used by `list_outlets` |
| `FOODPANDA_BROWSER_TRANSPORT` | `1` | route API calls through the browser context |
| `FOODPANDA_HEADLESS` | `1` | run the transport/login browser headless |
| `FOODPANDA_BROWSER_CHANNEL` | `chromium` | Chromium build to drive; empty = Playwright default (headless shell) |
| `FOODPANDA_STATE_DIR` | `~/.foodpanda-mcp` | token + browser profile location |
| `FOODPANDA_SESSION_TOKEN` | unset | JWT, if you prefer to supply one instead of logging in |

Adding a country: add a preset to `PRESETS` in `src/config.ts`, or set `FOODPANDA_API_BASE`,
`FOODPANDA_WEB_HOST`, `FOODPANDA_LOCALE` and `FOODPANDA_CURRENCY` directly.

Inspect what the server resolved, without starting a client:

```bash
FOODPANDA_COUNTRY=hk FOODPANDA_LATITUDE=22.2793 FOODPANDA_LONGITUDE=114.1628 \
  node -e "import('./build/config.js').then(m => console.log(m.getRegionConfig()))"
```

## Logging in

You do not copy tokens out of DevTools. Ask the assistant to call **`refresh_token`**: the server
opens the regional storefront in its persistent browser profile, you log in (including any CAPTCHA
you meet), and the Bearer token the page sends to fd-api is captured and stored in
`$FOODPANDA_STATE_DIR/token.json` (mode 0600). The profile in
`$FOODPANDA_STATE_DIR/browser-data` keeps your login and the PerimeterX clearance between runs.

On a headless server set `FOODPANDA_HEADLESS=1` and expect to complete the login interactively on a
machine that has a screen, then copy `token.json` plus the `browser-data` profile across.

## Harvest the region's hashes

`search_restaurants` and `list_outlets` call Apollo **persisted queries**: instead of sending a
GraphQL document they send a sha256 hash that is compiled into each regional web build. The PH
hashes in upstream do not exist on the HK build, so run:

```bash
FOODPANDA_COUNTRY=hk FOODPANDA_HEADLESS=0 node scripts/discover-hashes.mjs
```

It opens the storefront in the same persistent profile, watches `POST /graphql`, drives a search on
the page, and prints:

```
FOODPANDA_GQL_SEARCH_HASH=...
FOODPANDA_GQL_VENDOR_LIST_HASH=...
```

Put those into your client's `env:` block. The other tools (`get_menu`, `get_restaurant_details`,
cart and checkout) use plain REST endpoints and need no hashes.

## Available tools

| Tool | Description |
|---|---|
| `search_restaurants` | search vendors by name/cuisine near the configured address |
| `list_outlets` | all branches of a restaurant chain |
| `get_restaurant_details` | hours, delivery fee, minimum order, address |
| `get_menu` | full menu by category |
| `get_item_details` | toppings and customisation options for one item |
| `add_to_cart` / `get_cart` / `remove_from_cart` | in-memory cart, prices re-validated against the API |
| `preview_order` | order summary: items, totals, address, payment methods |
| `place_order` | submits the order (after your confirmation) |
| `refresh_token` | browser login, captures and persists the session token |

## Order safety

Checkout is deliberately two-step and human-in-the-loop: `preview_order` returns the full summary
(items, totals, delivery address, payment methods), and `place_order` is meant to be called only
after you have seen and approved that summary. Keep that instruction in whatever system prompt your
agent uses — the server cannot enforce it by itself.

## Known limitations

1. **PerimeterX.** `*.fd-api.com` is fronted by a bot wall. Plain `fetch()` calls — even with the
   public `x-fp-api-key: volo`, browser-like headers and a bearer token — get `403` plus a px-captcha
   payload, and a fresh browser lands on *"Access to this page has been denied"* when the source
   network is not one foodpanda serves. This fork therefore issues API calls from inside a browser
   context (`src/browser-transport.ts`) that has solved the challenge. It also means **run this from
   a network in the country you are ordering in** — a local consumer connection works; a datacenter
   or foreign residential IP is likely to be challenged. Failures report this cause explicitly
   instead of pretending the session expired.
2. **Apollo hashes** must be harvested per region (see above) before search works.
3. **Payment.** Checkout is implemented for cash on delivery. Card payments go through foodpanda's
   Adyen flow in a browser and are **not** supported here.
4. **Single saved address.** Checkout uses the saved address nearest your configured coordinates, so
   that address has to exist in the account first.
5. **Unofficial.** This talks to foodpanda's internal web API, which can change without notice and
   may be against their terms of service. Use it on your own account, at your own risk.

## Development

```
src/config.ts                region presets and env resolution
src/browser-transport.ts     persistent Playwright context used as the HTTP transport
src/foodpanda-client.ts      API client (search, menus, cart, purchase intent, checkout)
src/token-manager.ts         token persistence and browser login capture
src/server.ts                MCP tool definitions
src/index.ts                 stdio entry point
scripts/discover-hashes.mjs  Apollo persisted-query hash harvester
```

```bash
npm install --ignore-scripts
npx tsc -p tsconfig.json
# then point any MCP client at build/index.js, or run it standalone with the env vars above
```

`build/` is gitignored; build it after cloning.

## Credits and licence

MIT. Upstream project and original implementation:
[johnwhoyou/foodpanda-mcp](https://github.com/johnwhoyou/foodpanda-mcp) (© John Carlo Joyo). This
fork only adds regional configuration, the browser-context transport and the hash harvester.