# Milestone 10A: admin order management backend

Status: **complete - both approved migrations deployed and hosted correction verified**.
Date: 2026-11-22. Backend only; frontend 10B and Storage remain unimplemented.

## Initial approved deployment and target (008)

**PrepaidDealerPortal - `niabpabsvdgxackjjcsb`**, production, ACTIVE_HEALTHY,
PostgreSQL 17.12; verified with official Supabase CLI 3.2.0.

Applied only [20261122000800_admin_order_access.sql](migrations/20261122000800_admin_order_access.sql).
Its approved SHA-256 remains unchanged:
`b48a66764bf71a685ecba505f17249e80a5ee0df5ff881ae38e5c1ea22e0c740`.

Immediately before application, reconfirmed exact project/name, database health,
file hash, unchanged security/schema and seven matching applied versions.
The remote dry-run listed only this approved migration, with no seeds/roles/Vault
changes. The real status CHECK contains submitted, processing, completed, rejected.

Deployment created exactly one authenticated admin SELECT policy on orders and
two status RPC functions. The existing parent-order item policy supplies admin
item visibility; dealer organization access remains unchanged. No direct write
grants/policies, old function replacements or migration-time data changes.
The private implementation is SECURITY DEFINER, public wrapper SECURITY INVOKER;
both have owner postgres, empty search paths, authenticated execution only and
no PUBLIC/anonymous execution. RLS stays enabled. All eight deployed versions
and stored migration SQL bodies match local files.

## Transition contract and corrected conflict response

`public.transition_order_status(p_order_id uuid, p_expected_status text,
p_new_status text) RETURNS uuid` authorizes the current active DB admin, holds
caller profile/role SHARE locks, locks the order FOR UPDATE, checks expected
status and changes only status plus server-generated updated_at. It accepts no
ownership, price, quantity, note, item or snapshot changes.

| Current | Allowed next |
| --- | --- |
| submitted | processing, rejected |
| processing | completed, rejected |
| completed | none |
| rejected | none |

Same-status, invalid/null/missing inputs and terminal transitions reject with
22023; unauthorized callers reject with 42501. Active admins can inspect orders
of inactive organizations; dealers still require active profile/organization.
The corrected stale-expectation response is HTTP 409 with SQLSTATE PT409.

**Initial hosted stale-expectation verification failed under 008:** the approved implementation
raises 40001 for an application conflict. The production API is PostgREST 14.18,
which retries that serialization code instead of promptly returning an error.
The test timed out after 20 seconds; a retrying RPC was observed afterward.
This matches the [official Supabase troubleshooting article](https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b).
Native SQL tests passed but did not model the HTTP adapter's retry behavior.
Testing of that code path stopped until correction was separately approved. Activity checks
show zero active transition RPCs. Guarded cleanup attempts matched no active
statement; no unrelated session was terminated or project restarted.

## Actual hosted checks that passed across the two approved deployments

All use existing controlled accounts and public Auth/Data API sessions, with no
Auth Admin API, Auth settings, new users, roles or memberships:

- Real permanent demo admin reads all orders/items and nested joins, including
  inactive-organization history. Two real dealers see only their own organization;
  direct order UUID and item lookups cannot cross organizations. No recursive RLS.
- Three new synthetic orders were created through submit_order with fixed request
  UUIDs/payloads persisted before submission. Quantities, ownership and current
  SKU/name/price snapshots match authoritative database products.
- Four allowed and twelve forbidden status pairs pass through the hosted RPC.
  Terminal/same-status changes and null/invalid/missing IDs are rejected. Valid
  updates change only status/server timestamp; rejected calls preserve the row.
- Ordinary dealers, anonymous callers and an already-inactive controlled dealer
  cannot transition statuses. Anonymous table reads reject; inactive business
  reads return no orders/items. Existing inactive profile status is preserved.
- Admin/dealer/inactive/anonymous direct order/item field updates, INSERT and
  DELETE reject, including status, ownership, quantities, prices and snapshots.
  The private implementation is excluded from the Data API (406/PGRST106).
- Exact submission retries after completed/rejected return original UUIDs without
  resetting status or changing snapshots; conflicting note reuse rejects 23505,
  and an empty order rejects 22023 without a new order.
- Organization deactivation blocks the existing dealer JWT's reads/submission
  retry; admin history remains readable. Original organization activation restored.
- The existing demo admin JWT loses wide reads/status RPC access when its profile
  is temporarily inactive. Only the verified admin's is_active flag was changed
  using a UUID/email/role/display-name guarded trusted query, because the public
  dealer-profile RPC intentionally rejects admin targets. The flag was restored
  in cleanup; no role, membership, Auth user, password or setting was changed.

