const express = require("express");
const router = express.Router();

const requireAuth = require("../db/middleware/requireAuth");
const DailyEntry = require("../models/DailyEntry");
const { summarizeLast3Months } = require("../utils/lastCycleSummary");
const { summarizeRecentCycles } = require("../utils/recentCyclesSummary");
const { generateInsights, safeParseInsights } = require("../services/geminiClient");

const symptomLevelToNumber = (level) => {
  if (!level || typeof level !== "string") return null;
  const v = level.trim().toLowerCase();
  if (v === "very_low") return 1;
  if (v === "low") return 2;
  if (v === "moderate") return 3;
  if (v === "high") return 4;
  if (v === "very_high") return 5;
  return null;
};

const mapPairs = (value) => {
  if (!value) return [];
  if (value instanceof Map) return Array.from(value.entries());
  if (typeof value === "object") return Object.entries(value);
  return [];
};

const mean = (arr) => (arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0);

function buildRuleBasedInsights(summary, entries = []) {
  const inRange = entries.filter((e) => {
    const d = e?.entryDate;
    return (
      typeof d === "string" &&
      typeof summary?.cycleStart === "string" &&
      typeof summary?.cycleEnd === "string" &&
      d >= summary.cycleStart &&
      d <= summary.cycleEnd
    );
  });

  const bleedingFlows = new Set(["light", "moderate", "somewhat_heavy", "heavy"]);
  const spottingFlows = new Set(["spotting_very_light", "somewhat_light"]);
  const heavyFlows = new Set(["somewhat_heavy", "heavy"]);

  const heavyBleedingDays = inRange.filter((e) => heavyFlows.has(e?.flowVolume)).length;
  const spottingDays = inRange.filter((e) => spottingFlows.has(e?.flowVolume)).length;
  const soakedThroughDays = inRange.filter((e) => e?.soakedThrough === true).length;
  const floodingDays = inRange.filter((e) => e?.flooding === true).length;
  const severePainDays = inRange.filter((e) => (e?.pain?.painIntensity ?? 0) >= 7).length;
  const lowSleepDays = inRange.filter((e) => (e?.sleep?.sleepHours ?? 24) < 6).length;
  const lowMoodDays = inRange.filter((e) => (e?.mood?.moodScore ?? 10) <= 3).length;

  const painWithMissingTimingDays = inRange.filter(
    (e) => (e?.pain?.painIntensity ?? 0) > 0 && !e?.pain?.painTiming
  ).length;
  const flowWithMissingColorDays = inRange.filter(
    (e) => bleedingFlows.has(e?.flowVolume) && !e?.flowColor
  ).length;

  const obs = [];
  const tips = new Set();
  const tracking = new Set();
  const redFlags = [];
  const questionsForDoctor = new Set();

  if (summary.cycleLengthDays) {
    if (summary.cycleLengthDays < 21) {
      obs.push(`Average cycle length is about ${summary.cycleLengthDays} days (shorter than typical 21-35 day range).`);
      questionsForDoctor.add("My cycles are often short. Should I evaluate hormonal causes or thyroid/prolactin labs?");
    } else if (summary.cycleLengthDays > 35) {
      obs.push(`Average cycle length is about ${summary.cycleLengthDays} days (longer than typical 21-35 day range).`);
      questionsForDoctor.add("My cycles are often long/irregular. Should I check for ovulation or endocrine causes?");
    } else {
      obs.push(`Average cycle length in the last 3 months was about ${summary.cycleLengthDays} days.`);
    }
  }

  obs.push(`Average bleeding days per period in the last 3 months: ${summary.bleedingDays}.`);
  obs.push(`Average pain: ${summary.pain.avg ?? 0}/10; max: ${summary.pain.max ?? 0}/10.`);
  obs.push(`Average sleep: ${summary.sleep.avgHours ?? 0} hours; low-sleep days: ${summary.sleep.lowSleepDays}.`);
  obs.push(`Exercise total: ${summary.exercise.totalMinutes ?? 0} minutes; top types: ${(summary.exercise.topTypes || []).join(", ") || "-"}.`);

  if (heavyBleedingDays > 0) {
    obs.push(`Heavy-flow days logged in this period window: ${heavyBleedingDays}.`);
  }
  if (spottingDays > 0) {
    obs.push(`Spotting days logged in this period window: ${spottingDays}.`);
  }
  if (severePainDays > 0) {
    obs.push(`High-pain days (>=7/10): ${severePainDays}.`);
  }

  if ((summary.topSymptoms || []).length) {
    const top = summary.topSymptoms.slice(0, 3).map((s) => s.name).join(", ");
    obs.push(`Most logged symptoms: ${top}.`);
  }

  if ((summary.pain.avg ?? 0) >= 4 || severePainDays >= 2) {
    tips.add("For painful days, start relief early (heat, rest, hydration, and medication only as advised by your clinician).");
  }
  if ((summary.sleep.avgHours ?? 0) < 7 || lowSleepDays >= 3) {
    tips.add("Aim for 7-9 hours sleep with a consistent bedtime; low sleep can worsen pain and mood symptoms.");
  }
  if ((summary.exercise.totalMinutes ?? 0) < 90) {
    tips.add("Add gentle movement most days (walking or stretching) to support cramps, mood, and sleep.");
  }
  if (lowMoodDays >= 3) {
    tips.add("Track low-mood days with cycle timing; if mood symptoms are severe or persistent, discuss with a clinician.");
  }
  if (heavyBleedingDays >= 2) {
    tips.add("On heavier days, track pad/tampon/cup change frequency and stay hydrated.");
  }

  tracking.add("Log flow volume + color daily during periods.");
  tracking.add("Record pain timing (before/during/after bleeding) and pain location when pain is present.");
  tracking.add("Track sleep hours and mood score daily to see cycle-linked patterns.");

  if (painWithMissingTimingDays > 0) {
    tracking.add(`Pain timing was missing on ${painWithMissingTimingDays} painful day(s); filling this helps pattern accuracy.`);
  }
  if (flowWithMissingColorDays > 0) {
    tracking.add(`Flow color was missing on ${flowWithMissingColorDays} bleeding day(s); adding color helps detect changes.`);
  }

  if (soakedThroughDays >= 1 || floodingDays >= 1) {
    redFlags.push("Very heavy bleeding signal logged (soaked-through or flooding). If this recurs or causes dizziness/fainting, seek urgent care.");
    questionsForDoctor.add("I logged soaked-through/flooding bleeding. Should I be evaluated for heavy menstrual bleeding or anemia?");
  }
  if ((summary.bleedingDays ?? 0) >= 8 || heavyBleedingDays >= 3) {
    redFlags.push("Bleeding appears prolonged/heavy in recent logs. Consider clinician review.");
    questionsForDoctor.add("My bleeding is heavy/prolonged. Should I get CBC/ferritin testing and review treatment options?");
  }
  if ((summary.pain.max ?? 0) >= 8 || severePainDays >= 3) {
    redFlags.push("Severe pain pattern appears in recent logs. Consider clinician review, especially if worsening.");
    questionsForDoctor.add("My pain reaches severe levels. Should I be evaluated for causes like endometriosis or fibroids?");
  }
  if (spottingDays >= 2) {
    redFlags.push("Spotting between expected bleeding days was logged. Monitor trend and discuss if persistent.");
    questionsForDoctor.add("I logged recurrent spotting between periods. What causes should be ruled out?");
  }

  if (redFlags.length === 0) {
    redFlags.push("No urgent red-flag pattern is obvious in current logs; continue consistent tracking for stronger accuracy.");
  }

  const minimumTips = [
    "Log flow volume and color each period day to improve pattern detection.",
    "Track pain timing and pain location on painful days to refine insight quality.",
    "Keep sleep and mood logs daily so cycle-linked changes are easier to interpret.",
  ];

  const tipList = Array.from(tips);
  for (const tip of minimumTips) {
    if (tipList.length >= 3) break;
    if (!tipList.includes(tip)) tipList.push(tip);
  }

  return {
    observations: obs,
    tips: tipList.slice(0, 5),
    tracking_suggestions: Array.from(tracking).slice(0, 5),
    red_flags: redFlags.slice(0, 4),
    questions_for_doctor: Array.from(questionsForDoctor).slice(0, 4),
  };
}

