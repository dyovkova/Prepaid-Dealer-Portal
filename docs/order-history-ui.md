# Milestone 7B: dealer order history and details

Implemented and verified on 2026-11-21 against **PrepaidDealerPortal**
(`niabpabsvdgxackjjcsb`). No database migration, fixture status change or saved
order modification was made. The existing 7A RLS is the authorization boundary.

## Behavior

`/my-orders/` shows organization order cards with reference, submission date,
status, product-line count, unit count and saved EUR total. Open a reference to
view its details. Results are newest first with an ID tie-breaker, 20 per page;
Previous/Next and Refresh avoid silently truncating the history at an API limit.
Dates use the browser's time zone. Loading, no orders, API errors and retry are
explicit; stale rows disappear before another load or account check.

`/order-details/?id=<order-UUID>` loads the saved reference/date/status/note and
each SKU/name/quantity/unit-price snapshot with line and order totals. It does
not query current products. Archived catalog rows cannot hide historical items
or replace their prices. Totals use exact integer cents with BigInt, supporting
the database quantity/price range rather than the smaller draft quantity limit.
Response validation rejects missing items or malformed data instead of showing
misleading totals. Names, SKUs and notes render as text.

Missing, malformed or duplicate `id` parameters get invalid-link feedback without
an order API call. A valid but nonexistent/hidden UUID gets the same unavailable
message, preserving cross-organization privacy. Session/permission errors have
account-access feedback; connection failures offer retry.

Both pages require an active dealer. The former shared-role details placeholder
now redirects admins to their dashboard, with no order request. Organization
filters and response checks supplement server RLS; editable metadata is unused.
Requests time out and abort on account changes; results stay in page memory and
are cleared during auth rechecks. No history cache or second Supabase client.

New Order shows **View order** after a confirmed receipt, including after refresh
or recovery of a saved request. The link stays hidden for unconfirmed outcomes
and during account suspension. It does not replace/clear a pending request or
change submission payloads, idempotency or confirmed-draft cleanup.

Small modules separate read access (`src/services/order-history.js`), snapshot
validation/arithmetic/links (`src/orders/history-model.js`), rendering
(`history-ui.js`) and the two page controllers. Documents remain a placeholder.

## Actual validation

- `npm.cmd run test:history`: **4 passed**. Covered valid/invalid links, duplicate
  parameters, historical snapshots and quantities, all statuses, invalid/foreign
  responses and exact cents/formatting above JavaScript's safe integer limit.
- Draft tests **4 passed** and submission tests **7 passed**: **15 unit tests**.
- Production-build Chrome history suite: **4 passed** with real controlled dealer
  and admin sessions. Verified real organization history/details, all saved line
  values, totals against independently computed read-only SQL sums, direct URLs,
  refresh, two-account switching and actual unfiltered cross-organization Data
  API denials for headers/items. Admin navigation/reads remained restricted.
- Browser mocks covered delayed/empty/error responses, connection failure,
  HTTP 401/403 feedback, malformed/empty item data, 21-order pagination, all
  status badges, HTML-like saved text, large historical totals and inactive
  profile UI feedback. These mocks changed no hosted records or activation.
- Existing submission browser suite: **3 passed**, including duplicate clicks,
  two tabs, exact saved retries, lost responses, logout/account isolation and
  confirmed cleanup. The preverified existing request manifest was reused:
  RPC calls replayed old orders; no orders were created. New assertions opened
  View order, verified its saved details and checked receipt-link persistence
  and pending-link hiding.
- Existing catalog/draft browser suite: **3 passed**. Total: **10 browser tests**,
  without page errors, Storage calls or unauthorized API writes. History/details
  made no catalog lookups. The historical trusted Auth fixture suite was not run;
  its old admin-placeholder expectation was updated for the dealer-only guard,
  which the new real-session browser suite verified.
- GET-only hosted 7A regression passed again for all three existing dealers and
  the permanent admin, including own/cross UUIDs, snapshots, nested relationships
  and anonymous denial. No trusted status/archive fixture runner was used in 7B.
- Desktop and mobile screenshots were inspected; document overflow checks passed
  at 390/320 pixels, including a maximum-range historical total.
- Production build and preview checks passed: all eight pages, 22 linked routes/
  assets, query URL and unknown-route 404.
- Final read-only snapshots exactly matched the pre-task data/security baseline:
  **six orders/eleven items**, twelve products, all accounts/roles, functions,
  grants, RLS and five migration records. All SQL/seed hashes and unrelated
  MCP/configuration files were preserved. No Auth settings or privileged keys.

## Reproduction and remaining limits

```powershell
npm.cmd run test:draft
npm.cmd run test:submission
npm.cmd run test:history
npm.cmd run build
$env:PDP_HISTORY_UI_LIVE = '1'
npm.cmd run test:history-ui
# Existing submission manifest must be verified before replaying this suite.
$env:SUPABASE_HOME = Join-Path (Get-Location) '.verification/supabase-home'
$env:PDP_SUBMISSION_UI_LIVE = '1'
npm.cmd run test:submission-ui
$env:PDP_CATALOG_UI_LIVE = '1'
npm.cmd run test:catalog-ui
```

Opt-in browser tests require the ignored controlled account state, read-only
history baseline and SQL totals under `.verification/`. Submission reruns also
require the existing request manifest and CLI; do not remove it or create new
orders to rebuild fixtures. Each suite owns its preview on `127.0.0.1:4174`;
run them sequentially. Traces/video remain disabled; no credentials are committed.

Manual smoke check: dealer login, My orders, open a reference, refresh, compare
saved lines/total, then log out and switch dealers. A different organization's
UUID must show Order unavailable. After a confirmed submission, View order
should open that UUID without altering another draft or unconfirmed request.

New orders/status changes appear on refresh; there is no realtime subscription.
Shared-organization multi-user reads were verified locally in 7A; existing
hosted memberships remain isolated and unchanged. Non-Chrome engines,
production load and confirmation-enabled delivery remain untested. Confirm
Email stays temporarily disabled for the demo. Admin-wide order access,
status management, documents and Storage remain later milestones.
