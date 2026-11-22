# Milestone 10B: admin order management UI

Status: **implemented and production-preview verified**, 2026-11-22.
Target: PrepaidDealerPortal - `niabpabsvdgxackjjcsb`.
Netlify publication and browser checks are pending the verified code push.

## Implemented behavior

- `/admin/orders/` is the eleventh independent HTML entry, linked from Admin
  Dashboard. `/admin/orders/?id=<UUID>` opens admin details with direct navigation
  and refresh. Dealer `/order-details/` retains its existing dealer-only guard.
- The all-organization list shows the canonical order UUID as order number,
  organization, browser-local submission date, status and saved EUR total.
- Search supports case-insensitive organization names or an exact full order
  UUID. Status filtering and ten-row pagination run on the Data API; exact
  counts and stable descending date/UUID ordering determine navigation. Search,
  status and page are kept in the URL for refresh/browser-back behavior.
- Details reuse the existing saved-snapshot validator, BigInt EUR arithmetic and
  renderer. Names, SKUs, unit prices, quantities and totals come only from saved
  order items; the admin screen never queries current catalog prices.
- Submitted orders offer Processing/Rejected; Processing offers Completed/Rejected.
  Every action requires confirmation. Completed/Rejected have no status buttons
  and are explicitly read-only. No fields, ownership or line-item editor exists.
- Status writes call only `transition_order_status` with order UUID, expected
  status and next status. No direct order/item writes, prices or ownership inputs.
  Busy controls and one confirmation listener prevent duplicate UI submissions.
- A 409/PT409 shows a clear conflict message and reloads the order with GET.
  The mutation is never retried automatically. A failed reload removes actions
  until an explicit reload succeeds. Uncertain network responses also reload
  current state and explain that the mutation was not automatically retried.
- Account/session changes cancel pending reads/dialogs and clear order data.
  Every service call gets the current expected user's JWT from the existing
  session helper; database roles, activation and RLS remain authoritative.

Page initialization, list, details, view/confirmation, model and service are small
separate modules. Shared Bootstrap styles, feedback, history cards/details and
the single Supabase client are reused. The only Auth integration is registering
the new page in the existing active-admin guard map. Auth flows/settings,
database migrations/RLS, Storage and unrelated business code are unchanged.

## Actual production-preview validation

Four Chrome/Playwright cases pass against the production build and hosted backend:

1. Real admin list, organization/UUID search, status filtering, real two-page
   pagination, direct details, invalid/missing IDs, refresh and saved totals/items.
   390px/320px list/details layouts have no horizontal overflow; screenshots inspected.
2. Controlled loading/503/empty/retry and HTML-as-text safety. A simulated PT409
   sends one mutation, reloads the changed status and does not retry it. Network
   errors and a conflict followed by a failed GET show explicit recovery feedback.
3. Anonymous/dealer direct-route denial, real inactive-user feedback and Data API
   status/direct-write denials; admin navigation to dealer details stays restricted.
4. Two newly recorded synthetic preview orders: actual processing/completion,
   cancellation, duplicate-confirm click protection and rejection from Processing.
   A second real admin session advances the conflict fixture after the UI read;
   the stale UI request returns actual HTTP 409/PT409, triggers one GET reload and
   stays Processing until a fresh explicit rejection confirmation. Saved snapshots
   remain unchanged. Browser writes contain only the three approved RPC arguments.

The initial mock empty-page response omitted CORS exposure for Content-Range;
that test fixture was corrected before any test order was created. All four
cases subsequently pass. Expected network/permission errors occur in deliberate
failure tests; no uncaught JavaScript errors or out-of-scope browser writes.

Other checks passed: **32 unit tests** (five new plus existing regressions),
**six existing session browser regressions** (registration skipped to avoid new
accounts), production build and all eleven route checks. The session regression
baseline was temporarily refreshed to current order counts, then restored.

Read-only preservation checks confirm every pre-existing record, including all
eleven original-to-10B orders/eighteen snapshots, profiles, roles/memberships,
organizations, products and all nine migrations/security definitions unchanged.
Two preview fixtures are retained terminal (Completed/Rejected), adding three
items: thirteen orders/twenty-one items at this stage. No users/products/organizations
were created or changed. The fixture ledger preserves exact creation request UUIDs
so rerunning tests reuses the same orders.

## Netlify verification plan

After the verified code push, confirm the new route changes from HTTP 404 to
its own built entry, inspect all eleven live entries/assets and private-path
denials, then run the same four browser cases on Netlify. Live status coverage
uses at most three separately recorded synthetic orders for completion, genuine
conflict/rejection and rejection directly from Submitted. Existing terminal
orders are not reset to repeat successful transitions.

## Reproducing and limits

`npm run test:admin-orders` runs pure model tests. Browser tests are opt-in and
require existing ignored controlled-account manifests and baseline under
`.verification/`; no credentials are committed. Build first, then:

```powershell
$env:PDP_ADMIN_ORDERS_UI = '1'
npm.cmd run test:admin-orders-ui
# After publication:
$env:PDP_ADMIN_ORDERS_NETLIFY = '1'
npm.cmd run test:admin-orders-ui
```

The suite permits only ledger-bound status RPC writes from the page and refuses
changes to pre-existing orders. Preview/live fixture creation uses the existing
public dealer submission RPC, never Auth Admin APIs or trusted status resets.
Filtering is submitted with Search or changed status; partial UUID search is
not provided. Data is refreshed on navigation, explicit reload and existing
session checks; there is no realtime subscription or automatic mutation retry.
An uncertain response is resolved by reading current status before another
explicit confirmation. Dates use the browser time zone; EUR totals use snapshots.
No document/Storage implementation is included.
