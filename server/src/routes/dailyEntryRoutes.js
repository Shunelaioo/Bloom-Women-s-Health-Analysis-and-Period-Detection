const express = require("express");
const router = express.Router();
const axios = require("axios");

const requireAuth = require("../db/middleware/requireAuth");
const DailyEntry = require("../models/DailyEntry");
const User = require("../models/User");
const CycleSettings = require("../models/CycleSettings");
const { computeModelFeatures } = require("../utils/modelFeatures");
const { computeInsightsMetrics, computeHybridTriage } = require("../utils/insightsMetrics");
const {
  buildPeriodServicePredictPayload,
  buildLegacyPredictionShape,
  computeFallbackCycleLength,
  canUsePeriodModel,
} = require("../utils/periodServicePayload");

const MODEL_SERVICE_URL = process.env.MODEL_SERVICE_URL || "http://127.0.0.1:8000";
const PERIOD_SERVICE_URL =
  process.env.PERIOD_SERVICE_URL ||
  process.env.NEXT_PERIOD_MODEL_SERVICE_URL ||
  process.env.MODEL_SERVICE_URL ||
  "http://127.0.0.1:8000";
const MODEL_LABELS = (process.env.MODEL_LABELS || "oligomenorrhea,polymenorrhea,menorrhagia,amenorrhea,intermenstrual_bleeding")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function formatYmdLocal(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isYmd(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Create or update a daily entry
 * (unique index: userId + entryDate)
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const {
      entryDate,
      cycleNumber,
      cycleLength,
      phase,
      flowVolume,
      flowColor,
      soakedThrough,
      flooding,
      largeClots,
      padChangeCount,
      bleedingImpact,
      periodStartOverride,
      periodEndOverride,
      mood,
      sleep,
      exercises,
      totalExerciseMinutes,
      symptoms,
      pain,
      notes,
    } = req.body;

    // Basic validation
    if (!entryDate) {
      return res.status(400).json({
        message: "entryDate is required",
      });
    }
    if (!isYmd(entryDate)) {
      return res.status(400).json({
        message: "entryDate must be YYYY-MM-DD",
      });
    }
    const todayYmd = formatYmdLocal(new Date());
    if (entryDate > todayYmd) {
      return res.status(400).json({
        message: "Future daily entries are not allowed. Please select today or an earlier date.",
      });
    }

    const userId = req.user.id;

    const doc = await DailyEntry.findOneAndUpdate(
      { userId, entryDate },
      {
        userId,
        entryDate,
        cycleNumber: cycleNumber ?? null,
        cycleLength: cycleLength ?? null,
        phase: phase ?? null,
        flowVolume: flowVolume ?? null,
        flowColor: flowColor ?? null,
        soakedThrough: Boolean(soakedThrough),
        flooding: Boolean(flooding),
        largeClots: Boolean(largeClots),
        padChangeCount: padChangeCount ?? null,
        bleedingImpact: bleedingImpact ?? null,
        periodStartOverride: Boolean(periodStartOverride),
        periodEndOverride: Boolean(periodEndOverride),
        mood: mood ?? {},
        sleep: sleep ?? {},
        exercises: exercises ?? {},
        totalExerciseMinutes: totalExerciseMinutes ?? 0,
        symptoms: symptoms ?? {},
        pain: pain ?? {},
        notes: notes ?? null,
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      }
    );

    return res.status(200).json({
      message: "Daily entry saved",
      data: doc,
    });
  } catch (err) {
    console.error("❌ Daily entry save error:", err);
    return res.status(500).json({
      message: "Failed to save daily entry",
      error: err.message,
    });
  }
});

/**
 * List daily entries (optionally filtered by date range)
 * Query params:
 * - from: YYYY-MM-DD (inclusive)
 * - to:   YYYY-MM-DD (inclusive)
 * - limit: number (default 500, max 2000)
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const from = typeof req.query.from === "string" ? req.query.from : null;
    const to = typeof req.query.to === "string" ? req.query.to : null;
    const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 500;
    const limit = Number.isFinite(limitRaw) ? Math.min(2000, Math.max(1, Math.floor(limitRaw))) : 500;

    const isYmd = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
    if (from && !isYmd(from)) return res.status(400).json({ message: "Invalid 'from' date (expected YYYY-MM-DD)" });
    if (to && !isYmd(to)) return res.status(400).json({ message: "Invalid 'to' date (expected YYYY-MM-DD)" });

    const filter = { userId };
    if (from && to) filter.entryDate = { $gte: from, $lte: to };
    else if (from) filter.entryDate = { $gte: from };
    else if (to) filter.entryDate = { $lte: to };

    const entries = await DailyEntry.find(filter).sort({ entryDate: 1 }).limit(limit).lean();
    return res.status(200).json({ data: entries });
  } catch (err) {
    console.error("❌ Daily entries list error:", err);
    return res.status(500).json({
      message: "Failed to list daily entries",
      error: err.message,
    });
  }
});

/**
 * Compute model features from saved history
 */
router.get("/model-features", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const [user, entries] = await Promise.all([
      User.findById(userId).select("-passwordHash"),
      DailyEntry.find({ userId }).sort({ entryDate: 1 }).lean(),
    ]);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const payload = computeModelFeatures({ user, entries });

    return res.status(200).json(payload);
  } catch (err) {
    console.error("❌ Model features error:", err);
    return res.status(500).json({
      message: "Failed to compute model features",
      error: err.message,
    });
  }
});

/**
 * Run ML model predictions via FastAPI service
 */
