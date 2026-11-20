# Milestone 5A: product catalog database access and demo data

Status (2026-11-20): **deployed after explicit approval; applicable hosted and
local checks passed**. Target: **PrepaidDealerPortal**,
`niabpabsvdgxackjjcsb`, CLI environment `production`, region `eu-central-1`.
No frontend catalog, draft-order, order, Storage or additional admin feature is
included. The user authorized a focused commit/push after successful validation.

## Read-only preflight before deployment

- CLI verified the named project is `ACTIVE_HEALTHY`. History matches the two
  existing local migrations, `20261120000100` and `20261120000200`.
- `products` has the approved seven columns: UUID ID, unique SKU, name,
  description, `numeric(12,2)` unit price, active flag and creation timestamp.
  Existing checks reject blank SKU/name and invalid
  prices; its primary-key and SKU unique indexes are present and valid.
- RLS is enabled. There are no product policies or client CRUD grants, and no
  products or `PDP-DEMO-` SKU collisions. Order tables remain empty/default-deny.
- The existing private dealer helper is owned by `postgres`, has an empty
  search path and authenticated-only client execution. It checks `auth.uid()`,
  the database dealer role, active profile and active organization without
  querying products or causing a policy cycle.
- The remote identity/schema/history snapshot matches completed 4C: one admin,
  three dealers and four active profiles/organizations. Existing accounts,
  role assignments and membership are unchanged. No Auth settings were changed.

## Approved and deployed files

| File | Changes | SHA-256 |
| --- | --- | --- |
| [20261120000300_catalog_access.sql](migrations/20261120000300_catalog_access.sql) | One authenticated SELECT policy plus SELECT grant on `products` | `1e2e17170fb435669d23e3b98bb1e33f5733ef45be02911ac66aec4de39f775e` |
| [demo_products.sql](seeds/demo_products.sql) | Separate repeatable seed: 12 fictional prepaid telecom products, 10 active and 2 inactive | `25ec8fabf5c864f1d707fbe2e45f3a0eccf00aab0a7ef850bbd05952f5edba11` |

The migration grants no writes and changes no table, function, index, identity
policy or existing row. Its predicate requires `is_active` and a non-null
`private.current_active_dealer_id()`. Authentication alone does not grant rows;
the existing helper derives current authorization from database state. Inactive
profiles/organizations, admins, missing identities and missing subjects see no
products. Anonymous callers retain permission denial. Admin catalog operations
remain deferred to their own milestone.

All seed SKUs begin `PDP-DEMO-`. Names/descriptions are fictional telecom demo
data and prices use the accepted single currency, EUR. The two legacy products
are inactive for archive-access tests. The seed uses `ON CONFLICT (sku) DO
NOTHING`: repeated execution preserves IDs, timestamps and every existing field,
including later price/status edits. It does not reset products or overwrite any
colliding SKU. Recheck collisions and row contents before an approved import.
The seed is outside migrations and is not automatically included in `db push`.

## Actual hosted deployment and validation (2026-11-20)

- Reconfirmed the healthy named project, both approved SHA-256 hashes, complete
  unchanged preparation snapshot, sole pending catalog migration and zero
  existing products/SKU conflicts. The dry-run listed only the approved file,
  with no seeds or roles.
- Applied only `20261120000300_catalog_access.sql`, with Vault/seed/custom-role
  updates excluded. Then imported only the approved seed through a trusted CLI
  file execution. No Auth settings, account creation or admin provisioning was
  performed.
- Verified all stored migration statements match the reviewed local SQL, the
  sole product policy is the exact authenticated active-dealer SELECT predicate,
  RLS remains enabled, and effective grants permit only authenticated SELECT.
  Anonymous SELECT and all client INSERT/UPDATE/DELETE/TRUNCATE remain denied.
- Verified exactly 12 demo rows, 10 active and 2 inactive. Re-executed the exact
  approved seed and compared every field against the first-import snapshot:
  all UUIDs, timestamps, prices, descriptions, names and activation flags stayed
  unchanged. The same full product snapshot still matched after all tests.
- The [hosted verification runner](verification/test_catalog_access_live.mjs)
  passed the rollback SQL suite on PostgreSQL `17.12`, including active/archived
  reads, inactive profile/organization tests, missing-identity/admin denial,
  22 forbidden statements and full rollback preservation.
- Real public password logins and authenticated user lookups succeeded for all
  three existing dealers and the existing admin. Each dealer's actual JWT read
  exactly the ten active products with the expected IDs, descriptions and EUR
  prices. Explicit inactive filters and both archived UUID lookups returned no
  rows; direct active-product lookup succeeded.
- Every dealer's public Data API product INSERT, price UPDATE, archive
  reactivation and DELETE attempt was permission-denied (`42501`). The admin's
  unfiltered and direct-ID catalog reads returned no rows. Anonymous reads were
  also permission-denied (`42501`).
- Using the same already-issued dealer JWT, separately deactivated one guarded
  synthetic profile and then its organization: catalog reads returned no rows.
  Restoring each status recovered the ten active rows. The runner restores status
  in `finally`; final snapshots confirmed every original profile, organization,
  role and Auth identity record was preserved. No role changes or new accounts
  were used for these tests.
