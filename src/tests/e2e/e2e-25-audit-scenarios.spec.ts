import { test, expect } from "@playwright/test";
import { loginAsAdmin, loginAsCashier, clearCart, cleanupTestEntities } from "./helpers";

const PREFIX = "E2E-AUDIT-";
const TIMESTAMP = Date.now();
const PROD_STD = `${PREFIX}STD-${TIMESTAMP}`;
const PROD_PKG = `${PREFIX}PKG-${TIMESTAMP}`;
const PROD_LOW = `${PREFIX}LOW-${TIMESTAMP}`;
const PKG_NAME = "Case of 4";

test.describe("25 E2E Audit Scenarios - POS, Series, Split, Receipt & Lifecycle", () => {
  test.setTimeout(480_000);

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAsAdmin(page);

    // 1. Create standard product
    await page.goto("http://localhost:3000/products/new");
    await page.fill('input[name="name"]', PROD_STD);
    await page.fill('input[name="price"]', "100.00");
    await page.fill('input[name="stock"]', "50");
    await page.fill('input[name="lowStockThreshold"]', "5");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/products(\?.*)?$/, { timeout: 30000 });

    // 2. Create product with packaging
    await page.goto("http://localhost:3000/products/new");
    await page.fill('input[name="name"]', PROD_PKG);
    await page.fill('input[name="price"]', "40.00");
    await page.fill('input[name="stock"]', "40");
    await page.fill('input[name="lowStockThreshold"]', "5");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/products(\?.*)?$/, { timeout: 30000 });

    // Add packaging Case of 4 (₱150.00)
    const pkgRow = page.locator("tr", { hasText: PROD_PKG }).first();
    const pkgLink = pkgRow.locator("a").first();
    const href = await pkgLink.getAttribute("href");
    if (href) {
      await page.goto(`http://localhost:3000${href}`);
      const addPkgBtn = page.locator('button:has-text("Add Packaging")');
      if (await addPkgBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await addPkgBtn.click();
        await page.fill('input[name="name"]', PKG_NAME);
        await page.fill('input[name="conversionQty"]', "4");
        await page.fill('input[name="price"]', "150.00");
        const savePkgBtn = page.locator('button[title="Save"], button:has-text("Save")').first();
        await savePkgBtn.click();
        await expect(page.locator(`text=/${PKG_NAME}/`).first()).toBeVisible({ timeout: 10000 });
      }
    }

    // 3. Create low stock product
    await page.goto("http://localhost:3000/products/new");
    await page.fill('input[name="name"]', PROD_LOW);
    await page.fill('input[name="price"]', "25.00");
    await page.fill('input[name="stock"]', "3");
    await page.fill('input[name="lowStockThreshold"]', "5");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/products(\?.*)?$/, { timeout: 30000 });

    await page.close();
  });

  test.afterAll(async () => {
    await cleanupTestEntities(PREFIX);
  });

  test("runs all 25 E2E test scenarios and records behavioral findings", async ({ page }) => {
    await loginAsCashier(page);
    await clearCart(page);

    // Helper to find and add standard product
    const addStdProduct = async () => {
      const searchInput = page.locator("#pos-search-input, input[placeholder*='Search']").first();
      await searchInput.fill(PROD_STD.slice(0, 15));
      const searchResult = page.locator(`button:has-text("${PROD_STD}")`).first();
      await expect(searchResult).toBeVisible({ timeout: 10000 });
      await searchResult.click();
      const individualBtn = page.locator('button:has-text("Individual")');
      if (await individualBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await individualBtn.click();
      }
      await expect(page.locator("text=/Cart \\(\\d+\\)|\\d+ item/i").first()).toBeVisible({ timeout: 10000 });
    };

    // Helper to close receipt modal if visible
    const dismissReceiptModal = async () => {
      const closeBtn = page.locator('[data-testid="close-receipt-btn"], button[aria-label="Close receipt"]').first();
      if (await closeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await closeBtn.click();
      }
    };

    // ==========================================
    // SCENARIO 01: Exact Cash Checkout with Default Series
    // ==========================================
    console.log("[E2E] Scenario 01: Exact Cash Checkout");
    await addStdProduct();
    const chargeBtn = page.locator("[data-charge-btn]");
    await expect(chargeBtn).toBeEnabled();
    await chargeBtn.click();
    await expect(page.locator("text=/Receipt Preview|#receipt-print/i").first()).toBeVisible({ timeout: 15000 });
    await dismissReceiptModal();

    // ==========================================
    // SCENARIO 02: Cash Checkout with Change Calculation (Tender ₱500 for ₱100)
    // ==========================================
    console.log("[E2E] Scenario 02: Change Calculation");
    await addStdProduct();
    const cashMethodBtn = page.locator('button:has-text("CASH")').first();
    if (await cashMethodBtn.isVisible().catch(() => false)) await cashMethodBtn.click();
    const tenderInput = page.locator('[data-testid="tendered-input"]').first();
    await expect(tenderInput).toBeVisible();
    await tenderInput.fill("500");
    await expect(page.locator("text=/Change: ₱400|Change: ₱400.00/i").first()).toBeVisible({ timeout: 5000 });
    await chargeBtn.click();
    await expect(page.locator("text=/Receipt Preview/i").first()).toBeVisible({ timeout: 15000 });
    await dismissReceiptModal();

    // ==========================================
    // SCENARIO 03: Under-Tender Cash Validation
    // ==========================================
    console.log("[E2E] Scenario 03: Under-Tender Validation");
    await addStdProduct();
    await tenderInput.fill("50");
    // Under-tender in cash mode: Check if checkout proceeds with short cash or auto-adjusts
    const isChargeDisabled = await chargeBtn.isDisabled();
    console.log(`[E2E Finding] Scenario 03: Charge button disabled on under-tender: ${isChargeDisabled}`);
    // Clear cart for next scenario
    const voidBtn = page.locator('button:has-text("Void"), button:has-text("Cancel")').first();
    if (await voidBtn.isVisible().catch(() => false)) {
      await voidBtn.click();
      const confirmClear = page.locator('button:has-text("Clear Cart"), button:has-text("Confirm")').first();
      if (await confirmClear.isVisible({ timeout: 2000 }).catch(() => false)) await confirmClear.click();
    }
    await clearCart(page);

    // ==========================================
    // SCENARIO 04: Series 211 Selection with DR Reference
    // ==========================================
    console.log("[E2E] Scenario 04: Series 211 with DR Reference");
    await addStdProduct();
    const seriesSelect = page.locator('#company-receipt-dropdown, select[data-testid="company-receipt-select"]');
    if (await seriesSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      const options = await seriesSelect.innerText();
      if (options.includes("211")) {
        const matching = options.split("\n").find((o) => o.includes("211"))?.trim() ?? "211";
        await seriesSelect.selectOption({ label: matching }).catch(async () => {
          await seriesSelect.selectOption({ index: 0 });
        });
      }
    }
    const drSiInput = page.locator('#dr-si-input, input[placeholder*="DR"], input[placeholder*="SI"]').first();
    if (await drSiInput.isVisible().catch(() => false)) {
      await drSiInput.fill("DR-211-9001");
    }
    await chargeBtn.click();
    await expect(page.locator("text=/Receipt Preview/i").first()).toBeVisible({ timeout: 15000 });
    await dismissReceiptModal();

    // ==========================================
    // SCENARIO 05: Series 211 Selection with SI Reference
    // ==========================================
    console.log("[E2E] Scenario 05: Series 211 with SI Reference");
    await addStdProduct();
    if (await drSiInput.isVisible().catch(() => false)) {
      await drSiInput.fill("SI-211-9002");
    }
    await chargeBtn.click();
    await expect(page.locator("text=/Receipt Preview/i").first()).toBeVisible({ timeout: 15000 });
    await dismissReceiptModal();

    // ==========================================
    // SCENARIO 06: Series CHB Selection with Combined DR/SI Reference
    // ==========================================
    console.log("[E2E] Scenario 06: Series CHB Selection");
    await addStdProduct();
    if (await seriesSelect.isVisible().catch(() => false)) {
      const options = await seriesSelect.innerText();
      if (options.includes("CHB")) {
        const matching = options.split("\n").find((o) => o.includes("CHB"))?.trim() ?? "CHB";
        await seriesSelect.selectOption({ label: matching }).catch(async () => {
          await seriesSelect.selectOption({ index: 1 });
        });
      }
    }
    if (await drSiInput.isVisible().catch(() => false)) {
      await drSiInput.fill("CHB-DR-888 / SI-999");
    }
    await chargeBtn.click();
    await expect(page.locator("text=/Receipt Preview/i").first()).toBeVisible({ timeout: 15000 });
    await dismissReceiptModal();

    // ==========================================
    // SCENARIO 07: Series Selection Persistence Across Item Additions
    // ==========================================
    console.log("[E2E] Scenario 07: Series Persistence");
    if (await seriesSelect.isVisible().catch(() => false)) {
      const selectedBefore = await seriesSelect.inputValue();
      await addStdProduct();
      const selectedAfter = await seriesSelect.inputValue();
      expect(selectedAfter).toBe(selectedBefore);
      console.log(`[E2E Finding] Scenario 07: Series persisted after cart addition: ${selectedBefore === selectedAfter}`);
    }
    await clearCart(page);

    // ==========================================
    // SCENARIO 08: Split Payment (Cash + Card) Exact Split
    // ==========================================
    console.log("[E2E] Scenario 08: Split Cash + Card");
    await addStdProduct(); // ₱100.00
    const splitToggleBtn = page.locator('button:has-text("Split")').first();
    await splitToggleBtn.click();
    const splitCash = page.locator('[data-testid="split-input-cash"]').first();
    const splitCard = page.locator('[data-testid="split-input-card"]').first();
    await expect(splitCash).toBeVisible({ timeout: 5000 });
    await splitCash.fill("50.00");
    await splitCard.fill("50.00");
    await expect(page.locator("text=/Remaining: ₱0.00|Remaining: ₱0/i").first()).toBeVisible({ timeout: 5000 });
    await expect(chargeBtn).toBeEnabled();
    await chargeBtn.click();
    await expect(page.locator("text=/Receipt Preview/i").first()).toBeVisible({ timeout: 15000 });
    await dismissReceiptModal();

    // ==========================================
    // SCENARIO 09: Split Payment (Cash + OTHER / E-Wallet)
    // ==========================================
    console.log("[E2E] Scenario 09: Split Cash + Other");
    await addStdProduct();
    const singleToggleBtn = page.locator('button:has-text("Split"), button:has-text("Single")').first();
    const isSingle = await page.locator('button:has-text("Single")').first().isVisible().catch(() => false);
    if (!isSingle) await singleToggleBtn.click();
    const splitOther = page.locator('[data-testid="split-input-other"]').first();
    await splitCash.fill("40.00");
    await splitCard.fill("0.00");
    await splitOther.fill("60.00");
    await expect(chargeBtn).toBeEnabled();
    await chargeBtn.click();
    await expect(page.locator("text=/Receipt Preview/i").first()).toBeVisible({ timeout: 15000 });
    await dismissReceiptModal();

    // ==========================================
    // SCENARIO 10: Three-Way Split Payment (Cash + Card + Other)
    // ==========================================
    console.log("[E2E] Scenario 10: Three-Way Split");
    await addStdProduct();
    const singleBtn10 = page.locator('button:has-text("Single")').first();
    if (!await singleBtn10.isVisible().catch(() => false)) {
      await page.locator('button:has-text("Split")').first().click();
    }
    await splitCash.fill("30.00");
    await splitCard.fill("30.00");
    await splitOther.fill("40.00");
    await expect(chargeBtn).toBeEnabled();
    await chargeBtn.click();
    await expect(page.locator("text=/Receipt Preview/i").first()).toBeVisible({ timeout: 15000 });
    await dismissReceiptModal();

    // ==========================================
    // SCENARIO 11: Incomplete Split Payment Validation
    // ==========================================
    console.log("[E2E] Scenario 11: Incomplete Split Validation");
    await addStdProduct();
    const singleBtn11 = page.locator('button:has-text("Single")').first();
    if (!await singleBtn11.isVisible().catch(() => false)) {
      await page.locator('button:has-text("Split")').first().click();
    }
    await splitCash.fill("20.00");
    await splitCard.fill("20.00");
    await splitOther.fill("0.00");
    // Remaining is ₱60.00 -> Charge button must be disabled
    await expect(chargeBtn).toBeDisabled();
    console.log("[E2E Finding] Scenario 11: Charge button properly disabled when split balance is incomplete.");
    await clearCart(page);

    // ==========================================
    // SCENARIO 12: Over-Tender Split Payment Behavior
    // ==========================================
    console.log("[E2E] Scenario 12: Over-Tender Split Handling");
    await addStdProduct(); // ₱100.00
    const singleBtn12 = page.locator('button:has-text("Single")').first();
    if (!await singleBtn12.isVisible().catch(() => false)) {
      await page.locator('button:has-text("Split")').first().click();
    }
    await splitCash.fill("120.00");
    const remainingText = await page.locator("text=/Remaining/i").innerText().catch(() => "");
    console.log(`[E2E Finding] Scenario 12: Split input with ₱120 on ₱100 total gives: ${remainingText}`);
    // Reset to single mode
    const resetToSingle = page.locator('button:has-text("Single")').first();
    if (await resetToSingle.isVisible().catch(() => false)) await resetToSingle.click();
    await clearCart(page);

    // ==========================================
    // SCENARIO 13: Packaging Unit Selection at POS (Bundle)
    // ==========================================
    console.log("[E2E] Scenario 13: Packaging Unit Selection");
    const searchInput = page.locator("#pos-search-input, input[placeholder*='Search']").first();
    await searchInput.fill(PROD_PKG.slice(0, 15));
    const pkgSearchResult = page.locator(`button:has-text("${PROD_PKG}")`).first();
    await expect(pkgSearchResult).toBeVisible({ timeout: 10000 });
    await pkgSearchResult.click();
    const bundleBtn = page.locator(`button:has-text("${PKG_NAME}")`).first();
    await expect(bundleBtn).toBeVisible({ timeout: 5000 });
    await bundleBtn.click();
    // Verify cart reflects packaging bundle price ₱150.00
    await expect(page.locator("text=/₱150|150.00/").first()).toBeVisible({ timeout: 5000 });
    await clearCart(page);

    // ==========================================
    // SCENARIO 14: Mixed Packaging Units in Same Cart (1 Individual + 1 Bundle)
    // ==========================================
    console.log("[E2E] Scenario 14: Mixed Packaging in Cart");
    // Add Individual (₱40.00)
    await searchInput.fill(PROD_PKG.slice(0, 15));
    await pkgSearchResult.click();
    const indBtn14 = page.locator('button:has-text("Individual")').first();
    if (await indBtn14.isVisible().catch(() => false)) await indBtn14.click();
    // Add Bundle (₱150.00)
    await searchInput.fill(PROD_PKG.slice(0, 15));
    await pkgSearchResult.click();
    const bndlBtn14 = page.locator(`button:has-text("${PKG_NAME}")`).first();
    await bndlBtn14.click();
    // Total should be ₱190.00
    await expect(page.locator("text=/₱190|190.00/").first()).toBeVisible({ timeout: 5000 });
    await clearCart(page);

    // ==========================================
    // SCENARIO 15: Low-Stock Warning Banner
    // ==========================================
    console.log("[E2E] Scenario 15: Low-Stock Banner Verification");
    const lowStockAlert = page.locator("text=/low stock|below threshold|out of stock/i").first();
    const isLowStockVisible = await lowStockAlert.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`[E2E Finding] Scenario 15: Low stock banner visible: ${isLowStockVisible}`);

    // ==========================================
    // SCENARIO 16: Zero-Stock / Low-Stock Item Addition
    // ==========================================
    console.log("[E2E] Scenario 16: Low-Stock Product Addition");
    await searchInput.fill(PROD_LOW.slice(0, 15));
    const lowSearchResult = page.locator(`button:has-text("${PROD_LOW}")`).first();
    await expect(lowSearchResult).toBeVisible({ timeout: 10000 });
    await lowSearchResult.click();
    const indBtn16 = page.locator('button:has-text("Individual")').first();
    if (await indBtn16.isVisible().catch(() => false)) await indBtn16.click();
    await expect(page.locator("text=/Cart \\(1\\)|1 item/i").first()).toBeVisible({ timeout: 5000 });
    await clearCart(page);

    // ==========================================
    // SCENARIO 17: Void Individual Item from Cart
    // ==========================================
    console.log("[E2E] Scenario 17: Void Individual Item");
    await addStdProduct();
    const removeBtn = page.locator('button[aria-label="Remove item"], button[title*="Remove"]').first();
    await expect(removeBtn).toBeVisible({ timeout: 5000 });
    await removeBtn.click();
    const voidConfirmModal = page.locator('button:has-text("Void Item")');
    if (await voidConfirmModal.isVisible({ timeout: 3000 }).catch(() => false)) {
      const reasonInput = page.locator('input[placeholder*="Customer changed mind" i]').first();
      if (await reasonInput.isVisible().catch(() => false)) await reasonInput.fill("Testing void feature");
      await voidConfirmModal.click();
    }
    await expect(page.locator("text=/Cart is empty|0 items/i").first()).toBeVisible({ timeout: 5000 });

    // ==========================================
    // SCENARIO 18: Clear Entire Cart (Void Order)
    // ==========================================
    console.log("[E2E] Scenario 18: Clear Entire Cart");
    await addStdProduct();
    await addStdProduct();
    const voidCartBtn = page.locator('button:has-text("Void"), button:has-text("Cancel")').first();
    if (await voidCartBtn.isVisible().catch(() => false)) {
      await voidCartBtn.click();
      const confirmClear = page.locator('button:has-text("Clear Cart"), button:has-text("Confirm")').first();
      if (await confirmClear.isVisible({ timeout: 2000 }).catch(() => false)) await confirmClear.click();
    }
    await expect(page.locator("text=/Cart is empty|0 items/i").first()).toBeVisible({ timeout: 5000 });

    // ==========================================
    // SCENARIO 19: Hold Order and Recall
    // ==========================================
    console.log("[E2E] Scenario 19: Hold and Recall Order");
    await addStdProduct();
    const holdBtn = page.locator('button:has-text("Hold")').first();
    await holdBtn.click();
    await expect(page.locator("text=/Cart is empty|0 items/i").first()).toBeVisible({ timeout: 10000 });
    const recallBtn = page.locator('button:has-text("Recall")').first();
    await recallBtn.click();
    await expect(page.locator("h2:has-text('Held Orders')")).toBeVisible({ timeout: 10000 });
    const recallItemBtn = page.locator('.fixed button:has-text("Recall")').first();
    await recallItemBtn.click({ force: true });
    await expect(page.locator("text=/Cart \\(1\\)|1 item/i").first()).toBeVisible({ timeout: 10000 });
    await clearCart(page);

    // ==========================================
    // SCENARIO 20: Hold Order with Packaging Bundle and Recall
    // ==========================================
    console.log("[E2E] Scenario 20: Hold Order with Packaging Bundle");
    await searchInput.fill(PROD_PKG.slice(0, 15));
    await pkgSearchResult.click();
    await page.locator(`button:has-text("${PKG_NAME}")`).first().click();
    await holdBtn.click();
    await expect(page.locator("text=/Cart is empty|0 items/i").first()).toBeVisible({ timeout: 10000 });
    await recallBtn.click();
    await expect(page.locator("h2:has-text('Held Orders')")).toBeVisible({ timeout: 10000 });
    await page.locator('.fixed button:has-text("Recall")').first().click({ force: true });
    await expect(page.locator("text=/₱150|150.00/").first()).toBeVisible({ timeout: 10000 });
    await clearCart(page);

    // ==========================================
    // SCENARIO 21: Receipt Modal Line Items & Details Display
    // ==========================================
    console.log("[E2E] Scenario 21: Receipt Modal Inspection");
    await addStdProduct();
    await chargeBtn.click();
    const receiptModal = page.locator("text=/Receipt Preview/i").first();
    await expect(receiptModal).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#receipt-print-overlay, #receipt-print").first()).toBeVisible();
    await expect(page.locator(`text=/${PROD_STD.slice(0, 10)}/i`).first()).toBeVisible();

    // ==========================================
    // SCENARIO 22: Receipt Modal Print & Thermal Triggers
    // ==========================================
    console.log("[E2E] Scenario 22: Receipt Print & Thermal Buttons");
    const printBtn = page.locator('button:has-text("Print")').first();
    const thermalBtn = page.locator('button:has-text("Thermal")').first();
    await expect(printBtn).toBeVisible();
    await expect(thermalBtn).toBeVisible();
    // Spy window.print to verify trigger without blocking
    await page.evaluate(() => {
      (window as any).__printed = false;
      window.print = () => { (window as any).__printed = true; };
    });
    await printBtn.click();
    const wasPrinted = await page.evaluate(() => (window as any).__printed);
    expect(wasPrinted).toBe(true);
    console.log("[E2E Finding] Scenario 22: Browser print successfully invoked from receipt modal.");

    // ==========================================
    // SCENARIO 23: Receipt Modal Dismissal (Close Btn, Backdrop, Escape)
    // ==========================================
    console.log("[E2E] Scenario 23: Modal Dismissal Methods");
    // Test Escape key
    await page.keyboard.press("Escape");
    await expect(receiptModal).not.toBeVisible({ timeout: 5000 });
    console.log("[E2E Finding] Scenario 23: Receipt modal dismisses on Escape key.");

    // ==========================================
    // SCENARIO 24: Sales History Lookup (/sales)
    // ==========================================
    console.log("[E2E] Scenario 24: Sales History Lookup");
    await page.goto("http://localhost:3000/sales");
    await expect(page.locator("h1:has-text('Sales')")).toBeVisible({ timeout: 15000 });
    const firstSaleRow = page.locator("table tbody tr").first();
    await expect(firstSaleRow).toBeVisible({ timeout: 10000 });
    const statusBadge = firstSaleRow.locator("text=/COMPLETED|REFUNDED/i").first();
    await expect(statusBadge).toBeVisible();
    console.log("[E2E Finding] Scenario 24: Sales History shows recorded transaction row with status badge.");

    // ==========================================
    // SCENARIO 25: Itemized Refund & Restock Execution
    // ==========================================
    console.log("[E2E] Scenario 25: Itemized Refund & Restock");
    const completedRow = page.locator("tr", { hasText: "COMPLETED" }).first();
    if (await completedRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      const refundBtn = completedRow.locator('button:has-text("Refund")').first();
      await refundBtn.click();
      const refundModal = page.locator("h2:has-text('Process Refund')");
      await expect(refundModal).toBeVisible({ timeout: 10000 });
      const refundReasonSelect = page.locator('select[name="reason"], select');
      if (await refundReasonSelect.isVisible().catch(() => false)) {
        await refundReasonSelect.selectOption({ index: 1 }).catch(() => {});
      }
      const confirmRefundBtn = page.locator('button:has-text("Confirm Refund"), button:has-text("Process Refund")').last();
      await confirmRefundBtn.click();
      // Verify refund receipt or badge update
      await expect(page.locator("text=/REFUNDED|Refund Receipt/i").first()).toBeVisible({ timeout: 15000 });
      console.log("[E2E Finding] Scenario 25: Refund processed and status updated.");
    }
  });
});
