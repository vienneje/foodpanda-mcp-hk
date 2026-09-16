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
- **Xvfb** on a headless machine — the browser must run *headed* to clear PerimeterX, and the
  transport starts its own Xvfb when `DISPLAY` is unset (`apt-get install xvfb`)
- A foodpanda account in the region you configure, **with the delivery address you intend to use
  already saved in that account** (checkout picks the saved address nearest your configured
  coordinates)

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
| `FOODPANDA_BROWSER_EXECUTABLE` | unset | absolute path to a browser binary to drive instead (system Chrome/Chromium, or an existing Playwright build) |
| `FOODPANDA_PROXY` | unset | proxy the browser egresses through: `socks5://host:port`, `http://host:port`, or `http://user:pass@host:port` |
| `FOODPANDA_XVFB` | `1` | start a private Xvfb when a headed browser is needed and `DISPLAY` is unset |
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

## Getting past PerimeterX — the part that matters

`*.fd-api.com` sits behind PerimeterX. What actually decides whether you get through is **not the
country you are in**: it is whether the browser looks automated.

- A plain `fetch()`, curl, or a **headless** browser (including Playwright's
  `chromium-headless-shell`) is challenged: `403` with a `px-captcha` payload, or a page titled
  *"Access to this page has been denied"*.
- The **same server, same IP**, driving a **headed** Chromium on a virtual display, gets through.

So the transport runs headed Chromium and starts its own `Xvfb` when `DISPLAY` is unset
(`FOODPANDA_XVFB`, on by default) — a server needs no screen. Two consequences worth knowing:

- A challenge verdict is **sticky**: an unsolved visit leaves PX cookies that mark the profile as
  suspicious and every later launch from it is challenged again. `warmUp()` therefore wipes the
  browser profile and retries with a clean identity (3 attempts), which is what makes the first
  call succeed where a naive retry loop would keep failing.
- Navigation itself can be re-challenged, so the transport warms up once and then talks to the API
  from that same context instead of reloading the storefront.

**Browsing needs no account.** Search, menus and vendor details are public, and the server works
without a session token (verified: a live HK search returned real restaurants). Only the cart and
checkout need you to log in — see [Logging in](#logging-in).

A token will not rescue a blocked browser, and a headed browser will not rescue a hardened
datacenter IP forever: if you keep getting challenged, set `FOODPANDA_PROXY` to egress elsewhere
(`socks5://`, `http://`, or `http://user:pass@host:port` — applied to the browser, hence to every
API call).

## Order safety

Checkout is deliberately two-step and human-in-the-loop: `preview_order` returns the full summary
(items, totals, delivery address, payment methods), and `place_order` is meant to be called only
after you have seen and approved that summary. Keep that instruction in whatever system prompt your
agent uses — the server cannot enforce it by itself.

## Known limitations

1. **PerimeterX.** See [Getting past PerimeterX](#getting-past-perimiterx--the-part-that-matters):
   the browser must look human (headed, on Xvfb), a challenge poisons the profile until it is reset,
   and repeated challenges from one IP mean you need `FOODPANDA_PROXY` or another host.
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