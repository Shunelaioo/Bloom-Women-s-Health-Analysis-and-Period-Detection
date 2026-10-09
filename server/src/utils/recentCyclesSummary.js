const {
  toDateUTC,
  daysBetween,
  buildPeriodsFromFlow,
} = require("./modelFeatures");

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const toCountList = (obj, limit = 3) =>
  Object.entries(obj || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));

const numMean = (vals) => {
  if (!vals.length) return 0;
  return vals.reduce((sum, v) => sum + v, 0) / vals.length;
};

const mapPairs = (value) => {
  if (!value) return [];
  if (value instanceof Map) return Array.from(value.entries());
  if (typeof value === "object") return Object.entries(value);
  return [];
};

function summarizeRecentCycles(entries = [], maxCycles = 3) {
  const sorted = [...entries]
    .filter((e) => e?.entryDate)
    .sort((a, b) => a.entryDate.localeCompare(b.entryDate));

  const periods = buildPeriodsFromFlow(sorted);
  const availableCycles = Math.max(0, periods.length - 1);
  if (!availableCycles) return { cycles: [], availableCycles: 0 };

  const startIdx = Math.max(0, periods.length - (maxCycles + 1));
  const cycleDefs = [];
  for (let i = startIdx; i < periods.length - 1; i += 1) {
    cycleDefs.push({
      start: periods[i].startDate,
      nextStart: periods[i + 1].startDate,
      periodLengthDays: periods[i].bleedingDays ?? null,
    });
  }

  const cycles = cycleDefs.map(({ start, nextStart, periodLengthDays }) => {
    const startDate = toDateUTC(start);
    const nextDate = toDateUTC(nextStart);
    const endInclusive = nextDate ? new Date(nextDate.getTime() - MS_PER_DAY) : null;

    const inCycle = sorted.filter((e) => {
      const d = toDateUTC(e.entryDate);
      return d && startDate && nextDate && d >= startDate && d < nextDate;
    });

    const flowColorCounts = {};
    const moodCounts = {};
    const moodScores = [];
    const sleepCounts = {};
    const sleepHours = [];
    const exerciseTypeCounts = {};
    const exerciseMinutesByType = {};
    const dailyExerciseTotals = [];
    const symptomTagCounts = {};
    const symptomLevelCounts = {};
    const painAreaCounts = {};
    const painTimingCounts = {};
    const reliefUsedCounts = {};
    const reliefHelpedCounts = {};

    inCycle.forEach((entry) => {
      if (entry.flowColor) flowColorCounts[entry.flowColor] = (flowColorCounts[entry.flowColor] || 0) + 1;

      const moodType = entry?.mood?.selectedMood;
      if (moodType) moodCounts[moodType] = (moodCounts[moodType] || 0) + 1;
      if (typeof entry?.mood?.moodScore === "number") moodScores.push(entry.mood.moodScore);

      const sleepType = entry?.sleep?.selectedSleep;
      if (sleepType) sleepCounts[sleepType] = (sleepCounts[sleepType] || 0) + 1;
      if (typeof entry?.sleep?.sleepHours === "number") sleepHours.push(entry.sleep.sleepHours);

      const selectedExercises = Array.isArray(entry?.exercises?.selectedExercises) ? entry.exercises.selectedExercises : [];
      selectedExercises
        .filter((x) => x && x !== "none")
        .forEach((x) => {
          exerciseTypeCounts[x] = (exerciseTypeCounts[x] || 0) + 1;
        });
      mapPairs(entry?.exercises?.exerciseMinutesByType).forEach(([k, v]) => {
        if (!k || k === "none") return;
        const minutes = Number(v);
        if (!Number.isFinite(minutes)) return;
        exerciseMinutesByType[k] = (exerciseMinutesByType[k] || 0) + minutes;
      });
      if (typeof entry?.totalExerciseMinutes === "number") dailyExerciseTotals.push(entry.totalExerciseMinutes);

      const selectedSymptoms = Array.isArray(entry?.symptoms?.selectedSymptomTags) ? entry.symptoms.selectedSymptomTags : [];
      selectedSymptoms.forEach((s) => {
        if (!s) return;
        symptomTagCounts[s] = (symptomTagCounts[s] || 0) + 1;
      });
      mapPairs(entry?.symptoms?.symptomLevelByTag).forEach(([tag, level]) => {
        if (!tag || !level) return;
        const key = `${tag}::${level}`;
        symptomLevelCounts[key] = (symptomLevelCounts[key] || 0) + 1;
      });

      const painAreas = Array.isArray(entry?.pain?.painSelectedAreas) ? entry.pain.painSelectedAreas : [];
      painAreas.forEach((area) => {
        if (!area) return;
        painAreaCounts[area] = (painAreaCounts[area] || 0) + 1;
      });
      if (entry?.pain?.painTiming) {
        painTimingCounts[entry.pain.painTiming] = (painTimingCounts[entry.pain.painTiming] || 0) + 1;
      }
      const reliefUsed = Array.isArray(entry?.pain?.reliefUsed) ? entry.pain.reliefUsed : [];
      reliefUsed.forEach((r) => {
        if (!r) return;
        reliefUsedCounts[r] = (reliefUsedCounts[r] || 0) + 1;
      });
      if (entry?.pain?.reliefHelped) {
        reliefHelpedCounts[entry.pain.reliefHelped] = (reliefHelpedCounts[entry.pain.reliefHelped] || 0) + 1;
      }
    });

    return {
      cycleStart: start,
      cycleEnd: endInclusive ? endInclusive.toISOString().slice(0, 10) : null,
      cycleLengthDays: startDate && nextDate ? daysBetween(startDate, nextDate) : null,
      periodLengthDays: typeof periodLengthDays === "number" ? periodLengthDays : null,
      loggedDays: inCycle.length,
      flowColors: toCountList(flowColorCounts),
      mood: {
        top: toCountList(moodCounts),
        avgScore: Number(numMean(moodScores).toFixed(2)),
      },
      sleep: {
        top: toCountList(sleepCounts),
        avgHours: Number(numMean(sleepHours).toFixed(2)),
      },
      exercise: {
        topTypes: toCountList(exerciseTypeCounts),
        minutesByType: toCountList(exerciseMinutesByType),
        totalMinutes: Math.round(dailyExerciseTotals.reduce((sum, v) => sum + v, 0)),
      },
      symptoms: {
        topTags: toCountList(symptomTagCounts, 5),
        topLevels: Object.entries(symptomLevelCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([key, count]) => {
            const [tag, level] = key.split("::");
            return { tag, level, count };
          }),
      },
      painMeta: {
        topAreas: toCountList(painAreaCounts),
        timing: toCountList(painTimingCounts),
        reliefUsed: toCountList(reliefUsedCounts),
        reliefHelped: toCountList(reliefHelpedCounts),
      },
    };
  });

  return { cycles, availableCycles };
}

module.exports = { summarizeRecentCycles };
