# Milestone 11B: order PDF UI

2026-11-22. Target: PrepaidDealerPortal (`niabpabsvdgxackjjcsb`).
Production-build preview is verified; Netlify verification is pending the feature push.
Only the existing admin/dealer order-details entries are extended; no new HTML page,
dependency, database migration, Edge Function or Auth setting is introduced.

## Screens and security contract

- Admin `/admin/orders/?id=<uuid>`: published filename/date list, secure Download,
  PDF file selection, upload/publication progress, errors and saved-request recovery.
- Dealer `/order-details/?id=<uuid>`: authorized published documents and Download;
  no upload, editing or deletion controls. Missing/unauthorized order details never
  activate the document component.
- Both roles share the same small component/service modules. Existing guards remain;
  every operation reuses current account/session checks and binds the expected user's
  JWT explicitly. RLS and Edge checks remain authoritative.
- Metadata queries select IDs, filename, size and date only, never object paths.
  UI text uses safe text nodes; no Storage paths, secret keys, public or signed URLs
  are rendered. Admin upload necessarily sends its canonical UUID path to Storage,
  but that path is not a display/download link or a local-storage field.
- Upload uses the single shared client's private Storage upload with `upsert: false`.
  Publication uses `publish-order-document`; download uses only
  `download-order-document`, then a short-lived local Blob URL with a safe filename.
  The Blob URL is revoked; the UI never invokes Storage `.download()`, signing or
  public URL APIs. Account changes abort/discard stale UI work before a Blob download.
- Frontend type/filename/10 MiB checks are usability checks. The unchanged backend
  validates stored PDF bytes, current identity/status/ownership and publication.

## Durable upload recovery

Before any upload, save one intent per project/user/order in local storage: immutable
document UUID, order UUID, safe filename, byte size, SHA-256 and phase. The exact object
path is deterministically derived from those UUIDs. No PDF bytes, JWT or key are saved.
Web Locks coordinate tabs; unresolved intents cannot be replaced, and queued attempts
return the same confirmed receipt rather than allocate another UUID.

Refresh/logout/account switching preserve the original user's request. Retry an uploaded
intent without reselecting a file. If the upload itself was interrupted, first try saved
publication; if necessary reselect the exact original file. A same-path upload retry still
uses `upsert: false`; an existing object proceeds to publication, never overwrite.
Different filename/size/hash is rejected locally. No automatic retry occurs on page load.

Only a successful matching server UUID creates a durable confirmed receipt. If saving
confirmation fails, the prior intent remains retryable. A confirmed receipt is cleared
only by explicit **Upload another PDF**; neither clearing it nor logout deletes a file.
An unreadable or unresolved record is never silently removed. A server-rejected PDF keeps
its reference and needs operator review; this UI has no discard/cleanup/replacement
operation for that unresolved file. User-cleared browser data cannot be recovered by this
client; local storage is not an authorization boundary or a cross-device upload ledger.

## Actual preview verification

- 56 unit tests pass: existing regressions plus six focused upload validation, owner/order
  isolation, duplicate coordination, uncertain upload/publication, storage failure and
  durable confirmation cases.
- Four production-build browser cases pass with real controlled accounts: admin upload,
  deliberately lost successful publication response, refresh and exact retry without a
  second upload; admin/dealer byte-verified downloads; cross-organization and inactive
  denial; API errors/empty states; late download discarded after account switch; existing
  malformed-PDF publication rejection with recovery retained across role switching.
- Five existing session/race browser regressions pass; registration and order-creating
  regressions are excluded. No new account or order was created.
- Both admin/dealer views pass 320px/390px overflow checks. Preview screenshots were
  inspected; files remain ignored and synthetic.
- Network audit records no direct Storage download, signing/public URL or unexpected
  database mutation. Metadata queries omit paths; only the controlled upload POST is
  permitted by the browser harness.
- Production build and all eleven preview routes, linked assets, query URLs and unknown
  route 404 checks pass. Existing session, order/draft and business modules are preserved.

Preview retains one new published synthetic PDF on existing terminal 10A order
`1aed83d7-5408-433c-9913-b39d3ae8e09f`: UUID
`142241e5-912b-42be-8787-475b096e6eaf`, filename `Synthetic 11B preview UI.pdf`,
1,322 bytes, SHA-256 `7f19ad77ee8d24baba14457dc9c6aa3cb7f888a088d436acb10493654d17ac60`.
Its identity was saved before upload; the lost-response test published exactly once.
All four prior complete object rows and the prior metadata row, sixteen orders/twenty-five
items, accounts/roles/statuses, organizations/products, twelve migrations and deployed
Edge definitions match the baseline. The controlled dealer activation flag is restored.

## Commands and remaining checks

`npm run test:document-ui` runs focused unit tests. `PDP_DOCUMENT_UI_LIVE=1 npm run
test:document-ui-browser` runs preview checks with ignored fixture credentials/ledgers.
Set `PDP_DOCUMENT_UI_NETLIFY=1` for the existing live origin after its build is verified.
The harness creates at most one distinct synthetic PDF per preview/live stage, remembers
its ID before sending, reuses it on reruns and never deletes an existing document.
Use the project's existing `npm run build`, `npm run check:preview` and unit/session
regression commands. No credentials or synthetic PDF binaries are committed.

Pending: verify automatic Netlify publication from main, run the actual live admin/dealer
PDF flow and repeat preservation comparison. No 11B completion claim until those pass.
The backend's historical Free-plan direct-CDN cache limitation remains documented in
[11A](../supabase/document-download-revocation.md); the UI never creates direct-download
requests. No purge, token rotation, Auth/billing or backend changes. Non-Chrome engines,
cross-device recovery and global instantaneous recall of already delivered bytes are
not claimed. Stop after 11B; no later business feature is included.
