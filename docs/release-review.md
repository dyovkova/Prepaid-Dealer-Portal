# Final SoftUni release review

Review dates: **2026-11-22–23 (Europe/Sofia)**. Deadline: November 23, 2026.
Target: **PrepaidDealerPortal — `niabpabsvdgxackjjcsb`**.
Status: **VERIFIED RELEASE CANDIDATE — final Netlify publication check pending**.

## Scope and preservation

No new business feature, translation, redesign, migration, Edge deployment, Auth setting,
secret/key or permission change. The accepted design is preserved. Content/setup/demo
documentation is consolidated; historical technical records are labelled as history.
The historical deployment report moves from public runtime assets into documentation.
Three registration range-label typos are corrected without changing validation rules.

The current read-only baseline contains **11 accounts, 14 organizations, 15 products,
18 orders, 28 items, 6 private objects and 3 published document rows**. The latest two
orders are existing data, not new release fixtures. All must remain unchanged, including
roles, memberships, activation, saved prices/quantities/names and full file metadata.
The admin profile already says **Demo Administrator**; both UI messages use
`public.profiles.display_name`. No further profile/Auth change is needed.

## Acceptance results

- All twelve local/remote migration versions and normalized stored SQL bodies match.
  The project is ACTIVE_HEALTHY. Publisher v2/downloader v1 remain active with
  `verify_jwt=true`; their approved source bundle is unchanged.
- All 56 existing application/Edge unit tests pass.
- Nine isolated SQL/security runs pass: core, identity, catalog, atomic submission,
  dealer order reads, admin products/dealers/orders and document storage. Native PG17
  covers conflicts/concurrency/rollbacks; PGlite/Auth and Storage stubs are explicitly
  local simulations, not hosted signup/gateway proof.
- The existing local Chrome no-store cache/revocation test passes against mocked
  providers. An isolated `npm ci` from the application lockfile passes and reports
  zero vulnerabilities; no application dependency or lockfile was changed.
- **21 preview browser cases pass:** catalog (3), catalog feedback (3), session/races
  (5), all-route visual/state checks (4), document error/recovery/session checks (2),
  admin-order error/conflict checks (1), and release workflows (3). The initial release
  harness needed two corrections: the existing success message is “Organization
  renamed”, and Storage SDK uploads use multipart bytes. No application fix was needed.
- Release workflows use a real **exact existing submission**, deliberately discard its
  successful response, preserve the same pending UUID/payload through refresh, then
  recover the same order and saved items. No new order is created. Real product and
  organization saves resend only their unchanged values. A one-shot stale read of an
  existing synthetic terminal order produces a genuine PT409; the UI reloads Completed
  and never retries the mutation automatically.
- The PDF workflow reselects the exact existing PDF/UUID/filename/fingerprint. The
  real immutable Storage upload returns a collision, the existing publisher validates
  and replays publication, a discarded response is recovered after refresh without
  another upload, and admin/dealer downloads match the existing bytes. Wrong MIME and
  oversized selections are rejected by the UI. This verifies recovery, not creation of
  a fresh hosted file; all six original objects and three metadata rows remain.
- Hosted API checks pass for admin/two dealer/existing inactive logins, current
  catalog visibility, cross-profile/organization/order/item/PDF UUID denials, protected
  roles/membership/activation, direct order/item/document-write restrictions, terminal
  status rejection and prompt HTTP 409/PT409. Admin duplicate/invalid product creates
  are rejected; exact-value product/org/profile-activation operations preserve rows.
- All three published PDFs download through Edge as admin and owning dealer with
  matching hashes and no-store headers. Anonymous/cross-org/inactive requests are
  denied. Existing malformed/spoofed/encrypted fixtures still reject publication with
  HTTP 415; the oversized collision attempt rejects with Storage status 413. Cold
  direct/public/signed URLs remain denied. Private helper RPCs are absent (404) and
  `Accept-Profile: private` is rejected (406); hosted OpenAPI is disabled (401), so no
  Swagger-listing success is claimed. CORS/preflight and narrow metadata grants pass.
