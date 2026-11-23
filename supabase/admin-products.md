# Milestone 8A: admin product backend

> Milestone-scoped verification record. Counts and deferred-feature notes describe that stage, not the completed application. See [current release evidence](../docs/release-review.md) for the final state and limitations.

Status: **deployed and verified after explicit approval** (2026-11-21).
Target: **PrepaidDealerPortal — `niabpabsvdgxackjjcsb`**, production,
`ACTIVE_HEALTHY`, PostgreSQL `17.12`, verified through the official CLI `3.2.0`.

## Deployed migration

[20261121000600_admin_product_access.sql](migrations/20261121000600_admin_product_access.sql)

SHA-256: `215f6c8036c9844895b83a7f459bf535b7b5da62029a46ec09077d6e43711026`

The transaction adds three authenticated RLS policies: active-admin
SELECT, INSERT with an admin check, and UPDATE with both USING/WITH CHECK.
It grants INSERT/UPDATE only on `sku`, `name`, `description`, `unit_price`,
`is_active`. The existing authenticated SELECT grant is sufficient for admin
reads and RETURNING; the existing dealer policy remains unchanged.

Authorization reuses `private.is_active_admin()`: the database profile must be
active and its database role must be `admin`. Auth metadata grants nothing.
Admins do not require an active dealer organization. The helper is caller-bound,
SECURITY DEFINER with an empty search path and fixed identity lookups; it does
not query products or create a policy recursion.

No new functions, tables, constraints, indexes, seed data or row edits are added.
No anonymous grant, DELETE/TRUNCATE grant or DELETE policy is introduced.
Archive means updating `is_active=false`; an admin can still read archived rows.
IDs and timestamps cannot be supplied/edited through client column grants.
Dealer reads remain restricted to active products and an active dealer account
and organization. Unauthorized UPDATEs can return zero rows instead of an
exception; tests verify both affected rows and retained data.

Existing constraints retain case-sensitive unique SKUs, nonblank trimmed
SKU/name checks, NOT NULL fields, default empty description and exact
`numeric(12,2)` prices from `0` to `9999999999.99`. Negative prices, NaN,
infinities and overflow are rejected. Existing numeric scale/rounding semantics
are unchanged. Foreign keys, saved order SKU/name/price snapshots and the
`submit_order` RPC are untouched.

## Remote preflight and dry-run

- Before deployment, five existing migrations matched local versions. Products
  have only the approved active-dealer SELECT policy. RLS and validated product
  constraints/indexes are present; anonymous access and all client writes are
  were denied before 8A.
- Read-only baseline: eleven Auth accounts, twelve products (ten active/two
  inactive), eight orders/fourteen items. Later legitimate data from earlier
  milestones is preserved; no old account/order count is assumed. The final
  read-only snapshot exactly matches the preparation baseline for all rows,
  migration history, functions, grants, policies and inspected product schema.
- The remote dry-run succeeds and lists **only** the migration above. No seeds,
  custom roles or Vault updates are included. A dry-run plans deployment; it does
  not execute the SQL or establish hosted runtime permission tests.

```powershell
$env:SUPABASE_HOME = Join-Path (Get-Location) '.verification/supabase-home'
node node_modules/supabase/dist/supabase.js migration list --remote=niabpabsvdgxackjjcsb
node node_modules/supabase/dist/supabase.js db push --remote=niabpabsvdgxackjjcsb --dry-run --skip-vault
```

## Actual local checks

The [native harness](verification/test_admin_products_local.mjs) applies all six
migrations to disposable, loopback-only PostgreSQL **17.12**, matching production.
Its [focused checks](verification/admin_product_checks.mjs) pass:

- Admin read/create/edit/archive with generated defaults and archived visibility.
- INSERT and UPDATE validation, duplicate SKU rejection, zero/upper-bound valid
  prices, protected ID/timestamp columns and hard-delete denial even without an
  order reference. RLS still denies DELETE after a temporary local DELETE grant.
- Ordinary dealers, anonymous/inactive users, missing identity/role and forged
  metadata cannot modify products. Inactive profile/organization, demotion and
  role removal take effect with unchanged caller claims; restored roles work.
