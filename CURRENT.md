# CURRENT.md

## Objective
Deepen browser-based offline capabilities (Architecture Candidate 1: Deep Checkout Module) by collapsing offline sale queuing, strict local inventory validation, local stock decrements, and instant receipt generation behind a single deep checkout interface with ports and adapters (`OnlineCheckoutAdapter`, `OfflineCheckoutAdapter`, `MemoryStorageAdapter`).

## Status
Candidate 1 implemented, tested, and verified clean. 0 TypeScript compiler errors (`bun x tsc --noEmit`). All 27 unit test suites passed (226/226 tests). Production Next.js build verified successful (`bun run build` with all 27 static routes generated).

## Completed
- [x] **Domain Modeling & Decision Grilling (`CONTEXT.md`)**:
  - Sharpened domain vocabulary with `Offline Receipt` and `Local Stock Allocation`.
  - Aligned on offline receipt reference format: `[Series]-OFF-[Sequence]` (e.g. `211-OFF-000001`).
  - Aligned on strict local stock validation: checkout is blocked with an informative message if requested quantity (including packaging conversion factors) exceeds local inventory cache.
- [x] **Local Storage Seam & IndexedDB Helper Methods (`src/lib/pglite.ts`)**:
  - Extended `ProductCacheItem` to retain `tag`, `lowStockThreshold`, and `packagings`.
  - Added `getProductFromCache(id)` to retrieve cached products for checkout validation.
  - Added `decrementProductStockInCache(productId, quantityToDeduct)` to perform atomic local stock deductions.
  - Added `allocateOfflineReceiptNumber(seriesName)` to manage sequential, monotonically incrementing offline receipt numbers isolated by series.
- [x] **Deep Checkout Module (`src/lib/checkout/`)**:
  - `types.ts`: Defined `CheckoutIntent`, `CheckoutResult`, `CheckoutPort`, and `CheckoutStoragePort` interfaces.
  - `storage-adapters.ts`: Created `IndexedDBStorageAdapter` for native browser IndexedDB/localStorage, and `MemoryStorageAdapter` for fast test runs.
  - `offline-adapter.ts` (`OfflineCheckoutAdapter`): Enforces strict stock validation against local cache, decrements inventory, issues `[Series]-OFF-[Sequence]` receipts, compiles full `ReceiptData`, fires `pos:stock-changed` with low/out-of-stock alerts, and persists idempotent requests to `/api/sales` in `sync_queue`.
  - `online-adapter.ts` (`OnlineCheckoutAdapter`): Dispatches HTTP POST to `/api/sales` with session tokens, maps server response to `ReceiptData`, and returns authoritative server receipt reference.
  - `checkout-engine.ts` (`CheckoutEngine`): Deep coordinator that handles offline pre-detection and transparent fallback from online network errors (`TypeError`, `fetch failed`) to offline adapter, while re-throwing authentic server validation errors.
  - `index.ts`: Exports singleton `checkoutEngine` and all ports/adapters.
- [x] **Sync Queue Header Hardening (`src/lib/sync.ts`)**:
  - Attached `Authorization: Bearer <token>` and `x-session-token` to replayed requests during offline queue reconciliation.
- [x] **POS Register UI Refactoring (`payment-panel.tsx` & `pos-screen.tsx`)**:
  - Collapsed ~100 lines of manual HTTP/IndexedDB branching in `payment-panel.tsx` into a single `checkoutEngine.execute(...)` call.
  - Updated `PaymentPanelProps.onSaleComplete` and `pos-screen.tsx` to handle both online and offline completions seamlessly, opening `ReceiptModal` immediately so customers receive a printed ticket even while disconnected.
- [x] **Automated Verification**:
  - Created `src/tests/checkout-module.test.ts` (9/9 tests passed).
  - All 27 unit test suites passed (226/226 tests passed via `bun x vitest run src/tests/`).
  - TypeScript type check verified clean (`bun x tsc --noEmit`: 0 errors).
  - Production build verified clean (`bun run build`: 27/27 static pages generated).

## Important Decisions
- **Unified Receipt Experience**: Offline sales trigger the same `ReceiptModal` and issue customer receipts immediately using `[Series]-OFF-[Sequence]` numbering instead of displaying an opaque toast with no receipt.
- **Strict Stock Allocation**: Offline checkouts validate local inventory before deducting, preventing cashiers from overselling out-of-stock items while disconnected.
- **Two Real Adapters Behind One Seam**: The checkout seam is backed by real browser IndexedDB and in-memory test adapters, ensuring tests execute without DOM mocks or network dependencies.

## Changed Files
| File | Status | Description |
|---|---|---|
| `CONTEXT.md` | MODIFIED | Added Offline Receipt and Local Stock Allocation definitions |
| `src/lib/pglite.ts` | MODIFIED | Added `getProductFromCache`, `decrementProductStockInCache`, and `allocateOfflineReceiptNumber` |
| `src/lib/checkout/types.ts` | CREATED | Types and port interfaces for Checkout Module |
| `src/lib/checkout/storage-adapters.ts` | CREATED | IndexedDB and Memory storage adapters implementing `CheckoutStoragePort` |
| `src/lib/checkout/offline-adapter.ts` | CREATED | Offline adapter with strict validation, stock deduction, and receipt generation |
| `src/lib/checkout/online-adapter.ts` | CREATED | Online adapter for server sale submission |
| `src/lib/checkout/checkout-engine.ts` | CREATED | Deep coordinator with seamless network error fallback |
| `src/lib/checkout/index.ts` | CREATED | Main export for checkout module and singleton engine |
| `src/lib/sync.ts` | MODIFIED | Included auth headers from session token during offline queue replay |
| `src/components/pos/payment-panel.tsx` | MODIFIED | Replaced shallow branching with single checkoutEngine.execute call |
| `src/components/pos/pos-screen.tsx` | MODIFIED | Updated handleSaleComplete to handle offline receipts with immediate modal |
| `src/tests/checkout-module.test.ts` | CREATED | Unit tests covering online, offline, stock limits, box units, and fallback |
| `CURRENT.md` | MODIFIED | Updated status, decisions, changed files, and verification |

## Verification
- `bun x vitest run src/tests/checkout-module.test.ts`: **9/9 tests passed**
- `bun x vitest run src/tests/`: **27/27 test files passed, 226/226 tests passed**
- `bun x tsc --noEmit`: **PASSED (0 errors)**
- `bun run build`: **PASSED — Compiled successfully, 27/27 static pages generated**

## Next
- Commit changes and deploy to GitHub / Netlify.
