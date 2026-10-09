const mongoose = require("mongoose");

const QuizVoteSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, required: true },
    moduleId: { type: String, index: true, required: true },
    questionIndex: { type: Number, index: true, required: true },
    optionIndex: { type: Number, required: true },
  },
  { timestamps: true }
);

// Prevent a user from voting multiple times on the same question
QuizVoteSchema.index({ userId: 1, moduleId: 1, questionIndex: 1 }, { unique: true });

module.exports = mongoose.model("QuizVote", QuizVoteSchema);