- Dealers cannot read archived products by UUID/filter. Existing history remains
  readable with original snapshots after admin archive/rename/repricing; RPC
  retries return the existing order and new requests for archived products fail.
  Admin-wide order access and direct order/item writes remain denied.
- Exact column grants and unchanged constraints, functions, non-product policies,
  identities and product rows after fixture rollback; a pre-migration order and
  its saved items remain byte-for-byte equivalent. No recursive RLS errors.
- Existing catalog/atomic SQL baselines and native order concurrency regressions
  pass, including price/archive races, actor-status changes and duplicate keys.

The unchanged 7A native history/security/concurrency suite, all nineteen existing
JavaScript unit tests and `npm.cmd run build` also pass. Two initial harness runs
exposed test transaction cleanup/savepoint issues; those were corrected, and
the final complete run passes. No migration change was needed.

```powershell
# Reuse the optional ignored PostgreSQL tools documented in order-submission.md.
node supabase/verification/test_admin_products_local.mjs
node supabase/verification/test_order_read_access_local.mjs
node --test tests/draft.test.js tests/submission.test.js tests/history.test.js tests/session.test.js
npm.cmd run build
```

## Actual hosted deployment and verification

Reconfirmed the exact healthy project, approved hash, sole pending migration
and unchanged product/security baseline, then applied **only** version
`20261121000600`, excluding seeds, roles and Vault changes. All six local/remote
versions match; stored statements match the reviewed SQL. The final dry-run
has no pending migration. Verified three new policies, exact editable-column
grants, enabled RLS, unchanged dealer policy and no DELETE/TRUNCATE privilege.
All original migration records, functions and unrelated policies/grants remain
unchanged.

The [hosted runner](verification/test_admin_products_live.mjs) and
[public API checks](verification/admin_product_live_checks.mjs) passed:

- Existing permanent demo admin and three controlled dealers logged in through
  public Supabase Auth. Admin SELECT includes archived products; INSERT, UPDATE,
  archive, defaults, required fields, SKU conflicts, price checks and immutable
  ID/timestamp protection pass through PostgREST.
- Three dealers and anonymous callers cannot insert, edit, archive, reactivate
  or delete products. Admin DELETE is denied on both active and archived rows.
  Dealer catalogs retain ten active products and hide archived UUIDs/filters.
- Temporarily archived/renamed/repriced one referenced synthetic demo SKU through
  the admin session: saved dealer history and snapshots stayed unchanged; the
  original product was restored in `finally`. Real GET-only regressions also
  passed three dealers' own/cross-organization order/item UUIDs, admin-wide order
  denial and anonymous denial. No new orders were needed.
- The same issued JWTs immediately lost product access/writes for an inactive
  dealer profile, inactive dealer organization and inactive admin profile. All
  activation values were restored and access recovered, without role changes.
- Final exact comparison preserves all eleven original Auth identities, roles,
  profiles/organizations, twelve original products, eight orders/fourteen items,
  saved snapshots and deployed security/history. One new synthetic product,
  `PDP-TEST-8A-ADMIN`, remains **archived** as required by the no-hard-delete rule.
  Final catalog: thirteen products, ten active/three inactive. The private
  manifest makes reruns reuse that product instead of inserting duplicates.

The first hosted history assertion exposed JSON-key-dependent test sorting;
stable row-ID sorting fixed the harness. Cleanup restored the original product,
and the rerun passed without a second fixture. No migration fix was required.
After deployment, native 8A/7A SQL/security/concurrency regressions, all nineteen
unit tests, three real-account catalog/draft/mobile browser regressions and the
production build pass. No privileged credentials or session
tokens are logged/committed. Local evidence stays in ignored `.verification/`.

```powershell
# Opt-in: reuses existing controlled credentials and recorded product fixture.
# Temporarily changes bounded synthetic activation/product state, then restores.
$env:SUPABASE_HOME = Join-Path (Get-Location) '.verification/supabase-home'
$env:PDP_ADMIN_PRODUCTS_LIVE = '1'
node supabase/verification/test_admin_products_live.mjs
```

No database acceptance checks remain pending for 8A. Auth settings, frontend,
dealer management, order processing and Storage are unchanged. Frontend 8B and
later milestones remain deferred; unrelated `.gitignore`/MCP edits are excluded
from the 8A commit.
