# CURRENT.md

## Objective
Implement product classification tagging (`CHB` or `211` or custom), CSV exports across Products, Sales, and Reports, and Staff Financial Redaction (non-admin staff can only see item numbers and stock quantities, not monetary amounts in sales and reports). Verify across all automated tests and type checking, commit, push to GitHub, and deploy to Netlify.

## Status
All features implemented, committed, pushed to GitHub (`codex/deploy-free-evaluation`), and deployed to production Netlify (`https://iza-pos-hardware-eval.netlify.app`). 0 TypeScript compiler errors. All 26 unit test suites passed (217/217 tests). Live deployment verified ready.

## Completed
- [x] **Product Tagging (`CHB` / `211` / Custom)**:
  - Database schema updated with `tag String?` on `Product` with index `Product_tag_idx`. Applied cleanly to live Supabase database via migration `20260927190000_add_product_tag`.
  - Added `tag` validation to `productFormSchema` and persisted in `createProduct` / `updateProduct` server actions.
  - Added Tag dropdown (`None`, `CHB`, `211`, custom) with inline `+ Custom Tag...` creation modal in `product-form.tsx`.
  - Tag pill badges rendered across Catalog table (`product-table.tsx`), Product Details (`products/[id]/page.tsx`), and POS search & quick-add grid (`product-search.tsx`).
  - Added Tag filter pills (`All`, `CHB`, `211`, custom tags) to Catalog Table.
- [x] **Role-Aware CSV Exports**:
  - **Products CSV Export (`/api/products/export`)**: Supports tag filtering (`ALL`, `CHB`, `211`, `UNTAGGED`). Admins receive full selling prices, costs, and margins; staff downloads omit all financial numbers and only include IDs, names, tags, categories, SKUs, barcodes, units, stock, threshold, and status.
  - **Sales CSV Export (`/api/sales/export`)**: Admins receive subtotal, discount, tax, total, and item summary; non-admin staff downloads omit subtotal, discount, tax, and total, and instead receive Items Count, Total Quantity, and item breakdown.
  - **Reports Daily Ledger CSV Export (`/api/reports/daily-ledger?format=csv`)**: Admins receive Base Price, Selling Price, Unit Cost, Gross Profit, Selling Value, Sale Total, and Refund Total; non-admin staff receive only Business Date, Customer, Receipt #, DR/SI No., Qty, Unit, Item, Cashier, and Status.
- [x] **Staff Financial Redaction in UI & API Payloads**:
  - **Sales Table (`/sales`, `sales-table.tsx`)**: Passing `isStaff` prop based on `user.role !== 'ADMIN'`. When `isStaff` is true:
    - Table header `Total` is replaced with `Items / Qty`.
    - Main row total cell displays e.g. `3 items (15 qty)` instead of ₱ amount.
    - Expanded receipt rows hide `Price` and `Total` columns, showing only item name and quantity.
    - Refund button is hidden for non-admin staff (backend already restricts refunds to `ADMIN`).
  - **Reports Daily Ledger (`/reports`, `daily-sales-ledger.tsx`)**:
    - When `isAdmin` is false, hide financial metric cards (Gross Revenue, Gross Profit, Series Totals, Base/Selling Values, Refunds) and replace with operational metrics (`Receipts in view`, `Total Items Sold`, `Total Receipts`).
    - Ledger table hides `Base Price`, `Selling Price`, `Unit Cost`, `Profit`, and `Selling Value` columns for staff.
    - Ledger footer hides `Refunds` and `Sale Total`, displaying total item count and units.
    - Daily Ledger API (`/api/reports/daily-ledger`) zeroes out revenue, refund, selling values, prices, and profit numbers in the JSON response when accessed by non-admin staff.
- [x] **Automated Verification**:
  - Unit test suite: **26/26 files passed, 217/217 tests passed**.
  - TypeScript compilation: **Clean (0 errors)** verified via `tsc --noEmit`.
