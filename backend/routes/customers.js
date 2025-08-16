// routes/customers.js
const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');
const authMiddleware = require('../middleware/authMiddleware');

const norm = (s = '') => String(s || '').trim();
const normLower = (s = '') => norm(s).toLowerCase();

/* ========================= NEW: find by email ========================= */
router.get('/by-email', authMiddleware, async (req, res) => {
  try {
    const email = norm(req.query.email);
    if (!email) return res.status(400).json({ error: 'Missing email' });

    // case-insensitive exact match
    const customer = await Customer.findOne({ email: new RegExp(`^${email}$`, 'i') });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    res.json(customer);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching customer by email' });
  }
});

/* ===================== NEW: find-or-create (ensure) ==================== */
/**
 * Accepts: { name, email, phone, vehicleDetails, discount, specials, customerCode? }
 * - identity: (name, vehicleDetails) pair (your unique index)
 * - If email is present, we also try an exact email match first.
 * Returns the customer doc (200 if found/updated; 201 if created)
 */
router.post('/ensure', authMiddleware, async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      vehicleDetails,
      discount,
      specials,
      customerCode, // optional
      ...rest
    } = req.body || {};

    const cleanName = norm(name);
    const cleanVehicle = norm(vehicleDetails);
    const cleanEmail = norm(email);

    // Required by your schema on CREATE
    if (!cleanName) return res.status(400).json({ error: 'Name is required' });
    if (!cleanVehicle) return res.status(400).json({ error: 'Vehicle details are required' });

    // 1) Try by email (best identifier if provided)
    let found = null;
    if (cleanEmail) {
      found = await Customer.findOne({ email: new RegExp(`^${cleanEmail}$`, 'i') });
    }

    // 2) Fallback: identity is (name, vehicleDetails), case-insensitive exact match
    if (!found) {
      found = await Customer.findOne({
        name: new RegExp(`^${cleanName}$`, 'i'),
        vehicleDetails: new RegExp(`^${cleanVehicle}$`, 'i'),
      });
    }

    if (found) {
      // Update non-destructively
      if (cleanName && found.name !== cleanName) found.name = cleanName;
      if (cleanVehicle && found.vehicleDetails !== cleanVehicle) found.vehicleDetails = cleanVehicle;
      if (cleanEmail) found.email = cleanEmail;
      if (phone != null) found.phone = phone;
      if (discount != null) found.discount = discount;
      if (specials != null) found.specials = specials;
      Object.assign(found, rest);

      await found.save();
      return res.json(found);
    }

    // 3) Not found: create a new one
    const toCreate = {
      name: cleanName,
      vehicleDetails: cleanVehicle,
      ...(cleanEmail ? { email: cleanEmail } : {}),
      ...(phone ? { phone } : {}),
      ...(discount != null ? { discount } : {}),
      ...(specials != null ? { specials } : {}),
      ...(customerCode ? { customerCode } : {}),
      ...rest,
    };

    try {
      const created = await Customer.create(toCreate);
      return res.status(201).json(created);
    } catch (e) {
      // Handle duplicate key race on (name, vehicleDetails)
      if (e && e.code === 11000) {
        const again = await Customer.findOne({
          name: new RegExp(`^${cleanName}$`, 'i'),
          vehicleDetails: new RegExp(`^${cleanVehicle}$`, 'i'),
        });
        if (again) return res.json(again);
      }
      throw e;
    }
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to ensure customer' });
  }
});

/* ==================== EXISTING ROUTES (keep as-is) ==================== */

// GET all customers
router.get('/', authMiddleware, async (req, res) => {
  try {
    const customers = await Customer.find().sort({ name: 1 });
    res.json(customers);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// SEARCH customer by name + vehicle (extend to email too)
router.get('/search', authMiddleware, async (req, res) => {
  const { name } = req.query;
  if (!name) return res.status(400).json({ error: 'Missing name' });

  try {
    const q = String(name).trim();
    const matches = await Customer.find({
      $or: [
        { name: { $regex: new RegExp(q, 'i') } },
        { vehicleDetails: { $regex: new RegExp(q, 'i') } },
        { email: { $regex: new RegExp(q, 'i') } },
      ],
    })
      .limit(6)
      .sort({ name: 1 });

    res.json(matches);
  } catch (err) {
    res.status(500).json({ error: 'Error searching for customer' });
  }
});

// GET by id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json(customer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// CREATE
router.post('/', authMiddleware, async (req, res) => {
  try {
    const newCustomer = new Customer(req.body);
    await newCustomer.save();
    res.status(201).json(newCustomer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// UPDATE
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const updated = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ error: 'Customer not found' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const deleted = await Customer.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Customer not found' });
    res.json({ message: 'Customer deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
