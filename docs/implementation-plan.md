# Prepaid Dealer Portal: implementation plan

Implement one requested milestone at a time. Each milestone ends with its acceptance checks, a diff/security review, and a brief record of actual results. Commit only when requested, after checks pass. Dependencies listed below refer to earlier milestones.

## 1. Repository foundation: complete

Scope: initialize Git if absent; create `AGENTS.md`, `.github/copilot-instructions.md`, `docs/project-brief.md`, and this plan. Define MVP scope and explicit exclusions.

Acceptance: Git recognizes the repository; all four Markdown documents exist and agree on stack, scope, and workflow; no application files, dependencies, credentials, database resources, or features are introduced. Completion does not imply a Git commit was created.

## 2. Multi-page scaffold and local tooling: implemented; visual acceptance pending

Depends on: 1.

Scope: add npm/Vite configuration, Bootstrap, a minimal shared stylesheet and ES module structure, and eight separate HTML entry pages: Home (`/`), Login (`/login/`), Register (`/register/`), Product Catalog (`/catalog/`), New Order / review (`/new-order/`), My Orders (`/my-orders/`), Order Details (`/order-details/`), and Admin Dashboard (`/admin/`). Add shared navigation and footer, clearly labelled placeholders, `.gitignore`, an environment example with placeholders, and README setup instructions. No authentication or business logic yet.

Scope clarification: the current Milestone 2 request explicitly selects these eight routes. Separate admin product, dealer, and order management pages are deferred to milestones 8, 9, and 10 respectively; the dashboard contains placeholders only.

Acceptance: fresh dependency installation and production build succeed; all planned HTML entries are emitted and directly loadable; navigation and basic mobile/desktop layout work. Local secrets, dependencies, and build output are ignored by Git.

Verification record (2026-11-19):

- Node.js `24.17.0`, npm `11.13.0`; fresh `npm.cmd install` succeeded with Bootstrap `5.3.9` and Vite `8.3.8`. npm reported zero vulnerabilities. PowerShell blocks the `npm.ps1` launcher, so commands used `npm.cmd`; initial sandbox registry access was denied and installation succeeded after network approval.
- `npm.cmd run build` passed and emitted all eight expected HTML entries with shared bundled CSS/JavaScript and the favicon.
- `npm.cmd run preview` served the production build on `http://127.0.0.1:4173/`. `npm.cmd run check:preview` passed all eight routes, compared each response with its own emitted file, checked 18 linked routes/assets and their types, checked the order-details query URL, and confirmed an unknown route returns HTTP 404.
- Git ignore checks confirmed local `.env`, `.env.local`, `.env.production`, `node_modules/`, and `dist/` are ignored; `.env.example` remains trackable. Source/diff review found no credentials or backend/business implementation.
- Visual browser verification was attempted but not completed: the browser access host was unavailable, the first Chrome window was minimized, and computer use then stopped because it could not reliably identify the current browser URL. Mobile/desktop visual layout, interactive navigation, and keyboard walkthrough remain unverified. Do not mark this milestone fully complete until that acceptance review passes. No later milestone was started.

## 3. Database schema and synthetic seeds

Depends on: 2.

### 3A. Schema and access design: complete

Scope: finalize the accepted [database design](database-design.md) and reconcile it with [the project brief](project-brief.md) and this plan. The six core tables are `dealers`, `profiles`, `user_roles`, `products`, `orders`, and `order_items`. Organization membership determines order visibility; each signup provisions an isolated organization and fixed dealer role. `order_documents` and Supabase Storage belong to milestone 11.

Acceptance: the three documents agree on the accepted schema, relationships, RLS/permissions, protected atomic order submission, staged migrations, security risks, and unchanged exclusions; documentation validation and diff/security review pass. This milestone creates no SQL files, database resources, dependencies, or application features. Milestone 2's pending visual acceptance remains open.

Verification (2026-11-20): the user accepted the six-table baseline; the brief, design, plan, and repository milestone boundaries are reconciled. Core table sets, local links/anchors, whitespace, unchanged exclusions, stale wording, credential patterns, and documentation-only change scope were checked; diff/security review passed. No migrations, database tests, or application builds were run for this documentation milestone. Database implementation remains unstarted.

