export function pendingCheckout(userId: string, body: Record<string, unknown>): { id: string; body: Record<string, unknown> } {
  const key = `izah-checkout-${userId}`;
  const saved = localStorage.getItem(key);
  if (saved) {
    const pending = JSON.parse(saved);
    if (JSON.stringify(pending.body) !== JSON.stringify(body)) throw new Error("Finish the previous checkout before changing its items or payment. Restore its details and retry; it will not be charged twice.");
    return pending;
  }
  const pending = { id: crypto.randomUUID(), body };
  localStorage.setItem(key, JSON.stringify(pending));
  return pending;
}
export function completeCheckout(userId: string) { localStorage.removeItem(`izah-checkout-${userId}`); }
export async function activateBrowserSession(token: string, userId: string) {
  localStorage.setItem("izah_session_token", token);
  localStorage.setItem("izah_user_id", userId);
  const url = new URL(location.href);
  url.searchParams.delete("token"); url.searchParams.delete("session_token");
  history.replaceState(null, "", url.pathname + url.search + url.hash);
  if ("caches" in window) await Promise.all((await caches.keys()).filter(name => name.startsWith("izah-pos-")).map(name => caches.delete(name)));
}