router.post("/last-cycle", requireAuth, async (req, res) => {
  try {
    const entries = await DailyEntry.find({ userId: req.user.id }).sort({ entryDate: 1 }).lean();
    const summary = summarizeLast3Months(entries);

    if (summary.error === "no_entries" || summary.error === "no_entries_in_range") {
      return res.status(422).json({ message: "Log some data to unlock personalized insights." });
    }
    if (summary.error) {
      return res.status(400).json({ message: "Unable to build cycle summary", detail: summary.error });
    }

    const allSymptomLevels = [];
    entries.forEach((e) => {
      mapPairs(e?.symptoms?.symptomLevelByTag).forEach(([, level]) => {
        const n = symptomLevelToNumber(level);
        if (typeof n === "number") allSymptomLevels.push(n);
      });
    });
    const symptomSeverityAvgAllTime = allSymptomLevels.length ? Number(mean(allSymptomLevels).toFixed(2)) : null;
    const lastCycleSummary = { ...summary, symptomSeverityAvgAllTime };
    const fallbackInsights = buildRuleBasedInsights(summary, entries);

    let insights = fallbackInsights;
    let source = "rule_based_tracking";

    if (process.env.GEMINI_API_KEY) {
      try {
        const raw = await generateInsights(lastCycleSummary);
        insights = safeParseInsights(raw);
        source = "gemini";
      } catch (llmErr) {
        console.warn(
          "Gemini insights unavailable, using rule-based fallback:",
          llmErr?.message || llmErr
        );
      }
    }

    return res.status(200).json({
      lastCycleSummary,
      insights,
      source,
    });
  } catch (err) {
    console.error("Insights error:", err?.message || err);
    return res.status(500).json({ message: "Failed to generate insights", error: err?.message || "unknown_error" });
  }
});

router.get("/recent-cycles", requireAuth, async (req, res) => {
  try {
    const entries = await DailyEntry.find({ userId: req.user.id }).sort({ entryDate: 1 }).lean();
    const nRaw = typeof req.query.n === "string" ? Number(req.query.n) : 3;
    const n = Number.isFinite(nRaw) ? Math.min(12, Math.max(1, Math.floor(nRaw))) : 3;
    const result = summarizeRecentCycles(entries, n);
    return res.status(200).json(result);
  } catch (err) {
    console.error("Recent cycles insights error:", err?.message || err);
    return res.status(500).json({ message: "Failed to summarize recent cycles", error: err?.message || "unknown_error" });
  }
});

module.exports = router;
