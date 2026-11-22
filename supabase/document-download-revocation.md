# Milestone 11A: checked PDF downloads - deployed and verified

**2026-11-22. Target: PrepaidDealerPortal - `niabpabsvdgxackjjcsb`.**
After explicit approval and exact preflight, deployed only `publish-order-document`
version **2** and `download-order-document` version **1**, both with JWT verification,
verified the original PDF through the new endpoint, then applied only migration **012**.
All twelve migration versions/stored SQL bodies match. The new Edge workflow passes
hosted acceptance. Historical warmed direct URLs remain a documented Free-plan limitation;
no CDN purge, billing/Auth change, token rotation, file replacement or deletion occurred.

## Review artifacts

- Migration: [`20261122001200_order_document_download_boundary.sql`](migrations/20261122001200_order_document_download_boundary.sql).
- SHA-256: `adeb6887c53646f4fd8672cabd5b85a18314e46208d865d149c684652a30e3fa`.
- New endpoint: [`download-order-document`](functions/download-order-document/handler.js).
- Compatible replacement: [`publish-order-document`](functions/publish-order-document/handler.js).
- Shared modules in [`functions/_shared`](functions/_shared/document-auth.js) separate
  authorization, bounded Storage reads, input, HTTP/cache handling and environment setup.
  Individual implementation files are at most 53 lines; no frontend changes.
- Reviewed source-bundle SHA-256:
  `e46f89ee4b9f5b7ed13cba86a767eb688dfecfe183b09c415a05f234bb6220a1`.
  This hashes the sorted config/function manifest: each entry is the repository path,
  a NUL, and its file SHA-256, with entries joined by LF. It covers `supabase/config.toml`
  and all files in `_shared`, `publish-order-document`, `download-order-document`.

012 changes only `order_documents_object_read`'s USING expression, removing both
`object.get_authenticated` and `object.get_authenticated_info` from its operation
allowlist. Modern/legacy GET, HEAD/info, signed/public, image and S3 reads remain denied
to user roles at the origin. Existing authorized list/list_v2 and admin upload probes
remain. The private bucket, upload policy, metadata RLS, grants, registration RPC,
ownership/status predicates, rows, object paths and all previous SQL files are unchanged.
This closes **origin** bypass; it cannot invalidate an already cached HTTP response.

## Request authorization and byte delivery

`POST /functions/v1/download-order-document` accepts exactly `{ "documentId": "<uuid>" }`.
Both functions retain `verify_jwt = true` and additionally verify the actual bearer JWT
against Auth `/user`; an API key alone is not a user identity. Roles never come from
signup metadata or request fields.

For each download, shared code uses the caller JWT and public key for fresh reads of
their profile/role, their active organization if a dealer, published document metadata
and the associated RLS-visible order. Dealers must match its organization. Active admins
retain the existing all-orders permission, including historical orders for inactive
organizations; an admin has no required organization. Missing/inactive/unknown identities
fail closed. A pending/unpublished file cannot pass the metadata lookup.

Only then does a server-only key fetch the canonical fixed-bucket object path. The client
cannot supply a path, URL, order, ownership or key. Redirects are rejected; body size is
bounded at 10 MiB and actual MIME/length must match published metadata. Auth and current
database authorization are checked **again after fetching**, before any PDF bytes are
released. A revocation committed during that work discards the buffer.

The endpoint returns bytes as a safe ASCII filename attachment with `nosniff`,
`Cache-Control: private, no-store, max-age=0`, `CDN-Cache-Control: no-store`,
`Surrogate-Control: no-store`, `Pragma: no-cache`, `Expires: 0`, and
`Vary: Origin, Authorization`. Success, errors and preflight all carry the cache controls.
No Storage URL, signed URL, secret, upstream cache headers, ETag, redirect or 304 is returned.
Conditional/range headers do not skip authorization; POST always returns a whole file.

This deliberately expands server-secret use from v1's registration-only operation to
**authorized private byte reads and registration**, never frontend code. Auth/metadata/
order reads still use caller JWT/RLS. The secret is not used for Storage writes, deletion,
signing, Auth administration or automatic purge. Managed environment dictionaries and
legacy environment fallbacks remain server-only; no new secret was retrieved or saved.

Publication remains admin-only: verify active admin and existing RLS-visible order,
derive a strict canonical order/document path, fetch bytes privately, run the same actual
PDF parser, reverify admin/order, then invoke the unchanged narrow registration RPC.
The RPC still checks uploader ownership/size and live admin status. Exact retry keeps
the original UUID/payload; conflicting metadata stays PT409/HTTP 409. Failed or uncertain
publication retains the immutable object. Invalid-file parsing and upload RLS stay intact.

## Existing cached URLs and the Free-plan security guarantee

