const MS_PER_DAY = 24 * 60 * 60 * 1000;
const AVG_DAYS_PER_MONTH = 30.44;

// Parse YYYY-MM-DD as UTC to avoid TZ/DST drift.
function toDateUTC(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  const t = Date.UTC(y, m - 1, d);
  return Number.isNaN(t) ? null : new Date(t);
}

function daysBetween(a, b) {
  if (!a || !b) return null;
  const diff = (b.getTime() - a.getTime()) / MS_PER_DAY;
  return diff >= 0 ? Math.floor(diff) : Math.ceil(diff);
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stddev(values) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = mean(values.map((v) => (v - avg) ** 2));
  return Math.sqrt(variance);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function impactScore01FromPeriodEntries(periodEntries) {
  const soakedDays = periodEntries.filter((e) => e?.soakedThrough === true).length;
  const floodingDays = periodEntries.filter((e) => e?.flooding === true).length;
  const clotDays = periodEntries.filter((e) => e?.largeClots === true).length;

  const padCounts = periodEntries
    .map((e) => (typeof e?.padChangeCount === "number" ? e.padChangeCount : null))
    .filter((v) => typeof v === "number");

  const impacts = periodEntries
    .map((e) => (typeof e?.bleedingImpact === "number" ? e.bleedingImpact : null))
    .filter((v) => typeof v === "number");

  const avgPads = padCounts.length ? mean(padCounts) : 0;
  const avgImpact = impacts.length ? mean(impacts) : 0;

  const soaked01 = clamp01(soakedDays / 2);
  const flood01 = clamp01(floodingDays / 1);
  const clots01 = clamp01(clotDays / 3);
  const pads01 = clamp01((avgPads - 3) / 6);
  const ql01 = clamp01(avgImpact / 4);

  const score01 =
    0.25 * soaked01 +
    0.25 * flood01 +
    0.2 * clots01 +
    0.15 * pads01 +
    0.15 * ql01;

  return clamp01(score01);
}

function blendFlowAndImpactTo04(flowScore04, impact01) {
  const flow01 = clamp01((flowScore04 || 0) / 4);
  const blended01 = 0.3 * flow01 + 0.7 * impact01;
  return 4 * blended01;
}

function mapFlowVolume(flowVolume) {
  if (!flowVolume) return null;
  if (["spotting_very_light", "somewhat_light", "light"].includes(flowVolume)) return 1;
  if (flowVolume === "moderate") return 2;
  if (flowVolume === "somewhat_heavy") return 3;
  if (flowVolume === "heavy") return 4;
  return null;
}

function mapPainScore(painIntensity) {
  const v = typeof painIntensity === "number" ? painIntensity : 0;
  if (v <= 2) return 0;
  if (v <= 5) return 1;
  if (v <= 8) return 2;
  return 3;
}

function mapPainScoreOrNull(painIntensity) {
  return typeof painIntensity === "number" ? mapPainScore(painIntensity) : null;
}

function isBleedingFlow(flowVolume) {
  if (!flowVolume) return false;
  const bleedingSet = new Set(["light", "moderate", "somewhat_heavy", "heavy"]);
  return bleedingSet.has(flowVolume);
}

function isSpotting(flowVolume) {
  return flowVolume === "spotting_very_light" || flowVolume === "somewhat_light";
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function buildPeriodsFromFlow(entries) {
  const periods = [];
  const rows = entries
    .map((entry) => {
      const dObj = toDateUTC(entry?.entryDate);
      if (!dObj) return null;
      const flow = entry.flowVolume;
      const bleeding = isBleedingFlow(flow);
      const spotting = isSpotting(flow) || Boolean(entry?.spottingToday);
      return {
        entry,
        dateStr: entry.entryDate,
        dObj,
        bleeding,
        spotting,
        startOverride: Boolean(entry?.periodStartOverride),
        endOverride: Boolean(entry?.periodEndOverride),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.dObj.getTime() - b.dObj.getTime());

  // Mark spotting as lead-in if bleeding follows within 2 days
  const leadInSet = new Set();
  for (let i = 0; i < rows.length; i += 1) {
    if (!rows[i].spotting) continue;
    for (let j = i + 1; j < rows.length; j += 1) {
      const gap = daysBetween(rows[i].dObj, rows[j].dObj);
      if (gap === null || gap > 2) break;
      if (rows[j].bleeding || rows[j].startOverride) {
        leadInSet.add(rows[i].dateStr);
        break;
      }
    }
  }

  let current = null;
  let lastBleedDate = null;

  for (const row of rows) {
    const effectiveBleeding = row.bleeding || row.startOverride || leadInSet.has(row.dateStr);
    if (!effectiveBleeding) continue;

    const forceStart = row.startOverride;

    if (!current || forceStart) {
      if (current) {
        periods.push({
          startDate: current.startDate,
          endDate: current.endDate,
          bleedingDays: current.bleedingDateSet.size,
        });
      }
      current = {
        startDate: row.dateStr,
        endDate: row.dateStr,
        bleedingDateSet: new Set([row.dateStr]),
      };
      lastBleedDate = row.dObj;
      if (row.endOverride) {
        periods.push({
          startDate: current.startDate,
          endDate: current.endDate,
          bleedingDays: current.bleedingDateSet.size,
        });
        current = null;
        lastBleedDate = null;
      }
      continue;
    }

    const gap = daysBetween(lastBleedDate, row.dObj);
    if (gap !== null && gap <= 2) {
      current.endDate = row.dateStr;
      current.bleedingDateSet.add(row.dateStr);
      lastBleedDate = row.dObj;
    } else {
      periods.push({
        startDate: current.startDate,
        endDate: current.endDate,
        bleedingDays: current.bleedingDateSet.size,
      });
      current = {
        startDate: row.dateStr,
        endDate: row.dateStr,
        bleedingDateSet: new Set([row.dateStr]),
      };
      lastBleedDate = row.dObj;
    }

    if (row.endOverride && current) {
      periods.push({
        startDate: current.startDate,
        endDate: current.endDate,
        bleedingDays: current.bleedingDateSet.size,
      });
      current = null;
      lastBleedDate = null;
    }
  }

  if (current) {
    periods.push({
      startDate: current.startDate,
      endDate: current.endDate,
      bleedingDays: current.bleedingDateSet.size,
    });
  }
  return periods;
}

function computeModelFeatures({ user, entries }) {
  const safeEntries = Array.isArray(entries) ? entries.slice() : [];

  safeEntries.sort((a, b) => (a.entryDate || "").localeCompare(b.entryDate || ""));

  const firstEntryDate = safeEntries.length ? toDateUTC(safeEntries[0].entryDate) : null;
  const lastEntryDate = safeEntries.length ? toDateUTC(safeEntries[safeEntries.length - 1].entryDate) : null;
  const trackingDurationMonths = firstEntryDate && lastEntryDate
    ? (daysBetween(firstEntryDate, lastEntryDate) ?? 0) / AVG_DAYS_PER_MONTH
    : 0;

  const periods = buildPeriodsFromFlow(safeEntries);
  const periodStarts = periods.map((p) => toDateUTC(p.startDate)).filter(Boolean);

  const cycleLengths = [];
  for (let i = 1; i < periodStarts.length; i += 1) {
    const len = daysBetween(periodStarts[i - 1], periodStarts[i]);
    if (typeof len === "number" && len > 0) cycleLengths.push(len);
  }

  const avgCycleLength = cycleLengths.length >= 2 ? mean(cycleLengths) : 0;
  const cycleLengthVariation = cycleLengths.length ? stddev(cycleLengths) : 0;
  const cycleVariationCoeff = avgCycleLength > 0 ? (cycleLengthVariation / avgCycleLength) * 100 : 0;

  const bleedingLengths = periods
    .map((p) => p.bleedingDays)
    .filter((v) => typeof v === "number" && v > 0);

  const avgBleedingDays = bleedingLengths.length ? mean(bleedingLengths) : 0;

  // Bleeding volume score (0..4):
  // blend flow signal and HMB impact signal, with impact dominating.
  let bleedingVolumeScore = 0;
  const perPeriodFlowMeans = [];
  const perPeriodImpact01 = [];
  for (const period of periods) {
    const start = toDateUTC(period.startDate);
    const end = toDateUTC(period.endDate);
    if (!start || !end) continue;

    const periodEntries = safeEntries
      .filter((e) => {
        const d = toDateUTC(e.entryDate);
        if (!d) return false;
        return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
      });

    const scores = periodEntries
      .map((e) => mapFlowVolume(e.flowVolume))
      .filter((v) => typeof v === "number");
    if (scores.length) perPeriodFlowMeans.push(mean(scores));
    perPeriodImpact01.push(impactScore01FromPeriodEntries(periodEntries));
  }

  let flowVolumeScore04 = 0;
  if (perPeriodFlowMeans.length) {
    flowVolumeScore04 = median(perPeriodFlowMeans.slice(-3));
  }

  let impact01 = 0;
  if (perPeriodImpact01.length) {
    impact01 = mean(perPeriodImpact01.slice(-3));
  }

  bleedingVolumeScore = blendFlowAndImpactTo04(flowVolumeScore04, impact01);

  let intermenstrualEpisodes = 0;
  if (periods.length >= 2) {
    const prevPeriod = periods[periods.length - 2];
    const lastPeriod = periods[periods.length - 1];
    const prevEnd = toDateUTC(prevPeriod.endDate);
    const lastStart = toDateUTC(lastPeriod.startDate);

    if (prevEnd && lastStart) {
      const spottingDates = safeEntries
        .map((e) => {
          const d = toDateUTC(e.entryDate);
          return { d, flow: e.flowVolume };
        })
        .filter(
          ({ d, flow }) =>
            d &&
            d.getTime() > prevEnd.getTime() &&
            d.getTime() < lastStart.getTime() &&
            isSpotting(flow)
        )
        .map(({ d }) => d.getTime());

      const uniqueSpottingTimestamps = [...new Set(spottingDates)].sort((a, b) => a - b).map((t) => new Date(t));

      // Cluster spotting days with <=1 day gap into one episode
      let clusterStart = null;
      let lastDate = null;
      for (const d of uniqueSpottingTimestamps) {
        if (!clusterStart) {
          clusterStart = d;
          lastDate = d;
          continue;
        }
        const gap = daysBetween(lastDate, d);
        if (gap !== null && gap <= 1) {
          lastDate = d;
        } else {
          intermenstrualEpisodes += 1;
          clusterStart = d;
          lastDate = d;
        }
      }
      if (clusterStart) intermenstrualEpisodes += 1;
    }
  }

  let painScores = [];
  if (periods.length >= 1) {
    const lastPeriod = periods[periods.length - 1];
    const start = toDateUTC(lastPeriod.startDate);
    const end = lastPeriod.endDate ? toDateUTC(lastPeriod.endDate) : start;

    if (start && end) {
      painScores = safeEntries
        .filter((e) => {
          const d = toDateUTC(e.entryDate);
          if (!d) return false;
          return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
        })
        .map((e) => mapPainScoreOrNull(e?.pain?.painIntensity))
        .filter((v) => typeof v === "number");
    }
  }

  if (!painScores.length && lastEntryDate) {
    painScores = safeEntries
      .filter((e) => {
        const d = toDateUTC(e.entryDate);
        if (!d) return false;
        const daysDiff = daysBetween(d, lastEntryDate);
        return daysDiff !== null && daysDiff <= 7;
      })
      .map((e) => mapPainScoreOrNull(e?.pain?.painIntensity))
      .filter((v) => typeof v === "number");
  }

  const painScore = painScores.length ? Math.round(mean(painScores)) : 0;
  const durationAbnormalityFlag =
    avgBleedingDays > 0 && (avgBleedingDays < 3 || avgBleedingDays > 7) ? 1 : 0;
  const patternDisruptionScore = clamp(
    0.6 * cycleVariationCoeff + 5 * Math.min(intermenstrualEpisodes, 2) + 5 * durationAbnormalityFlag,
    0,
    100
  );

  return {
    age: typeof user?.profile?.age === "number" ? user.profile.age : 0,
    bmi: typeof user?.profile?.bmi === "number" ? user.profile.bmi : 0,
    life_stage: user?.profile?.lifeStage ?? "unknown",
    tracking_duration_months: Number(trackingDurationMonths.toFixed(2)),
    pain_score: Number(painScore.toFixed(2)),
    avg_cycle_length: Number(avgCycleLength.toFixed(2)),
    cycle_length_variation: Number(cycleLengthVariation.toFixed(2)),
    avg_bleeding_days: Number(avgBleedingDays.toFixed(2)),
    bleeding_volume_score: Number(bleedingVolumeScore.toFixed(2)),
    intermenstrual_episodes: intermenstrualEpisodes,
    cycle_variation_coeff: Number(cycleVariationCoeff.toFixed(2)),
    pattern_disruption_score: Number(patternDisruptionScore.toFixed(2)),
    duration_abnormality_flag: durationAbnormalityFlag,
  };
}

module.exports = {
  computeModelFeatures,
  // Expose helpers for deterministic summaries (LLM insights) without
  // coupling to the ML feature pipeline.
  toDateUTC,
  daysBetween,
  buildPeriodsFromFlow,
  isBleedingFlow,
  mapFlowVolume,
  impactScore01FromPeriodEntries,
  blendFlowAndImpactTo04,
};
