const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const Transaction = require('../models/Transaction');
const Worker = require('../models/Workers');

// GET /api/reports/dashboard
router.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    // Get start and end of today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // Total revenue and services
    const [totalRevenueAgg, totalServices, totalEmployees, activeNow] = await Promise.all([
      Transaction.aggregate([{ $group: { _id: null, total: { $sum: { $toDouble: "$amount" } } } }]),
      Transaction.countDocuments(),
      Worker.countDocuments(),
      Worker.countDocuments({ clockedIn: true }),
    ]);

    // Today's transactions, revenue, etc.
    const [todayTransactions, todayRevenueAgg, todayServices] = await Promise.all([
      Transaction.find({ createdAt: { $gte: today, $lt: tomorrow } }),
      Transaction.aggregate([
        {
          $match: { createdAt: { $gte: today, $lt: tomorrow } }
        },
        {
          $group: { _id: null, total: { $sum: { $toDouble: "$amount" } } }
        }
      ]),
      Transaction.countDocuments({ createdAt: { $gte: today, $lt: tomorrow } }),
    ]);

    res.json({
      totalRevenue: totalRevenueAgg[0]?.total || 0,
      totalServices,
      totalEmployees,
      activeNow,
      todayRevenue: todayRevenueAgg[0]?.total || 0,
      todayTransactions: todayTransactions.length,
      todayServices,
      todayClockedIn: activeNow, // Still live
    });
  } catch (err) {
    console.error('Dashboard Error:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

module.exports = router;
