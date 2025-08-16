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
        { type: "New", text: "Employee and Shifts screens now refresh more reliably." },
      ],
    },
  ]);
});

module.exports = router;
