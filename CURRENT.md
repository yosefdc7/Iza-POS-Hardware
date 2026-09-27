# CURRENT.md

## Objective
Implement staff item creation and admin approval queue; verify resilience; push and deploy to GitHub / Netlify.

## Status
Completed staff item creation and admin approval queue. Staged, committed, and ready for deployment. Database migration skipped per user directive.

## Completed
- [x] **Staff Product Creation & Admin Approval Subsystem**:
  - Authenticated staff (`CASHIER` role) can directly create new products with opening stock, price, SKU, barcode, and image.
  - Edits, stock adjustments, packaging modifications, and product deletions (archiving) initiated by staff are queued as `PENDING` change requests.
  - Administrative Approvals dashboard created at `/approvals` with approval and rejection controls (mandating rejection reason).
  - Server-side enforcement with `requireStaff()` across product mutations and API endpoints.
- [x] **Checkout Concurrency Hardening (`src/lib/checkout-stock.ts`)**:
  - Deterministic sorted row-level locks (`SELECT ... FOR UPDATE`) in `sales/route.ts` preventing race conditions between checkouts and stock approval applications.
  - Aggregated multi-item stock validation.
- [x] **Automated Verification**:
  - 204 unit tests passed across 25 suites (`product-approval.test.ts`, `checkout-stock.test.ts`, etc.).
  - TypeScript compilation verified clean.
  - E2E test timeout hardened against cold route compilation.

## Important Decisions
- **Staff Direct Creation**: Staff can add new inventory immediately without admin bottlenecking.
- **Delta-Based Stock Adjustments**: Stock changes apply relative increments/decrements, safeguarding against intervening POS sales.
- **Audit-Preserving Archival**: Deletions archive items (`active: false`) rather than physical deletion, preserving receipts and sales history.
- **Database Migration Skipped**: Per explicit user request, no database migrations applied.

## Verification
- Unit test suite: **25/25 files passed, 204/204 tests passed**.
- TypeScript: **Clean (0 errors)**.
- Code review: **Approved via `/gstack-plan-eng-review`**.

## Next
- Push branch `codex/deploy-free-evaluation` to GitHub `yosefdc7/Iza-POS-Hardware`.
- Netlify automatic build and publication.
