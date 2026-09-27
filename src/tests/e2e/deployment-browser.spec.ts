import { test, expect } from "@playwright/test";

test("deployment browser: login, catalog mutation, refresh, reports and receipt", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/login?logout=1");
  await page.locator("#email").fill(process.env.E2E_ADMIN_EMAIL || "owner@example.test");
  await page.locator("#password").fill(process.env.E2E_ADMIN_PASSWORD || "Local-test-password-2026");
  await page.locator("#password-submit-btn").click();
  await expect(page).toHaveURL(/\/pos/, { timeout: 90_000 });
  await page.goto("/products/new");
  const name = `Deployment browser product ${Date.now()}`;
  await page.locator('input[name="name"]').fill(name);
  await page.locator('input[name="price"]').fill("12.50");
  await page.locator('input[name="stock"]').fill("20");
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/products(?:\?.*)?$/, { timeout: 60_000 });
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await page.goto("/reports");
  await expect(page.locator("h1").first()).toBeVisible();
  await expect(page.getByText("Application error", { exact: false })).toHaveCount(0);
  await page.goto("/pos");
  await page.screenshot({ path: "test-results/deployment-pos.png", fullPage: true });
  const search = page.locator('input[placeholder*="Search"]').first();
  await search.fill(name);
  await page.getByRole("button", { name: new RegExp(name) }).first().click();
  await page.getByRole("button", { name: /^Checkout/i }).click();
  await expect(page.locator("#receipt-print")).toBeVisible();
  await expect(page.locator("#receipt-print")).toContainText("12.50");
  await page.screenshot({ path: "test-results/deployment-receipt.png", fullPage: true });
});

