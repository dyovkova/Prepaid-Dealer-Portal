# Supabase core schema — Milestone 3B

**Applied on 2026-11-20 after explicit user approval.** Verified project:
**PrepaidDealerPortal**, reference `niabpabsvdgxackjjcsb`,
URL `https://niabpabsvdgxackjjcsb.supabase.co`.
The initial `20261120000100_core_schema.sql` was applied for 3B. Catalog and default-deny
checks passed. The user accepted milestone 3B as complete; historical fixture
verification limits remain recorded below.

**Milestone 4A is applied and validated for the SoftUni demo.** Confirm Email is
temporarily disabled by the user; confirmation-enabled delivery was not tested. See the
[identity backend review](identity-access.md) for the new migration, security
contract, successful public signup/login and registered-user security tests, and trusted first
demo-admin procedure. Frontend authentication (4B) and the permanent demo admin
(4C) are complete; see [administrator setup](demo-admin-setup.md).

**Milestone 5A is deployed and verified after explicit approval.** Active dealers
can read the ten active demo products; two inactive products remain hidden.
Anonymous/inactive/admin catalog access and all client product writes remain
blocked. See [catalog migration, seed and hosted test results](catalog-access.md).
The three applied migrations and existing identities are preserved. Frontend
catalog, cart, orders and other milestones remain deferred.

## Applied migration and actual verification (2026-11-20)

Reconfirmed project identity, healthy status, empty public schema, unchanged
approved SQL, and the single pending migration immediately before applying.
The CLI applied it with `--remote=niabpabsvdgxackjjcsb --skip-vault --yes`,
without seed data or custom roles. No later migrations or application features
were introduced.

- Six tables and 32 columns match the approved design, including nullability,
  defaults, and exact `numeric(12,2)` prices.
- All 27 key/check/FK constraints are validated; all seven foreign keys use
  `ON UPDATE RESTRICT ON DELETE RESTRICT`. All eleven indexes are valid/ready.
- RLS is enabled on all six tables; there are zero policies and zero effective
  table privileges for `anon` and `authenticated` (84 privilege checks).
- History contains only version `20261120000100`, name `core_schema`.
  All eighteen normalized stored statements match the local migration.
  Final remote dry-run reports up to date, with no pending migrations.
- [Rollback-only tests](verification/test_core_schema.sql) passed valid synthetic
  organization/product fixtures, boundary prices/defaults, 23 invalid-data
  rejections, 48 CRUD privilege denials, and 48 independent RLS checks after
  temporary grants. A subsequent read-only query confirmed zero rows in all
  six tables and no remaining client grants. No Auth identities were created.
- `npm.cmd run build` passed for all eight HTML entries. Diff/security review
  and Git ignore checks cover CLI credentials, caches, and local evidence.

