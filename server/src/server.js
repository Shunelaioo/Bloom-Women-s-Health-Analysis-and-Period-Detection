const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const express = require("express");
const cors = require("cors");

const { connectDB } = require("./db/db");
const ensureCollections = require("./db/ensureCollections");

// Routes
const dailyEntryRoutes = require("./routes/dailyEntryRoutes");
const nextPeriodRoutes = require("./routes/nextPeriodRoutes");
const userRoutes = require("./routes/user"); // must export an express.Router()
const insightsRoutes = require("./routes/insightsRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const quizPollsRoutes = require("./routes/quiz-polls");
const quizResultsRoutes = require("./routes/quiz-results");
const { startScheduledJobs } = require("./services/scheduledJobs");

const app = express();

// Middleware
app.use(express.json({ limit: "2mb" }));

// ✅ Allow Vite dev server origins
const allowedOrigins = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:8081",
  "http://127.0.0.1:8081",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true); // Postman / server-to-server

      if (allowedOrigins.includes(origin)) return callback(null, true);

      return callback(new Error("Not allowed by CORS: " + origin));
    },
    credentials: true,
  })
);

// Health check
app.get("/health", (req, res) => {
  res.json({ ok: true, message: "API is running" });
});

// API routes
app.use("/api/daily-entries", dailyEntryRoutes);
app.use("/api/next-period", nextPeriodRoutes);
app.use("/api/insights", insightsRoutes);
app.use("/api/quiz-polls", quizPollsRoutes);
app.use("/api/quiz-results", quizResultsRoutes);

// ✅ IMPORTANT: this makes endpoints /api/user/*
app.use("/api/user", userRoutes);
app.use("/api/notifications", notificationRoutes);

const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await connectDB();
    await ensureCollections();
    startScheduledJobs();

    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Startup failed:", err);
    process.exit(1);
  }
})();
