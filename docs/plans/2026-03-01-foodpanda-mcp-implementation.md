# Foodpanda MCP Server — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an MCP server that lets AI assistants search restaurants, browse menus, and place orders on foodpanda.ph.

**Architecture:** Thin MCP wrapper — each MCP tool maps directly to HTTP calls to foodpanda.ph's internal consumer API. Session token auth via environment variable. TypeScript on Node.js with stdio transport.

**Tech Stack:** TypeScript, Node.js 18+, `@modelcontextprotocol/server`, `zod`, native `fetch`

**Design doc:** `docs/plans/2026-03-01-foodpanda-mcp-design.md`

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/index.ts` (placeholder)
- Create: `.gitignore`

**Step 1: Initialize the project**

```bash
cd /Users/johnwhoyou/Desktop/foodpanda-mcp
npm init -y
```

**Step 2: Update package.json**

Replace `package.json` with:

```json
{
  "name": "foodpanda-mcp",
  "version": "0.1.0",
  "description": "MCP server for ordering food from foodpanda.ph",
  "type": "module",
  "bin": {
    "foodpanda-mcp": "./build/index.js"
  },
  "scripts": {
    "build": "tsc && chmod 755 build/index.js",
    "dev": "tsc --watch",
    "start": "node build/index.js"
  },
  "files": ["build"],
  "license": "MIT"
}
```

**Step 3: Install dependencies**

```bash
npm install @modelcontextprotocol/server zod
npm install -D @types/node typescript
```

**Step 4: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

**Step 5: Create .gitignore**

```
node_modules/
build/
.env
```

**Step 6: Create placeholder entry point**

Create `src/index.ts`:

```typescript
#!/usr/bin/env node
console.error("foodpanda-mcp: not yet implemented");
```

**Step 7: Build and verify**

Run: `npm run build`
Expected: Builds without errors, creates `build/index.js`

**Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore src/index.ts
git commit -m "chore: scaffold project with TypeScript + MCP SDK"
```

---

## Task 2: Types & Foodpanda Client Skeleton

**Files:**
- Create: `src/types.ts`
- Create: `src/foodpanda-client.ts`

**Step 1: Create types**

