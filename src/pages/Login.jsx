// src/Login.jsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const navigate = useNavigate();
  const buttonRef = useRef(null);
  const [gisReady, setGisReady] = useState(false);

  // Wait for Google Identity script to load
  useEffect(() => {
    let attempts = 0;

    const interval = setInterval(() => {
      attempts++;

      if (window.google?.accounts?.id) {
        setGisReady(true);
        clearInterval(interval);
      }

      // Stop trying after ~10 seconds
      if (attempts > 100) {
        clearInterval(interval);
        console.error("Google Identity Services failed to load.");
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

  // Initialize + render button once GIS is ready
  useEffect(() => {
    if (!gisReady || !buttonRef.current) return;

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    console.log("Frontend Client ID:", clientId);

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response) => {
        try {
          const res = await fetch(
            "https://todo-backend-0drg.onrender.com/api/auth/google",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ idToken: response.credential }),
            }
          );

          if (!res.ok) {
            console.error("Login failed");
            return;
          }

          navigate("/app");
        } catch (err) {
          console.error("Error during login:", err);
        }
      },
    });

    // Clear any previous render (important for re-renders)
    buttonRef.current.innerHTML = "";

    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: "outline",
      size: "large",
      width: 260,
    });
  }, [gisReady, navigate]);

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

        <div ref={buttonRef} className="login-google-btn"></div>

        {!gisReady && (
          <p style={{ marginTop: "10px" }}>Loading Google sign-in…</p>
        )}

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