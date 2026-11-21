# Milestone 7A: dealer order history access

Status (2026-11-21): **deployed and verified after explicit approval**.
Target: **PrepaidDealerPortal — `niabpabsvdgxackjjcsb`**, production,
`ACTIVE_HEALTHY`. All five local/remote migration versions match. Active dealers
can read only their organization's orders/items; direct writes remain denied.

## Applied migration

[`20261121000500_order_read_access.sql`](migrations/20261121000500_order_read_access.sql)

SHA-256: `d13edb76a13cfc52c14763997884482eefa9c10301300fab603251e501b14ed5`

The transaction adds only:

- An authenticated SELECT policy on `orders`, matching `dealer_id` to the existing
  caller-bound `private.current_active_dealer_id()` helper.
- An authenticated SELECT policy on `order_items`, requiring a parent visible
  through `orders` RLS.
- Authenticated SELECT grants on these two tables.

The existing helper requires the database `dealer` role, an active profile and
an active organization. Organization membership determines visibility, including
orders created by colleagues. User-editable metadata grants nothing. Admins,
missing identities/membership/roles and inactive accounts get no rows. Anonymous
users retain no table privileges. INSERT/UPDATE/DELETE/TRUNCATE remain ungranted;
no write policies are introduced. See the [PostgreSQL RLS rules](https://www.postgresql.org/docs/17/ddl-rowsecurity.html)
and [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

The dependency path is `order_items → orders → private identity helper`; it
does not query back into items. No new function or security-definer entry point
is needed. Existing ownership and item-primary-key indexes cover the lookups.
Reads use saved SKU/name/price snapshots without joining current products, so
catalog archival/renaming/repricing cannot hide or rewrite historical lines.

No changes to RPC bodies/grants, idempotency, tables/columns/indexes, saved data,
existing migrations, seeds, Auth configuration, frontend, admin access or Storage.

## Preparation checks

- Official local CLI **3.2.0** verified the exact healthy target and four matching
  applied migrations. The sole pending version is `20261121000500`.
- Read-only inspection found both tables with RLS enabled, zero existing policies
  and no anonymous/authenticated SELECT grants. Remote functions, relation grants,
  policies, column grants and history matched the previous verified baseline.
- Captured the current six orders/eleven items, twelve products, three dealers and
  one admin as the 7A preservation baseline. The additional existing order since
  6B was preserved; this milestone created no hosted orders or accounts.
- **Native PostgreSQL 17.12 tests passed** using disposable synthetic fixtures and
  an Auth event stub, not hosted Auth. Two users in organization A read each
  other's headers/items; organization B sees only B. Direct UUID/product filters,
  joins, unknown IDs, profile privacy and recursion checks passed.
- Inactive profile/organization, changed/missing role or membership, admin,
  missing subject/profile and anonymous restrictions passed locally. Existing
  claims were retained across trusted local activation/role/membership edits.
  Direct writes were denied; temporary local write grants also demonstrated RLS
  write denial. None of these fixture edits ran remotely.
- Migration preserved preexisting local orders/items and every function body,
  security setting and ACL. Archival/renaming/repricing preserved readable
  snapshots; all order statuses stayed visible. Post-migration RPC creation,
  exact/reordered replay, conflicting reuse and invalid-request rollback passed.
- Original 5A catalog and 6A atomic/security SQL suites passed **before** local 7A
  application, while their historical SELECT-denial assertions still apply.
  After 7A, the new history/security checks and independent-session 6A concurrency
  races passed, with original products/profiles and RPCs preserved. The sandboxed
  Windows test shutdown required permission to stop only its verified local
  disposable PostgreSQL process; the test then exited successfully.
- **Real hosted baseline passed**: public Auth login for three existing isolated
  dealers and the permanent admin; GET-only lists and every existing order/item
  UUID lookup remained denied before approval. Anonymous reads were denied.
  Before/after snapshots of accounts, products, orders/items, policies and history
  matched. No Auth Admin API, fixture reassignment or activation change was used.
- `npm.cmd run test:draft`: **4 passed**; `npm.cmd run test:submission`: **7 passed**;
  `npm.cmd run build`: **passed**, all eight entries emitted.
- Remote `db push --remote=niabpabsvdgxackjjcsb --dry-run --skip-vault` passed and
  listed **only this migration**, with no seeds or custom roles. CLI reported
  login-role initialization; no application migration or Vault update occurred.
  A dry-run lists pending files; it does not execute their SQL.

## Actual hosted deployment and verification (2026-11-21)

- Immediately before execution, reconfirmed the approved SHA-256, healthy target,
  unchanged baseline and sole pending migration. Applied only the approved SQL,
  with no seed, custom role or Vault changes. Deployed history SQL matches the
  file; all earlier migration records are unchanged. Final dry-run is up to date.
- Read-only inspection confirmed RLS enabled, exactly the two intended SELECT
  policies, authenticated SELECT-only ACLs, no anonymous privileges and no client
  role bypass. Existing functions/bodies/ACLs, other policies/grants, columns,
  constraints and indexes match the original baseline.
- Public Auth sessions for **all three existing dealers** returned exactly their
  organization's orders and saved items. Every existing own/cross-organization
  order UUID was tested directly for headers/items. Nested parent/item reads,
  product-ID filters and unknown IDs passed without recursive RLS errors.
  Admin reads returned no rows; anonymous reads remained denied.
- Real dealer/admin/anonymous INSERT, PATCH and DELETE requests were denied.
  Insert probes used incomplete rows; update/delete probes targeted a nonexistent
  UUID. The prechecked absence of write grants and final snapshots provide a
  second check that these probes changed no data.
- The approved validation temporarily deactivated one guarded existing dealer's
  profile, then organization. Its **same issued JWT** lost all order/item lists,
  direct UUID reads and RPC replay access. Own profile feedback stayed available.
  Each flag was restored immediately, and the same JWT regained access.
- Temporarily archived the exact referenced synthetic `PDP-DEMO-CREDIT-005`
  product. The catalog hid it while saved SKU/name/price snapshots remained fully
  readable. Exact RPC replay still returned the original order UUID. Restored
  the original flag; neither prices nor snapshots were edited.
- Full before/after checks confirmed **six orders/eleven items**, twelve unchanged
  products, three unchanged active dealers and the permanent admin. No orders,
  accounts or memberships were created/reassigned. Temporary fixtures were fully
  restored; the ignored recovery record has no pending restoration.
- Native SQL/RLS/snapshot/RPC/concurrency regressions, four draft tests, seven
  submission tests, production build and eight-page/20-link preview checks passed
  again. One live comparison initially assumed JSON key order in nested results;
  it was corrected to sort by stable row IDs and the full suite passed. Migration
  SQL was unchanged. No frontend, admin-management, Storage or Auth setting changes.

## Reproduction and limits

```powershell
# Local native SQL tests use the existing ignored PostgreSQL tooling from 6A.
# On Windows allow the test process to stop its own disposable cluster.
node supabase/verification/test_order_read_access_local.mjs
npm.cmd run test:draft
npm.cmd run test:submission
npm.cmd run build

# Existing controlled account state and authenticated CLI are required.
$env:SUPABASE_HOME = Join-Path (Get-Location) '.verification/supabase-home'
$env:PDP_HISTORY_LIVE_TESTS = '1'
# Public login + GETs only; verifies deployed organization access.
node supabase/verification/test_order_read_access_live.mjs

# Requires authorization: temporarily changes/restores existing demo flags.
$env:PDP_HISTORY_FIXTURE_TESTS = '1'
node supabase/verification/test_order_read_fixtures_live.mjs
```

The GET-only runner requires existing ignored controlled account state and the
authenticated CLI for read-only inspection. Its `--baseline` mode is historical:
it requires 7A still pending and deliberately stops after deployment.

The separate fixture runner requires explicit authorization for temporary hosted
activation/archive changes, guards the recorded synthetic identities/product,
persists an ignored recovery record before changes and restores in `finally`.
Do not run it against unrelated data or concurrently with fixture edits.

Credentials, sessions and local snapshots remain outside Git. API calls use only
the public URL/key and real user JWTs, never privileged browser credentials or
the Auth Admin API. All hosted dealers remain isolated: the two-member
shared-organization scenario passed locally, not against hosted membership
fixtures. Production load and confirmation-enabled delivery remain untested;
Confirm Email is still temporarily disabled. [Milestone 7B dealer history/details](../docs/order-history-ui.md)
is now verified without database changes. Admin-wide access and Storage remain
deferred. All applicable 7A checks passed.
