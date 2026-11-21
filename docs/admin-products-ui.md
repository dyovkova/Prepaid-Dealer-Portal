# Milestone 8B: admin product management UI

Target: PrepaidDealerPortal (`niabpabsvdgxackjjcsb`).
Page: `/admin/products/`, linked from `/admin/`. Date: 2026-11-21.

## Behavior

The ninth independent Vite HTML entry uses the existing client and active-admin
page guard. The only guard change registers the new page; Auth initialization,
events, sessions and role derivation are unchanged. Supabase's deployed 8A RLS
remains authoritative for every product request.

- Cards show all products, including inactive ones, with SKU/name/description,
  EUR unit price and status. Search and active/inactive filters work together.
  Reads use 200-row batches so the default API response limit cannot silently
  truncate the list.
- Create/edit validates nonblank SKU/name and nonnegative prices within the
  existing database range, with at most two decimals. Case-sensitive SKU conflicts
  receive a field-specific message. New products start active; the form sends
  only SKU, name, description and price, with no ID/timestamp/role fields.
- Archive/reactivate requires a confirmation dialog. No DELETE operation is
  implemented. Saved orders retain their original snapshots.
- Loading, empty/no-match, retry, saving, success, validation and access errors
  are explicit. Duplicate submissions are blocked while saving. An uncertain
  write keeps editor values and requires reloading before another attempt;
  empty UPDATE results cannot be reported as success.
- Product text is rendered as text, not HTML. Cards, form and dialogs adapt to
  narrow screens. The controller, editor, rendering/model and data service are
  separate small modules.

## Actual production-preview validation

Four real-account browser tests pass against the production build and hosted
Supabase, using existing controlled accounts:

1. Actual UI creation/edit, duplicate SKU error, input validation, single-request
   duplicate-submit protection, search/status filters, archive cancellation,
   archive/reactivation, refresh and 320/390-pixel layouts/dialogs.
2. Controlled loading/API-error/empty/retry, 201-row pagination, safe rendering
   of HTML-like product text, aborted-write feedback and zero-row UPDATE denial.
3. Anonymous/dealer direct URLs and refresh, real dealer Data API INSERT/PATCH/
   DELETE denial, and inactive-admin UI feedback. Inactive UI state uses a
   browser-only profile response stub; no Auth/profile settings were modified.
   Actual inactive RLS enforcement was verified in unchanged 8A.
4. UI rename/reprice/archive of a referenced synthetic demo product, real dealer
   saved history/UUID snapshots during archival, then restoration of the exact
   original product. Cleanup also runs after failed tests.

All 22 unit tests, the unchanged native 8A SQL/security/concurrency suite and
nine-route/24-link production-preview checks pass. Desktop/mobile screenshots
were visually inspected. Sixteen existing browser regressions pass: catalog/
draft (3), history/details (4), session races/guards (6), and exact retained-order
request replays (3). The registration fixture case was intentionally skipped;
no users/orders were created. Total: twenty passing preview browser cases.

An initial network-test interceptor omitted the mutation query string and
created `PDP-TEST-8B-NETWORK`. It was archived and recorded. The interceptor now
matches the full URL and an independent whitelist blocks unexpected inserts.
A second mock correction used the installed SDK's actual `200 []` empty-row
protocol. The final complete four-test run passes. Both synthetic products,
`PDP-TEST-8B-UI` and `PDP-TEST-8B-NETWORK`, remain archived and are reused/preserved
on reruns; no hard deletion was used.

Read-only exact comparison preserves all eleven pre-existing identities,
profiles/roles/organizations, thirteen original products, eight orders/fourteen
items, six migrations and security definitions. Final catalog: fifteen products,
ten active/five inactive. No users or orders were created. Local credentials,
tokens, browser reports and screenshots remain ignored and uncommitted.

```powershell
npm.cmd run test:admin-products
npm.cmd run build
# Existing controlled fixture files and public configuration are required.
$env:PDP_ADMIN_PRODUCTS_UI = '1'
npm.cmd run test:admin-products-ui
# After publication, run the same cases against Netlify, reusing the fixture:
$env:PDP_ADMIN_PRODUCTS_NETLIFY = '1'
npm.cmd run test:admin-products-ui
```

## Deployment and limits

Netlify publication/live checks are pending the verified commit/push. The live
run will reuse the recorded product; unique creation was tested through the
production-preview UI against the same hosted backend.

Unsaved editor fields are not persisted across document refresh/navigation.
Concurrent admin edits use the database's existing last-write behavior; reload
before editing stale data. There is no hard-delete UI, database migration, Auth
change, dealer management, order processing or Storage functionality in 8B.
