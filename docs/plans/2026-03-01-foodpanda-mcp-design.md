# Foodpanda MCP Server — Design Document

**Date:** 2026-03-01
**Status:** Approved

## Purpose

An MCP server that allows personal AI assistants (OpenClaw, Claude, etc.) to order food from [foodpanda.ph](https://www.foodpanda.ph/) on behalf of their user. The user says "order me chicken from Jollibee" and the AI handles finding the restaurant, browsing the menu, building a cart, and placing the order.

## Approach

**Architecture:** Thin MCP wrapper — each MCP tool maps directly to one or a few HTTP calls to foodpanda's internal consumer API.

**API strategy:** Reverse-engineer foodpanda.ph's internal web API by capturing HTTP requests from the browser's Network tab. No official public consumer API exists; the official Partner API is for restaurant operators, not consumers.

**Language/Runtime:** TypeScript on Node.js. Uses the official `@modelcontextprotocol/sdk`.

**Auth:** User provides a session token extracted from their browser (cookie or auth header). The server uses whatever default address and payment method is saved in the user's foodpanda account.

## Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│              AI Assistant (OpenClaw)              │
│         "Order me chicken from Jollibee"         │
└──────────────────────┬──────────────────────────┘
                       │ MCP Protocol (stdio)
                       ▼
┌─────────────────────────────────────────────────┐
│           foodpanda-mcp (TypeScript)             │
│                                                  │
│  Tools:                                          │
│  ├─ search_restaurants                           │
│  ├─ get_restaurant_details                       │
│  ├─ get_menu                                     │
│  ├─ add_to_cart                                  │
│  ├─ get_cart                                     │
│  ├─ remove_from_cart                             │
│  └─ place_order                                  │
│                                                  │
│  Config: FOODPANDA_SESSION_TOKEN                 │
└──────────────────────┬──────────────────────────┘
                       │ HTTP (reverse-engineered)
                       ▼
┌─────────────────────────────────────────────────┐
│           foodpanda.ph internal API              │
│    (Delivery Hero / disco.deliveryhero.io)       │
└─────────────────────────────────────────────────┘
```

## MCP Tools

### 1. search_restaurants
Search for restaurants near the user's default delivery address.
- **Input:** `{ query: string, cuisine?: string, limit?: number }`
- **Output:** `{ restaurants: [{ id, name, cuisine, rating, delivery_fee, delivery_time, distance, is_open }] }`

### 2. get_restaurant_details
Get full details about a specific restaurant.
- **Input:** `{ restaurant_id: string }`
- **Output:** `{ name, address, cuisine, rating, delivery_fee, min_order, delivery_time, is_open, opening_hours }`

### 3. get_menu
Get the full menu for a restaurant, organized by category.
- **Input:** `{ restaurant_id: string }`
- **Output:** `{ categories: [{ name, items: [{ id, name, description, price, image_url, variations?, toppings? }] }] }`

### 4. add_to_cart
Add items to the cart. Clears previous cart if switching restaurants.
- **Input:** `{ restaurant_id: string, items: [{ item_id: string, quantity: number, variation_id?: string, topping_ids?: string[] }] }`
- **Output:** `{ cart: { restaurant_name, items, subtotal, delivery_fee, total } }`

### 5. get_cart
View the current cart contents.
- **Input:** `{}`
- **Output:** `{ cart: { restaurant_name, items, subtotal, delivery_fee, total } | null }`

### 6. remove_from_cart
Remove an item from the cart.
- **Input:** `{ cart_item_id: string }`
- **Output:** `{ cart: { restaurant_name, items, subtotal, delivery_fee, total } }`

### 7. place_order
Place the current cart as an order.
- **Input:** `{ payment_method?: string, special_instructions?: string }`
- **Output:** `{ order_id, status, estimated_delivery_time, total }`

## Configuration

Single environment variable:

```
FOODPANDA_SESSION_TOKEN=<token from browser>
```

The session token carries the user's account context — saved addresses, payment methods, etc. No additional config needed.

### How to get the session token:
1. Log into foodpanda.ph in the browser
2. Open DevTools → Network tab
3. Look for any API request to foodpanda
4. Copy the session/auth cookie or Authorization header value
5. Set it as `FOODPANDA_SESSION_TOKEN`

## Project Structure

```
foodpanda-mcp/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── server.ts             # MCP server setup & tool registration
│   ├── foodpanda-client.ts   # HTTP client for foodpanda's internal API
│   ├── tools/
│   │   ├── search.ts         # search_restaurants
│   │   ├── restaurant.ts     # get_restaurant_details, get_menu
│   │   ├── cart.ts           # add_to_cart, get_cart, remove_from_cart
│   │   └── order.ts          # place_order
│   └── types.ts              # TypeScript types/interfaces
├── package.json
├── tsconfig.json
└── README.md
```

## Error Handling

| Scenario | User-facing message |
|----------|-------------------|
| Session token expired | "Session token expired. Please refresh your token from the browser." |
| Restaurant closed | "Restaurant X is currently closed. Opens at Y." |
| Minimum order not met | "Minimum order is ₱X. Your cart total is ₱Y." |
| Network error | "Unable to reach foodpanda. Please check your connection." |
| Unknown error | Generic message + raw response logged for debugging |

## Dependencies

- `@modelcontextprotocol/sdk` — Official MCP TypeScript SDK
- `zod` — Input validation for tool parameters
- Native `fetch` (Node 18+) — HTTP client

## Decisions & Trade-offs

- **No public consumer API** — We reverse-engineer the internal web API. This means the server could break if foodpanda changes their API. Acceptable for a personal tool.
- **Session token auth** — Simple but tokens expire. User must manually refresh. Acceptable trade-off vs. storing credentials.
- **Pre-configured address via account** — Uses whatever default is set in the user's foodpanda account. No address management in the MCP server.
- **Thin wrapper** — No caching, no abstraction layer, no multi-platform support. YAGNI for MVP. Can be added later.
