# Prepaid Dealer Portal: Copilot instructions

Read [AGENTS.md](../AGENTS.md), the [project brief](../docs/project-brief.md), and the [implementation plan](../docs/implementation-plan.md) before working.

- Implement only the milestone requested by the user. Inspect the workspace and Git changes first; preserve existing user work.
- Use HTML, CSS, vanilla JavaScript ES modules, Bootstrap, Node.js, npm, Vite, and Supabase Database, Auth, and Storage. Do not introduce React, Vue, or TypeScript.
- Build a genuine multi-page application with separate HTML entry pages, shared modules, and responsive layouts. Keep modules small and organized by responsibility.
- Use only synthetic demo data. Never commit credentials, real dealer information, or privileged Supabase keys. Browser code may use only the public project URL and publishable/anon key; RLS must enforce access.
- Treat database policies and Storage policies as the authorization boundary. Hiding admin controls is not access control. Never trust browser-supplied roles, ownership, prices, or totals.
- Version schema, policies, constraints, and database functions in SQL migrations. Make registration default to the dealer role; provision admins only through a trusted process.
- Keep changes small and independently testable. Run applicable checks and review the diff before each commit. Report what actually ran; never invent tests, commits, or results.
- Update documentation when behavior or setup changes. Do not add dependencies or features outside the agreed milestone without a concrete need.

Milestones 4B, 4C, 5A and 5B are complete for the SoftUni demo: authentication, one permanent demo administrator, dealer-only catalog reads and functional catalog/local drafts. See `supabase/catalog-access.md` and `docs/catalog-and-draft.md` for actual validation. Preserve all accounts, three migrations, twelve products and unrelated configuration edits; do not rerun admin provisioning. Drafts are scoped to verified user IDs, store IDs/quantities only, clear on logout and fetch current product prices/status on load. Estimates are not authoritative. Anonymous/inactive/admin catalog reads and product writes remain blocked; admin catalog operations, orders and Storage stay default-deny. Do not start Milestone 6 or other features until requested. Future order submission must independently validate all data on the server. Confirm Email remains temporarily disabled; confirmation-enabled delivery is untested. Commit/push only when requested; Auth settings or privileged Admin API creation require separate authorization.
