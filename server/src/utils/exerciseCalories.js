const DEFAULT_MET = 5.0;

const MET_BY_EXERCISE = {
  walking: 3.5,
  jog: 7.0,
  jogging: 7.0,
  run: 9.8,
  running: 9.8,
  cycling: 7.5,
  bike: 7.5,
  yoga: 3.0,
  pilates: 3.0,
  swimming: 6.0,
  dance: 5.5,
  hiit: 8.0,
  strength: 6.0,
  workout: 6.0,
  stretching: 2.5,
};

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function caloriesFromMet({ met, weightKg, minutes }) {
  if (!isFiniteNumber(met) || !isFiniteNumber(weightKg) || !isFiniteNumber(minutes) || minutes <= 0) {
    return 0;
  }
  const hours = minutes / 60;
  return met * weightKg * hours;
}

function estimateEntryExerciseCalories(entry, weightKg) {
  if (!isFiniteNumber(weightKg) || weightKg <= 0 || !entry || typeof entry !== "object") {
    return 0;
  }

  const minutesByTypeRaw = entry?.exercises?.exerciseMinutesByType;
  const minutesByType = minutesByTypeRaw instanceof Map
    ? Object.fromEntries(minutesByTypeRaw.entries())
    : (minutesByTypeRaw && typeof minutesByTypeRaw === "object" ? minutesByTypeRaw : {});

  let total = 0;
  let usedTypedMinutes = false;

  for (const [type, mins] of Object.entries(minutesByType)) {
    const minutes = Number(mins);
    if (!isFiniteNumber(minutes) || minutes <= 0) continue;
    const met = MET_BY_EXERCISE[normalizeKey(type)] ?? DEFAULT_MET;
    total += caloriesFromMet({ met, weightKg, minutes });
    usedTypedMinutes = true;
  }

  if (usedTypedMinutes) {
    return Number(total.toFixed(2));
  }

  const fallbackMinutes = Number(entry?.totalExerciseMinutes);
  if (!isFiniteNumber(fallbackMinutes) || fallbackMinutes <= 0) {
    return 0;
  }
  return Number(caloriesFromMet({ met: DEFAULT_MET, weightKg, minutes: fallbackMinutes }).toFixed(2));
}

module.exports = {
  MET_BY_EXERCISE,
  caloriesFromMet,
  estimateEntryExerciseCalories,
};
