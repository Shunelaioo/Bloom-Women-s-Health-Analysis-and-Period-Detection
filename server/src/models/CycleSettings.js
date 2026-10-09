const mongoose = require("mongoose");

const CycleSettingsSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
    },

    cycleLengthDays: {
      type: Number,
      min: 15,
      max: 60,
      required: true,
    },

    periodLengthDays: {
      type: Number,
      min: 1,
      max: 14,
      default: 5,
    },

    lastPeriodStart: {
      type: String, // YYYY-MM-DD
      required: true,
    },

    predictedNextPeriodDate: {
      type: String, // YYYY-MM-DD
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "CycleSettings",
  CycleSettingsSchema,
  "cycle_settings"
);
