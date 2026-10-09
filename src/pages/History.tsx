"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Droplets,
  Moon,
  MoonStar,
  CloudMoon,
  CloudOff,
  HeartPulse,
  Dumbbell,
  Flower2,
  Footprints,
  Waves,
  Sofa,
  Smile,
  Meh,
  Frown,
  Angry,
  AlertCircle,
  Calendar,
  FileText,
  Activity,
  Heart,
  Info,
} from "lucide-react";

import Layout from "@/components/layout/Layout";
import {
  flowOptions,
  moods,
  sleepOptions,
  exerciseOptions,
  CycleDay,
} from "@/lib/cycleData";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useCurrentUser } from "@/hooks/useCurrentUser";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  ReferenceArea,
  ReferenceLine,
  ReferenceDot,
} from "recharts";

const sleepIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Moon,
  MoonStar,
  CloudMoon,
  CloudOff,
};

const exerciseIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  HeartPulse,
  Dumbbell,
  Flower2,
  Footprints,
  Waves,
  Sofa,
};

const moodIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Smile,
  Meh,
  Frown,
  Angry,
  AlertCircle,
};

type PastCycle = {
  start: string;
  rawStart: string;
  length: number;
  cycleLength: number;
};

type BackendDailyEntry = {
  entryDate: string;
  flowVolume?: string | null;
  pain?: { painIntensity?: number | null } | null;
  mood?: { selectedMood?: string | null } | null;
  sleep?: { selectedSleep?: string | null; sleepHours?: number | null } | null;
  exercises?: { selectedExercises?: string[] | null } | null;
  totalExerciseMinutes?: number | null;
  symptoms?: {
    selectedSymptomTags?: string[] | null;
    symptomLevelByTag?: Record<string, string> | Map<string, string> | null;
  } | null;
  notes?: string | null;
};

type RecentCycleSummary = {
  cycleStart: string;
  cycleLengthDays: number | null;
  periodLengthDays: number | null;
};

const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const formatYmdLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseYmdToLocalDate = (ymd: string) => {
  if (!isYmd(ymd)) return null;
  const [y, m, d] = ymd.split("-").map((n) => Number(n));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};