Create `src/types.ts` with the domain types the MCP tools will use. These represent the normalized data the AI will receive — not necessarily the raw foodpanda API shapes (we'll map those in the client).

```typescript
export interface Restaurant {
  id: string;
  name: string;
  cuisine: string;
  rating: number;
  delivery_fee: number;
  delivery_time: string;
  minimum_order: number;
  is_open: boolean;
}

export interface RestaurantDetails extends Restaurant {
  address: string;
  opening_hours: string;
  description: string;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  variations: Variation[];
  toppings: Topping[];
}

export interface Variation {
  id: string;
  name: string;
  price: number;
}

export interface Topping {
  id: string;
  name: string;
  price: number;
}

export interface MenuCategory {
  name: string;
  items: MenuItem[];
}

export interface CartItem {
  cart_item_id: string;
  item_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  variation?: string;
  toppings: string[];
}

export interface Cart {
  restaurant_id: string;
  restaurant_name: string;
  items: CartItem[];
  subtotal: number;
  delivery_fee: number;
  total: number;
}

export interface OrderResult {
  order_id: string;
  status: string;
  estimated_delivery_time: string;
  total: number;
}

export interface AddToCartInput {
  item_id: string;
  quantity: number;
  variation_id?: string;
  topping_ids?: string[];
}
```

**Step 2: Create the foodpanda client skeleton**

Create `src/foodpanda-client.ts`. This is the HTTP client that talks to foodpanda's internal API. We stub every method with `TODO` — the actual API endpoints need to be reverse-engineered from the browser's network tab.

```typescript
import type {
  Restaurant,
  RestaurantDetails,
  MenuCategory,
  Cart,
  OrderResult,
  AddToCartInput,
} from "./types.js";

const FOODPANDA_BASE_URL = "https://www.foodpanda.ph";

export class FoodpandaClient {
  private sessionToken: string;

  constructor(sessionToken: string) {
    this.sessionToken = sessionToken;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${FOODPANDA_BASE_URL}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Cookie: this.sessionToken,
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        ...options.headers,
      },
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        "Session token expired or invalid. Please refresh your token from the browser."
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Foodpanda API error (${response.status}): ${body.slice(0, 200)}`
      );
    }

    return response.json() as Promise<T>;
  }

  async searchRestaurants(
    query: string,
    _cuisine?: string,
    _limit?: number
  ): Promise<Restaurant[]> {
    // TODO: Reverse-engineer the search endpoint from foodpanda.ph
    // Likely something like: /api/v5/vendors?query=...&latitude=...&longitude=...
    throw new Error(
      "Not yet implemented — need to reverse-engineer foodpanda search API"
    );
  }

  async getRestaurantDetails(
    _restaurantId: string
  ): Promise<RestaurantDetails> {
    // TODO: Reverse-engineer the restaurant details endpoint
    // Likely something like: /api/v5/vendors/<id>
    throw new Error(
      "Not yet implemented — need to reverse-engineer foodpanda restaurant API"
    );
  }

  async getMenu(_restaurantId: string): Promise<MenuCategory[]> {
    // TODO: Reverse-engineer the menu endpoint
    // Likely something like: /api/v5/vendors/<id>/menu
    throw new Error(
      "Not yet implemented — need to reverse-engineer foodpanda menu API"
    );
  }

  async addToCart(
    _restaurantId: string,
    _items: AddToCartInput[]
  ): Promise<Cart> {
    // TODO: Reverse-engineer the cart endpoint
    // Likely a POST to /api/v5/cart or similar
    throw new Error(
      "Not yet implemented — need to reverse-engineer foodpanda cart API"
    );
  }

  async getCart(): Promise<Cart | null> {
    // TODO: Reverse-engineer the get cart endpoint
    throw new Error(
      "Not yet implemented — need to reverse-engineer foodpanda cart API"
    );
  }

  async removeFromCart(_cartItemId: string): Promise<Cart> {
    // TODO: Reverse-engineer the remove from cart endpoint
    throw new Error(
      "Not yet implemented — need to reverse-engineer foodpanda cart API"
    );
  }

  async placeOrder(
    _paymentMethod?: string,
    _specialInstructions?: string
  ): Promise<OrderResult> {
    // TODO: Reverse-engineer the place order endpoint
    // Likely a POST to /api/v5/orders or /api/v5/checkout
    throw new Error(
      "Not yet implemented — need to reverse-engineer foodpanda order API"
    );
  }
}
```

**Step 3: Verify it compiles**

Run: `npm run build`
Expected: Builds without errors

**Step 4: Commit**

```bash
git add src/types.ts src/foodpanda-client.ts
git commit -m "feat: add domain types and foodpanda HTTP client skeleton"
```

---

## Task 3: MCP Server with All Tools

**Files:**
- Create: `src/server.ts`
- Modify: `src/index.ts`

**Step 1: Create the MCP server with tool registrations**

Create `src/server.ts`. This file sets up the MCP server and registers all 7 tools, wiring each to the FoodpandaClient.

```typescript
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { FoodpandaClient } from "./foodpanda-client.js";

