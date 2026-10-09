const mongoose = require("mongoose");

async function connectDB() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  const dbName = process.env.MONGODB_DB || process.env.DB_NAME;

  if (!uri) {
    throw new Error("Missing Mongo URI. Set MONGODB_URI (or MONGO_URI) in server/.env");
  }

  const options = {
    serverSelectionTimeoutMS: 10000,
    ...(dbName ? { dbName } : {}),
  };

  await mongoose.connect(uri, options);
  console.log(`Mongo connected: ${mongoose.connection.name}`);
}

module.exports = { connectDB };