**Immediate global revocation cannot be guaranteed during this transition.** Existing
authenticated direct URLs can continue serving a warmed JWT without reaching 012's RLS.
Supabase documents this [authenticated-cache behavior](https://supabase.com/docs/guides/storage/cdn/smart-cdn).
Adding this endpoint or changing a policy does not recall those bytes. Browser-cached,
saved or already downloaded copies cannot be revoked, and an in-flight response cannot
be recalled after the final authorization check. The prepared endpoint prevents new
requests after a committed revocation from being authorized; it is not atomic with the
entire network transfer. It adds no separate `auth.sessions` logout-revocation mechanism
and makes no claim that logout invalidates every previously issued JWT.

The user confirmed **Supabase Free**, which does not support the Pro-only
[purge API](https://supabase.com/docs/guides/storage/cdn/purge-cdn-cache), and explicitly
prohibited purge attempts or billing changes. None were attempted. The approved scope
accepts verification of the new Edge workflow while preserving the historical-cache
limitation; it does not claim global immediate revocation of old direct URLs.

Controlled admin/dealer JWTs and the exact original direct URL were warmed **before**
012, held only in memory across rollout, then rechecked afterward. Both still returned
**HTTP 200 / CF-Cache-Status HIT**. The same dealer token/URL remained HIT/200 after
profile and organization deactivation, while the new Edge endpoint denied both with
HTTP 403. This is a cached legacy response, not an allowed origin read: fresh valid
admin/dealer JWTs receive **HTTP 400 / NoSuchKey / BYPASS** on the exact direct path.

The held tokens expire at **2026-11-22 13:39:03 UTC / 15:39:03 Europe/Sofia**.
Natural-expiry behavior was **not rechecked**: it required almost another hour after
cutover, outside this focused verification. Token values were not logged or persisted.
Do not claim the observed legacy cache has expired or been globally invalidated.
Fresh JWTs, cacheNonce or changed URLs are not substitutes for the exact old-token test.
Future observation of expiry is still pending; downloaded/saved/browser-held copies
remain outside revocation regardless of JWT expiry. No Auth expiry changes or file
overwrite/move/deletion are used as workarounds.

## Actual local and production results

- Disposable PostgreSQL 17.12: passed. Exact catalog comparison proves 012 changes only
  the two read-operation entries; other policies/functions/grants/constraints/bucket/data
  are identical. Real local RLS denies direct modern and legacy reads for all user roles,
  while server-role reads, authorized lists, admin upload probes, metadata ownership,
  inactive-account/organization denials and signing/write restrictions pass.
- Node endpoint/parser tests: 18 focused cases, including admin/dealer reads, same-JWT
  profile/organization revocation with warm upstream bytes, revalidation during a fetch,
  forged claims/paths/roles, pending files, safe filenames, MIME/length failures,
  conditional requests, CORS, secret isolation and exact publication retry/revalidation.
- Real local Chrome: passed one HTTP test, warming the prepared endpoint and proving
  another server request/403 after profile and organization changes. No browser routing
  interception was used; provider HTTP calls were mocks. This is not a hosted CDN test.
- **50** unit tests, business SQL/concurrency regressions and production build pass;
  no backend key/parser code is included in browser assets.
- Read-only preflight: exact healthy target, eleven deployed bodies matching local SQL;
  dry-run listed only 012, no seeds/roles. Approved migration/source-bundle hashes matched.
- Hosted Edge acceptance: admin/own-dealer PDF downloads; anonymous, cross-org and
  existing inactive denials; same-JWT profile/organization deactivation and restoration;
  inactive admin read/upload/publication denial; safe filenames/cache headers; JWT/CORS;
  direct-origin/write/overwrite/delete/sign/public restrictions; original-UUID publication
  retries, discarded-response recovery and conflicting metadata HTTP 409 all pass.
- Existing spoofed, malformed and genuinely encrypted PDFs return publication HTTP 415;
  an oversized upload returns HTTP 400 with Storage `statusCode: "413"`. All three invalid
  pending fixtures remain unpublished/private. No new fixture was created in this rollout.
- **Real hosted Chrome from the Netlify origin**: original admin/dealer download/hash and
  safe attachment pass; warmed dealer POST returns 403 after each profile/organization
  deactivation and 200 after restoration, always with `private, no-store, max-age=0`.
  Active admin can still read inactive-organization history, preserving existing RLS.
- Final remote comparison: all twelve versions/bodies synchronized, none pending; only
  the two SELECT-operation entries changed in SQL. Existing 16 orders/25 items, all
  account identities/roles/statuses, organizations/products, all four complete object rows
  and the one published metadata row are unchanged. All temporary flags restored.
  Function versions are publisher v2/downloader v1, active with JWT verification enabled.

Commands: `npm run test:documents`, `npm run test:documents-browser`,
`node supabase/verification/test_document_storage_local.mjs`, existing full unit suite,
`node supabase/verification/test_admin_orders_local.mjs`, `npm run build`, and the
read-only remote dry-run. Native SQL uses existing ignored embedded PostgreSQL tooling.
No local Deno/full Supabase gateway stack is available. Actual hosted packaging and
gateway behavior are verified through both deployed functions and the real parser.

## Verification tools and remaining limits

The interactive [`test_document_cutover_live.mjs`](verification/test_document_cutover_live.mjs)
was used across rollout. It never deploys or purges; Free-plan legacy HIT responses are
recorded explicitly rather than counted as origin authorization passes. Its warm-up phase
requires pre-012 state and must **not** be rerun by reopening direct permissions.

The opt-in [`test_document_storage_live.mjs`](verification/test_document_storage_live.mjs)
passes after 012 with `PDP_DOCUMENTS_LIVE=1`, reusing original fixture IDs/bytes and restoring
bounded status changes. Its downloads use the Edge endpoint, with separate cold direct
denial checks. The private hosted Chrome/origin/preservation reports contain outcomes,
not JWTs or keys. Source review/diff/credential checks pass. No document UI or later feature
was implemented. Milestone 11A's new backend workflow is verified for the approved Free
demo configuration, with historical direct-cache exposure and natural-expiry recheck
explicitly outstanding; this is not an absolute immediate-revocation guarantee.
