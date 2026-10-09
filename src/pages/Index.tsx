import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  TrendingUp,
  Clock,
  ArrowRight,
  Droplets,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Zap,
  ShieldCheck,
  Heart,
} from "lucide-react";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/useCurrentUser";

type MarkerTag = "period" | "predicted" | "fertile" | "ovulation";

type NextPeriodPrediction = {
  predicted_cycle_length_days?: number;
  predicted_next_period_date?: string | null;
  current_cycle_start_used?: string | null;
  phase_dates?: {
    menstruation?: { start: string; end: string } | null;
    follicular?: { start: string; end: string } | null;
    ovulation?: { date: string } | null;
    luteal?: { start: string; end: string } | null;
  } | null;
};

type NextPeriodApiResponse = {
  prediction?: NextPeriodPrediction;
  anchors?: {
    menstruation_days?: number;
  };
  message?: string;
  error?: string;
  detail?: string;
};

type HomeModelFeatures = {
  avg_cycle_length?: number;
  avg_bleeding_days?: number;
};

type HomeDailyEntry = {
  entryDate?: string;
  flowVolume?: string | null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const parseYmdUtc = (value?: string | null): Date | null => {
  if (!value || typeof value !== "string") return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  const t = Date.UTC(y, m - 1, d);
  return Number.isNaN(t) ? null : new Date(t);
};

const toYmdUtc = (date: Date) => date.toISOString().slice(0, 10);
const toYmdLocal = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

const addDaysYmdUtc = (value: string, days: number): string | null => {
  const d = parseYmdUtc(value);
  if (!d) return null;
  return toYmdUtc(new Date(d.getTime() + days * MS_PER_DAY));
};

const mapFlowVolumeToHistoryFlow = (flowVolume: unknown): "none" | "light" | "medium" | "heavy" => {
  if (!flowVolume || typeof flowVolume !== "string") return "none";
  const v = flowVolume.trim().toLowerCase();
  if (v === "heavy" || v === "somewhat_heavy") return "heavy";
  if (v === "moderate") return "medium";
  if (v === "light" || v === "somewhat_light" || v === "spotting_very_light") return "light";
  return "none";
};

const formatShortDate = (value?: string | null): string => {
  const d = parseYmdUtc(value);
  if (!d) return "N/A";
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
};

const formatRange = (start?: string | null, end?: string | null): string => {
  if (!start || !end) return "N/A";
  return `${formatShortDate(start)} - ${formatShortDate(end)}`;
};

const dayDiffFromToday = (targetYmd?: string | null): number | null => {
  const target = parseYmdUtc(targetYmd);
  if (!target) return null;
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.round((target.getTime() - todayUtc.getTime()) / MS_PER_DAY);
};

const isWithinInclusive = (targetYmd: string, startYmd?: string | null, endYmd?: string | null) => {
  if (!startYmd || !endYmd) return false;
  return targetYmd >= startYmd && targetYmd <= endYmd;
};

const inferPhaseByCycleDay = (
  cycleDay: number,
  cycleLength: number,
  periodLength: number
): "menstrual" | "follicular" | "ovulation" | "luteal" => {
  const safeCycleLength = Math.max(15, Math.round(cycleLength || 28));
  const safePeriodLength = Math.max(1, Math.min(14, Math.round(periodLength || 5)));
  const safeCycleDay = Math.max(1, Math.min(safeCycleLength, Math.round(cycleDay || 1)));
  const ovulationDay = Math.max(safePeriodLength + 1, safeCycleLength - 14);

  if (safeCycleDay <= safePeriodLength) return "menstrual";
  if (safeCycleDay === ovulationDay) return "ovulation";
  if (safeCycleDay < ovulationDay) return "follicular";
  return "luteal";
};

const Index = () => {
  const API_ORIGIN =
    (import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "http://localhost:5000").replace(
      /\/api$/,
      ""
    );
  const [menarcheAge, setMenarcheAge] = useState<number | null>(null);
  const [homeModelFeatures, setHomeModelFeatures] = useState<HomeModelFeatures | null>(null);
  const [nextPeriodPrediction, setNextPeriodPrediction] = useState<NextPeriodPrediction | null>(null);
  const [nextPeriodMenstruationDays, setNextPeriodMenstruationDays] = useState<number | null>(null);
  const [nextPeriodError, setNextPeriodError] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<HomeDailyEntry[]>([]);
  const { isVerified } = useCurrentUser();
  const isPredictionLocked = isVerified !== true;

  const averageCycleLength = useMemo(() => {
    const raw = homeModelFeatures?.avg_cycle_length;
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      return Math.max(15, Math.min(60, Math.round(raw)));
    }
    return 28;
  }, [homeModelFeatures]);

  const averagePeriodLength = useMemo(() => {
    if (
      typeof nextPeriodMenstruationDays === "number" &&
      Number.isFinite(nextPeriodMenstruationDays) &&
      nextPeriodMenstruationDays > 0
    ) {
      return Math.max(1, Math.min(14, Math.round(nextPeriodMenstruationDays)));
    }
    const raw = homeModelFeatures?.avg_bleeding_days;
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      return Math.max(1, Math.min(14, Math.round(raw)));
    }
    return 5;
  }, [homeModelFeatures, nextPeriodMenstruationDays]);

  const phaseInfo = {
    menstrual: { label: "Menstrual Phase", description: "Your period is here. Rest and take care of yourself.", color: "from-primary to-coral" },
    follicular: { label: "Follicular Phase", description: "Energy levels rising. Great time for new projects!", color: "from-sage to-lavender" },
    ovulation: { label: "Ovulation Phase", description: "Peak energy and fertility window.", color: "from-coral to-primary" },
    luteal: { label: "Luteal Phase", description: "Wind down and prepare for your next cycle.", color: "from-lavender to-primary" },
  } as const;
  const lockedPhaseInfo = {
    label: "Verification Required",
    description: "Verify your email to unlock predictions and health insights.",
    color: "from-slate-500 to-slate-400",
  } as const;

  const phaseDates = nextPeriodPrediction?.phase_dates ?? null;

  const modelCurrentPhase = useMemo<keyof typeof phaseInfo | null>(() => {
    if (!phaseDates) return null;
    const now = new Date();
    const today = toYmdUtc(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    );

    if (isWithinInclusive(today, phaseDates.menstruation?.start, phaseDates.menstruation?.end)) {
      return "menstrual";
    }
    if (phaseDates.ovulation?.date === today) return "ovulation";
    if (isWithinInclusive(today, phaseDates.follicular?.start, phaseDates.follicular?.end)) {
      return "follicular";
    }
    if (isWithinInclusive(today, phaseDates.luteal?.start, phaseDates.luteal?.end)) {
      return "luteal";
    }
    return null;
  }, [phaseDates]);

  const fallbackCycleDay = useMemo(() => {
    const start = nextPeriodPrediction?.current_cycle_start_used;
    if (start) {
      const startDate = parseYmdUtc(start);
      if (startDate) {
        const now = new Date();
        const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const diff = Math.floor((todayUtc.getTime() - startDate.getTime()) / MS_PER_DAY) + 1;
        if (diff > 0) return Math.min(averageCycleLength, diff);
      }
    }

    const delta = dayDiffFromToday(nextPeriodPrediction?.predicted_next_period_date);
    if (typeof delta === "number") {
      const estimated = averageCycleLength - delta + 1;
      return Math.max(1, Math.min(averageCycleLength, estimated));
    }
    return 1;
  }, [nextPeriodPrediction, averageCycleLength]);

  const inferredPhase = inferPhaseByCycleDay(
    fallbackCycleDay,
    averageCycleLength,
    averagePeriodLength
  );

  const currentPhaseKey = (modelCurrentPhase || inferredPhase) as keyof typeof phaseInfo;
  const currentPhaseInfo = isPredictionLocked ? lockedPhaseInfo : phaseInfo[currentPhaseKey];

  const prediction = useMemo(() => {
    if (isPredictionLocked) {
      return {
        nextPeriodRange: "Locked until email verification",
        ovulationRange: "Locked until email verification",
        cycleLengthDays: null as number | null,
      };
    }

    const nextStart = nextPeriodPrediction?.predicted_next_period_date ?? null;
    const periodDays = averagePeriodLength;
    const nextEnd = nextStart ? addDaysYmdUtc(nextStart, Math.max(0, periodDays - 1)) : null;
    const ovulationDate = phaseDates?.ovulation?.date ?? null;
    const ovulationStart = ovulationDate ? addDaysYmdUtc(ovulationDate, -1) : null;
    const ovulationEnd = ovulationDate ? addDaysYmdUtc(ovulationDate, 1) : null;

    return {
      nextPeriodRange: nextStart ? formatRange(nextStart, nextEnd) : "Not enough data",
      ovulationRange:
        ovulationStart && ovulationEnd ? formatRange(ovulationStart, ovulationEnd) : "Not enough data",
      cycleLengthDays: nextPeriodPrediction?.predicted_cycle_length_days ?? averageCycleLength,
    };
  }, [isPredictionLocked, nextPeriodPrediction, phaseDates, nextPeriodMenstruationDays, averageCycleLength, averagePeriodLength]);

  const trackedPeriodMarkers = useMemo<Record<string, MarkerTag[]>>(() => {
    const map: Record<string, MarkerTag[]> = {};
    historyEntries.forEach((entry) => {
      const key = typeof entry?.entryDate === "string" ? entry.entryDate : "";
      if (!key) return;
      if (mapFlowVolumeToHistoryFlow(entry?.flowVolume) === "none") return;
      map[key] = map[key] || [];
      if (!map[key].includes("period")) map[key].push("period");
    });
    return map;
  }, [historyEntries]);

  const markers = useMemo<Record<string, MarkerTag[]>>(() => {
    const map: Record<string, MarkerTag[]> = { ...trackedPeriodMarkers };

    const addTag = (ymd: string | null, tag: MarkerTag) => {
      if (!ymd) return;
      map[ymd] = map[ymd] || [];
      if (!map[ymd].includes(tag)) map[ymd].push(tag);
    };

    const addRange = (start?: string | null, end?: string | null, tag?: MarkerTag) => {
      if (!start || !end || !tag) return;
      let cursor = start;
      while (cursor <= end) {
        addTag(cursor, tag);
        const next = addDaysYmdUtc(cursor, 1);
        if (!next) break;
        cursor = next;
      }
    };

    if (phaseDates) {
      addRange(phaseDates.menstruation?.start, phaseDates.menstruation?.end, "period");

      const ovulationDate = phaseDates.ovulation?.date ?? null;
      addTag(ovulationDate, "ovulation");
      if (ovulationDate) {
        for (let delta = -2; delta <= 1; delta += 1) {
          addTag(addDaysYmdUtc(ovulationDate, delta), "fertile");
        }
      }
    }

    const nextPeriodStart = nextPeriodPrediction?.predicted_next_period_date ?? null;
    const predictedDays = Math.max(1, Math.min(5, nextPeriodMenstruationDays ?? 3));
    if (nextPeriodStart) {
      for (let i = 0; i < predictedDays; i += 1) {
        addTag(addDaysYmdUtc(nextPeriodStart, i), "predicted");
      }
    }

    return map;
  }, [trackedPeriodMarkers, phaseDates, nextPeriodPrediction, nextPeriodMenstruationDays]);

  const legend = [
    { key: "period", label: "Period", dot: "bg-rose-500", pill: "bg-rose-500/12 text-rose-600 border-rose-500/20" },
    { key: "predicted", label: "Predicted", dot: "bg-pink-300", pill: "bg-pink-300/15 text-pink-700 border-pink-300/25" },
    { key: "fertile", label: "Fertile", dot: "bg-emerald-400", pill: "bg-emerald-400/14 text-emerald-700 border-emerald-400/25" },
    { key: "ovulation", label: "Ovulation", dot: "bg-amber-400", pill: "bg-amber-400/15 text-amber-800 border-amber-400/25" },
  ] as const;
  const displayLegend = isPredictionLocked ? legend.filter((item) => item.key === "period") : legend;

  const weekDays = useMemo(() => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], []);

  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const monthTitle = useMemo(() => {
    return viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }, [viewMonth]);

  const goPrevMonth = () => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  const goNextMonth = () => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const loadHomeData = async () => {
      try {
        const [userRes, historyRes] = await Promise.all([
          fetch(`${API_ORIGIN}/api/user/me`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_ORIGIN}/api/daily-entries?limit=2000`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (userRes.ok) {
          const user = await userRes.json();
          const value = user?.profile?.menarcheAge;
          setMenarcheAge(typeof value === "number" ? value : null);
        } else {
          setMenarcheAge(null);
        }

        if (historyRes.ok) {
          const historyPayload = await historyRes.json().catch(() => null);
          const data = Array.isArray(historyPayload?.data) ? (historyPayload.data as HomeDailyEntry[]) : [];
          setHistoryEntries(data.filter((entry) => typeof entry?.entryDate === "string"));
        } else {
          setHistoryEntries([]);
        }

        if (isPredictionLocked) {
          setHomeModelFeatures(null);
          setNextPeriodPrediction(null);
          setNextPeriodMenstruationDays(null);
          setNextPeriodError(null);
          return;
        }

        const [nextPeriodRes, featuresRes] = await Promise.all([
          fetch(`${API_ORIGIN}/api/daily-entries/period-predictions`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_ORIGIN}/api/daily-entries/model-features`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (nextPeriodRes.ok) {
          const payload = (await nextPeriodRes.json()) as NextPeriodApiResponse;
          setNextPeriodPrediction(payload?.prediction ?? null);
          setNextPeriodMenstruationDays(
            typeof payload?.anchors?.menstruation_days === "number"
              ? payload.anchors.menstruation_days
              : null
          );
          setNextPeriodError(null);
        } else {
          const err = (await nextPeriodRes.json().catch(() => null)) as NextPeriodApiResponse | null;
          const errorText =
            (typeof err?.error === "string" && err.error) ||
            (typeof err?.detail === "string" && err.detail) ||
            (typeof err?.message === "string" && err.message) ||
            "Next-period model unavailable";
          setNextPeriodPrediction(null);
          setNextPeriodMenstruationDays(
            typeof err?.anchors?.menstruation_days === "number" ? err.anchors.menstruation_days : null
          );
          setNextPeriodError(errorText);
        }

        if (featuresRes.ok) {
          const features = (await featuresRes.json()) as HomeModelFeatures;
          setHomeModelFeatures(features ?? null);
        } else {
          setHomeModelFeatures(null);
        }
      } catch {
        setMenarcheAge(null);
        setHomeModelFeatures(null);
        setNextPeriodPrediction(null);
        setNextPeriodMenstruationDays(null);
        setNextPeriodError(isPredictionLocked ? null : "Next-period model unavailable");
        setHistoryEntries([]);
      }
    };

    loadHomeData();
  }, [API_ORIGIN, isPredictionLocked]);

  const daysUntilPredictedPeriod = useMemo(() => {
    if (isPredictionLocked) return null;
    const delta = dayDiffFromToday(nextPeriodPrediction?.predicted_next_period_date);
    return typeof delta === "number"
      ? delta
      : Math.max(0, averageCycleLength - fallbackCycleDay);
  }, [isPredictionLocked, nextPeriodPrediction, averageCycleLength, fallbackCycleDay]);

  const modelCycleDay = useMemo(() => {
    if (isPredictionLocked) return null;
    const start = nextPeriodPrediction?.current_cycle_start_used;
    if (!start) return fallbackCycleDay;
    const startDate = parseYmdUtc(start);
    if (!startDate) return fallbackCycleDay;
    const now = new Date();
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const diff = Math.floor((todayUtc.getTime() - startDate.getTime()) / MS_PER_DAY) + 1;
    return diff > 0 ? diff : fallbackCycleDay;
  }, [isPredictionLocked, nextPeriodPrediction, fallbackCycleDay]);


  const monthCells = useMemo(() => {
    const y = viewMonth.getFullYear();
    const mo = viewMonth.getMonth();

    const first = new Date(y, mo, 1);
    const last = new Date(y, mo + 1, 0);

    const firstDowMon = (first.getDay() + 6) % 7;
    const daysIn = last.getDate();

    const cells: Array<{
      date: Date;
      inMonth: boolean;
      key: string;
      day: number;
      tags: Array<"period" | "predicted" | "fertile" | "ovulation">;
    }> = [];

    const prevLast = new Date(y, mo, 0).getDate();
    for (let i = 0; i < firstDowMon; i++) {
      const dayNum = prevLast - (firstDowMon - 1 - i);
      const d = new Date(y, mo - 1, dayNum);
      const k = toYmdLocal(d);
      cells.push({
        date: d,
        inMonth: false,
        key: k,
        day: dayNum,
        tags: markers[k] ?? [],
      });
    }

    for (let day = 1; day <= daysIn; day++) {
      const d = new Date(y, mo, day);
      const k = toYmdLocal(d);
      cells.push({
        date: d,
        inMonth: true,
        key: k,
        day,
        tags: markers[k] ?? [],
      });
    }

    while (cells.length < 42) {
      const nextDay = cells.length - (firstDowMon + daysIn) + 1;
      const d = new Date(y, mo + 1, nextDay);
      const k = toYmdLocal(d);
      cells.push({
        date: d,
        inMonth: false,
        key: k,
        day: nextDay,
        tags: markers[k] ?? [],
      });
    }

    return cells;
  }, [viewMonth, markers]);

  const getDayStyles = (tags: string[], inMonth: boolean) => {
    const base = "bg-card border border-border/50 shadow-sm";
    if (!inMonth) return `${base} opacity-40`;
    
    if (tags.includes("period") && tags.includes("ovulation"))
      return "bg-gradient-to-br from-rose-100 to-amber-100 dark:from-rose-900/40 dark:to-amber-900/30 border-2 border-rose-300 dark:border-rose-600 shadow-lg shadow-rose-200/50 dark:shadow-rose-900/30";
    if (tags.includes("period")) 
      return "bg-gradient-to-br from-rose-100 to-pink-50 dark:from-rose-900/40 dark:to-pink-900/20 border-2 border-rose-300 dark:border-rose-600 shadow-lg shadow-rose-200/50 dark:shadow-rose-900/30";
    if (tags.includes("ovulation")) 
      return "bg-gradient-to-br from-amber-100 to-yellow-50 dark:from-amber-900/40 dark:to-yellow-900/20 border-2 border-amber-300 dark:border-amber-600 shadow-lg shadow-amber-200/50 dark:shadow-amber-900/30";
    if (tags.includes("fertile")) 
      return "bg-gradient-to-br from-emerald-100 to-teal-50 dark:from-emerald-900/40 dark:to-teal-900/20 border-2 border-emerald-300 dark:border-emerald-600 shadow-lg shadow-emerald-200/50 dark:shadow-emerald-900/30";
    if (tags.includes("predicted")) 
      return "bg-gradient-to-br from-pink-100 to-rose-50 dark:from-pink-900/30 dark:to-rose-900/20 border-2 border-pink-200 dark:border-pink-700 shadow-md shadow-pink-200/40 dark:shadow-pink-900/20";
    
    return base;
  };

  const tagDots = (tags: string[]) => {
    const map: Record<string, string> = {
      period: "bg-rose-500 shadow-sm shadow-rose-300",
      predicted: "bg-pink-400 shadow-sm shadow-pink-200",
      fertile: "bg-emerald-500 shadow-sm shadow-emerald-300",
      ovulation: "bg-amber-500 shadow-sm shadow-amber-300",
    };
    return (
      <div className="flex gap-1 justify-center mt-1">
        {tags.slice(0, 3).map((t, i) => (
          <span key={i} className={`w-2 h-2 rounded-full ${map[t]}`} />
        ))}
        {tags.length > 3 ? <span className="text-[8px] text-muted-foreground">+</span> : null}
      </div>
    );
  };

  return (
    <Layout>
      <div className="relative">
        <div className="absolute inset-0 -z-10">
          <div className="absolute -top-24 right-[-10%] w-80 h-80 bg-gradient-to-br from-primary/20 via-coral/15 to-rose-200/10 rounded-full blur-3xl animate-pulse-soft" />
          <div className="absolute top-[30%] left-[-15%] w-96 h-96 bg-gradient-to-tr from-lavender/25 via-sage/20 to-emerald-200/10 rounded-full blur-3xl animate-float" />
          <div className="absolute bottom-[-10%] right-[15%] w-64 h-64 bg-gradient-to-br from-amber-200/20 to-pink-200/10 rounded-full blur-3xl animate-pulse-soft" />
        </div>
        <div className="container mx-auto px-4 py-8 md:py-12 max-w-5xl">
        {/* Hero Section */}
        <section className="mb-12">
          <div className="glass-card p-8 md:p-12 relative overflow-hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6 }}
              className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-br from-primary/35 to-coral/30 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 animate-pulse-soft"
            />
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="absolute bottom-0 left-0 w-56 h-56 bg-gradient-to-tr from-lavender/45 to-sage/30 rounded-full blur-2xl translate-y-1/2 -translate-x-1/4 animate-pulse-soft"
            />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.7),transparent_55%)]" />

            <div className="relative z-10 grid gap-10 md:grid-cols-[1.2fr_0.8fr] items-center">
              <div>
                <motion.h1
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="font-serif text-3xl md:text-5xl font-bold text-foreground mb-4"
                >
                  Welcome to{" "}
                  <span className="text-gradient bg-gradient-to-r from-primary via-coral to-lavender bg-clip-text text-transparent">
                    Bloom
                  </span>
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                  className="text-muted-foreground text-lg max-w-xl mb-8"
                >
                  Track your cycle, understand your body, and embrace your natural rhythm with personalized health insights.
                </motion.p>

                <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4, delay: 0.2 }}
                    className={`inline-flex items-center gap-3 px-6 py-4 rounded-2xl bg-gradient-to-r ${currentPhaseInfo.color} text-primary-foreground shadow-elevated`}
                  >
                    <Droplets className="w-6 h-6" />
                    <div>
                      <p className="text-sm opacity-90">Current Phase</p>
                      <p className="font-semibold text-lg">{currentPhaseInfo.label}</p>
                    </div>
                  </motion.div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-400/10 text-emerald-700 text-xs font-semibold">
                    <Sparkles className="w-3.5 h-3.5" />
                    Energy on the rise
                  </span>
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-400/10 text-amber-700 text-xs font-semibold">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {isPredictionLocked ? "Verify email to unlock predictions" : "Predictions improving"}
                  </span>
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-sky-400/10 text-sky-700 text-xs font-semibold">
                    <Heart className="w-3.5 h-3.5" />
                    {menarcheAge ? `Age at first period: ${menarcheAge}` : "Add age at first period in Profile"}
                  </span>
                </div>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="glass-card p-6 md:p-7 relative overflow-hidden"
              >
                <div className="absolute -top-10 -right-10 w-24 h-24 bg-gradient-to-br from-amber-300/40 to-rose-300/30 rounded-full blur-2xl" />
                <div className="absolute -bottom-10 -left-10 w-24 h-24 bg-gradient-to-tr from-emerald-300/35 to-teal-300/25 rounded-full blur-2xl" />
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-4">
                    <Heart className="w-4 h-4 text-primary" />
                    <p className="text-sm font-semibold text-foreground">Gentle focus</p>
                  </div>
                  <p className="text-sm text-muted-foreground mb-5">
                    Keep today simple: hydrate, stretch, and log a quick note. Small steps create the best predictions.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full bg-rose-400/10 px-3 py-1 text-xs font-medium text-rose-700">
                      2-min check-in
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-700">
                      Hydrate
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-700">
                      Light movement
                    </span>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Prediction Overview */}
        <section className="mb-12">
          <div className="flex items-center gap-2 mb-6">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <h2 className="font-serif text-2xl font-semibold text-foreground">Prediction Overview</h2>
          </div>
          {isPredictionLocked ? (
            <div className="glass-card p-5 border border-amber-200/50 bg-gradient-to-br from-amber-50/70 to-orange-50/50">
              <p className="font-semibold text-foreground mb-1">Predictions are locked</p>
              <p className="text-sm text-muted-foreground">
                Verify your email to unlock predictions and health insights.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="glass-card p-5 border border-rose-200/30 bg-gradient-to-br from-rose-50/50 to-pink-50/30 dark:from-rose-950/20 dark:to-pink-950/10"
                >
                  <Calendar className="w-8 h-8 text-rose-500 mb-3" />
                  <p className="text-sm text-muted-foreground mb-1">Next Period Window</p>
                  <p className="text-xl font-bold text-foreground">{prediction.nextPeriodRange}</p>
                  <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                    <ShieldCheck className="w-3 h-3" />
                    Confidence improves with more logs
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="glass-card p-5 border border-emerald-200/30 bg-gradient-to-br from-emerald-50/50 to-teal-50/30 dark:from-emerald-950/20 dark:to-teal-950/10"
                >
                  <Zap className="w-8 h-8 text-emerald-500 mb-3" />
                  <p className="text-sm text-muted-foreground mb-1">Ovulation Window</p>
                  <p className="text-xl font-bold text-foreground">{prediction.ovulationRange}</p>
                  <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                    <ShieldCheck className="w-3 h-3" />
                    Best when cycle is regular
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="glass-card p-5 border border-amber-200/30 bg-gradient-to-br from-amber-50/50 to-yellow-50/30 dark:from-amber-950/20 dark:to-yellow-950/10"
                >
                  <TrendingUp className="w-8 h-8 text-amber-500 mb-3" />
                  <p className="text-sm text-muted-foreground mb-1">Predicted Cycle Length</p>
                  <p className="text-xl font-bold text-foreground">{prediction.cycleLengthDays} days</p>
                  <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                    <ShieldCheck className="w-3 h-3" />
                    {nextPeriodError ? "Using fallback values" : "From next-period model"}
                  </div>
                </motion.div>
              </div>
              {nextPeriodError ? (
                <p className="text-xs text-amber-700 mt-3">
                  {nextPeriodError.toLowerCase().startsWith("next-period model unavailable")
                    ? nextPeriodError
                    : `Next-period model unavailable: ${nextPeriodError}`}
                </p>
              ) : null}
            </>
          )}
        </section>

        {/* Cycle Calendar */}
        <section className="mb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-card p-6 md:p-8 relative overflow-hidden"
          >
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-gradient-to-br from-primary/20 to-coral/20 rounded-full blur-3xl" />
            <div className="absolute -bottom-16 -left-16 w-32 h-32 bg-gradient-to-tr from-lavender/30 to-sage/20 rounded-full blur-2xl" />

            <div className="relative z-10">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-primary" />
                  <h2 className="font-serif text-2xl font-semibold text-foreground">Cycle Calendar</h2>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={goPrevMonth} className="h-8 w-8">
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={goNextMonth} className="h-8 w-8">
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Month title + legend */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <h3 className="text-lg font-medium text-foreground">{monthTitle}</h3>

                <div className="flex flex-wrap gap-2">
                  {displayLegend.map((l) => (
                    <span key={l.key} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${l.pill}`}>
                      <span className={`w-2 h-2 rounded-full ${l.dot}`} />
                      {l.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Week headers */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {weekDays.map((d) => (
                  <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">
                    {d}
                  </div>
                ))}
              </div>

              {/* Month grid */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={monthTitle}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="grid grid-cols-7 gap-2"
                >
                  {monthCells.map((c) => (
                    <motion.div
                      key={c.key}
                      whileHover={{ scale: 1.08, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      className={`relative aspect-square rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300 hover:shadow-xl ${getDayStyles(c.tags, c.inMonth)} ${
                        c.inMonth ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      <span className={`text-sm font-semibold ${c.tags.length > 0 && c.inMonth ? "text-foreground" : ""}`}>
                        {c.day}
                      </span>
                      {c.tags.length > 0 && c.inMonth && tagDots(c.tags)}
                    </motion.div>
                  ))}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </section>

        {/* Cycle Overview */}
        <section className="mb-12">
          <h2 className="font-serif text-2xl font-semibold text-foreground mb-6">Your Cycle Overview</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="stat-card bg-gradient-to-br from-primary/5 to-coral/5 border-primary/10"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-coral/20 flex items-center justify-center">
                  <Calendar className="w-6 h-6 text-primary" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">Next Period In</p>
              <p className="text-3xl font-bold text-foreground">{daysUntilPredictedPeriod ?? "--"}</p>
              <p className="text-sm text-muted-foreground">days</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="stat-card bg-gradient-to-br from-coral/5 to-rose-100/5 border-coral/10"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-coral/20 to-rose-200/20 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-coral" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">Cycle Day</p>
              <p className="text-3xl font-bold text-foreground">{modelCycleDay ?? "--"}</p>
              <p className="text-sm text-muted-foreground">of {prediction.cycleLengthDays ?? "--"}</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="stat-card bg-gradient-to-br from-lavender/10 to-purple-100/5 border-lavender/20"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-lavender/30 to-purple-200/20 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-lavender-dark" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">Avg Cycle Length</p>
              <p className="text-3xl font-bold text-foreground">{prediction.cycleLengthDays ?? "--"}</p>
              <p className="text-sm text-muted-foreground">days</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="stat-card bg-gradient-to-br from-sage/10 to-emerald-100/5 border-sage/20"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sage/30 to-emerald-200/20 flex items-center justify-center">
                  <Droplets className="w-6 h-6 text-foreground/70" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">Avg Period Length</p>
              <p className="text-3xl font-bold text-foreground">{isPredictionLocked ? "--" : averagePeriodLength}</p>
              <p className="text-sm text-muted-foreground">days</p>
            </motion.div>
          </div>
        </section>

        {/* Consistency CTA */}
        <section className="mb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass-card p-6 md:p-8 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-amber-400/20 to-orange-300/10 rounded-full blur-2xl" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-primary/20 to-coral/15 rounded-full blur-xl" />

            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400/20 to-orange-300/20 flex items-center justify-center shadow-soft shrink-0">
                  <Sparkles className="w-7 h-7 text-amber-500" />
                </div>

                <div>
                  <h3 className="font-serif text-xl font-semibold text-foreground mb-2">
                    Track consistently for smarter predictions
                  </h3>
                  <p className="text-muted-foreground text-sm max-w-lg">
                    The more regularly you log your cycle, symptoms, and flow, the more confident and accurate your predictions become -
                    including period timing, ovulation windows, and PMS patterns.
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 font-medium">
                    More logs {"->"} higher confidence
                  </p>
                </div>
              </div>

              <Link to="/tracking">
                <Button className="btn-primary group bg-gradient-to-r from-primary to-coral hover:from-primary/90 hover:to-coral/90">
                  Log Today
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </div>
          </motion.div>
        </section>

        {/* Quick Actions */}
        <section>
          <h2 className="font-serif text-2xl font-semibold text-foreground mb-6">Quick Actions</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link to="/tracking" className="stat-card group cursor-pointer bg-gradient-to-br from-primary/5 to-coral/5 hover:from-primary/10 hover:to-coral/10 transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-foreground mb-1">Track Today</h3>
                  <p className="text-sm text-muted-foreground">Log your symptoms and mood</p>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </div>
            </Link>

            <Link to="/insights" className="stat-card group cursor-pointer bg-gradient-to-br from-lavender/5 to-purple-100/5 hover:from-lavender/10 hover:to-purple-100/10 transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-foreground mb-1">View Insights</h3>
                  <p className="text-sm text-muted-foreground">See your health patterns</p>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </div>
            </Link>

            <Link to="/history" className="stat-card group cursor-pointer bg-gradient-to-br from-sage/5 to-emerald-100/5 hover:from-sage/10 hover:to-emerald-100/10 transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-foreground mb-1">Cycle History</h3>
                  <p className="text-sm text-muted-foreground">Review past cycles</p>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </div>
            </Link>
          </div>
        </section>
        </div>
      </div>
    </Layout>
  );
};

export default Index;
