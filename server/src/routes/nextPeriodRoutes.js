const express = require("express");
const axios = require("axios");

const requireAuth = require("../db/middleware/requireAuth");
const DailyEntry = require("../models/DailyEntry");
const User = require("../models/User");
const CycleSettings = require("../models/CycleSettings");
const {
  buildPeriodServicePredictPayload,
  buildLegacyPredictionShape,
  computeFallbackCycleLength,
  canUsePeriodModel,
} = require("../utils/periodServicePayload");

const router = express.Router();

const PERIOD_SERVICE_URL =
  process.env.PERIOD_SERVICE_URL ||
  process.env.NEXT_PERIOD_MODEL_SERVICE_URL ||
  process.env.MODEL_SERVICE_URL ||
  "http://127.0.0.1:8000";

const YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

router.get("/features", requireAuth, async (req, res) => {
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
    return res.status(200).json({
      period_service_request: payload.request,
      anchors: payload.anchors,
    });
  } catch (err) {
    console.error("Next-period feature error:", err);
    return res.status(500).json({
      message: "Failed to compute period-service payload",
      error: err.message,
    });
  }
});

router.get("/prediction", requireAuth, async (req, res) => {
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

      console.error("Next-period model service error:", detail);
      return res.status(Number.isFinite(upstreamStatus) ? upstreamStatus : 502).json({
        message: "Period prediction service unavailable",
        error: detail,
        anchors: payload.anchors,
      });
    }
  } catch (err) {
    console.error("Next-period prediction error:", err);
    return res.status(500).json({
      message: "Failed to compute period prediction",
      error: err.message,
    });
  }
});

module.exports = router;
