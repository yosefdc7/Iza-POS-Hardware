import { beforeEach, expect, it } from "vitest";
import { pendingCheckout, completeCheckout, activateBrowserSession } from "@/lib/browser-session";
beforeEach(() => localStorage.clear());
it("recovers an immutable checkout ID across reloads and rejects changed payloads", () => {
  const first = pendingCheckout("owner-a", { items: [1] });
  expect(JSON.parse(localStorage.getItem("izah-checkout-owner-a")!).id).toBe(first.id);
  expect(pendingCheckout("owner-a", { items: [1] }).id).toBe(first.id);
  expect(() => pendingCheckout("owner-a", { items: [2] })).toThrow(/previous checkout/i);
  completeCheckout("owner-a");
  expect(pendingCheckout("owner-a", { items: [1] }).id).not.toBe(first.id);
});
it("switching accounts replaces stored and URL credentials", async () => {
  localStorage.setItem("izah_session_token", "old-admin-token");
  history.replaceState(null, "", "/pos?session_token=old-admin-token");
  await activateBrowserSession("new-cashier-token", "cashier-id");
  expect(localStorage.getItem("izah_session_token")).toBe("new-cashier-token");
  expect(localStorage.getItem("izah_user_id")).toBe("cashier-id");
  expect(location.search).not.toContain("old-admin-token");
});
