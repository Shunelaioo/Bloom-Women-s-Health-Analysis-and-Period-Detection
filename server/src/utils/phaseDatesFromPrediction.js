/**
 * Deterministic menstrual phase calculator from a *single* predicted next-period start date.
 *
 * This utility is intentionally "date-only" (no time-of-day semantics):
 * - Inputs can be a JS `Date` or an ISO-like string.
 * - All internal math is done at **UTC midnight** to avoid timezone/DST drift.
 * - Returned dates are JS `Date` objects set to UTC midnight.
 *
 * Gynecological rules implemented (inclusive ranges):
 * 1) Menstrual: starts on `lastPeriodStartDate`, lasts `menstrualDays` (default 5).
 *    - If menstrualDays = 5 and start = 2026-02-01, then end = 2026-02-05 (5 days inclusive).
 * 2) Luteal: starts exactly 14 days before `predictedNextPeriodDate`, ends 1 day before it.
 * 3) Ovulation / Fertile window: 5-day window ending 1 day before luteal starts.
 * 4) Follicular: gap between menstrual end and ovulation start.
 *
 * Note: If the provided dates imply an impossible/overlapping schedule (e.g., very short cycle),
 * the follicular phase can become empty. In that case this function returns it with `null` bounds.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * @param {Date | string} value
 * @returns {Date | null} UTC-midnight date
 */
function toDateOnlyUtc(value) {
  if (!value) return null;

  // Fast-path for Date.
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s) return null;

  // Parse YYYY-MM-DD as UTC to avoid "local time" interpretation.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const t = Date.UTC(y, mo, d);
    return Number.isNaN(t) ? null : new Date(t);
  }

  // Otherwise, let JS parse it, then normalize to UTC midnight.
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

/**
 * @param {Date} dateUtcMidnight
 * @param {number} days
 * @returns {Date}
 */
function addDaysUtc(dateUtcMidnight, days) {
  return new Date(dateUtcMidnight.getTime() + Math.round(days) * MS_PER_DAY);
}

/**
 * @param {Date} startUtc
 * @param {Date} endUtc
 * @returns {boolean}
 */
function isValidRange(startUtc, endUtc) {
  return startUtc instanceof Date && endUtc instanceof Date && endUtc.getTime() >= startUtc.getTime();
}

/**
 * @typedef {"menstrual" | "follicular" | "ovulation" | "luteal"} PhaseName
 *
 * @typedef {Object} PhaseRange
 * @property {PhaseName} phaseName
 * @property {Date | null} startDate
 * @property {Date | null} endDate
 */

/**
 * Calculate the 4 standard phases from:
 * - last period start date (anchor)
 * - predicted next period start date (from ML)
 *
 * @param {Object} params
 * @param {Date | string} params.lastPeriodStartDate
 * @param {Date | string} params.predictedNextPeriodDate
 * @param {number} [params.menstrualDays=5] Default baseline menstrual length (days, inclusive)
 * @returns {PhaseRange[]}
 */
function calculatePhasesFromPrediction({
  lastPeriodStartDate,
  predictedNextPeriodDate,
  menstrualDays = 5,
}) {
  const lastStart = toDateOnlyUtc(lastPeriodStartDate);
  const nextStart = toDateOnlyUtc(predictedNextPeriodDate);

  if (!lastStart) {
    throw new Error("calculatePhasesFromPrediction: invalid lastPeriodStartDate");
  }
  if (!nextStart) {
    throw new Error("calculatePhasesFromPrediction: invalid predictedNextPeriodDate");
  }
  if (nextStart.getTime() <= lastStart.getTime()) {
    throw new Error("calculatePhasesFromPrediction: predictedNextPeriodDate must be after lastPeriodStartDate");
  }

  const menLen = Number.isFinite(menstrualDays) ? Math.max(1, Math.min(14, Math.round(menstrualDays))) : 5;

  // 1) Menstrual (inclusive)
  const menstrualStart = lastStart;
  const menstrualEnd = addDaysUtc(menstrualStart, menLen - 1);

  // 2) Luteal (inclusive)
  const lutealStart = addDaysUtc(nextStart, -14);
  const lutealEnd = addDaysUtc(nextStart, -1);

  // 3) Ovulation / fertile window: 5 days inclusive ending the day before luteal starts.
  const ovulationEnd = addDaysUtc(lutealStart, -1);
  const ovulationStart = addDaysUtc(ovulationEnd, -4);

  // 4) Follicular: gap between menstrual end and ovulation start.
  const follicularStart = addDaysUtc(menstrualEnd, 1);
  const follicularEnd = addDaysUtc(ovulationStart, -1);

  /** @type {PhaseRange[]} */
  const phases = [
    {
      phaseName: "menstrual",
      startDate: menstrualStart,
      endDate: menstrualEnd,
    },
    {
      phaseName: "follicular",
      startDate: isValidRange(follicularStart, follicularEnd) ? follicularStart : null,
      endDate: isValidRange(follicularStart, follicularEnd) ? follicularEnd : null,
    },
    {
      phaseName: "ovulation",
      startDate: ovulationStart,
      endDate: ovulationEnd,
    },
    {
      phaseName: "luteal",
      startDate: lutealStart,
      endDate: lutealEnd,
    },
  ];

  return phases;
}

module.exports = {
  calculatePhasesFromPrediction,
  // exported for consistency/possible reuse
  toDateOnlyUtc,
};