- The deployment comparison confirmed original migration records, private/public
  functions, non-product policies and relation grants stayed unchanged. Existing
  administrator/dealer accounts and membership are preserved; final counts are
  one admin, three dealers, four active profiles/organizations, twelve products
  and zero orders/order items. Both original migration and unrelated configuration
  file hashes remain unchanged.
- Final remote history matches all three local versions, including
  `20261120000300`; dry-run reports up to date with no migrations, seeds or roles
  pending. Local SQL regression, live-runner syntax and the eight-entry application
  build passed. No application source or dependency changed.

One local post-migration checker initially assumed a non-null permissions-view
result. Its empty-result handling was corrected, then verification passed before
seed import. Neither approved SQL file changed.

All applicable 5A checks passed. Local-only evidence is retained under ignored
`.verification/`, including `catalog-live-results.json`, the first-import product
snapshot and deployment preservation snapshots. Passwords, email addresses and
JWTs are excluded from source/reports/commits. Tokens stay in memory.

## Local preparation and regression checks

- Disposable PGlite `0.5.17` / PostgreSQL `18.7` applied all three migrations.
  The [focused SQL suite](verification/test_catalog_access.sql) passed dealer
  unfiltered/direct active-product reads and archived-product exclusion;
  inactive profile and inactive organization denial with unchanged JWT settings;
  restored access; and admin, missing-profile and missing-subject denial even
  with forged dealer metadata. Product reads completed without recursive RLS.
- The suite passed 22 actual permission-denied statements: anonymous reads,
  anonymous/dealer/admin product INSERT, price UPDATE, archive reactivation,
  DELETE and TRUNCATE, plus order/order-item SELECT denial. It asserted the sole
  product policy is SELECT-only for `authenticated`. All test product/status
  changes rolled back; identity and product snapshots matched afterward.
- Seed checks passed exactly 12 unique products (10 active/2 inactive), positive
  prices, exact no-op rerun, preservation of an edited matching SKU and an
  unrelated synthetic product. Identity data remained unchanged. Final product
  grants were SELECT-only for authenticated callers and absent for anonymous.
- `npm.cmd run build` passed all eight HTML entries. No application source or
  dependency was changed.
- Pinned remote `db push --dry-run --skip-vault` passed and listed only
  `20261120000300_catalog_access.sql`; `seeds` and `roles` were empty. Subsequent
  migration listing at preparation still showed this version local-only. No
  migration or seed was executed until the subsequent explicit deployment approval.

The checks in this section are **local PostgreSQL simulation results**; hosted
Data API/JWT results are recorded separately above. The event stub creates synthetic users only in
memory; it does not use Auth Admin API or insert users into the remote project.
Hosted PostgreSQL is `17.12`; dry-run does not execute or validate migration SQL.

Reproduce the optional local checks using the existing ignored PGlite install:

```powershell
node supabase/verification/test_catalog_access_local.mjs
npm.cmd run build
```

If the optional tool is absent, install it separately from app dependencies:

```powershell
npm.cmd install --prefix .verification/identity-sql-tools --no-save --package-lock=false @electric-sql/pglite@0.5.17
```

Read-only remote preview (uses the existing CLI authentication):

```powershell
$env:SUPABASE_HOME = Join-Path (Get-Location) '.verification/supabase-home'
node node_modules/supabase/dist/supabase.js db push --remote=niabpabsvdgxackjjcsb --dry-run --skip-vault
node node_modules/supabase/dist/supabase.js migration list --remote=niabpabsvdgxackjjcsb
```

## Reproducing hosted validation

The live runner uses only public `.env.local` configuration and the four existing
controlled accounts recorded in ignored `.verification/identity-live-state.json`,
`auth-ui-fixture.json` and `demo-admin-candidate.json`. Do not commit those files
or recreate accounts if local state is missing. The runner requires the deployed
5A migration/seed and reuses those users; it never applies migrations/imports
seeds, creates users or promotes roles.

Run only when temporary guarded dealer activation tests are authorized:

```powershell
$env:SUPABASE_HOME = Join-Path (Get-Location) '.verification/supabase-home'
$env:PDP_CATALOG_LIVE_TESTS = '1'
node supabase/verification/test_catalog_access_live.mjs
```

The SQL suite requires verified dealer/admin UUID settings injected after
`BEGIN;`; the runner supplies them in an ignored local copy and verifies rollback.
HTTP inactive-account tests temporarily change only the recorded 4A dealer
fixture's status, restore it in `finally` and compare all account/product/history
records afterward. No privileged Auth Admin API or secret/service-role key is used.

No 5A checks remain pending for the current demo configuration. Catalog frontend,
cart/draft orders, admin catalog management and other milestones remain deferred.

Existing applied migrations and unrelated `.mcp.json`/`.gitignore` edits retain
their recorded hashes. Local evidence and account credentials remain ignored.
Email confirmation remains temporarily disabled by the user; confirmation-
enabled delivery is untested and outside 5A.
