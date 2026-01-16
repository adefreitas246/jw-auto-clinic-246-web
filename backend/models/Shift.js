// models/Shift.js
const mongoose = require('mongoose');

const shiftSchema = new mongoose.Schema({
  worker: { type: String, required: true, trim: true },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  clockIn: { type: String, required: true, trim: true },
  clockOut: { type: String, default: '', trim: true },
  // NEW: lunch window (stored as "HH:MM:SS AM/PM" like other times)
  lunchStart: { type: String, default: '', trim: true }, // NEW
  lunchEnd:   { type: String, default: '', trim: true }, // NEW

  hours: { type: String, default: '' },        // e.g., "0h 0m 22s"
  hoursDecimal: { type: Number, default: 0 },  // e.g., 0.01

  status: { type: String, enum: ['Active', 'Completed'], default: 'Active' },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Shift', shiftSchema);
