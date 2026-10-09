const { GoogleGenAI } = require("@google/genai");

const REQUIRED_KEYS = ["observations", "tips", "tracking_suggestions"];
const MIN_QUOTA_COOLDOWN_MS = 15000;
let quotaCooldownUntil = 0;

function stripCodeFences(text) {
  return (text || "").replace(/```json\s*|```/gi, "");
}

function extractText(res) {
  if (!res) return "";
  const direct =
    (typeof res?.text === "string" ? res.text : "") ||
    (typeof res?.response?.text === "string" ? res.response.text : "");
  if (direct) return direct;
  const firstCandidate = res?.candidates?.[0] || res?.response?.candidates?.[0];
  if (firstCandidate?.content?.parts?.length) {
    return firstCandidate.content.parts
      .map((p) => p?.text || "")
      .join(" ")
      .trim();
  }
  return "";
}

function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY missing");
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientNetworkError(err) {
  const message = String(err?.message || "").toLowerCase();
  const causeCode = String(err?.cause?.code || "").toUpperCase();
  return (
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("timed out") ||
    causeCode === "ECONNRESET" ||
    causeCode === "ENOTFOUND" ||
    causeCode === "ETIMEDOUT" ||
    causeCode === "ECONNREFUSED"
  );
}

function parseRetryDelayMs(err) {
  const msg = String(err?.message || "");
  const fromText = msg.match(/retry in\s+([0-9.]+)s/i);
  if (fromText?.[1]) {
    const seconds = Number(fromText[1]);
    if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds * 1000);
  }
  const fromJson = msg.match(/"retryDelay":"([0-9.]+)s"/i);
  if (fromJson?.[1]) {
    const seconds = Number(fromJson[1]);
    if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds * 1000);
  }
  return MIN_QUOTA_COOLDOWN_MS;
}

function isQuotaExceededError(err) {
  const status = Number(err?.status || err?.code || 0);
  const msg = String(err?.message || "").toLowerCase();
  return (
    status === 429 ||
    msg.includes("quota exceeded") ||
    msg.includes("resource_exhausted") ||
    msg.includes("free_tier_requests")
  );
}

function formatGeminiError(err, modelName) {
  if (isQuotaExceededError(err)) {
    const retryMs = parseRetryDelayMs(err);
    const retrySec = Math.max(1, Math.ceil(retryMs / 1000));
    const quotaErr = new Error(
      `Gemini quota exceeded on model '${modelName}' (429). Retry after ~${retrySec}s.`
    );
    quotaErr.status = 429;
    quotaErr.code = "GEMINI_QUOTA_EXCEEDED";
    quotaErr.retryAfterMs = retryMs;
    return quotaErr;
  }

  const parts = [
    `Gemini call failed on model '${modelName}'`,
    err?.message ? `message=${err.message}` : null,
    err?.status ? `status=${err.status}` : null,
    err?.code ? `code=${err.code}` : null,
    err?.cause?.code ? `cause_code=${err.cause.code}` : null,
    err?.cause?.message ? `cause_message=${err.cause.message}` : null,
  ].filter(Boolean);
  return new Error(parts.join(" | "));
}

async function generateInsights(summary) {
  if (quotaCooldownUntil > Date.now()) {
    const waitSec = Math.max(1, Math.ceil((quotaCooldownUntil - Date.now()) / 1000));
    const cooldownErr = new Error(
      `Gemini quota cooldown active. Retry after ~${waitSec}s.`
    );
    cooldownErr.status = 429;
    cooldownErr.code = "GEMINI_QUOTA_EXCEEDED";
    cooldownErr.retryAfterMs = quotaCooldownUntil - Date.now();
    throw cooldownErr;
  }

  const client = getClient();
  const primaryModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const fallbackModel = "gemini-2.5-pro";

  const prompt = `
You are a health education assistant for a period-tracking app.
Not medical advice. No diagnoses. No medication/dosage guidance.

Return JSON ONLY with keys:
observations, tips, tracking_suggestions.
Each value must be an array of 3-7 short strings.

Base everything strictly on this summary:
${JSON.stringify(summary)}
`;

  const run = async (modelName) => {
    let lastErr = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const result = await client.models.generateContent({
          model: modelName,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: { responseMimeType: "application/json" },
        });
        const text = extractText(result);
        if (!text) {
          const block =
            result?.promptFeedback?.blockReason ||
            result?.response?.promptFeedback?.blockReason ||
            "no_text";
          throw new Error(`Empty LLM response (${block})`);
        }
        return text;
      } catch (err) {
        lastErr = err;
        if (isQuotaExceededError(err)) {
          const retryMs = parseRetryDelayMs(err);
          quotaCooldownUntil = Date.now() + Math.max(retryMs, MIN_QUOTA_COOLDOWN_MS);
          throw formatGeminiError(err, modelName);
        }
        if (attempt < 2 && isTransientNetworkError(err)) {
          await sleep(300 * attempt);
          continue;
        }
        throw formatGeminiError(err, modelName);
      }
    }
    throw formatGeminiError(lastErr || new Error("unknown"), modelName);
  };

  try {
    return await run(primaryModel);
  } catch (err) {
    if (String(err?.message || "").toLowerCase().includes("not found")) {
      return await run(fallbackModel);
    }
    throw err;
  }
}

function safeParseInsights(rawText) {
  const text = stripCodeFences(rawText || "");
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON found in model response");

  const parsed = JSON.parse(match[0]);
  for (const key of REQUIRED_KEYS) {
    if (!Array.isArray(parsed[key])) throw new Error(`Missing/invalid key: ${key}`);
  }
  if (!Array.isArray(parsed.red_flags)) parsed.red_flags = [];
  if (!Array.isArray(parsed.questions_for_doctor)) parsed.questions_for_doctor = [];
  return parsed;
}

module.exports = { generateInsights, safeParseInsights };
