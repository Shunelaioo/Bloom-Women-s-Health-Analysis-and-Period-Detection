const mongoose = require("mongoose");

const NOTIF_TYPE_ENUM = ["daily_log", "red_flag", "warning", "system"];
const NOTIF_SEVERITY_ENUM = ["low", "medium", "high", "critical"];

const NotificationSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, trim: true, index: true },

    type: { type: String, enum: NOTIF_TYPE_ENUM, required: true },
    severity: { type: String, enum: NOTIF_SEVERITY_ENUM, required: true },

    title: { type: String, required: true, trim: true, maxlength: 200 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },

    actionUrl: { type: String, default: null },
    actionLabel: { type: String, default: null },

    /**
     * Optional key to prevent duplicates (e.g. `daily_log:2026-02-17`)
     * When provided, routes can upsert by (userId + dedupeKey).
     */
    dedupeKey: { type: String, default: null, trim: true },

    channels: {
      type: {
        inApp: { type: Boolean, default: true },
        email: { type: Boolean, default: false },
      },
      default: () => ({}),
    },

    emailMeta: {
      type: {
        to: { type: String, default: null },
        subject: { type: String, default: null },
        sentAt: { type: Date, default: null },
        error: { type: String, default: null },
      },
      default: () => ({}),
    },

    readAt: { type: Date, default: null },
    dismissedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Fast queries for a user's timeline
NotificationSchema.index({ userId: 1, createdAt: -1 });

// Dedupe if dedupeKey is provided
NotificationSchema.index(
  { userId: 1, dedupeKey: 1 },
  { unique: true, sparse: true }
);

module.exports = mongoose.model("Notification", NotificationSchema, "notifications");

