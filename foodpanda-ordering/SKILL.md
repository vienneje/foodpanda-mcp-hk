---
name: foodpanda-ordering
description: "Order food from foodpanda.ph using the foodpanda MCP server. Search restaurants, browse menus, build a cart, and place delivery orders via Cash on Delivery."
compatibility: "Requires the foodpanda-mcp server to be installed and configured as an MCP server."
---

# Foodpanda Ordering Skill

An agent skill for ordering food from foodpanda.ph through the foodpanda MCP server.

## Prerequisites

### Installation

Install the MCP server using one of the following methods:

- **Via npx (no global install):** `npx foodpanda-mcp`
- **Global install:** `npm install -g foodpanda-mcp`

Then configure it as an MCP server in your AI client (e.g., Claude Desktop, Cursor, etc.).

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `FOODPANDA_LATITUDE` | Latitude of the delivery address (e.g., `14.5547`) |
| `FOODPANDA_LONGITUDE` | Longitude of the delivery address (e.g., `121.0244`) |

These coordinates determine which restaurants are available and where food will be delivered.

### Authentication

Session tokens are handled automatically. On first use, or when a token expires, call the `refresh_token` tool. This opens a browser window where the user can log in to foodpanda.ph manually. The token is captured automatically and saved for future sessions.

Alternatively, set the `FOODPANDA_SESSION_TOKEN` environment variable with a token obtained from browser DevTools.

## Ordering Workflow

Follow these five steps in order. Do not skip any step.

### Step 1: Search for Restaurants

Use `search_restaurants` with the user's query (restaurant name, cuisine, or food type).

Present the top results to the user with:
- Restaurant name
- Rating
- Delivery fee
- Estimated delivery time
- Minimum order amount

Only show restaurants where `is_open` is true. If the user specifically asks for a closed restaurant, let them know it is currently closed.

If a result has `total_outlets > 1`, it is a chain restaurant. Offer to show all branches using `list_outlets` with the `chain_code` from the search results so the user can pick the nearest or preferred branch.

### Step 2: Browse the Menu

Once the user selects a restaurant, use `get_menu` to retrieve its menu organized by category.

Show the user the categories and items with their prices. When the user is interested in an item that may have customization options (toppings, sizes, variations), use `get_item_details` to fetch the full details including all topping groups and options.

Help the user choose what they want to order. Skip or flag items where `is_sold_out` is true.

### Step 3: Build the Cart

Use `add_to_cart` with the user's selections. Each item needs:
- `restaurant_id` — the vendor code
- `item_id` — the product code from the menu
- `quantity` — how many to add
- `topping_ids` — IDs of selected toppings/customizations (if any)
- `variation_id` — specific variation ID (optional; first variation is used by default)
- `special_instructions` — per-item instructions like "no onions" or "extra spicy" (optional)

After adding items, show the running total using `get_cart`.

Important notes:
- Switching to a different restaurant automatically clears the cart.
- Use `remove_from_cart` if the user wants to remove an item. The cart item ID is available from `get_cart` results.

### Step 4: Preview the Order

Use `preview_order` to generate the full order summary. Present the following to the user:
- All items with quantities and prices
- Subtotal
- Delivery fee
- Service fee
- Total amount
- Delivery address

**CRITICAL: You MUST present this summary to the user and ask for their explicit confirmation before proceeding to Step 5. Never skip this step. Never place an order without the user saying "yes," "confirm," "go ahead," or equivalent.**

If the user wants to make changes, go back to Step 3 to modify the cart, then preview again.

### Step 5: Place the Order

Only after the user has explicitly confirmed the order, use `place_order` with `payment_on_delivery` as the payment method. Optionally include `delivery_instructions` if the user specified any.

Report the order code back to the user so they can track their order.

## Tool Reference

| Tool | Description |
|------|-------------|
| `search_restaurants` | Search restaurants by name or cuisine near the delivery address |
| `list_outlets` | List branches of a restaurant chain (use `chain_code` from search results) |
| `get_restaurant_details` | Get restaurant info: address, hours, delivery fee, minimum order |
| `get_menu` | Browse the menu organized by category with item codes and prices |
| `get_item_details` | Get full item details including topping groups and variations |
| `add_to_cart` | Add items to cart with real-time price validation |
| `get_cart` | View current cart contents and totals |
| `remove_from_cart` | Remove an item from cart by its cart item ID |
| `preview_order` | Preview the order summary with delivery address and payment methods |
| `place_order` | Place the order (requires prior user confirmation) |
| `refresh_token` | Open a browser for the user to log in and refresh the session token |

## Known Limitations

- **Cash on Delivery only** — Credit card payments require the Adyen browser SDK for payment authorization. GCash requires an app redirect. Neither payment method works via API. Use `payment_on_delivery` exclusively.
- **Philippines only** — This server uses foodpanda.ph endpoints (`ph.fd-api.com`) and is not compatible with other countries.
- **Token expiry** — Session tokens expire periodically. If API calls fail with authentication errors, use `refresh_token` to re-authenticate.
- **Reverse-engineered API** — The server uses reverse-engineered foodpanda internal endpoints. These may change without notice.
- **Single delivery address** — The server uses the saved address closest to the configured latitude/longitude coordinates. To change the delivery address, update `FOODPANDA_LATITUDE` and `FOODPANDA_LONGITUDE`.

## Best Practices

- **Always preview before placing** — Call `preview_order` and get explicit user confirmation before calling `place_order`. This is a non-negotiable safety requirement.
- **Handle price changes** — If a price changes between browsing and checkout, notify the user before proceeding. The server re-calculates the cart automatically before checkout to avoid stale price conflicts.
- **Ask for specifics** — When the user makes a vague request like "order me food," ask what cuisine or restaurant they prefer before searching.
- **Format prices in PHP** — Display prices in Philippine Pesos, e.g., ₱149.00.
- **Meet minimum order** — If the cart total is below the restaurant's minimum order amount, inform the user and suggest adding more items before placing the order.
- **Re-preview after changes** — If the user modifies the cart after previewing, call `preview_order` again before placing the order.
- **Handle auth errors gracefully** — If any tool returns a session token error, call `refresh_token` and retry the failed operation.
