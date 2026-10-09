import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  Moon,
  MoonStar,
  CloudMoon,
  CloudOff,
  Smile,
  Meh,
  Frown,
  Angry,
  AlertCircle,
  Dumbbell,
  HeartPulse,
  Flower2,
  Footprints,
  Waves,
  Sofa,
  Brain,
  Timer,
  Activity,
  Droplets,
  Palette,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  X,
  MapPin,
  Pill,
  Flame,
  StretchHorizontal,
  BedDouble,
} from "lucide-react";

import Layout from "@/components/layout/Layout";
import { moods, sleepOptions, exerciseOptions } from "@/lib/cycleData";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

const API_ROOT =
  (import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "http://localhost:5000").replace(
    /\/api$/,
    ""
  );
const API_BASE = `${API_ROOT}/api/daily-entries`;

const iconMap: { [key: string]: React.ComponentType<{ className?: string }> } = {
  Smile,
  Meh,
  Frown,
  Angry,
  AlertCircle,
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
  Brain,
  Timer,
  Activity,
  Droplets,
  Palette,
  Sparkles,
  MapPin,
  Pill,
  Flame,
  StretchHorizontal,
  BedDouble,
};

type ExerciseMap = Record<string, number>;
type SymptomLevel = "very_low" | "low" | "moderate" | "high" | "very_high";
type SymptomLevelMap = Record<string, SymptomLevel>;

type PainTiming = "before_bleeding" | "during_bleeding" | "after_bleeding" | "not_sure";
type ReliefHelped = "not" | "some" | "a_lot";

