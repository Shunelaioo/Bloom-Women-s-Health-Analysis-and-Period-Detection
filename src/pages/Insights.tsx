"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp,
  Activity,
  AlertTriangle,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  XCircle,
  Gauge,
  Stethoscope,
  Flame,
  Brain,
} from "lucide-react";
import Layout from "@/components/layout/Layout";
import { mockCycleHistory } from "@/lib/cycleData";
import { useNotifications } from "@/contexts/NotificationContext";

/**
 * Types
 */
type CycleSummary = {
  start: string; // YYYY-MM-DD
  end?: string; // YYYY-MM-DD
  cycleLength: number;
  periodLength: number;
};

type ConditionFlag = {
  condition:
    | "Oligomenorrhea"
    | "Polymenorrhea"
    | "Menorrhagia"
    | "Amenorrhea"
    | "Intermenstrual bleeding";
  status: "High alert" | "Possible" | "Unlikely" | "Needs more data";
  confidence: "Low" | "Medium" | "High";
  reasons: string[];
  nextStep: string;
};

type Severity = "Low" | "Medium" | "High";

type ModelFeatures = {
  age: number;
  bmi: number;
  life_stage: "reproductive" | "perimenopausal" | "unknown";
  tracking_duration_months: number;
  pain_score: number;
  avg_cycle_length: number;
  cycle_length_variation: number;
  avg_bleeding_days: number;
  bleeding_volume_score: number;
  intermenstrual_episodes: number;
  cycle_variation_coeff: number;
  pattern_disruption_score: number;
  duration_abnormality_flag: number;
};

type ModelPrediction = {
  label: string;
  probability: number | null;
  positive: boolean | null;
  threshold?: number;
};

type ExtraMetrics = {
  hmb_impact_score?: number;
  hmb_burden_level?: "low" | "medium" | "high";
  hmb_details?: {
    periodDays?: number;
    soakedThroughDays?: number;
    floodingDays?: number;
    largeClotsDays?: number;
    avgPadChangeCount?: number;
    avgBleedingImpact?: number;
  };
  pain_outside_period_days?: number;
  pain_outside_period_flag?: boolean;
  context_flags?: {
    contraceptionType?: string;
    postpartumBreastfeeding?: boolean;
    tryingToConceive?: boolean;
    contextActive?: boolean;
  };
};

type HybridTriageCondition = {
  label: string;
  condition: ConditionFlag["condition"];
  model_probability: number | null;
  model_threshold: number;
  model_positive: boolean | null;
  rule_level: "none" | "medium" | "high";
  rule_positive: boolean;
  final_status: ConditionFlag["status"];
  final_confidence: ConditionFlag["confidence"];
  reasons: string[];
  next_step: string;
};

type HybridTriage = {
  summary?: {
    overall_alert_level?: "none" | "medium" | "high";
    high_alert_conditions?: string[];
    possible_conditions?: string[];
    context_active?: boolean;
    minimum_history_met?: boolean;
    reliability_tier?: "low" | "moderate" | "strong";
    logging_rate?: number;
  };
  conditions?: HybridTriageCondition[];
  red_flags?: Array<{ label: string; hit: boolean; severity?: "low" | "medium" | "high" | "critical" }>;
};

type LlmInsights = {
  observations: string[];
  tips: string[];
  tracking_suggestions: string[];
  red_flags?: string[];
  questions_for_doctor?: string[];
};
type InsightsSource = "gemini" | "rule_based_tracking";

type LastCycleSummary = {
  symptomSeverityAvg?: number | null;
  symptomSeverityAvgAllTime?: number | null;
};

type RecentCycleSummary = {
  cycleStart: string;
  cycleLengthDays: number | null;
  periodLengthDays: number | null;
};

type NamedCount = { name: string; count: number };
type RedFlagTier = "within_typical" | "monitor" | "consider_clinician";
type ConditionScreeningTier = "no_strong_signals" | "monitor" | "needs_attention";

const THRESHOLDS: Record<string, number> = {
  Oligomenorrhea: 0.5,
  Polymenorrhea: 0.5,
  Menorrhagia: 0.5,
  Amenorrhagia: 0.75, // not used, safe
  Amenorrhea: 0.75, // stricter
  "Intermenstrual bleeding": 0.5,
  intermenstrual_bleeding: 0.5, // safe aliases
  intermenstrual: 0.5,
};

const resolveThreshold = (label: string, fallback?: number) => {
  if (!label) return fallback ?? 0.5;
  const direct = THRESHOLDS[label];
  if (typeof direct === "number") return direct;
  const normalized = label.toLowerCase().replace(/\s+/g, "_");
  return THRESHOLDS[normalized] ?? fallback ?? 0.5;
};

/**
 * Date helpers
 */
