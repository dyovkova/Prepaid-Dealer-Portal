# Repository working agreement

## Project and source of truth

Prepaid Dealer Portal is a SoftUni "Software Technologies with AI" capstone. Use [docs/project-brief.md](docs/project-brief.md) for scope and [docs/implementation-plan.md](docs/implementation-plan.md) for milestone order and acceptance checks. The user's current instructions determine the work authorized for this session.

## Before changing files

- Inspect the workspace, relevant files, and `git status`/diff. Read applicable repository instructions.
- Identify the requested milestone and its acceptance criteria. Implement only that milestone.
- Preserve unrelated changes. Do not reset, discard, overwrite, or commit user work unintentionally.
- Resolve routine implementation choices with the simplest maintainable approach. Ask only when missing information materially blocks the requested work.

## Implementation conventions

- Stack: HTML, CSS, vanilla JavaScript ES modules, Bootstrap, Node.js, npm, Vite, Supabase Database/Auth/Storage, Git/GitHub, and Netlify.
- No React, Vue, or TypeScript. Use separate HTML entry pages for the multi-page application, with shared styles and modules.
- Keep page initialization, reusable UI, validation, and data access separate where useful. Avoid monolithic files and speculative abstractions.
- Use semantic HTML, accessible form labels, clear feedback, and responsive layouts.
- Make failure, loading, empty, and success states explicit when implementing a screen.

## Data and security

- Use synthetic demo data only, including files and screenshots. Never expose privileged credentials in source, browser code, logs, documentation, or commits.
- Store local configuration outside version control once configuration is introduced; example files contain placeholders only. A Supabase publishable/anon key is public configuration, not an authorization boundary.
- Enforce ownership, roles, account status, and allowed operations through database RLS, constraints, trusted database functions where needed, and Storage policies.
- Default new accounts to dealer. Never derive admin privileges from editable signup metadata or permit self-promotion.
- Never trust client-provided prices, totals, ownership, or order status. Order creation must validate products and save price snapshots atomically on the database side.
- Keep order documents in a private bucket and authorize upload and download against the associated order.
- Version database changes in SQL migrations. Do not use the dashboard as the only record of schema or policy changes.

## Verification and Git

- Work in small, independently testable milestones. Add meaningful verification appropriate to the change; do not create tests that merely mirror implementation.
- Run available relevant checks and inspect the diff before each commit. Check for secrets and unrelated changes.
- For authorization changes, verify both allowed actions and denied cross-account/role actions. UI checks alone are insufficient.
- Report checks actually performed, failures, and limitations accurately. Never fabricate results or commits.
- Do not commit, push, publish, or deploy unless requested. When a commit is requested, stage only intended files and use a descriptive message.
- Keep setup instructions and the implementation plan aligned with completed work. Mark milestones complete only after their acceptance criteria are met.

## Current boundary

Milestones 3B, 4A, 4B, 4C, 5A, 5B, 6A, 6B, 7A, 7B, 8A, 8B, 9A, 9B, 10A and 10B are complete for the current SoftUni demo configuration on PrepaidDealerPortal (`niabpabsvdgxackjjcsb`). Authentication, dealer catalog/drafts, atomic submission and dealer organization history/UUID details are functional; see `docs/order-history-ui.md`. Historical totals/names use saved snapshots only, never current catalog values. Dealer history/details pages require an active dealer; admin-wide management uses the separate active-admin `/admin/orders/` entry. RLS denies cross-organization, inactive and anonymous order reads and direct client order/item writes. The existing RPC derives ownership/status/prices and enforces creator/request-key idempotency. Preserve exact pending UUIDs/payloads and drafts through errors, refresh and logout; clear matching drafts only after confirmation. View order must not interfere with that recovery contract. Milestone 8A adds database-only active-admin product read/create/edit/archive policies and editable-column grants; see `supabase/admin-products.md`. Dealer product writes and all client hard deletion remain prohibited. Preserve the permanent admin, original dealer fixtures and all eleven existing accounts, nine applied migrations, fourteen current organizations and their current activation values, twelve original products plus the archived `PDP-TEST-8A-ADMIN`, `PDP-TEST-8B-UI` and `PDP-TEST-8B-NETWORK` verification products, eight original orders/fourteen original items plus three 10A synthetic orders/four items and five 10B UI synthetic terminal orders/seven items, later legitimate data and unrelated configuration edits. Do not rerun admin provisioning or delete data without authorization. Storage and unrelated later features remain deferred; do not start them or unrelated features until requested. Draft totals remain estimates. Confirm Email remains temporarily disabled; confirmation-enabled delivery is untested. Commit/push only when requested. Auth settings or privileged Admin API account creation require separate explicit authorization.

