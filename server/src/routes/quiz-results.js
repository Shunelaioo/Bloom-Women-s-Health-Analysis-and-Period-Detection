const express = require("express");
const router = express.Router();

const requireAuth = require("../db/middleware/requireAuth");
const QuizResult = require("../models/QuizResult");

// GET all quiz results for the logged-in user
router.get("/", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const results = await QuizResult.find({ userId }).lean();
    const mapped = {};

    results.forEach((r) => {
      const percentage =
        typeof r.percentage === "number"
          ? r.percentage
          : r.maxScore > 0
          ? Math.round((r.score / r.maxScore) * 100)
          : 0;
      mapped[r.moduleId] = {
        score: r.score,
        maxScore: r.maxScore,
        percentage,
        level: r.level || null,
        bandTitle: r.bandTitle || "",
        isHighRisk: r.isHighRisk,
        answers: r.answers || {},
        updatedAt: r.updatedAt || null,
        createdAt: r.createdAt || null,
      };
    });

    return res.status(200).json(mapped);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch quiz results" });
  }
});

// POST upsert a quiz result for the logged-in user
router.post("/", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      moduleId,
      score,
      maxScore,
      percentage,
      level,
      bandTitle,
      isHighRisk,
      answers,
    } = req.body;

    if (!moduleId) {
      return res.status(400).json({ error: "Missing moduleId" });
    }

    const safeScore = typeof score === "number" ? score : 0;
    const safeMaxScore = typeof maxScore === "number" ? maxScore : 0;
    const safePercentage =
      typeof percentage === "number"
        ? percentage
        : safeMaxScore > 0
        ? Math.round((safeScore / safeMaxScore) * 100)
        : 0;
    const safeIsHighRisk =
      typeof isHighRisk === "boolean" ? isHighRisk : String(level || "").toLowerCase() === "high";

    const result = await QuizResult.findOneAndUpdate(
      { userId, moduleId },
      {
        score: safeScore,
        maxScore: safeMaxScore,
        percentage: safePercentage,
        level: typeof level === "string" ? level : "Low",
        bandTitle: typeof bandTitle === "string" ? bandTitle : "",
        isHighRisk: safeIsHighRisk,
        answers: answers && typeof answers === "object" ? answers : {},
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      moduleId: result.moduleId,
      score: result.score,
      maxScore: result.maxScore,
      percentage: result.percentage,
      level: result.level,
      bandTitle: result.bandTitle,
      isHighRisk: result.isHighRisk,
      answers: result.answers || {},
      updatedAt: result.updatedAt,
      createdAt: result.createdAt,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to save quiz result" });
  }
});

module.exports = router;
