// src/Login.jsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const navigate = useNavigate();

  useEffect(() => {
    /* global google */

    // Make sure Google script has loaded
    if (!window.google || !window.google.accounts) return;

    // Load client ID from Vite env
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

    // 🔥 DEBUG: Confirm correct client ID is being loaded
    console.log("Frontend Client ID:", clientId);

    google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response) => {
        try {
          // Send ID token to backend
          const res = await fetch("http://localhost:3001/api/auth/google", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ idToken: response.credential }),
          });

          if (!res.ok) {
            console.error("Login failed");
            return;
          }

          // Success → go to dashboard
          navigate("/app");
        } catch (err) {
          console.error("Error during login:", err);
        }
      },
    });

    // Render Google button
    google.accounts.id.renderButton(
      document.getElementById("google-signin-button"),
      {
        theme: "outline",
        size: "large",
        width: 260,
      }
    );
  }, [navigate]);

  // Background image from /public/assets/
  const backgroundUrl = "/assets/loginpagebg.png";

  return (
    <div
      className="login-page"
      style={{ backgroundImage: `url('${backgroundUrl}')` }}
    >
      <div className="login-card">
        <h1 className="login-title">Welcome to What To-Do 🗓️</h1>
        <p className="login-subtext">
          Organize tasks. Track progress. Stay on pace.
        </p>

        <div id="google-signin-button" className="login-google-btn"></div>

        <p className="login-hint">
          Sign in with your Google account to continue.
        </p>

        <button
          type="button"
          className="login-skip"
          onClick={() => navigate("/app")}
        >
          Skip for now →
        </button>
      </div>
    </div>
  );
}
