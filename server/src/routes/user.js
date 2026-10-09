const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const requireAuth = require("../db/middleware/requireAuth");
const User = require("../models/User");
const CycleSettings = require("../models/CycleSettings");
const DailyEntry = require("../models/DailyEntry");
const { calculateBMI } = require("../utils/bmi");
const { sendResetCodeEmail, isEmailConfigured, sendVerificationCodeEmail } = require("../utils/mailer");
const { sendDailyLogReminderForUser } = require("../services/scheduledJobs");

const router = express.Router();

/* ---------- helpers ---------- */

function signToken(user) {
  return jwt.sign(
    // include both sub and userId for compatibility with existing middleware
    { sub: user._id.toString(), userId: user._id.toString(), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function calcAge(dob) {
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  if (
    now.getMonth() < dob.getMonth() ||
    (now.getMonth() === dob.getMonth() &&
      now.getDate() < dob.getDate())
  ) {
    age--;
  }
  return age;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function isYmd(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function issueVerificationCodeForUser(user, displayName) {
  const smtpConfigured = isEmailConfigured();
  const forceExposeVerificationCode = process.env.EXPOSE_VERIFICATION_CODE === "true";
  const exposeDevCode =
    forceExposeVerificationCode || (process.env.NODE_ENV !== "production" && !smtpConfigured);

  const verificationCode = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  const codeHash = sha256Hex(verificationCode);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  const sentAt = new Date();

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        emailVerificationCodeHash: codeHash,
        emailVerificationCodeExpires: expiresAt,
        emailVerificationCodeAttempts: 0,
        emailVerificationCodeSentAt: sentAt,

        // Clear legacy link fields
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
    }
  );

  let delivery = smtpConfigured ? "sent" : "smtp_unavailable";
  try {
    await sendVerificationCodeEmail({
      to: user.email,
      code: verificationCode,
      displayName,
    });
  } catch (mailErr) {
    delivery = "smtp_unavailable";
    console.error("verification email error:", mailErr);
  }

  return {
    delivery,
    devVerificationCode: exposeDevCode ? verificationCode : null,
  };
}

/* ---------- routes ---------- */

// SIGNUP
router.post("/signup", async (req, res) => {
  try {
    const { email, password, displayName, name, lifeStage, menarcheAge } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "Missing fields" });

    if (String(password).length < 8)
      return res.status(400).json({ message: "Password must be at least 8 characters" });

    const resolvedMenarcheAge = Number(menarcheAge);
    if (!Number.isFinite(resolvedMenarcheAge) || resolvedMenarcheAge < 8 || resolvedMenarcheAge > 25) {
      return res.status(400).json({ message: "menarcheAge must be a number between 8 and 25" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const resolvedName = displayName ?? name;

    const exists = await User.findOne({ email: normalizedEmail });
    if (exists)
      return res.status(409).json({ message: "Email already exists" });

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      email: normalizedEmail,
      passwordHash,
      profile: {
        displayName: resolvedName,
        lifeStage: lifeStage || "unknown",
        menarcheAge: resolvedMenarcheAge,
      },
    });

    const token = signToken(user);

    // Send verification email (fire-and-forget — don't block signup on email failure)
    // Generate and send a verification code.
    const verification = await issueVerificationCodeForUser(user, resolvedName);
    res.status(201).json({ token, user, verification });
  } catch (err) {
    console.error("signup error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Missing email or password" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail }).select("+passwordHash");
    if (!user) return res.status(401).json({ message: "Invalid login" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: "Invalid login" });

    const token = signToken(user);
    res.json({ token, user });
  } catch (err) {
    console.error("login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// VERIFY EMAIL — GET /api/user/verify-email?token=xxx
router.get("/verify-email", async (req, res) => {
  try {
    const { token } = req.query;
    if (!token || typeof token !== "string") {
      return res.status(400).json({ message: "Missing token" });
    }

    const tokenHash = sha256Hex(token.trim());
    const user = await User.findOne({ emailVerificationToken: tokenHash });

    if (!user) return res.status(400).json({ message: "Invalid or already used verification link" });

    const expires = user.emailVerificationExpires;
    if (!expires || new Date(expires).getTime() < Date.now()) {
      return res.status(400).json({ message: "Verification link has expired. Please request a new one." });
    }

    await User.updateOne(
      { _id: user._id },
      { $set: { isEmailVerified: true, emailVerificationToken: null, emailVerificationExpires: null } }
    );

    return res.json({ ok: true, message: "Email verified successfully" });
  } catch (err) {
    console.error("verify-email error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// RESEND VERIFICATION — POST /api/user/resend-verification (auth required)
// Confirm a signed-in user's verification code.
router.post("/verify-email/confirm", requireAuth, async (req, res) => {
  try {
    const { code } = req.body || {};
    const normalizedCode = String(code || "").trim();
    if (!normalizedCode) {
      return res.status(400).json({ message: "Verification code is required" });
    }

    const user = await User.findById(req.user.id).select(
      "+emailVerificationCodeHash +emailVerificationCodeExpires +emailVerificationCodeAttempts"
    );
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.isEmailVerified) return res.json({ ok: true, message: "Email already verified" });

    const expectedHash = user.emailVerificationCodeHash || null;
    const expiresAt = user.emailVerificationCodeExpires || null;
    if (!expectedHash || !expiresAt) {
      return res.status(400).json({ message: "No active verification code. Request a new one." });
    }

    const exp = new Date(expiresAt);
    if (Number.isNaN(exp.getTime()) || exp.getTime() < Date.now()) {
      return res.status(400).json({ message: "Verification code expired. Request a new one." });
    }

    const maxAttempts = 5;
    const attempts = Number(user.emailVerificationCodeAttempts || 0);
    if (attempts >= maxAttempts) {
      return res.status(429).json({ message: "Too many attempts. Request a new code." });
    }

    const incomingHash = sha256Hex(normalizedCode);
    if (incomingHash !== expectedHash) {
      const nextAttempts = attempts + 1;
      user.emailVerificationCodeAttempts = nextAttempts;
      if (nextAttempts >= maxAttempts) {
        user.emailVerificationCodeHash = null;
        user.emailVerificationCodeExpires = null;
      }
      await user.save();
      return res.status(400).json({ message: "Invalid verification code" });
    }

    user.isEmailVerified = true;
    user.emailVerificationCodeHash = null;
    user.emailVerificationCodeExpires = null;
    user.emailVerificationCodeAttempts = 0;
    user.emailVerificationCodeSentAt = null;
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;
    await user.save();

    return res.json({ ok: true, message: "Email verified successfully" });
  } catch (err) {
    console.error("verify-email confirm error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

async function sendVerificationCodeHandler(req, res) {
  try {
    const user = await User.findById(req.user.id).select("+emailVerificationCodeSentAt");
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.isEmailVerified) {
      return res.status(400).json({ message: "Email is already verified" });
    }

    const prevSentAt = user.emailVerificationCodeSentAt
      ? new Date(user.emailVerificationCodeSentAt).getTime()
      : 0;
    if (Date.now() - prevSentAt < 60 * 1000) {
      return res.status(429).json({ message: "Please wait a moment before requesting another code" });
    }

    const result = await issueVerificationCodeForUser(user, user.profile?.displayName);
    return res.json({ ok: true, message: "Verification code sent", ...result });
  } catch (err) {
    console.error("verification request error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

router.post("/verify-email/request", requireAuth, sendVerificationCodeHandler);
router.post("/resend-verification", requireAuth, sendVerificationCodeHandler);

// ME
router.get("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id).select("-passwordHash");
  res.json(user);
});

// GET notification preferences
router.get("/preferences", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("notificationPreferences").lean();
    const prefs = user?.notificationPreferences || {};
    // Email-only notification settings: keep in-app toggles disabled.
    const response = {
      dailyLogReminder: false,
      redFlags: false,
      warnings: false,
      emailRedFlags: prefs.emailRedFlags === true,
      emailDailyLogReminder: prefs.emailDailyLogReminder === true,
    };
    res.json(response);
  } catch (err) {
    console.error("fetch preferences error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT notification preferences
router.put("/preferences", requireAuth, async (req, res) => {
  try {
    const allowed = [
      "emailRedFlags",
      "emailDailyLogReminder",
    ];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        update[`notificationPreferences.${key}`] = Boolean(req.body[key]);
      }
    }
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: "No preferences provided" });
    }
    await User.updateOne({ _id: req.user.id }, { $set: update });
    const user = await User.findById(req.user.id).select("notificationPreferences").lean();

    // If the user just enabled email daily reminders, attempt an immediate send
    // (eligibility + dedupe checks still apply).
    if (req.body.emailDailyLogReminder === true) {
      sendDailyLogReminderForUser(req.user.id).catch((err) => {
        console.error("daily reminder immediate-send error:", err);
      });
    }

    res.json(user?.notificationPreferences || {});
  } catch (err) {
    console.error("update preferences error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET CYCLE SETTINGS
router.get("/settings", requireAuth, async (req, res) => {
  try {
    const settings = await CycleSettings.findOne({ userId: req.user.id });
    res.json(settings || null);
  } catch (err) {
    console.error("settings fetch error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ONBOARDING
router.post("/onboarding", requireAuth, async (req, res) => {
  const {
    dateOfBirth,
    heightCm,
    weightKg,
    cycleLengthDays,
    periodLengthDays,
    lastPeriodStart,
  } = req.body;

  const dob = new Date(dateOfBirth);
  const age = calcAge(dob);
  const bmi = calculateBMI(heightCm, weightKg);

  const user = await User.findById(req.user.id);
  user.profile = {
    ...user.profile,
    dateOfBirth: dob,
    age,
    heightCm,
    weightKg,
    bmi,
  };
  await user.save();

  const cycle = await CycleSettings.findOneAndUpdate(
    { userId: user._id.toString() },
    {
      userId: user._id.toString(),
      cycleLengthDays,
      periodLengthDays,
      lastPeriodStart,
      predictedNextPeriodDate: addDays(lastPeriodStart, cycleLengthDays),
    },
    { upsert: true, new: true }
  );

  res.json({ user, cycle });
});

// UPDATE PROFILE
router.put("/profile", requireAuth, async (req, res) => {
  try {
    const {
      displayName,
      avatarUrl,
      lifeStage,
      contraceptionType,
      postpartumBreastfeeding,
      tryingToConceive,
      email,
      dateOfBirth,
      menarcheAge,
      heightCm,
      weightKg,
      cycleLengthDays,
      periodLengthDays,
      lastPeriodStart,
      notificationPreferences,
    } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (email !== undefined) {
      const normalizedEmail = String(email).trim().toLowerCase();
      if (!normalizedEmail) {
        return res.status(400).json({ message: "Email cannot be empty" });
      }
      if (normalizedEmail !== user.email) {
        const exists = await User.findOne({ email: normalizedEmail }).select("_id").lean();
        if (exists) return res.status(409).json({ message: "Email already exists" });
        user.email = normalizedEmail;
      }
    }

    const nextDob =
      dateOfBirth !== undefined
        ? (dateOfBirth ? new Date(dateOfBirth) : null)
        : (user.profile?.dateOfBirth ?? null);
    const nextHeight =
      heightCm !== undefined ? (heightCm === null || heightCm === "" ? null : Number(heightCm)) : (user.profile?.heightCm ?? null);
    const nextWeight =
      weightKg !== undefined ? (weightKg === null || weightKg === "" ? null : Number(weightKg)) : (user.profile?.weightKg ?? null);
    const nextMenarcheAge =
      menarcheAge !== undefined
        ? (menarcheAge === null || menarcheAge === "" ? null : Number(menarcheAge))
        : (user.profile?.menarcheAge ?? null);
    if (
      menarcheAge !== undefined &&
      nextMenarcheAge !== null &&
      (!Number.isFinite(nextMenarcheAge) || nextMenarcheAge < 8 || nextMenarcheAge > 25)
    ) {
      return res.status(400).json({ message: "menarcheAge must be a number between 8 and 25" });
    }

    const nextAge = nextDob instanceof Date && !Number.isNaN(nextDob.getTime()) ? calcAge(nextDob) : null;
    const nextBmi =
      typeof nextHeight === "number" && typeof nextWeight === "number"
        ? calculateBMI(nextHeight, nextWeight)
        : null;

    user.profile = {
      ...user.profile,
      ...(displayName !== undefined ? { displayName } : {}),
      ...(avatarUrl !== undefined ? { avatarUrl } : {}),
      ...(lifeStage !== undefined ? { lifeStage } : {}),
      ...(contraceptionType !== undefined ? { contraceptionType } : {}),
      ...(postpartumBreastfeeding !== undefined ? { postpartumBreastfeeding: Boolean(postpartumBreastfeeding) } : {}),
      ...(tryingToConceive !== undefined ? { tryingToConceive: Boolean(tryingToConceive) } : {}),
      ...(dateOfBirth !== undefined ? { dateOfBirth: nextDob } : {}),
      ...(menarcheAge !== undefined ? { menarcheAge: nextMenarcheAge } : {}),
      ...(heightCm !== undefined ? { heightCm: nextHeight } : {}),
      ...(weightKg !== undefined ? { weightKg: nextWeight } : {}),
      ...(dateOfBirth !== undefined ? { age: nextAge } : {}),
      ...((heightCm !== undefined || weightKg !== undefined) ? { bmi: nextBmi } : {}),
    };

    // update notification preferences if provided
    if (notificationPreferences && typeof notificationPreferences === "object") {
      user.notificationPreferences = {
        ...user.notificationPreferences,
        ...notificationPreferences,
      };
    }

    await user.save();

    let updatedCycleSettings = null;

    // Optional: update cycle settings when provided.
    if (
      cycleLengthDays !== undefined ||
      periodLengthDays !== undefined ||
      lastPeriodStart !== undefined
    ) {
      const existing = await CycleSettings.findOne({ userId: user._id.toString() });
      const resolvedCycleLength =
        cycleLengthDays !== undefined ? Number(cycleLengthDays) : existing?.cycleLengthDays;
      const resolvedPeriodLength =
        periodLengthDays !== undefined ? Number(periodLengthDays) : existing?.periodLengthDays;
      const resolvedLastStart =
        lastPeriodStart !== undefined ? String(lastPeriodStart) : existing?.lastPeriodStart;

      const cycleLengthValid =
        typeof resolvedCycleLength === "number" &&
        Number.isFinite(resolvedCycleLength) &&
        resolvedCycleLength >= 15 &&
        resolvedCycleLength <= 60;
      const periodLengthValid =
        resolvedPeriodLength === undefined ||
        resolvedPeriodLength === null ||
        (Number.isFinite(resolvedPeriodLength) && resolvedPeriodLength >= 1 && resolvedPeriodLength <= 14);
      const lastStartValid = isYmd(resolvedLastStart);

      if (!cycleLengthValid || !lastStartValid || !periodLengthValid) {
        return res.status(400).json({ message: "Invalid cycle settings values" });
      }

      const predictedNextPeriodDate = addDays(resolvedLastStart, resolvedCycleLength);
      updatedCycleSettings = await CycleSettings.findOneAndUpdate(
        { userId: user._id.toString() },
        {
          userId: user._id.toString(),
          cycleLengthDays: resolvedCycleLength,
          periodLengthDays: resolvedPeriodLength ?? 5,
          lastPeriodStart: resolvedLastStart,
          predictedNextPeriodDate,
        },
        { upsert: true, new: true, runValidators: true }
      );
    } else {
      updatedCycleSettings = await CycleSettings.findOne({ userId: user._id.toString() });
    }

    res.json({ user, cycleSettings: updatedCycleSettings });
  } catch (err) {
    console.error("profile update error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// CHANGE PASSWORD (signed-in)
router.post("/change-password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Missing fields" });
    }
    if (String(newPassword).length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const user = await User.findById(req.user.id).select("+passwordHash");
    if (!user) return res.status(404).json({ message: "User not found" });

    const ok = await bcrypt.compare(String(currentPassword), user.passwordHash);
    if (!ok) return res.status(401).json({ message: "Current password is incorrect" });

    user.passwordHash = await bcrypt.hash(String(newPassword), 10);
    await user.save();

    return res.json({ ok: true });
  } catch (err) {
    console.error("change-password error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// RESET PASSWORD (not signed-in): request code
router.post("/reset-password/request", async (req, res) => {
  try {
    const { email } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail) return res.status(400).json({ message: "Email is required" });
    const smtpConfigured = isEmailConfigured();
    const forceExposeResetCode = process.env.EXPOSE_RESET_CODE === "true";
    const exposeDevCode =
      forceExposeResetCode || (process.env.NODE_ENV !== "production" && !smtpConfigured);

    const user = await User.findOne({ email: normalizedEmail }).select("_id email").lean();
    // Avoid user enumeration: always respond 200.
    if (!user) {
      return res.json({
        ok: true,
        delivery: smtpConfigured ? "sent_if_exists" : "smtp_unavailable",
        devResetCode: null,
      });
    }

    const resetCode = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    const codeHash = sha256Hex(resetCode);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          resetPasswordCodeHash: codeHash,
          resetPasswordCodeExpires: expiresAt,
          resetPasswordCodeAttempts: 0,

          // Clear legacy/unused fields
          resetPasswordTokenHash: null,
          resetPasswordExpires: null,
          "profile.resetTokenHash": null,
          "profile.resetTokenExpiresAt": null,
        },
      }
    );

    let delivery = smtpConfigured ? "sent_if_exists" : "smtp_unavailable";
    try {
      await sendResetCodeEmail({ to: user.email, code: resetCode });
    } catch (mailErr) {
      delivery = "smtp_unavailable";
      console.error("reset-password request email error:", mailErr);
      // Still respond OK to avoid user enumeration.
    }

    return res.json({
      ok: true,
      delivery,
      devResetCode: exposeDevCode ? resetCode : null,
    });
  } catch (err) {
    console.error("reset-password request error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// RESET PASSWORD (not signed-in): confirm with code
router.post("/reset-password/confirm", async (req, res) => {
  try {
    const { email, resetCode, resetToken, newPassword } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const code = String(resetCode ?? resetToken ?? "").trim();
    if (!normalizedEmail || !code || !newPassword) {
      return res.status(400).json({ message: "Missing fields" });
    }
    if (String(newPassword).length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const user = await User.findOne({ email: normalizedEmail }).select(
      "+resetPasswordCodeHash +resetPasswordCodeExpires +resetPasswordCodeAttempts"
    );
    if (!user) return res.status(400).json({ message: "Invalid reset token" });

    const expectedHash = user.resetPasswordCodeHash || null;
    const expiresAt = user.resetPasswordCodeExpires || null;
    if (!expectedHash || !expiresAt) return res.status(400).json({ message: "Invalid reset token" });

    const exp = new Date(expiresAt);
    if (Number.isNaN(exp.getTime()) || exp.getTime() < Date.now()) {
      return res.status(400).json({ message: "Reset token expired" });
    }

    const maxAttempts = 5;
    const attempts = Number(user.resetPasswordCodeAttempts || 0);
    if (attempts >= maxAttempts) {
      return res.status(429).json({ message: "Too many attempts. Request a new code." });
    }

    const incomingHash = sha256Hex(code);
    if (incomingHash !== expectedHash) {
      const nextAttempts = attempts + 1;
      user.resetPasswordCodeAttempts = nextAttempts;
      if (nextAttempts >= maxAttempts) {
        user.resetPasswordCodeHash = null;
        user.resetPasswordCodeExpires = null;
      }
      await user.save();
      return res.status(400).json({ message: "Invalid reset token" });
    }

    user.passwordHash = await bcrypt.hash(String(newPassword), 10);
    user.resetPasswordCodeHash = null;
    user.resetPasswordCodeExpires = null;
    user.resetPasswordCodeAttempts = 0;
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpires = null;
    user.profile = { ...user.profile, resetTokenHash: null, resetTokenExpiresAt: null };
    await user.save();

    return res.json({ ok: true });
  } catch (err) {
    console.error("reset-password confirm error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// DELETE ACCOUNT (signed-in)
router.delete("/account", requireAuth, async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ message: "Password is required" });

    const user = await User.findById(req.user.id).select("+passwordHash");
    if (!user) return res.status(404).json({ message: "User not found" });

    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) return res.status(401).json({ message: "Password is incorrect" });

    const userId = user._id.toString();
    await Promise.all([
      DailyEntry.deleteMany({ userId }),
      CycleSettings.deleteOne({ userId }),
      User.deleteOne({ _id: userId }),
    ]);

    return res.json({ ok: true });
  } catch (err) {
    console.error("delete account error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
