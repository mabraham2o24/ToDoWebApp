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

// When behind a proxy such as Render, this helps Express detect HTTPS.
// This is important for secure cookies.
if (isProduction) {
  app.set("trust proxy", 1);
}

// Pull important environment variables
const MONGODB_URI = process.env.MONGODB_URI;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const FRONTEND_URL = process.env.FRONTEND_URL;

const JWT_SECRET =
  process.env.SESSION_JWT_SECRET ||
  process.env.JWT_SECRET ||
  "dev-secret";

// Debug logs so we can confirm things are wired correctly
console.log("Server GOOGLE_CLIENT_ID:", GOOGLE_CLIENT_ID);
console.log("Mongo URI present? ", !!MONGODB_URI);
console.log("JWT secret present? ", !!JWT_SECRET);
console.log("Production frontend URL:", FRONTEND_URL);

// Google OAuth client
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// ---------- MIDDLEWARE ----------
app.use(express.json());
app.use(cookieParser());

// Allow both the deployed Vercel frontend and the local Vite frontend.
const allowedOrigins = [
  FRONTEND_URL,
  "http://localhost:5173",
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Requests without an Origin header include services such as
      // UptimeRobot, Postman, curl, and server-to-server requests.
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.error(`CORS blocked origin: ${origin}`);

      return callback(
        new Error(`Origin ${origin} is not allowed by CORS`)
      );
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

/**
 * Keep-alive / health route for UptimeRobot.
 *
 * This route:
 * - Does not require authentication.
 * - Pings MongoDB so the database receives activity.
 * - Can be monitored at:
 *   https://todo-backend-0drg.onrender.com/health
 */
app.get("/health", async (req, res) => {
  try {
    if (mongoose.connection?.db) {
      await mongoose.connection.db.admin().ping();
      return res.status(200).send("DB OK");
    }

    return res.status(200).send("OK (DB not connected yet)");
  } catch (err) {
    console.error("Health check DB ping failed:", err);
    return res.status(500).send("DB Error");
  }
});

// Optional root route
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

// ========================================================
//   GOOGLE LOGIN HANDLING
// ========================================================

// Verify Google ID token
async function verifyGoogleToken(idToken) {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: GOOGLE_CLIENT_ID,
  });

  // Contains email, name, picture, sub, and other Google profile data.
  return ticket.getPayload();
}

// ========================================================
//   AUTH ROUTES
// ========================================================

// POST /api/auth/google
// Called after Google login on the frontend.
app.post("/api/auth/google", async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        error: "Missing ID token",
      });
    }

    const payload = await verifyGoogleToken(idToken);

    // Session information stored in our JWT.
    const sessionPayload = {
      googleId: payload.sub,
      name: payload.name,
      email: payload.email,
    };

    // Create our own session token.
    const sessionToken = jwt.sign(sessionPayload, JWT_SECRET, {
      expiresIn: "7d",
    });

    /*
     * The backend is hosted on Render, while the frontends are hosted at:
     * - Vercel in production
     * - localhost during development
     *
     * Since these are cross-site requests, the production Render server
     * must use SameSite=None and Secure=true.
     */
    res.cookie("session", sessionToken, {
      httpOnly: true,
      sameSite: isProduction ? "none" : "lax",
      secure: isProduction,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });

    return res.json({
      message: "Login successful",
    });
  } catch (err) {
    console.error("Google auth error:", err.message || err);

    return res.status(401).json({
      error: "Invalid Google token",
    });
  }
});

// ---------- SESSION CHECK ROUTE ----------

// GET /api/me
app.get("/api/me", (req, res) => {
  const token = req.cookies.session;

  if (!token) {
    return res.status(401).json({
      error: "Not logged in",
    });
  }

  try {
    const user = jwt.verify(token, JWT_SECRET);

    return res.json({
      user,
    });
  } catch (err) {
    return res.status(401).json({
      error: "Invalid session",
    });
  }
});

