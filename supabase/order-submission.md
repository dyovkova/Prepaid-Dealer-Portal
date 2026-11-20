# Milestone 6A: atomic order submission backend review

Status (2026-11-20): **deployed after explicit approval; applicable hosted and
native regression checks passed**. Target: **PrepaidDealerPortal — `niabpabsvdgxackjjcsb`**,
healthy production project in `eu-central-1`, PostgreSQL `17.12`.

Approved applied migration:
[20261120000400_atomic_order_requests.sql](migrations/20261120000400_atomic_order_requests.sql).
SHA-256: `1f27c61d638df776a1e293b9fe5ec0e3315ad7b0243e6c592f62e5bcd74c4f53`.
Before application, three deployed migrations matched local history and dry-run
listed only this file. Applied only the approved migration, with no seeds,
custom roles or Vault updates. Final history matches all four migrations and
dry-run reports up to date. Existing admin/dealers/products are preserved;
three synthetic validation orders/four items are retained. No frontend submission,
history, admin operations or Storage was implemented.
Read-only catalog inspection also verified the existing 14 order/item columns,
13 validated constraints (including creator/request uniqueness and restrictive
foreign keys), five valid indexes, exact snapshot numeric type and Read Committed
default. Original account/product/function/policy/grant/history records remain
unchanged; only the approved functions/history record and validation orders/items
were added.

## Deployed API

Authenticated RPC `public.submit_order(p_request_id uuid, p_items jsonb,
p_note text DEFAULT NULL)` returns the new or previously committed order UUID.
Example arguments for a future client (placeholders only):

```json
{
  "p_request_id": "<fresh UUID retained for retries>",
  "p_items": [{ "product_id": "<active product UUID>", "quantity": 2 }],
  "p_note": "Optional dealer note"
}
```

Items must contain only `product_id` and numeric integer `quantity`, with unique
valid UUIDs, 1–100 lines and quantities 1–2147483647 (the existing integer column
range; the frontend draft separately caps at 999). Empty/malformed orders,
duplicates, fractions, missing/inactive products and extra price/ownership/status
fields fail. Request ID is required. Notes are limited to 2000 characters,
trimmed, and blank notes normalize to NULL. No client prices/totals are accepted.

The server derives creator from `auth.uid()`, organization from current locked
profile membership, and literal `submitted` status. Item SKU/name/price snapshots
come only from locked current product rows. The header and all items are one
transaction; errors propagate without partial persistence.

## Function and security boundaries

| Function | Responsibility / client execution |
| --- | --- |
| `private.validate_order_items` | Pure validation and canonical item ordering; owner-only |
| `private.lock_order_dealer` | Caller-bound profile/role/organization authorization and locks; owner-only |
| `private.lock_order_products` | Sorted product locks and current snapshot extraction; owner-only |
| `private.create_order` | Privileged orchestration, idempotency and persistence; authenticated only |
| `public.submit_order` | Small security-invoker API wrapper; authenticated only |

All are owned by `postgres` with empty search paths and revoked PUBLIC/anonymous
execution. Only `create_order` is security definer; its authorization is mandatory
even for callers invoking it directly. Helpers cannot be used independently by
clients. Private schema stays unexposed; no API configuration is changed. The
invoker wrapper needs authenticated EXECUTE on the private entry point, as well
as existing private schema USAGE. No new table/type/column/index, table grant or
policy is introduced. Orders/items retain default-deny RLS and no direct client
SELECT/INSERT/UPDATE/DELETE, including for admins. General reads belong to 7.
This follows PostgreSQL's [function security guidance](https://www.postgresql.org/docs/17/sql-createfunction.html).

## Idempotency and concurrency contract

The key is **creator + request UUID**, using the existing unique constraint.
A transaction-scoped advisory lock serializes that key before row creation.
Canonical product IDs/quantities and normalized note must match the saved order;
otherwise reuse raises `23505`. Reordered equivalent items replay safely.
Another dealer may use the same UUID but receives only its own separate order.
No header/item is updated by a replay. Exact retries retain original snapshots
after price/name/SKU edits or archival, but still require a currently active
dealer with the same organization. Changed membership causes a conflict.

Lock order is profile → role → organization → creator/request advisory lock →
product UUID order. `FOR SHARE` protects activation, role/membership and product
fields until transaction end. Relevant writers that acquired the row first are
observed after waiting; later writers wait for submission to end. Unrelated
request keys can submit concurrently. Hash collisions only serialize unrelated
calls; the unique constraint remains definitive. Read Committed was tested;
transactions aborted for deadlock/serialization must be retried with the same
request ID. See PostgreSQL's [row-lock semantics](https://www.postgresql.org/docs/17/explicit-locking.html).

## Actual hosted deployment and verification (2026-11-20)

- Immediately before applying, verified the healthy named project, exact approved
  SHA-256, sole pending migration, all original data and required schema objects.
  No mismatch or seed conflict was found. The CLI applied only the reviewed file.
- Verified every deployed function body and all stored migration statements
  against source; owners, empty search paths, definer/invoker flags and execution
  permissions match the reviewed contract. All original functions, grants,
  policies, identities, roles, product rows and migration records are preserved.
  No table grant/policy changed and orders/items still have default-deny RLS.
- [Hosted rollback suite](verification/test_atomic_orders.sql) passed success,
  24 invalid cases, injected second-item failure, price/SKU/name snapshot
  integrity, equivalent/conflicting retries, membership-bound replay and 21
  authorization/helper/table denials. Complete before/after snapshots matched;
  the temporary trigger, orders and catalog/status edits rolled back.
