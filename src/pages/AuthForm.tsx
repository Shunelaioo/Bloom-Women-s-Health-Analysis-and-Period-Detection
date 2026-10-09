import { useEffect, useState, forwardRef, useCallback } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  User,
  ArrowRight,
  Heart,
  CheckCircle2,
  XCircle,
  Info,
  Loader2,
  Baby,
  FlameKindling,
  HelpCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import OnboardingForm from "@/components/layout/onboarding/OnboardingForm";

type AuthMode = "login" | "signup";
type AuthView = "auth" | "onboarding";

interface AuthFormProps {
  onAuthSuccess?: () => void;
}

const API_ORIGIN =
  (import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "http://localhost:5000").replace(
    /\/api$/,
    ""
  );
const API_BASE = `${API_ORIGIN}/api/user`;

function saveToken(token: string) {
  localStorage.setItem("token", token);
  // notify other modules (e.g. notification context) that auth changed
  window.dispatchEvent(new Event("login"));
}
function getToken() {
  return localStorage.getItem("token");
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data?.message || data?.error || `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

function looksLikeUserNotFound(msg: string) {
  const m = msg.toLowerCase();
  return (
    m.includes("not found") ||
    m.includes("no user") ||
    m.includes("does not exist") ||
    m.includes("doesn't exist") ||
    m.includes("invalid email")
  );
}

// ─── Password strength ────────────────────────────────────────────────────────
type StrengthLevel = "empty" | "weak" | "fair" | "strong" | "great";
interface StrengthInfo {
  level: StrengthLevel;
  label: string;
  score: number; // 0-4
  color: string;
  bg: string;
}

function getPasswordStrength(password: string): StrengthInfo {
  if (!password) return { level: "empty", label: "", score: 0, color: "bg-border", bg: "bg-muted" };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  // clamp to 4
  const clamped = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
  const map: Record<0 | 1 | 2 | 3 | 4, StrengthInfo> = {
    0: { level: "weak", label: "Too short", score: 0, color: "bg-destructive", bg: "bg-destructive/10" },
    1: { level: "weak", label: "Weak", score: 1, color: "bg-destructive", bg: "bg-destructive/10" },
    2: { level: "fair", label: "Fair", score: 2, color: "bg-amber-500", bg: "bg-amber-50 dark:bg-amber-900/20" },
    3: { level: "strong", label: "Strong", score: 3, color: "bg-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
    4: { level: "great", label: "Great!", score: 4, color: "bg-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
  };
  return map[clamped];
}

// ─── Life Stage options ───────────────────────────────────────────────────────
interface LifeStageOption {
  value: string;
  label: string;
  description: string;
  Icon: React.FC<{ className?: string }>;
}

const LIFE_STAGE_OPTIONS: LifeStageOption[] = [
  {
    value: "reproductive",
    label: "Reproductive",
    description: "Regular cycles, fertile years",
    Icon: ({ className }) => <Heart className={className} />,
  },
  {
    value: "perimenopausal",
    label: "Perimenopausal",
    description: "Transitioning, irregular cycles",
    Icon: ({ className }) => <FlameKindling className={className} />,
  },
  {
    value: "unknown",
    label: "Not Sure",
    description: "I'm not certain right now",
    Icon: ({ className }) => <HelpCircle className={className} />,
  },
];

// ─── Field validation ─────────────────────────────────────────────────────────
function validateEmail(v: string) {
  if (!v) return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Enter a valid email address";
  return "";
}
function validatePassword(v: string) {
  if (!v) return "Password is required";
  if (v.length < 8) return "Password must be at least 8 characters";
  return "";
}
function validateName(v: string) {
  if (!v.trim()) return "Name is required";
  if (v.trim().length < 2) return "Name must be at least 2 characters";
  return "";
}
function validateConfirmPassword(pw: string, confirm: string) {
  if (!confirm) return "Please confirm your password";
  if (pw !== confirm) return "Passwords do not match";
  return "";
}
function validateMenarcheAge(v: string) {
  if (!v) return "Age at first period is required";
  const n = Number(v);
  if (!Number.isFinite(n) || n < 8 || n > 25) return "Must be between 8 and 25";
  return "";
}

// ─── Step indicator ───────────────────────────────────────────────────────────
const SIGNUP_STEPS = ["Account", "Profile"];

function StepIndicator({ current }: { current: 0 | 1 }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {SIGNUP_STEPS.map((label, idx) => {
        const done = idx < current;
        const active = idx === current;
        return (
          <div key={label} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${done
                    ? "bg-primary text-primary-foreground"
                    : active
                      ? "bg-primary/20 text-primary border-2 border-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
              >
                {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx + 1}
              </div>
              <span
                className={`text-xs font-medium transition-colors duration-300 ${active ? "text-foreground" : done ? "text-primary" : "text-muted-foreground"
                  }`}
              >
                {label}
              </span>
            </div>
            {idx < SIGNUP_STEPS.length - 1 && (
              <div
                className={`h-px w-8 transition-all duration-500 ${done ? "bg-primary" : "bg-border"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Password strength bar ────────────────────────────────────────────────────
function PasswordStrengthBar({ password }: { password: string }) {
  const info = getPasswordStrength(password);
  if (!password) return null;
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="mt-2 space-y-1"
    >
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i <= info.score ? info.color : "bg-border"
              }`}
          />
        ))}
      </div>
      {info.label && (
        <p className={`text-xs font-medium ${info.level === "weak" ? "text-destructive" :
            info.level === "fair" ? "text-amber-600 dark:text-amber-400" :
              "text-emerald-600 dark:text-emerald-400"
          }`}>
          {info.label} — {info.score >= 3 ? "Great choice!" : "Try adding numbers, symbols, or uppercase letters"}
        </p>
      )}
    </motion.div>
  );
}

// ─── Inline field error ───────────────────────────────────────────────────────
function FieldError({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <motion.p
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="mt-1.5 text-xs text-destructive flex items-center gap-1"
    >
      <XCircle className="w-3.5 h-3.5 shrink-0" />
      {msg}
    </motion.p>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
const AuthForm = forwardRef<HTMLDivElement, AuthFormProps>(({ onAuthSuccess }, ref) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const urlMode = (searchParams.get("mode") || "login").toLowerCase();
  const initialMode: AuthMode = urlMode === "signup" ? "signup" : "login";
  const urlEmail = searchParams.get("email") || "";

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [view, setView] = useState<AuthView>("auth");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    email: urlEmail,
    password: "",
    confirmPassword: "",
    lifeStage: "reproductive",
    menarcheAge: "",
  });

  // Field-level errors (real-time after first submit attempt)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Already logged in → redirect
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) navigate("/home", { replace: true });
  }, [navigate]);

  // Keep UI synced with URL
  useEffect(() => {
    const m = (searchParams.get("mode") || "login").toLowerCase();
    const nextMode: AuthMode = m === "signup" ? "signup" : "login";
    const e = searchParams.get("email") || "";

    setMode(nextMode);
    setErrorMsg("");
    setView("auth");
    setShowPassword(false);
    setShowConfirm(false);
    setFieldErrors({});
    setTouched({});

    setFormData((prev) => ({
      name: "",
      email: e || prev.email || "",
      password: "",
      confirmPassword: "",
      lifeStage: "reproductive",
      menarcheAge: "",
    }));
  }, [searchParams]);

  const goMode = (next: AuthMode, email?: string) => {
    const q = new URLSearchParams();
    q.set("mode", next);
    if (email) q.set("email", email);
    navigate(`/login?${q.toString()}`, { replace: true });
  };

  // Real-time validation per field
  const validateField = useCallback(
    (name: string, value: string) => {
      let err = "";
      switch (name) {
        case "email": err = validateEmail(value); break;
        case "password": err = validatePassword(value); break;
        case "name": err = validateName(value); break;
        case "confirmPassword": err = validateConfirmPassword(formData.password, value); break;
        case "menarcheAge": err = validateMenarcheAge(value); break;
      }
      return err;
    },
    [formData.password]
  );

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (touched[field]) {
      const err = validateField(field, value);
      setFieldErrors((prev) => ({ ...prev, [field]: err }));
      // Also re-validate confirmPassword when password changes
      if (field === "password" && touched["confirmPassword"]) {
        setFieldErrors((prev) => ({
          ...prev,
          confirmPassword: validateConfirmPassword(value, formData.confirmPassword),
        }));
      }
    }
  };

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const err = validateField(field, formData[field as keyof typeof formData] as string);
    setFieldErrors((prev) => ({ ...prev, [field]: err }));
  };

  const validateAll = (): boolean => {
    const allTouched: Record<string, boolean> = { email: true, password: true };
    const errors: Record<string, string> = {
      email: validateEmail(formData.email),
      password: validatePassword(formData.password),
    };
    if (mode === "signup") {
      allTouched.name = true;
      allTouched.confirmPassword = true;
      allTouched.menarcheAge = true;
      errors.name = validateName(formData.name);
      errors.confirmPassword = validateConfirmPassword(formData.password, formData.confirmPassword);
      errors.menarcheAge = validateMenarcheAge(formData.menarcheAge);
    }
    setTouched(allTouched);
    setFieldErrors(errors);
    return Object.values(errors).every((e) => !e);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!validateAll()) return;

    setIsLoading(true);
    try {
      if (mode === "signup") {
        const res = await fetch(`${API_BASE}/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: formData.email,
            password: formData.password,
            displayName: formData.name,
            name: formData.name,
            lifeStage: formData.lifeStage,
            menarcheAge: Number(formData.menarcheAge),
          }),
        });

        if (!res.ok) {
          setErrorMsg(await parseError(res));
          return;
        }
        const data = await res.json();
        if (data?.token) saveToken(data.token);
        setView("onboarding");
        return;
      }

      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.email, password: formData.password }),
      });

      if (!res.ok) {
        const msg = await parseError(res);
        if (res.status === 404 || looksLikeUserNotFound(msg)) {
          goMode("signup", formData.email);
          return;
        }
        setErrorMsg(msg);
        return;
      }

      const data = await res.json();
      if (data?.token) saveToken(data.token);
      onAuthSuccess?.();
      navigate("/home", { replace: true });
    } catch (err: any) {
      setErrorMsg(err?.message || "Network error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOnboardingComplete = async (onboardingData: any) => {
    setErrorMsg("");
    setIsLoading(true);
    try {
      const token = getToken();
      if (!token) {
        setErrorMsg("Missing token. Please login again.");
        setView("auth");
        goMode("login");
        return;
      }
      const res = await fetch(`${API_BASE}/onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(onboardingData),
      });
      if (!res.ok) {
        setErrorMsg(await parseError(res));
        return;
      }
      onAuthSuccess?.();
      navigate("/home", { replace: true });
    } catch (err: any) {
      setErrorMsg(err?.message || "Network error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOnboardingBack = () => setView("auth");

  const toggleMode = () => {
    setErrorMsg("");
    goMode(mode === "login" ? "signup" : "login", formData.email);
  };

  if (view === "onboarding") {
    return <OnboardingForm onComplete={handleOnboardingComplete} onBack={handleOnboardingBack} />;
  }

  const fe = fieldErrors;
  const isSignup = mode === "signup";

  return (
    <div ref={ref} className="min-h-screen flex gradient-hero overflow-hidden">
      {/* ── Left branding panel ── */}
      <motion.div
        initial={{ opacity: 0, x: -50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8 }}
        className="hidden lg:flex lg:w-1/2 flex-col justify-center items-center p-12 relative overflow-hidden
          bg-gradient-to-r from-primary via-coral/60 to-white"
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
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="font-display text-5xl font-bold text-primary-foreground mb-4"
          >
            {isSignup ? "Join Us" : "Welcome Back"}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="text-lg text-primary-foreground/80"
          >
            {isSignup
              ? "Track your cycle, understand your body, and take control of your health journey."
              : "Continue your health tracking journey where you left off."}
          </motion.p>
        </div>
      </motion.div>

      {/* ── Right form panel ── */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 lg:p-12 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md py-6"
        >
          <div className="gradient-glass backdrop-blur-xl rounded-3xl shadow-card p-8 lg:p-10 border border-border/50">
            {/* Mobile logo */}
            <div className="lg:hidden flex items-center justify-center mb-6">
              <div className="w-14 h-14 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
                <Heart className="w-7 h-7 text-primary-foreground" />
              </div>
            </div>

            {/* Step indicator (signup only) */}
            <AnimatePresence mode="wait">
              {isSignup && (
                <motion.div
                  key="step-indicator"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <StepIndicator current={0} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Heading */}
            <div className="text-center mb-7">
              <motion.h2
                key={mode}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="font-display text-3xl font-bold text-foreground mb-1.5"
              >
                {isSignup ? "Create Account" : "Welcome Back!"}
              </motion.h2>
              <p className="text-muted-foreground text-sm">
                {isSignup ? "Step 1 — Set up your account details" : "Sign in to track your health"}
              </p>
            </div>

            {/* Global error */}
            <AnimatePresence>
              {errorMsg && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start gap-2"
                >
                  <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  {errorMsg}
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* ── Name (signup only) ── */}
              <AnimatePresence mode="wait">
                {isSignup && (
                  <motion.div
                    key="name-field"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Label htmlFor="name">Full Name</Label>
                    <div className="relative mt-2">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        id="name"
                        placeholder="Your name"
                        value={formData.name}
                        onChange={(e) => handleChange("name", e.target.value)}
                        onBlur={() => handleBlur("name")}
                        className={`pl-12 h-12 rounded-xl transition-colors ${fe.name ? "border-destructive focus-visible:ring-destructive/30" : ""}`}
                      />
                    </div>
                    <AnimatePresence><FieldError msg={fe.name || ""} /></AnimatePresence>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Life Stage (signup only) ── */}
              <AnimatePresence mode="wait">
                {isSignup && (
                  <motion.div
                    key="lifestage-field"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Label className="mb-2 block">Life Stage</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {LIFE_STAGE_OPTIONS.map(({ value, label, description, Icon }) => {
                        const selected = formData.lifeStage === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => handleChange("lifeStage", value)}
                            className={`relative rounded-xl border-2 p-3 text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${selected
                                ? "border-primary bg-primary/8 shadow-sm"
                                : "border-border bg-background/60 hover:border-primary/40 hover:bg-primary/4"
                              }`}
                          >
                            <Icon
                              className={`w-5 h-5 mb-1.5 transition-colors ${selected ? "text-primary" : "text-muted-foreground"
                                }`}
                            />
                            <p
                              className={`text-xs font-semibold leading-tight ${selected ? "text-primary" : "text-foreground"
                                }`}
                            >
                              {label}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                              {description}
                            </p>
                            {selected && (
                              <CheckCircle2 className="absolute top-2 right-2 w-3.5 h-3.5 text-primary" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Menarche Age (signup only) ── */}
              <AnimatePresence mode="wait">
                {isSignup && (
                  <motion.div
                    key="menarche-field"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className="flex items-center gap-1.5 mb-2">
                      <Label htmlFor="menarcheAge">Age at First Period</Label>
                      <div className="group relative">
                        <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 rounded-lg bg-popover border border-border shadow-md px-3 py-2 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                          This is called <strong>menarche</strong> — the age when you had your very first menstrual period. It helps us personalise cycle predictions.
                        </div>
                      </div>
                    </div>
                    <Input
                      id="menarcheAge"
                      type="number"
                      min={8}
                      max={25}
                      placeholder="e.g. 12"
                      value={formData.menarcheAge}
                      onChange={(e) => handleChange("menarcheAge", e.target.value)}
                      onBlur={() => handleBlur("menarcheAge")}
                      className={`h-12 rounded-xl w-full transition-colors ${fe.menarcheAge ? "border-destructive focus-visible:ring-destructive/30" : ""}`}
                    />
                    <AnimatePresence><FieldError msg={fe.menarcheAge || ""} /></AnimatePresence>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Email ── */}
              <div>
                <Label htmlFor="email">Email Address</Label>
                <div className="relative mt-2">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    required
                    value={formData.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    onBlur={() => handleBlur("email")}
                    className={`pl-12 h-12 rounded-xl transition-colors ${fe.email ? "border-destructive focus-visible:ring-destructive/30" : ""}`}
                  />
                </div>
                <AnimatePresence><FieldError msg={fe.email || ""} /></AnimatePresence>
              </div>

              {/* ── Password ── */}
              <div>
                <Label htmlFor="password">Password</Label>
                <div className="relative mt-2">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    required
                    value={formData.password}
                    onChange={(e) => handleChange("password", e.target.value)}
                    onBlur={() => handleBlur("password")}
                    className={`pl-12 pr-12 h-12 rounded-xl transition-colors ${fe.password ? "border-destructive focus-visible:ring-destructive/30" : ""}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <AnimatePresence><FieldError msg={fe.password || ""} /></AnimatePresence>

                {/* Password strength meter (signup only) */}
                <AnimatePresence>
                  {isSignup && <PasswordStrengthBar password={formData.password} />}
                </AnimatePresence>
              </div>

              {/* ── Confirm Password (signup only) ── */}
              <AnimatePresence mode="wait">
                {isSignup && (
                  <motion.div
                    key="confirm-field"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <div className="relative mt-2">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        id="confirmPassword"
                        type={showConfirm ? "text" : "password"}
                        placeholder="••••••••"
                        value={formData.confirmPassword}
                        onChange={(e) => handleChange("confirmPassword", e.target.value)}
                        onBlur={() => handleBlur("confirmPassword")}
                        className={`pl-12 pr-12 h-12 rounded-xl transition-colors ${fe.confirmPassword ? "border-destructive focus-visible:ring-destructive/30" : ""}`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm(!showConfirm)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={showConfirm ? "Hide password" : "Show password"}
                      >
                        {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    <AnimatePresence>
                      {fe.confirmPassword ? (
                        <FieldError msg={fe.confirmPassword} />
                      ) : formData.confirmPassword && formData.password === formData.confirmPassword ? (
                        <motion.p
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-1.5 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          Passwords match
                        </motion.p>
                      ) : null}
                    </AnimatePresence>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Forgot password (login only) ── */}
              {!isSignup && (
                <div className="flex justify-end">
                  <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                    Forgot password?
                  </Link>
                </div>
              )}

              {/* ── Submit ── */}
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 rounded-xl flex items-center justify-center gap-2 mt-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {isSignup ? "Creating account…" : "Signing in…"}
                  </>
                ) : (
                  <>
                    {isSignup ? "Continue to Profile Setup" : "Sign In"}
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </Button>
            </form>

            {/* ── Switch mode ── */}
            <div className="mt-7 text-center">
              <p className="text-muted-foreground text-sm">
                {isSignup ? "Already have an account?" : "Don't have an account?"}
                <button
                  type="button"
                  onClick={toggleMode}
                  className="ml-2 text-primary font-semibold hover:underline"
                >
                  {isSignup ? "Sign in" : "Sign up"}
                </button>
              </p>
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-5 px-4">
            By continuing, you agree to our{" "}
            <a href="#" className="text-primary hover:underline">Terms of Service</a>
            {" "}and{" "}
            <a href="#" className="text-primary hover:underline">Privacy Policy</a>.
          </p>
        </motion.div>
      </div>
    </div>
  );
});

AuthForm.displayName = "AuthForm";
export default AuthForm;
