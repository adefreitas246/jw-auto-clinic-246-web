const express = require('express');
const router = express.Router();
const Specials = require('../models/Specials');

// Create
router.post('/', async (req, res) => {
  const { name, discountPercent } = req.body;
  if (!name || discountPercent == null) return res.status(400).json({ error: 'Name and discount % are required.' });
  try {
    const special = new Specials({ name, discountPercent });
    await special.save();
    res.json(special);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create special' });
  }
});

// Get All
router.get('/', async (_req, res) => {
  const specials = await Specials.find();
  res.json(specials);
});

// Update
router.put('/:id', async (req, res) => {
  const { name, discountPercent } = req.body;
  try {
    const specials = await Specials.findByIdAndUpdate(req.params.id, { name, discountPercent }, { new: true });
    res.json(specials);
  } catch (err) {
    res.status(500).json({ error: 'Update failed' });
  }
});

// Delete
router.delete('/:id', async (req, res) => {
  try {
    await Specials.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

module.exports = router;