export function createServer(client: FoodpandaClient): McpServer {
  const server = new McpServer(
    {
      name: "foodpanda-mcp",
      version: "0.1.0",
    },
    {
      capabilities: { logging: {} },
    }
  );

  // --- search_restaurants ---
  server.registerTool(
    "search_restaurants",
    {
      title: "Search Restaurants",
      description:
        "Search for restaurants on foodpanda.ph near the user's delivery address. Returns a list of matching restaurants with basic info (rating, delivery fee, delivery time, etc.).",
      inputSchema: z.object({
        query: z.string().describe("Search query (e.g. 'Jollibee', 'pizza', 'Thai food')"),
        cuisine: z.string().optional().describe("Filter by cuisine type"),
        limit: z.number().optional().describe("Max number of results (default 10)"),
      }),
    },
    async ({ query, cuisine, limit }) => {
      try {
        const restaurants = await client.searchRestaurants(query, cuisine, limit);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(restaurants, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error searching restaurants: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // --- get_restaurant_details ---
  server.registerTool(
    "get_restaurant_details",
    {
      title: "Get Restaurant Details",
      description:
        "Get detailed information about a specific restaurant including address, opening hours, minimum order, and delivery info.",
      inputSchema: z.object({
        restaurant_id: z.string().describe("The restaurant ID from search results"),
      }),
    },
    async ({ restaurant_id }) => {
      try {
        const details = await client.getRestaurantDetails(restaurant_id);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(details, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error getting restaurant details: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // --- get_menu ---
  server.registerTool(
    "get_menu",
    {
      title: "Get Menu",
      description:
        "Get the full menu for a restaurant, organized by category. Each item includes name, description, price, and available variations/toppings.",
      inputSchema: z.object({
        restaurant_id: z.string().describe("The restaurant ID"),
      }),
    },
    async ({ restaurant_id }) => {
      try {
        const menu = await client.getMenu(restaurant_id);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(menu, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error getting menu: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // --- add_to_cart ---
  server.registerTool(
    "add_to_cart",
    {
      title: "Add to Cart",
      description:
        "Add one or more items to the cart. If items are from a different restaurant than the current cart, the cart is cleared first. Each item can have an optional variation and toppings.",
      inputSchema: z.object({
        restaurant_id: z.string().describe("The restaurant ID"),
        items: z
          .array(
            z.object({
              item_id: z.string().describe("Menu item ID"),
              quantity: z.number().min(1).describe("Quantity to add"),
              variation_id: z
                .string()
                .optional()
                .describe("ID of the selected variation (e.g. size)"),
              topping_ids: z
                .array(z.string())
                .optional()
                .describe("IDs of selected toppings/add-ons"),
            })
          )
          .describe("Items to add to cart"),
      }),
    },
    async ({ restaurant_id, items }) => {
      try {
        const cart = await client.addToCart(restaurant_id, items);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(cart, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error adding to cart: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // --- get_cart ---
  server.registerTool(
    "get_cart",
    {
      title: "Get Cart",
      description:
        "View the current cart contents including items, quantities, prices, and totals. Returns null if the cart is empty.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const cart = await client.getCart();
        if (!cart) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Cart is empty.",
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(cart, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error getting cart: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // --- remove_from_cart ---
  server.registerTool(
    "remove_from_cart",
    {
      title: "Remove from Cart",
      description: "Remove an item from the cart by its cart item ID.",
      inputSchema: z.object({
        cart_item_id: z.string().describe("The cart item ID to remove"),
      }),
    },
    async ({ cart_item_id }) => {
      try {
        const cart = await client.removeFromCart(cart_item_id);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(cart, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error removing from cart: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // --- place_order ---
  server.registerTool(
    "place_order",
    {
      title: "Place Order",
      description:
        "Place the current cart as an order. Uses the default payment method from the user's foodpanda account unless overridden. Returns order confirmation with estimated delivery time.",
      inputSchema: z.object({
        payment_method: z
          .string()
          .optional()
          .describe("Payment method to use (uses account default if not specified)"),
        special_instructions: z
          .string()
          .optional()
          .describe("Special delivery instructions"),
      }),
    },
    async ({ payment_method, special_instructions }) => {
      try {
        const result = await client.placeOrder(payment_method, special_instructions);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error placing order: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
}
```

**Step 2: Update src/index.ts — the entry point**

Replace `src/index.ts` with:

```typescript
#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/server";
import { FoodpandaClient } from "./foodpanda-client.js";
import { createServer } from "./server.js";

const sessionToken = process.env.FOODPANDA_SESSION_TOKEN;

if (!sessionToken) {
  console.error(
    "Error: FOODPANDA_SESSION_TOKEN environment variable is required.\n" +
      "To get your token:\n" +
      "1. Log into foodpanda.ph in your browser\n" +
      "2. Open DevTools → Network tab\n" +
      "3. Copy the Cookie or Authorization header from any API request\n" +
      "4. Set it as FOODPANDA_SESSION_TOKEN"
  );
  process.exit(1);
}

const client = new FoodpandaClient(sessionToken);
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

**Step 3: Build and verify**

Run: `npm run build`
Expected: Builds without errors

**Step 4: Verify the server starts (and fails gracefully without token)**

Run: `node build/index.js`
Expected: Error message about missing FOODPANDA_SESSION_TOKEN

**Step 5: Commit**

```bash
git add src/server.ts src/index.ts
git commit -m "feat: add MCP server with all 7 tools wired to foodpanda client"
```

---

## Task 4: README with Setup Instructions

**Files:**
- Create: `README.md`

**Step 1: Write the README**

Create `README.md`:

```markdown
# foodpanda-mcp

An MCP server that lets AI assistants order food from [foodpanda.ph](https://www.foodpanda.ph/) on your behalf.

## What it does

Tell your AI assistant what you want to eat, and it handles the rest — searching restaurants, browsing menus, and placing orders through your foodpanda account.

### Available tools

| Tool | Description |
|------|-------------|
| `search_restaurants` | Search for restaurants by name or cuisine |
| `get_restaurant_details` | Get restaurant info (hours, delivery fee, minimum order) |
| `get_menu` | Browse a restaurant's full menu |
| `add_to_cart` | Add items to your cart |
| `get_cart` | View current cart contents |
| `remove_from_cart` | Remove items from cart |
| `place_order` | Place the order with your saved payment method |

## Setup

### 1. Get your session token

1. Open [foodpanda.ph](https://www.foodpanda.ph/) and log in
2. Open browser DevTools (F12) → **Network** tab
3. Reload the page or browse to a restaurant
4. Click any request to `foodpanda.ph`
5. Copy the **Cookie** header value from the request headers
6. This is your session token

### 2. Configure your MCP client

Add to your MCP client config (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "foodpanda": {
      "command": "node",
      "args": ["/path/to/foodpanda-mcp/build/index.js"],
      "env": {
        "FOODPANDA_SESSION_TOKEN": "your-session-token-here"
      }
    }
  }
}
```

### 3. Build from source

```bash
git clone <repo-url>
cd foodpanda-mcp
npm install
npm run build
```

## Development

```bash
npm run dev    # Watch mode — recompiles on changes
npm run build  # One-time build
npm start      # Run the server
```

## Limitations

- **Session tokens expire.** You'll need to refresh your token periodically by repeating step 1.
- **No official API.** This server reverse-engineers foodpanda's internal web API. It may break if foodpanda changes their API.
- **Philippines only.** This server targets foodpanda.ph specifically.
- **Uses account defaults.** Delivery address and payment method come from your foodpanda account settings.
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup and usage instructions"
```

---

## Task 5: Reverse-Engineer Foodpanda API

**This is the critical research task.** The stub methods in `foodpanda-client.ts` need real API endpoints.

**Files:**
- Modify: `src/foodpanda-client.ts`

**Step 1: Capture API traffic from foodpanda.ph**

Open foodpanda.ph in the browser with DevTools Network tab open. Perform these actions and record the HTTP requests:

1. **Search** — Type in the search bar, note the request URL, method, headers, and response shape
2. **Restaurant page** — Click a restaurant, note the API call that loads its details + menu
3. **Add to cart** — Add an item, note the POST request
4. **View cart** — Check if there's a separate GET cart request
5. **Place order** — Go through checkout (but stop before confirming), note the request

For each, record:
- HTTP method and full URL
- Required headers (especially auth-related)
- Request body (for POST/PUT)
- Response JSON structure

**Step 2: Implement each method in foodpanda-client.ts**

Replace each `throw new Error("Not yet implemented...")` with the real HTTP calls based on what you captured in Step 1. Map the raw API responses to our domain types from `types.ts`.

**Step 3: Build and verify**

Run: `npm run build`
Expected: Builds without errors

**Step 4: Manual test with a real token**

```bash
FOODPANDA_SESSION_TOKEN="<your-token>" node build/index.js
```

Use an MCP inspector or test client to call `search_restaurants` with a query and verify you get real restaurant data back.

**Step 5: Commit**

```bash
git add src/foodpanda-client.ts src/types.ts
git commit -m "feat: implement foodpanda API client with reverse-engineered endpoints"
```

---

## Task 6: End-to-End Test

**Step 1: Manual E2E test**

With a valid session token, test the full ordering flow:

1. `search_restaurants({ query: "Jollibee" })` — verify restaurant list returned
2. `get_restaurant_details({ restaurant_id: "<id from step 1>" })` — verify details
3. `get_menu({ restaurant_id: "<id>" })` — verify menu categories and items
4. `add_to_cart({ restaurant_id: "<id>", items: [{ item_id: "<id>", quantity: 1 }] })` — verify cart
5. `get_cart({})` — verify cart matches
6. `remove_from_cart({ cart_item_id: "<id>" })` — verify item removed
7. `place_order({})` — **SKIP in testing** unless you want to actually order food

**Step 2: Fix any issues found**

Iterate on `foodpanda-client.ts` and `types.ts` as needed based on real API responses.

**Step 3: Final commit**

```bash
git add -A
git commit -m "fix: adjust API client based on E2E testing"
```
