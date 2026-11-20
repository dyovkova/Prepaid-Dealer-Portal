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

Milestones 4B and 4C are complete for the SoftUni demo: working Supabase authentication UI and one permanent synthetic demo administrator, provisioned only after explicit approval of the trusted transaction. Admin/dealer browser and API restrictions passed; see `supabase/demo-admin-setup.md`. Preserve the administrator, all three dealer fixtures, both migrations, existing data and unrelated MCP/configuration edits. Do not rerun first-admin provisioning. Confirm Email is temporarily disabled by the user; confirmation-enabled delivery was not tested. Catalog/orders/Storage stay default-deny with placeholder business actions. Do not start milestone 5A until requested. Commit/push only when requested; Auth settings or privileged Admin API account creation require separate authorization.
