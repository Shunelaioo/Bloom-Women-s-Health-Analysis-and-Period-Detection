const mongoose = require("mongoose");

/**
 * Create collection if missing, then apply/update validator using collMod.
 */
async function ensureCollectionWithValidator(
  db,
  name,
  jsonSchema,
  { validationLevel = "moderate", validationAction = "error" } = {}
) {
  const existing = await db.listCollections({ name }).toArray();
  const validator = { $jsonSchema: jsonSchema };

  if (existing.length === 0) {
    await db.createCollection(name);
    console.log(`✅ Created collection: ${name}`);
  }

  try {
    await db.command({
      collMod: name,
      validator,
      validationLevel,
      validationAction,
    });
    console.log(`✅ Validator applied: ${name}`);
  } catch (err) {
    console.error(`❌ Failed to apply validator for ${name}:`, err.message);
  }
}

async function ensureIndexes(db) {
  await db.collection("dailyentries").createIndex(
    { userId: 1, entryDate: 1 },
    { unique: true }
  );

  await db.collection("cyclesummaries").createIndex(
    { userId: 1, cycleId: 1 },
    { unique: true }
  );

  await db.collection("users").createIndex(
    { email: 1 },
    { unique: true }
  );

  await db.collection("cycle_settings").createIndex(
    { userId: 1 },
    { unique: true }
  );

  await db.collection("notifications").createIndex({ userId: 1, createdAt: -1 });
  await db.collection("notifications").createIndex(
    { userId: 1, dedupeKey: 1 },
    { unique: true, sparse: true }
  );

  console.log("✅ Indexes ensured.");
}

