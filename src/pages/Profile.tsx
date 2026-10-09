import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { User, Bell, Shield, Calendar, Mail, Camera, Check, CheckCircle2, XCircle, Loader2, MailCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useProfileStore } from "@/stores/profileStore";
import { toast } from "@/hooks/use-toast";
import { useNotifications } from "@/contexts/NotificationContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";

const toYmdInput = (value: unknown): string => {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  if (typeof value === "string") {
    const mdy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mdy) {
      const month = Number(mdy[1]);
      const day = Number(mdy[2]);
      const year = Number(mdy[3]);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }
  }
  const parsed = value ? new Date(String(value)) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
};

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatYmdForDisplay = (value: unknown): string => {
  const ymd = toYmdInput(value);
  if (!ymd) return "--";
  const d = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const mapPairs = (value: unknown): Array<[string, unknown]> => {
  if (!value) return [];
  if (value instanceof Map) return Array.from(value.entries());
  if (typeof value === "object") return Object.entries(value as Record<string, unknown>);
  return [];
};

const normalizeSymptomTag = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());

const Profile = () => {
  const API_ROOT =
    (import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "http://localhost:5000").replace(
      /\/api$/,
      ""
    );
  const API_BASE = `${API_ROOT}/api/user`;
  const INSIGHTS_BASE = `${API_ROOT}/api/insights`;
  const navigate = useNavigate();

  const {
    name,
    email,
    avatar,
    lifeStage,
    contraceptionType,
    postpartumBreastfeeding,
    tryingToConceive,
    setName,
    setEmail,
    setAvatar,
    setLifeStage,
    setContraceptionType,
    setPostpartumBreastfeeding,
    setTryingToConceive,
    resetProfile,
  } = useProfileStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(name);
  const [editEmail, setEditEmail] = useState(email);
  const [editAvatar, setEditAvatar] = useState<string | null>(avatar);
  const [editLifeStage, setEditLifeStage] = useState(lifeStage);
  const [editContraceptionType, setEditContraceptionType] = useState(contraceptionType);
  const [editPostpartumBreastfeeding, setEditPostpartumBreastfeeding] = useState(postpartumBreastfeeding);
  const [editTryingToConceive, setEditTryingToConceive] = useState(tryingToConceive);
  const [profileDateOfBirth, setProfileDateOfBirth] = useState<string>("");
  const [profileMenarcheAge, setProfileMenarcheAge] = useState<string>("");
  const [profileHeightCm, setProfileHeightCm] = useState<string>("");
  const [profileWeightKg, setProfileWeightKg] = useState<string>("");
  const [editDateOfBirth, setEditDateOfBirth] = useState<string>("");
  const [editMenarcheAge, setEditMenarcheAge] = useState<string>("");
  const [editHeightCm, setEditHeightCm] = useState<string>("");
  const [editWeightKg, setEditWeightKg] = useState<string>("");
  const [lastPeriodStart, setLastPeriodStart] = useState<string | null>(null);
  const [editCycleLengthDays, setEditCycleLengthDays] = useState<number | null>(null);
  const [editPeriodLengthDays, setEditPeriodLengthDays] = useState<number | null>(null);
  const [editLastPeriodStart, setEditLastPeriodStart] = useState<string>("");
  const [age, setAge] = useState<number | null>(null);
  const [bmi, setBmi] = useState<number | null>(null);

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isExportingData, setIsExportingData] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [memberSince, setMemberSince] = useState("--");
  const [cycleLengthDays, setCycleLengthDays] = useState<number | null>(null);
  const [periodLengthDays, setPeriodLengthDays] = useState<number | null>(null);
  const [cyclesTracked, setCyclesTracked] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { preferences, updatePreferences } = useNotifications();
  const { isVerified, refetch: refetchVerification } = useCurrentUser();
  const [resendingVerification, setResendingVerification] = useState(false);

  const handleResendVerification = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    setResendingVerification(true);
    const API_ROOT_LOCAL = (import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "http://localhost:5000").replace(/\/api$/, "");
    try {
      let res = await fetch(`${API_ROOT_LOCAL}/api/user/verify-email/request`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 404) {
        // Backwards compatibility with older backend route naming.
        res = await fetch(`${API_ROOT_LOCAL}/api/user/resend-verification`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      const data = await res.json().catch(() => ({}));
      const devCode =
        typeof data?.devVerificationCode === "string" && data.devVerificationCode
          ? ` Development code: ${data.devVerificationCode}`
          : "";
      toast({
        title: res.ok ? "Code sent!" : "Failed to send",
        description: res.ok
          ? `Check your inbox for the verification code.${devCode}`
          : (data?.message || "Try again."),
      });
    } catch {
      toast({ title: "Network error", description: "Please try again." });
    } finally {
      setResendingVerification(false);
    }
  };

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const activeAvatar = isEditing ? editAvatar : avatar;

  useEffect(() => {
    const loadProfile = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        setIsLoadingProfile(false);
        return;
      }

      try {
        const [userRes, settingsRes, recentCyclesRes] = await Promise.all([
          fetch(`${API_BASE}/me`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE}/settings`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${INSIGHTS_BASE}/recent-cycles?n=24`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (!userRes.ok) {
          throw new Error("Failed to load profile");
        }

        const user = await userRes.json();
        const settings = settingsRes.ok ? await settingsRes.json() : null;
        const displayName = user?.profile?.displayName || "User";
        const userEmail = user?.email || "";
        const avatarUrl = user?.profile?.avatarUrl || null;
        const userLifeStage = user?.profile?.lifeStage || "unknown";
        const userContraception = user?.profile?.contraceptionType || "none";
        const userPostpartum = Boolean(user?.profile?.postpartumBreastfeeding);
        const userTrying = Boolean(user?.profile?.tryingToConceive);
        const dobStr = toYmdInput(user?.profile?.dateOfBirth);
        const menarcheAgeValue = user?.profile?.menarcheAge ?? null;
        const height = user?.profile?.heightCm ?? null;
        const weight = user?.profile?.weightKg ?? null;
        const userAge = typeof user?.profile?.age === "number" ? user.profile.age : null;
        const userBmi = typeof user?.profile?.bmi === "number" ? user.profile.bmi : null;
        const createdAt = user?.createdAt ? new Date(user.createdAt) : null;

        setName(displayName);
        setEmail(userEmail);
        setAvatar(avatarUrl);
        setEditAvatar(avatarUrl);
        setLifeStage(userLifeStage);
        setContraceptionType(userContraception);
        setPostpartumBreastfeeding(userPostpartum);
        setTryingToConceive(userTrying);
        setEditName(displayName);
        setEditEmail(userEmail);
        setEditLifeStage(userLifeStage);
        setEditContraceptionType(userContraception);
        setEditPostpartumBreastfeeding(userPostpartum);
        setEditTryingToConceive(userTrying);
        setProfileDateOfBirth(dobStr);
        setProfileMenarcheAge(
          menarcheAgeValue !== null && menarcheAgeValue !== undefined ? String(menarcheAgeValue) : ""
        );
        setProfileHeightCm(height !== null && height !== undefined ? String(height) : "");
        setProfileWeightKg(weight !== null && weight !== undefined ? String(weight) : "");
        setEditDateOfBirth(dobStr);
        setEditMenarcheAge(
          menarcheAgeValue !== null && menarcheAgeValue !== undefined ? String(menarcheAgeValue) : ""
        );
        setEditHeightCm(height !== null && height !== undefined ? String(height) : "");
        setEditWeightKg(weight !== null && weight !== undefined ? String(weight) : "");
        setAge(userAge);
        setBmi(userBmi);
        setMemberSince(
          createdAt
            ? createdAt.toLocaleDateString("en-US", { month: "long", year: "numeric" })
            : "--"
        );
        setCycleLengthDays(settings?.cycleLengthDays ?? null);
        setPeriodLengthDays(settings?.periodLengthDays ?? null);
        const normalizedLastStart = toYmdInput(settings?.lastPeriodStart);
        setLastPeriodStart(normalizedLastStart || null);
        setEditCycleLengthDays(settings?.cycleLengthDays ?? null);
        setEditPeriodLengthDays(settings?.periodLengthDays ?? null);
        setEditLastPeriodStart(normalizedLastStart);
        const recentCyclesJson = recentCyclesRes.ok ? await recentCyclesRes.json() : null;
        const cycleCount = Array.isArray(recentCyclesJson?.cycles) ? recentCyclesJson.cycles.length : 0;
        setCyclesTracked(cycleCount);
      } catch {
        toast({
          title: "Unable to load profile",
          description: "Please try again.",
        });
      } finally {
        setIsLoadingProfile(false);
      }
    };

    loadProfile();
  }, [
    API_BASE,
    INSIGHTS_BASE,
    setAvatar,
    setContraceptionType,
    setEmail,
    setLifeStage,
    setName,
    setPostpartumBreastfeeding,
    setTryingToConceive,
  ]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditAvatar(reader.result as string);
        setIsEditing(true);
        toast({
          title: "Profile picture updated!",
          description: "Save profile to sync with backend.",
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProfile = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      toast({
        title: "Not signed in",
        description: "Please sign in again.",
      });
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`${API_BASE}/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          displayName: editName,
          email: editEmail,
          avatarUrl: editAvatar,
          lifeStage: editLifeStage,
          contraceptionType: editContraceptionType,
          postpartumBreastfeeding: editPostpartumBreastfeeding,
          tryingToConceive: editTryingToConceive,
          dateOfBirth: editDateOfBirth || null,
          menarcheAge: editMenarcheAge ? Number(editMenarcheAge) : null,
          heightCm: editHeightCm ? Number(editHeightCm) : null,
          weightKg: editWeightKg ? Number(editWeightKg) : null,
          cycleLengthDays: typeof editCycleLengthDays === "number" ? editCycleLengthDays : undefined,
          periodLengthDays: typeof editPeriodLengthDays === "number" ? editPeriodLengthDays : undefined,
          lastPeriodStart: toYmdInput(editLastPeriodStart) || undefined,
        }),
      });

      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.message || "Failed to save profile");
      }

      const data = await res.json();
      const savedName = data?.user?.profile?.displayName ?? editName;
      const savedEmail = data?.user?.email ?? editEmail;
      const savedAvatar = data?.user?.profile?.avatarUrl ?? editAvatar;
      const savedLifeStage = data?.user?.profile?.lifeStage ?? editLifeStage;
      const savedContraception = data?.user?.profile?.contraceptionType ?? editContraceptionType;
      const savedPostpartum = Boolean(data?.user?.profile?.postpartumBreastfeeding ?? editPostpartumBreastfeeding);
      const savedTrying = Boolean(data?.user?.profile?.tryingToConceive ?? editTryingToConceive);
      const savedDobStr = toYmdInput(data?.user?.profile?.dateOfBirth);
      const savedMenarcheAge = data?.user?.profile?.menarcheAge ?? null;
      const savedHeight = data?.user?.profile?.heightCm ?? null;
      const savedWeight = data?.user?.profile?.weightKg ?? null;
      const savedAge = typeof data?.user?.profile?.age === "number" ? data.user.profile.age : null;
      const savedBmi = typeof data?.user?.profile?.bmi === "number" ? data.user.profile.bmi : null;
      const savedCycleSettings = data?.cycleSettings ?? null;

      setName(savedName);
      setEmail(savedEmail);
      setAvatar(savedAvatar);
      setEditAvatar(savedAvatar);
      setLifeStage(savedLifeStage);
      setContraceptionType(savedContraception);
      setPostpartumBreastfeeding(savedPostpartum);
      setTryingToConceive(savedTrying);
      setEditName(savedName);
      setEditEmail(savedEmail);
      setEditLifeStage(savedLifeStage);
      setEditContraceptionType(savedContraception);
      setEditPostpartumBreastfeeding(savedPostpartum);
      setEditTryingToConceive(savedTrying);
      setProfileDateOfBirth(savedDobStr);
      setProfileMenarcheAge(
        savedMenarcheAge !== null && savedMenarcheAge !== undefined ? String(savedMenarcheAge) : ""
      );
      setProfileHeightCm(savedHeight !== null && savedHeight !== undefined ? String(savedHeight) : "");
      setProfileWeightKg(savedWeight !== null && savedWeight !== undefined ? String(savedWeight) : "");
      setEditDateOfBirth(savedDobStr);
      setEditMenarcheAge(
        savedMenarcheAge !== null && savedMenarcheAge !== undefined ? String(savedMenarcheAge) : ""
      );
      setEditHeightCm(savedHeight !== null && savedHeight !== undefined ? String(savedHeight) : "");
      setEditWeightKg(savedWeight !== null && savedWeight !== undefined ? String(savedWeight) : "");
      setAge(savedAge);
      setBmi(savedBmi);
      setCycleLengthDays(savedCycleSettings?.cycleLengthDays ?? cycleLengthDays);
      setPeriodLengthDays(savedCycleSettings?.periodLengthDays ?? periodLengthDays);
      const normalizedSavedLastStart = toYmdInput(savedCycleSettings?.lastPeriodStart);
      setLastPeriodStart(normalizedSavedLastStart || lastPeriodStart);
      setEditCycleLengthDays(savedCycleSettings?.cycleLengthDays ?? cycleLengthDays);
      setEditPeriodLengthDays(savedCycleSettings?.periodLengthDays ?? periodLengthDays);
      setEditLastPeriodStart(normalizedSavedLastStart || (lastPeriodStart ?? ""));
      setIsEditing(false);
      toast({
        title: "Profile saved!",
        description: "Your changes have been synced.",
      });
    } catch (err: any) {
      toast({
        title: "Save failed",
        description: err?.message || "Could not save profile changes.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      toast({ title: "Not signed in", description: "Please sign in again." });
      return;
    }
    if (!currentPassword || !newPassword) {
      toast({ title: "Missing fields", description: "Enter your current and new password." });
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

    setIsChangingPassword(true);
    try {
      const res = await fetch(`${API_BASE}/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.message || "Failed to change password");
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setShowChangePassword(false);
      toast({ title: "Password updated", description: "Your password has been changed." });
    } catch (err: any) {
      toast({ title: "Change password failed", description: err?.message || "Please try again." });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      toast({ title: "Not signed in", description: "Please sign in again." });
      return;
    }
    if (!deletePassword) {
      toast({ title: "Password required", description: "Enter your password to delete your account." });
      return;
    }
    const ok = window.confirm("Delete your account and all your data? This cannot be undone.");
    if (!ok) return;

    setIsDeletingAccount(true);
    try {
      const res = await fetch(`${API_BASE}/account`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password: deletePassword }),
      });
      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.message || "Failed to delete account");
      }

      localStorage.removeItem("token");
      resetProfile();
      navigate("/welcome", { replace: true });
    } catch (err: any) {
      toast({ title: "Delete failed", description: err?.message || "Please try again." });
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleExportMyData = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      toast({ title: "Not signed in", description: "Please sign in again." });
      return;
    }

    const authHeaders = { Authorization: `Bearer ${token}` };
    setIsExportingData(true);

    try {
      const fetchJson = async (url: string) => {
        const res = await fetch(url, { headers: authHeaders });
        const payload = await res.json().catch(() => null);
        return {
          ok: res.ok,
          status: res.status,
          payload,
          error: payload?.message || `Request failed (${res.status})`,
        };
      };

      const [userRes, settingsRes, entriesRes, lastCycleRes, recentCyclesRes, modelPredictionsRes] = await Promise.all([
        fetchJson(`${API_BASE}/me`),
        fetchJson(`${API_BASE}/settings`),
        fetchJson(`${API_ROOT}/api/daily-entries?limit=2000`),
        fetchJson(`${INSIGHTS_BASE}/last-cycle`),
        fetchJson(`${INSIGHTS_BASE}/recent-cycles?n=12`),
        fetchJson(`${API_ROOT}/api/daily-entries/model-predictions`),
      ]);

      if (!userRes.ok) {
        throw new Error(userRes.error || "Unable to load profile data for export.");
      }

      const warnings: string[] = [];
      if (!settingsRes.ok) warnings.push("cycle settings");
      if (!entriesRes.ok) warnings.push("daily entries");
      if (!lastCycleRes.ok) warnings.push("last-cycle insights");
      if (!recentCyclesRes.ok) warnings.push("recent-cycles insights");
      if (!modelPredictionsRes.ok) warnings.push("model predictions");

      const exportedAt = new Date();
      const exportDate = `${exportedAt.getFullYear()}-${String(exportedAt.getMonth() + 1).padStart(2, "0")}-${String(
        exportedAt.getDate()
      ).padStart(2, "0")}`;

      const user = userRes.payload && typeof userRes.payload === "object" ? userRes.payload as Record<string, unknown> : {};
      const profile = user?.profile && typeof user.profile === "object" ? user.profile as Record<string, unknown> : {};
      const cycleSettings =
        settingsRes.ok && settingsRes.payload && typeof settingsRes.payload === "object"
          ? (settingsRes.payload as Record<string, unknown>)
          : null;
      const dailyEntries = Array.isArray(entriesRes.payload?.data) ? (entriesRes.payload.data as Array<Record<string, unknown>>) : [];
      const recentCycles = Array.isArray(recentCyclesRes.payload?.cycles)
        ? (recentCyclesRes.payload.cycles as Array<Record<string, unknown>>)
        : [];
      const hybridTriage =
        modelPredictionsRes.ok && modelPredictionsRes.payload?.hybrid_triage && typeof modelPredictionsRes.payload.hybrid_triage === "object"
          ? (modelPredictionsRes.payload.hybrid_triage as Record<string, unknown>)
          : null;

      const symptomCounts: Record<string, number> = {};
      dailyEntries.forEach((entry) => {
        const symptoms =
          entry?.symptoms && typeof entry.symptoms === "object" ? (entry.symptoms as Record<string, unknown>) : null;
        if (!symptoms) return;

        const selected = Array.isArray(symptoms.selectedSymptomTags)
          ? symptoms.selectedSymptomTags
          : [];
        const levelTags = mapPairs(symptoms.symptomLevelByTag).map(([tag]) => tag);
        const tags = [...new Set([...selected, ...levelTags].map(normalizeSymptomTag).filter(Boolean))];

        tags.forEach((tag) => {
          symptomCounts[tag] = (symptomCounts[tag] || 0) + 1;
        });
      });

      const totalLoggedDays = Math.max(1, dailyEntries.length);
      const topSymptoms = Object.entries(symptomCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([label, value]) => ({
          label,
          value,
          prevalencePct: Number(((value / totalLoggedDays) * 100).toFixed(1)),
        }));

      const cycleChartRows = recentCycles
        .map((cycle) => ({
          label: formatYmdForDisplay(cycle.cycleStart),
          cycleLength: Number(cycle.cycleLengthDays) || 0,
          periodLength: Number(cycle.periodLengthDays) || 0,
          loggedDays: Number(cycle.loggedDays) || 0,
        }))
        .filter((row) => row.cycleLength > 0 || row.periodLength > 0 || row.loggedDays > 0);

      const maxCycleLength = Math.max(1, ...cycleChartRows.map((r) => r.cycleLength));
      const maxPeriodLength = Math.max(1, ...cycleChartRows.map((r) => r.periodLength));
      const maxLoggedDays = Math.max(1, ...cycleChartRows.map((r) => r.loggedDays));
      const maxSymptomCount = Math.max(1, ...topSymptoms.map((s) => s.value));

      const redFlagChecklist = Array.isArray(hybridTriage?.red_flags)
        ? (hybridTriage!.red_flags as Array<Record<string, unknown>>).map((item) => ({
          label: String(item?.label ?? "Unnamed red flag"),
          hit: Boolean(item?.hit),
          severity: String(item?.severity ?? "unknown"),
        }))
        : [];

      const narrativeRedFlags = Array.isArray(lastCycleRes.payload?.insights?.red_flags)
        ? (lastCycleRes.payload.insights.red_flags as unknown[]).map((x) => String(x))
        : [];

      const riskConditions = Array.isArray(hybridTriage?.conditions)
        ? (hybridTriage!.conditions as Array<Record<string, unknown>>).map((condition) => ({
          name: String(condition?.condition || condition?.label || "Condition"),
          status: String(condition?.final_status ?? "Needs more data"),
          confidence: String(condition?.final_confidence ?? "Low"),
        }))
        : [];

      const predictionsFallback = Array.isArray(modelPredictionsRes.payload?.predictions)
        ? (modelPredictionsRes.payload.predictions as Array<Record<string, unknown>>).map((p) => ({
          name: String(p?.label ?? "Condition"),
          status: p?.positive === true ? "Possible" : "Unlikely",
          confidence: typeof p?.probability === "number" ? `${Math.round(Number(p.probability) * 100)}%` : "N/A",
        }))
        : [];

      const screeningRows = riskConditions.length ? riskConditions : predictionsFallback;

      const renderBarRows = (
        rows: Array<{ label: string; value: number }>,
        maxValue: number,
        color: string
      ) =>
        rows.length
          ? rows
            .map((row) => {
              const pct = Math.max(0, Math.min(100, Math.round((row.value / maxValue) * 100)));
              return `
                  <div class="bar-row">
                    <div class="bar-label">${escapeHtml(row.label)}</div>
                    <div class="bar-track"><div class="bar-fill" style="width:${pct}%; background:${color};"></div></div>
                    <div class="bar-value">${row.value}</div>
                  </div>
                `;
            })
            .join("")
          : `<p class="empty">No data available yet.</p>`;

      const cycleLengthBars = renderBarRows(
        cycleChartRows.map((row) => ({ label: row.label, value: row.cycleLength })),
        maxCycleLength,
        "#2563eb"
      );
      const periodLengthBars = renderBarRows(
        cycleChartRows.map((row) => ({ label: row.label, value: row.periodLength })),
        maxPeriodLength,
        "#0ea5e9"
      );
      const loggedDaysBars = renderBarRows(
        cycleChartRows.map((row) => ({ label: row.label, value: row.loggedDays })),
        maxLoggedDays,
        "#14b8a6"
      );
      const symptomFrequencyBars = topSymptoms.length
        ? topSymptoms
          .map((row) => {
            const pct = Math.max(0, Math.min(100, Math.round((row.value / maxSymptomCount) * 100)));
            return `
                <div class="bar-row">
                  <div class="bar-label">${escapeHtml(row.label)}</div>
                  <div class="bar-track"><div class="bar-fill" style="width:${pct}%; background:#7c3aed;"></div></div>
                  <div class="bar-value">${row.prevalencePct}%</div>
                </div>
                <div class="bar-sub muted">Prevalence across logged days: ${row.prevalencePct}% (n=${row.value}/${dailyEntries.length || 0})</div>
              `;
          })
          .join("")
        : "";

      const redFlagChecklistHtml = redFlagChecklist
        .map(
          (flag) => `<li class="check-item ${flag.hit ? "hit" : ""}">
            <span class="check-box">${flag.hit ? "x" : " "}</span>
            <span>${escapeHtml(flag.label)} <span class="muted">(${escapeHtml(flag.severity)})</span></span>
          </li>`
        )
        .join("");

      const narrativeRedFlagsHtml = narrativeRedFlags.length
        ? `<ul>${narrativeRedFlags.map((text) => `<li>${escapeHtml(text)}</li>`).join("")}</ul>`
        : "";

      const screeningRowsHtml = screeningRows
        ? screeningRows
          .map(
            (row) => `<tr>
                <td>${escapeHtml(row.name)}</td>
                <td>${escapeHtml(row.status)}</td>
                <td>${escapeHtml(row.confidence)}</td>
              </tr>`
          )
          .join("")
        : "";

      const hasCycleLengthData = cycleChartRows.some((row) => row.cycleLength > 0);
      const hasPeriodLengthData = cycleChartRows.some((row) => row.periodLength > 0);
      const hasLoggedDaysData = cycleChartRows.some((row) => row.loggedDays > 0);
      const hasHistoryChartsData = hasCycleLengthData || hasPeriodLengthData || hasLoggedDaysData;
      const hasSymptomFrequencyData = topSymptoms.length > 0;
      const hasChecklistData = redFlagChecklist.length > 0;
      const hasNarrativeData = narrativeRedFlags.length > 0;
      const hasRedFlagsData = hasChecklistData || hasNarrativeData;
      const hasScreeningData = screeningRows.length > 0;

      const historyChartsSection = hasHistoryChartsData
        ? `
              <section class="section">
                <h2>History Charts</h2>
                <div class="chart-grid">
                  ${hasCycleLengthData
          ? `<div class="chart-card">
                          <h3>Cycle Length Trend (days)</h3>
                          ${cycleLengthBars}
                        </div>`
          : ""
        }
                  ${hasPeriodLengthData
          ? `<div class="chart-card">
                          <h3>Period Length Trend (days)</h3>
                          ${periodLengthBars}
                        </div>`
          : ""
        }
                  ${hasLoggedDaysData
          ? `<div class="chart-card wide">
                          <h3>Logged Days by Cycle</h3>
                          ${loggedDaysBars}
                        </div>`
          : ""
        }
                </div>
              </section>
          `
        : "";

      const symptomFrequencySection = hasSymptomFrequencyData
        ? `
              <section class="section">
                <h2>Symptom Frequency</h2>
                <div class="panel">
                  ${symptomFrequencyBars}
                </div>
              </section>
          `
        : "";

      const redFlagsSection = hasRedFlagsData
        ? `
              <section class="section">
                <h2>Red Flag Checklist</h2>
                <div class="${hasChecklistData && hasNarrativeData ? "split" : "panel-stack"}">
                  ${hasChecklistData
          ? `<div class="panel">
                          <h3>Checklist</h3>
                          <ul class="checklist">${redFlagChecklistHtml}</ul>
                        </div>`
          : ""
        }
                  ${hasNarrativeData
          ? `<div class="panel">
                          <h3>Narrative Red Flags</h3>
                          ${narrativeRedFlagsHtml}
                        </div>`
          : ""
        }
                </div>
              </section>
          `
        : "";

      const riskScreeningSection = hasScreeningData
        ? `
              <section class="section">
                <h2>Risk Screening</h2>
                <table>
                  <thead>
                    <tr>
                      <th>Condition</th>
                      <th>Status</th>
                      <th>Confidence</th>
                    </tr>
                  </thead>
                  <tbody>${screeningRowsHtml}</tbody>
                </table>
              </section>
          `
        : "";

      const reportHtml = `
        <!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <title>Cycle Companion Export - ${exportDate}</title>
            <style>
              @page { size: A4; margin: 11mm; }
              :root {
                --ink: #0f172a;
                --muted: #475569;
                --line: #dbe3ee;
                --surface: #ffffff;
                --page: #f8fafc;
                --brand: #2563eb;
                --brand-soft: #dbeafe;
                --good: #0f766e;
                --warn: #92400e;
                --danger: #991b1b;
              }
              * { box-sizing: border-box; }
              body {
                font-family: "Segoe UI", Arial, sans-serif;
                color: var(--ink);
                background: var(--page);
                margin: 0;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              .sheet {
                max-width: 780px;
                margin: 0 auto;
                padding: 6px 2px;
              }
              .hero {
                background: linear-gradient(135deg, #eff6ff 0%, #f0f9ff 55%, #f5f3ff 100%);
                border: 1px solid #c7d2fe;
                border-radius: 14px;
                padding: 14px 16px;
                margin-bottom: 12px;
              }
              h1 { margin: 0; font-size: 25px; letter-spacing: -0.01em; }
              .subtitle { margin: 4px 0 0; color: var(--muted); font-size: 12px; }
              .hero-meta {
                margin-top: 10px;
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
              }
              .pill {
                display: inline-flex;
                align-items: center;
                padding: 4px 8px;
                border-radius: 999px;
                font-size: 10px;
                border: 1px solid #bfdbfe;
                background: #ffffff;
                color: #1e3a8a;
              }
              .section {
                background: var(--surface);
                border: 1px solid var(--line);
                border-radius: 12px;
                padding: 12px 14px;
                margin-bottom: 10px;
                page-break-inside: avoid;
              }
              h2 {
                margin: 0 0 9px;
                font-size: 14px;
                letter-spacing: 0.01em;
                text-transform: uppercase;
                color: #1e3a8a;
              }
              h3 {
                margin: 10px 0 7px;
                font-size: 12px;
                color: #1f2937;
              }
              p, li, td, th { font-size: 11px; line-height: 1.45; }
              .summary-grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 8px;
              }
              .metric {
                border: 1px solid #e2e8f0;
                background: #f8fafc;
                border-radius: 10px;
                padding: 8px 9px;
              }
              .metric-label {
                color: var(--muted);
                font-size: 10px;
                margin-bottom: 3px;
              }
              .metric-value {
                font-size: 12px;
                font-weight: 700;
                color: #0f172a;
              }
              .chart-grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 10px;
              }
              .chart-grid .wide { grid-column: 1 / -1; }
              .chart-card {
                border: 1px solid #e2e8f0;
                border-radius: 10px;
                padding: 8px;
                background: #fcfdff;
              }
              .bar-row {
                display: grid;
                grid-template-columns: 146px 1fr 34px;
                gap: 7px;
                align-items: center;
                margin: 5px 0;
              }
              .bar-label {
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                font-size: 10px;
                color: #334155;
              }
              .bar-track {
                width: 100%;
                height: 9px;
                background: #e2e8f0;
                border-radius: 999px;
                overflow: hidden;
              }
              .bar-fill { height: 100%; border-radius: 999px; }
              .bar-value {
                text-align: right;
                font-weight: 700;
                font-size: 10px;
                color: #1f2937;
              }
              .bar-sub {
                margin: -2px 0 5px 153px;
                font-size: 9px;
              }
              .split {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 10px;
              }
              .panel-stack {
                display: grid;
                grid-template-columns: 1fr;
                gap: 10px;
              }
              .panel {
                border: 1px solid #e2e8f0;
                border-radius: 10px;
                padding: 8px;
                background: #fcfdff;
              }
              .checklist {
                list-style: none;
                margin: 0;
                padding: 0;
              }
              .check-item {
                display: flex;
                gap: 7px;
                align-items: flex-start;
                margin: 6px 0;
              }
              .check-box {
                width: 14px;
                height: 14px;
                flex: 0 0 14px;
                border: 1px solid #94a3b8;
                border-radius: 3px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 9px;
                font-weight: 800;
                color: #94a3b8;
              }
              .check-item.hit .check-box {
                border-color: #dc2626;
                color: #dc2626;
                background: #fee2e2;
              }
              .muted { color: var(--muted); }
              .empty { color: #64748b; margin: 0; font-style: italic; }
              table {
                width: 100%;
                border-collapse: collapse;
                border: 1px solid #e2e8f0;
                border-radius: 10px;
                overflow: hidden;
              }
              th, td {
                border: 1px solid #e2e8f0;
                padding: 7px;
                vertical-align: top;
                text-align: left;
                font-size: 10.5px;
              }
              th {
                background: #eff6ff;
                color: #1e3a8a;
                font-weight: 700;
              }
              tbody tr:nth-child(even) { background: #f8fafc; }
              .warn {
                border: 1px solid #fdba74;
                background: #fff7ed;
                color: var(--warn);
                border-radius: 10px;
                padding: 9px;
                margin-top: 8px;
                font-size: 10.5px;
              }
              .footer-note {
                margin-top: 8px;
                font-size: 10px;
                color: #64748b;
              }
              @media print { .no-print { display: none; } }
            </style>
          </head>
          <body>
            <div class="sheet">
              <header class="hero">
                <h1>Cycle Companion Health Export</h1>
                <p class="subtitle">A clean summary of your profile, history trends, red flags, and risk screening.</p>
                <div class="hero-meta">
                  <span class="pill">Exported: ${escapeHtml(exportedAt.toLocaleString())}</span>
                  <span class="pill">Profile: ${escapeHtml(profile.displayName || "User")}</span>
                  <span class="pill">Email: ${escapeHtml(user.email || "--")}</span>
                </div>
              </header>

              <section class="section">
                <h2>Profile Snapshot</h2>
                <div class="summary-grid">
                  <div class="metric">
                    <div class="metric-label">Life Stage</div>
                    <div class="metric-value">${escapeHtml(profile.lifeStage || "--")}</div>
                  </div>
                  <div class="metric">
                    <div class="metric-label">Date of Birth</div>
                    <div class="metric-value">${escapeHtml(formatYmdForDisplay(profile.dateOfBirth))}</div>
                  </div>
                  <div class="metric">
                    <div class="metric-label">Age / BMI</div>
                    <div class="metric-value">${escapeHtml(profile.age ?? "--")} / ${escapeHtml(profile.bmi ?? "--")}</div>
                  </div>
                  <div class="metric">
                    <div class="metric-label">Cycle Length</div>
                    <div class="metric-value">${escapeHtml(cycleSettings?.cycleLengthDays ?? "--")} days</div>
                  </div>
                  <div class="metric">
                    <div class="metric-label">Period Length</div>
                    <div class="metric-value">${escapeHtml(cycleSettings?.periodLengthDays ?? "--")} days</div>
                  </div>
                  <div class="metric">
                    <div class="metric-label">Last Period Start</div>
                    <div class="metric-value">${escapeHtml(formatYmdForDisplay(cycleSettings?.lastPeriodStart))}</div>
                  </div>
                  <div class="metric">
                    <div class="metric-label">Total Daily Logs</div>
                    <div class="metric-value">${dailyEntries.length}</div>
                  </div>
                  <div class="metric">
                    <div class="metric-label">Recent Cycles Summarized</div>
                    <div class="metric-value">${cycleChartRows.length}</div>
                  </div>
                </div>
              </section>

              ${historyChartsSection}
              ${symptomFrequencySection}
              ${redFlagsSection}
              ${riskScreeningSection}

              ${warnings.length
          ? `<div class="warn"><strong>Partial export:</strong> Some sources were unavailable (${escapeHtml(
            warnings.join(", ")
          )}).</div>`
          : ""
        }

              <p class="footer-note no-print">If the print dialog does not open automatically, use browser Print and choose "Save as PDF".</p>
            </div>
            <script>
              window.onload = function () {
                setTimeout(function () { window.print(); }, 250);
              };
            </script>
          </body>
        </html>
      `;

      const reportBlob = new Blob([reportHtml], { type: "text/html" });
      const reportUrl = URL.createObjectURL(reportBlob);
      const opened = window.open(reportUrl, "_blank", "noopener,noreferrer");

      if (!opened) {
        // Fallback for strict popup blockers: open in current tab.
        window.location.assign(reportUrl);
      }

      toast({
        title: "PDF report ready",
        description: opened
          ? "Print dialog opened. Choose Save as PDF to download your report."
          : "Report opened in this tab. Choose Save as PDF in the print dialog.",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to export your data right now.";
      toast({
        title: "Export failed",
        description: message,
      });
    } finally {
      setIsExportingData(false);
    }
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 md:py-12 max-w-3xl">
        {isLoadingProfile ? (
          <div className="glass-card p-6 text-center text-muted-foreground mb-6">Loading profile...</div>
        ) : null}

        {/* Header */}
        <section className="mb-10 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl gradient-primary shadow-elevated mb-4">
            <User className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-2">Your Profile</h1>
          <p className="text-muted-foreground">Manage your account and preferences</p>
        </section>

        <div className="space-y-6">
          {/* User Info Card */}
          <div className="glass-card p-8 animate-fade-in">
            <div className="flex flex-col items-center text-center mb-8">
              {/* Avatar with upload */}
              <div className="relative group mb-6">
                <div className="w-28 h-28 rounded-full overflow-hidden shadow-elevated ring-4 ring-primary/10">
                  {activeAvatar ? (
                    <img
                      src={activeAvatar}
                      alt="Profile"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full gradient-primary flex items-center justify-center">
                      <span className="text-3xl font-serif font-bold text-primary-foreground">
                        {initials}
                      </span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 bg-foreground/60 opacity-0 group-hover:opacity-100 rounded-full flex items-center justify-center transition-opacity duration-300 cursor-pointer"
                >
                  <Camera className="w-6 h-6 text-primary-foreground" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </div>

              {/* User Info */}
              <div className="w-full max-w-sm">
                {isEditing ? (
                  <div className="space-y-4">
                    <div className="text-left">
                      <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Name</label>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="border-border focus:border-primary text-center"
                      />
                    </div>
                    <div className="text-left">
                      <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Email</label>
                      <Input
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        className="border-border focus:border-primary text-center"
                      />
                    </div>
                    <div className="text-left">
                      <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Life Stage</label>
                      <select
                        value={editLifeStage}
                        onChange={(e) =>
                          setEditLifeStage(e.target.value as "reproductive" | "perimenopausal" | "unknown")
                        }
                        className="w-full h-12 rounded-xl border border-input bg-background px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                      >
                        <option value="reproductive">Reproductive</option>
                        <option value="perimenopausal">Perimenopausal</option>
                        <option value="unknown">Unknown</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div className="text-left">
                        <label className="text-sm font-medium text-muted-foreground mb-1.5 h-10 flex items-end">Date of birth</label>
                        <Input
                          type="date"
                          value={editDateOfBirth}
                          onChange={(e) => setEditDateOfBirth(e.target.value)}
                          className="h-12 border-border focus:border-primary"
                        />
                      </div>
                      <div className="text-left">
                        <label className="text-sm font-medium text-muted-foreground mb-1.5 h-10 flex items-end">Height (cm)</label>
                        <Input
                          inputMode="numeric"
                          value={editHeightCm}
                          onChange={(e) => setEditHeightCm(e.target.value)}
                          className="h-12 border-border focus:border-primary"
                        />
                      </div>
                      <div className="text-left">
                        <label className="text-sm font-medium text-muted-foreground mb-1.5 h-10 flex items-end">Age at first period</label>
                        <Input
                          type="number"
                          min={8}
                          max={25}
                          value={editMenarcheAge}
                          onChange={(e) => setEditMenarcheAge(e.target.value)}
                          className="h-12 border-border focus:border-primary"
                        />
                      </div>
                      <div className="text-left">
                        <label className="text-sm font-medium text-muted-foreground mb-1.5 h-10 flex items-end">Weight (kg)</label>
                        <Input
                          inputMode="numeric"
                          value={editWeightKg}
                          onChange={(e) => setEditWeightKg(e.target.value)}
                          className="h-12 border-border focus:border-primary"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="text-left">
                        <label className="text-sm font-medium text-muted-foreground mb-1.5 h-10 flex items-end">Cycle length (days)</label>
                        <Input
                          type="number"
                          min={15}
                          max={60}
                          value={editCycleLengthDays ?? ""}
                          onChange={(e) => setEditCycleLengthDays(e.target.value ? Number(e.target.value) : null)}
                          className="h-12 border-border focus:border-primary"
                        />
                      </div>
                      <div className="text-left">
                        <label className="text-sm font-medium text-muted-foreground mb-1.5 h-10 flex items-end">Period length (days)</label>
                        <Input
                          type="number"
                          min={1}
                          max={14}
                          value={editPeriodLengthDays ?? ""}
                          onChange={(e) => setEditPeriodLengthDays(e.target.value ? Number(e.target.value) : null)}
                          className="h-12 border-border focus:border-primary"
                        />
                      </div>
                      <div className="text-left">
                        <label className="text-sm font-medium text-muted-foreground mb-1.5 h-10 flex items-end">Last period start</label>
                        <Input
                          type="date"
                          value={editLastPeriodStart}
                          onChange={(e) => setEditLastPeriodStart(toYmdInput(e.target.value))}
                          className="h-12 border-border focus:border-primary"
                        />
                      </div>
                    </div>
                    <div className="flex gap-3 justify-center pt-2">
                      <Button onClick={handleSaveProfile} className="btn-primary px-6" disabled={isSaving}>
                        <Check className="w-4 h-4 mr-2" />
                        {isSaving ? "Saving..." : "Save Changes"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditName(name);
                          setEditEmail(email);
                          setEditAvatar(avatar);
                          setEditLifeStage(lifeStage);
                          setEditContraceptionType(contraceptionType);
                          setEditPostpartumBreastfeeding(postpartumBreastfeeding);
                          setEditTryingToConceive(tryingToConceive);
                          setEditDateOfBirth(profileDateOfBirth);
                          setEditMenarcheAge(profileMenarcheAge);
                          setEditHeightCm(profileHeightCm);
                          setEditWeightKg(profileWeightKg);
                          setEditCycleLengthDays(cycleLengthDays);
                          setEditPeriodLengthDays(periodLengthDays);
                          setEditLastPeriodStart(lastPeriodStart ?? "");
                          setIsEditing(false);
                        }}
                        disabled={isSaving}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <h2 className="font-serif text-2xl font-semibold text-foreground mb-1">{name}</h2>
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <Mail className="w-4 h-4" />
                      <span>{email}</span>
                    </div>
                    {/* Email verification badge */}
                    <div className="mt-2 flex items-center justify-center gap-2">
                      {isVerified === true ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 px-2.5 py-1 rounded-full">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Email verified
                        </span>
                      ) : isVerified === false ? (
                        <div className="flex flex-col items-center gap-1.5">
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 px-2.5 py-1 rounded-full">
                            <XCircle className="w-3.5 h-3.5" />
                            Email not verified
                          </span>
                          <button
                            onClick={handleResendVerification}
                            disabled={resendingVerification}
                            className="text-xs text-primary underline-offset-2 hover:underline flex items-center gap-1 disabled:opacity-50"
                          >
                            {resendingVerification ? <Loader2 className="w-3 h-3 animate-spin" /> : <MailCheck className="w-3 h-3" />}
                            Send verification code
                          </button>
                          <Link to="/verify-email" className="text-xs text-primary underline-offset-2 hover:underline">
                            Enter code
                          </Link>
                        </div>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      Life stage:{" "}
                      <span className="font-semibold text-foreground capitalize">
                        {lifeStage.replace("_", " ")}
                      </span>
                    </p>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-4 gap-2 text-sm">
                      <div className="p-3 rounded-xl bg-muted/30 border border-border/60">
                        <span className="text-muted-foreground">Age</span>
                        <div className="font-semibold text-foreground">{age ?? "--"}</div>
                      </div>
                      <div className="p-3 rounded-xl bg-muted/30 border border-border/60">
                        <span className="text-muted-foreground">BMI</span>
                        <div className="font-semibold text-foreground">{bmi ?? "--"}</div>
                      </div>
                      <div className="p-3 rounded-xl bg-muted/30 border border-border/60">
                        <span className="text-muted-foreground">Last period</span>
                        <div className="font-semibold text-foreground">{lastPeriodStart ?? "--"}</div>
                      </div>
                      <div className="p-3 rounded-xl bg-muted/30 border border-border/60">
                        <span className="text-muted-foreground">Age at first period</span>
                        <div className="font-semibold text-foreground">{profileMenarcheAge || "--"}</div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => {
                        setEditName(name);
                        setEditEmail(email);
                        setEditAvatar(avatar);
                        setEditLifeStage(lifeStage);
                        setEditContraceptionType(contraceptionType);
                        setEditPostpartumBreastfeeding(postpartumBreastfeeding);
                        setEditTryingToConceive(tryingToConceive);
                        setEditDateOfBirth(profileDateOfBirth);
                        setEditMenarcheAge(profileMenarcheAge);
                        setEditHeightCm(profileHeightCm);
                        setEditWeightKg(profileWeightKg);
                        setEditCycleLengthDays(cycleLengthDays);
                        setEditPeriodLengthDays(periodLengthDays);
                        setEditLastPeriodStart(lastPeriodStart ?? "");
                        setIsEditing(true);
                      }}
                    >
                      Edit Profile
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-5 bg-gradient-to-br from-primary/5 to-primary/10 rounded-2xl text-center">
                <p className="text-sm text-muted-foreground mb-1">Member Since</p>
                <p className="font-semibold text-foreground">{memberSince}</p>
              </div>
              <div className="p-5 bg-gradient-to-br from-coral/5 to-coral/10 rounded-2xl text-center">
                <p className="text-sm text-muted-foreground mb-1">Cycles Tracked</p>
                <p className="font-semibold text-foreground">{cyclesTracked} cycles</p>
              </div>
            </div>
          </div>

          {/* Cycle Settings */}
          <div className="glass-card p-6 animate-fade-in" style={{ animationDelay: "0.1s" }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-primary" />
              </div>
              <h2 className="font-serif text-lg font-semibold text-foreground">Cycle Settings</h2>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl hover:bg-muted/50 transition-colors">
                <div>
                  <p className="font-medium text-foreground">Average Cycle Length</p>
                  <p className="text-sm text-muted-foreground">Used for predictions</p>
                </div>
                <span className="text-lg font-semibold text-primary bg-primary/10 px-3 py-1 rounded-full">
                  {cycleLengthDays ?? "--"} {cycleLengthDays ? "days" : ""}
                </span>
              </div>
              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl hover:bg-muted/50 transition-colors">
                <div>
                  <p className="font-medium text-foreground">Average Period Length</p>
                  <p className="text-sm text-muted-foreground">Used for tracking</p>
                </div>
                <span className="text-lg font-semibold text-coral bg-coral/10 px-3 py-1 rounded-full">
                  {periodLengthDays ?? "--"} {periodLengthDays ? "days" : ""}
                </span>
              </div>
            </div>
          </div>

          {/* Notifications */}
          <div className="glass-card p-6 animate-fade-in" style={{ animationDelay: "0.2s" }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Bell className="w-5 h-5 text-primary" />
              </div>
              <h2 className="font-serif text-lg font-semibold text-foreground">Notifications</h2>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between p-4 rounded-xl hover:bg-muted/30 transition-colors">
                <div>
                  <p className="font-medium text-foreground">Email Alerts (High/Critical)</p>
                  <p className="text-sm text-muted-foreground">
                    {isVerified === false
                      ? "Verify your email first to enable email alerts"
                      : "Send email for high/critical red flags"}
                  </p>
                </div>
                {isVerified === false ? (
                  <span className="text-xs text-amber-600 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-900/30 px-2 py-1 rounded-lg border border-amber-200 dark:border-amber-700">
                    Unverified
                  </span>
                ) : (
                  <Switch
                    checked={preferences.emailRedFlags}
                    onCheckedChange={(checked) => updatePreferences({ emailRedFlags: checked })}
                  />
                )}
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl hover:bg-muted/30 transition-colors">
                <div>
                  <p className="font-medium text-foreground">Email Daily Log Reminders</p>
                  <p className="text-sm text-muted-foreground">
                    {isVerified === false
                      ? "Verify your email first to enable daily reminders"
                      : "Receive a daily email if you haven't logged yet"}
                  </p>
                </div>
                {isVerified === false ? (
                  <span className="text-xs text-amber-600 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-900/30 px-2 py-1 rounded-lg border border-amber-200 dark:border-amber-700">
                    Unverified
                  </span>
                ) : (
                  <Switch
                    checked={preferences.emailDailyLogReminder}
                    onCheckedChange={(checked) => updatePreferences({ emailDailyLogReminder: checked })}
                  />
                )}
              </div>

            </div>
          </div>

          {/* Privacy */}
          <div className="glass-card p-6 animate-fade-in" style={{ animationDelay: "0.3s" }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Shield className="w-5 h-5 text-primary" />
              </div>
              <h2 className="font-serif text-lg font-semibold text-foreground">Privacy & Security</h2>
            </div>

            <div className="space-y-3">
              <Button
                variant="outline"
                className="w-full justify-start h-12 rounded-xl"
                onClick={() => setShowChangePassword((v) => !v)}
              >
                Change Password
              </Button>
              {showChangePassword && (
                <div className="p-4 rounded-2xl border border-border bg-muted/20 space-y-3">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Current password</label>
                    <Input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="border-border focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1.5 block">New password</label>
                    <Input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="border-border focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Confirm new password</label>
                    <Input
                      type="password"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      className="border-border focus:border-primary"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={handleChangePassword} disabled={isChangingPassword} className="btn-primary">
                      {isChangingPassword ? "Updating..." : "Update Password"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowChangePassword(false);
                        setCurrentPassword("");
                        setNewPassword("");
                        setConfirmNewPassword("");
                      }}
                      disabled={isChangingPassword}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              <Button
                variant="outline"
                className="w-full justify-start h-12 rounded-xl"
                onClick={handleExportMyData}
                disabled={isExportingData}
              >
                {isExportingData ? "Preparing PDF..." : "Export My Data (PDF)"}
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start h-12 rounded-xl text-destructive hover:text-destructive hover:bg-destructive/5"
                onClick={() => setShowDeleteAccount((v) => !v)}
              >
                Delete Account
              </Button>
              {showDeleteAccount && (
                <div className="p-4 rounded-2xl border border-destructive/25 bg-destructive/5 space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Deleting your account removes your profile and tracking data. This cannot be undone.
                  </p>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Password</label>
                    <Input
                      type="password"
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                      className="border-border focus:border-primary"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleDeleteAccount}
                      disabled={isDeletingAccount}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {isDeletingAccount ? "Deleting..." : "Delete Permanently"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowDeleteAccount(false);
                        setDeletePassword("");
                      }}
                      disabled={isDeletingAccount}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Profile;
