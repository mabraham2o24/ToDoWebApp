// server/models/Task.js
const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    // which Google user this task belongs to
    googleId: {
      type: String,
      required: true,
      index: true,
    },

    text: {
      type: String,
      required: true,
      trim: true,
    },

    completed: {
      type: Boolean,
      default: false,
    },

    // "low" | "medium" | "high"
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },

    // we'll store date as "YYYY-MM-DD" string to match your frontend
    dueDate: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true, // adds createdAt / updatedAt
  }
);

module.exports = mongoose.model("Task", taskSchema);
