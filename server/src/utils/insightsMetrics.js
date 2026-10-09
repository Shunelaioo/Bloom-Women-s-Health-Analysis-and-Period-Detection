const {
  toDateUTC,
  daysBetween,
  buildPeriodsFromFlow,
  mapFlowVolume,
  impactScore01FromPeriodEntries,
  blendFlowAndImpactTo04,
} = require("./modelFeatures");

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const CONDITION_META = {
  oligomenorrhea: {
    title: "Oligomenorrhea",
    next: "If cycles stay long or irregular, consider clinician evaluation.",
  },
  polymenorrhea: {
    title: "Polymenorrhea",
    next: "If cycles remain very short, consider a clinical review.",
  },
  menorrhagia: {
    title: "Menorrhagia",
    next: "If bleeding is heavy or prolonged, consider clinician evaluation.",
  },
  amenorrhea: {
    title: "Amenorrhea",
    next: "If periods are absent for months, seek clinical evaluation.",
  },
  intermenstrual_bleeding: {
    title: "Intermenstrual bleeding",
    next: "If spotting persists, consider discussing with a clinician.",
  },
};

function normalizeLabel(label) {
  return String(label || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function computeRuleSignals({ modelFeatures, metrics }) {
  const avgCycle = Number(modelFeatures?.avg_cycle_length ?? 0);
  const avgBleed = Number(modelFeatures?.avg_bleeding_days ?? 0);
  const bleedScore04 = Number(modelFeatures?.bleeding_volume_score ?? 0);
  const intermenstrual = Number(modelFeatures?.intermenstrual_episodes ?? 0);
  const variation = Number(modelFeatures?.cycle_length_variation ?? 0);
  const trackingMonths = Number(modelFeatures?.tracking_duration_months ?? 0);

  const hmb = metrics?.extra_metrics?.hmb_details || {};
  const soakedThroughDays = Number(hmb?.soakedThroughDays ?? 0);
  const floodingDays = Number(hmb?.floodingDays ?? 0);
  const largeClotsDays = Number(hmb?.largeClotsDays ?? 0);
  const avgPadChangeCount = Number(hmb?.avgPadChangeCount ?? 0);
  const avgBleedingImpact = Number(hmb?.avgBleedingImpact ?? 0);

  const menorrhagiaHigh =
    floodingDays >= 1 ||
    soakedThroughDays >= 2 ||
    avgPadChangeCount >= 9 ||
    (largeClotsDays >= 2 && avgBleedingImpact >= 3);
  const menorrhagiaMedium =
    menorrhagiaHigh ||
    avgBleed >= 8 ||
    bleedScore04 >= 3 ||
    avgPadChangeCount >= 6 ||
    Number(metrics?.extra_metrics?.hmb_impact_score ?? 0) >= 5;

  const signals = {
    oligomenorrhea: {
      level: avgCycle >= 45 ? "high" : avgCycle >= 35 ? "medium" : "none",
      reasons:
        avgCycle >= 45
          ? ["Average cycle length is >= 45 days."]
          : avgCycle >= 35
          ? ["Average cycle length is >= 35 days."]
          : [],
    },
    polymenorrhea: {
      level: avgCycle > 0 && avgCycle < 18 ? "high" : avgCycle > 0 && avgCycle < 21 ? "medium" : "none",
      reasons:
        avgCycle > 0 && avgCycle < 18
          ? ["Average cycle length is < 18 days."]
          : avgCycle > 0 && avgCycle < 21
          ? ["Average cycle length is < 21 days."]
          : [],
    },
    menorrhagia: {
      level: menorrhagiaHigh ? "high" : menorrhagiaMedium ? "medium" : "none",
      reasons: [
        ...(floodingDays >= 1 ? ["Flooding/leak episodes are logged."] : []),
        ...(soakedThroughDays >= 2 ? ["2+ soaked-through days are logged."] : []),
        ...(avgPadChangeCount >= 9 ? ["Average product changes/day is very high (>=9)."] : []),
        ...(avgBleed >= 8 ? ["Average bleeding duration is >= 8 days."] : []),
        ...(bleedScore04 >= 3 ? ["Bleeding volume score is high (>=3/4)."] : []),
      ],
    },
    amenorrhea: {
      level:
        avgBleed === 0 && trackingMonths >= 6
          ? "high"
          : avgBleed === 0 && trackingMonths >= 3
          ? "medium"
          : "none",
      reasons:
        avgBleed === 0 && trackingMonths >= 6
          ? ["No bleeding days detected for >= 6 months of tracking."]
          : avgBleed === 0 && trackingMonths >= 3
          ? ["No bleeding days detected for >= 3 months of tracking."]
          : [],
    },
    intermenstrual_bleeding: {
      level: intermenstrual >= 2 ? "high" : intermenstrual >= 1 ? "medium" : "none",
      reasons:
        intermenstrual >= 2
          ? ["2+ intermenstrual bleeding episodes are logged."]
          : intermenstrual >= 1
          ? ["Intermenstrual bleeding episodes are logged."]
          : [],
    },
    high_cycle_irregularity: {
      level: variation >= 8 ? "high" : variation >= 6 ? "medium" : "none",
      reasons:
        variation >= 8
          ? ["Cycle length variation is high (>=8 days)."]
          : variation >= 6
          ? ["Cycle length variation is elevated (>=6 days)."]
          : [],
    },
  };

  return signals;
}

function getModelSignal(modelPrediction) {
  if (!modelPrediction) {
    return { probability: null, threshold: 0.5, positive: null };
  }
  const probability =
    typeof modelPrediction.probability === "number" ? Number(modelPrediction.probability) : null;
  const threshold =
    typeof modelPrediction.threshold === "number" ? Number(modelPrediction.threshold) : 0.5;
  const positive = probability === null ? null : probability >= threshold;
  return { probability, threshold, positive };
}

function computeHybridTriage({ modelPredictions, modelFeatures, metrics }) {
  const predictions = Array.isArray(modelPredictions) ? modelPredictions : [];
  const contextActive = Boolean(metrics?.extra_metrics?.context_flags?.contextActive);
  const minimumHistoryMet = Boolean(metrics?.minimum_history_met);
  const needsMoreData = !minimumHistoryMet || contextActive;
  const detectedPeriods = Number(metrics?.detected_periods ?? 0);
  const loggingRate = Number(metrics?.tracking_summary?.loggingRate ?? 0);
  const trackingMonths = Number(modelFeatures?.tracking_duration_months ?? 0);
  const intermenstrualEpisodes = Number(modelFeatures?.intermenstrual_episodes ?? 0);
  const ruleSignals = computeRuleSignals({ modelFeatures, metrics });
  const reliabilityTier =
    minimumHistoryMet && detectedPeriods >= 4 && loggingRate >= 0.55 && trackingMonths >= 4
      ? "strong"
      : minimumHistoryMet && detectedPeriods >= 3 && loggingRate >= 0.4
      ? "moderate"
      : "low";

  const conditions = Object.keys(CONDITION_META).map((label) => {
    const meta = CONDITION_META[label];
    const modelPrediction = predictions.find((p) => normalizeLabel(p?.label) === label);
    const modelSignal = getModelSignal(modelPrediction);
    const rule = ruleSignals[label] || { level: "none", reasons: [] };

    let finalStatus = "Unlikely";
    let finalConfidence = "Low";
    const strongModelPositive =
      modelSignal.probability !== null &&
      modelSignal.probability >= Math.max(modelSignal.threshold + 0.15, 0.65);
    const safetyCriticalRule = label === "menorrhagia" && rule.level === "high";

    if (rule.level === "high" && (reliabilityTier !== "low" || safetyCriticalRule)) {
      finalStatus = "High alert";
      finalConfidence = "High";
    } else if (rule.level === "high") {
      finalStatus = "Possible";
      finalConfidence = "Medium";
    } else if (rule.level === "medium" && (reliabilityTier !== "low" || strongModelPositive)) {
      finalStatus = "Possible";
      finalConfidence = modelSignal.positive === true ? "High" : "Medium";
    } else if (
      modelSignal.positive === true &&
      strongModelPositive &&
      reliabilityTier !== "low"
    ) {
      finalStatus = "Possible";
      finalConfidence = "Medium";
    } else if (needsMoreData || reliabilityTier === "low") {
      finalStatus = "Needs more data";
      finalConfidence = "Low";
    }

    // Keep one-off spotting from looking over-escalated when model signal is strongly negative.
    if (
      label === "intermenstrual_bleeding" &&
      rule.level === "medium" &&
      modelSignal.positive === false &&
      modelSignal.probability !== null &&
      modelSignal.probability < Math.min(0.1, modelSignal.threshold * 0.25) &&
      intermenstrualEpisodes <= 1 &&
      !needsMoreData
    ) {
      finalStatus = "Unlikely";
      finalConfidence = "Low";
    }

    const reasons = [];
    if (modelSignal.probability !== null) {
      reasons.push(
        `Model probability: ${(modelSignal.probability * 100).toFixed(1)}% (threshold ${(
          modelSignal.threshold * 100
        ).toFixed(0)}%).`
      );
    } else {
      reasons.push("Model probability unavailable for this condition.");
    }
    if (rule.level !== "none" && modelSignal.positive === false) {
      reasons.push(
        "Rule-based pattern signal is present even though model probability is below threshold."
      );
    }
    reasons.push(...(rule.reasons || []));
    if (
      label === "intermenstrual_bleeding" &&
      finalStatus === "Unlikely" &&
      intermenstrualEpisodes <= 1
    ) {
      reasons.push("Single spotting episode can occur; monitor for repeat episodes next cycle.");
    }
    if (contextActive) {
      reasons.push("Current context may alter cycle interpretation; confidence is reduced.");
    } else if (!minimumHistoryMet) {
      reasons.push("Need >=2 periods and >=2 months of tracking for stronger confidence.");
    }
    if (reliabilityTier === "low") {
      reasons.push("Data reliability is still low; continue consistent daily logging.");
    } else if (reliabilityTier === "moderate") {
      reasons.push("Pattern reliability is moderate and may shift with more tracking.");
    }

    return {
      label,
      condition: meta.title,
      model_probability: modelSignal.probability,
      model_threshold: modelSignal.threshold,
      model_positive: modelSignal.positive,
      rule_level: rule.level,
      rule_positive: rule.level !== "none",
      final_status: finalStatus,
      final_confidence: finalConfidence,
      reliability_tier: reliabilityTier,
      reasons,
      next_step: meta.next,
    };
  });

  const redFlags = [
    {
      label: "Periods often last 8+ days",
      hit: Number(modelFeatures?.avg_bleeding_days ?? 0) >= 8,
      severity: "medium",
    },
    {
      label: "Cycles often > 35 days",
      hit: Number(modelFeatures?.avg_cycle_length ?? 0) > 35,
      severity: "medium",
    },
    {
      label: "Cycles often < 21 days",
      hit:
        Number(modelFeatures?.avg_cycle_length ?? 0) > 0 &&
        Number(modelFeatures?.avg_cycle_length ?? 0) < 21,
      severity: "medium",
    },
    {
      label: "High cycle irregularity (hard to predict ovulation)",
      hit: Number(modelFeatures?.cycle_length_variation ?? 0) >= 6,
      severity: "medium",
    },
    {
      label: "High bleeding volume",
      hit:
        Number(modelFeatures?.bleeding_volume_score ?? 0) >= 3 ||
        (ruleSignals?.menorrhagia?.level === "high"),
      severity: ruleSignals?.menorrhagia?.level === "high" ? "high" : "medium",
    },
    {
      label: "Spotting between periods",
      hit: Number(modelFeatures?.intermenstrual_episodes ?? 0) >= 1,
      severity: Number(modelFeatures?.intermenstrual_episodes ?? 0) >= 2 ? "high" : "medium",
    },
  ];

  const highAlertConditions = conditions
    .filter((c) => c.final_status === "High alert")
    .map((c) => c.condition);
  const possibleConditions = conditions
    .filter((c) => c.final_status === "Possible")
    .map((c) => c.condition);

  const overallAlertLevel = highAlertConditions.length
    ? "high"
    : possibleConditions.length
    ? "medium"
    : "none";

  return {
    summary: {
      overall_alert_level: overallAlertLevel,
      high_alert_conditions: highAlertConditions,
      possible_conditions: possibleConditions,
      context_active: contextActive,
      minimum_history_met: minimumHistoryMet,
      reliability_tier: reliabilityTier,
      logging_rate: Number(loggingRate.toFixed(2)),
    },
    conditions,
    red_flags: redFlags,
  };
}

function computeInsightsMetrics({ user, entries, modelFeatures }) {
  const safeEntries = Array.isArray(entries) ? entries.slice() : [];
  safeEntries.sort((a, b) => (a.entryDate || "").localeCompare(b.entryDate || ""));

  const periods = buildPeriodsFromFlow(safeEntries);
  const detectedPeriods = periods.length;
  const cyclesTracked = Math.max(0, detectedPeriods - 1);
  const minimumHistoryMet =
    (Number(modelFeatures?.tracking_duration_months) || 0) >= 2 && detectedPeriods >= 2;

  const lastPeriod = periods.length ? periods[periods.length - 1] : null;

  let hmbImpactScore = 0;
  let hmbDetails = null;
  if (lastPeriod) {
    const start = toDateUTC(lastPeriod.startDate);
    const end = toDateUTC(lastPeriod.endDate);
    if (start && end) {
      const lastPeriodEntries = safeEntries.filter((e) => {
        const d = toDateUTC(e.entryDate);
        if (!d) return false;
        return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
      });

      const flowScores = lastPeriodEntries
        .map((e) => mapFlowVolume(e?.flowVolume))
        .filter((v) => typeof v === "number");
      const flowScore04 = flowScores.length ? mean(flowScores) : 0;
      const impact01 = impactScore01FromPeriodEntries(lastPeriodEntries);
      const blendedScore04 = blendFlowAndImpactTo04(flowScore04, impact01);
      hmbImpactScore = blendedScore04 * 2.5;

      const soakedThroughDays = lastPeriodEntries.filter((e) => Boolean(e?.soakedThrough)).length;
      const floodingDays = lastPeriodEntries.filter((e) => Boolean(e?.flooding)).length;
      const largeClotsDays = lastPeriodEntries.filter((e) => Boolean(e?.largeClots)).length;
      const padCounts = lastPeriodEntries
        .map((e) => (typeof e?.padChangeCount === "number" ? e.padChangeCount : null))
        .filter((v) => typeof v === "number");
      const impactScores = lastPeriodEntries
        .map((e) => (typeof e?.bleedingImpact === "number" ? e.bleedingImpact : null))
        .filter((v) => typeof v === "number");

      hmbDetails = {
        periodDays: lastPeriodEntries.length,
        soakedThroughDays,
        floodingDays,
        largeClotsDays,
        avgPadChangeCount: padCounts.length ? Number(mean(padCounts).toFixed(1)) : 0,
        avgBleedingImpact: impactScores.length ? Number(mean(impactScores).toFixed(1)) : 0,
        flowScore04: Number(flowScore04.toFixed(2)),
        blendedBleedingScore04: Number(blendedScore04.toFixed(2)),
      };
    }
  }

  hmbImpactScore = clamp(Number(hmbImpactScore.toFixed(2)), 0, 10);
  // Thresholds aligned with model red-flag logic:
  // bleeding_volume_score >= 3 (on 0..4 scale) => high.
  const bleedingScore04ForBurden = hmbImpactScore / 2.5;
  const hmbBurdenLevel =
    bleedingScore04ForBurden >= 3
      ? "high"
      : bleedingScore04ForBurden >= 2
      ? "medium"
      : "low";

  let painOutsidePeriodDays = 0;
  if (safeEntries.length) {
    const lastDate = toDateUTC(safeEntries[safeEntries.length - 1].entryDate);
    const cutoff = lastDate ? new Date(lastDate.getTime() - 30 * MS_PER_DAY) : null;
    const inLastPeriod = lastPeriod
      ? {
          start: toDateUTC(lastPeriod.startDate),
          end: toDateUTC(lastPeriod.endDate),
        }
      : null;

    for (const e of safeEntries) {
      const d = toDateUTC(e.entryDate);
      if (!d || !cutoff || d.getTime() < cutoff.getTime()) continue;
      if (inLastPeriod?.start && inLastPeriod?.end) {
        if (
          d.getTime() >= inLastPeriod.start.getTime() &&
          d.getTime() <= inLastPeriod.end.getTime()
        ) {
          continue;
        }
      }
      const painIntensity = e?.pain?.painIntensity;
      if (typeof painIntensity === "number" && painIntensity >= 6) {
        painOutsidePeriodDays += 1;
      }
    }
  }
  const painOutsidePeriodFlag = painOutsidePeriodDays >= 3;

  const contraceptionType = user?.profile?.contraceptionType || "none";
  const postpartumBreastfeeding = Boolean(user?.profile?.postpartumBreastfeeding);
  const tryingToConceive = Boolean(user?.profile?.tryingToConceive);
  const contextActive =
    contraceptionType !== "none" || postpartumBreastfeeding || tryingToConceive;

  const loggedDays = safeEntries.length;
  let loggingRate = 0;
  const lastLoggedDate = safeEntries[loggedDays - 1]?.entryDate || null;
  if (loggedDays >= 2) {
    const first = toDateUTC(safeEntries[0]?.entryDate);
    const last = toDateUTC(safeEntries[loggedDays - 1]?.entryDate);
    const expectedDays = first && last ? (daysBetween(first, last) ?? 0) + 1 : 0;
    if (expectedDays > 0) loggingRate = loggedDays / expectedDays;
  } else if (loggedDays === 1) {
    loggingRate = 1;
  }

  return {
    detected_periods: detectedPeriods,
    cycles_tracked: cyclesTracked,
    minimum_history_met: minimumHistoryMet,
    tracking_summary: {
      cyclesTracked,
      loggingRate,
      lastLoggedDate,
    },
    extra_metrics: {
      hmb_impact_score: hmbImpactScore,
      hmb_burden_level: hmbBurdenLevel,
      hmb_details: hmbDetails,
      pain_outside_period_days: painOutsidePeriodDays,
      pain_outside_period_flag: painOutsidePeriodFlag,
      context_flags: {
        contraceptionType,
        postpartumBreastfeeding,
        tryingToConceive,
        contextActive,
      },
    },
  };
}

module.exports = {
  computeInsightsMetrics,
  computeHybridTriage,
};
