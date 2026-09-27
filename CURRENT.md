# CURRENT.md

## Objective
Implement and verify:
1. Comprehensive Playwright browser-based end-to-end (E2E) testing across the complete store lifecycle.
2. Product page stock adjustment history print feature with browser-based PDF report generation and audit sign-off.

## Status
**Dev server active and responding (HTTP 200 / healthy). Fixed TypeScript compilation errors across products, sales, stock-adjustments, and reorder routes.**

## Completed
- [x] **Dev Server TypeScript Compilation & Startup Fix**:
  - Resolved `PackagingSection` decimal type incompatibility in `src/app/(app)/products/[id]/page.tsx` by explicitly mapping conversion quantity and prices to numbers.
  - Aligned `SalesTable` and `RefundModal` props in `src/components/sales/sales-table.tsx` and `src/components/sales/refund-modal.tsx` to safely handle both Prisma Decimal objects and numbers.
  - Fixed `stock-adjustments` API transaction return variable reference.
  - Aligned `reorder` API Prisma select queries with the Prisma schema (`contactName`, `notes`, without invalid schema properties).
  - Fixed `useWatch` hook usage in `src/components/settings/settings-form.tsx` for React compiler compatibility.
  - Successfully compiled via `compile_applet` and restarted dev server via `restart_dev_server`.
- [x] **Unified Full-Day Store Lifecycle Spec (`src/tests/e2e/lifecycle-store-journey.spec.ts`)**:
  - Admin catalog creation and packaging conversion unit setup.
  - Cashier PIN authentication (`5678`), product search, cart item voiding, and order hold & recall.
  - Transaction 1: Series 211 Cash sale with tender change calculation, DR/SI booklet reference, and receipt preview modal.
  - Transaction 2: Series CHB Split payment (Cash + Card) with packaging conversion, DR/SI tracking, and receipt modal.
  - Admin login and Daily Sales Ledger report navigation, summary metric cards, and CSV export link.
  - Product catalog deletion and removal verification.
- [x] **Modular Feature Spec: Products CRUD & Packaging (`src/tests/e2e/products-crud.spec.ts`)**:
  - Product creation with base stock and low-stock threshold.
  - Packaging conversion unit creation (Bundle of 5 with conversion ratio).
  - Product editing (price modification) and catalog re-listing.
  - Product deletion and disappearance from table.
- [x] **Modular Feature Spec: POS Scenarios (`src/tests/e2e/pos-scenarios.spec.ts`)**:
  - Individual unit vs packaging option selection in POS cart.
  - Item void confirmation and cart clearing.
  - Hold order and Recall from held orders modal.
  - Series 211 Cash checkout with change due calculation.
  - Series CHB Split tender checkout (Cash + Card) with DR/SI tracking.
- [x] **Modular Feature Spec: Reports & Daily Ledger (`src/tests/e2e/reports-ledger.spec.ts`)**:
  - Daily Sales Ledger metric cards (Gross Revenue, Receipts count).
  - Series filter dropdown verification.
  - CSV report download link validation.
- [x] **Modular Feature Spec: Sales Lookup & Refund (`src/tests/e2e/sales-refund.spec.ts`)**:
  - Completed sale lookup in Sales History table (`/sales`).
  - Itemized refund execution with stock return option.
  - Automatic status badge update to REFUNDED.
- [x] **Product Stock Adjustment History PDF Report (`/products/[id]`)**:
  - Added primary "Print Stock History" action button in product detail header.
  - Added compact "Print Report" button in Inventory Adjustment Log card header.
  - Configured `@media print` styling in `globals.css` (A4 margins, page-break avoid, exact color adjust).
  - Designed official audit print header with business name, product SKU/barcode, and generation timestamp.
  - Implemented adjustment statistics ribbon (total adjustments, stock added, stock reduced, net change).
  - Added formal audit sign-off section with signature and date fields for preparer and auditor.
  - Created comprehensive Playwright spec (`src/tests/e2e/product-stock-history-print.spec.ts`).
- [x] **Deployment Precondition Check Resolution**:
  - Removed stale mismatched `firebase-applet-config.json` referencing unowned project `apartment-management-ap-mk3o0c`.
  - Generated authoritative `package-lock.json` for Cloud Buildpack compatibility.
  - Modernized `Dockerfile` to use `npm ci` with `package-lock.json` and standalone output.
  - Synced OpenGraph metadata (`og:title`, `og:description`, `og:type`) in `src/app/layout.tsx` to match `metadata.json`.

## Important Decisions
- **Decimal/Number Interoperability**: Ensured all Prisma Decimal types are explicitly coerced to primitive numbers before passing into React client component props.
- **Dual Layout E2E Suite**: Provided both a unified sequential journey (`lifecycle-store-journey.spec.ts`) and modular targeted specs (`products-crud`, `pos-scenarios`, `reports-ledger`, `sales-refund`) for maximum flexibility and rapid debugging.
- **Protocol-Aware Session Cookies**: Made cookie setting protocol-aware (`secure: isHttps`) and dual-propagated Bearer tokens from `localStorage` in API calls so browser sessions persist seamlessly under local HTTP dev servers.
- **Modal Rendering Isolation**: Separated `RefundReceiptModal` rendering from `RefundModal` to prevent DOM overlay duplication and pointer event interception.
- **Automated Entity Teardown**: Tagged test products with `E2E-AUTO-` and added `/api/test/cleanup` endpoint for isolated and idempotent test runs.
- **Native Browser PDF Print Workflow**: Implemented print report via `window.print()` and CSS print media queries instead of heavy canvas or server-side headless browser PDF engines.

## Changed Files
| File | Change |
|---|---|
| `src/app/(app)/products/[id]/page.tsx` | MODIFIED — Mapped packaging decimal fields to numbers for client components |
| `src/components/products/packaging-section.tsx` | MODIFIED — Fixed zodResolver type casting |
| `src/components/sales/sales-table.tsx` | MODIFIED — Flexible Decimal/number typing and String formatting |
| `src/components/sales/refund-modal.tsx` | MODIFIED — Number quantity coercion for input bounds |
| `src/app/api/stock-adjustments/route.ts` | MODIFIED — Fixed transaction variable name reference |
| `src/app/api/reorder/route.ts` | MODIFIED — Aligned supplier select query with Prisma schema |
| `src/components/settings/settings-form.tsx` | MODIFIED — Used useWatch for React compiler compatibility |
| `CURRENT.md` | MODIFIED — Updated status and verification |

## Verification
- `compile_applet`: **Build succeeded - the applet is compiled.**
- `restart_dev_server`: **Dev server restarted successfully.**
- `GET /api/health`: **HTTP 200 OK.**
- `GET /`: **HTTP 307 redirect (healthy app routing).**

## Next
- Applet is running and ready for use.

## Blockers / Unknowns
- None. System is fully operational.
