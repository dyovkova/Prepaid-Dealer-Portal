# Supabase backend

Current demo: **PrepaidDealerPortal — `niabpabsvdgxackjjcsb`**. The feature-complete
backend has twelve versioned migrations, the six core business tables plus
`order_documents`, RLS/column grants and two authenticated document Edge Functions.
Use the root [README](../README.md) for frontend setup and the
[final release review](../docs/release-review.md) for current evidence/limits.

## Deployed components

| Migrations | Responsibility |
| --- | --- |
| `20261120000100` | Six-table core schema, constraints/indexes, initial default-deny RLS |
| `20261120000200` | Auth signup provisioning, fixed dealer roles, private identity helpers |
| `20261120000300` | Active dealer reads of active products |
| `20261120000400` | Atomic, server-priced and idempotent `submit_order` |
| `20261121000500` | Organization-isolated dealer order/item reads |
| `20261121000600` | Active-admin product create/edit/archive access |
| `20261121000700` | Admin dealer reads/edits and profile activation RPC |
| `20261122000800`–`20261122000900` | Admin order reads and guarded status RPC; HTTP 409 conflict fix |
| `20261122001000`–`20261122001200` | Private PDF metadata/bucket policies, legacy-read correction and checked download boundary |

Applied files are immutable historical records. Do not edit, reset, seed or reapply
the populated demo during release verification. The seed is synthetic and idempotent;
later archived/edited products are legitimate current data, not seed drift to undo.
No public signup can promote an administrator; the trusted first-admin procedure has
already been executed once and must not be rerun for the existing demo.

## Configuration and inspection

The official Supabase CLI is a locked local development dependency. For the existing
authorized CLI login, inspect only the pinned project:

```powershell
$env:SUPABASE_HOME = Join-Path (Get-Location) '.verification/supabase-home'
npx.cmd --no-install supabase --version
npx.cmd --no-install supabase projects list
npx.cmd --no-install supabase migration list --remote=niabpabsvdgxackjjcsb
```

An approved new environment requires its own Auth/keys/migrations/seed review; do not
copy privileged credentials from the demo. CLI authentication and local verification
state must remain outside version control. Frontend `.env.local` contains only the
public project URL and publishable key.

`publish-order-document` v2 and `download-order-document` v1 retain `verify_jwt = true`.
The server uses Supabase-managed `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEYS` and
`SUPABASE_SECRET_KEYS` (legacy key fallbacks are supported by the existing configuration
module). Secrets stay in the Edge environment only. The publisher validates bytes,
rechecks the verified actor and calls the narrowly granted registration RPC. The
downloader authorizes metadata/order/profile/role/organization, fetches only the checked
private file and returns no-store attachment bytes. Never place these secret variables
in browser/Netlify `VITE_` configuration or expose a signed/public download URL.

## Verification

Application/Edge unit tests: `npm test`. Optional existing local SQL tools can be
installed outside application dependencies, into ignored folders:

```sh
npm install --prefix .verification/identity-sql-tools --no-save @electric-sql/pglite@0.5.17
npm install --prefix .verification/order-sql-tools --no-save embedded-postgres@17.12.0-beta.19
```

On Windows the native PostgreSQL binary must be allowed to run on loopback. The
native runners create disposable synthetic clusters under `.verification/`, bind
`127.0.0.1`, generate their own local password and stop their own cluster. They do not
accept a hosted connection string. PGlite uses only an in-memory Auth event stub;
native Storage tests use a local Storage stub, not the hosted gateway.

```sh
node supabase/verification/test_identity_access_local.mjs
node supabase/verification/test_catalog_access_local.mjs
node supabase/verification/test_atomic_orders_local.mjs
node supabase/verification/test_order_read_access_local.mjs
node supabase/verification/test_admin_products_local.mjs
node supabase/verification/test_admin_dealers_local.mjs
node supabase/verification/test_admin_orders_local.mjs
node supabase/verification/test_document_storage_local.mjs
```

These cover authorization, atomicity, snapshots, idempotency, status transitions,
conflicts/concurrency and all twelve migrations. Hosted mutation scripts are explicitly
opt-in, may create fixtures/change statuses and are not interchangeable with read-only
release checks. Consult each script/report before running it. Current hosted verification
and the distinction between fresh tests, exact existing retries and prior acceptance
are recorded in the release report. Preserve all rows/files and pending references.

## Technical records

[Identity](identity-access.md), [admin provisioning](demo-admin-setup.md),
[catalog](catalog-access.md), [atomic submission](order-submission.md),
[dealer history](order-read-access.md), admin [products](admin-products.md),
[dealers](admin-dealers.md), [orders](admin-orders.md),
[PDF storage](document-storage.md) and [download/cache boundary](document-download-revocation.md).
The [original core/early-milestone record](core-schema-verification.md) is retained
as history, including its then-outstanding checks; it is not current setup guidance.
Confirm Email remains temporarily disabled for this synthetic demo. Historical direct
CDN cache exposure, natural-expiry verification limits and Free-plan purge constraints
remain explicit; no absolute global immediate revocation is claimed.
