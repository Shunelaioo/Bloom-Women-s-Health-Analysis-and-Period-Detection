import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Lock, Mail, ArrowLeft, ArrowRight, Heart, KeyRound, Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

const API_ORIGIN =
  (import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "http://localhost:5000").replace(
    /\/api$/,
    ""
  );
const API_BASE = `${API_ORIGIN}/api/user`;

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data?.message || data?.error || `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [step, setStep] = useState<"request" | "reset">("request");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const passwordStrength = useMemo(() => {
    if (!newPassword) return "Very weak";
    let score = 0;
    if (newPassword.length >= 8) score += 1;
    if (/[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword)) score += 1;
    if (/\d/.test(newPassword)) score += 1;
    if (/[^A-Za-z0-9]/.test(newPassword)) score += 1;
    if (score <= 1) return "Very weak";
    if (score === 2) return "Weak";
    if (score === 3) return "Medium";
    return "Strong";
  }, [newPassword]);

  const requestReset = async (opts?: { resend?: boolean }) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      toast({ title: "Email required", description: "Enter your email address." });
      return;
    }
    setIsRequesting(true);
    try {
      const res = await fetch(`${API_BASE}/reset-password/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      if (!res.ok) throw new Error(await parseError(res));
      const payload = await res.json().catch(() => null);
      const devCode =
        typeof payload?.devResetCode === "string" && payload.devResetCode
          ? payload.devResetCode
          : null;
      const delivery = typeof payload?.delivery === "string" ? payload.delivery : null;
      toast({
        title: opts?.resend ? "Code resent" : "Reset requested",
        description:
          delivery === "smtp_unavailable"
            ? "Email service is not configured on server. Contact support or configure SMTP."
            : "If the email exists, a reset code has been sent.",
      });
      if (devCode) {
        toast({
          title: "Development reset code",
          description: `Use code: ${devCode}`,
        });
      }
      setEmail(normalizedEmail);
      setStep("reset");
    } catch (err: any) {
      toast({ title: "Request failed", description: err?.message || "Please try again." });
    } finally {
      setIsRequesting(false);
    }
  };

  const confirmReset = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCode = resetCode.trim();
    if (!normalizedEmail || !normalizedCode || !newPassword) {
      toast({ title: "Missing fields", description: "Fill email, code, and new password." });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: "Password too short", description: "Use at least 8 characters." });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast({ title: "Passwords do not match", description: "Confirm your new password." });
      return;
    }

    setIsResetting(true);
    try {
      const res = await fetch(`${API_BASE}/reset-password/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, resetCode: normalizedCode, newPassword }),
      });
      if (!res.ok) throw new Error(await parseError(res));
      toast({ title: "Password reset", description: "You can now sign in with your new password." });
      navigate("/login", { replace: true });
    } catch (err: any) {
      toast({ title: "Reset failed", description: err?.message || "Please try again." });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="min-h-screen flex gradient-hero overflow-hidden">
      <motion.div
        initial={{ opacity: 0, x: -50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8 }}
        className="hidden lg:flex lg:w-1/2 flex-col justify-center items-center p-12 relative overflow-hidden bg-gradient-to-r from-primary via-coral/60 to-white"
      >
        <div className="absolute top-20 left-20 w-32 h-32 rounded-full bg-primary/20 blur-3xl animate-float" />
        <div
          className="absolute bottom-32 right-20 w-48 h-48 rounded-full bg-accent/20 blur-3xl animate-float"
          style={{ animationDelay: "1s" }}
        />
        <div className="relative z-10 max-w-md text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, delay: 0.3 }}
            className="w-24 h-24 mx-auto mb-8 rounded-2xl gradient-primary flex items-center justify-center shadow-glow"
          >
            <Heart className="w-12 h-12 text-primary-foreground" />
          </motion.div>
          <h1 className="font-display text-5xl font-bold text-primary-foreground mb-4">Her Tracker</h1>
          <p className="text-lg text-primary-foreground/80">We'll email you a code to reset your password.</p>
        </div>
      </motion.div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 lg:p-12">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md"
        >
          <div className="gradient-glass backdrop-blur-xl rounded-3xl shadow-card p-8 lg:p-10 border border-border/50">
            <div className="lg:hidden flex items-center justify-center mb-8">
              <div className="w-14 h-14 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
                <Heart className="w-7 h-7 text-primary-foreground" />
              </div>
            </div>

            {step === "request" ? (
              <>
                <div className="text-center mb-8">
                  <h2 className="font-display text-3xl font-bold text-foreground mb-2">Forgot Password?</h2>
                  <p className="text-muted-foreground">Enter your email and we'll send you a reset code</p>
                </div>

                <div className="space-y-5">
                  <div>
                    <Label htmlFor="email">Email Address</Label>
                    <div className="relative mt-2">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-12 h-12 rounded-xl"
                        placeholder="you@example.com"
                        required
                      />
                    </div>
                  </div>

                  <Button onClick={() => requestReset()} disabled={isRequesting} className="w-full h-12 rounded-xl btn-primary">
                    {isRequesting ? "Sending..." : "Send Code"}
                  </Button>

                  <div className="text-center pt-2">
                    <Link to="/login?mode=login" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
                      <ArrowLeft className="w-4 h-4" />
                      Back to Sign In
                    </Link>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="text-center mb-7">
                  <h2 className="font-display text-3xl font-bold text-foreground mb-2">Enter Reset Code</h2>
                  <p className="text-muted-foreground">
                    If an account exists for <span className="font-medium text-foreground">{email}</span>, we sent a code.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label htmlFor="emailReadOnly">Email</Label>
                    <div className="relative mt-2">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input id="emailReadOnly" value={email} className="pl-12 h-12 rounded-xl" disabled />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="code">Reset Code</Label>
                    <div className="relative mt-2">
                      <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        id="code"
                        value={resetCode}
                        onChange={(e) => setResetCode(e.target.value)}
                        className="pl-12 h-12 rounded-xl"
                        placeholder="123456"
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Code expires in ~10 minutes.</span>
                      <button
                        type="button"
                        onClick={() => requestReset({ resend: true })}
                        disabled={isRequesting}
                        className="text-primary font-semibold disabled:opacity-60"
                      >
                        {isRequesting ? "Sending..." : "Resend code"}
                      </button>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="newPw">New Password</Label>
                    <div className="relative mt-2">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        id="newPw"
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="pl-12 pr-12 h-12 rounded-xl"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((v) => !v)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground flex items-center justify-between">
                      <span>Strength</span>
                      <span>{passwordStrength}</span>
                    </div>
                    <ul className="mt-1 text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                      <li>Use at least 8 characters.</li>
                      <li>Add a mix of letters and numbers/symbols.</li>
                    </ul>
                  </div>

                  <div>
                    <Label htmlFor="confirmPw">Confirm New Password</Label>
                    <div className="relative mt-2">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        id="confirmPw"
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        className="pl-12 pr-12 h-12 rounded-xl"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  <Button onClick={confirmReset} disabled={isResetting} className="w-full h-12 rounded-xl btn-primary">
                    {isResetting ? "Resetting..." : "Reset Password"}
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>

                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => setStep("request")}
                      className="text-muted-foreground hover:text-foreground text-sm"
                    >
                      Use a different email
                    </button>
                  </div>

                  <div className="text-center">
                    <Link to="/login?mode=login" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
                      <ArrowLeft className="w-4 h-4" />
                      Back to Sign In
                    </Link>
                  </div>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