function toDate(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, (m || 1) - 1, day || 1);
}
function toISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}
function daysBetween(a: Date, b: Date) {
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}
function mean(nums: number[]) {
  return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
}
function stddev(nums: number[]) {
  if (nums.length < 2) return 0;
  const m = mean(nums);
  const v = mean(nums.map((n) => (n - m) ** 2));
  return Math.sqrt(v);
}
function formatPretty(d: string) {
  const dt = toDate(d);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function titleize(value: string) {
  return value
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function summarizeTop(values: NamedCount[], empty = "-") {
  if (!values?.length) return empty;
  return values
    .slice(0, 2)
    .map((v) => `${titleize(v.name)} (${v.count})`)
    .join(", ");
}

function scrubTechnicalReason(reason: string) {
  const text = String(reason || "").trim();
  if (!text) return "";
  if (/model probability/i.test(text)) return "";
  if (/decision threshold/i.test(text)) return "";
  if (/model signal/i.test(text) && /threshold/i.test(text)) return "";
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Cycle derivation from daily history:
 * - Period day = flow exists and not "none"
 * - Period start = a period day preceded by non-period day (or no previous)
 * - Cycle length = days between consecutive period starts
 * - Period length = consecutive period days from start
 */
function deriveCyclesFromHistory(): CycleSummary[] {
  const rows = [...mockCycleHistory]
    .filter((r: any) => r?.date)
    .sort((a: any, b: any) => (a.date > b.date ? 1 : -1));

  const isPeriodDay = (r: any) => r.flow && r.flow !== "none";

  const starts: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (!isPeriodDay(rows[i])) continue;
    const prev = rows[i - 1];
    if (!prev || !isPeriodDay(prev)) starts.push(rows[i].date);
  }

  const cycles: CycleSummary[] = [];
  for (let i = 0; i < starts.length - 1; i++) {
    const start = starts[i];
    const nextStart = starts[i + 1];

    // period length
    const startIdx = rows.findIndex((r: any) => r.date === start);
    let pLen = 0;
    for (let j = startIdx; j < rows.length; j++) {
      if (isPeriodDay(rows[j])) pLen++;
      else break;
    }

    const cLen = daysBetween(toDate(start), toDate(nextStart));
    cycles.push({
      start,
      end: toISO(addDays(toDate(start), cLen - 1)),
      cycleLength: cLen,
      periodLength: pLen,
    });
  }

  return cycles.slice(-10);
}

/**
 * Extract signals from daily history
 * NOTE: If you later store symptom intensity, upgrade these.
 */
function deriveSignalsFromHistory() {
  const rows = [...mockCycleHistory]
    .filter((r: any) => r?.date)
    .sort((a: any, b: any) => (a.date > b.date ? 1 : -1));

  const loggedDays = rows.length;

  // Approx expected days: between first and last entry inclusive
  const expectedDays =
    loggedDays >= 2
      ? Math.max(1, daysBetween(toDate(rows[0].date), toDate(rows[loggedDays - 1].date)) + 1)
      : loggedDays;

  const loggingRate = expectedDays ? loggedDays / expectedDays : 0;

  const periodDays = rows.filter((r: any) => r.flow && r.flow !== "none");
  const heavyFlowDays = rows.filter((r: any) => r.flow === "heavy").length;

  const symptomCount = (name: string) =>
    rows.filter((r: any) => {
      const syms: string[] = r.symptoms || [];
      return syms.map((s) => String(s).toLowerCase()).includes(name.toLowerCase());
    }).length;

  // crude pain proxy
  const crampsDays = symptomCount("cramps");
  const pelvicPainDays = symptomCount("pelvic pain");
  const painDays = crampsDays + pelvicPainDays;

  // PMS proxy (edit these names to match your symptom list)
  const moodSwingsDays = symptomCount("mood swings");
  const irritabilityDays = symptomCount("irritability");
  const anxietyDays = symptomCount("anxiety");
  const bloatingDays = symptomCount("bloating");
  const breastTendernessDays = symptomCount("breast tenderness");

  const pmsSignalDays =
    moodSwingsDays + irritabilityDays + anxietyDays + bloatingDays + breastTendernessDays;

  const lastLoggedDate = rows[loggedDays - 1]?.date;

  return {
    loggedDays,
    expectedDays,
    loggingRate, // 0..1
    periodDaysCount: periodDays.length,
    heavyFlowDays,
    painDays,
    pmsSignalDays,
    lastLoggedDate,
  };
}

/**
 * Score mapping: returns "Low/Medium/High"
 */
function toSeverity(score01: number): Severity {
  if (score01 >= 0.66) return "High";
  if (score01 >= 0.33) return "Medium";
  return "Low";
}

function severityStyles(s: Severity) {
  if (s === "High") return "bg-destructive/15 border-destructive/30 text-destructive";
  if (s === "Medium") return "bg-coral/15 border-coral/30 text-coral";
  return "bg-sage/25 border-sage/30 text-foreground";
}

function burdenStyles(level: "low" | "medium" | "high") {
  if (level === "high") return "bg-destructive/15 border-destructive/30 text-destructive";
  if (level === "medium") return "bg-amber-500/15 border-amber-500/30 text-amber-700";
  return "bg-emerald-500/15 border-emerald-500/30 text-emerald-700";
}

const Insights = () => {
  const API_ROOT =
    (import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "http://localhost:5000").replace(
      /\/api$/,
      ""
    );
  const API_BASE = `${API_ROOT}/api/daily-entries`;
  const INSIGHTS_BASE = `${API_ROOT}/api/insights`;

  const [modelFeatures, setModelFeatures] = useState<ModelFeatures | null>(null);
  const [modelPredictions, setModelPredictions] = useState<ModelPrediction[]>([]);
  const [trackingSummary, setTrackingSummary] = useState<{
    cyclesTracked: number;
    loggingRate: number;
    lastLoggedDate: string | null;
  } | null>(null);
  const [modelError, setModelError] = useState<string>("");
  const [extraMetrics, setExtraMetrics] = useState<ExtraMetrics | null>(null);
  const [hybridTriage, setHybridTriage] = useState<HybridTriage | null>(null);
  const [minimumHistoryMet, setMinimumHistoryMet] = useState<boolean | null>(null);

  const [lastCycleSummary, setLastCycleSummary] = useState<LastCycleSummary | null>(null);
  const [llmInsights, setLlmInsights] = useState<LlmInsights | null>(null);
  const [insightsSource, setInsightsSource] = useState<InsightsSource>("rule_based_tracking");
  const [insightsError, setInsightsError] = useState<string>("");
  const [insightsLoading, setInsightsLoading] = useState<boolean>(false);
  const [recentCycles, setRecentCycles] = useState<RecentCycleSummary[]>([]);
  const { checkRedFlags } = useNotifications();

  useEffect(() => {
    const loadModelData = async () => {
      const token = localStorage.getItem("token");
      if (!token) return;

      try {
        const res = await fetch(`${API_BASE}/model-predictions`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = await res.json().catch(() => null);
        if (data) {
          setModelFeatures(data?.features ?? null);
          setModelPredictions(data?.predictions ?? []);
          setExtraMetrics(data?.extra_metrics ?? null);
          setHybridTriage(data?.hybrid_triage ?? null);
          if (data?.tracking_summary || typeof data?.detected_periods === "number") {
            const detectedPeriods = data?.detected_periods ?? null;
            const cyclesTrackedFromFeatures =
              detectedPeriods !== null ? Math.max(0, detectedPeriods - 1) : null;
            const rawCycles =
              data?.tracking_summary?.cyclesTracked ?? cyclesTrackedFromFeatures ?? 0;
            const loggingRate = data?.tracking_summary?.loggingRate ?? 0;
            const lastLoggedDate = data?.tracking_summary?.lastLoggedDate ?? null;
            setTrackingSummary({
              cyclesTracked: rawCycles,
              loggingRate,
              lastLoggedDate,
            });
          }
          setMinimumHistoryMet(
            typeof data?.minimum_history_met === "boolean" ? data.minimum_history_met : null
          );
        }

        if (!res.ok) {
          setModelError(data?.message || "Unable to load model predictions.");
          return;
        }
        setModelError("");
      } catch (err) {
        console.error(err);
        setModelError("Unable to load model predictions.");
      }
    };

    loadModelData();
  }, [API_BASE]);

  useEffect(() => {
    const loadRecentCycles = async () => {
      const token = localStorage.getItem("token");
      if (!token) return;
      try {
        const res = await fetch(`${INSIGHTS_BASE}/recent-cycles?n=12`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        const rows: RecentCycleSummary[] = Array.isArray(data?.cycles) ? data.cycles : [];
        const normalized = rows
          .filter((row) => typeof row?.cycleStart === "string" && row.cycleStart)
          .map((row) => ({
            cycleStart: row.cycleStart,
            cycleLengthDays:
              typeof row?.cycleLengthDays === "number" ? row.cycleLengthDays : null,
            periodLengthDays:
              typeof row?.periodLengthDays === "number" ? row.periodLengthDays : null,
          }))
          .sort((a, b) => a.cycleStart.localeCompare(b.cycleStart));
        setRecentCycles(normalized);
      } catch (err) {
        console.error("Unable to load recent cycles:", err);
      }
    };

    loadRecentCycles();
  }, [INSIGHTS_BASE]);

  useEffect(() => {
    const loadLlmInsights = async () => {
      const token = localStorage.getItem("token");
      if (!token) return;
      setInsightsLoading(true);
      setInsightsError("");
      try {
        const res = await fetch(`${INSIGHTS_BASE}/last-cycle`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (res.status === 422) {
          setInsightsError("Log more tracking data to unlock personalized insights.");
          setInsightsLoading(false);
          return;
        }
        if (!res.ok) {
          setInsightsError("Could not load personalized insights.");
          setInsightsLoading(false);
          return;
        }
        const data = await res.json();
        setLastCycleSummary(data?.lastCycleSummary ?? null);
        setLlmInsights(data?.insights ?? null);
        setInsightsSource(data?.source === "gemini" ? "gemini" : "rule_based_tracking");
      } catch (err) {
        console.error(err);
        setInsightsError("Could not load personalized insights.");
      } finally {
        setInsightsLoading(false);
      }
    };

    loadLlmInsights();
  }, [INSIGHTS_BASE]);

  // NOTE: Removed "Last 3 Cycles Tracking Detail" panel per UI request.

  const computed = useMemo(() => {
    const hasBackendCycleSeries = recentCycles.length > 0;
    const cycles = hasBackendCycleSeries
      ? recentCycles.map((row) => ({
          start: row.cycleStart,
          cycleLength: typeof row.cycleLengthDays === "number" ? row.cycleLengthDays : 0,
          periodLength: typeof row.periodLengthDays === "number" ? row.periodLengthDays : 0,
        }))
      : deriveCyclesFromHistory();
    const signals = deriveSignalsFromHistory();

    const cycleLens = cycles.map((c) => c.cycleLength).filter((n) => n > 0);
    const periodLens = cycles.map((c) => c.periodLength).filter((n) => n > 0);

    const avgCycle =
      cycleLens.length > 0
        ? mean(cycleLens)
        : Number(modelFeatures?.avg_cycle_length ?? 0) > 0
        ? Number(modelFeatures?.avg_cycle_length)
        : 28;
    const avgPeriod =
      periodLens.length > 0
        ? mean(periodLens)
        : Number(modelFeatures?.avg_bleeding_days ?? 0) > 0
        ? Number(modelFeatures?.avg_bleeding_days)
        : 5;

    const sd =
      cycleLens.length >= 2
        ? stddev(cycleLens)
        : Number(modelFeatures?.cycle_length_variation ?? 0);
    const regularityLabel = sd <= 2 ? "Very Regular" : sd <= 4 ? "Regular" : "Variable";
    const variationPlusMinus = Math.round(sd || 0);

    const lastCycle = cycles[cycles.length - 1];
    const lastStart = lastCycle?.start;

    const nextPeriodStart = lastStart
      ? toISO(addDays(toDate(lastStart), Math.round(avgCycle)))
      : undefined;
    const estimatedOvulation = nextPeriodStart
      ? toISO(addDays(toDate(nextPeriodStart), -14))
      : undefined;

    const fertileStart = estimatedOvulation
      ? toISO(addDays(toDate(estimatedOvulation), -5))
      : undefined;
    const fertileEnd = estimatedOvulation
      ? toISO(addDays(toDate(estimatedOvulation), 1))
      : undefined;

    const lastPeriodEnd = lastStart
      ? toISO(addDays(toDate(lastStart), Math.round(avgPeriod) - 1))
      : undefined;
    const safe1Start = lastPeriodEnd ? toISO(addDays(toDate(lastPeriodEnd), 1)) : undefined;
    const safe1End = fertileStart ? toISO(addDays(toDate(fertileStart), -1)) : undefined;
    const safe2Start = fertileEnd ? toISO(addDays(toDate(fertileEnd), 1)) : undefined;
    const safe2End = nextPeriodStart
      ? toISO(addDays(toDate(nextPeriodStart), -1))
      : undefined;

    // Confidence panel logic
    const cyclesTracked = trackingSummary?.cyclesTracked ?? cycles.length;
    const logRate = trackingSummary?.loggingRate ?? signals.loggingRate; // 0..1
    const confidence =
      cyclesTracked >= 6 && logRate >= 0.6
        ? "High"
        : cyclesTracked >= 3 && logRate >= 0.35
        ? "Medium"
        : "Low";

    const confidenceTip =
      confidence === "High"
        ? "Great! Keep logging to improve ovulation & risk screening."
        : confidence === "Medium"
        ? "Log flow + symptoms more consistently for more accurate fertile window and screening."
        : "Track at least 3 cycles + log flow/symptoms most days for reliable predictions.";

    // Symptom severity scores (0..1)
    // Pain: based on painDays per period days (proxy)
    const denomPeriodDays = Math.max(1, signals.periodDaysCount);
    const painScore01 =
      typeof modelFeatures?.pain_score === "number"
        ? Math.min(1, Math.max(0, Number(modelFeatures.pain_score) / 3))
        : Math.min(1, signals.painDays / denomPeriodDays);
    const heavyBleedScore01 =
      typeof modelFeatures?.bleeding_volume_score === "number"
        ? Math.min(1, Math.max(0, Number(modelFeatures.bleeding_volume_score) / 4))
        : Math.min(1, signals.heavyFlowDays / denomPeriodDays);

    // Symptom severity: use symptom signal days per total logged days (proxy)
    const denomLoggedDays = Math.max(1, signals.loggedDays);
    const backendSymptomAvg =
      lastCycleSummary?.symptomSeverityAvgAllTime ?? lastCycleSummary?.symptomSeverityAvg ?? null;
    const symptomScore01 =
      typeof backendSymptomAvg === "number"
        ? Math.min(1, Math.max(0, (backendSymptomAvg - 1) / 4))
        : typeof modelFeatures?.pattern_disruption_score === "number"
        ? Math.min(1, Math.max(0, Number(modelFeatures.pattern_disruption_score) / 100))
        : Math.min(1, signals.pmsSignalDays / denomLoggedDays);

    const painSeverity = toSeverity(painScore01);
    const heavyBleedSeverity = toSeverity(heavyBleedScore01);
    const symptomSeverity = toSeverity(symptomScore01);

    // Doctor red flags checklist (computed)
    const redFlags = [
      {
        label: "Periods often last 8+ days",
        hit: periodLens.filter((n) => n >= 8).length >= 2,
      },
      {
        label: "Cycles often > 35 days",
        hit: cycleLens.filter((n) => n > 35).length >= 2,
      },
      {
        label: "Cycles often < 21 days",
        hit: cycleLens.filter((n) => n < 21).length >= 2,
      },
      {
        label: "High cycle irregularity (hard to predict ovulation)",
        hit: sd >= 6,
      },
      {
        label: "Multiple heavy flow days recorded",
        hit: signals.heavyFlowDays >= 3,
      },
      {
        label: "Repeated pain/cramps days recorded",
        hit: signals.painDays >= 3,
      },
    ];

    return {
      cyclesTracked,
      avgCycle,
      avgPeriod,
      regularityLabel,
      variationPlusMinus,
      lastStart,
      nextPeriodStart,
      estimatedOvulation,
      fertileStart,
      fertileEnd,
      safe1Start,
      safe1End,
      safe2Start,
      safe2End,
      confidence,
      confidenceTip,
      loggingRate: logRate,
      lastLoggedDate: trackingSummary?.lastLoggedDate ?? signals.lastLoggedDate,
      painSeverity,
      heavyBleedSeverity,
      symptomSeverity,
      painScore01,
      heavyBleedScore01,
      symptomScore01,
      redFlags,
    };
  }, [lastCycleSummary, modelFeatures, recentCycles, trackingSummary]);

  const llmSections = useMemo(
    () => [
      {
        title: "Observations",
        icon: TrendingUp,
        items: llmInsights?.observations ?? [],
        tone: "normal" as const,
        accent: "from-sky-500/15 to-primary/15",
      },
      {
        title: "Tips",
        icon: Sparkles,
        items: llmInsights?.tips ?? [],
        tone: "normal" as const,
        accent: "from-amber-500/15 to-coral/15",
      },
      {
        title: "Tracking Suggestions",
        icon: CheckCircle2,
        items: llmInsights?.tracking_suggestions ?? [],
        tone: "normal" as const,
        accent: "from-emerald-500/15 to-sage/20",
      },
    ],
    [llmInsights]
  );
  const insightsIsGemini = insightsSource === "gemini";
  const insightsBadgeLabel = insightsIsGemini ? "Gemini personalized" : "Rule based fallback";

  const cardVariants = {
    hidden: { opacity: 0, y: 10 },
    show: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { duration: 0.35, delay: 0.06 * i },
    }),
  };

  const sectionReveal = {
    hidden: { opacity: 0, y: 18 },
    show: { opacity: 1, y: 0, transition: { duration: 0.45 } },
  };

  // Prefer backend tracking summary when available.
  const effectiveSummary = useMemo(
    () =>
      trackingSummary ?? {
        cyclesTracked: 0,
        loggingRate: 0,
        lastLoggedDate: null,
      },
    [trackingSummary]
  );
  const hasDatabaseTracking = Boolean(trackingSummary);
  const cyclesTrackedForConfidence = effectiveSummary.cyclesTracked ?? 0;
  const patternStage = useMemo(() => {
    if (cyclesTrackedForConfidence <= 0) {
      return {
        label: "No data yet",
        chipLabel: "Database data needed",
        chipsFilled: 0,
        tone: "bg-muted text-muted-foreground border-border",
      };
    }
    if (cyclesTrackedForConfidence >= 6) {
      return {
        label: "Established",
        chipLabel: "Established Pattern Stage",
        chipsFilled: 5,
        tone: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
      };
    }
    if (cyclesTrackedForConfidence >= 3) {
      return {
        label: "Developing",
        chipLabel: "Developing Pattern Stage",
        chipsFilled: 4,
        tone: "bg-sky-500/15 text-sky-700 border-sky-500/30",
      };
    }
    return {
      label: "Emerging",
      chipLabel: "Early Pattern Stage",
      chipsFilled: 2,
      tone: "bg-amber-500/15 text-amber-700 border-amber-500/30",
    };
  }, [cyclesTrackedForConfidence]);
  const isEarlyPattern = cyclesTrackedForConfidence < 6;

  const panelConfidence = useMemo(() => {
    const cyclesTracked = effectiveSummary.cyclesTracked ?? 0;
    const logRate = effectiveSummary.loggingRate ?? 0;
    const dataConfidence: "Low" | "Moderate" | "High" =
      cyclesTracked >= 6 && logRate >= 0.6
        ? "High"
        : cyclesTracked >= 3 && logRate >= 0.35
        ? "Moderate"
        : "Low";
    const confidenceTip =
      cyclesTracked <= 0
        ? "No synced cycle history yet. Start logging daily entries to unlock personalized accuracy."
        : cyclesTracked >= 6 && logRate >= 0.6
        ? "Your logs are consistent, which improves timing and screening precision."
        : cyclesTracked >= 3 && logRate >= 0.35
        ? "You are building a useful pattern. Logging daily flow and key symptoms will improve accuracy."
        : "Patterns are still emerging. Tracking at least 3-4 cycles improves accuracy.";

    return { confidenceTip, dataConfidence };
  }, [effectiveSummary]);

  const severityCards = useMemo(() => {
    const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

    const painScore01 =
      modelFeatures?.pain_score !== undefined && modelFeatures?.pain_score !== null
        ? clamp01(Number(modelFeatures.pain_score) / 3)
        : computed.painScore01;

    const symptomAvg =
      lastCycleSummary?.symptomSeverityAvgAllTime ?? lastCycleSummary?.symptomSeverityAvg ?? null;
    const symptomScore01 =
      typeof symptomAvg === "number"
        ? clamp01((symptomAvg - 1) / 4)
        : typeof modelFeatures?.pattern_disruption_score === "number"
        ? clamp01(Number(modelFeatures.pattern_disruption_score) / 100)
        : computed.symptomScore01;
    const rawPain = Number(modelFeatures?.pain_score ?? Number.NaN);
    const painAvg10 = Number.isFinite(rawPain)
      ? Math.min(10, Math.max(0, rawPain <= 3 ? rawPain * (10 / 3) : rawPain))
      : Math.min(10, Math.max(0, computed.painScore01 * 10));

    const burdenScore10 =
      typeof extraMetrics?.hmb_impact_score === "number"
        ? Math.min(10, Math.max(0, Number(extraMetrics.hmb_impact_score)))
        : null;

    return {
      painScore01,
      painSeverity: toSeverity(painScore01),
      painAvg10,
      symptomScore01,
      symptomSeverity: toSeverity(symptomScore01),
      symptomAvg,
      burdenScore10,
    };
  }, [computed, extraMetrics, lastCycleSummary, modelFeatures]);

  const cycleSummaryHeadline = useMemo(() => {
    const variationDays = Number(modelFeatures?.cycle_length_variation ?? computed.variationPlusMinus ?? 0);
    const cvRaw = Number(modelFeatures?.cycle_variation_coeff ?? 0);
    const cvPercent = cvRaw > 0 && cvRaw <= 1 ? cvRaw * 100 : cvRaw;
    const irregular = variationDays > 7 || cvPercent > 20;
    const painText =
      severityCards.painAvg10 >= 7 ? "higher pain levels" : severityCards.painAvg10 >= 4 ? "moderate pain" : "mostly mild pain";
    const burdenLevel = extraMetrics?.hmb_burden_level ?? "low";
    const burdenText =
      burdenLevel === "high"
        ? "a higher bleeding burden"
        : burdenLevel === "medium"
        ? "a moderate bleeding burden"
        : "a low bleeding burden";
    return `Your recent cycles ${irregular ? "show some variation" : "appear fairly regular"}, with ${painText} and ${burdenText}.`;
  }, [computed.variationPlusMinus, extraMetrics?.hmb_burden_level, modelFeatures?.cycle_length_variation, modelFeatures?.cycle_variation_coeff, severityCards.painAvg10]);

  const modelConditions = useMemo<ConditionFlag[]>(() => {
    const conditionMeta: Record<string, { name: ConditionFlag["condition"]; next: string }> = {
      oligomenorrhea: {
        name: "Oligomenorrhea",
        next: "If long cycles continue for multiple months, consider discussing this with a clinician.",
      },
      polymenorrhea: {
        name: "Polymenorrhea",
        next: "If very short cycles continue, consider a clinical review.",
      },
      menorrhagia: {
        name: "Menorrhagia",
        next: "If heavy bleeding repeats across cycles, consider clinician evaluation.",
      },
      amenorrhea: {
        name: "Amenorrhea",
        next: "If periods are absent for several months, seek clinical evaluation.",
      },
      intermenstrual_bleeding: {
        name: "Intermenstrual bleeding",
        next: "If spotting continues across cycles, consider discussing with a clinician.",
      },
    };
    const cycleCount = effectiveSummary.cyclesTracked ?? 0;
    const earlyPattern = cycleCount < 6;
    const uncertaintyReason = `Pattern strength is ${
      cycleCount >= 6 ? "established" : cycleCount >= 3 ? "developing" : "emerging"
    } (${cycleCount} tracked cycle${cycleCount === 1 ? "" : "s"}).`;
    const humanSignalReason = (probability: number | null, threshold: number) => {
      if (probability === null) return "There is not enough recent data to score this condition yet.";
      return probability >= threshold
        ? "Your recent cycle patterns show a possible match for this condition."
        : "Your recent cycle patterns do not strongly match this condition.";
    };

    if (hybridTriage?.conditions?.length) {
      return hybridTriage.conditions.map((c) => {
        const probability =
          typeof c.model_probability === "number" ? Number(c.model_probability) : null;
        const threshold =
          typeof c.model_threshold === "number"
            ? Number(c.model_threshold)
            : resolveThreshold(c.label, 0.5);
        const backendReasons = Array.isArray(c.reasons) ? c.reasons.filter(Boolean) : [];
        const cleanedReasons = backendReasons.map(scrubTechnicalReason).filter(Boolean);
        const reasons = [
          humanSignalReason(probability, threshold),
          ...cleanedReasons,
          ...(earlyPattern ? [uncertaintyReason] : []),
        ].filter((reason, index, arr) => Boolean(reason) && arr.indexOf(reason) === index);

        return {
          condition: c.condition,
          status: c.final_status,
          confidence: c.final_confidence,
          reasons: reasons.length ? reasons : ["No strong signal in current data."],
          nextStep:
            typeof c.next_step === "string" && c.next_step
              ? c.next_step
              : (conditionMeta[c.label]?.next ?? "Discuss with your clinician if concerned."),
        };
      });
    }

    if (modelPredictions.length) {
      const contextActive = Boolean(extraMetrics?.context_flags?.contextActive);
      const hasHistory = !contextActive && minimumHistoryMet !== false;
      return modelPredictions.map((p) => {
        const prob = typeof p.probability === "number" ? p.probability : null;
        const threshold = resolveThreshold(p.label, p.threshold);
        const status: ConditionFlag["status"] =
          !hasHistory || prob === null
            ? "Needs more data"
            : prob >= threshold
            ? "Possible"
            : "Unlikely";
        const confidence: ConditionFlag["confidence"] =
          !hasHistory || prob === null
            ? "Low"
            : prob >= Math.max(threshold + 0.2, 0.7)
            ? "High"
            : prob >= Math.max(threshold, 0.45)
            ? "Medium"
            : "Low";

        const meta = conditionMeta[p.label] ?? {
          name: (p.label || "Condition") as any,
          next: "Discuss with your clinician if concerned.",
        };

        return {
          condition: meta.name as ConditionFlag["condition"],
          status,
          confidence,
          reasons: [
            !hasHistory
              ? "More tracking history is needed before this screening becomes reliable."
              : humanSignalReason(prob, threshold),
            ...(earlyPattern ? [uncertaintyReason] : []),
          ],
          nextStep: meta.next,
        };
      });
    }

    // Fallback to heuristic-only flags when predictions are unavailable
    if (!modelFeatures) return [];
    const contextActive = Boolean(extraMetrics?.context_flags?.contextActive);

    const needsMoreData = (modelFeatures.tracking_duration_months ?? 0) < 1;
    const trackedCycles = effectiveSummary.cyclesTracked ?? 0;
    const avgCycle = Number(modelFeatures.avg_cycle_length ?? 0);
    const avgBleed = Number(modelFeatures.avg_bleeding_days ?? 0);
    const bleedScore = Number(modelFeatures.bleeding_volume_score ?? 0);
    const intermenstrual = Number(modelFeatures.intermenstrual_episodes ?? 0);
    const heavyPattern = trackedCycles >= 2 && (avgBleed >= 8 || bleedScore >= 3);
    const spottingPersistent = intermenstrual >= 2;

    const make = (
      condition: ConditionFlag["condition"],
      hit: boolean,
      reasons: string[],
      nextStep: string
    ): ConditionFlag => {
      if (needsMoreData || contextActive) {
        return {
          condition,
          status: "Needs more data",
          confidence: "Low",
          reasons: ["Track at least 1-2 cycles for clearer signals."],
          nextStep: "Keep logging daily flow and pain for more accurate screening.",
        };
      }

      return {
        condition,
        status: hit ? "Possible" : "Unlikely",
        confidence: hit ? "Medium" : "Low",
        reasons: reasons.length ? reasons : ["No strong signal in current data."],
        nextStep,
      };
    };

    return [
      make(
        "Oligomenorrhea",
        trackedCycles >= 2 && avgCycle > 35,
        trackedCycles >= 2 && avgCycle > 35
          ? ["Longer cycle lengths are present across tracked cycles."]
          : [],
        "If cycles stay long or irregular, consider clinician evaluation."
      ),
      make(
        "Polymenorrhea",
        trackedCycles >= 2 && avgCycle > 0 && avgCycle < 21,
        trackedCycles >= 2 && avgCycle > 0 && avgCycle < 21
          ? ["Short cycle lengths are present across tracked cycles."]
          : [],
        "If cycles remain very short, consider a clinical review."
      ),
      make(
        "Menorrhagia",
        heavyPattern,
        heavyPattern
          ? ["Heavy bleeding indicators are present in at least 2 cycles."]
          : trackedCycles < 2
          ? ["Heavy bleeding patterns need at least 2 tracked cycles to confirm persistence."]
          : [],
        "If bleeding is heavy or prolonged, consider clinician evaluation."
      ),
      make(
        "Amenorrhea",
        avgBleed === 0 && (modelFeatures.tracking_duration_months ?? 0) >= 3,
        avgBleed === 0 ? ["No bleeding days detected in recent tracking history."] : [],
        "If periods are absent for months, seek clinical evaluation."
      ),
      make(
        "Intermenstrual bleeding",
        spottingPersistent,
        intermenstrual >= 2
          ? ["Spotting is logged across multiple cycles."]
          : intermenstrual === 1
          ? ["Spotting is logged in 1 cycle. Monitor if it continues."]
          : [],
        "If spotting persists, consider discussing with a clinician."
      ),
    ];
  }, [modelFeatures, modelPredictions, extraMetrics, minimumHistoryMet, hybridTriage, effectiveSummary.cyclesTracked]);

  const modelRedFlags = useMemo(() => {
    if (hybridTriage?.red_flags?.length) {
      return hybridTriage.red_flags.map((f) => ({
        label: f.label,
        hit: Boolean(f.hit),
        severity: f.severity ?? "medium",
      }));
    }

    if (!modelFeatures) return null;
    const variationDays = Number(modelFeatures.cycle_length_variation ?? 0);
    const cvRaw = Number(modelFeatures.cycle_variation_coeff ?? 0);
    const cvPercent = cvRaw > 0 && cvRaw <= 1 ? cvRaw * 100 : cvRaw;

    return [
      {
        label: "Periods often last 8+ days",
        hit: Number(modelFeatures.avg_bleeding_days ?? 0) >= 8,
        severity: "medium" as const,
      },
      {
        label: "Cycles often > 35 days",
        hit: Number(modelFeatures.avg_cycle_length ?? 0) > 35,
        severity: "medium" as const,
      },
      {
        label: "Cycles often < 21 days",
        hit:
          Number(modelFeatures.avg_cycle_length ?? 0) > 0 &&
          Number(modelFeatures.avg_cycle_length ?? 0) < 21,
        severity: "medium" as const,
      },
      {
        label: "High cycle irregularity (hard to predict ovulation)",
        hit: variationDays > 7 || cvPercent > 20,
        severity: "medium" as const,
      },
      {
        label: "High bleeding volume",
        hit: Number(modelFeatures.bleeding_volume_score ?? 0) >= 3,
        severity: "high" as const,
      },
      {
        label: "Spotting between periods",
        hit: Number(modelFeatures.intermenstrual_episodes ?? 0) >= 1,
        severity:
          Number(modelFeatures.intermenstrual_episodes ?? 0) >= 2
            ? ("high" as const)
            : ("medium" as const),
      },
    ];
  }, [modelFeatures, hybridTriage]);

  // Check for red flags and show notifications
  // Use model-derived flags only to avoid conflicts with mock/fallback data.
  useEffect(() => {
    if (!modelRedFlags) return;
    if (extraMetrics?.context_flags?.contextActive) return;
    if (modelRedFlags.length > 0) {
      checkRedFlags(modelRedFlags);
    }
  }, [modelRedFlags, extraMetrics, checkRedFlags]);

  const redFlagRows = useMemo(() => {
    const source =
      modelRedFlags ??
      computed.redFlags.map((flag) => ({
        ...flag,
        severity: flag.hit ? ("medium" as const) : ("low" as const),
      }));
    const spottingEpisodes = Number(modelFeatures?.intermenstrual_episodes ?? 0);

    return source.map((flag) => {
      const tier: RedFlagTier = !flag.hit
        ? "within_typical"
        : flag.severity === "high" || flag.severity === "critical"
        ? "consider_clinician"
        : "monitor";

      const label = String(flag.label || "").toLowerCase();
      let note = "Within typical range in your current logs.";
      if (flag.hit) {
        if (label.includes("spotting")) {
          note =
            spottingEpisodes >= 2
              ? `Spotting logged in ${spottingEpisodes} cycles. Consider clinician review if this continues.`
              : "Spotting logged in 1 cycle. Monitor if it continues.";
        } else if (label.includes("8+ days")) {
          note = "Long bleeding duration was logged. Monitor upcoming cycles for persistence.";
        } else if (label.includes("> 35")) {
          note = "Longer cycles were logged more than expected. Monitor over the next cycle.";
        } else if (label.includes("< 21")) {
          note = "Shorter cycles were logged more than expected. Monitor over the next cycle.";
        } else if (label.includes("irregularity")) {
          note = "Cycle length variability is above the typical range. Monitor trend over time.";
        } else if (label.includes("bleeding volume")) {
          note = "Higher bleeding volume was logged. Consider clinician review if this repeats.";
        } else if (label.includes("pain")) {
          note = "Pain was repeatedly logged. Monitor severity and discuss if it worsens.";
        } else {
          note = "Pattern logged in your data. Monitor if it continues.";
        }
      }

      return { ...flag, tier, note };
    });
  }, [computed.redFlags, modelFeatures?.intermenstrual_episodes, modelRedFlags]);

  const groupedScreening = useMemo(() => {
    const grouped: Record<ConditionScreeningTier, ConditionFlag[]> = {
      no_strong_signals: [],
      monitor: [],
      needs_attention: [],
    };
    const trackedCycles = effectiveSummary.cyclesTracked ?? 0;
    const spottingEpisodes = Number(modelFeatures?.intermenstrual_episodes ?? 0);
    const persistentHeavyPattern =
      trackedCycles >= 2 &&
      (Number(modelFeatures?.avg_bleeding_days ?? 0) >= 8 ||
        Number(modelFeatures?.bleeding_volume_score ?? 0) >= 3 ||
        extraMetrics?.hmb_burden_level === "high");

    modelConditions.forEach((condition) => {
      let tier: ConditionScreeningTier =
        condition.status === "High alert"
          ? "needs_attention"
          : condition.status === "Possible" || condition.status === "Needs more data"
          ? "monitor"
          : "no_strong_signals";

      let reasons = [...condition.reasons];
      if (condition.condition === "Menorrhagia" && tier !== "no_strong_signals" && !persistentHeavyPattern) {
        tier = "monitor";
        reasons = [
          "Heavy bleeding is not yet persistent across 2 cycles.",
          ...reasons.filter((reason) => !/heavy bleeding indicators are present/i.test(reason)),
        ];
      }

      if (condition.condition === "Intermenstrual bleeding") {
        if (spottingEpisodes >= 2) {
          tier = condition.status === "High alert" ? "needs_attention" : "monitor";
        } else if (spottingEpisodes === 1) {
          tier = "monitor";
          reasons = [
            "Spotting logged in 1 cycle. Monitor if it continues.",
            ...reasons.filter((reason) => !/spotting is logged in 1 cycle/i.test(reason)),
          ];
        } else if (spottingEpisodes === 0 && condition.status === "Unlikely") {
          tier = "no_strong_signals";
        }
      }

      grouped[tier].push({ ...condition, reasons });
    });

    return grouped;
  }, [effectiveSummary.cyclesTracked, extraMetrics?.hmb_burden_level, modelConditions, modelFeatures?.avg_bleeding_days, modelFeatures?.bleeding_volume_score, modelFeatures?.intermenstrual_episodes]);

  const redFlagTierLabel = (tier: RedFlagTier) => {
    if (tier === "consider_clinician") return "Consider clinician";
    if (tier === "monitor") return "Monitor";
    return "Within typical range";
  };

  const redFlagTierCardClass = (tier: RedFlagTier) => {
    if (tier === "consider_clinician") return "bg-destructive/10 border-destructive/25";
    if (tier === "monitor") return "bg-amber-500/10 border-amber-500/25";
    return "bg-emerald-500/10 border-emerald-500/25";
  };

  const redFlagTierPillClass = (tier: RedFlagTier) => {
    if (tier === "consider_clinician") return "bg-destructive/15 text-destructive border-destructive/25";
    if (tier === "monitor") return "bg-amber-500/15 text-amber-700 border-amber-500/30";
    return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30";
  };

  const conditionTierByName = useMemo(() => {
    const map = new Map<ConditionFlag["condition"], ConditionScreeningTier>();
    (["no_strong_signals", "monitor", "needs_attention"] as ConditionScreeningTier[]).forEach(
      (tier) => {
        groupedScreening[tier].forEach((condition) => {
          map.set(condition.condition, tier);
        });
      }
    );
    return map;
  }, [groupedScreening]);

  const conditionTierLabel = (tier: ConditionScreeningTier) => {
    if (tier === "needs_attention") return "Needs attention";
    if (tier === "monitor") return "Monitor";
    return "No current pattern signal";
  };

  const conditionTierPillClass = (tier: ConditionScreeningTier) => {
    if (tier === "needs_attention") return "bg-destructive/15 text-destructive border-destructive/25";
    if (tier === "monitor") return "bg-amber-500/15 text-amber-700 border-amber-500/30";
    return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30";
  };

  const dataConfidencePillClass = (confidence: "Low" | "Moderate" | "High") => {
    if (confidence === "High") return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30";
    if (confidence === "Moderate") return "bg-amber-500/15 text-amber-700 border-amber-500/30";
    return "bg-sky-500/15 text-sky-700 border-sky-500/30";
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 md:py-12 max-w-5xl">
        {/* Header */}
        <motion.section
          className="mb-8 rounded-3xl border border-border/70 bg-gradient-to-r from-background via-sky-50/40 to-emerald-50/40 dark:from-background dark:via-sky-950/20 dark:to-emerald-950/20 p-6"
          variants={sectionReveal}
          initial="hidden"
          animate="show"
        >
          <div className="flex items-center gap-3 mb-2">
            <motion.div
              className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-soft"
              animate={{ rotate: [0, 6, -6, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            >
              <TrendingUp className="w-5 h-5 text-primary-foreground" />
            </motion.div>
            <h1 className="font-serif text-3xl font-bold text-foreground">Health Insights</h1>
          </div>
          <p className="text-muted-foreground">{cycleSummaryHeadline}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium bg-sky-500/15 text-sky-700 dark:text-sky-200 border border-sky-500/25">
              <Gauge className="w-3.5 h-3.5" />
              Informational screening
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-200 border border-emerald-500/25">
              <ShieldCheck className="w-3.5 h-3.5" />
              Pattern-based safety checks
            </span>
          </div>
          {extraMetrics?.context_flags?.contextActive ? (
            <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
              Your current context (contraception, postpartum/breastfeeding, or trying to conceive) can change how
              bleeding patterns are interpreted. Screening confidence is reduced.
            </div>
          ) : null}
          <div className="mt-3 rounded-2xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-800 dark:text-sky-200">
            These insights are informational and not a diagnosis. Many cycle variations are normal.
          </div>
        </motion.section>

        {/* Confidence and Data Quality */}
        <motion.section
          className="mb-8"
          variants={sectionReveal}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
        >
          <motion.div className="glass-card p-6 animate-fade-in overflow-hidden relative border border-border/70">
            <div className="absolute inset-0 opacity-35 pointer-events-none bg-gradient-to-r from-sky-500/10 via-transparent to-emerald-500/10" />
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-sky-500 to-emerald-500" />
            <div className="relative flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0 shadow-soft">
                <Gauge className="w-6 h-6 text-sky-700 dark:text-sky-200" />
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-serif text-xl font-semibold text-foreground">
                    {patternStage.label === "No data yet"
                      ? "No synced tracking data yet"
                      : patternStage.label === "Established"
                      ? "Your tracking pattern is established"
                      : patternStage.label === "Developing"
                      ? "Your tracking pattern is developing"
                      : "Patterns are still emerging"}
                  </h2>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${patternStage.tone}`}>
                    {patternStage.chipLabel}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${dataConfidencePillClass(
                      panelConfidence.dataConfidence
                    )}`}
                  >
                    {panelConfidence.dataConfidence} data confidence
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                      hasDatabaseTracking
                        ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/25"
                        : "bg-muted text-muted-foreground border-border"
                    }`}
                  >
                    {hasDatabaseTracking ? "Database synced" : "No database summary"}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {effectiveSummary.cyclesTracked > 0
                    ? `You've logged ${effectiveSummary.cyclesTracked} cycle${
                        effectiveSummary.cyclesTracked === 1 ? "" : "s"
                      }. Tracking at least 3-4 cycles improves accuracy.`
                    : "This panel uses your database tracking summary. No synced cycles were found yet."}
                </p>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div className="px-3 py-2 rounded-xl bg-sky-500/10 border border-sky-500/20">
                    <p className="text-xs text-muted-foreground">Cycles tracked</p>
                    <p className="text-base font-semibold text-foreground">
                      {effectiveSummary.cyclesTracked}
                    </p>
                  </div>
                  <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <p className="text-xs text-muted-foreground">Logging rate</p>
                    <p className="text-base font-semibold text-foreground">
                      {`${Math.round((effectiveSummary.loggingRate ?? 0) * 100)}%`}
                    </p>
                  </div>
                  <div className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <p className="text-xs text-muted-foreground">Last logged</p>
                    <p className="text-base font-semibold text-foreground">
                      {effectiveSummary.lastLoggedDate
                        ? formatPretty(effectiveSummary.lastLoggedDate)
                        : "-"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 p-4 rounded-2xl bg-gradient-to-r from-sky-500/10 via-amber-500/10 to-emerald-500/10 border border-border">
                  <div className="flex items-start gap-2">
                    <Sparkles className="w-5 h-5 text-sky-600 dark:text-sky-300 mt-0.5" />
                    <p className="text-sm text-foreground">
                      {panelConfidence.confidenceTip}
                    </p>
                  </div>
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                      <span>Pattern strength</span>
                      <span>{patternStage.label}</span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {Array.from({ length: 5 }).map((_, idx) => (
                        <div
                          key={`pattern-strength-${idx}`}
                          className={`h-2 rounded-full ${
                            idx < patternStage.chipsFilled ? "bg-emerald-500/80" : "bg-muted/60"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-xs text-muted-foreground">
                <ShieldCheck className="w-4 h-4" />
                Pattern-based
              </div>
            </div>
          </motion.div>
        </motion.section>

        {/* Symptom Severity Scores (NO charts, just scores) */}
        <motion.section
          className="mb-8"
          variants={sectionReveal}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.15 }}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
            {/* Period Pain */}
            <motion.div
              className="glass-card p-6 animate-fade-in h-full flex flex-col"
              style={{ animationDelay: "0.06s" }}
              whileHover={{ y: -3 }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-rose-500/20 to-coral/20 flex items-center justify-center">
                  <Flame className="w-5 h-5 text-coral" />
                </div>
                <span className="text-sm font-medium text-muted-foreground">Period Pain</span>
              </div>

              <div
                className={`p-4 rounded-2xl border flex-1 flex flex-col min-h-[180px] ${severityStyles(severityCards.painSeverity)}`}
              >
                <p className="text-lg font-semibold">
                  Average pain this cycle: {severityCards.painAvg10.toFixed(1)} / 10
                </p>
                <p className="text-sm opacity-90 mt-2 flex-1">
                  {severityCards.painAvg10 >= 7
                    ? "Pain was often high."
                    : severityCards.painAvg10 >= 4
                    ? "Pain was usually moderate."
                    : "Most days were mild."}
                </p>
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium opacity-80">Details</summary>
                  <p className="text-xs mt-1 opacity-80">
                    Technical pain score: {Math.round(severityCards.painScore01 * 100)}%.
                  </p>
                </details>
                <div className="mt-3 h-2 rounded-full bg-white/40 dark:bg-white/10 overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-rose-500 to-coral"
                    initial={{ width: 0 }}
                    whileInView={{ width: `${Math.round(severityCards.painScore01 * 100)}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7, delay: 0.1 }}
                  />
                </div>
              </div>
            </motion.div>

            {/* Symptom Severity */}
            <motion.div
              className="glass-card p-6 animate-fade-in h-full flex flex-col"
              style={{ animationDelay: "0.12s" }}
              whileHover={{ y: -3 }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500/15 to-lavender/20 flex items-center justify-center">
                  <Brain className="w-5 h-5 text-purple-600 dark:text-purple-300" />
                </div>
                <span className="text-sm font-medium text-muted-foreground">Symptoms</span>
              </div>

              <div
                className={`p-4 rounded-2xl border flex-1 flex flex-col min-h-[180px] ${severityStyles(severityCards.symptomSeverity)}`}
              >
                <p className="text-lg font-semibold">
                  Average symptom intensity:{" "}
                  {typeof severityCards.symptomAvg === "number"
                    ? `${severityCards.symptomAvg.toFixed(1)} / 5`
                    : "Not enough logs yet"}
                </p>
                <p className="text-sm opacity-90 mt-2 flex-1">
                  {typeof severityCards.symptomAvg === "number"
                    ? severityCards.symptomAvg >= 4
                      ? "Symptoms were often intense."
                      : severityCards.symptomAvg >= 3
                      ? "Symptoms were mostly moderate."
                      : "Most logged symptoms were mild."
                    : "Log symptom levels (1-5) to personalize this insight."}
                </p>
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium opacity-80">Details</summary>
                  <p className="text-xs mt-1 opacity-80">
                    Technical symptom score: {Math.round(severityCards.symptomScore01 * 100)}%.
                  </p>
                </details>
                <div className="mt-3 h-2 rounded-full bg-white/40 dark:bg-white/10 overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-violet-500 to-lavender"
                    initial={{ width: 0 }}
                    whileInView={{ width: `${Math.round(severityCards.symptomScore01 * 100)}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7, delay: 0.2 }}
                  />
                </div>
              </div>
            </motion.div>

            {/* Bleeding Impact (quality-of-life) */}
            <motion.div
              className="glass-card p-6 animate-fade-in h-full flex flex-col"
              style={{ animationDelay: "0.18s" }}
              whileHover={{ y: -3 }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500/15 to-sky-500/15 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-emerald-600" />
                </div>
                <span className="text-sm font-medium text-muted-foreground">Quality-of-Life Burden</span>
              </div>

              {typeof extraMetrics?.hmb_impact_score === "number" ? (
                <div className={`p-4 rounded-2xl border flex-1 flex flex-col min-h-[180px] ${burdenStyles(extraMetrics.hmb_burden_level ?? "low")} bg-gradient-to-br from-emerald-500/10 via-sky-500/10 to-primary/10`}>
                  <p className="text-lg font-semibold">
                    Average bleeding burden this cycle: {Number(extraMetrics.hmb_impact_score).toFixed(1)} / 10
                  </p>
                  <p className="text-sm opacity-90 mt-2">
                    {extraMetrics.hmb_burden_level === "high"
                      ? "Bleeding impact appears high and may affect daily activities."
                      : extraMetrics.hmb_burden_level === "medium"
                      ? "Bleeding impact appears moderate."
                      : "Bleeding impact appears low in your current logs."}
                  </p>
                  <div className="mt-3 flex-1">
                    <div className="flex flex-wrap gap-2">
                      <span className="px-2 py-1 rounded-full text-xs bg-background/60 border border-border/70">
                        Soaked-through days: {extraMetrics.hmb_details?.soakedThroughDays ?? 0}
                      </span>
                      <span className="px-2 py-1 rounded-full text-xs bg-background/60 border border-border/70">
                        Flooding days: {extraMetrics.hmb_details?.floodingDays ?? 0}
                      </span>
                      <span className="px-2 py-1 rounded-full text-xs bg-background/60 border border-border/70">
                        Large clot days: {extraMetrics.hmb_details?.largeClotsDays ?? 0}
                      </span>
                    </div>
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs font-medium opacity-80">Details</summary>
                      <p className="text-xs mt-1 opacity-80">
                        Technical score: {Math.min(100, Math.round((extraMetrics.hmb_impact_score / 10) * 100))}%.
                        Avg product changes/day: {extraMetrics.hmb_details?.avgPadChangeCount ?? 0}. Avg impact/day:{" "}
                        {extraMetrics.hmb_details?.avgBleedingImpact ?? 0}/4.
                      </p>
                    </details>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-white/40 dark:bg-white/10 overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-emerald-500 to-sky-500"
                      initial={{ width: 0 }}
                      whileInView={{ width: `${Math.min(100, Math.round((extraMetrics.hmb_impact_score / 10) * 100))}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.7, delay: 0.2 }}
                    />
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl border flex-1 flex flex-col min-h-[180px] bg-gradient-to-br from-emerald-500/10 via-sky-500/10 to-primary/10">
                  <p className="text-lg font-semibold">Average bleeding burden this cycle: Not enough data</p>
                  <p className="text-sm text-muted-foreground mt-3 flex-1">
                    Log soaked-through, flooding, clots, product changes, and daily impact to populate this card.
                  </p>
                  <div className="mt-3 h-2 rounded-full bg-white/40 dark:bg-white/10 overflow-hidden">
                    <div className="h-full w-0 bg-gradient-to-r from-emerald-500 to-sky-500" />
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        </motion.section>

                {/* Doctor Checklist */}
        <motion.section
          className="mb-8"
          variants={sectionReveal}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.15 }}
        >
          <div className="glass-card p-6 animate-fade-in overflow-hidden relative">
            <div className="absolute inset-0 opacity-30 pointer-events-none bg-gradient-to-r from-rose-500/10 via-amber-500/10 to-primary/10" />
            <div className="relative">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-white/60 dark:bg-white/10 flex items-center justify-center shrink-0 shadow-soft">
                  <Stethoscope className="w-6 h-6 text-foreground/80" />
                </div>
                <div className="flex-1">
                  <h2 className="font-serif text-xl font-semibold text-foreground">Doctor Checklist</h2>
                  <p className="text-sm text-muted-foreground">
                    A quick triage view from your logs: within typical range, monitor, or consider clinician.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Typical cycle length is about 21-35 days for many adults; teens and perimenopause can vary.
                  </p>
                </div>
                <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-background/70 dark:bg-background/30 border border-border text-xs text-muted-foreground">
                  <AlertTriangle className="w-4 h-4 text-coral" />
                  Safety
                </div>
              </div>

              <details className="group">
                <summary className="cursor-pointer text-sm font-medium text-foreground">
                  View checklist details
                </summary>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                  {redFlagRows.map((f, idx) => (
                    <motion.div
                      key={f.label}
                      custom={idx}
                      initial="hidden"
                      whileInView="show"
                      viewport={{ once: true }}
                      variants={cardVariants}
                      className={`p-4 rounded-2xl border ${redFlagTierCardClass(f.tier)}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          {f.tier === "consider_clinician" ? (
                            <XCircle className="w-5 h-5 text-destructive mt-0.5" />
                          ) : f.tier === "monitor" ? (
                            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                          ) : (
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5" />
                          )}
                          <div>
                            <p className="font-medium text-foreground">{f.label}</p>
                            <p className="text-sm text-muted-foreground mt-1">{f.note}</p>
                          </div>
                        </div>
                        <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${redFlagTierPillClass(f.tier)}`}>
                          {redFlagTierLabel(f.tier)}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </details>

              <div className="mt-5 p-4 rounded-2xl bg-background/70 dark:bg-background/30 border border-border">
                <p className="text-sm text-foreground">
                  <span className="font-medium">Urgent:</span> seek medical care for very heavy bleeding (soaking pads hourly),
                  fainting, severe one-sided pain, or suspected pregnancy with pain/bleeding.
                </p>
              </div>
            </div>
          </div>
        </motion.section>

                {/* Condition Risk Screening */}
        <motion.section
          className="mb-8"
          variants={sectionReveal}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.15 }}
        >
          <h2 className="font-serif text-2xl font-semibold text-foreground mb-2">
            Condition Screening
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {isEarlyPattern
              ? `Patterns are still emerging from ${cyclesTrackedForConfidence} tracked cycle${
                  cyclesTrackedForConfidence === 1 ? "" : "s"
                }. Screening becomes more reliable after 3-4 cycles.`
              : "Screening only (not diagnosis), based on your tracked patterns."}
          </p>

          <div className="glass-card p-6 space-y-4">
            {modelError ? (
              <p className="text-sm text-muted-foreground">{modelError}</p>
            ) : modelConditions.length ? (
              <>
                {groupedScreening.no_strong_signals.length > 0 ? (
                  <div className="p-4 rounded-2xl border bg-emerald-500/10 border-emerald-500/20">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground">No Current Pattern Signals</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {groupedScreening.monitor.length === 0 && groupedScreening.needs_attention.length === 0
                            ? "No concerning pattern signals are currently detected for common cycle disorders."
                            : "No concerning cycle pattern is currently detected for these conditions."}
                        </p>
                      </div>
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5" />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {groupedScreening.no_strong_signals.map((condition) => (
                        <span
                          key={`no-signal-${condition.condition}`}
                          className="px-2 py-1 rounded-full text-xs bg-background/70 border border-emerald-500/25"
                        >
                          {condition.condition}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {groupedScreening.monitor.length > 0 ? (
                  <div className="p-4 rounded-2xl border bg-amber-500/10 border-amber-500/25">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground">Monitor</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Some patterns are worth watching over the next cycle or two.
                        </p>
                      </div>
                      <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {groupedScreening.monitor.map((condition) => (
                        <span
                          key={`monitor-${condition.condition}`}
                          className="px-2 py-1 rounded-full text-xs bg-background/70 border border-amber-500/30"
                        >
                          {condition.condition}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {groupedScreening.needs_attention.length > 0 ? (
                  <div className="p-4 rounded-2xl border bg-destructive/10 border-destructive/25">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground">Needs Attention</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          These patterns may need clinician review, especially if symptoms are worsening.
                        </p>
                      </div>
                      <XCircle className="w-5 h-5 text-destructive mt-0.5" />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {groupedScreening.needs_attention.map((condition) => (
                        <span
                          key={`attention-${condition.condition}`}
                          className="px-2 py-1 rounded-full text-xs bg-background/70 border border-destructive/30"
                        >
                          {condition.condition}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                <details className="mt-2">
                  <summary className="cursor-pointer text-sm font-medium text-foreground">
                    Show condition-by-condition details
                  </summary>
                  <div className="space-y-3 mt-3">
                    {modelConditions.map((c, idx) => {
                      const tier = conditionTierByName.get(c.condition) ?? "monitor";
                      return (
                        <motion.div
                          key={c.condition}
                          custom={idx}
                          initial="hidden"
                          whileInView="show"
                          viewport={{ once: true }}
                          variants={cardVariants}
                          className="p-4 rounded-2xl bg-gradient-to-r from-background/80 via-background/65 to-background/80 border border-border/60"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-foreground">{c.condition}</p>
                              <p className="text-sm text-muted-foreground mt-1">{c.nextStep}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Based on recent tracked cycles.
                              </p>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${conditionTierPillClass(tier)}`}>
                              {conditionTierLabel(tier)}
                            </span>
                          </div>
                          <ul className="mt-3 space-y-1 text-sm text-foreground/90 list-disc pl-5">
                            {c.reasons.slice(0, 2).map((r, reasonIndex) => (
                              <li key={`${c.condition}-reason-${reasonIndex}`}>{r}</li>
                            ))}
                          </ul>
                        </motion.div>
                      );
                    })}
                  </div>
                </details>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Sign in and log data to see screening results.</p>
            )}
          </div>
        </motion.section>

        {/* Personalized Insights */}
        <motion.section
          className="mb-8"
          variants={sectionReveal}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.15 }}
        >
          <div className="glass-card p-6 border border-border/70 bg-gradient-to-br from-rose-100/40 via-amber-100/35 to-sky-100/40 relative overflow-hidden">
            <motion.div
              aria-hidden
              className="absolute -top-16 right-24 w-40 h-40 rounded-full bg-amber-400/20 blur-3xl pointer-events-none"
              animate={{ y: [0, -8, 0], x: [0, 5, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-rose-500/85 text-white flex items-center justify-center shadow-soft">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-serif text-2xl font-semibold text-foreground">Personalized Insights</h2>
                  <p className="text-sm text-muted-foreground">Based on your last 3 months of tracking</p>
                </div>
              </div>
              <span className="text-xs px-3 py-1 rounded-full border border-border/70 bg-background/70 text-muted-foreground">
                {insightsBadgeLabel}
              </span>
            </div>

            {insightsLoading && <p className="text-sm text-muted-foreground">Loading insights...</p>}
            {insightsError && <p className="text-sm text-destructive">{insightsError}</p>}

            {llmInsights && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {llmSections
                  .filter((section) => section.items.length > 0)
                  .map((section, i) => {
                    const Icon = section.icon;
                    return (
                      <motion.div
                        key={section.title}
                        custom={i}
                        initial="hidden"
                        animate="show"
                        variants={cardVariants}
                        whileHover={{ y: -2 }}
                        className="rounded-2xl border border-border/70 p-4 bg-background/90 shadow-soft"
                      >
                        <div className="flex items-center gap-2.5 mb-3">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-rose-100 border border-rose-200">
                            <Icon className="w-4 h-4 text-rose-600" />
                          </div>
                          <p className="text-base font-semibold text-foreground">{section.title}</p>
                        </div>
                        <ul className="space-y-2.5 text-sm text-foreground/90">
                          {section.items.slice(0, 4).map((item, idx) => (
                            <li key={`${section.title}-${idx}`} className="flex gap-2 leading-relaxed">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-1 shrink-0" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </motion.div>
                    );
                  })}
              </div>
            )}
          </div>
        </motion.section>

        {/* Removed: Last 3 Cycles Tracking Detail (requested) */}

      </div>
    </Layout>
  );
};

export default Insights;




