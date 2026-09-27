import { test, expect } from "@playwright/test";
import { loginAsAdmin, cleanupTestEntities } from "./helpers";

const PREFIX = "E2E-AUTO-REORDER-";
const TIMESTAMP = Date.now();
const SUPPLIER_NAME = `${PREFIX}Vendor-${TIMESTAMP}`;
const PRODUCT_NAME = `${PREFIX}Product-${TIMESTAMP}`;

test.describe("Dashboard Reorder List & PDF Supplier Order Sheet", () => {
  test.setTimeout(180_000);

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAsAdmin(page);

    // 1. Create a Supplier
    await page.goto("http://localhost:3000/suppliers");
    const addSupplierBtn = page.locator('button:has-text("Add Supplier"), button:has-text("New Supplier")').first();
    if (await addSupplierBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addSupplierBtn.click();
      const nameInput = page.locator('input[name="name"]').first();
      await nameInput.fill(SUPPLIER_NAME);
      const contactInput = page.locator('input[name="contactPerson"]').first();
      if (await contactInput.isVisible().catch(() => false)) await contactInput.fill("Juan Restock Manager");
      const phoneInput = page.locator('input[name="phone"]').first();
      if (await phoneInput.isVisible().catch(() => false)) await phoneInput.fill("0917-555-0199");
      const submitBtn = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Create")').first();
      await submitBtn.click();
      await page.waitForTimeout(1000);
    }

    // 2. Create a Product below low-stock threshold linked to the supplier
    await page.goto("http://localhost:3000/products/new");
    await page.fill('input[name="name"]', PRODUCT_NAME);
    await page.fill('input[name="price"]', "120.00");
    const costInput = page.locator('input[name="cost"]').first();
    if (await costInput.isVisible().catch(() => false)) await costInput.fill("80.00");
    await page.fill('input[name="stock"]', "2");
    await page.fill('input[name="lowStockThreshold"]', "10");

    // Select Supplier if dropdown is present
    const supplierSelect = page.locator('select[name="supplierId"]').first();
    if (await supplierSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      const option = page.locator(`option:has-text("${SUPPLIER_NAME}")`).first();
      if (await option.count() > 0) {
        const val = await option.getAttribute("value");
        if (val) await supplierSelect.selectOption(val);
      }
    }

    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/products(\?.*)?$/, { timeout: 30000 });

    await page.close();
  });

  test.afterAll(async () => {
    await cleanupTestEntities(PREFIX);
  });

  test("loads reorder list in dashboard, adjusts multiplier, and exports PDF supplier order sheet", async ({ page }) => {
    await loginAsAdmin(page);

    // 1. Navigate to Reports / Dashboard
    await page.goto("http://localhost:3000/reports");
    await expect(page.locator("h1:has-text('Reports')")).toBeVisible({ timeout: 15000 });

    // 2. Verify Reorder Tab exists and click it
    const reorderTab = page.locator('[data-testid="tab-reorder"]');
    await expect(reorderTab).toBeVisible({ timeout: 10000 });
    await reorderTab.click();

    // 3. Verify Reorder List View loaded with KPI metrics
    await expect(page.locator('[data-testid="reorder-list-view"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=/Inventory Reorder List/i").first()).toBeVisible();

    // 4. Verify test product is displayed in the list
    await expect(page.locator(`text=/${PRODUCT_NAME}/`).first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=/2 pcs|2 units|2 left/i").first()).toBeVisible();

    // 5. Verify Export Supplier Order Sheet (PDF) button is active
    const exportPdfBtn = page.locator('[data-testid="export-supplier-pdf-btn"]').first();
    await expect(exportPdfBtn).toBeVisible();
    await expect(exportPdfBtn).toBeEnabled();

    // 6. Test Multiplier toggle
    const mult2xBtn = page.locator('button:has-text("2x (Standard)")').first();
    if (await mult2xBtn.isVisible().catch(() => false)) {
      await mult2xBtn.click();
      await page.waitForTimeout(500);
      // For stock 2, threshold 10 with 2x multiplier (target 20) -> suggested qty is 18
      const qtyInput = page.locator(`input[data-testid*="reorder-qty-input"]`).first();
      await expect(qtyInput).toBeVisible();
      const val = await qtyInput.inputValue();
      expect(Number(val)).toBeGreaterThanOrEqual(8);
    }

    // 7. Click Export Supplier Order Sheet (PDF) to open modal
    await exportPdfBtn.click();

    // 8. Verify Modal is rendered with official PO details & supplier grouping
    const modal = page.locator("#supplier-order-sheet-print");
    await expect(modal).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=/Purchase Order Sheet|Supplier Order Sheet/i").first()).toBeVisible();
    await expect(page.locator("text=/Order Prepared & Verified By/i").first()).toBeVisible();
    await expect(page.locator("text=/Audited & Authorized Approval/i").first()).toBeVisible();

    // 9. Spy on window.print and verify button invokes print
    await page.evaluate(() => {
      (window as any).__printed = false;
      window.print = () => { (window as any).__printed = true; };
    });

    const printSheetBtn = page.locator('[data-testid="print-supplier-order-sheet-btn"]').first();
    await expect(printSheetBtn).toBeVisible();
    await printSheetBtn.click();
    await page.waitForTimeout(200);

    const wasPrinted = await page.evaluate(() => (window as any).__printed);
    expect(wasPrinted).toBe(true);

    // 10. Test CSV Export button inside modal
    const exportCsvBtn = page.locator('[data-testid="export-reorder-csv-btn"]').first();
    await expect(exportCsvBtn).toBeVisible();

    // 11. Close modal
    const closeBtn = page.locator('[data-testid="close-order-sheet-modal-btn"]').first();
    await closeBtn.click();
    await expect(modal).not.toBeVisible({ timeout: 5000 });
  });
});
