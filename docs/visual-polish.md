# Focused visual polish

2026-11-22. Prepaid Dealer Portal, Supabase `niabpabsvdgxackjjcsb`.
This is a presentation-only milestone after 11B, before the final release review.

## Design and scope

The baseline review covered all eleven entries: Home, Login, Register, Catalog,
New Order, My Orders, Order Details, Admin Dashboard, Admin Products, Admin Dealers
and Admin Orders (including its details state). It identified uneven control sizes,
low-contrast input boundaries, heavy session/demo banners, basic status badges,
weak separation of totals/document actions and outdated preview copy.

The shared light theme now uses indigo accents, a quiet canvas, consistent type and
spacing, rounded surfaces and restrained shadows. Page headings, breadcrumbs,
navigation, catalog/draft cards, saved totals, administration, confirmation dialogs
and PDF controls share the same visual language. Statuses retain explicit text,
with softer distinct colors. Mobile PDF downloads have full-width touch targets;
uploads have a separate inset panel. Only stale informational copy and decorative
home-link arrows changed in markup. Navigation destinations and form behavior stay
the same.

CSS is separated into tokens, shared controls, workspace details and page layout.
No dependency, page, business logic, Auth/session code, database, RLS, Edge Function
or Storage workflow changed. Draft/pending-order/PDF recovery code is untouched.

## Preview verification

- Production build and all eleven route checks pass, including thirty linked
  routes/assets, direct dealer/admin detail URLs and unknown-route HTTP 404.
- All **56 existing unit tests** pass. **Five existing session/race browser
  regressions** and **two existing document error/recovery/session regressions** pass.
- Four focused read-only browser cases cover real synthetic dealer/admin logins,
  all eleven entries/direct refresh, catalog search/quantities, a browser-only draft,
  saved order details, admin editors/filters and cancel-only product/order confirmations.
  Existing PDF download, invalid selection, API failure/empty states, invalid order
  links, mobile navigation, keyboard skip link and immutable local PDF recovery are
  checked without creating orders, organizations, products or files.
- Screens are captured at **1440px, 390px and 320px** (51 baseline and 69 updated
  route/state captures, compared visually). There is no horizontal
  overflow; visible Bootstrap buttons have at least 44px height (rounding tolerance
  0.5px). Baselines are in ignored `.verification/visual-before/`; updated screenshots
  and per-case reports are in `.verification/visual-after/`. Screenshots use only
  synthetic data; credentials, verification state and screenshots are not committed.
- Text palette contrast: body/white 15.16:1, muted/canvas 5.61:1, primary button
  6.64:1, status badges 6.04–7.01:1; input boundary/white 3.20:1. Keyboard focus is
  explicit, reduced motion is respected and existing labels/live regions are retained.
  These focused checks are not a complete WCAG conformance audit.
- Browser write guards deny unexpected REST mutations, Storage requests and publisher
  calls. Existing document regressions reuse an already-rejected private PDF; no new
  object or metadata is created. Downloads use the existing checked Edge endpoint.
- Read-only comparison preserves account identities/roles/statuses, organizations,
  products, sixteen orders/twenty-five items/snapshots, all six objects/three published
  metadata rows, migration history, RLS/grants and database functions. Unrelated
  `.gitignore`/MCP configuration remains unchanged and excluded.

Reproduce with `npm run build`, an existing preview for `npm run check:preview`, and
`$env:PDP_VISUAL='after'; npm run test:visual` in PowerShell. Existing controlled
credentials are required in ignored verification fixtures; the suite never creates
accounts. Set `PDP_VISUAL_LIVE=1` to target Netlify. Run browser suites sequentially
because they share the production-preview port.

## Deployment and remaining review

Netlify verification is pending the reviewed feature push. The live check must match
the tested build and repeat the read-only visual/workflow cases before completion.

Chrome desktop/mobile viewport emulation is the tested browser. Physical devices,
Safari/Firefox and a full assistive-technology audit remain for the release review.
Native file-picker text follows the browser/OS language. The existing 11A historical
CDN-cache limitation is unchanged; the UI continues to use only checked Edge downloads.
No new live order submission, upload, status change or user/organization mutation is
needed for this styling milestone. Final release review has not started.
