const express = require("express");
const requireAuth = require("../db/middleware/requireAuth");
const Notification = require("../models/Notification");
const User = require("../models/User");
const { sendEmail, sendRiskAlertEmail, isEmailConfigured } = require("../utils/mailer");

const router = express.Router();

function asBool(v, fallback = false) {
  if (v === undefined || v === null) return fallback;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.toLowerCase() === "true";
  return fallback;
}

// GET /api/notifications?limit=50&includeDismissed=false
router.get("/", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
    const includeDismissed = asBool(req.query.includeDismissed, false);
    const includeEmailOnly = asBool(req.query.includeEmailOnly, false);

    const filter = { userId };
    if (!includeDismissed) filter.dismissedAt = null;
    if (!includeEmailOnly) filter["channels.inApp"] = { $ne: false };

    const docs = await Notification.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    return res.status(200).json({ data: docs });
  } catch (err) {
    console.error("notifications list error:", err);
    return res.status(500).json({ message: "Failed to list notifications" });
  }
});

// POST /api/notifications
// body: { type, severity, title, message, actionUrl?, actionLabel?, dedupeKey?, sendEmail? }
router.post("/", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      type,
      severity,
      title,
      message,
      actionUrl = null,
      actionLabel = null,
      dedupeKey = null,
      sendEmail: sendEmailRequested,
      inApp: inAppRequested,
      redFlagChecklist,
    } = req.body || {};

    if (!type || !severity || !title || !message) {
      return res.status(400).json({ message: "type, severity, title, message are required" });
    }

    const isHighSeverity = severity === "high" || severity === "critical";
    const isRiskAlert = (type === "red_flag" || type === "warning") && isHighSeverity;
    const checklist =
      Array.isArray(redFlagChecklist)
        ? redFlagChecklist
            .map((x) => String(x || "").trim())
            .filter(Boolean)
            .slice(0, 20)
        : [];

    const payload = {
      userId,
      type,
      severity,
      title,
      message,
      actionUrl,
      actionLabel,
      ...(dedupeKey ? { dedupeKey } : {}),
      channels: {
        inApp: inAppRequested !== false,
        email: Boolean(sendEmailRequested),
      },
    };

    let doc;
    if (dedupeKey) {
      try {
        doc = await Notification.findOneAndUpdate(
          { userId, dedupeKey },
          { $set: payload, $setOnInsert: { readAt: null, dismissedAt: null } },
          { upsert: true, new: true, runValidators: true }
        );
      } catch (upsertErr) {
        // E11000 = duplicate key on dedupeKey unique index; fetch existing doc.
        if (upsertErr?.code === 11000) {
          doc = await Notification.findOne({ userId, dedupeKey });
        } else {
          throw upsertErr;
        }
      }
    } else {
      doc = await Notification.create(payload);
    }
    if (!doc) throw new Error("Failed to create or find notification");

    // Email sending can be triggered by:
    // 1) explicit client request (sendEmail=true), or
    // 2) high/critical risk alert + server-side emailRedFlags preference.
    let userForEmail = null;
    if (sendEmailRequested || isRiskAlert) {
      userForEmail = await User.findById(userId)
        .select("email isEmailVerified profile.displayName notificationPreferences.emailRedFlags")
        .lean();
    }

    const sendByPreference = Boolean(
      isRiskAlert && userForEmail?.notificationPreferences?.emailRedFlags === true
    );
    const alreadySentForDoc = Boolean(doc?.emailMeta?.sentAt);
    const shouldSendEmail = Boolean((sendEmailRequested || sendByPreference) && !alreadySentForDoc);
    const inAppChannel = doc?.channels?.inApp !== false;

    if (doc.channels?.email !== shouldSendEmail) {
      doc.channels = { ...(doc.channels || {}), inApp: inAppChannel, email: shouldSendEmail };
      await doc.save();
    }

    if (shouldSendEmail) {
      try {
        if (!isEmailConfigured()) {
          doc.emailMeta = {
            ...(doc.emailMeta || {}),
            error: "SMTP not configured on server",
          };
          await doc.save();
        } else {
          if (!userForEmail) {
            userForEmail = await User.findById(userId)
              .select("email isEmailVerified profile.displayName")
              .lean();
          }

          const to = userForEmail?.email;
          if (to && !userForEmail?.isEmailVerified) {
            doc.emailMeta = {
              ...(doc.emailMeta || {}),
              to,
              error: "Email not verified - email skipped",
            };
            await doc.save();
          } else if (to) {
            let subject = `[Cycle Companion] ${title}`;
            let result;

            if (isRiskAlert) {
              result = await sendRiskAlertEmail({
                to,
                displayName: userForEmail?.profile?.displayName || null,
                severity,
                title,
                message,
                actionUrl,
                redFlagChecklist: checklist,
              });
              subject = result?.subject || subject;
            } else {
              const text = `${title}\n\n${message}\n\nOpen the app: ${
                actionUrl ? actionUrl : "See Insights for details."
              }`;
              const html = `
                <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.4">
                  <h2 style="margin:0 0 8px 0;">${title}</h2>
                  <p style="margin:0 0 12px 0;">${message}</p>
                  <p style="margin:0;color:#555;font-size:13px">
                    This is a screening alert, not a diagnosis. If symptoms are severe, seek medical care.
                  </p>
                </div>
              `;
              result = await sendEmail({ to, subject, text, html });
            }

            if (result?.skipped) {
              doc.emailMeta = {
                ...(doc.emailMeta || {}),
                to,
                subject,
                error: `Email skipped: ${result.reason}`,
              };
            } else {
              doc.emailMeta = {
                ...(doc.emailMeta || {}),
                to,
                subject,
                sentAt: new Date(),
                error: null,
              };
            }
            await doc.save();
          } else {
            doc.emailMeta = { ...(doc.emailMeta || {}), error: "User email missing" };
            await doc.save();
          }
        }
      } catch (emailErr) {
        console.error("notification email error:", emailErr);
        try {
          doc.emailMeta = { ...(doc.emailMeta || {}), error: emailErr?.message || "Email send failed" };
          await doc.save();
        } catch {
          // ignore email meta persistence failures
        }
      }
    }

    return res.status(201).json({ data: doc });
  } catch (err) {
    console.error("notifications create error:", err);
    return res.status(500).json({ message: "Failed to create notification" });
  }
});

