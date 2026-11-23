# Five-minute SoftUni demonstration

Application: [prepaiddealersportal.netlify.app](https://prepaiddealersportal.netlify.app).
Repository: [dyovkova/Prepaid-Dealer-Portal](https://github.com/dyovkova/Prepaid-Dealer-Portal).

Use the existing controlled **Dealer A**, second dealer and **Demo Administrator**
accounts. Obtain credentials privately from the project owner; none belong in this
document, a screen recording, slide, chat or public submission. Start in a fresh
browser profile/private session so existing browser drafts and pending requests stay
untouched. Use separate browser profiles if showing two roles side by side.

The default walkthrough preserves all hosted records/files. Keep the existing
synthetic order with published PDFs ready:
`1aed83d7-5408-433c-9913-b39d3ae8e09f` (Dealer A's organization). Never change this
completed order's status or replace/delete its documents.

| Time | Show and explain |
| --- | --- |
| 0:00–0:35 | Home: completed dealer/admin workflows and synthetic-data boundary. Log in as Dealer A. Point out database-derived identity and active-account access. |
| 0:35–1:20 | Catalog: search by SKU/name, scroll down, add a product with quantity 2. Show the fixed confirmation, View draft link, card indicator and counters. Add it again: the same line's quantity increases, not the number of distinct products. Refresh to show persistence. |
| 1:20–2:00 | New order: edit quantity, remove/re-add locally, inspect EUR estimate and optional note. Explain that submission validates current products/prices atomically and saves snapshots; uncertain outcomes keep the same request UUID/payload. The preservation walkthrough leaves Submit untouched and opens an existing confirmed order next. |
| 2:00–2:45 | My orders and [saved order details](https://prepaiddealersportal.netlify.app/order-details/?id=1aed83d7-5408-433c-9913-b39d3ae8e09f): show date/status, quantities and original SKU/name/price snapshots. Download an existing synthetic PDF. Explain organization isolation and Edge-only checked downloads. |
| 2:45–3:35 | Log out, then log in as Demo Administrator. Show the name in navigation and the sign-in message. Open Products, search/filter active/inactive, open Edit and Cancel. Open Dealers: organizations, user counts, roles/status, and the distinction between disabling an organization and one profile. Open a confirmation and Cancel. Creating an organization does not create a user account. |
| 3:35–4:30 | Admin Orders: search, filter and pagination, then saved details/documents. Completed/rejected orders have no status actions. On a submitted request, demonstrate the status confirmation and Cancel; explain submitted → processing/rejected → completed/rejected and HTTP 409 reload without automatic retry. Show the admin PDF upload controls and 10 MiB/PDF-only validation; download an existing published PDF. |
| 4:30–5:00 | In the second dealer's separate profile, open Dealer A's order UUID: unavailable, with no items/PDFs disclosed. A dealer cannot open admin pages. Finish with logout and refresh. Mention temporarily disabled email confirmation and the historical CDN limit below. |

## If the examiner requires fresh writes

Use only the controlled synthetic accounts and data, and agree the demonstration
writes with the owner before the session. These are optional examiner actions, not
part of the release's preservation checks:

1. Submit one small new dealer request and record its returned UUID. Repeated clicks
   are blocked; do not clear a pending request or generate a replacement ID after an
   uncertain result. Retry the saved request unchanged.
2. As admin, open that new synthetic request, confirm processing and then completion
   (or rejection). Terminal states cannot be reversed. Never use an original order as
   a disposable status fixture.
3. Upload a small **synthetic, non-confidential PDF** to that new request, publish and
   download it as admin and the owning dealer. Keep its UUID/filename and saved recovery
   reference if publication is uncertain. No overwrite/deletion or signed/public URLs.
4. Leave any additional synthetic records/files intact and record their UUIDs privately.
   Do not change original products, memberships, roles, account settings or files.

The deployed workflows were exercised during their milestones. Final review reuses
existing exact order/publication requests and immutable upload collisions, while new
creation/status transitions run in disposable local SQL tests. See
[actual release evidence](docs/release-review.md) for the precise distinction.

## Honest limits and submission checklist

- Confirm Email is temporarily disabled for this demo; confirmation delivery was not
  verified. The app handles requests, not payments, inventory or delivery guarantees.
- Current PDF downloads check current access through the Edge Function and return
  no-store bytes. Previously downloaded/warmed legacy direct URLs may remain cached;
  the Free project cannot purge them. Do not claim global immediate revocation or use
  real confidential files. See [cache evidence](supabase/document-download-revocation.md).
- Keep passwords, tokens, `.env.local`, `.mcp.json`, private verification state and local
  PDFs out of submissions and recordings. Supply evaluator access privately only if
  the assessment requires it.
- Submit the live application URL and public repository URL in SoftUni's required
  submission form by **November 23, 2026**. Follow the course's actual instructions
  for a video/archive if requested; the release review cannot submit the form for you.
