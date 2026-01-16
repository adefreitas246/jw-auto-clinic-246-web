// routes/workers.js
const express = require('express');
const router = express.Router();
const Worker = require('../models/Workers');
const authMiddleware = require('../middleware/authMiddleware');
const crypto = require('crypto');
const sendEmail = require('../utils/sendEmail');


// simple role guard in-file to match your current approach
const ensureAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
};

// GET all workers (sorted by creation)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const workers = await Worker.find().sort({ createdAt: -1 });
    res.json(workers);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch workers' });
  }
});

// GET a single worker
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const worker = await Worker.findById(req.params.id);
    if (!worker) return res.status(404).json({ error: 'Worker not found' });

    res.json(worker);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST create new worker
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, email, phone, role, hourlyRate } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const newEmployee = new Worker({
      name,
      email,
      phone,
      role: role || 'staff',
      hourlyRate: hourlyRate || 0,
      createdBy: req.user.id,
      clockedIn: false,
      password: '', // triggers default in model
    });

    await newEmployee.save();
    const { password, ...employeeWithoutPassword } = newEmployee.toObject();
    res.status(201).json(employeeWithoutPassword);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


// PATCH toggle clock in/out
router.patch('/:id/clock', authMiddleware, async (req, res) => {
  try {
    const worker = await Worker.findById(req.params.id);
    if (!worker) return res.status(404).json({ error: 'Worker not found' });

    worker.clockedIn = !worker.clockedIn;
    await worker.save();
    res.json(worker);
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle clock status' });
  }
});


const generateTempPassword = () => crypto.randomBytes(8).toString('base64url');

router.post('/:id/reset-password', authMiddleware, ensureAdmin, async (req, res) => {
  try {
    const { notify = false } = req.body || {};
    const worker = await Worker.findById(req.params.id);
    if (!worker) return res.status(404).json({ error: 'Worker not found' });

    // ✅ Just set plaintext; your schema will hash it on save
    const temporaryPassword = generateTempPassword();
    worker.password = temporaryPassword;

    await worker.save(); // triggers employeeSchema.pre('save') to hash

    let emailed = false;
    if (notify && worker.email) {
      try {
        await sendEmail({
          to: worker.email,
          subject: 'Your password has been reset',
          html: `
            <p>Hi ${worker.name || 'there'},</p>
            <p>An administrator reset your password.</p>
            <p>Your temporary password is:</p>
            <p style="font-size:16px;"><b>${temporaryPassword}</b></p>
            <p>Please log in and change it immediately.</p>
          `,
        });
        emailed = true;
      } catch (e) {
        console.warn('sendEmail failed:', e?.message || e);
      }
    }

    return res.json({ temporaryPassword, emailed });
  } catch (err) {
    console.error('reset-password error:', err);
    return res.status(500).json({ error: 'Could not reset password' });
  }
});

// PUT update an worker
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const updated = await Worker.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ error: 'Worker not found' });

    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE worker
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const deleted = await Worker.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Worker not found' });

    res.json({ message: 'Worker deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