The remote also has `public.rls_auto_enable()` and its `ensure_rls` event
trigger, with `search_path=pg_catalog`. These were not created by the migration
and were left unchanged. An initial post-test assertion expected no public
functions; inspection identified this existing automatic-RLS helper and resolved
the assertion failure without database changes. Supabase documents this
[event-trigger pattern](https://supabase.com/docs/guides/database/postgres/event-triggers).

Outstanding acceptance tests: a valid Auth-backed profile/role/order/item chain,
creator/request and composite-line uniqueness, historical-reference restrictive
delete/update behavior, and snapshot preservation after catalog edits. These
require supported synthetic Auth fixtures; no direct `auth.users` inserts or
account provisioning were performed during 3B. The user subsequently accepted
3B as complete; this records acceptance without claiming those tests ran.
Milestone 2 visual review remains open. The 4A backend was subsequently approved
and applied; public signup/login and registered-user security checks passed under
the documented demo configuration. Frontend 4B remains deferred.

To rerun database tests after explicit authorization, use the CLI home below:

```powershell
node node_modules/supabase/dist/supabase.js db query --remote=niabpabsvdgxackjjcsb --file supabase/verification/test_core_schema.sql --yes
```

The script must run in full: it rolls back every test fixture, helper and grant.
Use direct `node` invocation for multiline SQL arguments on Windows to preserve
newlines; the `.cmd` wrapper is suitable for the single-line CLI commands below.

## CLI setup and remote preflight (2026-11-20)

Official Supabase CLI `3.2.0` is installed as an npm development dependency and
locked in `package-lock.json`. Node.js `24.17.0` and npm `11.13.0` were used.
The CLI help confirmed `login`, `link`, remote `migration list`, read-only
`db query`, and `db push --dry-run` support. CLI v3 defaults database commands
to local; pin remote checks explicitly to the verified project reference.

From the repository in PowerShell:

```powershell
$env:SUPABASE_HOME = Join-Path (Get-Location) '.verification/supabase-home'
npx.cmd --no-install supabase login
npx.cmd --no-install supabase projects list
npx.cmd --no-install supabase link --project-ref niabpabsvdgxackjjcsb
npx.cmd --no-install supabase migration list --remote=niabpabsvdgxackjjcsb
npx.cmd --no-install supabase db push --remote=niabpabsvdgxackjjcsb --dry-run --skip-vault
```

Complete browser login without copying credentials into source or chat. The CLI
home and local link/cache files are ignored by Git. In Codex, Windows credential
storage required approved execution outside the sandbox; the login itself worked.

Verified remote identity: **PrepaidDealerPortal**, `niabpabsvdgxackjjcsb`,
CLI environment **production**, region `eu-central-1`, PostgreSQL `17.12`
(project metadata version `17.12.0.000`), status `ACTIVE_HEALTHY`.
The checkout is linked to that exact reference.

Catalog queries ran with `db query --read-only` as `supabase_read_only_user`.
At preflight there were no public relations or types, and no
`supabase_migrations.schema_migrations` table. `auth.users`, `anon`, and
`authenticated` exist. Remote migration listing reported no applied versions.
The successful dry-run listed only `20261120000100_core_schema.sql`, with no
roles or seeds to apply. It did not apply SQL or create migration history.
The CLI reported initializing its login role for migration listing/dry-run;
no application schema/data changes, history repairs, or Vault updates were requested.

Static review found no conflicts with the approved six-table schema design or
the inspected remote catalog/history. The SQL file is unchanged. A dry-run
previews pending files; it does not validate migration execution, constraints,
or authorization behavior. Actual subsequent check results are recorded above.
Dependency installation reported zero vulnerabilities; the application build
and `git diff --check` passed. Milestone 3B is not complete; milestone 4 remains deferred.

## Migration for review

[`migrations/20261120000100_core_schema.sql`](migrations/20261120000100_core_schema.sql)
implements the six accepted tables from [the database design](../docs/database-design.md):
keys, restrictive foreign keys, required fields, role/status checks, positive integer
quantities, nonblank names/SKUs, and exact `numeric(12,2)` nonnegative finite prices.
Optional order notes are limited to 2,000 characters. Prices and product identifiers/names
are snapshotted on line items; totals are derived, not stored as client-supplied values.

Referenced organizations, Auth users/profiles, products, orders, and items cannot be
cascade-deleted. Primary/unique indexes cover SKU, order lines, and creator/request
deduplication; secondary indexes cover organization membership/history and product FKs.
RLS is enabled on every table and all table privileges are revoked from `PUBLIC`,
`anon`, and `authenticated` in the same transaction. No policies or client operations exist.
Table owners and privileged service connections can bypass RLS; their access is not
evidence that browser access is allowed.

No signup triggers, role provisioning, order creation/status operations, Storage, or
application changes are included. Cross-table dealer-role membership consistency,
caller-derived ownership/prices, nonempty atomic orders, immutable submitted data,
idempotent request comparison, and status transitions remain the protected operations
specified for later milestones. The initial schema does not implement those operations.

## Apply and verify only after approval

1. Connect Supabase and confirm project name/reference, environment, existing public
   tables, PostgreSQL version, and remote migration history. Stop on unexpected tables
   or history; do not reset, overwrite, or repair it automatically.
2. Present this exact migration and its target for approval. Use the Supabase migration
   mechanism after approval so version `20261120000100` is recorded in history; do not
   paste SQL into the dashboard as the only record or mark an unapplied migration applied.
3. Run [the read-only schema inspection](verification/inspect_core_schema.sql) and compare
   actual columns, defaults, keys/checks, indexes, RLS, policies, and effective privileges
   with the migration. Inspect history and confirm the matching version was recorded.
4. Use synthetic fixtures in a rollback-only test transaction to exercise valid rows,
   invalid role/status/quantity/price/note values, missing/duplicate keys, restrictive
   foreign-key deletes, and preserved snapshots after a catalog price edit. Provision any
   test identity through supported Auth tooling; never insert passwords into `auth.users`.
5. Check denied SELECT/INSERT/UPDATE/DELETE as both `anon` and `authenticated`, including
   attempted role/organization/price/status writes. To verify RLS independently of grants,
   temporarily grant test access inside a rollback-only transaction and confirm no rows
   are readable/writable without policies; roll back those grants and all fixtures.

The Supabase CLI, PostgreSQL client, and Docker were not available on PATH at preparation
time; no connection environment variables or existing local migration history were found.
Use the connected integration or supported local CLI setup; keep credentials outside Git.
These were initial preparation limitations; the CLI preflight above records the
subsequent read-only remote checks. The application/verification record above
documents the later user-approved migration.

Local review: the SQL and approved design were compared statically. An optional `pglast`
parser was downloaded only into ignored `.verification/` tooling, but Windows Application
Control blocked its DLL; parser validation did not run. No database was contacted
during that initial preparation.
