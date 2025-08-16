// routes/shifts.js
const express = require('express');
const router = express.Router();
const Shift = require('../models/Shift');
const authMiddleware = require('../middleware/authMiddleware');
const mongoose = require('mongoose');
const formatDuration = (ms) => {
  const totalSec = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  return `${hrs}h ${mins}m ${secs}s`;
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

// GET last active shift for an employee (exclude deleted)
router.get('/last/:name', authMiddleware, async (req, res) => {
  try {
    const { name } = req.params;

    const shift = await Shift.findOne({
      employee: name,
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
    const { employee, date, clockIn } = req.body;

    const newShift = new Shift({
      employee,
      date,
      clockIn,
      clockOut: '',
      hours: '',
      status: 'Active',
    });

    await newShift.save();
    res.status(201).json(newShift);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT clock-out and complete
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { clockOut, hours, status } = req.body;

    const updated = await Shift.findByIdAndUpdate(
      req.params.id,
      { clockOut, hours, status },
      { new: true }
    );

    if (!updated) return res.status(404).json({ error: 'Shift not found' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// SOFT DELETE (already good; kept + small guards)
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