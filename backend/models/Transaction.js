// models/Transaction.js
const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  serviceType: {
    type: String,
    required: [true, 'Service type is required'],
    trim: true,
    alias: 'serviceName',
  },
  serviceTypeId: {                   
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    default: null,
  },


  originalPrice: {
    type: Number,
    required: [true, 'Original service price is required'],
    min: [0, 'Price must be positive'],
  },
  // NEW: always store the computed final price; do NOT overwrite originalPrice
  finalPrice: {
    type: Number,
    min: 0,
    default: 0,
  },
  discountAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  discountPercent: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  discountLabel: {
    type: String,
    default: '',
    trim: true,
  },
  serviceDate: {
    type: Date,
    default: Date.now,
  },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Mobile Payment'],
    required: [true, 'Payment method is required'],
  },
  vehicleDetails: {
    type: String,
    trim: true,
    required: [true, 'Vehicle details are required'],
  },
  customerName: {
    type: String,
    trim: true,
    required: [true, 'Customer or company name is required'],
  },
  // Optional: store the receipt email so you have a record
  email: {
    type: String,
    trim: true,
    lowercase: true,
  },
  notes: {
    type: String,
    trim: true,
  },
  specials: {
    type: String,
    trim: true,
    alias: 'specialsName',
  },
  specialsId: {                                                  // NEW (ref optional)
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Special',
    default: null,
  },

  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: [true, 'Customer is required'],
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Created by is required'],
  },


  // Optional: store the exact PDF you send in email so the app can re-share
  receiptPdfBase64: { type: String, default: '' },
  receiptFileName: { type: String, default: '' }, 

}, {
  timestamps: true,
});

// ---- helpers ----
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
function computeFinal(originalPrice = 0, discountPercent = 0, discountAmount = 0) {
  const op   = Number(originalPrice) || 0;
  const dp   = Number(discountPercent) || 0;
  const damt = Number(discountAmount) || 0;
  const fromPct = round2(op * (dp / 100));

  // If both are present and the amount equals the percent-derived value,
  // treat it as the same discount (no stacking).
  const isDuplicate = damt > 0 && dp > 0 && Math.abs(damt - fromPct) < 0.005;
  const totalDiscount = isDuplicate ? damt : (fromPct + damt);

  return round2(Math.max(0, op - totalDiscount));
}

function buildDiscountLabel(discountPercent = 0, discountAmount = 0, originalPrice = 0) {
  const op = Number(originalPrice) || 0;
  const dp = Number(discountPercent) || 0;
  const da = Number(discountAmount) || 0;
  const fromPct = round2(op * (dp / 100));
  const isDuplicate = da > 0 && dp > 0 && Math.abs(da - fromPct) < 0.005;
  if (isDuplicate) return dp ? `${dp}%` : (da ? `$${da} off` : 'No discount');
  if (dp && da) return `${dp}% + $${da} off`;
  if (dp) return `${dp}%`;
  if (da) return `$${da} off`;
  return 'No discount';
}

// Runs on single-doc saves (create/update via .save())
TransactionSchema.pre('save', function (next) {
  this.finalPrice = computeFinal(this.originalPrice, this.discountPercent, this.discountAmount);
  this.discountLabel = buildDiscountLabel(this.discountPercent, this.discountAmount, this.originalPrice);
  next();
});

// Runs on batch inserts (insertMany does NOT trigger 'save' middleware)
TransactionSchema.pre('insertMany', function (next, docs) {
  if (Array.isArray(docs)) {
    for (const d of docs) {
      d.finalPrice = computeFinal(d.originalPrice, d.discountPercent, d.discountAmount);
      d.discountLabel = buildDiscountLabel(d.discountPercent, d.discountAmount, d.originalPrice);
    }
  }
  next();
});

// Optional: index by date for faster recent queries
TransactionSchema.index({ customer: 1, vehicleDetails: 1, serviceDate: -1 });

module.exports = mongoose.model('Transaction', TransactionSchema);
