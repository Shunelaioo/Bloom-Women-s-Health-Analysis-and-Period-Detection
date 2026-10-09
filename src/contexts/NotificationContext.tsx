import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";

export type NotificationSeverity = "low" | "medium" | "high" | "critical";

export interface Notification {
  id: string;
  type: "daily_log" | "red_flag" | "warning" | "system";
  severity: NotificationSeverity;
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
  dedupeKey?: string | null;
  channels?: { inApp?: boolean; email?: boolean };
  emailMeta?: { to?: string | null; subject?: string | null; sentAt?: string | null; error?: string | null };
  readAt?: string | null;
  dismissedAt?: string | null;
  createdAt?: string;
}

interface NotificationPreferences {
  dailyLogReminder: boolean;
  redFlags: boolean;
  warnings: boolean;
  emailRedFlags: boolean;
  emailDailyLogReminder: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  dailyLogReminder: false,
  redFlags: false,
  warnings: false,
  emailRedFlags: false,
  emailDailyLogReminder: false,
};

function formatYmdLocal(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function reminderScopeKey() {
  const token = localStorage.getItem("token");
  if (!token) return "anon";
  return token.slice(-12);
}

// Get preferences from localStorage
const getPreferences = (): NotificationPreferences => {
  try {
    const stored = localStorage.getItem("notificationPreferences");
    if (!stored) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(stored);
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      // Enforce email-only mode for in-app channels.
      dailyLogReminder: false,
      redFlags: false,
      warnings: false,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
};

// Save preferences to localStorage
const savePreferences = (prefs: NotificationPreferences) => {
  try {
    localStorage.setItem("notificationPreferences", JSON.stringify(prefs));
  } catch (error) {
    console.error("Failed to save notification preferences:", error);
  }
};

// Check if user has logged today
const checkDailyLogStatus = async (): Promise<{ logged: boolean; lastLogDate?: string }> => {
  const token = localStorage.getItem("token");
  if (!token) return { logged: false };

  try {
    const API_BASE = `${apiOrigin()}/api/daily-entries`;
    const todayLocal = formatYmdLocal();
    const todayUtc = new Date().toISOString().slice(0, 10);
    const candidateDates = [...new Set([todayLocal, todayUtc])];

    for (const date of candidateDates) {
      const res = await fetch(`${API_BASE}/${date}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) continue;
      const data = await res.json();
      const entryDate = data?.data?.entryDate;
      if (isYmd(entryDate)) {
        return { logged: true, lastLogDate: entryDate };
      }
    }

    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 30);
    const fromYmd = formatYmdLocal(fromDate);
    const recentRes = await fetch(`${API_BASE}?from=${fromYmd}&to=${todayLocal}&limit=200`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (recentRes.ok) {
      const recentJson = await recentRes.json().catch(() => null);
      const rows: unknown[] = Array.isArray(recentJson?.data) ? recentJson.data : [];
      const dates = rows
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          return (row as { entryDate?: unknown }).entryDate ?? null;
        })
        .filter((d: unknown): d is string => isYmd(d));
      const last = dates.length > 0 ? dates[dates.length - 1] : null;
      if (last) return { logged: false, lastLogDate: last };
    }

    return { logged: false };
  } catch (error) {
    console.error("Error checking daily log status:", error);
    return { logged: false };
  }
};

type RedFlagInput = {
  label: string;
  hit: boolean;
  severity?: NotificationSeverity | "none";
};

const PRE_PERIOD_REMINDER_DAYS = new Set([3, 2, 1]);

function isYmd(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function dayDiffFromTodayUtc(targetYmd: string): number | null {
  if (!isYmd(targetYmd)) return null;
  const [y, m, d] = targetYmd.split("-").map(Number);
  const targetMs = Date.UTC(y, m - 1, d);
  if (!Number.isFinite(targetMs)) return null;

  const now = new Date();
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((targetMs - todayMs) / (24 * 60 * 60 * 1000));
}

function daysSinceLocalYmd(dateYmd: string, now = new Date()): number | null {
  if (!isYmd(dateYmd)) return null;
  const [y, m, d] = dateYmd.split("-").map(Number);
  const sourceDateMs = new Date(y, m - 1, d).getTime();
  const todayLocalMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.floor((todayLocalMs - sourceDateMs) / (24 * 60 * 60 * 1000));
}

const RED_FLAG_COOLDOWN_WARNING_MS = 72 * 60 * 60 * 1000;
const RED_FLAG_COOLDOWN_ALERT_MS = 24 * 60 * 60 * 1000;
const RED_FLAG_LAST_KEY = "redFlagsLastNotifiedAt";

function getPeriodReminderContent(daysUntil: number, predictedDate: string) {
  if (daysUntil === 1) {
    return {
      title: "Your period may start tomorrow",
      message:
        `Expected start: ${predictedDate}. Keep supplies ready, hydrate, and plan a lighter schedule if needed.`,
      severity: "medium" as NotificationSeverity,
    };
  }
  if (daysUntil === 2) {
    return {
      title: "Your period may start in 2 days",
      message:
        `Expected start: ${predictedDate}. This is a good time to prepare supplies and check in on sleep and stress.`,
      severity: "low" as NotificationSeverity,
    };
  }
  return {
    title: "Your period may start in 3 days",
    message:
      `Expected start: ${predictedDate}. Keep logging symptoms and flow so predictions stay accurate.`,
    severity: "low" as NotificationSeverity,
  };
}

// Determine severity conservatively so the system doesn't over-trigger.
const getRedFlagSeverity = (redFlags: RedFlagInput[]): NotificationSeverity => {
  const hitFlags = redFlags.filter((f) => f.hit);
  const hitCount = hitFlags.length;
  const highRiskHits = hitFlags.filter(
    (f) => f.severity === "high" || f.severity === "critical"
  ).length;

  if (highRiskHits >= 2 || hitCount >= 4) return "critical";
  if ((highRiskHits >= 1 && hitCount >= 2) || hitCount >= 3) return "high";
  if (highRiskHits >= 1 || hitCount >= 2) return "medium";
  return "low";
};

function apiOrigin() {
  return (import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "http://localhost:5000").replace(
    /\/api$/,
    ""
  );
}

function apiBase() {
  return `${apiOrigin()}/api/notifications`;
}

async function fetchServerPreferences(): Promise<NotificationPreferences | null> {
  const token = localStorage.getItem("token");
  if (!token) return null;

  try {
    const res = await fetch(`${apiOrigin()}/api/user/preferences`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data || typeof data !== "object") return null;

    return {
      dailyLogReminder: false,
      redFlags: false,
      warnings: false,
      emailRedFlags: (data as { emailRedFlags?: unknown }).emailRedFlags === true,
      emailDailyLogReminder: (data as { emailDailyLogReminder?: unknown }).emailDailyLogReminder === true,
    };
  } catch {
    return null;
  }
}

async function fetchNotifications({
  includeDismissed = false,
  limit = 50,
}: {
  includeDismissed?: boolean;
  limit?: number;
}): Promise<Notification[]> {
  const token = localStorage.getItem("token");
  if (!token) return [];

  const res = await fetch(`${apiBase()}?includeDismissed=${includeDismissed ? "true" : "false"}&limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  const rows: unknown[] = Array.isArray(data?.data) ? data.data : [];
  return rows.map((r) => {
    const row = r && typeof r === "object" ? (r as Record<string, unknown>) : {};
    return {
      id: typeof row._id === "string" ? row._id : "",
      type: typeof row.type === "string" ? (row.type as Notification["type"]) : "system",
      severity:
        typeof row.severity === "string" ? (row.severity as NotificationSeverity) : "low",
      title: typeof row.title === "string" ? row.title : "",
      message: typeof row.message === "string" ? row.message : "",
      actionUrl: typeof row.actionUrl === "string" ? row.actionUrl : undefined,
      actionLabel: typeof row.actionLabel === "string" ? row.actionLabel : undefined,
      dedupeKey: typeof row.dedupeKey === "string" ? row.dedupeKey : null,
      channels: row.channels as Notification["channels"] | undefined,
      emailMeta: row.emailMeta as Notification["emailMeta"] | undefined,
      readAt: typeof row.readAt === "string" ? row.readAt : null,
      dismissedAt: typeof row.dismissedAt === "string" ? row.dismissedAt : null,
      createdAt: typeof row.createdAt === "string" ? row.createdAt : undefined,
    };
  });
}

async function createNotification(input: {
  type: Notification["type"];
  severity: NotificationSeverity;
  title: string;
  message: string;
  actionUrl?: string | null;
  actionLabel?: string | null;
  dedupeKey?: string | null;
  sendEmail?: boolean;
  inApp?: boolean;
  redFlagChecklist?: string[];
}): Promise<Notification | null> {
  const token = localStorage.getItem("token");
  if (!token) return null;

  const res = await fetch(apiBase(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const r = data?.data;
  if (!r?._id) return null;
  return {
    id: r._id,
    type: r.type,
    severity: r.severity,
    title: r.title,
    message: r.message,
    actionUrl: r.actionUrl ?? undefined,
    actionLabel: r.actionLabel ?? undefined,
    dedupeKey: r.dedupeKey ?? null,
    channels: r.channels ?? undefined,
    emailMeta: r.emailMeta ?? undefined,
    readAt: r.readAt ?? null,
    dismissedAt: r.dismissedAt ?? null,
    createdAt: r.createdAt ?? undefined,
  };
}

async function patchNotification(id: string, body: { read?: boolean; dismissed?: boolean }) {
  const token = localStorage.getItem("token");
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(`${apiBase()}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || data?.error || `Failed to update notification (${res.status})`);
  }
  const data = await res.json();
  return data?.data ?? null;
}

async function markAllRead() {
  const token = localStorage.getItem("token");
  if (!token) return;
  await fetch(`${apiBase()}/mark-all-read`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function deleteNotificationById(id: string) {
  const token = localStorage.getItem("token");
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(`${apiBase()}/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || data?.error || `Failed to delete notification (${res.status})`);
  }
  const data = await res.json().catch(() => null);
  return data ?? { ok: true };
}

async function fetchWeeklyReportSummary(): Promise<{
  possibleCount: number | null;
  unlikelyCount: number | null;
  minimumHistoryMet: boolean | null;
} | null> {
  const token = localStorage.getItem("token");
  if (!token) return null;
  const res = await fetch(`${apiOrigin()}/api/daily-entries/model-predictions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const preds: Array<{ positive?: boolean | null }> = Array.isArray(data?.predictions) ? data.predictions : [];
  const possibleCount = preds.filter((p) => p.positive === true).length;
  const unlikelyCount = preds.filter((p) => p.positive === false).length;
  const minimumHistoryMet =
    typeof data?.minimum_history_met === "boolean" ? data.minimum_history_met : null;
  return { possibleCount, unlikelyCount, minimumHistoryMet };
}

async function fetchPredictedNextPeriodDate(): Promise<string | null> {
  const token = localStorage.getItem("token");
  if (!token) return null;

  try {
    const predictionRes = await fetch(`${apiOrigin()}/api/daily-entries/period-predictions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (predictionRes.ok) {
      const predictionJson = await predictionRes.json().catch(() => null);
      const predicted = predictionJson?.prediction?.predicted_next_period_date;
      if (isYmd(predicted)) return predicted;
    }
  } catch {
    // Try fallback below.
  }

  try {
    const settingsRes = await fetch(`${apiOrigin()}/api/user/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!settingsRes.ok) return null;
    const settingsJson = await settingsRes.json().catch(() => null);
    const fallbackDate = settingsJson?.predictedNextPeriodDate;
    return isYmd(fallbackDate) ? fallbackDate : null;
  } catch {
    return null;
  }
}

interface NotificationContextType {
  notifications: Notification[];
  preferences: NotificationPreferences;
  updatePreferences: (prefs: Partial<NotificationPreferences>) => void;
  checkDailyLogReminder: () => Promise<void>;
  checkRedFlags: (redFlags: RedFlagInput[]) => void;
  dismissNotification: (id: string) => Promise<boolean>;
  deleteNotification: (id: string) => Promise<boolean>;
  markAllRead: () => Promise<void>;
  refreshNotifications: (opts?: { includeDismissed?: boolean; limit?: number }) => Promise<Notification[]>;
  isChecking: boolean;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreferences>(getPreferences);
  const [isChecking, setIsChecking] = useState(false);
  const location = useLocation();

  const refreshNotifications = useCallback(
    async (opts?: { includeDismissed?: boolean; limit?: number }) => {
      const rows = await fetchNotifications({
        includeDismissed: opts?.includeDismissed ?? false,
        limit: opts?.limit ?? 50,
      });
      if (!(opts?.includeDismissed ?? false)) {
        setNotifications(rows);
      }
      return rows;
    },
    []
  );

  // Update preferences (local + server)
  const updatePreferences = useCallback((newPrefs: Partial<NotificationPreferences>) => {
    setPreferences((prev) => {
      const updated = { ...prev, ...newPrefs };
      savePreferences(updated);

      // Persist to server (fire-and-forget)
      const token = localStorage.getItem("token");
      if (token) {
        fetch(`${apiOrigin()}/api/user/preferences`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(updated),
        }).catch((err) => {
          console.error("Failed to save notification preferences to server:", err);
        });
      }

      return updated;
    });
  }, []);

  const syncPreferencesFromServer = useCallback(async (): Promise<NotificationPreferences | null> => {
    const fromServer = await fetchServerPreferences();
    if (!fromServer) return null;

    setPreferences((prev) => {
      const changed =
        prev.dailyLogReminder !== fromServer.dailyLogReminder ||
        prev.redFlags !== fromServer.redFlags ||
        prev.warnings !== fromServer.warnings ||
        prev.emailRedFlags !== fromServer.emailRedFlags ||
        prev.emailDailyLogReminder !== fromServer.emailDailyLogReminder;
      if (!changed) return prev;
      savePreferences(fromServer);
      return fromServer;
    });

    return fromServer;
  }, []);

  // Check for daily log reminder
  const checkDailyLogReminder = useCallback(async (dailyLogReminderEnabled = preferences.dailyLogReminder) => {
    if (!dailyLogReminderEnabled) return;

    setIsChecking(true);
    try {
      const { logged, lastLogDate } = await checkDailyLogStatus();

      if (!logged) {
        const yyyyMmDd = formatYmdLocal();
        const daysSinceLastLog = lastLogDate ? daysSinceLocalYmd(lastLogDate) : null;

        // Only show reminder if it's been at least a few hours since last log, or if no log today
        const shouldRemind = daysSinceLastLog === null || daysSinceLastLog >= 0;

        if (shouldRemind) {
          // Check if already shown today
          const lastShown = localStorage.getItem(`dailyLogReminder-${reminderScopeKey()}-${yyyyMmDd}`);
          if (!lastShown) {
            const created = await createNotification({
              type: "daily_log",
              severity: daysSinceLastLog && daysSinceLastLog > 1 ? "medium" : "low",
              title:
                daysSinceLastLog && daysSinceLastLog > 1
                  ? `You have not logged in ${daysSinceLastLog} days`
                  : "Quick reminder to log today",
              message: "A short daily entry helps keep your cycle insights accurate.",
              actionUrl: "/tracking",
              actionLabel: "Log Now",
              dedupeKey: `daily_log:${yyyyMmDd}`,
              sendEmail: false,
            });

            if (created) {
              setNotifications((prev) => [created, ...prev.filter((n) => n.id !== created.id)].slice(0, 50));
              localStorage.setItem(`dailyLogReminder-${reminderScopeKey()}-${yyyyMmDd}`, "shown");
            }
          }
        }
      }
    } catch (error) {
      console.error("Error checking daily log reminder:", error);
    } finally {
      setIsChecking(false);
    }
  }, [preferences.dailyLogReminder]);

  // Check for red flags and warnings
  const checkRedFlags = useCallback(async (redFlags: RedFlagInput[]) => {
    const hitFlags = redFlags.filter((f) => f.hit);
    if (hitFlags.length === 0) return;
    const highRiskHits = hitFlags.filter(
      (f) => f.severity === "high" || f.severity === "critical"
    ).length;

    // Ethical safety guardrail: avoid notifying on a single low/medium signal.
    if (hitFlags.length < 2 && highRiskHits === 0) return;

    const severity = getRedFlagSeverity(redFlags);
    const isAlert = severity === "critical" || severity === "high";
    const shouldShowInApp = isAlert ? preferences.redFlags : preferences.warnings;
    const shouldSendEmail = Boolean(preferences.emailRedFlags && isAlert);
    if (!shouldShowInApp && !shouldSendEmail) return;

    const now = Date.now();
    const lastNotifiedAt = Number(localStorage.getItem(RED_FLAG_LAST_KEY) || 0);
    const cooldown = isAlert ? RED_FLAG_COOLDOWN_ALERT_MS : RED_FLAG_COOLDOWN_WARNING_MS;
    if (lastNotifiedAt && now - lastNotifiedAt < cooldown) return;

    const yyyyMmDd = new Date().toISOString().slice(0, 10);
    const created = await createNotification({
      type: isAlert ? "red_flag" : "warning",
      severity,
      title: isAlert ? "Please review these cycle warning signs" : "Cycle pattern update",
      message: `We noticed ${hitFlags.length} signal${hitFlags.length > 1 ? "s" : ""}: ${hitFlags
        .slice(0, 3)
        .map((f) => f.label)
        .join(", ")}${hitFlags.length > 3 ? "..." : ""}. This is not a diagnosis, but it is worth reviewing.`,
      actionUrl: "/insights",
      actionLabel: "Review Insights",
      dedupeKey: `red_flags:${yyyyMmDd}`,
      sendEmail: shouldSendEmail,
      inApp: shouldShowInApp,
      redFlagChecklist: hitFlags.map((f) => f.label).filter(Boolean),
    });

    if (created && shouldShowInApp) {
      setNotifications((prev) => [created, ...prev.filter((n) => n.id !== created.id)].slice(0, 50));
    }
    if (created) localStorage.setItem(RED_FLAG_LAST_KEY, String(now));
  }, [preferences.redFlags, preferences.warnings, preferences.emailRedFlags]);

  // Dismiss notification
  const dismissNotification = useCallback(async (id: string) => {
    try {
      const updated = await patchNotification(id, { dismissed: true });
      if (!updated) return false;
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      return true;
    } catch {
      return false;
    }
  }, []);

  const deleteNotification = useCallback(async (id: string) => {
    try {
      const result = await deleteNotificationById(id);
      if (!result) return false;
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      return true;
    } catch {
      return false;
    }
  }, []);

  const markAllReadFn = useCallback(async () => {
    await markAllRead();
    await refreshNotifications({ includeDismissed: false, limit: 50 });
  }, [refreshNotifications]);

  const checkWeeklyHealthReport = useCallback(async () => {
    const today = new Date();
    const isFriday = today.getDay() === 5;
    if (!isFriday) return;

    const yyyyMmDd = today.toISOString().slice(0, 10);
    const lastShown = localStorage.getItem(`weeklyHealthReport-${reminderScopeKey()}-${yyyyMmDd}`);
    if (lastShown) return;

    let message = "Your weekly summary is ready. Open Insights to review your trends.";
    try {
      const summary = await fetchWeeklyReportSummary();
      if (summary) {
        if (summary.minimumHistoryMet === false) {
          message = "Weekly summary: keep logging daily to improve reliability.";
        } else if (summary.possibleCount !== null) {
          message = `Weekly summary: ${summary.possibleCount} possible pattern flag${summary.possibleCount === 1 ? "" : "s"} found.`;
          if (summary.unlikelyCount !== null) {
            message += ` ${summary.unlikelyCount} condition${summary.unlikelyCount === 1 ? "" : "s"} looked unlikely.`;
          }
        }
      }
    } catch {
      // Fall back to generic message if summary fetch fails.
    }

    const created = await createNotification({
      type: "system",
      severity: "low",
      title: "Your weekly cycle summary",
      message,
      actionUrl: "/insights",
      actionLabel: "View Insights",
      dedupeKey: `weekly_report:${yyyyMmDd}`,
      sendEmail: false,
    });

    if (created) {
      setNotifications((prev) => [created, ...prev.filter((n) => n.id !== created.id)].slice(0, 50));
    }

    localStorage.setItem(`weeklyHealthReport-${reminderScopeKey()}-${yyyyMmDd}`, "shown");
  }, []);

  const checkUpcomingPeriodReminder = useCallback(async (dailyLogReminderEnabled = preferences.dailyLogReminder) => {
    if (!dailyLogReminderEnabled) return;

    const predictedNextPeriodDate = await fetchPredictedNextPeriodDate();
    if (!predictedNextPeriodDate) return;

    const daysUntil = dayDiffFromTodayUtc(predictedNextPeriodDate);
    if (daysUntil === null || !PRE_PERIOD_REMINDER_DAYS.has(daysUntil)) return;

    const yyyyMmDd = new Date().toISOString().slice(0, 10);
    const localShownKey = `periodStartReminder-${reminderScopeKey()}-${yyyyMmDd}-${daysUntil}`;
    if (localStorage.getItem(localShownKey)) return;

    const content = getPeriodReminderContent(daysUntil, predictedNextPeriodDate);

    const created = await createNotification({
      type: "system",
      severity: content.severity,
      title: content.title,
      message: content.message,
      actionUrl: "/home",
      actionLabel: "View Calendar",
      dedupeKey: `period_start:${yyyyMmDd}:${daysUntil}`,
      sendEmail: false,
    });

    if (created) {
      setNotifications((prev) => [created, ...prev.filter((n) => n.id !== created.id)].slice(0, 50));
    }
    localStorage.setItem(localShownKey, "shown");
  }, [preferences.dailyLogReminder]);

  const runReminderChecks = useCallback(async () => {
    // Email-only mode: keep server preferences synced, but do not generate
    // client-side/in-app reminder notifications.
    await syncPreferencesFromServer();
  }, [
    syncPreferencesFromServer,
  ]);

  const refreshAndRunChecks = useCallback(async () => {
    await refreshNotifications({ includeDismissed: false, limit: 50 });
    await runReminderChecks();
  }, [refreshNotifications, runReminderChecks]);

  // Auto-check on mount and periodically
  useEffect(() => {
    // Initial check
    void refreshAndRunChecks();

    // Check every hour for daily log reminder
    const interval = setInterval(() => {
      void runReminderChecks();
    }, 60 * 60 * 1000); // 1 hour

    const runChecksIfVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void runReminderChecks();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("focus", runChecksIfVisible);
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", runChecksIfVisible);
    }

    return () => {
      clearInterval(interval);
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", runChecksIfVisible);
      }
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", runChecksIfVisible);
      }
    };
  }, [refreshAndRunChecks, runReminderChecks]);

  // Run checks as soon as user lands on an authenticated route after login.
  useEffect(() => {
    if (!localStorage.getItem("token")) return;
    void refreshAndRunChecks();
  }, [location.pathname, refreshAndRunChecks]);

  // Same-tab auth updates (login/logout) do not fire the native "storage" event.
  useEffect(() => {
    const onAuthTokenUpdated = () => {
      if (!localStorage.getItem("token")) {
        setNotifications([]);
        return;
      }
      void refreshAndRunChecks();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("auth-token-updated", onAuthTokenUpdated);
      window.addEventListener("login", onAuthTokenUpdated);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("auth-token-updated", onAuthTokenUpdated);
        window.removeEventListener("login", onAuthTokenUpdated);
      }
    };
  }, [refreshAndRunChecks]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        preferences,
        updatePreferences,
        checkDailyLogReminder,
        checkRedFlags,
        dismissNotification,
        deleteNotification,
        markAllRead: markAllReadFn,
        refreshNotifications,
        isChecking,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return context;
};
