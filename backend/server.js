// server.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const customersRouter = require('./routes/customers');
const transactionsRouter = require('./routes/transactions');
const authRouter = require('./routes/auth');
const employeesRouter = require('./routes/workers');
const shiftsRouter = require('./routes/shifts');
const profileRouter = require('./routes/profile');
const reportRoutes = require('./routes/reports');
const serviceRoutes = require('./routes/services');
const specialRoutes = require('./routes/specials');
const supportRoutes = require('./routes/support');

const app = express();
app.use(cors());
// allow large JSON bodies (PDF base64)
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

/**
 * Public reset-password landing page.
 *
 * This is what the HTTPS link in the email points to:
 *   https://jw-auto-clinic-246.onrender.com/auth/reset-password?token=...
 *
 * Behaviour:
 *  - Reads ?token=...
 *  - On mobile, tries to open the app via custom scheme:
 *      jwautoclinic246://auth/reset-password?token=...
 *  - Always shows a browser form that POSTs JSON to /api/auth/reset-password
 *    using your existing API.
 */
app.get("/auth/reset-password", (req, res) => {
  const token = (req.query.token || "").toString();
  const userAgent = (req.headers["user-agent"] || "").toLowerCase();

  const scheme = process.env.CLIENT_SCHEME || "jwautoclinic246";
  const deepLink = `${scheme}://auth/reset-password?token=${encodeURIComponent(token)}`;
  const isMobile = /iphone|ipad|ipod|android/.test(userAgent);

  res.send(`
    <!doctype html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>Reset Password - JW Auto Clinic</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        body {
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          padding: 24px;
          background: #f7f7fb;
        }
        .box {
          max-width: 420px;
          margin: 0 auto;
          background: #ffffff;
          border-radius: 12px;
          padding: 24px;
          box-shadow: 0 6px 18px rgba(0,0,0,0.06);
        }
        h1 {
          font-size: 22px;
          margin-bottom: 12px;
          color: #1f1f1f;
        }
        button {
          background-color: #6a0dad;
          color: #ffffff;
          border: none;
          padding: 10px 16px;
          border-radius: 8px;
          font-size: 15px;
          cursor: pointer;
        }
        input[type="password"] {
          width: 100%;
          padding: 10px;
          margin: 8px 0;
          border-radius: 8px;
          border: 1px solid #ddd;
          box-sizing: border-box;
          font-size: 14px;
        }
        .muted {
          color: #555;
          font-size: 13px;
          margin-bottom: 12px;
        }
        .status {
          font-size: 14px;
          margin-top: 10px;
        }
        .status.error { color: #c00; }
        .status.success { color: #0a8f3c; }
        .hint { font-size: 12px; color: #555; margin-top: -4px; margin-bottom: 8px; }
        .pill {
          display: inline-block;
          font-size: 11px;
          padding: 4px 8px;
          border-radius: 999px;
          background: #eee;
          margin-right: 4px;
          margin-bottom: 4px;
        }
      </style>
    </head>
    <body>
      <div class="box">
        <h1>Reset Password</h1>

        ${
          token
            ? `<p class="muted">
                If you have the JW Auto Clinic app installed, we'll try to open it automatically.
              </p>`
            : `<p class="muted">Your reset link is missing a token. Please request a new reset email.</p>`
        }

        ${
          token
            ? `
        <button type="button" onclick="openApp()">Open in App</button>
        <p class="muted" style="margin-top:10px;">
          If nothing happens, you can reset your password below in this browser.
        </p>
        `
            : ""
        }

        ${
          token
            ? `
        <div style="margin-top:16px;">
          <label class="muted">New password</label>
          <input type="password" id="password" placeholder="Enter new password" />

          <p class="hint">
            Password must be at least 8 characters and include:
          </p>
          <div style="margin-bottom:8px;">
            <span class="pill">Uppercase letter</span>
            <span class="pill">Lowercase letter</span>
            <span class="pill">Number</span>
            <span class="pill">Special character</span>
          </div>

          <label class="muted" style="margin-top:8px; display:block;">Confirm new password</label>
          <input type="password" id="passwordConfirm" placeholder="Re-enter new password" />

          <button type="button" style="margin-top:10px;" onclick="submitReset()">
            Reset Password
          </button>
          <div id="status" class="status"></div>
        </div>
        `
            : ""
        }
      </div>

      <script>
        const token = ${JSON.stringify(token)};
        const deepLink = ${JSON.stringify(deepLink)};
        const isMobile = ${isMobile ? "true" : "false"};

        // Same strong password rule as the Expo screen:
        // - at least 8 chars
        // - at least 1 uppercase
        // - at least 1 lowercase
        // - at least 1 number
        // - at least 1 special character from @$!%*?&()[\\]{}^#_+=-
        const strongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&()[\\]{}^#_+=-])[A-Za-z\\d@$!%*?&()[\\]{}^#_+=-]{8,}$/;

        function openApp() {
          if (!token) return;
          window.location.href = deepLink;
        }

        async function submitReset() {
          const status = document.getElementById("status");
          const pwdInput = document.getElementById("password");
          const confirmInput = document.getElementById("passwordConfirm");

          const password = (pwdInput.value || "").trim();
          const confirm = (confirmInput.value || "").trim();

          status.textContent = "";
          status.className = "status";

          // Basic required fields
          if (!password || !confirm) {
            status.textContent = "Both password fields are required.";
            status.classList.add("error");
            return;
          }

          // Strong password check (same as app)
          if (!strongRegex.test(password)) {
            status.textContent =
              "Weak password. It must be at least 8 characters and include uppercase, lowercase, number, and special character.";
            status.classList.add("error");
            return;
          }

          // Match check
          if (password !== confirm) {
            status.textContent = "Passwords do not match.";
            status.classList.add("error");
            return;
          }

          try {
            const res = await fetch("/api/auth/reset-password", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token, password }),
            });

            const data = await res.json();
            if (!res.ok) {
              status.textContent = data.error || "Reset failed.";
              status.classList.add("error");
            } else {
              status.textContent = "Password reset successful. You can now close this page and log in.";
              status.classList.add("success");
              pwdInput.value = "";
              confirmInput.value = "";
            }
          } catch (err) {
            status.textContent = "Something went wrong. Please try again.";
            status.classList.add("error");
          }
        }

        // Auto-attempt deep link on mobile when we have a token
        if (isMobile && token) {
          setTimeout(openApp, 400);
        }
      </script>
    </body>
    </html>
  `);
});

app.use('/api/customers', customersRouter);
app.use('/api/transactions', transactionsRouter); 
app.use('/api/auth', authRouter);
app.use('/api/workers', employeesRouter);
app.use('/api/shifts', shiftsRouter);
app.use('/api/profile', profileRouter);
app.use('/api/reports', reportRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/specials', specialRoutes);
app.use('/api/support', supportRoutes);

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error(err));

app.get("/", (req, res) => res.send("JW Auto Clinic API Running"));

const PORT = process.env.PORT || 8081;
app.listen(PORT, "0.0.0.0", () => console.log(`Server running on ${PORT}`));