### 3B. Core schema: deployed; accepted complete by the user

Depends on: 2 acceptance and 3A. The user explicitly approved applying the prepared migration on 2026-11-20; milestone 2's visual acceptance remains open.

Scope: prepare and review a versioned migration for the six accepted core tables (`dealers`, `profiles`, `user_roles`, `products`, `orders`, `order_items`) with relationships, validation constraints, restrictive foreign keys, and appropriate indexes. Use exact numeric prices. Enable RLS and revoke client access in the same transaction; introduce policies/operations only in later milestones. The current request is schema-only: use synthetic fixtures for verification, without permanent seed data, signup provisioning, or application features. Do not create `order_documents` or configure Storage here.

Acceptance: verify the target project and remote migration history; obtain explicit user approval before applying. After approval, verify the applied migration against actual columns, constraints, indexes, default-deny RLS/client privileges, and migration history. Exercise valid/invalid synthetic data, historical-reference preservation, and denied access for both `anon` and `authenticated`. Keep all credentials outside frontend code and Git. Mark complete only after actual database verification passes.

Preparation record (2026-11-20): [initial migration](../supabase/migrations/20261120000100_core_schema.sql), [read-only inspection SQL](../supabase/verification/inspect_core_schema.sql), and [review/setup notes](../supabase/README.md) were prepared. The user selected **PrepaidDealerPortal** (`niabpabsvdgxackjjcsb`); its connection, existing schema, and remote history were unverified at preparation time. No local CLI/project link or connection environment was found then. Application and subsequent verification are recorded below.

Local preparation review: static SQL/design consistency, keys/checks/indexes, six RLS statements and client privilege revocation, read-only inspection queries, local links, ignore rules, credential patterns, and `git diff --check` passed. Windows Application Control blocked the optional PostgreSQL parser DLL, so parser validation did not run. No SQL was executed against any database during that preparation; no commit or push was requested then.

