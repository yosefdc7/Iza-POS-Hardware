# CURRENT.md

## Objective
Implement hardware-specific Unit of Measure (UoM) dropdown, custom unit management in Settings and inline product creation, single-pool Box-to-Piece packaging math, and dual inventory display across catalog, details, and stock adjustments. Verify resilience, push to GitHub, and deploy to Netlify.

## Status
All features implemented and verified. Clean TypeScript compilation (0 errors). All 26 unit test suites passed (216/216 tests). Ready for commit, push, and deployment.

## Completed
- [x] **Hardware Units Taxonomy & Helper (`src/lib/hardware-units.ts`)**:
  - 26 standard hardware units across Count, Length, Weight, Volume, and Bulk (`pc`, `box`, `roll`, `kg`, `m`, `sheet`, `bag`, `tin`, `drum`, etc.).
  - Mathematical breakdown helper `computeStockBreakdown(stock, unit, packagings)` computing full boxes and loose remainder.
  - Live packaging pricing helper `computePackagingPricing(conversionQty, basePrice, packagingPrice, packagingCost)`.
- [x] **Units Management API & Settings (`src/app/api/units/route.ts`, `UnitsManager`)**:
  - Dynamic API merging default hardware units, database-persisted custom units (`StoreUnit`), and existing product units.
  - Self-healing table initialization for `StoreUnit` via raw query fallback if not already migrated.
  - Dedicated Units management panel in `/settings` allowing custom unit creation and deletion.
- [x] **Product Creation & Inline Packaging Math (`product-form.tsx`, `product-actions.ts`)**:
  - Categorized unit dropdown replacing raw text input with quick `+ Add unit` inline creation modal.
  - Integrated Box packaging toggle with live conversion math: derived piece price, derived unit cost, and bulk discount percentage.
  - Atomic database transaction creating both `Product` and `ProductPackaging` records on submission.
- [x] **Dual Stock Display & Box Stock Receiving (`product-table.tsx`, `products/[id]/page.tsx`, `stock-adjust-modal.tsx`, `stock-adjust-button.tsx`)**:
  - Catalog and detail views display both base units and box conversions (e.g. `435 pc (4 boxes + 35 pc)`).
  - Stock adjustment modal supports toggling between Base Unit and Packaging units (e.g., adding `+5 Boxes` auto-multiplies by conversion quantity to increment inventory by `+500 pcs` with clear calculation audit preview).
- [x] **Automated Verification**:
  - 216 unit tests passed across 26 test suites (`hardware-units.test.ts`, `product-approval.test.ts`, `deployment.test.ts`, `checkout-stock.test.ts`, etc.).
  - TypeScript compilation clean: 0 errors (`bun x tsc --noEmit`).

## Important Decisions
- **Single-Pool Base Storage**: Stock is strictly tracked in the base unit (`pc`), preventing stock desynchronization. Full boxes and loose units are mathematically derived on demand.
- **Conversion Multiplier in Stock Adjustments**: Entering packaging count in adjustments translates directly to base unit deltas for audit fidelity.
- **Zod Namespace Compatibility**: Adopted `import * as z from 'zod'` to ensure seamless runtime and test runner compatibility across ESM, CommonJS, and Next.js route handlers.

## Verification
- Unit test suite: **26/26 files passed, 216/216 tests passed**.
- TypeScript: **Clean (0 errors)**.

## Next
- Commit changes and push branch `codex/deploy-free-evaluation` to GitHub `yosefdc7/Iza-POS-Hardware`.
- Verify Netlify build and automated publication.
- Smoke-test live endpoints (`/products`, `/products/new`, `/settings`, `/api/units`).
