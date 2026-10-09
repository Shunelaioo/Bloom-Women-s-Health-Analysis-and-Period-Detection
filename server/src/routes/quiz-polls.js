const express = require("express");
const router = express.Router();

const requireAuth = require("../db/middleware/requireAuth");
const QuizVote = require("../models/QuizVote");

/**
 * GET /api/quiz-polls/:moduleId
 * Returns poll stats for all questions in the module:
 * {
 *   "0": { total: 100, counts: [10,20,30,40], percents: [10,20,30,40] },
 *   "1": ...
 * }
 */
router.get("/:moduleId", requireAuth, async (req, res) => {
  try {
    const { moduleId } = req.params;

    const agg = await QuizVote.aggregate([
      { $match: { moduleId } },
      {
        $group: {
          _id: { questionIndex: "$questionIndex", optionIndex: "$optionIndex" },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: "$_id.questionIndex",
          options: {
            $push: { optionIndex: "$_id.optionIndex", count: "$count" },
          },
          total: { $sum: "$count" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const out = {};
    for (const q of agg) {
      // Determine option count array length (max index + 1)
      const maxIdx = q.options.reduce((m, o) => Math.max(m, o.optionIndex), -1);
      const counts = Array.from({ length: maxIdx + 1 }, () => 0);

      for (const o of q.options) counts[o.optionIndex] = o.count;

      const total = q.total || 0;
      const percents = counts.map((c) => (total > 0 ? Math.round((c / total) * 100) : 0));

      out[String(q._id)] = { total, counts, percents };
    }

    return res.json(out);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch quiz polls" });
  }
});

/**
 * POST /api/quiz-polls/vote
 * Body: { moduleId, questionIndex, optionIndex }
 * Upserts the user’s vote and returns updated stats for that question:
 * { questionIndex, total, counts, percents }
 */
router.post("/vote", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { moduleId, questionIndex, optionIndex } = req.body;

    if (
      typeof moduleId !== "string" ||
      typeof questionIndex !== "number" ||
      typeof optionIndex !== "number"
    ) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    await QuizVote.findOneAndUpdate(
      { userId, moduleId, questionIndex },
      { optionIndex },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Recompute stats for that one question (fast)
    const votes = await QuizVote.find({ moduleId, questionIndex }).select("optionIndex");
    const total = votes.length;

    const maxIdx = votes.reduce((m, v) => Math.max(m, v.optionIndex), -1);
    const counts = Array.from({ length: maxIdx + 1 }, () => 0);
    for (const v of votes) counts[v.optionIndex] += 1;

    const percents = counts.map((c) => (total > 0 ? Math.round((c / total) * 100) : 0));

    return res.json({ questionIndex, total, counts, percents });
  } catch (err) {
    // Duplicate key errors can happen if two requests race — treat as OK
    if (err && err.code === 11000) {
      return res.status(409).json({ error: "Vote already exists" });
    }
    console.error(err);
    return res.status(500).json({ error: "Failed to vote" });
  }
});

module.exports = router;
