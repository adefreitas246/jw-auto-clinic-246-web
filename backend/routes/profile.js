// routes/profile.js
const express = require('express');
const router = express.Router();
const User = require('../models/Users');
const Employee = require('../models/Employees');
const authenticate = require('../middleware/authMiddleware');

// Helper: pick model based on JWT "type"
function getAccountContext(req) {
  const id = req.user?.userId || req.user?.id; // support either field name
  const type = req.user?.type === 'Employee' ? 'Employee' : 'User';
  const Model = type === 'Employee' ? Employee : User;
  return { id, type, Model };
}

// PUT /api/profile  (update limited fields)
router.put('/', authenticate, async (req, res) => {
  const { id, type, Model } = getAccountContext(req);
  const { name, email, phone, avatar, notificationsEnabled } = req.body;

  try {
    // Whitelist fields (Employees may not have avatar/notificationsEnabled in schema; that’s fine)
    const update = {};
    if (name !== undefined) update.name = name;
    if (email !== undefined) update.email = email;
    if (phone !== undefined) update.phone = phone;
    if (avatar !== undefined) update.avatar = avatar; // ignored if not in schema
    if (notificationsEnabled !== undefined) update.notificationsEnabled = notificationsEnabled; // ignored if not in schema

    const updated = await Model.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    });

    if (!updated) return res.status(404).json({ message: `${type} not found` });

    // Normalise response for app
    return res.json({
      _id: updated._id,
      name: updated.name || '',
      email: updated.email || '',
      phone: updated.phone || '',
      avatar: updated.avatar || '',                        // Employees: will be '' unless you add to schema
      role: updated.role,
      notificationsEnabled:
        typeof updated.notificationsEnabled === 'boolean'
          ? updated.notificationsEnabled
          : true,                                         // sensible default
    });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/profile  (fetch current profile)
router.get('/', authenticate, async (req, res) => {
  const { id, type, Model } = getAccountContext(req);

  try {
    // Select common fields; missing ones will be undefined (we’ll default in response)
    const doc = await Model.findById(id).select('name email phone avatar role notificationsEnabled');
    if (!doc) return res.status(404).json({ message: `${type} not found` });

    return res.json({
      _id: doc._id,
      name: doc.name || '',
      email: doc.email || '',
      phone: doc.phone || '',
      avatar: doc.avatar || '',
      role: doc.role,
      notificationsEnabled:
        typeof doc.notificationsEnabled === 'boolean' ? doc.notificationsEnabled : true,
    });
  } catch (err) {
    console.error('Fetch profile error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
