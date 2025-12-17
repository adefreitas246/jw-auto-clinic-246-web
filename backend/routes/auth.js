// routes/auth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const User = require('../models/Users');
const Employee = require('../models/Employees');
const PasswordResetToken = require('../models/PasswordResetToken');
const sendEmail = require('../utils/sendEmail');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key';

// POST /api/auth/register (User only)
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const user = new User({ name, email, password, role });
    await user.save();
    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/auth/login (User or Employee)
router.post('/login', async (req, res) => {
  try {
    const { email = '', password = '' } = req.body;

    // Normalise once
    const normalizedEmail = email.trim().toLowerCase();

    // Try User first
    let user = await User.findOne({ email: normalizedEmail });
    if (user && (await user.comparePassword(password))) {
      const token = jwt.sign(
        { userId: user._id, role: user.role, name: user.name, type: 'User' },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      return res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token,
        type: 'User',
      });
    }

    // Then Employee
    const employee = await Employee.findOne({ email: normalizedEmail });
    if (employee && (await employee.comparePassword(password))) {
      const token = jwt.sign(
        { userId: employee._id, role: employee.role, name: employee.name, type: 'Employee' },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      return res.json({
        _id: employee._id,
        name: employee.name,
        email: employee.email,
        role: employee.role,
        token,
        type: 'Employee',
      });
    }

    return res.status(401).json({ error: 'Invalid credentials' });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/forgot-password (User or Employee)
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    // Find account in either collection
    let account = await User.findOne({ email });
    let accountType = 'User';
    if (!account) {
      account = await Employee.findOne({ email });
      accountType = account ? 'Employee' : null;
    }

    // Always return the same response (avoid enumeration)
    if (!account) {
      return res.json({ message: 'If this email exists, a reset link has been sent.' });
    }

    // Invalidate previous tokens for this account
    await PasswordResetToken.deleteMany({ accountId: account._id, accountType });

    // Create a new raw token and store only the hash
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    await PasswordResetToken.create({
      accountId: account._id,
      accountType,
      tokenHash,
      expiresAt,
    });

    // === LINKS ===

    // Deep-link base (for the HTML page to use)
    const scheme = process.env.CLIENT_SCHEME || 'jwautoclinic246';
    const appBase = process.env.APP_RESET_LINK_BASE || `${scheme}://auth/reset-password`;
    const appLink = `${appBase}?token=${encodeURIComponent(rawToken)}`;

    // Web reset link (HTTPS, always clickable in email)
    const appBaseUrl = (process.env.APP_BASE_URL || 'https://jw-auto-clinic-246.onrender.com').replace(/\/$/, '');
    const webLink = `${appBaseUrl}/auth/reset-password?token=${encodeURIComponent(rawToken)}`;

    await sendEmail({
      to: email,
      subject: 'Password Reset',
      html: `
        <p>Hello,</p>
        <p>You requested a password reset. Click the button below to set a new password:</p>

        <p>
          <a href="${webLink}"
            style="display:inline-block;padding:10px 18px;background:#6a0dad;color:#ffffff;
                    text-decoration:none;border-radius:6px;font-weight:bold;">
            Reset Password
          </a>
        </p>

        <p>If the button does not work, copy and paste this link into your browser:</p>
        <p><a href="${webLink}">${webLink}</a></p>

        <p>This link will expire in 30 minutes and can only be used once.</p>
      `,
      text: `
    Hello,

    You requested a password reset.

    Open this link in your browser:
    ${webLink}

    This link will expire in 30 minutes and can only be used once.
      `.trim(),
    });

    return res.json({ message: 'If this email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot Password Error:', err);
    res.status(500).json({ error: 'Server error while sending reset link.' });
  }
});


// POST /api/auth/reset-password (User or Employee)
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ error: 'Token and new password are required.' });
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const record = await PasswordResetToken.findOne({ tokenHash });

    if (!record) return res.status(400).json({ error: 'Reset token is invalid.' });
    if (record.usedAt) return res.status(400).json({ error: 'Reset token has already been used.' });
    if (record.expiresAt < new Date()) return res.status(400).json({ error: 'Reset token has expired.' });

    // Load account by type
    let account = null;
    if (record.accountType === 'User') account = await User.findById(record.accountId);
    if (record.accountType === 'Employee') account = await Employee.findById(record.accountId);
    if (!account) {
      await PasswordResetToken.deleteOne({ _id: record._id });
      return res.status(404).json({ error: 'Account not found.' });
    }

    // Set new password; the model's pre('save') will hash
    account.password = password;
    await account.save();

    // Mark token used and purge old tokens
    record.usedAt = new Date();
    await record.save();
    await PasswordResetToken.deleteMany({ accountId: record.accountId, accountType: record.accountType });

    return res.json({ message: 'Password reset successful. You can now log in.' });
  } catch (err) {
    console.error('Reset Password Error:', err);
    res.status(500).json({ error: 'Server error while resetting password.' });
  }
});


module.exports = router;
