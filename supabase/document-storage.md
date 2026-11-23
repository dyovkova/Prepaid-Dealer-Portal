# Milestone 11A: private PDF backend - verified Edge workflow

> Milestone-scoped verification record. Counts and deferred-feature notes describe that stage, not the completed application. See [current release evidence](../docs/release-review.md) for the final state and limitations.

Verified on **2026-11-22** against **PrepaidDealerPortal - niabpabsvdgxackjjcsb**.
The approved Free-plan backend workflow is deployed and verified. Historical cached
direct Storage responses remain a known limitation, documented below and in the
[download security report](document-download-revocation.md). No document UI is implemented.

## Applied migrations and deployed functions

| Migration | Approved SHA-256 |
| --- | --- |
| [010: bucket, metadata and publication](migrations/20261122001000_order_document_storage.sql) | 4286c2aba4c2dfced787e6417a2def63e7554689c58336da2e932639b822e453 |
| [011: legacy operation compatibility](migrations/20261122001100_order_document_legacy_read.sql) | 627ddca07259abbc3aac6a1445a7ae32d3b5bbd76a92ef2a8f87b335cde7c12d |
| [012: checked download boundary](migrations/20261122001200_order_document_download_boundary.sql) | adeb6887c53646f4fd8672cabd5b85a18314e46208d865d149c684652a30e3fa |

All twelve local/remote versions and stored SQL bodies match; none pending. Only
publisher v2 and downloader v1 are active, both with JWT verification enabled.
The reviewed config/function source-bundle SHA-256 is
e46f89ee4b9f5b7ed13cba86a767eb688dfecfe183b09c415a05f234bb6220a1.
Every deployment followed explicit target/health/hash/sole-pending checks. For 012,
the two functions were deployed and smoke-tested before direct origin reads closed.

## Current backend contract

- Private order-documents bucket; application/pdf only, 10 MiB (10,485,760 bytes).
- Immutable canonical order-UUID/document-UUID.pdf paths; safe ASCII display filenames
  at most 120 characters. No overwrite, move or client deletion. Managed object rows
  are changed only by supported Storage APIs, never application SQL.
- Active admins upload using authenticated Storage with upsert false, then POST exactly
  orderId/documentId/fileName to publish-order-document. The server verifies JWT/current
  admin/order access, privately fetches and parses the actual file, rechecks authority,
  then invokes the existing service-only registration RPC. The RPC verifies uploader,
  object size and active admin; exact retries return the same UUID, conflicts return 409.
- Active admins can list all metadata; active dealers only their active organization's
  published documents. Metadata RLS and existing parent-order RLS remain enforced.
  Dealers never upload or write metadata. Pending objects remain admin-private.
- Downloads use only POST download-order-document with documentId and the caller JWT.
  It checks Auth/current profile/role, dealer organization, published metadata and order
  access before and after a bounded server-only byte fetch. The response is a safe
  attachment with no-store headers; no key, signed URL or direct Storage URL is returned.
- 012 removes both modern and legacy direct authenticated download operations from
  the object SELECT allowlist. Authorized list operations and admin upload probes remain.
  Signed/public URLs and direct user reads are denied at the origin, including for admins.
- Server keys stay in managed Edge environment variables, used only for authorized
  private byte reads and registration. User/RLS data reads use the caller JWT/public key.
  No secret was retrieved into local configuration or included in frontend assets.

## Actual hosted results

| Check | Result |
| --- | --- |
| Admin and owning dealer download | HTTP 200, original bytes/hash, safe filename and no-store |
| Anonymous, cross-organization and already inactive account | Denied |
| Warmed Edge request after dealer profile/organization deactivation | HTTP 403 with the same JWT; HTTP 200 again after restoration |
| Inactive admin read/upload/publication | Denied; original status restored |
| Admin access to inactive-organization history | Preserved |
| Fresh valid admin/dealer direct Storage URL | HTTP 400 / NoSuchKey / CDN BYPASS |
| Dealer uploads; overwrite/delete; signing/public URLs; metadata writes; direct registration | Denied; existing file rows/bytes unchanged |
| JWT/CORS/method/body/path and forged-actor checks | Passed, including preflight 204, forbidden origin 403, unsupported GET 405 |
| Spoofed, malformed and genuinely encrypted PDF publication | HTTP 415; no metadata publication |
| 10 MiB+1 upload | Rejected: HTTP 400 with Storage statusCode 413; no object created |
| Existing-UUID publication/retry/conflict | Passed: discarded-response retry returns original UUID; one metadata row; conflicting metadata 409 |
| Real Chrome from Netlify origin | Admin/dealer bytes/hash, repeated no-store requests, same-token deactivation 403 and restoration pass |
| Previously warmed exact direct URL/JWT | Historical CDN HIT/200 persists after 012 and profile/organization deactivation; not counted as an origin authorization pass |

Local PostgreSQL policy/security/catalog checks pass, as do 50 unit tests, one local
Chrome cache test, existing product/dealer/order SQL and concurrency regressions and
the production build. The local SQL uses Storage stubs; actual deployed Edge/gateway
and real browser checks are reported separately. No UI or unrelated behavior changed.

## Retained fixtures and preservation

All four files remain under existing synthetic order
1aed83d7-5408-433c-9913-b39d3ae8e09f. No replacement or new file was uploaded in the 012 rollout.

| Document UUID | Fixture | State |
| --- | --- | --- |
| 9b07ab14-98c2-4290-8372-d339a8f1bb40 | Synthetic 11A verification.pdf, 1,320 bytes | Published once; original UUID/path/version/row/hash preserved |
| edf98046-52ed-4892-a57e-93e7a4e06404 | Spoofed PDF, 45 bytes | Private pending; no metadata |
| d9b2d308-c2c6-4b0f-91c9-2f7a70190b9f | Malformed PDF, 42 bytes | Private pending; no metadata |
| cabed8ce-a084-4b0e-aa17-89eeada19bd5 | Encrypted PDF, 764 bytes | Private pending; no metadata |

Original valid-file SHA-256:
c18e40867f9ce215921c62f2ec6edda7bfdec6d19b2d26951eed75990549ae07.
Final full comparison preserves all eleven account identities/profiles/roles, fourteen
organizations and their statuses, fifteen products, sixteen orders/twenty-five items,
all four complete object rows and the original metadata row. Only approved 012's two
SELECT operation entries changed in SQL during this rollout. All temporary flags restored.
Unrelated MCP/configuration changes are excluded from the backend commit.

## Security limits and recovery

Free does not support the Pro-only CDN purge API; the user prohibited purge, billing,
Auth changes and token rotation. None occurred. Exact pre-migration JWTs/URLs still
produced HIT/200 in controlled tests. They expire at 2026-11-22 13:39:03 UTC / 15:39:03
Europe/Sofia; natural expiry was not rechecked because it was nearly another hour away.
Tokens were kept in memory only. Do not claim the legacy cache has expired or been
globally invalidated. Saved/browser-held/in-flight bytes cannot be recalled. The new
Edge workflow reauthorizes fresh requests; absolute immediate global revocation is not
claimed. See the [detailed limits and evidence](document-download-revocation.md).

Upload and publication are separate services. Keep the same immutable UUID/path/payload
after uncertain outcomes, and retry publication; never automatically overwrite or delete.
Invalid pending files stay private. Separately authorized cleanup must use Storage APIs.
PDF parsing validates structure, not malware safety or content sanitization.

Milestone 11A's backend is verified for this approved Free demo configuration, with the
historical-cache/natural-expiry limitation explicit. Stop before 11B document UI.
