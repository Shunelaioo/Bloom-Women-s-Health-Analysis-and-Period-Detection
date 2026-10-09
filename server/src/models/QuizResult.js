const mongoose = require("mongoose");

const quizResultSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    moduleId: { type: String, required: true },
    score: { type: Number, required: true },
    maxScore: { type: Number, required: true },
    percentage: { type: Number, default: 0 },
    level: { type: String, default: "Low" },
    bandTitle: { type: String, default: "" },
    isHighRisk: { type: Boolean, required: true },
    answers: { type: Object, default: {} },
  },
  { timestamps: true }
);

// Ensure combination of userId + moduleId is unique
quizResultSchema.index({ userId: 1, moduleId: 1 }, { unique: true });

module.exports = mongoose.model("QuizResult", quizResultSchema);