// PATCH /api/notifications/:id
// body: { read?: boolean, dismissed?: boolean }
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { read, dismissed } = req.body || {};

    const update = {};
    if (read === true) update.readAt = new Date();
    if (dismissed === true) update.dismissedAt = new Date();

    const doc = await Notification.findOneAndUpdate({ _id: id, userId }, { $set: update }, { new: true }).lean();

    if (!doc) {
      return res.status(200).json({ ok: true, data: null, updated: false });
    }

    return res.status(200).json({ data: doc });
  } catch (err) {
    if (err?.name === "CastError") {
      return res.status(200).json({ ok: true, data: null, updated: false });
    }
    console.error("notification update error:", err);
    return res.status(500).json({ message: "Failed to update notification" });
  }
});

// DELETE /api/notifications/:id
// Permanently remove a notification for the current user
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const doc = await Notification.findOneAndDelete({ _id: id, userId }).lean();
    if (!doc) {
      return res.status(200).json({ ok: true, deletedId: id, deleted: false });
    }

    return res.status(200).json({ ok: true, deletedId: id, deleted: true });
  } catch (err) {
    if (err?.name === "CastError") {
      return res.status(200).json({ ok: true, deletedId: req.params.id, deleted: false });
    }
    console.error("notification delete error:", err);
    return res.status(500).json({ message: "Failed to delete notification" });
  }
});

// POST /api/notifications/mark-all-read
router.post("/mark-all-read", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const result = await Notification.updateMany(
      { userId, readAt: null, dismissedAt: null },
      { $set: { readAt: now } }
    );
    return res.status(200).json({ ok: true, modified: result.modifiedCount ?? 0 });
  } catch (err) {
    console.error("notifications mark-all-read error:", err);
    return res.status(500).json({ message: "Failed to mark all read" });
  }
});

module.exports = router;