- [x] **Production Deployment**:
  - Pushed commit `946f768` to GitHub `yosefdc7/Iza-POS-Hardware` on branch `codex/deploy-free-evaluation`.
  - Netlify build `6ab9254c33f3d00009df6e58` finished successfully (`state: ready`).
  - Live smoke test of `/api/products/search`, `/api/products/export`, and `/api/sales/export` verified functional.

## Important Decisions
- **Strict Masking at API Layer**: Rather than merely hiding numbers in UI CSS, backend API endpoints (`/api/reports/daily-ledger`, `/api/sales/export`, `/api/products/export`) omit or zero out monetary values before transmission to non-admin clients, preventing devtools network inspection leakage.
- **POS Register Checkout Unaffected**: Cashiers at the active POS checkout register still see line totals, change, and bill calculation so they can transact with customers.
- **Tag Search in POS**: POS product search includes `{ tag: { contains: q, mode: 'insensitive' } }`, allowing cashiers to quickly find all `CHB` or `211` materials simply by searching the tag name.

## Changed Files
| File | Status | Description |
|---|---|---|
| `prisma/schema.prisma` | MODIFIED | Added `tag` column and `@@index([tag])` to `Product` model |
| `prisma/migrations/20260927190000_add_product_tag/` | CREATED | SQL migration for product tag column and index |
| `scripts/apply-tag-column.mjs` | CREATED | Script applied to live Supabase DB for tag column |
| `src/lib/validations/product.ts` | MODIFIED | Added `tag` string validation schema |
| `src/app/actions/product-actions.ts` | MODIFIED | Persisting `tag` on product create & edit |
| `src/components/products/product-form.tsx` | MODIFIED | Added Tag dropdown with CHB, 211, custom tags, and inline tag creation |
| `src/app/(app)/products/[id]/page.tsx` | MODIFIED | Display product tag badge in product details |
| `src/components/products/product-table.tsx` | MODIFIED | Tag filtering pills, tag badges, and export button |
| `src/components/products/product-export-button.tsx` | CREATED | Export to CSV button for Products |
| `src/app/api/products/export/route.ts` | CREATED | Role-aware Products CSV export endpoint |
| `src/app/(app)/sales/page.tsx` | MODIFIED | Pass `isStaff` prop to SalesTable |
| `src/components/sales/sales-table.tsx` | MODIFIED | Staff amount redaction (Items/Qty, receipt prices hidden, refund hidden) |
| `src/app/api/sales/export/route.ts` | MODIFIED | Redact financial columns from Sales CSV for staff |
| `src/lib/daily-ledger.ts` | MODIFIED | Redact financial totals and columns in CSV for non-admin |
| `src/app/api/reports/daily-ledger/route.ts` | MODIFIED | Redact price/revenue/total values in JSON payload for staff |
| `src/components/reports/daily-sales-ledger.tsx` | MODIFIED | Operational cards and hidden price columns in ledger for staff |
| `src/components/pos/product-search.tsx` | MODIFIED | Display tag pill on POS cards and search results |
| `src/app/api/products/search/route.ts` | MODIFIED | Return tag and support searching by tag in POS |
| `src/tests/daily-ledger.test.ts` | MODIFIED | Updated protected field tests for staff |
| `src/tests/daily-ledger-pricing.test.ts` | MODIFIED | Added test asserting staff financial redaction in totals & CSV |
| `CURRENT.md` | MODIFIED | Updated status, decisions, changed files, and next steps |

## Verification
- `bun test src/tests/daily-ledger.test.ts src/tests/daily-ledger-pricing.test.ts`: **15/15 tests passed**
- `bun x vitest run src/tests/`: **26/26 files passed, 217/217 tests passed**
- `tsc --noEmit`: **PASSED (0 errors)**
- Netlify Production Deploy: **Ready (Deploy ID: `6ab9254c33f3d00009df6e58`)**
- Live Smoke Test: **Verified**

## Next
- Deliver summary to user and stand by for further requirements.

## Blockers / Unknowns
- None. System is fully operational, verified, and deployed.
