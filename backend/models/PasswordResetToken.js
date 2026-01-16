// models/PasswordResetToken.js
const mongoose = require('mongoose');

const PasswordResetTokenSchema = new mongoose.Schema({
  accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  accountType: { type: String, enum: ['User', 'Worker'], required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
  // Auto-delete at expiresAt time
  expiresAt: { type: Date, index: { expireAfterSeconds: 0 }, required: true },
  usedAt: { type: Date, default: null },
});

module.exports = mongoose.model('PasswordResetToken', PasswordResetTokenSchema);