- [Public Auth/RPC runner](verification/test_atomic_orders_live.mjs) logged in all
  three existing dealers and the existing permanent admin through public Auth.
  Actual dealer calls created exactly three intended orders/four items. Trusted
  reads confirmed each caller's derived organization/creator, literal submitted
  status and exact current server SKU/name/price/quantity snapshots.
- Two simultaneous HTTP calls with the same creator/request returned one UUID;
  reordered retry returned it again. Conflicting note, quantity and product-list
  retries returned `409/23505`. A second dealer reused the same request UUID and
  received its own isolated order, preserving creator-scoped idempotency.
- Invalid/empty/mixed/archived/duplicate/oversized requests, forged prices/status/
  organization fields and unknown RPC ownership parameters were rejected without
  writes. Anonymous and real admin sessions were denied submission.
- The same already-issued dealer JWT was denied both new calls and exact retries
  while its profile was inactive, then while its organization was inactive.
  Guarded status changes were restored in `finally`; exact retry recovered the
  original UUID afterward. All activation, role and membership values match the
  original baseline. No accounts or additional admins were created.
- Real JWT direct order/item SELECT/INSERT/UPDATE/DELETE requests were denied.
  All four private helper/entry RPC routes returned `406/PGRST106` for the private
  schema and `404/PGRST202` in public, confirming they are not API-exposed.
- Final comparisons confirmed no changes to prior records, products, account
  configuration or table security. Only the three recorded synthetic orders and
  four snapshot lines were added. Four local/remote migration versions match;
  final dry-run has no pending migrations/seeds/roles. Native PostgreSQL suites,
  existing catalog regression, four draft tests and all eight build entries pass.

The initial live test expected a private-schema rejection from the OpenAPI root,
but this gateway requires a secret key for that metadata endpoint. Verification
was corrected to test actual private RPC routes using only the publishable key;
no secret was obtained or settings changed. A local report-writer argument bug
was also fixed. The approved SQL never changed; the resumed suite passed.

The three validation orders are retained deliberately, not deleted. Request UUIDs
and returned order UUIDs are recorded in ignored `.verification/order-live-state.json`
for safe idempotent reruns. Redacted results and preservation snapshots are also
ignored. Existing account credentials remain local; JWTs stay in memory and no
Auth Admin API or service-role key is used.

## Native preparation and regression verification

- A new loopback-only native **PostgreSQL 17.12** cluster applied all four local
  migrations and synthetic seeds. Auth identities were local event stubs, not
  Supabase signups or hosted Auth table inserts. No system user/service was made.
- [Rollback SQL suite](verification/test_atomic_orders.sql) passed successful
  multi-item creation, server ownership/status/note/current snapshots and an exact
  EUR total; 24 invalid cases; injected second-item failure with no header/items
  left; reordered retries and conflicting quantity/items/note; archival/price/
  SKU/name snapshot preservation; and cross-account request-key isolation.
- The suite passed 21 authorization/helper/table denials, including inactive
  profile/organization, missing role/membership/subject, unknown identity, admin
  with forged dealer metadata, anonymous RPC, private helper execution and direct
  order/item access. All fixtures and status/catalog changes rolled back.
- [Real multi-session tests](verification/test_order_concurrency.mjs) observed
  PostgreSQL lock waits and passed concurrent identical/conflicting retries,
  independent reversed-item submissions, and both writer-first/submission-first
  price, archival, profile/organization activation, role and membership races.
  Committed price/SKU/name edits were captured; earlier submissions kept their
  snapshots. Outer rollback removed the whole order and allowed a fresh retry.
- Function ownership, search paths, definer/invoker flags and execution grants
  matched the contract. Existing catalog SQL regression passed on this native
  engine. Products/profiles returned to their initial local values.
- `npm.cmd run test:draft`: **4 passed**. `npm.cmd run build`: **passed** all
  eight pages; no application source/dependency was changed.
- Initial local verification hit an ambiguous test variable named like a table
  column; renamed it and reran successfully. The migration itself did not need
  a correction. Remote dry-run does not execute or validate SQL.

## Reproduce local checks

The optional native test tooling is isolated from app dependencies and ignored:

```powershell
npm.cmd install --prefix .verification/order-sql-tools --no-save --package-lock=false embedded-postgres@17.12.0-beta.19 pg@8
node supabase/verification/test_atomic_orders_local.mjs
npm.cmd run test:draft
npm.cmd run build
```

The runner binds only `127.0.0.1:56436`, uses a fresh random local password,
starts/stops its own cluster and accepts no remote connection string. Cluster
files remain under ignored `.verification/`; no recursive cleanup runs.
It uses [embedded-postgres](https://github.com/leinelissen/embedded-postgres)
only for local test infrastructure.

## Reproduce hosted verification and remaining limits

The opt-in live runner requires the recorded controlled credentials, baseline and
request manifest in ignored `.verification/`. It never deploys, seeds, creates
users or promotes roles. It reuses request IDs and expects only the three recorded
validation orders in this demo project; do not run it against unrelated data.
It executes a rollback SQL fixture suite and temporarily deactivates/restores one
guarded dealer to test stale-session authorization. Run only with authorization:

```powershell
$env:SUPABASE_HOME = Join-Path (Get-Location) '.verification/supabase-home'
$env:PDP_ORDER_LIVE_TESTS = '1'
node supabase/verification/test_atomic_orders_live.mjs
```

All applicable 6A demo checks passed. Concurrent price/status/membership races were
tested with native PostgreSQL 17.12 sessions; hosted testing verified simultaneous
HTTP duplicates and rollback snapshot/security behavior. Production load/stress,
failover and higher isolation levels were not tested. Callers must preserve the
request UUID/payload for retries after ambiguous network errors; transactions
aborted for deadlock/serialization need retry. Email confirmation remains
temporarily disabled for the demo and unchanged. Frontend submission, history,
Admin Panel and Storage remain deferred.
