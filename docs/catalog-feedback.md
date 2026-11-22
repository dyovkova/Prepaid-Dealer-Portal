# Catalog draft feedback

2026-11-22. Focused frontend UX improvement after visual polish; final release
review remains unstarted. Supabase target stays `niabpabsvdgxackjjcsb`.

The catalog now confirms a saved update with a fixed **Product added to draft**
toast and **View draft** link. For existing items, its detail explicitly says
**Quantity updated**, showing the current total and increment. Repeated clicks
still add units to one existing line; quantity limits and validation are unchanged.

Every matching product card shows **Added to draft**, with its actual saved quantity
included for assistive technology and in the toast. Its reserved header row avoids
moving the Add button when the indicator appears.
Indicators read the existing per-user draft, including refresh, cross-tab removals,
clears and account switches. Existing draft events keep both counters synchronized.
An unreadable draft hides unverifiable indicators and retains the existing recovery
controls. Pending order requests keep their existing edit lock and exact payload.

Success is shown only after saving and reading back the expected quantity. Invalid
quantities retain inline validation; quota/storage/limit errors show no false success.
The toast uses a persistent polite live region without moving focus. It has no
automatic timeout; dismissing it restores focus when appropriate. Desktop feedback
sits above the hosting badge; at phone widths it sits near the viewport top. No new
dependency, page, business rule, Auth, submission, database or Storage change.

## Actual verification

- Production build and all eleven route checks pass (thirty linked routes/assets,
  detail query URLs and unknown-route HTTP 404).
- All 56 existing unit tests pass.
- Three focused real-session preview cases pass: scrolled additions, repeated/double
  clicks without duplicate lines, keyboard focus/dismiss/View draft, both counters,
  refresh, removal/clear, cross-tab synchronization, account switching, invalid/limit
  quantities, quota and silently dropped saves, corrupt storage and pending-request
  locks. No orders, users, products or files are created.
- Three existing catalog regressions and five existing session/race regressions pass.
  Catalog tests now inspect current synthetic products read-only and use an active
  credit fixture/current prices, because later admin milestones archived the original
  fixture. No hosted product was restored or modified for a test.
- 320px/390px screenshots were inspected; the toast fits without horizontal overflow
  and the card indicator remains visible. Evidence is ignored
  `.verification/catalog-feedback-*.log`, screenshots and per-case JSON reports.

Run `PDP_CATALOG_FEEDBACK=1` with `npm run test:catalog-feedback-ui` after the build
(PowerShell: `$env:PDP_CATALOG_FEEDBACK='1'`). Existing controlled local credentials
are required; tests use isolated browser drafts. Set `PDP_CATALOG_FEEDBACK_NETLIFY=1`
to target Netlify. Browser suites share the preview port and run sequentially.

Netlify verification is pending the reviewed main push. Complete it with the same
three read-only live cases and a final preservation comparison before marking done.
Chrome/phone emulation is tested; real assistive technology and other browser engines
remain for release review. Existing backend/cache limitations are unchanged.
