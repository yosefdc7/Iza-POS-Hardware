"use client";

import { useState, useEffect, useCallback } from "react";
import { activateBrowserSession } from "@/lib/browser-session";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { Lock, UserCheck, Delete, LogOut, Loader2, ArrowLeft, KeyRound } from "lucide-react";
import { getPosCashiersAction, verifyAndSwitchCashierPinAction } from "@/app/actions/user-actions";
import { signOut, useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PosCashier {
  id: string;
  name: string;
  email: string;
  role: string;
  hasPin: boolean;
}

interface PosLockOverlayProps {
  isOpen: boolean;
  onUnlock: (user: { id: string; name: string; email: string; role: string }) => void;
  onLockRequest?: () => void;
}

export function PosLockOverlay({ isOpen, onUnlock }: PosLockOverlayProps) {
  const t = useTranslations("lock");
  const router = useRouter();
  const { data: session, refetch: refetchSession } = useSession();
  const [cashiers, setCashiers] = useState<PosCashier[]>([]);
  const [selectedCashier, setSelectedCashier] = useState<PosCashier | null>(null);
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load cashiers when overlay opens
  useEffect(() => {
    if (!isOpen) {
      setPin("");
      setErrorMessage(null);
      return;
    }

    setLoading(true);
    getPosCashiersAction()
      .then((res) => {
        if (res.users) {
          setCashiers(res.users);
          // Pre-select current logged-in cashier if found
          if (res.currentUserId) {
            const current = res.users.find((u) => u.id === res.currentUserId);
            if (current) setSelectedCashier(current);
          }
        }
      })
      .catch(() => {
        toast.error(t("failed_load_cashiers"));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, t]);

  const handleVerifyPin = useCallback(
    async (pinValue: string) => {
      if (!selectedCashier) return;
      setSwitching(true);
      setErrorMessage(null);

      try {
        const res = await verifyAndSwitchCashierPinAction(selectedCashier.id, pinValue);

        if (res.error) {
          setErrorMessage(res.error);
          setIsShaking(true);
          setPin("");
          setTimeout(() => setIsShaking(false), 600);
          return;
        }

        if (res.user) {
          if (res.token) await activateBrowserSession(res.token, res.user.id);
          toast.success(t("unlocked_as", { name: res.user.name || res.user.email }));
          onUnlock(res.user);
          try {
            await refetchSession();
          } catch {}
        }
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : t("auth_error"));
        setIsShaking(true);
        setPin("");
        setTimeout(() => setIsShaking(false), 600);
      } finally {
        setSwitching(false);
      }
    },
    [selectedCashier, refetchSession, onUnlock, router, t]
  );

  const handleDigitPress = useCallback(
    (digit: string) => {
      if (switching || pin.length >= 4) return;
      const nextPin = pin + digit;
      setPin(nextPin);
      if (nextPin.length === 4) {
        handleVerifyPin(nextPin);
      }
    },
    [pin, switching, handleVerifyPin]
  );

  const handleDeleteDigit = useCallback(() => {
    if (switching) return;
    setPin((prev) => prev.slice(0, -1));
    setErrorMessage(null);
  }, [switching]);

  // Physical keyboard listener when overlay is open & cashier selected
  useEffect(() => {
    if (!isOpen || !selectedCashier) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        handleDigitPress(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        handleDeleteDigit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setSelectedCashier(null);
        setPin("");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, selectedCashier, handleDigitPress, handleDeleteDigit]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md px-4 select-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-lg rounded-3xl border border-white/15 bg-card/95 p-6 sm:p-8 shadow-2xl text-foreground"
      >
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary mb-3 shadow-inner">
            <Lock className="h-7 w-7" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">{t("title")}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {selectedCashier
              ? t("prompt_pin", { name: selectedCashier.name || selectedCashier.email })
              : t("prompt_select")}
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">{t("loading_staff")}</p>
          </div>
        ) : !selectedCashier ? (
          /* Step 1: Cashier Selection Grid */
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-72 overflow-y-auto p-1">
              {cashiers.map((cashier) => {
                const isCurrent = session?.user?.id === cashier.id;
                return (
                  <button
                    key={cashier.id}
                    onClick={() => {
                      setSelectedCashier(cashier);
                      setPin("");
                      setErrorMessage(null);
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center p-4 rounded-2xl border transition-all text-center gap-2.5",
                      isCurrent
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "border-border bg-card hover:border-primary/50 hover:bg-accent"
                    )}
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 text-primary font-bold text-base">
                      {(cashier.name || cashier.email).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 w-full">
                      <p className="text-sm font-semibold truncate">
                        {cashier.name || cashier.email.split("@")[0]}
                      </p>
                      <p className="text-[11px] text-muted-foreground capitalize">
                        {cashier.role.toLowerCase()}
                      </p>
                    </div>
                    {isCurrent && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary">
                        <UserCheck className="h-3 w-3" /> {t("active")}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {cashiers.length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-2xl">
                {t("no_users")}
              </div>
            )}
          </div>
        ) : (
          /* Step 2: PIN Pad */
          <div className="space-y-5">
            {/* Cashier Badge */}
            <div className="flex items-center justify-between bg-muted/60 rounded-xl px-4 py-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary font-bold text-xs">
                  {(selectedCashier.name || selectedCashier.email).charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate">
                    {selectedCashier.name || selectedCashier.email}
                  </p>
                  <p className="text-[10px] text-muted-foreground capitalize">
                    {selectedCashier.role.toLowerCase()}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedCashier(null);
                  setPin("");
                  setErrorMessage(null);
                }}
                className="text-xs font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors px-2 py-1 rounded"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> {t("switch_cashier")}
              </button>
            </div>

            {/* PIN Bubble Indicators with Shake */}
            <motion.div
              animate={isShaking ? { x: [-10, 10, -10, 10, 0] } : {}}
              transition={{ duration: 0.4 }}
              className="flex justify-center gap-4 py-2"
            >
              {[0, 1, 2, 3].map((i) => {
                const filled = pin.length > i;
                return (
                  <div
                    key={i}
                    className={cn(
                      "h-4 w-4 rounded-full border-2 transition-all duration-150",
                      filled
                        ? "border-primary bg-primary scale-110 shadow-sm"
                        : "border-muted-foreground/40 bg-transparent"
                    )}
                  />
                );
              })}
            </motion.div>

            {/* Error message */}
            {errorMessage && (
              <p className="text-xs font-medium text-destructive text-center bg-destructive/10 py-2 px-3 rounded-lg">
                {errorMessage}
              </p>
            )}

            {/* Numeric Keypad Grid */}
            <div className="grid grid-cols-3 gap-2.5 max-w-xs mx-auto">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handleDigitPress(digit)}
                  disabled={switching}
                  className="flex h-14 items-center justify-center rounded-2xl border border-border bg-card text-xl font-bold hover:bg-accent active:scale-95 transition-all shadow-xs"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPin("")}
                disabled={switching || pin.length === 0}
                className="flex h-14 items-center justify-center rounded-2xl border border-border bg-card text-xs font-semibold text-muted-foreground hover:bg-accent active:scale-95 transition-all shadow-xs"
              >
                {t("clear")}
              </button>
              <button
                type="button"
                onClick={() => handleDigitPress("0")}
                disabled={switching}
                className="flex h-14 items-center justify-center rounded-2xl border border-border bg-card text-xl font-bold hover:bg-accent active:scale-95 transition-all shadow-xs"
              >
                0
              </button>
              <button
                type="button"
                onClick={handleDeleteDigit}
                disabled={switching || pin.length === 0}
                aria-label={t("delete")}
                className="flex h-14 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground hover:bg-accent active:scale-95 transition-all shadow-xs"
              >
                <Delete className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        {/* Footer actions: Fallback Password Sign-in / Logout */}
        <div className="mt-8 pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <button
            onClick={() => {
              signOut();
              window.location.href = "/login?logout=1";
            }}
            className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors font-medium"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>{t("sign_in_password")}</span>
          </button>
          <span className="text-[11px] text-muted-foreground/60">{t("terminal_label")}</span>
        </div>
      </motion.div>
    </div>
  );
}
