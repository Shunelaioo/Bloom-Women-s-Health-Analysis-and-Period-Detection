const mongoose = require("mongoose");

const PHASE_ENUM = ["menstrual", "follicular", "ovulation", "luteal"];
const PAIN_TIMING_ENUM = ["before_bleeding", "during_bleeding", "after_bleeding", "not_sure"];
const RELIEF_HELPED_ENUM = ["not", "some", "a_lot"];

const DailyEntrySchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, trim: true, index: true },

    entryDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
    },

    cycleNumber: { type: Number, min: 1, max: 5000, default: null },
    cycleLength: { type: Number, min: 10, max: 120, default: null },
    phase: { type: String, enum: [...PHASE_ENUM, null], default: null },

    flowVolume: { type: String, default: null },
    flowColor: { type: String, default: null },
    spottingToday: { type: Boolean, default: false },

    // Bleeding impact signals
    soakedThrough: { type: Boolean, default: false }, // soaked through in <2 hours
    flooding: { type: Boolean, default: false }, // leaked onto clothes/bedding
    largeClots: { type: Boolean, default: false },
    padChangeCount: { type: Number, min: 0, max: 50, default: null },
    bleedingImpact: { type: Number, min: 0, max: 4, default: null }, // quality-of-life burden (0–4)
    periodStartOverride: { type: Boolean, default: false },
    periodEndOverride: { type: Boolean, default: false },

    mood: {
      type: {
        selectedMood: { type: String, default: null },
        moodScore: { type: Number, min: 0, max: 10, default: null },
      },
      default: () => ({}),
    },

    sleep: {
      type: {
        selectedSleep: { type: String, default: null },
        sleepHours: { type: Number, min: 0, max: 24, default: null },
      },
      default: () => ({}),
    },

    exercises: {
      type: {
        selectedExercises: { type: [String], default: [] },
        exerciseMinutesByType: { type: Map, of: Number, default: {} },
      },
      default: () => ({}),
    },

    totalExerciseMinutes: { type: Number, min: 0, max: 6000, default: 0 },

    symptoms: {
      type: {
        selectedSymptomTags: { type: [String], default: [] },
        symptomLevelByTag: { type: Map, of: String, default: {} },
      },
      default: () => ({}),
    },

    pain: {
      type: {
        painIntensity: { type: Number, min: 0, max: 10, default: 0 },
        painWorst: { type: Number, min: 0, max: 10, default: null },
        painInterference: { type: String, default: null }, // none/mild/moderate/severe
        painSelectedAreas: { type: [String], default: [] },
        painTiming: { type: String, enum: [...PAIN_TIMING_ENUM, null], default: null },
        reliefUsed: { type: [String], default: [] },
        reliefHelped: { type: String, enum: [...RELIEF_HELPED_ENUM, null], default: null },
      },
      default: () => ({}),
    },

    notes: { type: String, default: null },
  },
  { timestamps: true }
);

DailyEntrySchema.index({ userId: 1, entryDate: 1 }, { unique: true });

module.exports = mongoose.model("DailyEntry", DailyEntrySchema, "dailyentries");
