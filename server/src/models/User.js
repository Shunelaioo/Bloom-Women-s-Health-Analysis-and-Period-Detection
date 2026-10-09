const mongoose = require("mongoose");

const ProfileSchema = new mongoose.Schema(
  {
    displayName: String,
    avatarUrl: String,
    lifeStage: String,
    dateOfBirth: Date,
    age: Number,
    menarcheAge: Number,
    heightCm: Number,
    weightKg: Number,
    bmi: Number,
    contraceptionType: String, // none/pill/iud/implant/injection
    postpartumBreastfeeding: Boolean,
    tryingToConceive: Boolean,

    // Legacy reset-token fields (deprecated; kept for backwards compatibility)
    resetTokenHash: String,
    resetTokenExpiresAt: Date,
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    role: {
      type: String,
      default: "user",
      enum: ["user", "admin"],
    },

    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    profile: {
      type: ProfileSchema,
      default: {},
    },

    // Notification preferences saved server‑side so scheduled jobs can respect them.
    notificationPreferences: {
      dailyLogReminder: { type: Boolean, default: false },
      redFlags: { type: Boolean, default: false },
      warnings: { type: Boolean, default: false },
      emailRedFlags: { type: Boolean, default: false },
      emailDailyLogReminder: { type: Boolean, default: false },
    },

    // Old link-token fields (optional; not used by the current flow)
    resetPasswordTokenHash: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },

    // Dedup guard: stores "YYYY-MM-DD" of last sent daily reminder email
    lastDailyReminderSentDate: { type: String, default: null },

    // New code-based reset fields
    resetPasswordCodeHash: { type: String, select: false },
    resetPasswordCodeExpires: { type: Date, select: false },
    resetPasswordCodeAttempts: { type: Number, default: 0, select: false },

    // Email verification
    emailVerificationToken: { type: String, default: null },
    emailVerificationExpires: { type: Date, default: null },
    emailVerificationCodeHash: { type: String, select: false },
    emailVerificationCodeExpires: { type: Date, select: false },
    emailVerificationCodeAttempts: { type: Number, default: 0, select: false },
    emailVerificationCodeSentAt: { type: Date, default: null, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.passwordHash;
        delete ret.resetPasswordTokenHash;
        delete ret.resetPasswordExpires;
        delete ret.resetPasswordCodeHash;
        delete ret.resetPasswordCodeExpires;
        delete ret.resetPasswordCodeAttempts;
        delete ret.emailVerificationToken;
        delete ret.emailVerificationExpires;
        delete ret.emailVerificationCodeHash;
        delete ret.emailVerificationCodeExpires;
        delete ret.emailVerificationCodeAttempts;
        delete ret.emailVerificationCodeSentAt;
        return ret;
      },
    },
    toObject: {
      transform(_doc, ret) {
        delete ret.passwordHash;
        delete ret.resetPasswordTokenHash;
        delete ret.resetPasswordExpires;
        delete ret.resetPasswordCodeHash;
        delete ret.resetPasswordCodeExpires;
        delete ret.resetPasswordCodeAttempts;
        delete ret.emailVerificationToken;
        delete ret.emailVerificationExpires;
        delete ret.emailVerificationCodeHash;
        delete ret.emailVerificationCodeExpires;
        delete ret.emailVerificationCodeAttempts;
        delete ret.emailVerificationCodeSentAt;
        return ret;
      },
    },
  }
);

// 🔴 THIS LINE IS CRITICAL
module.exports = mongoose.model("User", UserSchema);