const addDaysToYmd = (ymd: string, days: number) => {
  const d = parseYmdToLocalDate(ymd);
  if (!d) return ymd;
  d.setDate(d.getDate() + days);
  return formatYmdLocal(d);
};
const isPeriodFlow = (flowVolume: unknown) => mapFlowVolumeToFlow(flowVolume) !== "none";
const buildYmdRange = (from: string, to: string) => {
  const start = parseYmdToLocalDate(from);
  const end = parseYmdToLocalDate(to);
  if (!start || !end || end < start) return [];
  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(formatYmdLocal(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

const mapFlowVolumeToFlow = (flowVolume: unknown): CycleDay["flow"] => {
  if (!flowVolume || typeof flowVolume !== "string") return "none";
  const v = flowVolume.trim().toLowerCase();
  if (v === "heavy" || v === "somewhat_heavy") return "heavy";
  if (v === "moderate") return "medium";
  if (v === "light" || v === "somewhat_light" || v === "spotting_very_light") return "light";
  return "none";
};

const mapPairs = (value: unknown): Array<[string, unknown]> => {
  if (!value) return [];
  if (value instanceof Map) return Array.from(value.entries());
  if (typeof value === "object") return Object.entries(value as Record<string, unknown>);
  return [];
};

const humanizeSymptomTag = (value: string) =>
  String(value || "")
    .replace(/_/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());

const extractSymptomTags = (entry: BackendDailyEntry): string[] => {
  const fromSelected = Array.isArray(entry?.symptoms?.selectedSymptomTags)
    ? entry.symptoms!.selectedSymptomTags!.filter(Boolean)
    : [];
  const fromLevels = mapPairs(entry?.symptoms?.symptomLevelByTag)
    .map(([tag]) => String(tag || "").trim())
    .filter(Boolean);
  const legacyObject = entry?.symptoms && typeof entry.symptoms === "object"
    ? Object.entries(entry.symptoms as Record<string, unknown>)
    : [];
  const fromLegacy = legacyObject
    .filter(([key]) => key !== "selectedSymptomTags" && key !== "symptomLevelByTag")
    .filter(([, value]) => {
      if (value === null || value === undefined) return false;
      if (typeof value === "boolean") return value;
      const s = String(value).trim().toLowerCase();
      return s !== "" && s !== "none" && s !== "null" && s !== "false";
    })
    .map(([key]) => String(key || "").trim())
    .filter(Boolean);

  return [...new Set([...fromSelected, ...fromLevels, ...fromLegacy])];
};

const coerceEnum = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => {
  if (typeof value !== "string") return fallback;
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
};

const toCycleDay = (entry: BackendDailyEntry): CycleDay => {
  const moodAllowed = moods.map((m) => m.value) as Array<CycleDay["mood"]>;
  const sleepAllowed = sleepOptions.map((s) => s.value) as Array<NonNullable<CycleDay["sleepQuality"]>>;

  return {
    date: entry.entryDate,
    flow: mapFlowVolumeToFlow(entry.flowVolume),
    symptoms: extractSymptomTags(entry),
    mood: coerceEnum(entry?.mood?.selectedMood, moodAllowed, "neutral"),
    notes: entry.notes ?? undefined,
    sleepQuality: entry?.sleep?.selectedSleep
      ? coerceEnum(entry.sleep.selectedSleep, sleepAllowed, "good")
      : undefined,
    sleepHours: typeof entry?.sleep?.sleepHours === "number" ? entry.sleep.sleepHours : undefined,
    exercises: Array.isArray(entry?.exercises?.selectedExercises)
      ? entry.exercises!.selectedExercises!.filter((x) => x && x !== "none")
      : undefined,
    exerciseDuration: typeof entry?.totalExerciseMinutes === "number" ? entry.totalExerciseMinutes : undefined,
  };
};

const formatCycleStartLabel = (ymd: string) => {
  const d = parseYmdToLocalDate(ymd);
  if (!d) return ymd;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const History = () => {
  const API_ROOT =
    (import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "http://localhost:5000").replace(
      /\/api$/,
      ""
    );
  const API_BASE = `${API_ROOT}/api/daily-entries`;
  const INSIGHTS_BASE = `${API_ROOT}/api/insights`;

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<{ day: number; data: CycleDay | null } | null>(
    null
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [historyDays, setHistoryDays] = useState<CycleDay[]>([]);
  const [backendEntries, setBackendEntries] = useState<BackendDailyEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [pastCycles, setPastCycles] = useState<PastCycle[]>([]);
  const [cyclesError, setCyclesError] = useState("");
  const [pendingOpenDate, setPendingOpenDate] = useState<string | null>(null);
  const { isVerified } = useCurrentUser();
  const isInsightsLocked = isVerified !== true;

  const getDaysInMonth = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const getFirstDayOfMonth = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  const formatMonth = (date: Date) =>
    date.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const goToPreviousMonth = () =>
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const goToNextMonth = () =>
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  useEffect(() => {
    const dateParam = searchParams.get("date");
    if (!dateParam || !isYmd(dateParam)) return;
    const target = parseYmdToLocalDate(dateParam);
    if (!target) return;
    setCurrentDate(new Date(target.getFullYear(), target.getMonth(), 1));
    setPendingOpenDate(dateParam);
  }, [searchParams]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setBackendEntries([]);
      setHistoryDays([]);
      setHistoryError("Session expired. Please sign in again.");
      setHistoryLoading(false);
      navigate("/login?mode=login", { replace: true });
      return;
    }

    const controller = new AbortController();
    const load = async () => {
      setHistoryLoading(true);
      setHistoryError("");

      // Keep query window below API hard limit (2000) so recent months stay visible.
      const rangeStart = new Date(currentDate.getFullYear(), currentDate.getMonth() - 18, 1);
      const rangeEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

      const params = new URLSearchParams({
        from: formatYmdLocal(rangeStart),
        to: formatYmdLocal(rangeEnd),
        limit: "2000",
      });
      const from = params.get("from")!;
      const to = params.get("to")!;

      const loadEntriesByDateFallback = async () => {
        const allDates = buildYmdRange(from, to);
        const batchSize = 25;
        const collected: BackendDailyEntry[] = [];

        for (let i = 0; i < allDates.length; i += batchSize) {
          const slice = allDates.slice(i, i + batchSize);
          const responses = await Promise.all(
            slice.map(async (ymd) => {
              const r = await fetch(`${API_BASE}/${ymd}`, {
                headers: { Authorization: `Bearer ${token}` },
                signal: controller.signal,
              });
              if (r.status === 401) return { unauthorized: true as const };
              if (!r.ok) return null;
              const json = await r.json().catch(() => null);
              return json?.data ?? null;
            })
          );

          for (const item of responses) {
            if (item && typeof item === "object" && "unauthorized" in item && item.unauthorized) {
              localStorage.removeItem("token");
              navigate("/login?mode=login", { replace: true });
              setHistoryError("Session expired. Please sign in again.");
              return false;
            }
            if (item && (item as BackendDailyEntry).entryDate) {
              collected.push(item as BackendDailyEntry);
            }
          }
        }

        const mapped = collected
          .filter((e) => e?.entryDate && isYmd(e.entryDate))
          .map((e) => toCycleDay(e));
        setBackendEntries(collected);
        setHistoryDays(mapped);
        setHistoryError("");
        return true;
      };

      try {
        const res = await fetch(`${API_BASE}?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!res.ok) {
          if (res.status === 404) {
            const loaded = await loadEntriesByDateFallback();
            if (loaded) return;
          }
          const errorBody = await res.json().catch(() => null);
          const message = errorBody?.message || `History request failed (${res.status})`;
          if (res.status === 401) {
            localStorage.removeItem("token");
            navigate("/login?mode=login", { replace: true });
          }
          setHistoryError(
            res.status === 401
              ? "Session expired. Please sign in again."
              : message
          );
          return;
        }

        const json = await res.json();
        const entries: BackendDailyEntry[] = Array.isArray(json?.data) ? json.data : [];
        setBackendEntries(entries);
        const mapped = entries
          .filter((e) => e?.entryDate && isYmd(e.entryDate))
          .map((e) => toCycleDay(e));
        setHistoryDays(mapped);
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          setHistoryError(err?.message || `Unable to load history from backend (${API_BASE}).`);
        }
      } finally {
        setHistoryLoading(false);
      }
    };

    load();
    return () => controller.abort();
  }, [API_BASE, currentDate, navigate]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setPastCycles([]);
      setCyclesError("Session expired. Please sign in again.");
      navigate("/login?mode=login", { replace: true });
      return;
    }

    const controller = new AbortController();
    const load = async () => {
      setCyclesError("");
      if (isInsightsLocked) {
        setPastCycles([]);
        return;
      }

      const params = new URLSearchParams({ n: "60" });
      try {
        const res = await fetch(`${INSIGHTS_BASE}/recent-cycles?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        if (!res.ok) {
          const errorBody = await res.json().catch(() => null);
          setCyclesError(errorBody?.message || `Recent cycles request failed (${res.status}).`);
          if (res.status === 401) {
            localStorage.removeItem("token");
            navigate("/login?mode=login", { replace: true });
          }
          return;
        }

        const json = await res.json();
        const cycles: RecentCycleSummary[] = Array.isArray(json?.cycles) ? json.cycles : [];
        const mapped: PastCycle[] = cycles
          .filter((c) => c?.cycleStart && isYmd(c.cycleStart))
          .slice()
          .reverse()
          .map((c) => ({
            start: formatCycleStartLabel(c.cycleStart),
            rawStart: c.cycleStart,
            length: typeof c.periodLengthDays === "number" ? c.periodLengthDays : 0,
            cycleLength: typeof c.cycleLengthDays === "number" ? c.cycleLengthDays : 0,
          }));

        setPastCycles(mapped);
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          setCyclesError(err?.message || `Unable to load recent cycles (${INSIGHTS_BASE}).`);
        }
      }
    };

    load();
    return () => controller.abort();
  }, [INSIGHTS_BASE, isInsightsLocked, navigate]);

  const historyByDate = useMemo(() => {
    const m = new Map<string, CycleDay>();
    historyDays.forEach((d) => {
      if (d?.date) m.set(d.date, d);
    });
    return m;
  }, [historyDays]);

  useEffect(() => {
    if (!pendingOpenDate) return;
    const dayData = historyByDate.get(pendingOpenDate) || null;
    const target = parseYmdToLocalDate(pendingOpenDate);
    if (!target) return;
    if (
      target.getFullYear() !== currentDate.getFullYear() ||
      target.getMonth() !== currentDate.getMonth()
    ) {
      return;
    }
    setSelectedDay({ day: target.getDate(), data: dayData });
    setDialogOpen(true);
    setPendingOpenDate(null);
  }, [currentDate, historyByDate, pendingOpenDate]);

  const getDayData = (day: number) => {
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(day).padStart(2, "0")}`;
    return historyByDate.get(dateStr);
  };

  const getFlowColor = (flow: string) =>
    flowOptions.find((f) => f.value === flow)?.color || "bg-transparent";
  const getFlowLabel = (flow: string) => flowOptions.find((f) => f.value === flow)?.label || "None";
  const getMoodInfo = (mood: string) => moods.find((m) => m.value === mood);
  const getSleepInfo = (quality: string) => sleepOptions.find((s) => s.value === quality);
  const getExerciseInfo = (exercise: string) =>
    exerciseOptions.find((e) => e.value === exercise);

  const handleDayClick = (day: number) => {
    const data = getDayData(day);
    setSelectedDay({ day, data: data || null });
    setDialogOpen(true);
  };

  const formatSelectedDate = () => {
    if (!selectedDay) return "";
    return new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      selectedDay.day
    ).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const daysInMonth = getDaysInMonth(currentDate);
  const firstDayOfMonth = getFirstDayOfMonth(currentDate);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const emptyDays = Array.from({ length: firstDayOfMonth }, (_, i) => i);
  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const {
    trackedCycles,
    isEarlyPattern,
    patternStrengthLabel,
    avgCycle,
    avgPeriod,
    cycleVariationPlusMinusDays,
    variationNaturalText,
    regularityLabel,
    topSymptom,
    topSymptomCount,
    topSymptomBaseDays,
    symptomBaseLabel,
    cycleChartData,
    symptomFrequency,
    painTrendData,
    avgPainLevel,
    painTrendDirection,
    painLowCycles,
    painMediumCycles,
    painHighCycles,
    painNoDataCycles,
    inferredNoPainCycles,
    painNoDataDots,
    painNoDataDropSegments,
  } = useMemo(() => {
    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    const stdDev = (arr: number[]) => {
      if (arr.length < 2) return 0;
      const m = avg(arr);
      return Math.sqrt(avg(arr.map((n) => (n - m) ** 2)));
    };

    const trackedCycles = pastCycles.length;
    const cycleLengthsFromSummaries = pastCycles.map((c) => c.cycleLength).filter((v) => v > 0);
    const periodLengths = pastCycles.map((c) => c.length).filter((v) => v > 0);
    const entriesSorted = [...backendEntries]
      .filter((e) => e?.entryDate && isYmd(e.entryDate))
      .sort((a, b) => a.entryDate.localeCompare(b.entryDate));
    const periodDateSet = new Set(
      entriesSorted
        .filter((e) => isPeriodFlow(e.flowVolume))
        .map((e) => e.entryDate)
    );
    const detectedCycleStarts = [...periodDateSet]
      .filter((date) => !periodDateSet.has(addDaysToYmd(date, -1)))
      .sort((a, b) => a.localeCompare(b));
    const cycleLengthsFromEntries: number[] = [];
    for (let i = 1; i < detectedCycleStarts.length; i += 1) {
      const prev = parseYmdToLocalDate(detectedCycleStarts[i - 1]);
      const curr = parseYmdToLocalDate(detectedCycleStarts[i]);
      if (!prev || !curr) continue;
      const diff = Math.round((curr.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000));
      if (diff > 0) cycleLengthsFromEntries.push(diff);
    }
    const cycleLengths = cycleLengthsFromSummaries.length
      ? cycleLengthsFromSummaries
      : cycleLengthsFromEntries;

    const avgCycle = avg(cycleLengths);
    const avgPeriod = avg(periodLengths);
    const cycleVariationPlusMinusDays = Math.round(stdDev(cycleLengths));
    const isEarlyPattern = trackedCycles < 6;
    const patternStrengthLabel =
      trackedCycles >= 6 ? "Established" : trackedCycles >= 3 ? "Emerging" : "Early";

    const toNaturalVariation = (days: number) => {
      if (!Number.isFinite(days) || days <= 0) return "not enough data yet";
      if (days === 1) return "about 1 day";
      if (days < 7) return `about ${days} days`;
      const weeks = Math.max(1, Math.round(days / 7));
      return weeks === 1 ? "about 1 week" : `about ${weeks} weeks`;
    };
    const variationNaturalText = toNaturalVariation(cycleVariationPlusMinusDays);

    const regularityBase =
      cycleVariationPlusMinusDays <= 2
        ? "Very Regular"
        : cycleVariationPlusMinusDays <= 4
          ? "Regular"
          : "Variable";
    const regularityLabel = isEarlyPattern
      ? regularityBase === "Variable"
        ? "Early pattern suggests variability"
        : regularityBase === "Regular"
          ? "Early pattern suggests mild variation"
          : "Early pattern suggests regular cycles"
      : regularityBase;

    const cycleChartData = [...pastCycles]
      .filter((c) => c.cycleLength > 0 && c.length > 0)
      .slice(0, 6)
      .reverse()
      .map((c) => ({
        month: c.start.split(" ")[0],
        cycleLength: c.cycleLength,
        periodLength: c.length,
      }));

    const periodDays = historyDays.filter((d) => d.flow && d.flow !== "none");
    const symptomBaseDays = periodDays.length ? periodDays : historyDays;
    const totalSymptomDays = symptomBaseDays.length || 1;
    const symptomBaseLabel = periodDays.length ? "period days" : "logged days";

    const freq = new Map<string, number>();
    for (const d of symptomBaseDays) {
      const uniqueDaySymptoms = new Set((d.symptoms || []).map((s) => String(s || "").trim()).filter(Boolean));
      uniqueDaySymptoms.forEach((s) => {
        freq.set(s, (freq.get(s) || 0) + 1);
      });
    }

    const sorted = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([symptom, count]) => ({
        symptom,
        count,
        baseDays: totalSymptomDays,
        rawPercentage: Math.round((count / totalSymptomDays) * 100),
        percentage:
          isEarlyPattern && Math.round((count / totalSymptomDays) * 100) >= 100
            ? 96
            : Math.round((count / totalSymptomDays) * 100),
        frequencyBand:
          Math.round((count / totalSymptomDays) * 100) >= 85
            ? "High frequency"
            : Math.round((count / totalSymptomDays) * 100) >= 60
              ? "Common"
              : Math.round((count / totalSymptomDays) * 100) >= 30
                ? "Sometimes"
                : "Occasional",
      }));

    const topSymptom = sorted[0]?.symptom ? humanizeSymptomTag(sorted[0].symptom) : "-";
    const topSymptomCount = sorted[0]?.count ?? 0;
    const topSymptomBaseDays = sorted[0]?.baseDays ?? totalSymptomDays;
    const cycleStartsFromSummaries = pastCycles
      .map((c) => c.rawStart)
      .filter((d) => isYmd(d))
      .sort((a, b) => a.localeCompare(b));
    const cycleStarts = cycleStartsFromSummaries.length
      ? cycleStartsFromSummaries
      : detectedCycleStarts;
    const lastLoggedDate = entriesSorted[entriesSorted.length - 1]?.entryDate || null;
    const painTrendData = cycleStarts
      .map((start, idx, arr) => {
        const nextStart = arr[idx + 1];
        const cycleEntries = entriesSorted.filter((e) =>
          nextStart
            ? e.entryDate >= start && e.entryDate < nextStart
            : e.entryDate >= start
        );
        const painValues = cycleEntries
          .map((e) =>
            typeof e?.pain?.painIntensity === "number" ? e.pain.painIntensity : null
          )
          .filter((n): n is number => n !== null);
        const hasAnyLogs = cycleEntries.length > 0;
        const avgCyclePain = painValues.length
          ? Number((painValues.reduce((sum, n) => sum + n, 0) / painValues.length).toFixed(1))
          : hasAnyLogs
            ? 0
            : null;
        const cycleEnd = nextStart
          ? addDaysToYmd(nextStart, -1)
          : (lastLoggedDate || start);
        return {
          cycleLabel: `C${idx + 1}`,
          rangeLabel: `${formatCycleStartLabel(start)} - ${formatCycleStartLabel(cycleEnd)}`,
          painLevel: avgCyclePain,
          hasPainData: avgCyclePain !== null,
          inferredNoPain: hasAnyLogs && painValues.length === 0,
        };
      });
    const painWithData = painTrendData.filter((x) => typeof x.painLevel === "number");
    const avgPainLevel = painWithData.length
      ? Number(
          (
            painWithData.reduce((sum, item) => sum + (item.painLevel as number), 0) /
            painWithData.length
          ).toFixed(1)
        )
      : 0;
    const painLowCycles = painWithData.filter((x) => (x.painLevel as number) <= 3).length;
    const painMediumCycles = painWithData.filter((x) => (x.painLevel as number) > 3 && (x.painLevel as number) <= 6).length;
    const painHighCycles = painWithData.filter((x) => (x.painLevel as number) > 6).length;
    const painNoDataCycles = painTrendData.length - painWithData.length;
    const painTrendDelta =
      painWithData.length >= 2
        ? Number(((painWithData[painWithData.length - 1].painLevel as number) - (painWithData[0].painLevel as number)).toFixed(1))
        : 0;
    const absPainTrendDelta = Math.abs(painTrendDelta);
    const painTrendDirection =
      painWithData.length < 2
        ? "Pattern emerging"
        : absPainTrendDelta < 0.8
          ? "Mostly stable"
          : painTrendDelta > 0
            ? isEarlyPattern
              ? "Recent increase noticed"
              : absPainTrendDelta < 2
                ? "Mild increase"
                : absPainTrendDelta < 4
                  ? "Moderate increase"
                  : "Sharp increase"
            : isEarlyPattern
              ? "Recent decrease noticed"
              : absPainTrendDelta < 2
                ? "Mild decrease"
                : absPainTrendDelta < 4
                  ? "Moderate decrease"
                  : "Sharp decrease";
    const painNoDataDots = painTrendData
      .filter((point) => !point.hasPainData)
      .map((point) => ({
        cycleLabel: point.cycleLabel,
      }));
    const inferredNoPainCycles = painTrendData.filter((point) => point.inferredNoPain).length;
    const painNoDataDropSegments: Array<{
      fromLabel: string;
      fromY: number;
      toLabel: string;
      toY: number;
    }> = [];
    for (let i = 0; i < painTrendData.length; i++) {
      if (painTrendData[i].hasPainData) continue;
      let lastDataIndex = i - 1;
      while (lastDataIndex >= 0 && !painTrendData[lastDataIndex].hasPainData) lastDataIndex--;
      if (lastDataIndex < 0) continue;
      painNoDataDropSegments.push({
        fromLabel: painTrendData[lastDataIndex].cycleLabel,
        fromY: painTrendData[lastDataIndex].painLevel as number,
        toLabel: painTrendData[i].cycleLabel,
        toY: 0,
      });
    }

    return {
      trackedCycles,
      isEarlyPattern,
      patternStrengthLabel,
      avgCycle,
      avgPeriod,
      cycleVariationPlusMinusDays,
      variationNaturalText,
      regularityLabel,
      topSymptom,
      topSymptomCount,
      topSymptomBaseDays,
      symptomBaseLabel,
      cycleChartData,
      symptomFrequency: sorted,
      painTrendData,
      avgPainLevel,
      painTrendDirection,
      painLowCycles,
      painMediumCycles,
      painHighCycles,
      painNoDataCycles,
      inferredNoPainCycles,
      painNoDataDots,
      painNoDataDropSegments,
    };
  }, [backendEntries, historyDays, pastCycles]);

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 md:py-12 max-w-5xl">
        <section className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-soft">
              <Droplets className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="font-serif text-3xl font-bold text-foreground">Cycle History</h1>
          </div>
          <p className="text-muted-foreground">
            Review your past cycles and track patterns over time. Click on any day to view details.
          </p>
          {isInsightsLocked ? (
            <p className="text-xs text-amber-700 mt-2">
              Verify your email to unlock predictions and health insights.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-2">
              These insights are based on {trackedCycles} tracked cycle{trackedCycles === 1 ? "" : "s"}.
              {isEarlyPattern ? " Patterns are still emerging and may shift as you log more." : " Patterns are becoming more stable."}
            </p>
          )}
          {(historyLoading || historyError || cyclesError) && (
            <p className="text-xs text-muted-foreground mt-2">
              {historyLoading
                ? "Loading history..."
                : historyError || cyclesError}
            </p>
          )}
        </section>

        {!isInsightsLocked && (
          <>
            <section className="mb-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="stat-card animate-fade-in bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/20">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Activity className="w-5 h-5 text-primary" />
                    </div>
                    <span className="text-sm font-medium text-muted-foreground">Cycle Regularity</span>
                  </div>
                  <p className="text-2xl font-bold text-foreground mb-1">{regularityLabel}</p>
                  <p className="text-sm text-muted-foreground">Cycle length varies by {variationNaturalText}</p>
                </div>

                <div className="stat-card animate-fade-in bg-gradient-to-br from-coral/15 via-coral/5 to-transparent border-coral/20" style={{ animationDelay: "0.1s" }}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-coral/10 flex items-center justify-center">
                      <Heart className="w-5 h-5 text-coral" />
                    </div>
                    <span className="text-sm font-medium text-muted-foreground">Top Symptom</span>
                  </div>
                  <p className="text-2xl font-bold text-foreground mb-1">{topSymptom}</p>
                  <p className="text-sm text-muted-foreground">
                    {topSymptom === "-"
                      ? "Log symptoms to surface recurring patterns."
                      : `Logged on ${topSymptomCount}/${topSymptomBaseDays} tracked ${symptomBaseLabel}.`}
                  </p>
                </div>

                <div className="stat-card animate-fade-in bg-gradient-to-br from-lavender/40 via-lavender/15 to-transparent border-lavender/30" style={{ animationDelay: "0.2s" }}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-lavender/50 flex items-center justify-center">
                      <Info className="w-5 h-5 text-lavender-dark" />
                    </div>
                    <span className="text-sm font-medium text-muted-foreground">Tracked Cycles</span>
                  </div>
                  <p className="text-2xl font-bold text-foreground mb-1">{trackedCycles} Cycles</p>
                  <p className="text-sm text-muted-foreground">
                    Avg cycle {avgCycle.toFixed(1)}d | Avg period {avgPeriod.toFixed(1)}d
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Pattern strength: {patternStrengthLabel}</p>
                </div>
              </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <div className="glass-card p-6 animate-fade-in h-full flex flex-col bg-gradient-to-br from-orange-50/70 via-rose-50/50 to-background border-orange-100/60">
            <div className="min-h-[132px]">
              <h2 className="font-serif text-xl font-semibold text-foreground mb-2">Pain Level Trend</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Average tracked pain level per cycle across all logged history (0-10). Current avg: {avgPainLevel.toFixed(1)}
              </p>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                  Trend: {painTrendDirection}
                </span>
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
                  Low: {painLowCycles}
                </span>
                <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-700 border border-amber-500/20">
                  Moderate: {painMediumCycles}
                </span>
                <span className="px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-700 border border-rose-500/20">
                  High: {painHighCycles}
                </span>
                <span className="px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-700 border border-sky-500/20">
                  Inferred no pain: {inferredNoPainCycles}
                </span>
                <span className="px-2.5 py-1 rounded-full bg-slate-500/10 text-slate-700 border border-slate-500/20">
                  No pain log: {painNoDataCycles}
                </span>
              </div>
            </div>

            <div className="h-64 mt-4">
              {painTrendData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={painTrendData}>
                    <defs>
                      <linearGradient id="painFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--coral))" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="hsl(var(--coral))" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <ReferenceArea y1={0} y2={3} fill="rgba(34,197,94,0.08)" />
                    <ReferenceArea y1={3} y2={6} fill="rgba(245,158,11,0.08)" />
                    <ReferenceArea y1={6} y2={10} fill="rgba(244,63,94,0.08)" />
                    {painNoDataDropSegments.map((seg, idx) => (
                      <ReferenceLine
                        key={`no-data-drop-${idx}`}
                        segment={[
                          { x: seg.fromLabel, y: seg.fromY },
                          { x: seg.toLabel, y: seg.toY },
                        ]}
                        stroke="#94a3b8"
                        strokeDasharray="6 5"
                        strokeWidth={2}
                      />
                    ))}
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="cycleLabel" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} />
                    <Tooltip
                      formatter={(value: number | string, _, item: any) => {
                        const payload = item?.payload;
                        if (value === null || value === undefined) {
                          return ["No data", "Average pain"];
                        }
                        if (payload?.inferredNoPain) {
                          return ["0/10 (inferred from cycle logs)", "Average pain"];
                        }
                        return [`${value}/10`, "Average pain"];
                      }}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.rangeLabel || "Cycle"}
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "12px",
                        boxShadow: "var(--shadow-card)",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="painLevel"
                      stroke="hsl(var(--coral))"
                      fill="url(#painFill)"
                      strokeWidth={3}
                      dot={{ fill: "hsl(var(--coral))", strokeWidth: 0, r: 5 }}
                      activeDot={{ r: 7, fill: "hsl(var(--coral))" }}
                    />
                    {painNoDataDots.map((dot, idx) => (
                      <ReferenceDot
                        key={`no-data-dot-${idx}`}
                        x={dot.cycleLabel}
                        y={0}
                        r={6}
                        fill="#ffffff"
                        stroke="#94a3b8"
                        strokeWidth={2}
                        label={{
                          value: "No data",
                          position: "top",
                          fill: "#64748b",
                          fontSize: 11,
                        }}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground border border-dashed border-border rounded-xl">
                  No pain trend yet. Track pain across at least 2 cycles.
                </div>
              )}
            </div>
          </div>

          <div className="glass-card p-6 animate-fade-in h-full flex flex-col bg-gradient-to-br from-coral/10 via-amber-50/50 to-background border-coral/20" style={{ animationDelay: "0.1s" }}>
            <div className="min-h-[132px]">
              <h2 className="font-serif text-xl font-semibold text-foreground mb-2">Period Duration</h2>
              <p className="text-sm text-muted-foreground mb-6">How long your periods typically last</p>
            </div>

            <div className="h-64 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cycleChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} domain={[0, 10]} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "12px",
                      boxShadow: "var(--shadow-card)",
                    }}
                  />
                  <Bar dataKey="periodLength" fill="hsl(var(--coral))" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-2 glass-card p-6 animate-fade-in bg-gradient-to-br from-primary/10 via-sky-50/50 to-background border-primary/20" style={{ animationDelay: "0.2s" }}>
            <h2 className="font-serif text-xl font-semibold text-foreground mb-2">Symptom Frequency</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Most common symptoms on tracked {symptomBaseLabel}.
            </p>

            {symptomFrequency.length ? (
              <div className="space-y-4">
                {symptomFrequency.map((item, index) => (
                  <div
                    key={item.symptom}
                    className="animate-slide-in"
                    style={{ animationDelay: `${0.08 * index}s` }}
                  >
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-foreground">{humanizeSymptomTag(item.symptom)}</span>
                      <span className="text-muted-foreground">{item.count}/{item.baseDays} days</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-1">{item.frequencyBand}</p>
                    <div className="h-3 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full gradient-primary rounded-full transition-all duration-1000"
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No symptom frequency data yet.</p>
            )}
          </div>
            </div>
          </>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 glass-card p-6 animate-fade-in bg-gradient-to-br from-lavender/20 via-background to-primary/5 border-lavender/25">
            <div className="flex items-center justify-between mb-6">
              <Button variant="ghost" size="icon" onClick={goToPreviousMonth}>
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <h2 className="font-serif text-xl font-semibold text-foreground">{formatMonth(currentDate)}</h2>
              <Button variant="ghost" size="icon" onClick={goToNextMonth}>
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2">
              {weekDays.map((day) => (
                <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {emptyDays.map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square" />
              ))}

              {days.map((day) => {
                const dayData = getDayData(day);
                const today = new Date();
                const isToday =
                  day === today.getDate() &&
                  currentDate.getMonth() === today.getMonth() &&
                  currentDate.getFullYear() === today.getFullYear();

                const hasData = !!dayData;

                return (
                  <button
                    key={day}
                    onClick={() => handleDayClick(day)}
                    className={`aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all duration-300 cursor-pointer hover:bg-primary/10 hover:scale-105 ${
                      isToday ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
                    } ${hasData ? "bg-primary/5" : "hover:bg-muted/50"}`}
                  >
                    <span className={`text-sm ${hasData ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                      {day}
                    </span>
                    {hasData && (
                      <div className={`w-2 h-2 rounded-full mt-1 ${dayData!.flow === "none" ? "bg-sky-400" : getFlowColor(dayData!.flow)}`} />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-4 mt-6 pt-6 border-t border-border">
              <span className="text-sm text-muted-foreground">Flow Intensity:</span>
              {flowOptions.slice(1).map((option) => (
                <div key={option.value} className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${option.color}`} />
                  <span className="text-sm text-muted-foreground">{option.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card p-6 animate-fade-in bg-gradient-to-br from-coral/10 via-background to-coral/5 border-coral/20" style={{ animationDelay: "0.1s" }}>
            <h2 className="font-serif text-xl font-semibold text-foreground mb-4">Past Cycles</h2>
            {isInsightsLocked ? (
              <div className="rounded-xl border border-amber-200/70 bg-amber-50/70 p-4">
                <p className="text-sm font-medium text-foreground mb-1">History insights are locked</p>
                <p className="text-xs text-muted-foreground">
                  Verify your email to unlock predictions and health insights.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {pastCycles.length ? (
                    pastCycles.map((cycle, index) => (
                      <div
                        key={index}
                        className="p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors animate-slide-in"
                        style={{ animationDelay: `${0.1 * index}s` }}
                      >
                        <p className="font-medium text-foreground mb-2">{cycle.start}</p>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Period: {cycle.length} days</span>
                          <span className="text-muted-foreground">Cycle: {cycle.cycleLength} days</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No completed cycles yet.</p>
                  )}
                </div>

                <div className="mt-6 pt-6 border-t border-border">
                  <h3 className="font-medium text-foreground mb-3">Summary</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 bg-muted/50 rounded-xl">
                      <p className="text-2xl font-bold text-primary">{avgCycle.toFixed(1)}</p>
                      <p className="text-xs text-muted-foreground">Avg Cycle</p>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-xl">
                      <p className="text-2xl font-bold text-coral">{avgPeriod.toFixed(1)}</p>
                      <p className="text-xs text-muted-foreground">Avg Period</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden border-0 shadow-2xl">
          {selectedDay?.data ? (
            <div className="relative">
              <div className="bg-gradient-to-r from-primary via-primary/90 to-coral p-5 text-white">
                <p className="text-sm opacity-90 mb-1">Daily Summary</p>
                <h2 className="text-xl font-serif font-semibold">{formatSelectedDate()}</h2>
              </div>

              <div className="p-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-1 bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl p-4 flex flex-col items-center text-center">
                    <div
                      className={`w-11 h-11 rounded-full ${getFlowColor(selectedDay.data.flow)} flex items-center justify-center mb-2 shadow-md`}
                    >
                      <Droplets className="w-5 h-5 text-white" />
                    </div>
                    <p className="text-xs text-muted-foreground">Flow</p>
                    <p className="font-semibold text-foreground">{getFlowLabel(selectedDay.data.flow)}</p>
                  </div>

                  <div className="col-span-1 bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-900/20 dark:to-purple-800/10 rounded-2xl p-4 flex flex-col items-center text-center">
                    {(() => {
                      const moodInfo = getMoodInfo(selectedDay.data.mood || "");
                      const IconComponent = moodInfo ? moodIconMap[moodInfo.icon] : null;
                      return (
                        <>
                          <div className="w-11 h-11 rounded-full bg-purple-200 dark:bg-purple-800/50 flex items-center justify-center mb-2">
                            {IconComponent ? (
                              <IconComponent className="w-5 h-5 text-purple-600 dark:text-purple-300" />
                            ) : (
                              <Meh className="w-5 h-5 text-purple-400" />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">Mood</p>
                          <p className="font-semibold text-foreground">{moodInfo?.label || "Not recorded"}</p>
                        </>
                      );
                    })()}
                  </div>

                  <div className="col-span-1 bg-gradient-to-br from-indigo-100 to-indigo-50 dark:from-indigo-900/20 dark:to-indigo-800/10 rounded-2xl p-4 flex flex-col items-center text-center">
                    {(() => {
                      const sleepInfo = getSleepInfo(selectedDay.data.sleepQuality || "");
                      const IconComponent = sleepInfo ? sleepIconMap[sleepInfo.icon] : null;
                      return (
                        <>
                          <div className="w-11 h-11 rounded-full bg-indigo-200 dark:bg-indigo-800/50 flex items-center justify-center mb-2">
                            {IconComponent ? (
                              <IconComponent className="w-5 h-5 text-indigo-600 dark:text-indigo-300" />
                            ) : (
                              <Moon className="w-5 h-5 text-indigo-400" />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">Sleep</p>
                          <p className="font-semibold text-foreground">
                            {selectedDay.data.sleepHours ? `${selectedDay.data.sleepHours}h` : "-"}
                            {sleepInfo && <span className="text-xs text-muted-foreground ml-1">({sleepInfo.label})</span>}
                          </p>
                        </>
                      );
                    })()}
                  </div>

                  <div className="col-span-1 bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-900/20 dark:to-emerald-800/10 rounded-2xl p-4 flex flex-col items-center text-center">
                    <div className="w-11 h-11 rounded-full bg-emerald-200 dark:bg-emerald-800/50 flex items-center justify-center mb-2">
                      <Activity className="w-5 h-5 text-emerald-600 dark:text-emerald-300" />
                    </div>
                    <p className="text-xs text-muted-foreground">Exercise</p>
                    <p className="font-semibold text-foreground">
                      {selectedDay.data.exerciseDuration ? `${selectedDay.data.exerciseDuration} min` : "-"}
                    </p>
                    {selectedDay.data.exercises && selectedDay.data.exercises.length > 0 && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                        {selectedDay.data.exercises
                          .map((e) => getExerciseInfo(e)?.label)
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    )}
                  </div>
                </div>

                {selectedDay.data.symptoms && selectedDay.data.symptoms.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                      <HeartPulse className="w-3 h-3" /> Symptoms
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedDay.data.symptoms.map((symptom) => (
                        <span
                          key={symptom}
                          className="px-2.5 py-1 rounded-full bg-coral/15 text-coral text-xs font-medium capitalize"
                        >
                          {symptom}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedDay.data.notes && (
                  <div className="mt-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200/50 dark:border-amber-700/30">
                    <div className="flex items-start gap-2">
                      <FileText className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-foreground leading-relaxed">{selectedDay.data.notes}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/50 flex items-center justify-center">
                <Calendar className="w-8 h-8 text-muted-foreground/40" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">No History</h3>
              <p className="text-muted-foreground text-sm mb-4">No data recorded for {formatSelectedDate()}</p>
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default History;
