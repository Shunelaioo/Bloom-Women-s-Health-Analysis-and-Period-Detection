const cron = require("node-cron");
const User = require("../models/User");
const DailyEntry = require("../models/DailyEntry");
const { sendDailyLogReminderEmail, isEmailConfigured } = require("../utils/mailer");

/**
 * Returns today's date as "YYYY-MM-DD" in the server's local timezone.
 */
function todayYmd() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Attempt to send the daily reminder email for one user when eligible.
 * Returns a normalized result object and never throws.
 */
async function sendDailyLogReminderForUser(userOrId, { today = todayYmd(), skipSmtpCheck = false } = {}) {
  try {
    if (!skipSmtpCheck && !isEmailConfigured()) {
      return { sent: false, reason: "smtp_not_configured" };
    }

    const user =
      typeof userOrId === "string"
        ? await User.findById(userOrId)
            .select(
              "email isEmailVerified profile.displayName notificationPreferences.emailDailyLogReminder lastDailyReminderSentDate"
            )
            .lean()
        : userOrId;

    if (!user) return { sent: false, reason: "user_not_found" };
    if (!user.email) return { sent: false, reason: "email_missing" };
    if (user.isEmailVerified !== true) return { sent: false, reason: "email_not_verified" };
    if (user?.notificationPreferences?.emailDailyLogReminder !== true) {
      return { sent: false, reason: "preference_disabled" };
    }
    if (user.lastDailyReminderSentDate === today) {
      return { sent: false, reason: "already_sent_today" };
    }

    const userId = user._id.toString();
    const todayEntry = await DailyEntry.findOne({ userId, entryDate: today }).select("_id").lean();
    if (todayEntry) return { sent: false, reason: "already_logged_today" };

    const result = await sendDailyLogReminderEmail({
      to: user.email,
      displayName: user.profile?.displayName || null,
    });
    if (result?.skipped) return { sent: false, reason: result.reason || "email_skipped" };

    await User.updateOne({ _id: user._id }, { $set: { lastDailyReminderSentDate: today } });
    return { sent: true, reason: null };
  } catch (err) {
    return { sent: false, reason: err?.message || "unknown_error" };
  }
}

/**
 * Sends daily log reminder emails to all verified users who:
 *  1. Have `notificationPreferences.emailDailyLogReminder === true`
 *  2. Have NOT already logged today
 *  3. Have NOT already received today's reminder (dedup guard)
 */
async function sendDailyLogReminderJob() {
  const today = todayYmd();
  console.log(`[dailyLogReminder] Running for ${today}`);

  if (!isEmailConfigured()) {
    console.warn("[dailyLogReminder] SMTP not configured; skipping.");
    return;
  }

  let candidates;
  try {
    candidates = await User.find({
      isEmailVerified: true,
      "notificationPreferences.emailDailyLogReminder": true,
      // Only fetch users who haven't already been emailed today
      $or: [{ lastDailyReminderSentDate: null }, { lastDailyReminderSentDate: { $ne: today } }],
    })
      .select(
        "email isEmailVerified profile.displayName notificationPreferences.emailDailyLogReminder lastDailyReminderSentDate"
      )
      .lean();
  } catch (err) {
    console.error("[dailyLogReminder] Failed to fetch candidates:", err);
    return;
  }

  if (!candidates.length) {
    console.log("[dailyLogReminder] No eligible users found.");
    return;
  }

  console.log(`[dailyLogReminder] Checking ${candidates.length} users...`);

  let sent = 0;
  let skipped = 0;

  for (const user of candidates) {
    const result = await sendDailyLogReminderForUser(user, { today, skipSmtpCheck: true });
    if (result.sent) {
      sent++;
      console.log(`[dailyLogReminder] Reminder sent -> ${user.email}`);
    } else {
      skipped++;
      console.warn(`[dailyLogReminder] Skipped ${user.email}: ${result.reason}`);
    }
  }

  console.log(`[dailyLogReminder] Done. sent=${sent}, skipped=${skipped}.`);
}

/**
 * Registers all scheduled jobs. Call once after the DB connection is ready.
 */
function startScheduledJobs() {
  const runDailyReminderJob = () => {
    sendDailyLogReminderJob().catch((err) => {
      console.error("[dailyLogReminder] Unhandled error in job:", err);
    });
  };

  // Run shortly after startup so missed 08:00 windows are recovered.
  setTimeout(runDailyReminderJob, 5000);

  // Daily at 08:00 server local time.
  cron.schedule("0 8 * * *", runDailyReminderJob);
  // Hourly catch-up, deduped by `lastDailyReminderSentDate`.
  cron.schedule("0 * * * *", runDailyReminderJob);

  console.log("[scheduler] Jobs registered: daily reminder on startup + hourly + 08:00.");
}

module.exports = { startScheduledJobs, sendDailyLogReminderJob, sendDailyLogReminderForUser };
