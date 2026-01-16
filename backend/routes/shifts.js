// routes/shifts.js
const express = require('express');
const router = express.Router();
// CHANGED: make sure this matches your actual filename (Shift.js vs Shifts.js)
const Shift = require('../models/Shift');
const authMiddleware = require('../middleware/authMiddleware');
const mongoose = require('mongoose');

// formatDuration stays the same
const formatDuration = (ms) => {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  return `${hrs}h ${mins}m ${secs}s`;
};

// NEW: parse "YYYY-MM-DD" + "HH:MM:SS AM/PM" into a Date (handles midnight rollover)
const parseDateTime = (dateISO, time12h) => {
  if (!dateISO || !time12h) return null;
  const [time, ampmRaw] = time12h.split(' ');
  if (!time || !ampmRaw) return null;
  const [hh, mm, ss] = time.split(':').map(n => parseInt(n, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm) || Number.isNaN(ss)) return null;
  let H = hh % 12;
  const ampm = ampmRaw.toUpperCase();
  if (ampm === 'PM') H += 12;
  const pad = (n) => String(n).padStart(2, '0');
  return new Date(`${dateISO}T${pad(H)}:${pad(mm)}:${pad(ss)}.000Z`);
};

// NEW: compute hours + hoursDecimal (subtract lunch if both ends exist)
const computeTotals = (shift, overrides = {}) => {
  const date = shift.date;
  const clockIn = shift.clockIn;
  const clockOut = overrides.clockOut ?? shift.clockOut;

  const start = parseDateTime(date, clockIn);
  let end = parseDateTime(date, clockOut);
  if (!start || !end) return { hours: '', hoursDecimal: 0 };

  // if end is before start (past midnight), add a day
  if (end < start) end = new Date(end.getTime() + 24 * 3600 * 1000);

  // lunch window
  const lunchStartStr = (overrides.lunchStart ?? (shift.lunchStart || '')).trim();
  const lunchEndStr   = (overrides.lunchEnd   ?? (shift.lunchEnd   || '')).trim();
  let lunchMs = 0;
  if (lunchStartStr && lunchEndStr) {
    let lStart = parseDateTime(date, lunchStartStr);
    let lEnd   = parseDateTime(date, lunchEndStr);
    if (lStart && lEnd) {
      if (lEnd < lStart) lEnd = new Date(lEnd.getTime() + 24 * 3600 * 1000);
      // clamp lunch window within shift window
      const l0 = Math.max(start.getTime(), lStart.getTime());
      const l1 = Math.min(end.getTime(), lEnd.getTime());
      if (l1 > l0) lunchMs = l1 - l0;
    }
  }

  const grossMs = Math.max(0, end.getTime() - start.getTime());
  const netMs = Math.max(0, grossMs - lunchMs);

  return {
    hours: formatDuration(netMs),
    hoursDecimal: Math.round((netMs / 3600000) * 100) / 100, // 2dp
  };
};

// GET all shifts (exclude deleted)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const shifts = await Shift.find({ deletedAt: null })
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(shifts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch shifts' });
  }
});

// GET last active shift for an worker (exclude deleted)
router.get('/last/:name', authMiddleware, async (req, res) => {
  try {
    const { name } = req.params;

    const shift = await Shift.findOne({
      worker: name,
      status: 'Active',
      deletedAt: null,
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!shift) return res.status(404).json({ error: 'No active shift found' });
    res.json(shift);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST new clock-in
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { worker, date, clockIn } = req.body;

    const newShift = new Shift({
      worker,
      date,
      clockIn,
      clockOut: '',
      lunchStart: '',  // NEW
      lunchEnd: '',    // NEW
      hours: '',
      hoursDecimal: 0, // NEW: make explicit
      status: 'Active',
    });

    await newShift.save();
    res.status(201).json(newShift);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update shift (clock-out, lunch start/end, status)
// - if clockOut is provided, computes hours + hoursDecimal server-side
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const id = (req.params.id || '').toString().trim();
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid shift ID' });
    }

    const { clockOut, status, lunchStart, lunchEnd } = req.body;

    const shift = await Shift.findById(id);
    if (!shift || shift.deletedAt) return res.status(404).json({ error: 'Shift not found' });

    // Build $set with only provided fields
    const set = {};
    if (typeof lunchStart === 'string') set.lunchStart = lunchStart.trim();  // NEW
    if (typeof lunchEnd === 'string')   set.lunchEnd   = lunchEnd.trim();    // NEW
    if (typeof clockOut === 'string')   set.clockOut   = clockOut.trim();

    // If clocking out, compute totals (subtracting lunch if both ends exist)
    if (typeof clockOut === 'string' && clockOut.trim()) {
      const totals = computeTotals(shift, {
        clockOut: clockOut.trim(),
        lunchStart: set.lunchStart ?? shift.lunchStart,
        lunchEnd: set.lunchEnd ?? shift.lunchEnd,
      });
      set.hours = totals.hours;
      set.hoursDecimal = totals.hoursDecimal;
      set.status = status || 'Completed';
    } else if (status) {
      // Allow status update without clockOut (rare, but safe)
      set.status = status;
    }

    const updated = await Shift.findByIdAndUpdate(
      id,
      { $set: set },
      { new: true }
    );

    if (!updated) return res.status(404).json({ error: 'Shift not found' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// SOFT DELETE (unchanged)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    let { id } = req.params;
    id = (id || '').toString().trim().replace(/\u200E|\u200F|\u202A|\u202C/g, '');
    console.log('[DELETE] /shifts/:id ->', id, 'len:', id.length);

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid shift ID' });
    }

    const exists = await Shift.exists({ _id: id });
    console.log('[DELETE] exists?', exists);

    if (!exists) return res.status(404).json({ error: 'Shift not found' });

    const updated = await Shift.findByIdAndUpdate(
      id,
      { deletedAt: new Date(), deletedBy: req.user?.name || req.user?.id || 'system' },
      { new: true }
    );

    if (!updated) return res.status(404).json({ error: 'Shift not found' });
    return res.json({ ok: true, id });
  } catch (err) {
    console.error('Soft delete failed:', err);
    return res.status(500).json({ error: 'Failed to delete shift' });
  }
});

module.exports = router;