- Fresh real login verifies **Demo Administrator** in both messages on all four admin
  pages and after refresh. Real invalid credentials show the correct error; the existing
  inactive account is blocked on all eight protected routes without business reads.
- Build and eleven-route checks pass, including thirty linked routes/assets, direct
  detail URLs and unknown-route 404. The visual suite captures 69 route/state images
  at desktop/390px/320px; no horizontal overflow or unexpected page/console errors.
  Home/registration and representative admin/dealer screenshots were inspected.
- Tracked/new documentation and generated artifacts pass known-credential/privileged-key
  pattern scans; full text patch history (excluding the lockfile) has no known password
  or privileged-key pattern match. Private fixture/config path history is empty.
  Server-only configuration, private PDFs and verification files are absent from the
  32-file build. Local Markdown links pass. This is scoped scanning, not a guarantee
  against every possible previously unknown secret format.

## Reproduction and evidence

Run `npm test`, `npm run test:documents-browser`, the eight existing local SQL runner
commands in [backend verification](../supabase/README.md#verification), `npm run build`
and `npm run check:preview` with preview running. A separate isolated PGlite core-schema
run completes the nine SQL groups. Browser selection: `test:catalog-ui`,
`test:catalog-feedback-ui`, five non-signup `test:session-ui` cases, `test:visual`, two
non-deactivation document recovery cases, and the mocked admin-order error case.
Each requires its documented opt-in environment/ignored credentials. Legacy mutation
suites are intentionally not run wholesale against the preserved demo.

Private release evidence remains under ignored `.verification/release-*.log/json`;
the before/after snapshot, migration/body/source checks, hosted operation summaries,
scoped mutation guards, screenshots and scan report are not public fixtures. Hosted
retries are pinned to existing UUIDs before dispatch. The release browser harness
permits only those exact retries/unchanged-value saves and blocks other mutations.

## Test boundaries and known limits

Release verification favors existing synthetic records and immutable exact retries.
It does not create another account/order/organization/product/PDF or change an order's
status. Backend write/activation/create/archive/transition rules are tested in isolated
local SQL; earlier milestone reports retain actual hosted creation and deactivation
acceptance. Fresh hosted checks must identify exact-value/no-op edits, existing-request
replays, rejected operations and browser mocks distinctly. A successful upload collision
on an existing immutable UUID is not a new-file upload acceptance claim.

Confirm Email remains temporarily disabled; confirmation-enabled delivery is untested.
Private credentials/fixtures stay ignored. Chrome and 320px/390px emulation are the
verified browser baseline, not a physical-device/full WCAG or other-engine certification.
Netlify's existing branding badge can overlay content at some scroll positions.

The new Edge-only PDF path checks current database role/profile/organization/order
access and returns no-store bytes. It cannot recall downloaded files or invalidate
historical client/CDN copies. Previously warmed direct authenticated Storage URLs/JWTs
returned HIT/200 after deactivation; exact old URLs/JWTs are no longer retained for a
natural-expiry recheck. No global cache elimination or absolute immediate revocation
is claimed. No Pro-only purge, billing/Auth/key change, rotation or file deletion was
attempted. The project remains suitable only for synthetic/non-confidential demo files.
See [actual historical cache evidence](../supabase/document-download-revocation.md)
and the current [README limitations](../README.md#known-limits-and-security-boundaries).

## Release handoff (publication verification pending)

Application: https://prepaiddealersportal.netlify.app

Repository: https://github.com/dyovkova/Prepaid-Dealer-Portal

The final commit/artifact evidence will be recorded after verification and main push.
Use [DEMO.md](../DEMO.md), supply evaluator credentials privately if required, and submit
the URLs through SoftUni's actual assessment form before the deadline. No external
submission, recording, credential distribution or course-form action is performed by
this review. Stop after the final release handoff.