Milestone 8B provides the admin-only `/admin/products/` page with search/status filters, create/edit and confirmed archive/reactivation. See `docs/admin-products-ui.md` for actual local and Netlify validation. It reuses the existing client and 8A RLS; Auth flows remain unchanged.

Milestone 9A is deployed and verified; see `supabase/admin-dealers.md`. Active admins can read organizations/profiles/roles, create/edit/deactivate/reactivate organizations, and call `public.set_dealer_profile_active(uuid, boolean)` for dealer profiles only. Role/membership changes, direct profile activation and all hard deletion remain prohibited. Deactivation gates subsequent business requests using existing JWTs; own profile/role diagnostics remain readable. Preserve the retained inactive synthetic organization and all restored fixture statuses. Do not implement Storage or unrelated features until requested.

Milestone 9B provides the admin-only `/admin/dealers/` page: organization search/filter/create/rename/activation, profile/database-role inspection and confirmed dealer-profile activation through the existing RPC only. Production-build and Netlify checks pass; see `docs/admin-dealers-ui.md` for actual results and limitations. No Auth emails, role/membership editing, hard deletion or direct profile activation. Keep organization-wide access and individual profile access clearly separate.

Milestone 10A is deployed and verified: approved 20261122000800 adds admin order/item reads and guarded expected-status transitions; separately approved 20261122000900 changes only the stale code from 40001 to PT409 to prevent PostgREST 14 retries. Real HTTP 409, role/isolation/direct-write restrictions and preservation pass; all nine migrations match with none pending. See `supabase/admin-orders.md` for hashes, actual results, retained fixture UUIDs and native-versus-hosted concurrency limits. Preserve all eight original orders/statuses, three synthetic terminal orders/four items, current profiles/organizations and configuration. Do not start Storage or unrelated features until requested.

Milestone 10B implements the admin-only `/admin/orders/` list and `?id=<UUID>` saved-snapshot details with server filters/pagination and confirmed RPC-only status changes. Production-preview and real Netlify checks pass; all pre-existing orders/statuses and snapshots remain unchanged. See `docs/admin-orders-ui.md`. Never automatically retry a status mutation after PT409 or an uncertain error: reload the order and require a fresh decision. Preserve all pre-existing orders and the ledger-bound 10B synthetic fixtures; no migrations, Auth settings or Storage changes.

Milestone 11A's backend workflow is deployed and verified for the approved Supabase Free demo configuration. Applied 010, 011 and 012 retain their approved hashes; all twelve migration versions/stored bodies match with none pending. Publisher v2 and downloader v1 retain verify_jwt=true. Only Edge downloads are supported for clients: current JWT/profile/role/dealer organization and published-order authorization are checked before/after a server-only byte fetch, with no-store responses. Direct authenticated Storage reads are denied at the origin; list/admin upload probes and metadata RLS remain. Preserve the original published PDF UUID/path/hash and three invalid private pending fixtures, all four complete object rows and one metadata row, original identities/roles/statuses, organizations/products, sixteen orders/twenty-five items and snapshots. Never replace/overwrite/delete automatically after uncertainty. See supabase/document-storage.md and supabase/document-download-revocation.md for actual hosted/browser tests, source hashes and retry behavior. Supabase Free has no Pro CDN purge support; the user prohibits purge attempts, billing/Auth changes, token rotation or file deletion as a workaround. Historical warmed direct URL/JWT responses still return CDN HIT/200; the new Edge path denies the same JWT after profile/organization deactivation. Natural expiry was not rechecked. Do not claim absolute immediate global revocation or mark legacy cache exposure eliminated. No 11B UI or unrelated feature until requested. Commit/push only when requested and exclude unrelated MCP/configuration work.

Milestone 11B is deployed and verified: the existing admin/dealer order-details pages share published PDF lists and checked Edge-only Blob downloads; admin uploads/publication use the shared client and durable immutable user/order-scoped intents. Preserve exact UUID/filename/size/fingerprint and confirmed receipts through refresh, uncertain responses and account changes. Never overwrite/delete or replace unresolved requests automatically; only an explicit next-upload action clears a confirmed local receipt. Metadata/UI omit Storage paths; current session/account checks and generation cancellation guard asynchronous actions. See docs/order-documents-ui.md for actual preview/Netlify verification, two retained UI fixture IDs and limitations. Current totals are six private objects/three published metadata rows: original four 11A files plus one preview and one Netlify PDF on an existing 10A order. All original data/statuses/orders/snapshots and backend definitions remain unchanged. No new HTML entry, dependency, SQL, Edge or Auth changes. Stop after 11B; do not start later milestones until requested. Preserve unrelated MCP/configuration edits and commit/push only when requested.
