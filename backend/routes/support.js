// routes/support.js
const express = require("express");
const router = express.Router();
const sendEmail = require("../utils/sendEmail");

// Optional: protect route if you want only logged-in users
const auth = require('../middleware/authMiddleware');

router.post("/report", auth, async (req, res) => {
  try {
    const { subject, message, name, email, phone, to } = req.body;

    if (!subject || !message) {
      return res.status(400).json({ error: "Subject and message are required." });
    }

    const supportInbox = to || process.env.SUPPORT_INBOX || "addesylvinaus@gmail.com";

    const html = `
      <div style="font-family: Arial, sans-serif">
        <h2>App Support Report</h2>
        <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
        <p><strong>Name:</strong> ${escapeHtml(name || "-")}</p>
        <p><strong>Email:</strong> ${escapeHtml(email || "-")}</p>
        <p><strong>Phone:</strong> ${escapeHtml(phone || "-")}</p>
        <hr/>
        <p style="white-space: pre-wrap">${escapeHtml(message)}</p>
      </div>
    `;

    await sendEmail({
      to: supportInbox,
      subject: `[JW Auto Clinic] ${subject}`,
      text: `Name: ${name || "-"}\nEmail: ${email || "-"}\nPhone: ${
        phone || "-"
      }\n\n${message}`,
      html,
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error("Support report error:", err);
    // Surface a concise but actionable message to the client
    const msg =
      err?.response?.toString?.() ||
      err?.message ||
      "Failed to send support email.";
    return res.status(500).json({ error: msg });
  }
});

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

router.get("/whatsnew", async (_req, res) => {
  // You can later read from DB; static for now:
  return res.json([
    {
      version: "1.4.0",
      date: "2025-12-14",
      changes: [
        // --- New ---
        {
          type: "New",
          text: "Biometric login (Face ID / fingerprint) option added to the login screen once enabled in Settings.",
        },
        {
          type: "New",
          text: "New bottom sheet UI introduced for flows like Manage Services & Specials and Settings, replacing full-screen modals in many cases.",
        },
        {
          type: "New",
          text: "Additional earnings and payment-method chart modes with tap-to-filter behavior and richer breakdowns.",
        },
        {
          type: "New",
          text: "Chart segment control now resets the detail view so values only appear after tapping a point in the selected segment.",
        },

        // --- Improved ---
        {
          type: "Improved",
          text: "Tablet layouts refined for Workers, Transactions, Settings, and other key screens in both portrait and landscape.",
        },
        {
          type: "Improved",
          text: "Sticky headers adjusted for better full-width appearance, spacing, and elevation when scrolling.",
        },
        {
          type: "Improved",
          text: "Floating action buttons (FABs) now show correctly on Android devices in landscape and on larger tablets.",
        },
        {
          type: "Improved",
          text: "Bottom sheets and modals now respond better to the keyboard opening and closing, keeping content visible while typing.",
        },
        {
          type: "Improved",
          text: "Login screen spacing and animations polished, including conditional rendering of the biometric login button.",
        },
        {
          type: "Improved",
          text: "Android launcher icon updated to use the correct light-style artwork.",
        },
        {
          type: "Improved",
          text: "Password reset flow in the browser tightened to use the same strong password rules and messages as the mobile app.",
        },
        {
          type: "Improved",
          text: "Transaction details view now gracefully falls back to list data when the server returns a 404 for a specific transaction.",
        },

        // --- Fixed ---
        {
          type: "Fixed",
          text: "Resolved an issue where closing the keyboard could leave extra blank space at the bottom of certain bottom sheets.",
        },
        {
          type: "Fixed",
          text: "Fixed several landscape layout issues where content was misaligned or partially hidden on smaller devices.",
        },
        {
          type: "Fixed",
          text: "Fixed a bug where the payment-method chart could keep the previously selected segment’s highlighted value.",
        },
        {
          type: "Fixed",
          text: "Fixed a custom tab bar problem (“Rendered fewer hooks than expected”) that could cause crashes.",
        },
        {
          type: "Fixed",
          text: "Fixed long service and transaction labels so text now wraps instead of overflowing outside of cards.",
        },
      ],
    },
    {
      version: "1.3.0",
      date: "2025-10-01",
      changes: [
        {
          type: "Improved",
          text: "Worker hourly-rate field now supports fractional values such as 9.375 per hour for more accurate pay setups.",
        },
        {
          type: "Fixed",
          text: "Fixed an issue where the email body total could differ from the receipt calculation, ensuring both now match correctly.",
        },
        {
          type: "Improved",
          text: "UI/UX updates across the Add, Workers, and Settings tabs for a cleaner and more consistent experience.",
        },
        {
          type: "Improved",
          text: "Device orientation handling updated so screens behave correctly in both portrait and landscape modes.",
        },
        {
          type: "Improved",
          text: "Additional under-the-hood changes and updates for stability and performance.",
        },
      ],
    },
    {
      version: "1.2.0",
      date: "2025-08-12",
      changes: [
        { type: "New", text: "Support form added under Settings → Report an Issue." },
        { type: "Improved", text: "Check for Updates now shows clearer messages." },
        { type: "Fixed", text: "Minor layout polish in Settings and inputs." },
      ],
    },
    {
      version: "1.1.0",
      date: "2025-08-05",
      changes: [
        { type: "New", text: "Worker and Shifts screens now refresh more reliably." },
      ],
    },
  ]);
});


module.exports = router;
