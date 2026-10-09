const mongoose = require("mongoose");

const SymptomSummarySchema = new mongoose.Schema(
  {
    crampsAvg: { type: Number, min: 0, max: 10 },
    headacheAvg: { type: Number, min: 0, max: 10 },
    acneAvg: { type: Number, min: 0, max: 10 },
    moodAvg_1to5: { type: Number, min: 1, max: 5 },
    sleepAvgHours: { type: Number, min: 0, max: 24 },
    totalExerciseMinutes: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const CycleSummarySchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },

    cycleId: { type: String, required: true },

    cycleStartDate: { type: String, required: true }, // YYYY-MM-DD
    cycleEndDate: { type: String, default: null },     // allow null until completed

    cycleLengthDays: { type: Number, min: 10, max: 120, default: null },
    periodLengthDays: { type: Number, min: 1, max: 20, default: null },

    ovulationDate: { type: String, default: null },
    ovulationSource: {
      type: String,
      enum: ["unknown", "user_reported", "lh_test", "bbt", "model_predicted"],
      default: "unknown",
    },

    lutealPhaseDays: { type: Number, min: 5, max: 30, default: null },

    isCycleComplete: { type: Boolean, default: false },
    cycleRegularityScore: { type: Number, min: 0, max: 100, default: null },

    intercourseCount: { type: Number, min: 0, default: 0 },
    fertileWindowStart: { type: String, default: null },
    fertileWindowEnd: { type: String, default: null },

    pregnancyTestResult: {
      type: String,
      enum: ["unknown", "negative", "positive"],
      default: "unknown",
    },

    symptomSummary: { type: SymptomSummarySchema, default: null },

    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

CycleSummarySchema.index({ userId: 1, cycleId: 1 }, { unique: true });
CycleSummarySchema.index({ userId: 1, cycleStartDate: -1 });

module.exports = mongoose.model("CycleSummary", CycleSummarySchema, "cycle_summaries");