Subsequent CLI preflight (2026-11-20): installed official Supabase CLI `3.2.0` as a local development dependency; npm reported zero vulnerabilities and the application build passed. After browser authentication, verified and linked **PrepaidDealerPortal** (`niabpabsvdgxackjjcsb`), CLI environment **production**, region `eu-central-1`, PostgreSQL `17.12`, status `ACTIVE_HEALTHY`. Read-only catalog queries found no public relations/types or migration history table; required Auth table and client roles exist. Remote migration listing showed no applied versions. `db push --remote=niabpabsvdgxackjjcsb --dry-run --skip-vault` succeeded and listed only `20261120000100_core_schema.sql`, with no roles or seeds. No schema/history conflicts were identified; static SQL review agrees with the approved design. The migration file remains unchanged, and no migrations, seeds, history repairs, or Vault updates were applied. CLI login-role initialization was reported during migration inspection. Dry-run does not execute or validate the migration SQL; runtime schema/constraint/access checks remain pending explicit application approval. Milestone 2 visual acceptance remains open; milestone 4 was not started. See [CLI setup and evidence](../supabase/README.md#cli-setup-and-remote-preflight-2026-11-20).

Application and verification (2026-11-20, explicit user approval):

- Reconfirmed the exact healthy project, empty public schema, and sole pending migration. The reviewed SQL file retained SHA-256 `e6ba856b1422b95dbcd23b417047ee618ae8f2298e1cd8618fc0bfb2d66053a5`; no unexpected destructive or unrelated operations were found.
- Applied only `20261120000100_core_schema.sql` with `--skip-vault`, without roles or seeds. Verified six tables, 32 columns, 27 key/check/FK constraints (seven restrictive FKs), and eleven valid indexes against the approved design. All six tables have RLS enabled, zero policies, and zero effective table privileges for `anon`/`authenticated`.
- Remote history contains exactly `20261120000100` / `core_schema`; all eighteen normalized SQL statements match the local migration. Final dry-run reports up to date with no pending migrations.
- [Rollback-only database tests](../supabase/verification/test_core_schema.sql) passed: valid organization/product boundary fixtures and defaults; 23 invalid-data rejections; 48 direct CRUD permission denials; 48 independent RLS checks after transaction-local grants. Confirmed all six tables contain zero rows and client grants remain absent after rollback.
- Inspected an existing `public.rls_auto_enable()` event-trigger function (`ensure_rls`, pinned `search_path=pg_catalog`); it is outside the migration and was left unchanged. An initial post-test guard incorrectly assumed zero public functions; inspection resolved that guard failure without changing the database.
- `npm.cmd run build` passed for all eight entries. Staged scope/credential review passed for thirteen files; all 25 local documentation links resolved, and `git diff --cached --check` passed. MCP connection configuration and its unrelated local ignore change remain outside the commit.

Historical verification limits: successful Auth-backed profile/role/order/item fixtures, creator/request and composite-line duplicate tests, historical-reference delete/update rejection, and snapshot preservation after catalog edits were not run during 3B. No Auth identities were created or existing user data used. The user subsequently accepted milestone 3B as complete and authorized 4A; this records acceptance without claiming the omitted tests ran. Milestone 2 visual acceptance remains open.

## 4. Registration, authentication, and profile authorization

### 4A. Authentication backend and role security: complete for the approved demo configuration

Depends on: deployed 3B. The user approved applying only the reviewed 4A migration, live tests, and commit/push if all applicable checks pass.

Scope: [versioned identity migration](../supabase/migrations/20261120000200_identity_and_access.sql) with atomic Auth-insert provisioning of a new isolated dealer organization, Auth-linked profile, and fixed dealer role. Add private caller-bound actor helpers, own profile/role reads (including inactive account diagnostics), active-own-organization reads, and active users' own display-name updates through a column grant. Document trusted first-demo-admin provisioning. No table redesign/backfill, public promotion RPC, business-table access, frontend Auth, Storage, or milestone 4B.

Acceptance after approval: verify normal supported Supabase Auth signup and the three linked records; reject metadata self-promotion/organization joining, unauthorized membership/activation/role edits and cross-account reads/writes. Inactive/missing-role users retain only diagnostic identity reads. Test policy joins for recursion, private function grants, confirmation/session behavior, and catalog/order default-deny. Verify the applied migration/history and preserve all prior data.

Preparation/verification (2026-11-20): remote CLI reconfirmed **PrepaidDealerPortal** (`niabpabsvdgxackjjcsb`), healthy production target in `eu-central-1`, PostgreSQL `17.12`; only core version `20261120000100` is applied. Identity tables are empty; no Auth triggers/private schema/identity policies exist. Read-only config preview found no API differences from default exposed schemas `public`/`graphql_public`. Migration dry-run lists only `20261120000200_identity_and_access.sql`, without seeds, roles or Vault changes.

Local validation: PGlite `0.5.17` / PostgreSQL `18.7` applied both migrations in memory and passed the [rollback SQL suite](../supabase/verification/test_identity_access.sql), eight invalid-name metadata cases, fallback names, ignored metadata edits, injected late provisioning-failure atomicity, and the documented trusted-admin transaction/guards. Tests cover actor isolation, own-name updates, column protection, inactive profile/organization/admin with unchanged claims, missing role/subject, admin self-promotion denial, policy joins without recursion, private privileges, and business-table denial. The [harness](../supabase/verification/test_identity_access_local.mjs) uses a minimal Auth event stub only: no passwords, real Auth identities or remote writes. Initial test-script CASE syntax was corrected; final tests and `npm.cmd run build` passed. [Setup, review and trusted admin procedure](../supabase/identity-access.md) document behavior and remaining validation.

Deployment/verification (2026-11-20): reconfirmed the exact healthy production project, unchanged complete core schema/data baseline, reviewed SQL hash and sole pending migration, then applied only `20261120000200_identity_and_access.sql` with Vault/roles/seeds excluded. Both history SQL records and all three deployed function bodies match local source. Verified trigger, private function ownership/empty search paths/execute grants, private schema permissions, four identity RLS policies, three identity SELECT grants and profile display-name-only UPDATE. Real HTTP requests denied all three helper functions in private (`406/PGRST106`) and public (`404/PGRST202`), plus all six anonymous table reads (`401/42501`). Hosted PostgreSQL 17 rollback checks passed 21 forbidden statements and non-recursive joined identity queries for an unprovisioned subject; these are not registered-user tests. Build and local fixture simulation passed. Final dry-run reports no pending migrations.

Initial live-test limitation (resolved): reserved `.invalid`/`example.com` addresses were rejected before account creation. Automatic approval review rejected the privileged Admin API fixture alternative; it did not run. The user then temporarily disabled Confirm Email for the SoftUni demo and supplied two controlled test addresses. No Auth configuration changes were made by the assistant, and no Admin API was used. The SQL fixture suite accepts transaction-local test-email settings instead of relying on `.invalid` simulation defaults.

Final live validation (2026-11-20): both public Auth signups returned real users/sessions; separate password logins and authenticated user lookup passed. Each account has exactly one isolated active organization, profile and fixed dealer role. B's forged role/organization/activation/identity metadata was ignored. Actual JWTs enforced own-row reads, cross-account read/update denial, protected role/membership/activation fields, allowed own display-name edits, non-recursive joined RLS, and catalog/order CRUD denial. The hosted SQL rollback fixture suite also passed, including inactive admin and missing-role/subject checks. Profile and organization deactivation separately denied organization access and profile edits with the same previously issued JWT; own diagnostic profile/role reads remained. All fixture names, activation and roles were restored. Authenticated private helper RPCs were unexposed. Final counts are two active dealer Auth users/organizations/profiles/roles, zero admins and zero business rows; history remains exactly the two unchanged migrations with no pending files. `npm.cmd run build`, local SQL regression and JavaScript syntax checks passed. The live runner's initial CLI argument issue was fixed using `--`; resumed checks passed without duplicate registrations.

All applicable 4A checks pass for this demo configuration. Email confirmation is temporarily disabled by the user; email delivery and the confirmation-enabled flow are untested and must be verified if that setting is enabled later. Two active synthetic fixtures are retained for the demo; generated passwords stay only in ignored local verification state and tokens are not logged. Existing data and uncommitted MCP/configuration edits are preserved. The requested 4A commit/push follows final diff/security review. No frontend authentication or 4B work. See [final demo evidence](../supabase/identity-access.md#final-demo-validation-2026-11-20).

### 4B. Frontend authentication: not started

Depends on: accepted 4A.

Scope: Supabase frontend configuration, register/login/logout UI, session handling and shared page guards. Handle confirmation, invalid credentials and inactive-account feedback using 4A's identity access. No new business operations.

Acceptance: a synthetic dealer can register, confirm, log in, refresh and log out through the multi-page frontend; guards and clear feedback reflect session/account status. Browser code contains only public configuration. This milestone is deferred and not authorized by the current request.

## 5. Dealer catalog and draft order

Depends on: 4.

Scope: add active-product read policies and catalog rendering; select positive whole-number quantities and retain a local draft for the order-review page. Scope/clear draft state across users and logout. Include validation and loading/empty/error states.

Acceptance: synthetic catalog data displays correctly; inactive products are excluded for dealers; draft quantities and preview totals behave correctly; anonymous/inactive access is denied. A draft has no database order or reserved stock.

## 6. Atomic order submission

Depends on: 5.

Scope: add protected database-side order creation and review/submit behavior. Validate the authenticated dealer role and active profile/organization; derive creator, organization, and submitted status on the database side. Validate active products, quantities, and current database prices; save order/items and price/SKU/name snapshots atomically. Keep direct client order/item writes denied. Define behavior for concurrent price/availability/activation changes and prevent duplicate orders from repeated submission of the same request.

Acceptance: a multi-item request saves as `submitted` for the caller's organization; invalid/inactive products, invalid quantities, and inactive callers leave no partial order. Forged creator/organization/status/price/total and direct client writes are ineffective. Repeated submission creates one order; reuse of a request ID with different contents fails. Success clears the draft; saved-order navigation/read access is completed in milestone 7.

## 7. Dealer order history and details

Depends on: 6.

Scope: add organization-based order/item read policies, dealer organization order history, and order details with saved snapshots, quantities, derived totals, and status. Documents remain a placeholder until milestone 11.

Acceptance: two synthetic users in organization A can read each other's organization orders/items; a user in organization B cannot, including through direct API calls, joins, and changed URL IDs. Profiles remain individually private except to admins. Product changes do not alter historical snapshots/totals; empty/error states work; dealers cannot change submitted orders or status.

## 8. Admin product management

Depends on: 7.

Scope: implement the admin overview/navigation shell and product create/edit/archive operations with admin-only policies and validation. Retain referenced products and their historical relationships.

Acceptance: an admin manages a synthetic product; a dealer cannot perform the same writes through the API; archived products disappear from the dealer catalog while existing orders remain readable.

## 9. Admin dealer management

Depends on: 8.

Scope: manage dealer organization names/activation and inspect profiles; activate/deactivate individual profiles through narrowly authorized operations. Keep role changes, membership reassignment, and Supabase Auth account administration outside this UI.

Acceptance: an admin can create/edit a synthetic organization and deactivate/reactivate organizations and profiles; dealer users cannot change roles, membership, or activation. Profile deactivation blocks that user; organization deactivation blocks all its dealer users, including existing sessions. Reactivation restores otherwise permitted access. Existing orders remain intact.

## 10. Admin order processing

Depends on: 9.

Scope: implement admin order list/details and permitted status transitions from the brief. Enforce transitions in the database and show current status in dealer views.

Acceptance: an admin can process orders across dealers; permitted transitions succeed and invalid transitions fail through the API as well as the UI. Dealers cannot update status. Terminal orders cannot be reopened.

## 11. Private order documents

Depends on: 10.

Scope: add `order_documents` in a versioned migration with order/uploading-admin references, private object path, and file metadata. Enable RLS; configure a private Supabase Storage bucket and version its policies. Implement admin PDF upload, metadata persistence, document listing, and downloads authorized against the order's organization. Choose/document file size limits, validate types, use unique object paths, and handle partial upload/metadata failures without exposing orphaned files.

Acceptance: an admin uploads a synthetic PDF; active users in the order's active organization can download it. Anonymous users, inactive profiles/organizations, and users from another organization cannot access the file/metadata or obtain a download link; dealers cannot upload. Invalid files are rejected; simulated failure cleanup works. Document short-lived link expiry behavior.

## 12. Responsive and accessibility review

Depends on: 11.

Scope: review all implemented screens on phone and desktop widths; refine keyboard navigation, labels, focus, readable validation, and loading/empty/error feedback. Fix issues within the MVP only.

Acceptance: primary dealer/admin workflows work at both viewport sizes without horizontal overflow; forms and navigation work by keyboard; no unresolved console errors occur in the walkthrough.

## 13. Capstone documentation and release

Depends on: 12.

Scope: finalize README and setup/security/demo documentation, SQL migration and seed instructions, trusted admin provisioning, Netlify multi-page build configuration, and deployment environment guidance. Prepare and review the public repository and live deployment; publish only when requested. Use synthetic accounts and files for the walkthrough.

Acceptance: a clean checkout can install/build and reproduce database setup from documentation; all pages load directly on Netlify; deployed Auth redirect URLs and private Storage access work. Review tracked files/history for secrets before public release. Record actual public GitHub and live Netlify URLs after publication, then run the dealer/admin walkthrough and denied-access checks against the deployment.

## Verification across later milestones

- Use focused manual checks and meaningful automated checks appropriate to each change. Record actual commands and outcomes; do not claim unrun checks passed.
- Verify permissions through Supabase/API behavior, not just hidden controls. Use separate synthetic dealers and an admin for role/ownership scenarios.
- Re-run relevant build checks after application/configuration changes, and review staged changes before any requested commit.
- Document any necessary change in scope or milestone dependencies before implementing it. Keep out-of-scope work out of the MVP.
