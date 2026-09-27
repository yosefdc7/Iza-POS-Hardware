"use client";

import { activateBrowserSession } from "@/lib/browser-session";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import { loginWithPinAction, getStaffForPinLoginAction } from "@/app/actions/user-actions";
import {
  KeyRound,
  Delete,
  Loader2,
  Lock,
  UserCheck,
  Shield,
  Eye,
  EyeOff,
  ArrowRight,
} from "lucide-react";

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
  hasPin: boolean;
}

export default function LoginPage() {
  const router = useRouter();

  // Mode: "pin" or "password"
  const [authMode, setAuthMode] = useState<"pin" | "password">("password");

  // PIN state
  const [pin, setPin] = useState("");
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [submittingPin, setSubmittingPin] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);

  // Email/Password state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Auto-restore session from localStorage if already logged in
  useEffect(() => {
    if (typeof window === "undefined") return;
    // A different account must never inherit cached protected pages.
    if ("caches" in window) void caches.keys().then(names => Promise.all(names.filter(name => name.startsWith("izah-pos-")).map(name => caches.delete(name))));
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.has("logout") || searchParams.has("force")) {
      try {
        localStorage.removeItem("izah_session_token");
      } catch {}
      return;
    }

    try {
      const storedToken = localStorage.getItem("izah_session_token");
      if (storedToken) {
        const redirectParam = searchParams.get("redirect") || "/pos";
        const separator = redirectParam.includes("?") ? "&" : "?";
        window.location.replace(`${redirectParam}${separator}session_token=${encodeURIComponent(storedToken)}`);
      }
    } catch {}
  }, []);

  // Load available staff profiles on mount
  useEffect(() => {
    let isMounted = true;

    async function loadStaff() {
      try {
        const res = await fetch("/api/auth/staff");
        if (res.ok) {
          const data = await res.json();
          if (!isMounted) return;
          if (data.users && data.users.length > 0) {
            setStaffList(data.users);
            const admin = data.users.find((u: StaffMember) => u.role === "ADMIN");
            setSelectedStaff(admin || data.users[0]);
            return;
          }
        }
      } catch {
        // Fallback to server action if API fetch fails
      }

      try {
        const actionRes = await getStaffForPinLoginAction();
        if (!isMounted) return;
        if (actionRes?.users && actionRes.users.length > 0) {
          setStaffList(actionRes.users);
          const admin = actionRes.users.find((u) => u.role === "ADMIN");
          setSelectedStaff(admin || actionRes.users[0]);
        }
      } catch (err) {
        console.warn("Could not load staff list:", err);
      } finally {
        if (isMounted) setLoadingStaff(false);
      }
    }

    loadStaff();

    return () => {
      isMounted = false;
    };
  }, []);

  // Submit PIN
  const handlePinSubmit = useCallback(
    async (pinValue: string, staffId?: string) => {
      if (pinValue.length !== 4) return;

      setSubmittingPin(true);
      setPinError(null);

      try {
        let authSuccess = false;
        let token: string | undefined;
        let redirectUrl: string | undefined;
        let errorMessage: string | null = null;

        // 1. Attempt PIN login via REST API
        try {
          const apiRes = await fetch("/api/auth/pin-login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ pin: pinValue, userId: staffId }),
          });
          const data = await apiRes.json().catch(() => ({}));

          if (apiRes.ok && data.success) {
            authSuccess = true;
            token = data.token;
            redirectUrl = data.redirectTo;
          } else if (data.error) {
            errorMessage = data.error;
          } else {
            errorMessage = `Login request failed (${apiRes.status})`;
          }
        } catch (fetchErr) {
          console.warn("REST pin-login fetch failed, falling back to Server Action:", fetchErr);
        }

        // 2. Fallback to Server Action if REST API didn't succeed and wasn't an explicit wrong PIN
        if (!authSuccess && (!errorMessage || errorMessage.includes("failed") || errorMessage.includes("Origin"))) {
          try {
            const actionRes = await loginWithPinAction(pinValue, staffId);
            if (actionRes.success) {
              authSuccess = true;
              token = actionRes.token;
              redirectUrl = actionRes.redirectTo;
              errorMessage = null;
            } else if (actionRes.error) {
              errorMessage = actionRes.error;
            }
          } catch (actionErr) {
            console.error("PIN login server action error:", actionErr);
          }
        }

        if (authSuccess) {
          if (token) {
            try {
              await activateBrowserSession(token, selectedStaff?.id || "");
              const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
              const cookieFlags = isHttps
                ? "; Path=/; Max-Age=604800; SameSite=None; Secure"
                : "; Path=/; Max-Age=604800; SameSite=Lax";
              document.cookie = `izah_session_token=${encodeURIComponent(token)}${cookieFlags}`;
              document.cookie = `better-auth.session_token=${encodeURIComponent(token)}${cookieFlags}`;
            } catch {}
          }
          const searchParams = new URLSearchParams(window.location.search);
          const reqRedirect = searchParams.get("redirect");
          const destination =
            reqRedirect
              ? `${reqRedirect}${reqRedirect.includes("?") ? "&" : "?"}session_token=${encodeURIComponent(token || "")}`
              : (redirectUrl || (token ? `/pos?session_token=${encodeURIComponent(token)}` : "/pos"));
          window.location.replace(destination);
          return;
        }

        // Display error and shake keypad
        setPinError(errorMessage || "Incorrect PIN. Please try again.");
        setIsShaking(true);
        setPin("");
        setTimeout(() => setIsShaking(false), 500);
      } catch (err) {
        console.error("Unexpected PIN login error:", err);
        setPinError("An unexpected error occurred. Please try again.");
        setIsShaking(true);
        setPin("");
        setTimeout(() => setIsShaking(false), 500);
      } finally {
        setSubmittingPin(false);
      }
    },
    []
  );

  // Keypad click handler
  const handleDigitClick = (digit: string) => {
    if (submittingPin || pin.length >= 4) return;
    const nextPin = pin + digit;
    setPin(nextPin);
    setPinError(null);

    if (nextPin.length === 4) {
      handlePinSubmit(nextPin, selectedStaff?.id);
    }
  };

  const handleBackspace = () => {
    if (submittingPin) return;
    setPin((prev) => prev.slice(0, -1));
    setPinError(null);
  };

  const handleClear = () => {
    if (submittingPin) return;
    setPin("");
    setPinError(null);
  };

  // Keyboard listener for physical numbers
  useEffect(() => {
    if (authMode !== "pin") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if an input is focused
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        if (pin.length < 4 && !submittingPin) {
          const nextPin = pin + e.key;
          setPin(nextPin);
          setPinError(null);
          if (nextPin.length === 4) {
            handlePinSubmit(nextPin, selectedStaff?.id);
          }
        }
      } else if (e.key === "Backspace") {
        e.preventDefault();
        setPin((prev) => prev.slice(0, -1));
        setPinError(null);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setPin("");
        setPinError(null);
      } else if (e.key === "Enter" && pin.length === 4) {
        e.preventDefault();
        handlePinSubmit(pin, selectedStaff?.id);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [authMode, pin, submittingPin, selectedStaff, handlePinSubmit]);

  // Email/Password submit handler
  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordLoading(true);

    const result = await signIn.email({
      email: email.trim(),
      password: password.trim(),
    });

    if (result.error) {
      const msg = result.error.message ?? result.error.code ?? "Sign-in failed";
      setPasswordError(msg);
      setPasswordLoading(false);
      return;
    }

    const token = result.data?.token;
    if (token) {
      try {
        await activateBrowserSession(token, result.data!.user.id);
        document.cookie = `izah_session_token=${encodeURIComponent(token)}; Path=/; Max-Age=604800; SameSite=None; Secure`;
        document.cookie = `better-auth.session_token=${encodeURIComponent(token)}; Path=/; Max-Age=604800; SameSite=None; Secure`;
      } catch {}
    }

    const searchParams = new URLSearchParams(window.location.search);
    const reqRedirect = searchParams.get("redirect");
    const destination =
      reqRedirect
        ? `${reqRedirect}${reqRedirect.includes("?") ? "&" : "?"}session_token=${encodeURIComponent(token || "")}`
        : (token ? `/pos?session_token=${encodeURIComponent(token)}` : "/pos");

    window.location.replace(destination);
  }

  const inputClass =
    "flex h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition-all focus:border-[#0f2044] focus:bg-white focus:ring-2 focus:ring-[#0f2044]/10 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div
      id="login-screen"
      className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-white to-slate-50 px-4 py-8 select-none"
    >
      {/* Decorative background gradients */}
      <div
        className="pointer-events-none fixed top-0 right-0 -translate-y-1/2 translate-x-1/2 w-[550px] h-[550px] rounded-full opacity-20"
        style={{ background: "radial-gradient(circle, #0f2044 0%, transparent 70%)" }}
      />
      <div
        className="pointer-events-none fixed bottom-0 left-0 translate-y-1/2 -translate-x-1/2 w-[450px] h-[450px] rounded-full opacity-15"
        style={{ background: "radial-gradient(circle, #f5c518 0%, transparent 70%)" }}
      />

      <div className="relative w-full max-w-sm">
        {/* Main Card */}
        <div className="rounded-3xl border border-gray-100 bg-white px-6 py-8 sm:px-8 sm:py-9 shadow-xl shadow-gray-200/80">
          {/* Logo & Title */}
          <div className="flex flex-col items-center text-center space-y-2.5 mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              id="app-logo"
              src="/android-chrome-192x192.png"
              alt="Izah POS"
              className="h-14 w-14 rounded-2xl shadow-md shadow-gray-200"
            />
            <div>
              <h1 id="login-title" className="text-2xl font-bold tracking-tight text-[#0f2044]">
                Izah POS
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">
                {authMode === "pin" ? "Enter your 4-digit PIN to begin" : "Sign in with your email"}
              </p>
            </div>
          </div>

          {authMode === "pin" ? (
            <div id="pin-auth-container" className="space-y-5">
              {/* Staff member selector (if staff members exist) */}
              {staffList.length > 0 && (
                <div id="staff-selector" className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-gray-500 font-medium px-1">
                    <span>Active Cashier</span>
                    <button
                      type="button"
                      onClick={() => setSelectedStaff(null)}
                      className={`text-xs hover:underline ${
                        selectedStaff === null ? "font-bold text-[#0f2044]" : "text-gray-400"
                      }`}
                    >
                      Any User
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {staffList.map((staff) => {
                      const isSelected = selectedStaff?.id === staff.id;
                      return (
                        <button
                          key={staff.id}
                          id={`staff-btn-${staff.id}`}
                          type="button"
                          onClick={() => {
                            setSelectedStaff(staff);
                            setPin("");
                            setPinError(null);
                          }}
                          className={`flex items-center gap-2 rounded-xl border p-2.5 text-left transition-all ${
                            isSelected
                              ? "border-[#0f2044] bg-[#0f2044]/5 text-[#0f2044] ring-2 ring-[#0f2044]/15 shadow-sm"
                              : "border-gray-200 hover:border-gray-300 bg-white text-gray-700"
                          }`}
                        >
                          <div
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                              isSelected
                                ? "bg-[#0f2044] text-white"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {staff.role === "ADMIN" ? (
                              <Shield className="h-3.5 w-3.5" />
                            ) : (
                              <UserCheck className="h-3.5 w-3.5" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold leading-tight">
                              {staff.name}
                            </p>
                            <p className="truncate text-[10px] text-gray-400 uppercase tracking-wider font-mono">
                              {staff.role}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* PIN Indicator Dots */}
              <div className="flex flex-col items-center py-2">
                <div
                  id="pin-dots"
                  className={`flex items-center justify-center gap-4 transition-transform duration-200 ${
                    isShaking ? "animate-bounce" : ""
                  }`}
                >
                  {[0, 1, 2, 3].map((index) => {
                    const isFilled = pin.length > index;
                    return (
                      <div
                        key={index}
                        id={`pin-dot-${index}`}
                        className={`h-4 w-4 rounded-full transition-all duration-200 ${
                          isFilled
                            ? "scale-110 bg-[#0f2044] shadow-md shadow-[#0f2044]/30"
                            : "border-2 border-gray-300 bg-gray-100"
                        }`}
                      />
                    );
                  })}
                </div>

                {/* Status or error message */}
                <div className="mt-3 min-h-[20px] text-center">
                  {submittingPin ? (
                    <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-[#0f2044]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Verifying PIN…</span>
                    </div>
                  ) : pinError ? (
                    <p id="pin-error-text" className="text-xs font-semibold text-red-600">
                      {pinError}
                    </p>
                  ) : (
                    <p className="text-[11px] text-gray-400">
                      Type PIN using keyboard or keypad
                    </p>
                  )}
                </div>
              </div>

              {/* Numeric Keypad Grid */}
              <div id="pin-keypad" className="grid grid-cols-3 gap-2 sm:gap-2.5">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                  <button
                    key={digit}
                    id={`keypad-${digit}`}
                    type="button"
                    disabled={submittingPin}
                    onClick={() => handleDigitClick(digit)}
                    className="flex h-13 sm:h-14 items-center justify-center rounded-2xl bg-gray-50 border border-gray-200/80 text-xl font-bold text-[#0f2044] shadow-sm transition-all hover:bg-gray-100 active:scale-95 active:bg-gray-200 disabled:opacity-50"
                  >
                    {digit}
                  </button>
                ))}

                {/* Bottom row: Clear, 0, Backspace */}
                <button
                  id="keypad-clear"
                  type="button"
                  disabled={submittingPin || pin.length === 0}
                  onClick={handleClear}
                  className="flex h-13 sm:h-14 items-center justify-center rounded-2xl bg-gray-50 border border-gray-200/80 text-xs font-bold uppercase tracking-wider text-gray-500 shadow-sm transition-all hover:bg-gray-100 active:scale-95 disabled:opacity-40"
                >
                  Clear
                </button>

                <button
                  id="keypad-0"
                  type="button"
                  disabled={submittingPin}
                  onClick={() => handleDigitClick("0")}
                  className="flex h-13 sm:h-14 items-center justify-center rounded-2xl bg-gray-50 border border-gray-200/80 text-xl font-bold text-[#0f2044] shadow-sm transition-all hover:bg-gray-100 active:scale-95 active:bg-gray-200 disabled:opacity-50"
                >
                  0
                </button>

                <button
                  id="keypad-backspace"
                  type="button"
                  disabled={submittingPin || pin.length === 0}
                  onClick={handleBackspace}
                  className="flex h-13 sm:h-14 items-center justify-center rounded-2xl bg-gray-50 border border-gray-200/80 text-gray-600 shadow-sm transition-all hover:bg-gray-100 active:scale-95 disabled:opacity-40"
                  aria-label="Delete last digit"
                >
                  <Delete className="h-5 w-5" />
                </button>
              </div>

            </div>
          ) : (
            /* Email & Password Form */
            <form id="password-form" onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="email"
                  className="text-xs font-semibold uppercase tracking-wider text-gray-500"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="admin@example.com"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="password"
                  className="text-xs font-semibold uppercase tracking-wider text-gray-500"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputClass} pr-12`}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {passwordError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-red-600 text-sm font-medium">{passwordError}</p>
                </div>
              )}

              <button
                id="password-submit-btn"
                type="submit"
                disabled={passwordLoading}
                className="mt-1 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#f5c518] px-4 py-2 text-sm font-bold text-[#0f2044] shadow-md shadow-[#f5c518]/30 transition-all hover:bg-yellow-400 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f5c518] disabled:pointer-events-none disabled:opacity-50"
              >
                {passwordLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in…
                  </span>
                ) : (
                  "Sign in"
                )}
              </button>
            </form>
          )}

          {/* Toggle between PIN and Password login */}
          <div className="mt-6 border-t border-gray-100 pt-4 text-center">
            {authMode === "pin" ? (
              <button
                id="toggle-password-login"
                type="button"
                onClick={() => {
                  setAuthMode("password");
                  setPinError(null);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0f2044] hover:underline"
              >
                <Lock className="h-3 w-3" />
                <span>Or sign in with email and password</span>
              </button>
            ) : (
              <button
                id="toggle-pin-login"
                type="button"
                onClick={() => {
                  setAuthMode("pin");
                  setPasswordError(null);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0f2044] hover:underline"
              >
                <KeyRound className="h-3 w-3" />
                <span>Switch to 4-Digit PIN Login</span>
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-gray-400">
          Izah POS — Point of Sale Terminal
        </p>
      </div>
    </div>
  );
}
