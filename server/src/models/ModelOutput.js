const mongoose = require("mongoose");

const ModelOutputSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },

    entryDate: {
      type: String,
      required: true, // YYYY-MM-DD
    },

    modelVersion: {
      type: String,
      required: true,
      default: "v1",
    },

    predictions: {
      cyclePhase: {
        type: String,
        enum: ["menstrual", "follicular", "ovulation", "luteal"],
      },

      ovulationProbability: {
        type: Number,
        min: 0,
        max: 1,
      },

      fertilityScore: {
        type: Number,
        min: 0,
        max: 100,
      },

      riskFlags: {
        type: [String],
        default: [],
      },
    },

    confidence: {
      type: Number,
      min: 0,
      max: 1,
    },

    sourceDataHash: {
      type: String,
      description: "Hash of daily_entries used for prediction",
    },
  },
  { timestamps: true }
);

// ✅ Prevent duplicate prediction per day per model
ModelOutputSchema.index(
  { userId: 1, entryDate: 1, modelVersion: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "ModelOutput",
  ModelOutputSchema,
  
);
