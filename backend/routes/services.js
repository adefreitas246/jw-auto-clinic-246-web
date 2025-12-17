const express = require('express');
const router = express.Router();
const Services = require('../models/Services'); // Mongoose model

// Create
router.post('/', async (req, res) => {
  const { name, price } = req.body;
  if (!name || price == null) return res.status(400).json({ error: 'Name and price are required.' });
  try {
    const services = new Services({ name, price });
    await services.save();
    res.json(services);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create service' });
  }
});

// Get All
router.get('/', async (_ , res) => {
  const services = await Services.find();
  res.json(services);
});

// Update
router.put('/:id', async (req, res) => {
  const { name, price } = req.body;
  try {
    const services = await Services.findByIdAndUpdate(req.params.id, { name, price }, { new: true });
    res.json(services);
  } catch (err) {
    res.status(500).json({ error: 'Update failed' });
  }
});

// Delete
router.delete('/:id', async (req, res) => {
  try {
    await Services.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

module.exports = router;
