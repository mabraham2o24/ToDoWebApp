// Load environment variables
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");

// --- import Task model ---
const Task = require("./models/Task");

const app = express();

// Are we running in production? (Render)
const isProduction = process.env.NODE_ENV === "production";

// When behind a proxy (like Render), this helps Express see the real protocol (https)
// which is important for secure cookies.
if (isProduction) {
  app.set("trust proxy", 1);
}

// Pull important env vars
const MONGODB_URI = process.env.MONGODB_URI;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const JWT_SECRET =
  process.env.SESSION_JWT_SECRET || process.env.JWT_SECRET || "dev-secret";

// Debug logs so we can confirm things are wired correctly
console.log("Server GOOGLE_CLIENT_ID:", GOOGLE_CLIENT_ID);
console.log("Mongo URI present? ", !!MONGODB_URI);
console.log("JWT secret present? ", !!JWT_SECRET);

// Google OAuth client
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// ---------- MIDDLEWARE ----------
app.use(express.json());
app.use(cookieParser());

// Allow frontend to access backend with cookies
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);

// Optional health route
app.get("/", (req, res) => {
  res.send("API is running ✅");
});

// ---------- CONNECT TO MONGODB ----------
mongoose
  .connect(MONGODB_URI, {
    dbName: "taskflow-db",
  })
  .then(() => {
    console.log("✅ Connected to MongoDB");
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
  });

// ========= GOOGLE LOGIN HANDLING =========

// Verify Google ID Token
async function verifyGoogleToken(idToken) {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: GOOGLE_CLIENT_ID,
  });

  return ticket.getPayload(); // contains email, name, picture, sub
}

// ---------- AUTH ROUTES ----------

// POST /api/auth/google  → called after Google login on frontend
app.post("/api/auth/google", async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: "Missing ID token" });
    }

    const payload = await verifyGoogleToken(idToken);

    // Session info we care about
    const sessionPayload = {
      googleId: payload.sub,
      name: payload.name,
      email: payload.email,
    };

    // Create our own session token (JWT)
    const sessionToken = jwt.sign(sessionPayload, JWT_SECRET, {
      expiresIn: "7d",
    });

    // Send back a cookie for authentication
    res.cookie("session", sessionToken, {
      httpOnly: true,
      // For cross-site (Vercel frontend -> Render backend) we need:
      //   sameSite: "none", secure: true  in production
      // But for localhost we keep lax + not secure
      sameSite: isProduction ? "none" : "lax",
      secure: isProduction,
    });

    return res.json({ message: "Login successful" });
  } catch (err) {
    console.error("Google auth error:", err.message || err);
    res.status(401).json({ error: "Invalid Google token" });
  }
});

// ---------- SESSION CHECK ROUTE ----------
app.get("/api/me", (req, res) => {
  const token = req.cookies.session;

  if (!token) {
    return res.status(401).json({ error: "Not logged in" });
  }

  try {
    const user = jwt.verify(token, JWT_SECRET);
    return res.json({ user });
  } catch (err) {
    return res.status(401).json({ error: "Invalid session" });
  }
});

// ---------- LOGOUT ----------
app.post("/api/logout", (req, res) => {
  res.clearCookie("session", {
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction,
  });
  res.json({ message: "Logged out" });
});

// ========================================================
//   AUTH MIDDLEWARE FOR TASK ROUTES
// ========================================================
function requireAuth(req, res, next) {
  const token = req.cookies.session;
  if (!token) {
    return res.status(401).json({ error: "Not logged in" });
  }

  try {
    const user = jwt.verify(token, JWT_SECRET);
    req.user = user; // attach user info to request
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid session" });
  }
}

// ========================================================
//   TASK ROUTES (per-user tasks)
// ========================================================

// GET /api/tasks  → get all tasks for current user
app.get("/api/tasks", requireAuth, async (req, res) => {
  try {
    const tasks = await Task.find({ googleId: req.user.googleId }).sort({
      createdAt: 1,
    });
    res.json(tasks);
  } catch (err) {
    console.error("Error fetching tasks:", err);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

// POST /api/tasks  → create new task for current user
app.post("/api/tasks", requireAuth, async (req, res) => {
  try {
    const { text, priority = "medium", dueDate = "" } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Task text is required" });
    }

    const task = await Task.create({
      googleId: req.user.googleId,
      text: text.trim(),
      priority,
      dueDate,
      completed: false,
    });

    res.status(201).json(task);
  } catch (err) {
    console.error("Error creating task:", err);
    res.status(500).json({ error: "Failed to create task" });
  }
});

// PUT /api/tasks/:id  → update a task (only if it belongs to user)
app.put("/api/tasks/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = {};

    // Only update fields that were actually sent
    if (req.body.text !== undefined) updates.text = req.body.text.trim();
    if (req.body.completed !== undefined) updates.completed = req.body.completed;
    if (req.body.priority !== undefined) updates.priority = req.body.priority;
    if (req.body.dueDate !== undefined) updates.dueDate = req.body.dueDate;

    const task = await Task.findOneAndUpdate(
      { _id: id, googleId: req.user.googleId },
      updates,
      { new: true }
    );

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json(task);
  } catch (err) {
    console.error("Error updating task:", err);
    res.status(500).json({ error: "Failed to update task" });
  }
});

// DELETE /api/tasks/:id  → delete a task (only if it belongs to user)
app.delete("/api/tasks/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await Task.findOneAndDelete({
      _id: id,
      googleId: req.user.googleId,
    });

    if (!deleted) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting task:", err);
    res.status(500).json({ error: "Failed to delete task" });
  }
});

// ---------- START SERVER ----------
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
