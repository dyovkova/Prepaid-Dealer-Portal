# Milestone 6B: frontend order submission

Implemented and verified on 2026-11-20 against **PrepaidDealerPortal**
(`niabpabsvdgxackjjcsb`). No migrations, policies, Auth settings or products changed.

This records the original 6B behavior/checks. [Milestone 7B](order-history-ui.md)
now adds View order after confirmation and dealer history/details, preserving
the request/retry contract below.

## Behavior

Active dealers can submit `/new-order/` with an optional note (2000 characters).
The existing authenticated client calls `submit_order` with only `p_request_id`,
`p_items` (`product_id`, `quantity`) and `p_note`. Empty/unverified selections,
invalid quantities and repeated clicks are blocked. Current displayed EUR totals
remain estimates; the deployed RPC derives ownership, status, prices and snapshots.

Before sending, the browser durably saves a generated UUID and canonical payload
under `pdp:order-request:v1:niabpabsvdgxackjjcsb:<verified-user-UUID>`.
Same-origin tabs coordinate using a per-user [Web Lock](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API).
The service verifies the session owner and binds the attempt to that owner's JWT.
No passwords or tokens are saved in the order request record.

Loading, validation, authorization, conflict and uncertain-outcome feedback is
explicit. Network errors, timeouts and unconfirmed outcomes retain the exact UUID,
payload and draft. Editing, removal, clearing and catalog additions are blocked
until confirmation; **Retry saved request** resends the original payload even if
products have since become unavailable. Pending requests survive refresh/logout
and stay scoped to their owner. Other users see their own drafts and feedback.
Do not clear site data while a request is unresolved.

A definitive RPC validation rejection (`22023`) releases the request for editing
while retaining the draft. Authorization/conflict/transport failures keep it.
After successful acknowledgment, a receipt with the returned order UUID is saved
before clearing the matching draft. Storage failure keeps the confirmation or
pending UUID for safe recovery. A changed draft is retained for review. The latest
confirmation survives refresh; this is not order history. Normal drafts and
resolved receipts still clear on logout.

Small modules separate request/storage validation (`src/orders/request.js`),
retry/confirmation orchestration (`submit.js`), UI (`ui.js`) and RPC access
(`src/services/orders.js`). Existing guards and server RLS remain authoritative.

## Actual validation

- `npm.cmd run test:submission`: **7 passed**. Covered whitelisted payloads,
  bounds, exact retries, pending logout preservation, two queued submissions,
  storage/quota failures before and after sending, confirmed cleanup recovery,
  account isolation, unreadable requests and changed-draft preservation.
- `npm.cmd run test:draft`: **4 passed**.
- `npm.cmd run test:submission-ui` (opt-in production-build Chrome): **3 passed**,
  using existing controlled dealer and admin logins. Two actual multi-product
  orders were created through the public RPC and retained. Read-only trusted
  verification confirmed quantities, current server prices, SKU/name snapshots,
  creator/organization/status/note and one order per request key.
- Double clicks and two simultaneously submitting tabs made one RPC attempt.
  A real RPC committed an order while the browser deliberately lost its response.
  Draft/request survived refresh, logout and account switching; the exact retry
  recovered the same UUID without another order, even with product reads mocked
  unavailable. Request bodies contained no prices, totals, ownership or status.
- Browser mocks covered pre-send network failure, definitive validation rejection,
  inactive RPC denial, storage quota and inactive-profile UI feedback. No hosted
  activation changes were made. Actual backend inactive/anonymous/admin denials
  are recorded in [6A](../supabase/order-submission.md); native SQL authorization
  regressions passed again. Real admin navigation remained dealer-restricted.
- Catalog/draft Chrome regressions: **3 passed**, including ten active/two hidden
  products, direct inactive-ID RLS, edits, search, estimates, failures/retries,
  isolation and guards. One initial failed-lookup check stalled; the focused rerun
  and full suite passed without a product-access change.
- Native PostgreSQL 17.12 atomic/security/concurrency and catalog regression passed:
  24 invalid requests, rollback/snapshots/idempotency, 21 denials and real lock races.
- Production build and preview checks passed: eight pages, 20 linked routes/assets,
  query URL and unknown-route 404. No browser page errors or forbidden API writes.
  Mobile screenshots were inspected; 390/320-pixel overflow checks passed.
- Final read-only snapshots confirmed all original orders/items, accounts, roles,
  products, functions, grants, RLS and migration history preserved. Only two new
  synthetic orders/four items were added: **five orders/eight items total**.
  All four migration/seed hashes and unrelated MCP/configuration changes match
  the pre-task baseline. No Auth Admin API or privileged browser credentials used.

## Reproduction and limits

```powershell
npm.cmd run test:draft
npm.cmd run test:submission
npm.cmd run build
$env:PDP_SUBMISSION_UI_LIVE = '1'
$env:SUPABASE_HOME = Join-Path (Get-Location) '.verification/supabase-home'
npm.cmd run test:submission-ui
$env:PDP_CATALOG_UI_LIVE = '1'
npm.cmd run test:catalog-ui
```

Live tests require the existing ignored controlled account state, read-only
baseline and authenticated CLI. The ignored submission manifest preserves request
IDs before sending so reruns reuse these two orders. Recreating/removing that
manifest can create more synthetic orders; do not remove fixtures casually.
Tests use their own preview on `127.0.0.1:4174`; traces/video remain disabled.
The historical Auth/6A hosted fixture suites perform trusted writes and are not
required for frontend-only reruns.

Manual smoke check: dealer login, add two products, open New order, add a note
and submit once. Confirm the UUID and empty draft. For an uncertain result keep
browser data, return using the same account and choose Retry saved request.

Request recovery is local to this browser/profile and requires working storage,
HTTPS (or localhost) and Web Locks. Non-Chrome engines, production failover/load
and confirmation-enabled email delivery remain untested. Confirm Email remains
temporarily disabled for this demo. No order history, Admin Panel, payments,
inventory, delivery or Storage functionality was implemented.
