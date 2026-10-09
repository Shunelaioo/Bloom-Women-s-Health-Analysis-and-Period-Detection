const {
  toDateUTC,
  daysBetween,
  buildPeriodsFromFlow,
  isBleedingFlow,
} = require("./modelFeatures");

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const mean = (arr) => (arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0);

const symptomLevelToNumber = (level) => {
  if (!level || typeof level !== "string") return null;
  const v = level.trim().toLowerCase();
  // Tracking.tsx uses: very_low | low | moderate | high | very_high
  if (v === "very_low") return 1;
  if (v === "low") return 2;
  if (v === "moderate") return 3;
  if (v === "high") return 4;
  if (v === "very_high") return 5;
  // Accept a couple of common aliases to be resilient to older data.
  if (v === "mild") return 2;
  if (v === "medium") return 3;
  if (v === "severe") return 5;
  return null;
};

const mapPairs = (value) => {
  if (!value) return [];
  if (value instanceof Map) return Array.from(value.entries());
  if (typeof value === "object") return Object.entries(value);
  return [];
};

const mode = (arr) => {
  const counts = {};
  for (const v of arr) counts[v] = (counts[v] || 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : null;
};

const topN = (arr, n) =>
  Object.entries(
    arr.reduce((m, v) => {
      m[v] = (m[v] || 0) + 1;
      return m;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([v]) => v);

function summarizeLast3Months(entries = []) {
  const sorted = [...entries]
    .filter((e) => e?.entryDate)
    .sort((a, b) => a.entryDate.localeCompare(b.entryDate));

  if (!sorted.length) return { error: "no_entries" };

  const latest = toDateUTC(sorted[sorted.length - 1].entryDate);
  if (!latest) return { error: "invalid_latest_date" };
  const rangeStart = new Date(latest.getTime() - 89 * MS_PER_DAY);

  const inRange = sorted.filter((e) => {
    const d = toDateUTC(e.entryDate);
    return d && d >= rangeStart && d <= latest;
  });
  if (!inRange.length) return { error: "no_entries_in_range" };

  const periods = buildPeriodsFromFlow(inRange);
  const cycleLengths = [];
  for (let i = 1; i < periods.length; i += 1) {
    const a = toDateUTC(periods[i - 1].startDate);
    const b = toDateUTC(periods[i].startDate);
    const len = daysBetween(a, b);
    if (typeof len === "number" && len > 0) cycleLengths.push(len);
  }

  const numField = (picker) =>
    inRange
      .map(picker)
      .filter((n) => typeof n === "number" && !Number.isNaN(n));

  const painVals = numField((e) => e?.pain?.painIntensity);
  const moodVals = numField((e) => e?.mood?.moodScore);
  const sleepVals = numField((e) => e?.sleep?.sleepHours);
  const exerciseTotals = numField((e) => e?.totalExerciseMinutes);

  const painTiming = inRange
    .filter((e) => (e?.pain?.painIntensity ?? 0) > 0 && e?.pain?.painTiming)
    .map((e) => e.pain.painTiming);
  const painAreas = inRange
    .filter((e) => (e?.pain?.painIntensity ?? 0) > 0)
    .flatMap((e) => e?.pain?.painSelectedAreas || []);

  const exerciseTypes = (() => {
    const counts = {};
    inRange.forEach((e) => (e?.exercises?.selectedExercises || []).forEach((t) => (counts[t] = (counts[t] || 0) + 1)));
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => t);
  })();

  const symptomsCounts = (() => {
    const counts = {};
    inRange.forEach((e) => (e?.symptoms?.selectedSymptomTags || []).forEach((s) => (counts[s] = (counts[s] || 0) + 1)));
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));
  })();

  const symptomSeverityLevels = (() => {
    const vals = [];
    inRange.forEach((e) => {
      mapPairs(e?.symptoms?.symptomLevelByTag).forEach(([, level]) => {
        const n = symptomLevelToNumber(level);
        if (typeof n === "number") vals.push(n);
      });
    });
    return vals;
  })();

  const bleedingDaysAvg = periods.length
    ? Number((periods.reduce((sum, p) => sum + (p.bleedingDays || 0), 0) / periods.length).toFixed(2))
    : 0;

  return {
    cycleStart: inRange[0].entryDate,
    cycleEnd: inRange[inRange.length - 1].entryDate,
    cycleLengthDays: cycleLengths.length ? Number(mean(cycleLengths).toFixed(2)) : null,
    bleedingDays: bleedingDaysAvg,
    flowVolumePattern: inRange
      .filter((e) => typeof e.flowVolume === "string" && e.flowVolume)
      .map((e) => ({ date: e.entryDate, flowVolume: e.flowVolume, bleeding: isBleedingFlow(e.flowVolume) })),
    pain: {
      avg: Number(mean(painVals).toFixed(2)),
      max: painVals.length ? Math.max(...painVals) : 0,
      timingMode: mode(painTiming),
      topAreas: topN(painAreas, 3),
    },
    mood: {
      avg: Number(mean(moodVals).toFixed(2)),
      lowDays: moodVals.filter((v) => v <= 3).length,
    },
    sleep: {
      avgHours: Number(mean(sleepVals).toFixed(2)),
      lowSleepDays: sleepVals.filter((v) => v < 6).length,
    },
    exercise: {
      totalMinutes: Math.round(exerciseTotals.reduce((s, n) => s + n, 0)),
      topTypes: exerciseTypes,
    },
    topSymptoms: symptomsCounts,
    symptomSeverityAvg: symptomSeverityLevels.length
      ? Number(mean(symptomSeverityLevels).toFixed(2))
      : null,
    entriesConsidered: inRange.length,
    periodCountInRange: periods.length,
  };
}

