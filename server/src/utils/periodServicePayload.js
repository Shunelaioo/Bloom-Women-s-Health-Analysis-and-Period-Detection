const {
  buildPeriodsFromFlow,
  toDateUTC,
} = require("./modelFeatures");
const { estimateEntryExerciseCalories } = require("./exerciseCalories");

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_CYCLE_LENGTH = 28;
const DEFAULT_PERIOD_LENGTH = 5;

const SYMPTOM_ALIASES = {
  cramps: new Set(["cramps", "cramp"]),
  sorebreasts: new Set(["sore breasts", "sore breast", "sorebreasts", "sore_breasts", "breast tenderness"]),
  fatigue: new Set(["fatigue", "tired", "tiredness"]),
  moodswing: new Set(["mood swing", "mood swings", "moodswing", "mood_swing", "irritability"]),
  anxiety: new Set(["anxiety", "anxious", "stress", "stressed"]),
};

const LEVEL_TO_SCORE = {
  none: 0,
  very_low: 1,
  low: 2,
  mild: 2,
  moderate: 3,
  medium: 3,
  high: 4,
  severe: 4,
  very_high: 5,
  extreme: 5,
};

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function mean(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function isYmd(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toYmd(dateObj) {
  return dateObj.toISOString().slice(0, 10);
}

function addDaysYmd(ymd, days) {
  const d = toDateUTC(ymd);
  if (!d) return null;
  return toYmd(new Date(d.getTime() + days * MS_PER_DAY));
}

function enumerateDatesInclusive(startYmd, endYmd) {
  const start = toDateUTC(startYmd);
  const end = toDateUTC(endYmd);
  if (!start || !end || end.getTime() < start.getTime()) return [];

  const dates = [];
  for (let d = new Date(start.getTime()); d.getTime() <= end.getTime(); d = new Date(d.getTime() + MS_PER_DAY)) {
    dates.push(toYmd(d));
  }
  return dates;
}

function computeBmi(user) {
  const bmi = Number(user?.profile?.bmi);
  if (isFiniteNumber(bmi) && bmi > 0) return bmi;
  const heightCm = Number(user?.profile?.heightCm);
  const weightKg = Number(user?.profile?.weightKg);
  if (!isFiniteNumber(heightCm) || !isFiniteNumber(weightKg) || heightCm <= 0 || weightKg <= 0) {
    return null;
  }
  return Number((weightKg / ((heightCm / 100) ** 2)).toFixed(2));
}

function computeAge(user) {
  const age = Number(user?.profile?.age);
  if (isFiniteNumber(age) && age > 0) return age;
  const dob = user?.profile?.dateOfBirth ? new Date(user.profile.dateOfBirth) : null;
  if (!dob || Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let years = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dob.getUTCDate())) {
    years -= 1;
  }
  return years > 0 ? years : null;
}

function getRecentEntries(entries, days = 14) {
  if (!Array.isArray(entries) || !entries.length) return [];
  return entries.slice(-Math.max(1, days));
}

function symptomLevelToScore(value) {
  if (isFiniteNumber(value)) return clamp(Number(value), 0, 5);
  const score = LEVEL_TO_SCORE[normalize(value)];
  return typeof score === "number" ? score : null;
}

function mapEntries(value) {
  if (!value) return [];
  if (value instanceof Map) return Array.from(value.entries());
  if (typeof value === "object") return Object.entries(value);
  return [];
}

function extractSymptomScore(entry, key) {
  const aliases = SYMPTOM_ALIASES[key] || new Set([key]);
  const fromLevels = mapEntries(entry?.symptoms?.symptomLevelByTag);
  for (const [tag, level] of fromLevels) {
    if (aliases.has(normalize(tag))) {
      const score = symptomLevelToScore(level);
      if (isFiniteNumber(score)) return score;
    }
  }

  const selected = Array.isArray(entry?.symptoms?.selectedSymptomTags)
    ? entry.symptoms.selectedSymptomTags
    : [];
  if (selected.some((tag) => aliases.has(normalize(tag)))) {
    return 1;
  }

  return 0;
}

function extractStressScore(entry) {
  const moodScore = Number(entry?.mood?.moodScore);
  if (isFiniteNumber(moodScore)) {
    return clamp(moodScore, 0, 10);
  }
  const anxiety = extractSymptomScore(entry, "anxiety");
  return isFiniteNumber(anxiety) ? anxiety * 2 : null;
}

function extractSleepMetric(entry) {
  const sleepHours = Number(entry?.sleep?.sleepHours);
  if (!isFiniteNumber(sleepHours)) return null;
  return clamp(sleepHours, 0, 24);
}

function extractPainIntensity(entry) {
  const pain = Number(entry?.pain?.painIntensity);
  if (!isFiniteNumber(pain)) return null;
  return clamp(pain, 0, 10);
}

function resolveLastPeriodStart({ entries, cycleSettings }) {
  if (isYmd(cycleSettings?.lastPeriodStart)) {
    return cycleSettings.lastPeriodStart;
  }
  const periods = buildPeriodsFromFlow(entries);
  if (periods.length > 0 && isYmd(periods[periods.length - 1]?.startDate)) {
    return periods[periods.length - 1].startDate;
  }
  if (entries.length > 0 && isYmd(entries[entries.length - 1]?.entryDate)) {
    return entries[entries.length - 1].entryDate;
  }
  return toYmd(new Date());
}

function buildPhaseDates(currentCycleStart, cycleLengthDays, menstruationDays) {
  if (!isYmd(currentCycleStart)) return null;
  const nextStart = addDaysYmd(currentCycleStart, cycleLengthDays);
  if (!nextStart) return null;

  const menLen = clamp(Number(menstruationDays) || DEFAULT_PERIOD_LENGTH, 1, 14);
  const menstruationEnd = addDaysYmd(currentCycleStart, menLen - 1);
  const ovulationDate = addDaysYmd(nextStart, -14);
  if (!menstruationEnd || !ovulationDate) return null;

  const follicularStart = addDaysYmd(menstruationEnd, 1);
  const follicularEnd = addDaysYmd(ovulationDate, -1);
  const lutealStart = addDaysYmd(ovulationDate, 1);
  const lutealEnd = addDaysYmd(nextStart, -1);

  const phaseDates = {
    menstruation: {
      start: currentCycleStart,
      end: menstruationEnd,
    },
    follicular: null,
    ovulation: { date: ovulationDate },
    luteal: null,
  };

  if (follicularStart && follicularEnd && follicularStart <= follicularEnd) {
    phaseDates.follicular = { start: follicularStart, end: follicularEnd };
  }
  if (lutealStart && lutealEnd && lutealStart <= lutealEnd) {
    phaseDates.luteal = { start: lutealStart, end: lutealEnd };
  }

  return phaseDates;
}

function buildLegacyPredictionShape({ serviceData, anchors }) {
  const cycleLength = Number(serviceData?.predicted_cycle_length_days);
  const safeCycleLength = isFiniteNumber(cycleLength)
    ? clamp(Math.round(cycleLength), 15, 60)
    : DEFAULT_CYCLE_LENGTH;
  const currentCycleStart = anchors.current_cycle_start || null;
  const predictedDate = isYmd(serviceData?.next_period_start)
    ? serviceData.next_period_start
    : (currentCycleStart ? addDaysYmd(currentCycleStart, safeCycleLength) : null);
  const phaseDates = currentCycleStart
    ? buildPhaseDates(currentCycleStart, safeCycleLength, anchors.menstruation_days)
    : null;

  return {
    predicted_cycle_length_days: safeCycleLength,
    predicted_next_period_date: predictedDate,
    current_cycle_start_used: currentCycleStart,
    phase_dates: phaseDates,
  };
}

function computeFallbackCycleLength({ anchors, cycleSettings, user, entries }) {
  const settingsLen = Number(cycleSettings?.cycleLengthDays);
  if (isFiniteNumber(settingsLen) && settingsLen >= 15 && settingsLen <= 60) {
    return Math.round(settingsLen);
  }

  const history = Array.isArray(anchors?.cycle_lengths)
    ? anchors.cycle_lengths.filter((n) => isFiniteNumber(n) && n >= 15 && n <= 60)
    : [];
  if (history.length > 0) {
    return clamp(Math.round(mean(history.slice(-3))), 15, 60);
  }

  let base = DEFAULT_CYCLE_LENGTH;
  const age = computeAge(user);
  const bmi = computeBmi(user);
  const lifeStage = normalize(user?.profile?.lifeStage);
  const recent = getRecentEntries(entries, 14);

  let adjustment = 0;

  if (isFiniteNumber(age)) {
    if (age < 20) adjustment += 1;
    if (age >= 35) adjustment += 1;
    if (age >= 45) adjustment += 1;
  }

  if (isFiniteNumber(bmi)) {
    if (bmi < 18.5) adjustment += 1;
    if (bmi >= 30) adjustment += 1;
  }

  if (lifeStage.includes("peri")) adjustment += 2;
  if (lifeStage.includes("postpartum")) adjustment += 1;

  const stressValues = recent.map(extractStressScore).filter(isFiniteNumber);
  const sleepValues = recent.map(extractSleepMetric).filter(isFiniteNumber);
  const painValues = recent.map(extractPainIntensity).filter(isFiniteNumber);
  const exerciseValues = recent
    .map((e) => Number(e?.totalExerciseMinutes))
    .filter(isFiniteNumber);

  const avgStress = mean(stressValues);
  const avgSleep = mean(sleepValues);
  const avgPain = mean(painValues);
  const avgExercise = mean(exerciseValues);

  if (avgStress >= 7) adjustment += 1;
  if (avgSleep > 0 && avgSleep < 6) adjustment += 1;
  if (avgSleep >= 8.5) adjustment -= 1;
  if (avgPain >= 7) adjustment += 1;
  if (avgExercise >= 60) adjustment -= 1;

  base = clamp(Math.round(base + adjustment), 15, 60);
  return base;
}

function canUsePeriodModel(anchors) {
  const detectedPeriods = Number(anchors?.detected_periods || 0);
  if (!isFiniteNumber(detectedPeriods) || detectedPeriods < 2) {
    return {
      ok: false,
      reason: "Not enough period history. Need at least 2 detected period starts.",
    };
  }

  const cycleLengths = Array.isArray(anchors?.cycle_lengths)
    ? anchors.cycle_lengths.filter((n) => isFiniteNumber(n) && n > 0)
    : [];
  const prevCycleLength = cycleLengths.length ? cycleLengths[cycleLengths.length - 1] : null;

  if (!isFiniteNumber(prevCycleLength)) {
    return {
      ok: false,
      reason: "Not enough completed cycle data to build reliable features.",
    };
  }

  if (prevCycleLength < 21 || prevCycleLength > 38) {
    return {
      ok: false,
      reason: `Most recent completed cycle length=${Math.round(prevCycleLength)} is outside [21, 38]. Can't build reliable features.`,
    };
  }

  return { ok: true, reason: null };
}

function buildPeriodServicePredictPayload({ user, entries, cycleSettings }) {
  const safeEntries = Array.isArray(entries)
    ? entries.filter((e) => isYmd(e?.entryDate)).slice().sort((a, b) => a.entryDate.localeCompare(b.entryDate))
    : [];

  const userId = String(user?._id || user?.id || user?.userId || "");
  const periods = buildPeriodsFromFlow(safeEntries);
  const lastPeriodStart = resolveLastPeriodStart({ entries: safeEntries, cycleSettings });
  const periodLength = clamp(Number(cycleSettings?.periodLengthDays) || DEFAULT_PERIOD_LENGTH, 1, 14);

  const startDate = safeEntries.length ? safeEntries[0].entryDate : lastPeriodStart;
  const endDate = safeEntries.length ? safeEntries[safeEntries.length - 1].entryDate : lastPeriodStart;
  const allDates = enumerateDatesInclusive(startDate, endDate);
  const byDate = new Map(safeEntries.map((e) => [e.entryDate, e]));

  const weightKg = Number(user?.profile?.weightKg);
  const safeWeightKg = isFiniteNumber(weightKg) ? weightKg : null;

  const dailyLogs = allDates.map((dateStr, idx) => {
    const entry = byDate.get(dateStr) || null;

    const stressScore = entry ? extractStressScore(entry) : null;
    const sleepValue = entry ? extractSleepMetric(entry) : null;
    const calories = entry ? estimateEntryExerciseCalories(entry, safeWeightKg) : 0;

    const cramps = entry ? extractSymptomScore(entry, "cramps") : 0;
    const sorebreasts = entry ? extractSymptomScore(entry, "sorebreasts") : 0;
    const fatigue = entry ? extractSymptomScore(entry, "fatigue") : 0;
    const moodswing = entry ? extractSymptomScore(entry, "moodswing") : 0;

    return {
      id: userId,
      day_in_study: idx + 1,
      flow_volume: entry?.flowVolume || "none",
      efficiency: sleepValue,
      stress_score: stressScore,
      calories,
      duration_minutes: Number(entry?.totalExerciseMinutes) || 0,
      sleep_missing: isFiniteNumber(sleepValue) ? 0 : 1,
      stress_missing: isFiniteNumber(stressScore) ? 0 : 1,
      exercise_missing: calories > 0 ? 0 : 1,
      cramps,
      sorebreasts,
      fatigue,
      moodswing,
    };
  });

  return {
    request: {
      user_id: userId,
      last_period_start: lastPeriodStart,
      daily_logs: dailyLogs,
      bmi: computeBmi(user),
      age: computeAge(user),
      menarche_age: Number(user?.profile?.menarcheAge) || null,
      weight_kg: safeWeightKg,
      n_future_starts: 4,
    },
    anchors: {
      current_cycle_start: lastPeriodStart,
      menstruation_days: periodLength,
      detected_periods: periods.length,
      cycle_lengths: periods.length > 1
        ? periods.slice(1).map((p, i) => {
            const prev = toDateUTC(periods[i].startDate);
            const cur = toDateUTC(p.startDate);
            if (!prev || !cur) return null;
            return Math.round((cur.getTime() - prev.getTime()) / MS_PER_DAY);
          }).filter((n) => isFiniteNumber(n) && n > 0)
        : [],
      daily_logs_count: dailyLogs.length,
    },
  };
}

module.exports = {
  buildPeriodServicePredictPayload,
  buildLegacyPredictionShape,
  computeFallbackCycleLength,
  canUsePeriodModel,
};
