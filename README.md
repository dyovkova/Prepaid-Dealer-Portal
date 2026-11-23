# Prepaid Dealer Portal

A working B2B portal for synthetic prepaid telecom dealer order requests, built for
SoftUni **Software Technologies with AI**. Dealers select products, submit requests
and follow their organization's orders. Administrators manage products, dealer access,
order statuses and private PDF documents. No real transactions or company data are used.

- **Application:** [prepaiddealersportal.netlify.app](https://prepaiddealersportal.netlify.app)
- **Repository:** [dyovkova/Prepaid-Dealer-Portal](https://github.com/dyovkova/Prepaid-Dealer-Portal)
- **Demonstration:** [five-minute walkthrough](DEMO.md)
- **Release evidence and limits:** [final release review](docs/release-review.md)

## Stack and architecture

HTML, CSS, vanilla JavaScript ES modules, Bootstrap 5, Node.js/npm and Vite. This is
a multi-page application with eleven independent HTML entries and normal document
navigation, not an SPA. Supabase supplies PostgreSQL, Auth, RLS, private Storage and
two authenticated Edge Functions. GitHub `main` feeds the existing Netlify deployment.

Page controllers live in `src/pages/`; shared layout is in `src/components/`;
`src/services/` contains one reusable Supabase client and data services. Focused modules
handle Auth, drafts, submissions, saved order views, admin forms and document recovery.
Shared design tokens and Bootstrap overrides live in `src/styles/`. SQL migrations,
backend verification and Edge sources live in `supabase/`.

## Completed workflows

**Dealer:** public registration creates one isolated organization, profile and fixed
dealer role. Login/logout, refresh persistence and account-status guards use database
identity. Active dealers can search active products, select positive whole quantities,
and review a per-user local draft with EUR estimates. Confirmed additions show an
accessible toast and persistent card indicators; repeated additions update one line.
Draft items/prices are revalidated on load. Atomic submission derives ownership, status
and prices on the server and saves immutable SKU/name/price snapshots. Exact request
IDs/payloads survive uncertain responses for safe retries. Dealers read only their
organization's history, UUID details and published PDFs.

**Administrator:** the existing **Demo Administrator** can create/edit/archive or
reactivate products, create/rename/activate organizations, inspect authorized profiles
and activate/deactivate dealer profiles through the dedicated RPC. Organization creation
does not create a user account. Admins search/filter/page all orders, inspect saved
items and confirm status transitions: submitted → processing/rejected, then processing
→ completed/rejected. Terminal orders are read-only; HTTP 409 conflicts reload current
state without automatic mutation retries. Roles, membership, ownership and snapshots
are not editable through administration.

### Private PDFs

Admins upload PDFs up to **10 MiB** to a private bucket, then publish through
`publish-order-document`, which verifies identity/access and validates the bytes.
Immutable UUID/path/filename/fingerprint recovery prevents overwrite or duplicate
publication after uncertainty. Dealers cannot upload, edit or delete documents.

Downloads use **only `download-order-document`**, which checks current user/role,
activation and order access on each request and returns attachment bytes with no-store
headers. The browser receives no signed/public Storage URL or server secret. Never
clear unresolved document/order requests or replace their IDs to work around an error.

## All eleven routes

| Route | Access and purpose |
| --- | --- |
| `/` | Public introduction and workspace links |
| `/login/` | Public login; active sessions redirect to their role's workspace |
| `/register/` | Public dealer registration; no public admin signup |
| `/catalog/` | Active dealer: products, search, quantities, draft feedback |
| `/new-order/` | Active dealer: draft, estimates, note and safe submission/retry |
| `/my-orders/` | Active dealer: organization history |
| `/order-details/?id=<order-UUID>` | Active dealer: authorized snapshots and PDFs |
| `/admin/` | Active administrator: dashboard |
| `/admin/products/` | Active administrator: all products and archive/reactivation |
| `/admin/dealers/` | Active administrator: organizations and dealer-profile activation |
| `/admin/orders/` | Active administrator: order search/filter/pagination; `?id=<order-UUID>` opens details/PDFs |

Direct navigation and refresh use the same guards. Missing/malformed/unauthorized
order IDs show safe unavailable states. RLS and trusted operations enforce authorization
independently of navigation; the browser's public key is not a security boundary.

## Local setup

Use Node.js **22.12+ within 22.x, or 24+**, with npm. From a clean checkout:

```sh
git clone https://github.com/dyovkova/Prepaid-Dealer-Portal.git
cd Prepaid-Dealer-Portal
npm ci
```

Copy `.env.example` to ignored `.env.local`, then supply these public build variables:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-public-publishable-key
```

The demo backend is **PrepaidDealerPortal**, reference `niabpabsvdgxackjjcsb`.
Obtain its public publishable key from the project owner/Supabase configuration.
Never put secret/service-role keys, passwords or session tokens in `VITE_` variables.
Restart Vite after changing the file. No browser environment variable provisions an
administrator or changes RLS. See [backend setup](supabase/README.md) for the deployed
migrations/functions and server-only configuration.

```sh
npm run dev
```

Open the Local URL printed by Vite, normally `http://127.0.0.1:5173/`.
On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

## Commands and verification

| Command | Purpose |
| --- | --- |
| `npm ci` | Install exactly the committed lockfile |
| `npm run dev` | Local Vite development server |
| `npm run build` | Production build of all eleven entries into `dist/` |
| `npm run preview` | Serve `dist/` on `127.0.0.1:4173`, failing if occupied |
| `npm run check:preview` | Check all routes, linked assets, detail URLs and unknown-route 404; run with preview in another terminal |
| `npm test` | Full application/Edge unit suite, no hosted writes |
| `npm run test:documents-browser` | Local Chrome no-store/revocation test with mocked provider |
| `npm run test:catalog-feedback-ui` | Opt-in real-session draft feedback checks with isolated browser storage |
| `npm run test:visual` | Opt-in read-only route/layout and UI-state checks |

Individual unit commands include `test:draft`, `test:submission`, `test:history`,
`test:session`, `test:admin-products`, `test:admin-dealers`, `test:admin-orders`,
`test:documents` and `test:document-ui`. See `package.json` for browser suite commands.
Real-account browser suites require approved local synthetic credentials/fixture ledgers
outside Git. They run sequentially because they share a preview port. Legacy mutation
suites are not a safe blanket release command: some create fixtures or change statuses.
The [release report](docs/release-review.md) distinguishes actual hosted checks,
existing-fixture replays, mocks and disposable local SQL tests.

Native SQL/security runners use optional ignored PostgreSQL/PGlite tooling; they are
not application dependencies. See [verification setup](supabase/README.md#verification).
Never run historical migration-era SQL against the current demo merely to reproduce
a test count. No credentials, private fixtures, PDFs or browser traces belong in Git.

## Netlify deployment

The existing site publishes from this GitHub repository's **`main`** branch. Build
command: **`npm run build`**; publish directory: **`dist`**; repository root is the base.
Set the same two public `VITE_` variables in Netlify's build environment and use a
supported Node version (24 is the verified release environment). Supabase stays a
separate backend; do not place server-only Edge keys in Netlify frontend variables.

Vite explicitly builds all eleven HTML entries. No SPA catch-all redirect is needed
or desired: nested routes must serve their own entry and unknown routes return 404.
After pushing, verify the build/route assets and real login on the live origin. A
public GitHub status list alone is not deployment proof; the release review checks
the actual served artifacts. Backend changes are separate reviewed operations, not
part of a frontend auto-deploy. Do not reapply migrations or seed the populated demo.

## Known limits and security boundaries

- Synthetic SoftUni demo only. No payments, tax/invoices, inventory reservations,
  delivery promises, real telecom integration or real confidential documents.
- **Confirm Email is temporarily disabled** in the approved demo environment.
  Confirmation-enabled delivery, password recovery UI and invitations are not covered.
- Drafts and retry references belong to the browser/project/user. Clearing browser
  storage or moving devices can lose recovery information. Keep unresolved references;
  server-rejected PDFs require operator review, not automatic deletion/replacement.
- The new Edge download path checks current database access and avoids client/CDN
  caching. It cannot recall a PDF already downloaded or erase old browser/CDN copies.
  **Historically warmed direct authenticated Storage URLs/JWTs returned CDN HIT/200
  after deactivation.** Direct reads are now denied at origin, but historical cache
  exposure was not proven globally eliminated or rechecked after natural expiry.
  No absolute immediate global revocation is claimed. The Free project cannot use
  the Pro-only purge API; no purge, billing/Auth change, rotation or deletion workaround
  was performed. See [actual cache evidence](supabase/document-download-revocation.md),
  [Supabase caching behavior](https://supabase.com/docs/guides/storage/cdn/smart-cdn)
  and [purge availability](https://supabase.com/docs/guides/storage/cdn/purge-cdn-cache).
- Current browser submission/upload coordination requires HTTPS/localhost and Web
  Locks. Chrome desktop and 320px/390px viewport emulation are the verified browser
  baseline; physical-device, other-engine and full assistive-technology audits are
  limited as recorded in the release report. Netlify's existing branding badge can
  overlay content while scrolling; its hosting settings were not changed.

## Detailed design and evidence

These reports preserve the results at their recorded milestone dates; historical
counts/default-deny/deferred-feature statements do not describe the completed release.

- [Project brief](docs/project-brief.md), [database design](docs/database-design.md),
  [implementation plan](docs/implementation-plan.md), [backend index](supabase/README.md).
- [Identity/RLS](supabase/identity-access.md), [trusted demo-admin setup](supabase/demo-admin-setup.md),
  [Auth UI](docs/authentication-ui.md), [session-race correction](docs/session-auth-fix.md).
- [Catalog security](supabase/catalog-access.md), [catalog/drafts](docs/catalog-and-draft.md),
  [current draft feedback](docs/catalog-feedback.md).
- [Atomic orders](supabase/order-submission.md), [submission UI](docs/order-submission-ui.md),
  [dealer order RLS](supabase/order-read-access.md), [history/details UI](docs/order-history-ui.md).
- Admin [products backend](supabase/admin-products.md)/[UI](docs/admin-products-ui.md),
  [dealers backend](supabase/admin-dealers.md)/[UI](docs/admin-dealers-ui.md),
  [orders backend](supabase/admin-orders.md)/[UI](docs/admin-orders-ui.md).
- [PDF backend](supabase/document-storage.md), [download/revocation boundary](supabase/document-download-revocation.md),
  [PDF UI](docs/order-documents-ui.md), [visual polish](docs/visual-polish.md).
- [Historical deployment checks](docs/deployment-verification.md),
  [final release review](docs/release-review.md), [demo walkthrough](DEMO.md).