function summarizeLastCycle(entries = []) {
  const sorted = [...entries]
    .filter((e) => e?.entryDate)
    .sort((a, b) => a.entryDate.localeCompare(b.entryDate));

  const periods = buildPeriodsFromFlow(sorted);
  if (periods.length < 2) return { error: "need_two_periods" };

  const prevPeriod = periods[periods.length - 2];
  const nextPeriod = periods[periods.length - 1];

  const start = toDateUTC(prevPeriod.startDate);
  const nextStart = toDateUTC(nextPeriod.startDate);
  if (!start || !nextStart) return { error: "invalid_period_dates" };

  const endExclusive = nextStart;
  const endInclusive = new Date(endExclusive.getTime() - MS_PER_DAY);
  const cycleLength = daysBetween(start, endExclusive) ?? null;

  const inRange = sorted.filter((e) => {
    const d = toDateUTC(e.entryDate);
    return d && d >= start && d < endExclusive;
  });

  const numField = (picker) =>
    inRange
      .map(picker)
      .filter((n) => typeof n === "number" && !Number.isNaN(n));

  const painVals = numField((e) => e?.pain?.painIntensity);
  const moodVals = numField((e) => e?.mood?.moodScore);
  const sleepVals = numField((e) => e?.sleep?.sleepHours);
  const exerciseTotals = numField((e) => e?.totalExerciseMinutes);

  const painTiming = inRange
    .filter((e) => (e?.pain?.painIntensity ?? 0) > 0 && e?.pain?.painTiming)
    .map((e) => e.pain.painTiming);
  const painAreas = inRange
    .filter((e) => (e?.pain?.painIntensity ?? 0) > 0)
    .flatMap((e) => e?.pain?.painSelectedAreas || []);

  const exerciseTypes = (() => {
    const counts = {};
    inRange.forEach((e) => (e?.exercises?.selectedExercises || []).forEach((t) => (counts[t] = (counts[t] || 0) + 1)));
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => t);
  })();

  const symptomsCounts = (() => {
    const counts = {};
    inRange.forEach((e) => (e?.symptoms?.selectedSymptomTags || []).forEach((s) => (counts[s] = (counts[s] || 0) + 1)));
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));
  })();

  return {
    cycleStart: prevPeriod.startDate,
    cycleEnd: endInclusive.toISOString().slice(0, 10),
    cycleLengthDays: cycleLength,
    bleedingDays: prevPeriod.bleedingDays || 0,
    flowVolumePattern: inRange
      .filter((e) => typeof e.flowVolume === "string" && e.flowVolume)
      .map((e) => ({ date: e.entryDate, flowVolume: e.flowVolume, bleeding: isBleedingFlow(e.flowVolume) })),
    pain: {
      avg: Number(mean(painVals).toFixed(2)),
      max: painVals.length ? Math.max(...painVals) : 0,
      timingMode: mode(painTiming),
      topAreas: topN(painAreas, 3),
    },
    mood: {
      avg: Number(mean(moodVals).toFixed(2)),
      lowDays: moodVals.filter((v) => v <= 3).length,
    },
    sleep: {
      avgHours: Number(mean(sleepVals).toFixed(2)),
      lowSleepDays: sleepVals.filter((v) => v < 6).length,
    },
    exercise: {
      totalMinutes: Math.round(exerciseTotals.reduce((s, n) => s + n, 0)),
      topTypes: exerciseTypes,
    },
    topSymptoms: symptomsCounts,
    entriesConsidered: inRange.length,
  };
}

module.exports = { summarizeLastCycle, summarizeLast3Months };