const bounce = {
  tap: { scale: 0.96 },
  selected: { scale: [1, 1.06, 1], transition: { duration: 0.22 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatYmdLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayYmdLocal(): string {
  return formatYmdLocal(new Date());
}

function parseYmdLocal(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function detectPhase(cycleDay: number, cycleLength: number, periodLength: number): string {
  const day = clampNumber(Math.round(cycleDay), 1, cycleLength);
  const period = clampNumber(Math.round(periodLength), 1, Math.min(14, cycleLength));
  const ovulationCenter = Math.max(period + 1, cycleLength - 14);
  const ovulationStart = Math.max(period + 1, ovulationCenter - 1);
  const ovulationEnd = Math.min(cycleLength, ovulationCenter + 1);

  if (day <= period) return "menstrual";
  if (day >= ovulationStart && day <= ovulationEnd) return "ovulation";
  if (day < ovulationStart) return "follicular";
  return "luteal";
}

function detectCycleMeta(
  entryDate: string,
  lastPeriodStart: string,
  cycleLength: number,
  periodLength: number
): { cycleNumber: number; cycleDay: number; phase: string } | null {
  const entry = parseYmdLocal(entryDate);
  const last = parseYmdLocal(lastPeriodStart);
  if (!entry || !last) return null;

  const daysDiff = Math.floor((entry.getTime() - last.getTime()) / (24 * 60 * 60 * 1000));
  if (daysDiff < 0) {
    return {
      cycleNumber: 1,
      cycleDay: 1,
      phase: detectPhase(1, cycleLength, periodLength),
    };
  }

  const cycleNumber = Math.floor(daysDiff / cycleLength) + 1;
  const cycleDay = (daysDiff % cycleLength) + 1;
  return {
    cycleNumber,
    cycleDay,
    phase: detectPhase(cycleDay, cycleLength, periodLength),
  };
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data?.message || data?.error || `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

/** ✅ Minimal “color-only” palette options (realistic shades) */
const flowColorOptions: Array<{
  value: string;
  label: string;
  swatch: string;
  ring: string;
  tint: string;
}> = [
  { value: "bright_red", label: "Bright red", swatch: "bg-red-600", ring: "ring-red-500/60", tint: "bg-red-500/10" },
  {
    value: "dark_brown_dark_red",
    label: "Dark red / brown",
    swatch: "bg-rose-950",
    ring: "ring-rose-900/60",
    tint: "bg-rose-950/10",
  },
  { value: "light_red", label: "Light red", swatch: "bg-rose-300", ring: "ring-rose-300/70", tint: "bg-rose-300/10" },
  { value: "grey", label: "Grey", swatch: "bg-slate-400", ring: "ring-slate-400/70", tint: "bg-slate-400/10" },
  { value: "black", label: "Very dark / black", swatch: "bg-zinc-950", ring: "ring-zinc-700/70", tint: "bg-zinc-950/10" },
  { value: "orange", label: "Orange", swatch: "bg-orange-400", ring: "ring-orange-400/70", tint: "bg-orange-400/10" },
  { value: "yellow", label: "Yellow", swatch: "bg-amber-300", ring: "ring-amber-300/80", tint: "bg-amber-300/10" },
  { value: "other", label: "Other", swatch: "bg-stone-400", ring: "ring-stone-400/70", tint: "bg-stone-400/10" },
];

const flowVolumeOptions = [
  { value: "spotting_very_light", label: "Spotting / Very light" },
  { value: "somewhat_light", label: "Somewhat light" },
  { value: "light", label: "Light" },
  { value: "moderate", label: "Moderate" },
  { value: "somewhat_heavy", label: "Somewhat heavy" },
  { value: "heavy", label: "Heavy" },
];

const symptomSeverityOptions: Array<{ value: SymptomLevel; label: string; chip: string; ring: string }> = [
  { value: "very_low", label: "Very low", chip: "bg-sky-500/10 text-sky-700 dark:text-sky-300", ring: "ring-sky-400/40" },
  { value: "low", label: "Low", chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", ring: "ring-emerald-400/40" },
  { value: "moderate", label: "Moderate", chip: "bg-amber-500/10 text-amber-700 dark:text-amber-300", ring: "ring-amber-400/40" },
  { value: "high", label: "High", chip: "bg-orange-500/10 text-orange-700 dark:text-orange-300", ring: "ring-orange-400/40" },
  { value: "very_high", label: "Very high", chip: "bg-rose-500/10 text-rose-700 dark:text-rose-300", ring: "ring-rose-400/40" },
];

const symptomTagPool = [
  "appetite change",
  "headaches",
  "cramps",
  "sore breast",
  "fatigue",
  "mood swing",
  "food cravings",
  "bloating",
  "nausea",
  "back pain",
  "acne",
  "spotting",
  "constipation",
  "diarrhea",
  "anxiety",
  "dizziness",
  "insomnia",
];

/** Pain map areas */
const painAreas: Array<{ key: string; label: string }> = [
  { key: "lower_abdomen", label: "Lower abdomen" },
  { key: "left_pelvis", label: "Left pelvis" },
  { key: "right_pelvis", label: "Right pelvis" },
  { key: "lower_back", label: "Lower back" },
  { key: "legs", label: "Legs" },
  { key: "head", label: "Head" },
];

const painTimingOptions: Array<{ value: PainTiming; label: string }> = [
  { value: "before_bleeding", label: "Before bleeding" },
  { value: "during_bleeding", label: "During bleeding" },
  { value: "after_bleeding", label: "After bleeding" },
  { value: "not_sure", label: "Not sure" },
];

const reliefOptions: Array<{ key: string; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: "painkiller", label: "Painkiller", icon: Pill },
  { key: "heating_pad", label: "Heating pad", icon: Flame },
  { key: "stretching", label: "Stretching", icon: StretchHorizontal },
  { key: "rest", label: "Rest", icon: BedDouble },
];

const reliefHelpedOptions: Array<{ value: ReliefHelped; label: string; ring: string; bg: string }> = [
  { value: "not", label: "Not", ring: "ring-rose-400/40", bg: "bg-rose-500/10" },
  { value: "some", label: "Some", ring: "ring-amber-400/40", bg: "bg-amber-500/10" },
  { value: "a_lot", label: "A lot", ring: "ring-emerald-400/40", bg: "bg-emerald-500/10" },
];

const phaseOptions: Array<{ value: string; label: string; chip: string; ring: string }> = [
  { value: "menstrual", label: "Menstrual", chip: "bg-rose-500/10 text-rose-700 dark:text-rose-300", ring: "ring-rose-400/40" },
  { value: "follicular", label: "Follicular", chip: "bg-sky-500/10 text-sky-700 dark:text-sky-300", ring: "ring-sky-400/40" },
  { value: "ovulation", label: "Ovulation", chip: "bg-amber-500/10 text-amber-700 dark:text-amber-300", ring: "ring-amber-400/40" },
  { value: "luteal", label: "Luteal", chip: "bg-violet-500/10 text-violet-700 dark:text-violet-300", ring: "ring-violet-400/40" },
];

/** ========== Small reusable “module shell” (compact, not long page) ========== */
function ModuleShell({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-card p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary/70 to-fuchsia-500/60 flex items-center justify-center shadow-soft">
            <Icon className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h2 className="font-serif text-xl font-semibold text-foreground">{title}</h2>
            {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

/** ========== Color-only palette (labels only on hover) ========== */
function ColorPalette({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: typeof flowColorOptions;
}) {
  return (
    <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
      {options.map((opt) => {
        const isSelected = value === opt.value;
        return (
          <motion.button
            key={opt.value}
            whileTap="tap"
            animate={isSelected ? "selected" : undefined}
            variants={bounce}
            onClick={() => onChange(isSelected ? "" : opt.value)}
            className={cx(
              "group relative aspect-square rounded-2xl border-2 transition-all duration-300",
              "flex items-center justify-center overflow-hidden",
              isSelected ? `border-transparent ring-2 ${opt.ring} ${opt.tint} shadow-soft` : "border-border hover:border-primary/30"
            )}
            aria-label={opt.label}
          >
            <span className={cx("w-10 h-10 rounded-2xl border border-border/60 shadow-inner", opt.swatch)} />
            <span className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent opacity-60 pointer-events-none" />

            {isSelected && (
              <span className="absolute top-2 right-2 w-7 h-7 rounded-full bg-gradient-to-br from-primary to-fuchsia-500 flex items-center justify-center shadow-soft">
                <Check className="w-4 h-4 text-primary-foreground" />
              </span>
            )}

            <span
              className={cx(
                "pointer-events-none absolute -bottom-2 left-1/2 -translate-x-1/2 translate-y-full",
                "opacity-0 group-hover:opacity-100 group-hover:translate-y-0",
                "transition-all duration-200",
                "px-2.5 py-1 rounded-full text-[11px] font-semibold",
                "bg-foreground text-background shadow-soft whitespace-nowrap"
              )}
            >
              {opt.label}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}

export default function Tracking() {
  // ✅ “modules” navigation to reduce page length
  const steps = useMemo(
    () => [
      { key: "cycle", label: "Cycle Data", icon: Timer },
      { key: "flow", label: "Flow", icon: Droplets },
      { key: "pain", label: "Pain & Relief", icon: MapPin }, // ✅ NEW
      { key: "mood", label: "Mood", icon: Smile },
      { key: "sleep", label: "Sleep", icon: Moon },
      { key: "exercise", label: "Exercise", icon: Dumbbell },
      { key: "symptoms", label: "Symptoms", icon: Brain },
    ],
    []
  );

  const [activeStep, setActiveStep] = useState<string>("cycle");
  const stepIndex = useMemo(() => steps.findIndex((s) => s.key === activeStep), [steps, activeStep]);

  // ====== State ======
  const [cycleLengthValue, setCycleLengthValue] = useState<number>(28);
  const [periodLengthValue, setPeriodLengthValue] = useState<number>(5);
  const [cycleDayValue, setCycleDayValue] = useState<number>(1);
  const [phaseValue, setPhaseValue] = useState<string>("menstrual");
  const [phaseManuallyEdited, setPhaseManuallyEdited] = useState<boolean>(false);
  const [lastPeriodStartValue, setLastPeriodStartValue] = useState<string>("");

  const [flowVolume, setFlowVolume] = useState<string>("");
  const [flowColor, setFlowColor] = useState<string>("");
  const [soakedThrough, setSoakedThrough] = useState(false);
  const [flooding, setFlooding] = useState(false);
  const [largeClots, setLargeClots] = useState(false);
  const [padChangeCount, setPadChangeCount] = useState<number>(0);
  const [bleedingImpact, setBleedingImpact] = useState<number>(0);
  const [periodStartOverride, setPeriodStartOverride] = useState(false);
  const [periodEndOverride, setPeriodEndOverride] = useState(false);

  const [selectedMood, setSelectedMood] = useState<string>("");
  const [moodScore, setMoodScore] = useState<number[]>([5]);

  const [selectedSleep, setSelectedSleep] = useState<string>("");
  const [sleepHours, setSleepHours] = useState<number[]>([7]);

  const [selectedExercises, setSelectedExercises] = useState<string[]>([]);
  const [exerciseMinutesByType, setExerciseMinutesByType] = useState<ExerciseMap>({});

  const totalExerciseMinutes = useMemo(() => {
    if (selectedExercises.includes("none")) return 0;
    return selectedExercises.reduce((sum, ex) => sum + (exerciseMinutesByType[ex] ?? 0), 0);
  }, [selectedExercises, exerciseMinutesByType]);

  const [selectedSymptomTags, setSelectedSymptomTags] = useState<string[]>([]);
  const [symptomLevelByTag, setSymptomLevelByTag] = useState<SymptomLevelMap>({});

  // ✅ Pain & Relief state
  const [painIntensity, setPainIntensity] = useState<number[]>([0]); // 0–10
  const [painSelectedAreas, setPainSelectedAreas] = useState<string[]>([]);
  const [painTiming, setPainTiming] = useState<PainTiming | "">(""); // required when pain > 0
  const [reliefUsed, setReliefUsed] = useState<string[]>([]);
  const [reliefHelped, setReliefHelped] = useState<ReliefHelped | "">("");
  const [isUpdatingExisting, setIsUpdatingExisting] = useState<boolean>(false);

  const today = new Date();
  const [entryDate, setEntryDate] = useState<string>(formatYmdLocal(today));

  const todayLabel = today.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    let cancelled = false;

    const applyDetected = (lastPeriodStart: string, cycleLength: number, periodLength: number) => {
      const detected = detectCycleMeta(entryDate, lastPeriodStart, cycleLength, periodLength);
      if (!detected) return;
      setCycleDayValue(detected.cycleDay);
      setPhaseValue(detected.phase);
      setPhaseManuallyEdited(false);
    };

    fetch(`${API_ROOT}/api/user/settings`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(await parseError(res));
        return res.json();
      })
      .then((settings) => {
        if (cancelled) return;

        const nextCycleLength = clampNumber(Number(settings?.cycleLengthDays) || 28, 15, 60);
        const nextPeriodLength = clampNumber(Number(settings?.periodLengthDays) || 5, 1, 14);
        const nextLastPeriodStart = typeof settings?.lastPeriodStart === "string" ? settings.lastPeriodStart : "";

        setCycleLengthValue(nextCycleLength);
        setPeriodLengthValue(nextPeriodLength);
        setLastPeriodStartValue(nextLastPeriodStart);

        if (nextLastPeriodStart) {
          applyDetected(nextLastPeriodStart, nextCycleLength, nextPeriodLength);
        } else {
          setCycleDayValue(1);
          setPhaseValue(detectPhase(1, nextCycleLength, nextPeriodLength));
          setPhaseManuallyEdited(false);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setCycleDayValue(1);
      });

    return () => {
      cancelled = true;
    };
  }, [entryDate]);

  useEffect(() => {
    if (phaseManuallyEdited) return;
    setPhaseValue(detectPhase(cycleDayValue, cycleLengthValue, periodLengthValue));
  }, [cycleDayValue, cycleLengthValue, periodLengthValue, phaseManuallyEdited]);

  // ====== Helpers ======
  const toggleMood = (mood: string) => {
    setSelectedMood((prev) => (prev === mood ? "" : mood));
    setMoodScore([5]);
  };

  const toggleSleep = (sleep: string) => setSelectedSleep((prev) => (prev === sleep ? "" : sleep));

  const toggleExercise = (exercise: string) => {
    if (exercise === "none") {
      setSelectedExercises(["none"]);
      setExerciseMinutesByType({});
      return;
    }

    setSelectedExercises((prev) => {
      const withoutNone = prev.filter((e) => e !== "none");

      if (withoutNone.includes(exercise)) {
        setExerciseMinutesByType((m) => {
          const copy = { ...m };
          delete copy[exercise];
          return copy;
        });
        return withoutNone.filter((e) => e !== exercise);
      }

      setExerciseMinutesByType((m) => ({ ...m, [exercise]: m[exercise] ?? 30 }));
      return [...withoutNone, exercise];
    });
  };

  const toggleSymptomTag = (sym: string) => {
    setSelectedSymptomTags((prev) => {
      const isSelected = prev.includes(sym);

      if (isSelected) {
        setSymptomLevelByTag((m) => {
          const copy = { ...m };
          delete copy[sym];
          return copy;
        });
        return prev.filter((s) => s !== sym);
      }

      setSymptomLevelByTag((m) => ({ ...m, [sym]: "very_low" }));
      return [...prev, sym];
    });
  };

  const setSymptomLevel = (sym: string, value: SymptomLevel) =>
    setSymptomLevelByTag((m) => ({ ...m, [sym]: value }));

  const togglePainArea = (key: string) => {
    setPainSelectedAreas((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
  };

  const toggleRelief = (key: string) => {
    setReliefUsed((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
  };

  // ✅ enforce: if painIntensity becomes 0 → clear timing/areas/relief
  const onPainIntensityChange = (v: number[]) => {
    setPainIntensity(v);
    if ((v?.[0] ?? 0) <= 0) {
      setPainTiming("");
      setPainSelectedAreas([]);
      setReliefUsed([]);
      setReliefHelped("");
    }
  };

  const handleSave = async () => {
    const todayYmd = todayYmdLocal();
    if (entryDate > todayYmd) {
      alert("You cannot log a future date. Please select today or an earlier date.");
      setEntryDate(todayYmd);
      return;
    }

    // ✅ required: painTiming if pain > 0
    if ((painIntensity[0] ?? 0) > 0 && !painTiming) {
      alert("Please select when the pain started (Before / During / After bleeding).");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      alert("You must be logged in to save a daily entry.");
      return;
    }

    try {
      const checkRes = await fetch(`${API_BASE}/${entryDate}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (checkRes.ok) {
        const existing = await checkRes.json();
        const exists = !!existing?.data;
        setIsUpdatingExisting(exists);
        if (exists) {
          const ok = window.confirm(
            `You already logged ${entryDate}. Update this entry?`
          );
          if (!ok) return;
        }
      }
    } catch {
      // If lookup fails, still attempt save
    }

    const payload = {
      entryDate,
      cycleLength: clampNumber(Math.round(cycleLengthValue || 28), 15, 60),
      phase: phaseValue || null,
      flowVolume: flowVolume || null,
      flowColor: flowColor || null,
      soakedThrough,
      flooding,
      largeClots,
      padChangeCount: Number.isFinite(padChangeCount) ? padChangeCount : null,
      bleedingImpact: Number.isFinite(bleedingImpact) ? bleedingImpact : null,
      periodStartOverride,
      periodEndOverride,
      mood: {
        selectedMood: selectedMood || null,
        moodScore: selectedMood ? moodScore[0] ?? null : null,
      },
      sleep: {
        selectedSleep: selectedSleep || null,
        sleepHours: selectedSleep ? sleepHours[0] ?? null : null,
      },
      exercises: {
        selectedExercises,
        exerciseMinutesByType,
      },
      totalExerciseMinutes,
      symptoms: {
        selectedSymptomTags,
        symptomLevelByTag,
      },
      pain: {
        painIntensity: painIntensity[0] ?? 0,
        painSelectedAreas,
        painTiming: painTiming || null,
        reliefUsed,
        reliefHelped: reliefHelped || null,
      },
    };

    fetch(API_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(await parseError(res));
        }
        return res.json();
      })
      .then(() => {
        alert("Daily entry saved ✅");
        setIsUpdatingExisting(false);
      })
      .catch((err) => {
        alert(err?.message || "Failed to save daily entry");
      });
  };

  const goPrev = () => setActiveStep(steps[Math.max(0, stepIndex - 1)].key);
  const goNext = () => setActiveStep(steps[Math.min(steps.length - 1, stepIndex + 1)].key);

  const StepIcon = steps[stepIndex]?.icon ?? Activity;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 md:py-12 max-w-5xl">
        {/* Header */}
        <motion.section variants={fadeUp} initial="hidden" animate="show" className="mb-6">
          <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-r from-primary/20 via-fuchsia-500/15 to-amber-500/15 p-6 shadow-soft">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary to-fuchsia-500 flex items-center justify-center shadow-soft">
                <Sparkles className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="font-serif text-3xl font-bold text-foreground">Daily Tracking</h1>
                <p className="text-muted-foreground">{todayLabel}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div className="text-sm text-muted-foreground">Entry date</div>
              <input
                type="date"
                value={entryDate}
                max={todayYmdLocal()}
                onChange={(e) => {
                  const value = e.target.value;
                  const todayYmd = todayYmdLocal();
                  setEntryDate(value > todayYmd ? todayYmd : value);
                }}
                className="rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <button
                type="button"
                onClick={() => setEntryDate(formatYmdLocal(new Date()))}
                className="text-xs font-semibold text-muted-foreground hover:text-foreground underline"
              >
                Use today
              </button>
            </div>
            {isUpdatingExisting && (
              <p className="mt-2 text-xs text-amber-600">
                Updating existing entry for this date.
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {steps.map((s) => {
                const Icon = s.icon;
                const active = s.key === activeStep;
                return (
                  <button
                    key={s.key}
                    onClick={() => setActiveStep(s.key)}
                    className={cx(
                      "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                      active
                        ? "border-transparent bg-foreground text-background shadow-soft"
                        : "border-border/60 bg-background/60 text-muted-foreground hover:text-foreground hover:bg-muted/30"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        </motion.section>

        {/* ✅ Single module area */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeStep}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            {activeStep === "cycle" && (
              <ModuleShell
                title="Cycle Data"
                subtitle="Defaults come from your saved settings. You can edit these before logging flow."
                icon={Timer}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="rounded-2xl border border-border/60 bg-background/40 p-4">
                    <span className="text-xs text-muted-foreground">Cycle length (days)</span>
                    <input
                      type="number"
                      min={15}
                      max={60}
                      value={cycleLengthValue}
                      onChange={(e) => setCycleLengthValue(clampNumber(Number(e.target.value) || 28, 15, 60))}
                      className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </label>

                  <label className="rounded-2xl border border-border/60 bg-background/40 p-4">
                    <span className="text-xs text-muted-foreground">Period length (days)</span>
                    <input
                      type="number"
                      min={1}
                      max={14}
                      value={periodLengthValue}
                      onChange={(e) =>
                        setPeriodLengthValue(clampNumber(Number(e.target.value) || 5, 1, Math.min(14, cycleLengthValue)))
                      }
                      className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </label>

                  <label className="rounded-2xl border border-border/60 bg-background/40 p-4">
                    <span className="text-xs text-muted-foreground">Current cycle day</span>
                    <input
                      type="number"
                      min={1}
                      max={cycleLengthValue}
                      value={cycleDayValue}
                      onChange={(e) =>
                        setCycleDayValue(clampNumber(Number(e.target.value) || 1, 1, Math.max(1, cycleLengthValue)))
                      }
                      className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </label>
                </div>

                <div className="mt-4 rounded-2xl border border-border/60 bg-gradient-to-r from-primary/10 to-amber-500/10 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Detected phase</p>
                      <p className="text-sm font-semibold text-foreground capitalize">{phaseValue}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {phaseOptions.map((opt) => {
                      const isSelected = phaseValue === opt.value;
                      return (
                        <motion.button
                          key={opt.value}
                          whileTap="tap"
                          animate={isSelected ? "selected" : undefined}
                          variants={bounce}
                          onClick={() => {
                            setPhaseValue(opt.value);
                            setPhaseManuallyEdited(true);
                          }}
                          className={cx(
                            "rounded-2xl border-2 px-3 py-2 text-xs font-semibold transition-all",
                            isSelected
                              ? `border-transparent ring-2 ${opt.ring} ${opt.chip} shadow-soft`
                              : "border-border text-muted-foreground hover:border-primary/30 hover:bg-muted/40"
                          )}
                        >
                          {opt.label}
                        </motion.button>
                      );
                    })}
                  </div>

                  <p className="mt-2 text-xs text-muted-foreground">
                    {lastPeriodStartValue
                      ? `Auto-calculated from last period start: ${lastPeriodStartValue}`
                      : "No saved last period start found. Using default cycle values."}
                  </p>
                </div>
              </ModuleShell>
            )}

            {/* ====================== FLOW ====================== */}
            {activeStep === "flow" && (
              <ModuleShell title="Flow" subtitle="Volume + color (hover to see name)" icon={Droplets}>
                <p className="text-sm text-muted-foreground mb-3">Flow volume</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                  {flowVolumeOptions.map((opt) => {
                    const isSelected = flowVolume === opt.value;
                    return (
                      <motion.button
                        key={opt.value}
                        whileTap="tap"
                        animate={isSelected ? "selected" : undefined}
                        variants={bounce}
                        onClick={() => setFlowVolume(isSelected ? "" : opt.value)}
                        className={cx(
                          "p-4 rounded-2xl border-2 transition-all duration-300",
                          isSelected
                            ? "border-transparent ring-2 ring-primary/40 bg-primary/10 shadow-soft"
                            : "border-border hover:border-primary/50 hover:bg-muted/50"
                        )}
                      >
                        <p className="text-sm font-semibold text-foreground">{opt.label}</p>
                      </motion.button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Palette className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Flow color (color only)</p>
                  </div>

                  {flowColor && (
                    <button
                      onClick={() => setFlowColor("")}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-4 h-4" />
                      Clear
                    </button>
                  )}
                </div>

                <ColorPalette value={flowColor} onChange={setFlowColor} options={flowColorOptions} />

                <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-3xl border border-border/60 bg-background/40 p-5">
                    <p className="text-sm text-muted-foreground mb-3">Heavy bleeding signals (optional)</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        { key: "soaked", label: "Soaked through in <2 hours", value: soakedThrough, set: setSoakedThrough },
                        { key: "flooding", label: "Flooding / leaked onto clothes/bedding", value: flooding, set: setFlooding },
                        { key: "clots", label: "Large clots", value: largeClots, set: setLargeClots },
                      ].map((opt) => (
                        <motion.button
                          key={opt.key}
                          whileTap="tap"
                          animate={opt.value ? "selected" : undefined}
                          variants={bounce}
                          onClick={() => opt.set(!opt.value)}
                          className={cx(
                            "p-3 rounded-2xl border-2 transition-all duration-300 text-left",
                            opt.value
                              ? "border-transparent ring-2 ring-rose-400/40 bg-rose-500/10 shadow-soft"
                              : "border-border hover:border-rose-400/30 hover:bg-muted/30"
                          )}
                        >
                          <p className="text-sm font-semibold text-foreground">{opt.label}</p>
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-border/60 bg-background/40 p-5">
                    <p className="text-sm text-muted-foreground mb-3">Impact & product changes (optional)</p>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-muted-foreground">Changed pad/tampon/cup</span>
                          <span className="font-semibold text-foreground">{padChangeCount} times</span>
                        </div>
                        <Slider value={[padChangeCount]} onValueChange={(v) => setPadChangeCount(v[0])} max={20} min={0} step={1} />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-muted-foreground">How much did bleeding affect your day?</span>
                          <span className="font-semibold text-foreground">{bleedingImpact} / 4</span>
                        </div>
                        <Slider value={[bleedingImpact]} onValueChange={(v) => setBleedingImpact(v[0])} max={4} min={0} step={1} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 rounded-3xl border border-border/60 bg-background/40 p-5">
                  <p className="text-sm text-muted-foreground mb-3">Period overrides (optional)</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <motion.button
                      whileTap="tap"
                      animate={periodStartOverride ? "selected" : undefined}
                      variants={bounce}
                      onClick={() => setPeriodStartOverride(!periodStartOverride)}
                      className={cx(
                        "p-3 rounded-2xl border-2 transition-all duration-300 text-left",
                        periodStartOverride
                          ? "border-transparent ring-2 ring-primary/40 bg-primary/10 shadow-soft"
                          : "border-border hover:border-primary/30 hover:bg-muted/30"
                      )}
                    >
                      <p className="text-sm font-semibold text-foreground">Period started today</p>
                    </motion.button>
                    <motion.button
                      whileTap="tap"
                      animate={periodEndOverride ? "selected" : undefined}
                      variants={bounce}
                      onClick={() => setPeriodEndOverride(!periodEndOverride)}
                      className={cx(
                        "p-3 rounded-2xl border-2 transition-all duration-300 text-left",
                        periodEndOverride
                          ? "border-transparent ring-2 ring-primary/40 bg-primary/10 shadow-soft"
                          : "border-border hover:border-primary/30 hover:bg-muted/30"
                      )}
                    >
                      <p className="text-sm font-semibold text-foreground">Period ended today</p>
                    </motion.button>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Use these if your period started/ended with spotting or irregular flow.
                  </p>
                </div>

                <p className="mt-4 text-xs text-muted-foreground">Tip: hover a color to see its name.</p>
              </ModuleShell>
            )}

            {/* ====================== PAIN & RELIEF ✅ NEW (REPLACES NOTES) ====================== */}
            {activeStep === "pain" && (
              <ModuleShell title="Pain & Relief" subtitle="Where it hurts, when it started, and what helps" icon={MapPin}>
                {/* Intensity */}
                <div className="rounded-3xl border border-border/60 bg-gradient-to-r from-rose-500/10 via-amber-500/10 to-primary/10 p-5">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-muted-foreground">Pain intensity</span>
                    <span className="font-semibold text-foreground">{painIntensity[0]} / 10</span>
                  </div>
                  <Slider value={painIntensity} onValueChange={onPainIntensityChange} max={10} min={0} step={1} />
                  <p className="mt-2 text-xs text-muted-foreground">Set 0 if you have no pain today.</p>
                </div>

                {/* When pain started (required if pain > 0) */}
                <div className="mt-5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-muted-foreground">
                      When did the pain start?{" "}
                      {(painIntensity[0] ?? 0) > 0 && <span className="text-rose-500 font-semibold">Required</span>}
                    </p>
                    {(painIntensity[0] ?? 0) <= 0 && (
                      <span className="text-xs text-muted-foreground">Optional (no pain)</span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {painTimingOptions.map((opt) => {
                      const isSelected = painTiming === opt.value;
                      const requiredAndMissing = (painIntensity[0] ?? 0) > 0 && !painTiming;

                      return (
                        <motion.button
                          key={opt.value}
                          whileTap="tap"
                          animate={isSelected ? "selected" : undefined}
                          variants={bounce}
                          onClick={() => setPainTiming(isSelected ? "" : opt.value)}
                          className={cx(
                            "p-3 rounded-2xl border-2 transition-all duration-300 text-left",
                            isSelected
                              ? "border-transparent ring-2 ring-primary/40 bg-primary/10 shadow-soft"
                              : cx(
                                  "border-border hover:border-primary/40 hover:bg-muted/30",
                                  requiredAndMissing ? "border-rose-500/40" : ""
                                )
                          )}
                        >
                          <p className="text-sm font-semibold text-foreground">{opt.label}</p>
                        </motion.button>
                      );
                    })}
                  </div>

                  {(painIntensity[0] ?? 0) > 0 && !painTiming && (
                    <p className="mt-2 text-xs text-rose-500">
                      Please select one option (before / during / after bleeding).
                    </p>
                  )}
                </div>

                {/* Where it hurts */}
                <div className="mt-6">
                  <p className="text-sm text-muted-foreground mb-3">Where does it hurt? (tap to toggle)</p>
                  <div className="flex flex-wrap gap-3">
                    {painAreas.map((a) => {
                      const isSelected = painSelectedAreas.includes(a.key);
                      return (
                        <motion.button
                          key={a.key}
                          whileTap="tap"
                          animate={isSelected ? "selected" : undefined}
                          variants={bounce}
                          onClick={() => togglePainArea(a.key)}
                          className={cx(
                            "px-4 py-2 rounded-full border-2 transition-all duration-300 flex items-center gap-2",
                            isSelected
                              ? "border-transparent ring-2 ring-rose-400/40 bg-rose-500/10 text-rose-600 shadow-soft"
                              : "border-border text-muted-foreground hover:border-rose-400/30 hover:bg-muted/30 hover:text-foreground"
                          )}
                        >
                          {isSelected && <Check className="w-4 h-4" />}
                          <span className="text-sm font-semibold">{a.label}</span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                {/* Relief used + helped */}
                <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-3xl border border-border/60 bg-background/40 p-5">
                    <p className="text-sm text-muted-foreground mb-3">What did you try?</p>
                    <div className="grid grid-cols-2 gap-3">
                      {reliefOptions.map((r) => {
                        const Icon = r.icon;
                        const isSelected = reliefUsed.includes(r.key);
                        return (
                          <motion.button
                            key={r.key}
                            whileTap="tap"
                            animate={isSelected ? "selected" : undefined}
                            variants={bounce}
                            onClick={() => toggleRelief(r.key)}
                            className={cx(
                              "p-3 rounded-2xl border-2 transition-all duration-300 flex items-center gap-2 justify-center",
                              isSelected
                                ? "border-transparent ring-2 ring-emerald-400/40 bg-emerald-500/10 shadow-soft"
                                : "border-border hover:border-emerald-400/30 hover:bg-muted/30"
                            )}
                          >
                            <Icon className={cx("w-4 h-4", isSelected ? "text-emerald-600" : "text-muted-foreground")} />
                            <span className="text-sm font-semibold text-foreground">{r.label}</span>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-border/60 bg-background/40 p-5">
                    <p className="text-sm text-muted-foreground mb-3">Did it help?</p>

                    <div className="grid grid-cols-3 gap-3">
                      {reliefHelpedOptions.map((opt) => {
                        const isSelected = reliefHelped === opt.value;
                        return (
                          <motion.button
                            key={opt.value}
                            whileTap="tap"
                            animate={isSelected ? "selected" : undefined}
                            variants={bounce}
                            onClick={() => setReliefHelped(isSelected ? "" : opt.value)}
                            className={cx(
                              "p-3 rounded-2xl border-2 transition-all duration-300",
                              isSelected
                                ? `border-transparent ring-2 ${opt.ring} ${opt.bg} shadow-soft`
                                : "border-border hover:border-primary/30 hover:bg-muted/30"
                            )}
                          >
                            <span className="text-sm font-semibold text-foreground">{opt.label}</span>
                          </motion.button>
                        );
                      })}
                    </div>

                    <p className="mt-3 text-xs text-muted-foreground">
                      This helps you see what works best for your cramps over time.
                    </p>
                  </div>
                </div>
              </ModuleShell>
            )}

            {/* ====================== MOOD ====================== */}
            {activeStep === "mood" && (
              <ModuleShell title="Mood" subtitle="Pick a mood and set score" icon={Smile}>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-6">
                  {moods.map((mood) => {
                    const IconComponent = iconMap[mood.icon];
                    const isSelected = selectedMood === mood.value;

                    return (
                      <motion.button
                        key={mood.value}
                        whileTap="tap"
                        animate={isSelected ? "selected" : undefined}
                        variants={bounce}
                        onClick={() => toggleMood(mood.value)}
                        className={cx(
                          "p-4 rounded-2xl border-2 transition-all duration-300",
                          isSelected
                            ? "border-transparent ring-2 ring-fuchsia-400/40 bg-fuchsia-500/10 shadow-soft"
                            : "border-border hover:border-fuchsia-400/40 hover:bg-fuchsia-500/5"
                        )}
                      >
                        {IconComponent && (
                          <IconComponent
                            className={cx(
                              "w-6 h-6 mx-auto mb-1",
                              isSelected ? "text-fuchsia-500" : "text-muted-foreground"
                            )}
                          />
                        )}
                        <p className="text-xs font-semibold text-foreground">{mood.label}</p>
                      </motion.button>
                    );
                  })}
                </div>

                <AnimatePresence>
                  {selectedMood && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      className="space-y-2 rounded-2xl border border-border/60 bg-gradient-to-r from-fuchsia-500/10 to-primary/10 p-4"
                    >
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Mood score</span>
                        <span className="font-semibold text-foreground">{moodScore[0]} / 10</span>
                      </div>
                      <Slider value={moodScore} onValueChange={setMoodScore} max={10} min={0} step={1} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </ModuleShell>
            )}

            {/* ====================== SLEEP ====================== */}
            {activeStep === "sleep" && (
              <ModuleShell title="Sleep" subtitle="Quality + hours" icon={Moon}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                  {sleepOptions.map((option) => {
                    const IconComponent = iconMap[option.icon];
                    const isSelected = selectedSleep === option.value;

                    return (
                      <motion.button
                        key={option.value}
                        whileTap="tap"
                        animate={isSelected ? "selected" : undefined}
                        variants={bounce}
                        onClick={() => toggleSleep(option.value)}
                        className={cx(
                          "p-4 rounded-2xl border-2 transition-all duration-300",
                          isSelected
                            ? "border-transparent ring-2 ring-violet-400/40 bg-violet-500/10 shadow-soft"
                            : "border-border hover:border-violet-400/40 hover:bg-violet-500/5"
                        )}
                      >
                        {IconComponent && (
                          <IconComponent
                            className={cx(
                              "w-6 h-6 mx-auto mb-1",
                              isSelected ? "text-violet-500" : "text-muted-foreground"
                            )}
                          />
                        )}
                        <p className="text-xs font-semibold text-foreground">{option.label}</p>
                      </motion.button>
                    );
                  })}
                </div>

                <div className="space-y-2 rounded-2xl border border-border/60 bg-gradient-to-r from-violet-500/10 to-sky-500/10 p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Sleep hours</span>
                    <span className="font-semibold text-foreground">{sleepHours[0]} hours</span>
                  </div>
                  <Slider value={sleepHours} onValueChange={setSleepHours} max={12} min={0} step={0.5} />
                </div>
              </ModuleShell>
            )}

            {/* ====================== EXERCISE ====================== */}
            {activeStep === "exercise" && (
              <ModuleShell title="Exercise" subtitle="Select types + minutes" icon={Dumbbell}>
                <div className="rounded-2xl border border-border/60 bg-gradient-to-r from-emerald-500/10 to-primary/10 p-4 mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total minutes</span>
                    <span className="text-sm font-semibold text-foreground">{totalExerciseMinutes} min</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-3 gap-3 mb-4">
                  {exerciseOptions.map((option) => {
                    const IconComponent = iconMap[option.icon];
                    const isSelected = selectedExercises.includes(option.value);

                    return (
                      <motion.button
                        key={option.value}
                        whileTap="tap"
                        animate={isSelected ? "selected" : undefined}
                        variants={bounce}
                        onClick={() => toggleExercise(option.value)}
                        className={cx(
                          "p-3 rounded-2xl border-2 transition-all duration-300",
                          isSelected
                            ? "border-transparent ring-2 ring-emerald-400/40 bg-emerald-500/10 shadow-soft"
                            : "border-border hover:border-emerald-400/40 hover:bg-emerald-500/5"
                        )}
                      >
                        {IconComponent && (
                          <IconComponent
                            className={cx(
                              "w-5 h-5 mx-auto mb-1",
                              isSelected ? "text-emerald-500" : "text-muted-foreground"
                            )}
                          />
                        )}
                        <p className="text-xs font-semibold text-foreground">{option.label}</p>
                      </motion.button>
                    );
                  })}
                </div>

                {selectedExercises.length > 0 && !selectedExercises.includes("none") && (
                  <div className="mt-4 space-y-4">
                    {selectedExercises.map((ex) => {
                      const minutes = exerciseMinutesByType[ex] ?? 30;
                      const label = exerciseOptions.find((o) => o.value === ex)?.label ?? ex;

                      return (
                        <div key={ex} className="space-y-2 rounded-2xl border border-border/60 bg-emerald-500/5 p-4">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{label} duration</span>
                            <span className="font-semibold text-foreground">{minutes} min</span>
                          </div>
                          <Slider
                            value={[minutes]}
                            onValueChange={(v) => setExerciseMinutesByType((m) => ({ ...m, [ex]: v[0] }))}
                            max={180}
                            min={5}
                            step={5}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </ModuleShell>
            )}

            {/* ====================== SYMPTOMS ====================== */}
            {activeStep === "symptoms" && (
              <ModuleShell title="Symptoms" subtitle="Tap to add, then choose severity" icon={Brain}>
                <p className="text-sm text-muted-foreground mb-4">
                  Tap a symptom to add. Default is <b>Very low</b>. Then choose severity.
                </p>

                <div className="flex flex-wrap gap-3 mb-6">
                  {symptomTagPool.map((sym) => {
                    const isSelected = selectedSymptomTags.includes(sym);
                    return (
                      <motion.button
                        key={sym}
                        whileTap="tap"
                        animate={isSelected ? "selected" : undefined}
                        variants={bounce}
                        onClick={() => toggleSymptomTag(sym)}
                        className={cx(
                          "px-4 py-2 rounded-full border-2 transition-all duration-300 flex items-center gap-2",
                          isSelected
                            ? "border-transparent ring-2 ring-primary/40 bg-primary/10 text-primary shadow-soft"
                            : "border-border text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                        )}
                      >
                        {isSelected && <Check className="w-4 h-4" />}
                        <span className="text-sm font-semibold capitalize">{sym}</span>
                      </motion.button>
                    );
                  })}
                </div>

                {selectedSymptomTags.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedSymptomTags.map((sym) => {
                      const current = symptomLevelByTag[sym] ?? "very_low";
                      const currentMeta = symptomSeverityOptions.find((o) => o.value === current);

                      return (
                        <div
                          key={sym}
                          className="rounded-3xl border border-border/60 bg-gradient-to-r from-primary/5 via-fuchsia-500/5 to-amber-500/5 p-5"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <span className="font-semibold text-foreground capitalize">{sym}</span>
                            <span className={cx("text-xs font-semibold px-2 py-1 rounded-full", currentMeta?.chip ?? "")}>
                              {currentMeta?.label}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                            {symptomSeverityOptions.map((opt) => {
                              const isSelected = current === opt.value;
                              return (
                                <motion.button
                                  key={opt.value}
                                  whileTap="tap"
                                  animate={isSelected ? "selected" : undefined}
                                  variants={bounce}
                                  onClick={() => setSymptomLevel(sym, opt.value)}
                                  className={cx(
                                    "rounded-2xl border-2 px-3 py-2 text-xs font-semibold transition-all",
                                    isSelected
                                      ? `border-transparent ring-2 ${opt.ring} ${opt.chip} shadow-soft`
                                      : "border-border text-muted-foreground hover:border-primary/30 hover:bg-muted/40"
                                  )}
                                >
                                  {opt.label}
                                </motion.button>
                              );
                            })}
                          </div>

                          <button
                            onClick={() => toggleSymptomTag(sym)}
                            className="mt-3 text-xs text-muted-foreground hover:text-foreground underline"
                          >
                            Remove symptom
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ModuleShell>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Footer nav */}
        <div className="mt-6 flex items-center justify-between">
          <Button variant="outline" onClick={goPrev} disabled={stepIndex <= 0} className="rounded-2xl">
            <ChevronLeft className="w-4 h-4 mr-2" />
            Prev
          </Button>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <StepIcon className="w-4 h-4" />
            <span>
              {stepIndex + 1} / {steps.length}
            </span>
          </div>

          <Button onClick={stepIndex >= steps.length - 1 ? handleSave : goNext} className="rounded-2xl">
            {stepIndex >= steps.length - 1 ? (
              <>
                Save Entry
                <Check className="w-4 h-4 ml-2" />
              </>
            ) : (
              <>
                Next
                <ChevronRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    </Layout>
  );
}
