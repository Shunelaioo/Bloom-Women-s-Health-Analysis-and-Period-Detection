const nodemailer = require("nodemailer");

function isEmailConfigured() {
  const from = process.env.EMAIL_FROM || process.env.MAIL_FROM;
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    from
  );
}

function getTransport() {
  const port = Number(process.env.SMTP_PORT);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendEmail({ to, subject, text, html }) {
  if (!isEmailConfigured()) {
    return { skipped: true, reason: "smtp_not_configured" };
  }

  const from = process.env.EMAIL_FROM || process.env.MAIL_FROM;
  const transporter = getTransport();
  const info = await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });

  return { skipped: false, messageId: info.messageId };
}

async function sendResetCodeEmail({ to, code }) {
  const subject = "Your Her Tracker password reset code";
  const text = `Your password reset code is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, ignore this email.`;
  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial; line-height:1.5">
    <h2 style="margin:0 0 12px">Password reset code</h2>
    <p style="margin:0 0 12px">Use this code to reset your Her Tracker password:</p>

    <div style="font-size:28px; letter-spacing:6px; font-weight:700; padding:12px 16px; background:#f4f4f5; border-radius:12px; display:inline-block">
      ${code}
    </div>

    <p style="margin:12px 0 0; color:#555">This code expires in 10 minutes.</p>
    <p style="margin:6px 0 0; color:#777; font-size:12px">If you didn't request this, you can ignore this email.</p>
  </div>`;

  return sendEmail({ to, subject, text, html });
}

async function sendVerificationCodeEmail({ to, code, displayName }) {
  const name = displayName || "there";
  const subject = "Your Her Tracker email verification code";
  const text = `Hi ${name},\n\nYour email verification code is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you didn't create an account, you can ignore this email.`;
  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;max-width:520px;margin:0 auto;line-height:1.5">
    <div style="background:linear-gradient(135deg,#e879a0,#f472b6);border-radius:16px 16px 0 0;padding:32px 24px;text-align:center">
      <div style="width:56px;height:56px;background:rgba(255,255,255,0.2);border-radius:14px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px">
        <span style="font-size:28px">♥</span>
      </div>
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700">Her Tracker</h1>
    </div>

    <div style="background:#fff;border:1px solid #f0f0f0;border-top:none;border-radius:0 0 16px 16px;padding:32px 24px">
      <h2 style="margin:0 0 8px;font-size:20px;color:#1a1a1a">Verify your email address</h2>
      <p style="margin:0 0 20px;color:#555">Hi ${name}, thanks for joining! Enter this code in Her Tracker to confirm your email:</p>

      <div style="text-align:center;margin:28px 0">
        <div style="display:inline-block;background:#f4f4f5;color:#111827;font-weight:700;font-size:30px;letter-spacing:8px;padding:14px 24px;border-radius:14px">
          ${code}
        </div>
      </div>

      <p style="margin:20px 0 0;color:#777;font-size:13px">This code expires in <strong>10 minutes</strong>. If you didn't create an account, you can safely ignore this email.</p>
      <hr style="border:none;border-top:1px solid #f0f0f0;margin:24px 0">
      <p style="margin:0;color:#aaa;font-size:11px;text-align:center">Her Tracker &mdash; Your personal cycle companion</p>
    </div>
  </div>`;

  return sendEmail({ to, subject, text, html });
}

async function sendDailyLogReminderEmail({ to, displayName }) {
  const name = displayName || "there";
  const subject = "Cycle Companion — Log your day!";
  const text = `Hi ${name},\n\nA quick reminder to log your daily entry in Cycle Companion. Consistent logging helps keep your cycle insights accurate.\n\nOpen the app to log now: ${process.env.APP_URL || "http://localhost:8080"}/tracking\n\nTake care,\nThe Cycle Companion team`;
  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;line-height:1.5">
    <div style="background:linear-gradient(135deg,#e879a0,#f472b6);border-radius:16px 16px 0 0;padding:32px 24px;text-align:center">
      <div style="width:56px;height:56px;background:rgba(255,255,255,0.2);border-radius:14px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px">
        <span style="font-size:28px">&#128197;</span>
      </div>
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700">Cycle Companion</h1>
    </div>

    <div style="background:#fff;border:1px solid #f0f0f0;border-top:none;border-radius:0 0 16px 16px;padding:32px 24px">
      <h2 style="margin:0 0 8px;font-size:20px;color:#1a1a1a">Don&rsquo;t forget to log today! &#127774;</h2>
      <p style="margin:0 0 20px;color:#555">Hi ${name}, you haven&rsquo;t logged your daily entry yet. A quick log keeps your cycle insights accurate and up to date.</p>

      <div style="text-align:center;margin:28px 0">
        <a href="${process.env.APP_URL || "http://localhost:8080"}/tracking"
           style="display:inline-block;background:linear-gradient(135deg,#e879a0,#f472b6);color:#fff;font-weight:700;font-size:16px;padding:14px 32px;border-radius:12px;text-decoration:none">
          Log My Day
        </a>
      </div>

      <p style="margin:20px 0 0;color:#777;font-size:13px">You&rsquo;re receiving this because you enabled daily log reminder emails in your Cycle Companion settings. You can turn it off anytime in your profile.</p>
      <hr style="border:none;border-top:1px solid #f0f0f0;margin:24px 0">
      <p style="margin:0;color:#aaa;font-size:11px;text-align:center">Cycle Companion &mdash; Your personal cycle companion</p>
    </div>
  </div>`;

  return sendEmail({ to, subject, text, html });
}