async function ensureCollections() {
  if (!mongoose.connection?.db) {
    throw new Error("Mongo connection not ready. Call ensureCollections() after mongoose.connect().");
  }

  const db = mongoose.connection.db;

  const PHASE_ENUM = ["menstrual", "follicular", "ovulation", "luteal"];
  const FLOW_ENUM = ["spotting_very_light", "somewhat_light", "light", "moderate", "somewhat_heavy", "heavy"];
  const SYMPTOM_ENUM = [-1, "low", "moderate", "high"];

  const DATE_PATTERN = "^\\d{4}-\\d{2}-\\d{2}$";

  // ---------------------------
  // users ✅
  // ---------------------------
  await ensureCollectionWithValidator(db, "users", {
    bsonType: "object",
    required: ["email", "passwordHash", "role", "isEmailVerified"],
    additionalProperties: true,
    properties: {
      email: { bsonType: "string" },
      passwordHash: { bsonType: "string" },
      role: { bsonType: "string", enum: ["user", "admin"] },
      isEmailVerified: { bsonType: "bool" },

      profile: {
        anyOf: [
          { bsonType: "null" },
          {
            bsonType: "object",
            additionalProperties: true,
            properties: {
              displayName: { bsonType: ["string", "null"] },
              avatarUrl: { bsonType: ["string", "null"] },

              dateOfBirth: { bsonType: ["date", "null"] },
              menarcheAge: { bsonType: ["int", "long", "double", "null"], minimum: 8, maximum: 25 },

              heightCm: { bsonType: ["int", "long", "double", "null"], minimum: 80, maximum: 250 },
              weightKg: { bsonType: ["int", "long", "double", "null"], minimum: 20, maximum: 300 },
              bmi: { bsonType: ["int", "long", "double", "null"], minimum: 10, maximum: 60 },
              lifeStage: {
                bsonType: ["string", "null"],
                enum: ["reproductive", "perimenopausal", "unknown", null],
              },
              contraceptionType: {
                bsonType: ["string", "null"],
                enum: ["none", "pill", "iud", "implant", "injection", null],
              },
              postpartumBreastfeeding: { bsonType: ["bool", "null"] },
              tryingToConceive: { bsonType: ["bool", "null"] },
            },
          },
        ],
      },

      createdAt: { bsonType: ["date", "null"] },
      updatedAt: { bsonType: ["date", "null"] },
    },
  });

  // ---------------------------
  // cycle_settings ✅
  // ---------------------------
  await ensureCollectionWithValidator(db, "cycle_settings", {
    bsonType: "object",
    required: ["userId", "cycleLengthDays", "lastPeriodStart"],
    additionalProperties: true,
    properties: {
      userId: { bsonType: "string" },

      cycleLengthDays: { bsonType: ["int", "long", "double"], minimum: 15, maximum: 60 },
      periodLengthDays: { bsonType: ["int", "long", "double", "null"], minimum: 1, maximum: 14 },

      lastPeriodStart: { bsonType: "string", pattern: DATE_PATTERN },

      predictedNextPeriodDate: {
        anyOf: [{ bsonType: "null" }, { bsonType: "string", pattern: DATE_PATTERN }],
      },

      createdAt: { bsonType: ["date", "null"] },
      updatedAt: { bsonType: ["date", "null"] },
    },
  });

  // ---------------------------
  // cyclesummaries
  // ---------------------------
  await ensureCollectionWithValidator(db, "cyclesummaries", {
    bsonType: "object",
    required: ["userId", "cycleId", "cycleStartDate"],
    additionalProperties: true,
    properties: {
      userId: { bsonType: "string" },
      cycleId: { bsonType: "string" },

      cycleStartDate: { bsonType: "string", pattern: DATE_PATTERN },
      cycleEndDate: {
        anyOf: [{ bsonType: "null" }, { bsonType: "string", pattern: DATE_PATTERN }],
      },

      cycleLengthDays: { bsonType: ["int", "long", "double", "null"], minimum: 10, maximum: 120 },
      periodLengthDays: { bsonType: ["int", "long", "double", "null"], minimum: 1, maximum: 20 },

      predictedNextPeriodDate: {
        anyOf: [{ bsonType: "null" }, { bsonType: "string", pattern: DATE_PATTERN }],
      },

      notes: { bsonType: ["string", "null"] },
      createdAt: { bsonType: ["date", "null"] },
      updatedAt: { bsonType: ["date", "null"] },
    },
  });

  // ---------------------------
  // dailyentries
  // ---------------------------
  await ensureCollectionWithValidator(db, "dailyentries", {
    bsonType: "object",
    required: ["userId", "entryDate"],
    additionalProperties: true,
    properties: {
      userId: { bsonType: "string" },
      entryDate: { bsonType: "string", pattern: DATE_PATTERN },

      cycleNumber: { bsonType: ["int", "long", "double", "null"], minimum: 1, maximum: 5000 },
      cycleLength: { bsonType: ["int", "long", "double", "null"], minimum: 10, maximum: 120 },

      phase: { bsonType: ["string", "null"], enum: [...PHASE_ENUM, null] },
      flowVolume: { bsonType: ["string", "null"] },
      flowColor: { bsonType: ["string", "null"] },
      spottingToday: { bsonType: ["bool", "null"] },

      soakedThrough: { bsonType: ["bool", "null"] },
      flooding: { bsonType: ["bool", "null"] },
      largeClots: { bsonType: ["bool", "null"] },
      padChangeCount: { bsonType: ["int", "long", "double", "null"], minimum: 0, maximum: 50 },
      bleedingImpact: { bsonType: ["int", "long", "double", "null"], minimum: 0, maximum: 4 },
      periodStartOverride: { bsonType: ["bool", "null"] },
      periodEndOverride: { bsonType: ["bool", "null"] },

      moodScore: { bsonType: ["int", "long", "double", "null"], minimum: -1, maximum: 10 },
      stressScore: { bsonType: ["int", "long", "double", "null"], minimum: -1, maximum: 10 },
      sleepHour: { bsonType: ["int", "long", "double", "null"], minimum: -1, maximum: 24 },
      energyLevel: { bsonType: ["int", "long", "double", "null"], minimum: -1, maximum: 10 },
      concentrateScore: { bsonType: ["int", "long", "double", "null"], minimum: -1, maximum: 10 },
      workHoursLost: { bsonType: ["int", "long", "double", "null"], minimum: -1, maximum: 24 },

      symptoms: {
        bsonType: ["object", "null"],
        additionalProperties: true,
      },

      exercises: {
        anyOf: [
          { bsonType: "null" },
          {
            bsonType: "array",
            items: {
              bsonType: "object",
              required: ["type", "minutes"],
              additionalProperties: false,
              properties: {
                type: { bsonType: "string" },
                minutes: { bsonType: ["int", "long", "double"], minimum: 0, maximum: 600 },
              },
            },
          },
          {
            bsonType: "object",
            additionalProperties: true,
          },
        ],
      },

      totalExerciseMinutes: {
        bsonType: ["int", "long", "double", "null"],
        minimum: -1,
        maximum: 6000,
      },

      notes: { bsonType: ["string", "null"] },
      createdAt: { bsonType: ["date", "null"] },
      updatedAt: { bsonType: ["date", "null"] },
    },
  }, { validationLevel: "moderate", validationAction: "warn" });

  // ---------------------------
  // notifications
  // ---------------------------
  await ensureCollectionWithValidator(db, "notifications", {
    bsonType: "object",
    required: ["userId", "type", "severity", "title", "message"],
    additionalProperties: true,
    properties: {
      userId: { bsonType: "string" },
      type: { bsonType: "string" },
      severity: { bsonType: "string" },
      title: { bsonType: "string" },
      message: { bsonType: "string" },
      actionUrl: { bsonType: ["string", "null"] },
      actionLabel: { bsonType: ["string", "null"] },
      dedupeKey: { bsonType: ["string", "null"] },
      channels: {
        anyOf: [
          { bsonType: "null" },
          {
            bsonType: "object",
            additionalProperties: true,
            properties: {
              inApp: { bsonType: ["bool", "null"] },
              email: { bsonType: ["bool", "null"] },
            },
          },
        ],
      },
      readAt: { bsonType: ["date", "null"] },
      dismissedAt: { bsonType: ["date", "null"] },
      createdAt: { bsonType: ["date", "null"] },
      updatedAt: { bsonType: ["date", "null"] },
    },
  });

  await ensureIndexes(db);
  console.log("🎉 All collections ensured + validators applied + indexes created.");
}

module.exports = ensureCollections;