// ---------- LOGOUT ----------

// POST /api/logout
app.post("/api/logout", (req, res) => {
  res.clearCookie("session", {
    httpOnly: true,
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction,
    path: "/",
  });

  return res.json({
    message: "Logged out",
  });
});

// ========================================================
//   AUTH MIDDLEWARE FOR TASK ROUTES
// ========================================================

function requireAuth(req, res, next) {
  const token = req.cookies.session;

  if (!token) {
    return res.status(401).json({
      error: "Not logged in",
    });
  }

  try {
    const user = jwt.verify(token, JWT_SECRET);

    // Attach user information to the request.
    req.user = user;

    return next();
  } catch (err) {
    return res.status(401).json({
      error: "Invalid session",
    });
  }
}

// ========================================================
//   TASK ROUTES — PER-USER TASKS
// ========================================================

// GET /api/tasks
// Get all tasks belonging to the current user.
app.get("/api/tasks", requireAuth, async (req, res) => {
  try {
    const tasks = await Task.find({
      googleId: req.user.googleId,
    }).sort({
      createdAt: 1,
    });

    return res.json(tasks);
  } catch (err) {
    console.error("Error fetching tasks:", err);

    return res.status(500).json({
      error: "Failed to fetch tasks",
    });
  }
});

// POST /api/tasks
// Create a new task for the current user.
app.post("/api/tasks", requireAuth, async (req, res) => {
  try {
    const {
      text,
      priority = "medium",
      dueDate = "",
    } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({
        error: "Task text is required",
      });
    }

    const task = await Task.create({
      googleId: req.user.googleId,
      text: text.trim(),
      priority,
      dueDate,
      completed: false,
    });

    return res.status(201).json(task);
  } catch (err) {
    console.error("Error creating task:", err);

    return res.status(500).json({
      error: "Failed to create task",
    });
  }
});

// PUT /api/tasks/:id
// Update a task only if it belongs to the current user.
app.put("/api/tasks/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = {};

    // Only update fields that were actually sent.
    if (req.body.text !== undefined) {
      const trimmedText = req.body.text.trim();

      if (!trimmedText) {
        return res.status(400).json({
          error: "Task text cannot be empty",
        });
      }

      updates.text = trimmedText;
    }

    if (req.body.completed !== undefined) {
      updates.completed = req.body.completed;
    }

    if (req.body.priority !== undefined) {
      updates.priority = req.body.priority;
    }

    if (req.body.dueDate !== undefined) {
      updates.dueDate = req.body.dueDate;
    }

    const task = await Task.findOneAndUpdate(
      {
        _id: id,
        googleId: req.user.googleId,
      },
      updates,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!task) {
      return res.status(404).json({
        error: "Task not found",
      });
    }

    return res.json(task);
  } catch (err) {
    console.error("Error updating task:", err);

    return res.status(500).json({
      error: "Failed to update task",
    });
  }
});

// DELETE /api/tasks/:id
// Delete a task only if it belongs to the current user.
app.delete("/api/tasks/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await Task.findOneAndDelete({
      _id: id,
      googleId: req.user.googleId,
    });

    if (!deleted) {
      return res.status(404).json({
        error: "Task not found",
      });
    }

    return res.json({
      success: true,
    });
  } catch (err) {
    console.error("Error deleting task:", err);

    return res.status(500).json({
      error: "Failed to delete task",
    });
  }
});

// ---------- CORS ERROR HANDLER ----------

app.use((err, req, res, next) => {
  if (err?.message?.includes("not allowed by CORS")) {
    return res.status(403).json({
      error: err.message,
    });
  }

  return next(err);
});

// ---------- GENERAL ERROR HANDLER ----------

app.use((err, req, res, next) => {
  console.error("Unhandled server error:", err);

  return res.status(500).json({
    error: "Internal server error",
  });
});

// ---------- START SERVER ----------
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log("Allowed frontend origins:", allowedOrigins);
});