function getAppUrl() {
  return process.env.APP_URL || "http://localhost:8080";
}

function toAbsoluteAppUrl(actionUrl) {
  const appUrl = getAppUrl().replace(/\/$/, "");
  if (!actionUrl) return `${appUrl}/insights`;
  if (/^https?:\/\//i.test(actionUrl)) return actionUrl;
  return `${appUrl}${actionUrl.startsWith("/") ? "" : "/"}${actionUrl}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendRiskAlertEmail({
  to,
  displayName,
  severity,
  title,
  message,
  actionUrl,
  redFlagChecklist = [],
}) {
  const name = displayName || "there";
  const sev = String(severity || "high").toUpperCase();
  const openUrl = toAbsoluteAppUrl(actionUrl);
  const safeTitle = String(title || "Health alert");
  const safeMessage = String(message || "Please review your latest cycle signals in the app.");
  const checklistItems = Array.isArray(redFlagChecklist)
    ? redFlagChecklist.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 20)
    : [];
  const checklistText = checklistItems.length
    ? checklistItems.map((item, idx) => `${idx + 1}. ${item}`).join("\n")
    : "";
  const subject = `[Cycle Companion] ${sev} alert: ${safeTitle}`;

  const text = [
    `Hi ${name},`,
    "",
    `Severity: ${sev}`,
    `Alert: ${safeTitle}`,
    "",
    safeMessage,
    "",
    ...(checklistItems.length
      ? ["Flagged checklist items:", checklistText, ""]
      : []),
    "",
    "Recommended next steps:",
    "1) Open your insights and review the flagged signals.",
    "2) Keep logging daily to improve signal reliability.",
    "3) If symptoms are severe or worsening, contact a clinician.",
    "",
    `Open Insights: ${openUrl}`,
    "",
    "This is a screening alert, not a diagnosis.",
  ].join("\n");

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;line-height:1.5">
    <div style="background:#f43f5e;color:#fff;border-radius:14px 14px 0 0;padding:20px 22px">
      <div style="font-size:12px;opacity:.95;letter-spacing:.4px">SEVERITY: ${escapeHtml(sev)}</div>
      <h1 style="margin:6px 0 0;font-size:22px;line-height:1.3">${escapeHtml(safeTitle)}</h1>
    </div>

    <div style="background:#fff;border:1px solid #f0f0f0;border-top:none;border-radius:0 0 14px 14px;padding:22px">
      <p style="margin:0 0 12px;color:#444">Hi ${escapeHtml(name)},</p>
      <p style="margin:0 0 14px;color:#444">${escapeHtml(safeMessage)}</p>

      ${
        checklistItems.length
          ? `<div style="background:#fff;border:1px solid #f0f0f0;border-radius:10px;padding:12px 14px;margin:0 0 14px">
        <p style="margin:0 0 8px;font-weight:600;color:#333">Flagged checklist items</p>
        <ul style="margin:0;padding-left:18px;color:#555">
          ${checklistItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </div>`
          : ""
      }

      <div style="background:#fff7f8;border:1px solid #ffd5dc;border-radius:10px;padding:12px 14px;margin:0 0 14px">
        <p style="margin:0 0 8px;font-weight:600;color:#6b0f1a">Recommended next steps</p>
        <ol style="margin:0;padding-left:18px;color:#5a5a5a">
          <li>Open Insights and review the flagged signals.</li>
          <li>Keep logging daily to improve reliability.</li>
          <li>If symptoms are severe or worsening, contact a clinician.</li>
        </ol>
      </div>

      <div style="text-align:center;margin:18px 0 8px">
        <a href="${escapeHtml(openUrl)}"
           style="display:inline-block;background:#f43f5e;color:#fff;font-weight:700;font-size:15px;padding:12px 26px;border-radius:10px;text-decoration:none">
          Open Insights
        </a>
      </div>

      <p style="margin:12px 0 0;color:#777;font-size:12px">This is a screening alert, not a diagnosis.</p>
    </div>
  </div>`;

  const result = await sendEmail({ to, subject, text, html });
  return { ...result, subject };
}

module.exports = {
  isEmailConfigured,
  sendEmail,
  sendResetCodeEmail,
  sendVerificationCodeEmail,
  sendDailyLogReminderEmail,
  sendRiskAlertEmail,
};
