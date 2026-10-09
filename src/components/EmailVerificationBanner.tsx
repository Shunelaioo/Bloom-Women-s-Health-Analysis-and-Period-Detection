import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MailCheck, X, Loader2, CheckCircle2 } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useCurrentUser } from "@/hooks/useCurrentUser";

const AUTH_ROUTES = ["/login", "/auth", "/welcome", "/forgot-password", "/verify-email"];

const API_ORIGIN =
  (import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "http://localhost:5000").replace(
    /\/api$/,
    ""
  );

export default function EmailVerificationBanner() {
  const location = useLocation();
  const { user, isVerified, isLoading } = useCurrentUser();
  const [dismissed, setDismissed] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [resendMsg, setResendMsg] = useState("");
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cooldown, setCooldown] = useState(0);

  if (
    AUTH_ROUTES.some((r) => location.pathname.startsWith(r)) ||
    isLoading ||
    !user ||
    isVerified === true ||
    isVerified === null ||
    dismissed
  ) {
    return null;
  }

  const handleResend = async () => {
    if (resendState === "loading" || cooldown > 0) return;
    const token = localStorage.getItem("token");
    if (!token) return;

    setResendState("loading");
    setResendMsg("");

    try {
      let res = await fetch(`${API_ORIGIN}/api/user/verify-email/request`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 404) {
        // Backwards compatibility with older backend route naming.
        res = await fetch(`${API_ORIGIN}/api/user/resend-verification`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setResendState("sent");
        const devCode =
          typeof data?.devVerificationCode === "string" && data.devVerificationCode
            ? ` Dev code: ${data.devVerificationCode}`
            : "";
        setResendMsg(`Code sent. Check your inbox.${devCode}`);
        let secs = 60;
        setCooldown(secs);
        const tick = setInterval(() => {
          secs--;
          setCooldown(secs);
          if (secs <= 0) {
            clearInterval(tick);
            setResendState("idle");
          }
        }, 1000);
        cooldownRef.current = tick as unknown as ReturnType<typeof setTimeout>;
      } else if (res.status === 429) {
        setResendState("error");
        setResendMsg(data?.message || "Please wait before requesting another email.");
      } else {
        setResendState("error");
        setResendMsg(data?.message || "Failed to send. Try again.");
      }
    } catch {
      setResendState("error");
      setResendMsg("Network error. Try again.");
    }
  };

  const resendLabel = () => {
    if (resendState === "loading") return null;
    if (resendState === "sent" && cooldown > 0) return `Resend in ${cooldown}s`;
    if (resendState === "sent") return "Resend code";
    return "Resend code";
  };

  return (
    <AnimatePresence>
      <motion.div
        key="verify-banner"
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -60, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed top-0 left-0 right-0 z-[9999]"
      >
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/30 border-b border-amber-200/70 dark:border-amber-800/50 px-4 py-2.5">
          <div className="max-w-5xl mx-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 justify-between">
            <div className="flex items-center gap-2.5 text-amber-800 dark:text-amber-300 min-w-0">
              <MailCheck className="w-4 h-4 shrink-0" />
              <span className="text-sm font-medium truncate">
                Verify your email to unlock predictions and health insights.
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Link
                to="/verify-email"
                className="text-xs font-semibold text-amber-800 dark:text-amber-300 underline-offset-2 hover:underline"
              >
                Enter code
              </Link>

              <AnimatePresence mode="wait">
                {resendMsg && (
                  <motion.span
                    key={resendMsg}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className={`text-xs font-medium ${
                      resendState === "sent" ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"
                    } flex items-center gap-1`}
                  >
                    {resendState === "sent" && <CheckCircle2 className="w-3 h-3" />}
                    {resendMsg}
                  </motion.span>
                )}
              </AnimatePresence>

              <button
                onClick={handleResend}
                disabled={resendState === "loading" || cooldown > 0}
                className="text-xs font-semibold text-amber-800 dark:text-amber-300 underline-offset-2 hover:underline disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 transition-opacity"
              >
                {resendState === "loading" && <Loader2 className="w-3 h-3 animate-spin" />}
                {resendLabel()}
              </button>

              <button
                onClick={() => setDismissed(true)}
                aria-label="Dismiss"
                className="ml-1 text-amber-700/60 hover:text-amber-900 dark:text-amber-400/60 dark:hover:text-amber-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
