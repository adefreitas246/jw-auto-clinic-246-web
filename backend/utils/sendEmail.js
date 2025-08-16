// utils/sendEmail.js
const nodemailer = require('nodemailer');

/**
 * Send email using Gmail (or any SMTP via overrides)
 * @param {Object} options
 * @param {string} options.to          - Recipient email
 * @param {string} options.subject     - Subject line
 * @param {string} options.html        - HTML body
 * @param {string} [options.text]      - Plain text (optional)
 * @param {Array}  [options.attachments] - Nodemailer attachments array
 *    e.g. [{ filename: 'Receipt.pdf', content: <Buffer>, contentType: 'application/pdf' }]
 * @param {Object} [options.smtp]      - Optional SMTP override { host, port, secure, user, pass, from }
 */
const sendEmail = async ({ to, subject, html, text, attachments, smtp }) => {
  // Resolve envs with sane Gmail defaults
  const env = (k, d='') => (process.env[k] ?? d).toString().trim();
  const host = smtp?.host || env('SMTP_HOST', 'smtp.gmail.com');
  const port = Number(smtp?.port || env('SMTP_PORT', '587')); // 587 STARTTLS by default
  const secure = smtp?.secure ?? (port === 465);              // true if 465, else false (Nodemailer will STARTTLS)
  const user = smtp?.user || env('SMTP_USER');                // your full Gmail address
  const pass = smtp?.pass || env('SMTP_PASS');                // your 16-char App Password
  const from =
    smtp?.from ||
    env('SMTP_FROM') ||                                       // if you configured a Gmail alias, put it here
    (user ? `"JW Auto Clinic" <${user}>` : undefined);

  if (!user || !pass) {
    throw new Error('SMTP_USER/SMTP_PASS not configured (use Gmail address + App Password).');
  }
  if (!from) {
    throw new Error('No FROM address configured. Set SMTP_FROM or rely on SMTP_USER.');
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: { minVersion: 'TLSv1.2' },
  });

  try {
    await transporter.verify();

    const mail = {
      from,
      to,
      subject,
      html,
      ...(text ? { text } : {}),
      ...(attachments?.length ? { attachments } : {}), // ← add attachments if provided
    };

    const info = await transporter.sendMail(mail);
    console.log(`📧 Email sent via ${host}:${port}${secure ? ' (SSL)' : ''} -> ${info.messageId}`);
    return info;
  } catch (error) {
    console.error(`❌ Failed to send email via ${host}:${port}:`, error);
    throw new Error('Email sending failed: ' + (error?.message || error));
  }
};

module.exports = sendEmail;