router.get("/model-predictions", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const [user, entries] = await Promise.all([
      User.findById(userId).select("-passwordHash"),
      DailyEntry.find({ userId }).sort({ entryDate: 1 }).lean(),
    ]);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const features = computeModelFeatures({ user, entries });
    const metrics = computeInsightsMetrics({ user, entries, modelFeatures: features });


    try {
      const { data } = await axios.post(
        `${MODEL_SERVICE_URL}/predict`,
        {
          features,
          labels: MODEL_LABELS,
        },
        { timeout: 12000 }
      );

      const predictions = data?.predictions ?? [];
      const hybridTriage = computeHybridTriage({
        modelPredictions: predictions,
        modelFeatures: features,
        metrics,
      });

      return res.status(200).json({
        features,
        predictions,
        hybrid_triage: hybridTriage,
        minimum_history_met: metrics.minimum_history_met,
        detected_periods: metrics.detected_periods,
        tracking_summary: metrics.tracking_summary,
        extra_metrics: metrics.extra_metrics,
      });
    } catch (err) {
      console.error("🚫 Model service error:", err?.message || err);
      const predictions = [];
      const hybridTriage = computeHybridTriage({
        modelPredictions: predictions,
        modelFeatures: features,
        metrics,
      });
      return res.status(502).json({
        message: "Model service unavailable",
        error: err?.message || "Unknown error",
        features,
        predictions,
        hybrid_triage: hybridTriage,
        minimum_history_met: metrics.minimum_history_met,
        detected_periods: metrics.detected_periods,
        tracking_summary: metrics.tracking_summary,
        extra_metrics: metrics.extra_metrics,
      });
    }
  } catch (err) {
    console.error("🚫 Model predictions error:", err);
    return res.status(500).json({
      message: "Failed to compute model predictions",
      error: err.message,
    });
  }
});

/**
 * Predict next-period dates from period_service model
 */
router.get("/period-predictions", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const [user, entries, cycleSettings] = await Promise.all([
      User.findById(userId).select("-passwordHash"),
      DailyEntry.find({ userId, entryDate: { $regex: YMD_REGEX } }).sort({ entryDate: 1 }).lean(),
      CycleSettings.findOne({ userId }).lean(),
    ]);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const payload = buildPeriodServicePredictPayload({ user, entries, cycleSettings });
    const modelReadiness = canUsePeriodModel(payload.anchors);

    if (!modelReadiness.ok) {
      const fallbackCycleLength = computeFallbackCycleLength({
        anchors: payload.anchors,
        cycleSettings,
        user,
        entries,
      });
      return res.status(200).json({
        prediction: buildLegacyPredictionShape({
          serviceData: { predicted_cycle_length_days: fallbackCycleLength },
          anchors: payload.anchors,
        }),
        anchors: payload.anchors,
        used_features: null,
        future_period_starts: [],
        fallback: {
          active: true,
          reason: modelReadiness.reason,
          cycle_length_days: fallbackCycleLength,
        },
      });
    }

    try {
      const { data } = await axios.post(
        `${PERIOD_SERVICE_URL}/period-predict`,
        payload.request,
        { timeout: 12000 }
      );

      return res.status(200).json({
        prediction: buildLegacyPredictionShape({
          serviceData: data,
          anchors: payload.anchors,
        }),
        anchors: payload.anchors,
        used_features: data?.used_features ?? null,
        future_period_starts: Array.isArray(data?.future_period_starts) ? data.future_period_starts : [],
      });
    } catch (err) {
      const upstream = err?.response?.data || {};
      const upstreamStatus = Number(err?.response?.status);
      const detail =
        (typeof upstream?.detail === "string" && upstream.detail) ||
        (typeof upstream?.error === "string" && upstream.error) ||
        (typeof upstream?.message === "string" && upstream.message) ||
        err?.message ||
        "Unknown error";

      const shouldFallback =
        upstreamStatus === 400 &&
        /not enough period history|outside \[\s*21\s*,\s*38\s*\]|can'?t build reliable features/i.test(detail);

      if (shouldFallback) {
        const fallbackCycleLength = computeFallbackCycleLength({
          anchors: payload.anchors,
          cycleSettings,
          user,
          entries,
        });
        return res.status(200).json({
          prediction: buildLegacyPredictionShape({
            serviceData: { predicted_cycle_length_days: fallbackCycleLength },
            anchors: payload.anchors,
          }),
          anchors: payload.anchors,
          used_features: null,
          future_period_starts: [],
          fallback: {
            active: true,
            reason: detail,
            cycle_length_days: fallbackCycleLength,
          },
        });
      }

      console.error("Period service error:", detail);
      return res.status(Number.isFinite(upstreamStatus) ? upstreamStatus : 502).json({
        message: "Period prediction service unavailable",
        error: detail,
        prediction: null,
        anchors: payload.anchors,
      });
    }
  } catch (err) {
    console.error("Period predictions route error:", err);
    return res.status(500).json({
      message: "Failed to compute period predictions",
      error: err.message,
    });
  }
});

/**
 * Get a daily entry by date (for update checks)
 */
router.get("/:entryDate", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { entryDate } = req.params;

    if (!entryDate) {
      return res.status(400).json({ message: "entryDate is required" });
    }
    if (!isYmd(entryDate)) {
      return res.status(400).json({ message: "entryDate must be YYYY-MM-DD" });
    }

    const doc = await DailyEntry.findOne({ userId, entryDate }).lean();
    return res.status(200).json({ data: doc || null });
  } catch (err) {
    console.error("❌ Daily entry fetch error:", err);
    return res.status(500).json({
      message: "Failed to fetch daily entry",
      error: err.message,
    });
  }
});

module.exports = router;