The first comparison attempt stopped before fixture creation because it sorted
CLI/Data API rows by JSON key order; the comparison now sorts by row identity.
A read-only inspection proved zero orders had been added before the rerun.
After the stale-call failure, remaining checks reused the same three ledger
fixtures, explicitly skipped stale/concurrent RPC calls and exited as incomplete,
not as a fully passing run. No additional fixture was created on resumption.

## Retained fixtures and preservation

| Synthetic purpose | Order UUID | Retained status |
| --- | --- | --- |
| Completion | 1aed83d7-5408-433c-9913-b39d3ae8e09f | completed |
| Submitted rejection | 2059cd7b-af68-464e-8c03-3448d466d9bf | rejected |
| Processing rejection | bd7ac0e1-d6ae-4779-a2f8-4c6cbfa20689 | rejected |

Final read-only comparison: all eight original orders (including status and
updated_at), fourteen original items/snapshots, eleven accounts, profiles,
roles/memberships, fourteen organizations with their prior names/statuses and
fifteen products remain unchanged. Only the original 10A verification added three synthetic orders/four items:
**11 orders/18 items total**. The 009 verification reused them, adding no fixtures. All temporary flags were restored; no rows
were deleted. Configuration/MCP edits and the seven older migrations are intact.
Function/policy/grant definitions match the approved deployed state.

## Corrective deployment after explicit approval

Applied only [20261122000900_admin_order_conflict_response.sql](migrations/20261122000900_admin_order_conflict_response.sql).
Approved SHA-256 remains:
`ed8a9d1aee6660493ad945b7559d3a24c77ce2359f169b9201449e9673b5ab09`.

Before deployment, reconfirmed exact healthy project, matching hash and 009 as
sole pending migration; there were no active/non-idle transition RPCs. No session
was terminated. Deployed exactly this file, without seeds/roles/Vault changes.

A read-only comparison proves that only the private function's stale error code
changed from 40001 to PT409. Its remaining body, locks, validation and update
fields, ownership, execution ACLs, search path and public wrapper are identical.
Existing data, RLS policies, table/column grants and the earlier migration records
are unchanged. Both approved migration files retain their exact original hashes.

**Real hosted stale-conflict verification now passes:** seven requests returned
HTTP **409 / PT409** promptly. Recorded durations were **55, 48, 186, 554,
140, 202 and 61 ms** (range **48-554 ms**). They include separate stale requests,
parallel duplicate requests and parallel requests with conflicting target states.
All preserved the terminal fixture rows/snapshots. There were no client timeouts
or observed retry loops; final database activity shows zero active status RPCs.

The same real admin/dealer/inactive/anonymous checks pass again after 009:
wide reads, own/cross-UUID isolation, terminal states, null/invalid IDs, private
Data API exclusion, direct field-write/deletion denial, authoritative snapshots,
exact submission retries, conflicting/empty submission rejection and unchanged-JWT
inactive organization/admin restrictions. All temporary flags were restored.
The live suite explicitly requires the existing three-order ledger and refuses
to create replacement fixtures. Its final report marks completion true.

Final read-only result: nine local/remote versions and all stored migration
bodies match, no migration/seed/role changes are pending, and all eleven orders
and eighteen items are byte-for-value unchanged from immediately before 009.
That includes all eight original business orders/statuses/fourteen snapshots.
Eleven existing accounts, profiles, roles/memberships, fourteen organizations,
fifteen products and unrelated configuration edits are preserved.

## Regressions, reproducibility and limitations

`node supabase/verification/test_admin_orders_local.mjs` applies all nine
migrations by default to disposable local PostgreSQL 17.12. It passes all sixteen
status pairs, authorization/RLS, protected fields, rollback, expected-status and
authority/order lock races, idempotency and snapshot checks. Existing admin-product,
dealer activation and atomic submission concurrency regressions pass after 009.
All **27 JavaScript unit tests** and the **production build** pass (ten HTML entries).

The four allowed transitions had already passed through the hosted RPC under
008. After 009, the full matrix is rechecked locally; the hosted run rechecks
terminal rejection and prompt conflicts on the same terminal fixtures. They are
not reset or replaced just to replay successful paths. Parallel hosted duplicate/
conflicting requests therefore both reject as stale. Successful one-winner races
are verified with independent native sessions, not claimed as hosted load tests.
The unchanged valid-transition branch is also confirmed by deployed body comparison.

Hosted checks use PDP_ADMIN_ORDERS_LIVE=1 and
`node supabase/verification/test_admin_orders_live.mjs`; account/ledger files
must already exist in ignored .verification. No passwords/tokens are logged or
committed. The old skip-stale diagnostic mode reports incomplete and is not used
for final acceptance. No outstanding 10A acceptance blocker remains; browser
frontend 10B, Storage and unrelated features were not implemented.

Git scope is limited to the two approved migrations, focused SQL/API verification
modules, this report and milestone/security guidance. Existing migrations and
unrelated MCP/configuration changes remain outside the change set.
