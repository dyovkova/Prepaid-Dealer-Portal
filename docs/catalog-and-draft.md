# Milestone 5B: catalog and local order draft

Status (2026-11-20): **implemented and verified** against PrepaidDealerPortal
(`niabpabsvdgxackjjcsb`). No schema, RLS, product, role, membership, activation
or Auth configuration change was made. No order can be submitted.

## Behavior and boundaries

`/catalog/` uses the existing Supabase client/session and 5A RLS to show active
products as responsive cards with name, SKU, description and EUR unit price.
Search matches all three text fields. Loading, no matches, empty catalog,
API failure and retry states are explicit. Quantities are whole numbers from
1 to 999; repeated additions merge within that limit. Draft badges count distinct
products, while the summary also shows total units.

`/new-order/` supports quantity edits, remove and clear, using integer-cent
estimates. Every load fetches current active product details/prices. Local names,
prices, active flags and totals are never used. Missing/inactive/inaccessible
products remain marked unavailable with editing disabled and no contribution
to estimates. API failure or invalid edits make the estimate unavailable.
Nothing reserves stock, fixes prices or creates an order/payment/delivery promise.

`src/draft/` separates model, storage, counter and UI helpers; `products.js`
provides SELECT-only data access. Existing database-derived route guards suspend
and abort page work during account checks/changes. User-provided metadata grants
no permission. Data from products is rendered as text, not executable markup.

Storage key: `pdp:order-draft:v1:niabpabsvdgxackjjcsb:<verified-user-UUID>`.
Only version and unique `{ productId, quantity }` lines persist, with a local
limit of 100 products. Invalid content offers clear/restart; blocked/full storage
reports unsaved changes without pretending persistence succeeded. Logout clears
only that dealer's draft, including from other portal pages; clearing is best
effort if storage is unavailable. Other accounts' keys stay separate. Storage
events update another tab's draft and counters. Local storage is not encryption
or authorization; RLS remains the server boundary.

## Actual checks

- `npm.cmd run test:draft`: **4 passed**, covering invalid quantities, IDs,
  duplicates, stripping local prices, exact cents, unavailable-line exclusion,
  overflow, owner isolation/clearing, malformed storage and quota failures.
- `npm.cmd run build`: **passed**, all eight independent HTML entries emitted.
- Production page checks: **passed** eight routes, 20 linked routes/assets, query
  URL and unknown-route 404. One rerun initially targeted the stopped Playwright
  server; checks passed against an owned production preview.
- Production-build Chrome suite: **3 passed** using two existing real dealers
  and the permanent demo admin. Ten active products were visible; both inactive
  IDs returned no rows through a direct Data API request using the real dealer
  JWT, in addition to being absent from the UI.
- Search by name/SKU/description, no matches, merged additions, invalid/out-of-
  range input, edits/remove/clear, exact known EUR totals, counters, direct URLs,
  refresh persistence, empty draft and absence of submission actions passed.
- Same-browser switching verified distinct user keys/selections and owner-only
  logout clearing. Cross-tab quantity updates refreshed the first tab. Dealer
  `/admin/` denial and admin redirects from both dealer-only pages passed,
  including refresh.
- **Browser-only mocks** tested delayed loading, API errors/empty/retry, changed
  current prices overriding a forged local zero price, missing/inactive draft
  lines, malformed storage, quota failure and inactive-profile feedback. These
  scenarios changed no hosted product or status. The inactive-ID RLS check above
  used actual hosted data without mocks.
- Keyboard focus/mobile navigation passed. Desktop and 390-pixel screenshots
  were visually inspected; overflow checks passed at 390 and 320 pixels.
  Screenshots are ignored and contain only synthetic demo data.
- No browser page errors, non-GET Data API requests, order/item/Storage requests
  or Auth Admin API calls occurred. Final read-only snapshots matched original
  products, identities, roles, migration history, functions, policies and grants.
  One admin, three dealers, twelve products and zero orders/items remain. All
  migration and unrelated configuration hashes are preserved.

## Reproduction and manual smoke check

```powershell
npm.cmd run test:draft
npm.cmd run build
$env:PDP_CATALOG_UI_LIVE = '1'
npm.cmd run test:catalog-ui
```

The opt-in suite requires existing ignored controlled account state and the
read-only catalog baseline under `.verification/`. It creates no users and
starts/stops its own preview on `127.0.0.1:4174`. Do not use the historical 4B
suite as this frontend-only check: it includes privileged fixture role/status
changes. No passwords/tokens are committed; traces/video are disabled.

Manually: log in as a dealer, search a SKU, add two products, open New order,
edit quantities and refresh. Check estimates, remove/clear, then log out and
switch dealers. Each dealer sees only its own draft. Admin login must redirect
to `/admin/` from either dealer-only URL.

## Remaining limits

Drafts stay in this browser/profile and clear on logout; no device sync or
concurrent-edit conflict resolution. Estimates are not authoritative, and there
is no live price subscription; reload/recheck validates products again.
Milestone 6 must independently validate IDs, quantities, ownership, status and
current prices atomically on the server, ignoring all local prices/totals.
Submission, payments, inventory and delivery are unimplemented. Non-Chrome
engines and confirmation-enabled email delivery remain untested.
