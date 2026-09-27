"use client";
import { useEffect, useState } from "react";
import { activateBrowserSession } from "@/lib/browser-session";
export function BootstrapForm() {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const supplied = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (supplied) setToken(supplied);
    history.replaceState(null, "", window.location.pathname);
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch("/api/setup/bootstrap", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, token }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await activateBrowserSession(result.token, result.userId);
      window.location.replace("/pos");
    } catch (err) { setError(err instanceof Error ? err.message : "Setup failed"); setBusy(false); }
  }
  return <form onSubmit={submit} className="mx-auto max-w-md space-y-5 rounded-2xl bg-white p-8 shadow-lg">
    <h1 className="text-2xl font-bold text-slate-900">Set up your store</h1>
    <p className="text-sm text-slate-600">Create your administrator account to open your empty POS store.</p>
    {!token && <p role="alert" className="text-amber-800">Open the private setup link supplied with your deployment.</p>}
    {([{ name: "name", label: "Your name", type: "text" }, { name: "email", label: "Email", type: "email" }, { name: "password", label: "Password (at least 12 characters)", type: "password" }, { name: "businessName", label: "Business name", type: "text" }] as const).map(field => <label key={field.name} className="block text-sm font-medium text-slate-800">{field.label}<input required name={field.name} type={field.type} minLength={field.name === "password" ? 12 : 1} maxLength={field.name === "password" ? 256 : 150} autoComplete={field.name === "password" ? "new-password" : undefined} className="mt-1 block w-full rounded-lg border border-slate-300 p-3" /></label>)}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <button disabled={!token || busy} className="w-full rounded-lg bg-slate-900 p-3 font-semibold text-white disabled:opacity-50">{busy ? "Creating your store…" : "Create administrator and open POS"}</button>
    <a href="/login" className="block text-center text-sm underline">Already set up? Sign in</a>
  </form>;
}
