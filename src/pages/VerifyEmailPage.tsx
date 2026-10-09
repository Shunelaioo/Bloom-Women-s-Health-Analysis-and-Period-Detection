import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, XCircle, Loader2, Heart, MailCheck, KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const API_ORIGIN =
  (import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "http://localhost:5000").replace(
    /\/api$/,
    ""
  );

type TokenState = "loading" | "success" | "error";

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data?.message || data?.error || `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get("token");
  const isTokenFlow = useMemo(() => Boolean(tokenFromUrl), [tokenFromUrl]);

  const [tokenState, setTokenState] = useState<TokenState>(isTokenFlow ? "loading" : "error");
  const [message, setMessage] = useState("");

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [codeSuccess, setCodeSuccess] = useState("");
  const [isCheckingMe, setIsCheckingMe] = useState(false);
  const [isCodeVerifying, setIsCodeVerifying] = useState(false);
  const [isAlreadyVerified, setIsAlreadyVerified] = useState(false);

  const [resendLoading, setResendLoading] = useState(false);
  const [resendMsg, setResendMsg] = useState("");

  useEffect(() => {
    if (!isTokenFlow) return;

    setTokenState("loading");
    setMessage("");

    fetch(`${API_ORIGIN}/api/user/verify-email?token=${encodeURIComponent(tokenFromUrl || "")}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setTokenState("success");
          setMessage(data?.message || "Email verified successfully");
        } else {
          setTokenState("error");
          setMessage(data?.message || "Verification failed.");
        }
      })
      .catch(() => {
        setTokenState("error");
        setMessage("Network error. Please try again.");
      });
  }, [isTokenFlow, tokenFromUrl]);

  useEffect(() => {
    if (isTokenFlow) return;

    const token = localStorage.getItem("token");
    if (!token) {
      setMessage("Please sign in first to verify your email with a code.");
      return;
    }

    setIsCheckingMe(true);
    fetch(`${API_ORIGIN}/api/user/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessage("Please sign in first to verify your email with a code.");
          return;
        }
        setEmail(typeof data?.email === "string" ? data.email : "");
        setIsAlreadyVerified(Boolean(data?.isEmailVerified));
      })
      .catch(() => {
        setMessage("Network error. Please try again.");
      })
      .finally(() => {
        setIsCheckingMe(false);
      });
  }, [isTokenFlow]);

  const handleCodeVerify = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setCodeError("Please sign in first.");
      return;
    }
    const normalizedCode = code.trim();
    if (!normalizedCode) {
      setCodeError("Enter the 6-digit verification code.");
      return;
    }

    setIsCodeVerifying(true);
    setCodeError("");
    setCodeSuccess("");

    try {
      const res = await fetch(`${API_ORIGIN}/api/user/verify-email/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: normalizedCode }),
      });
      if (!res.ok) {
        setCodeError(await parseError(res));
        return;
      }
      const data = await res.json().catch(() => ({}));
      setCodeSuccess(data?.message || "Email verified successfully");
      setIsAlreadyVerified(true);
    } catch {
      setCodeError("Network error. Please try again.");
    } finally {
      setIsCodeVerifying(false);
    }
  };

  const handleResend = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setResendMsg("Please sign in first.");
      return;
    }

    setResendLoading(true);
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
      if (!res.ok) {
        setResendMsg(data?.message || "Failed to resend. Try again.");
        return;
      }
      const devCode =
        typeof data?.devVerificationCode === "string" && data.devVerificationCode
          ? ` Development code: ${data.devVerificationCode}`
          : "";
      setResendMsg(`New verification code sent.${devCode}`);
    } catch {
      setResendMsg("Network error. Try again.");
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex gradient-hero items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="gradient-glass backdrop-blur-xl rounded-3xl shadow-card p-10 border border-border/50 text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl gradient-primary flex items-center justify-center shadow-glow">
            <Heart className="w-8 h-8 text-primary-foreground" />
          </div>

          {isTokenFlow && tokenState === "loading" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Loader2 className="w-10 h-10 mx-auto mb-4 text-primary animate-spin" />
              <h2 className="font-display text-2xl font-bold text-foreground mb-2">Verifying your email...</h2>
              <p className="text-muted-foreground text-sm">Just a moment</p>
            </motion.div>
          )}

          {isTokenFlow && tokenState === "success" && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <CheckCircle2 className="w-9 h-9 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h2 className="font-display text-2xl font-bold text-foreground mb-2">Email Verified</h2>
              <p className="text-muted-foreground text-sm mb-8">{message || "Your email is confirmed."}</p>
              <Button asChild className="w-full h-12 rounded-xl">
                <Link to="/home">Go to App</Link>
              </Button>
            </motion.div>
          )}

          {isTokenFlow && tokenState === "error" && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
                <XCircle className="w-9 h-9 text-destructive" />
              </div>
              <h2 className="font-display text-2xl font-bold text-foreground mb-2">Link Invalid or Expired</h2>
              <p className="text-muted-foreground text-sm mb-6">{message || "This link is no longer valid."}</p>

              <Button
                onClick={handleResend}
                disabled={resendLoading}
                variant="outline"
                className="w-full h-12 rounded-xl border-primary/30 text-primary hover:bg-primary/5 flex items-center justify-center gap-2 mb-3"
              >
                {resendLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MailCheck className="w-4 h-4" />}
                Send Verification Code
              </Button>

              {resendMsg && (
                <p
                  className={`text-sm mt-2 ${
                    resendMsg.toLowerCase().includes("sent")
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-destructive"
                  }`}
                >
                  {resendMsg}
                </p>
              )}

              <Link to="/verify-email" className="block mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors">
                Use verification code instead
              </Link>
            </motion.div>
          )}

          {!isTokenFlow && (
            <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
              <h2 className="font-display text-2xl font-bold text-foreground mb-2">Verify Email</h2>
              <p className="text-muted-foreground text-sm mb-6">
                Enter the 6-digit code sent to your email address.
              </p>

              {isCheckingMe && (
                <div className="mb-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Checking account...
                </div>
              )}

              {!isCheckingMe && message && !email && (
                <p className="text-sm text-destructive mb-4">{message}</p>
              )}

              {isAlreadyVerified ? (
                <div>
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <CheckCircle2 className="w-9 h-9 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="text-muted-foreground text-sm mb-6">
                    {codeSuccess || "Your email is already verified."}
                  </p>
                  <Button asChild className="w-full h-12 rounded-xl">
                    <Link to="/home">Go to App</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-4 text-left">
                  <div>
                    <Label htmlFor="verifyEmailReadOnly">Email</Label>
                    <Input id="verifyEmailReadOnly" value={email} disabled className="mt-2 h-12 rounded-xl" />
                  </div>

                  <div>
                    <Label htmlFor="verificationCode">Verification Code</Label>
                    <div className="relative mt-2">
                      <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        id="verificationCode"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        className="pl-12 h-12 rounded-xl"
                        placeholder="123456"
                      />
                    </div>
                  </div>

                  {codeError && <p className="text-sm text-destructive">{codeError}</p>}
                  {codeSuccess && <p className="text-sm text-emerald-600 dark:text-emerald-400">{codeSuccess}</p>}
                  {resendMsg && (
                    <p
                      className={`text-sm ${
                        resendMsg.toLowerCase().includes("sent")
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-destructive"
                      }`}
                    >
                      {resendMsg}
                    </p>
                  )}

                  <Button
                    onClick={handleCodeVerify}
                    disabled={isCodeVerifying || !email}
                    className="w-full h-12 rounded-xl btn-primary"
                  >
                    {isCodeVerifying ? "Verifying..." : "Verify Email"}
                  </Button>

                  <Button
                    onClick={handleResend}
                    disabled={resendLoading || !email}
                    variant="outline"
                    className="w-full h-12 rounded-xl flex items-center justify-center gap-2"
                  >
                    {resendLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MailCheck className="w-4 h-4" />}
                    Resend Code
                  </Button>

                  <Link to="/home" className="block text-center mt-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    Back to App
                  </Link>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
