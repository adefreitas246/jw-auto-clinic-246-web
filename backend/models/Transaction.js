// models/Transaction.js
const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  serviceType: {
    type: String,
    required: [true, 'Service type is required'],
    trim: true,
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
}, {
  timestamps: true,
});

// ---- helpers ----
function computeFinal(originalPrice = 0, discountPercent = 0, discountAmount = 0) {
  const pct = (Number(discountPercent) || 0) / 100;
  const discountFromPercent = (Number(originalPrice) || 0) * pct;
  const totalDiscount = discountFromPercent + (Number(discountAmount) || 0);
  const final = Math.max(0, (Number(originalPrice) || 0) - totalDiscount);
  return Number(final.toFixed(2));
}

function buildDiscountLabel(discountPercent = 0, discountAmount = 0) {
  let label = '';
  if (discountPercent) label += `${discountPercent}%`;
  if (discountAmount) {
    if (label) label += ' + ';
    label += `$${discountAmount} off`;
  }
  return label || 'No discount';
}

// Runs on single-doc saves (create/update via .save())
TransactionSchema.pre('save', function (next) {
  this.finalPrice = computeFinal(this.originalPrice, this.discountPercent, this.discountAmount);
  this.discountLabel = buildDiscountLabel(this.discountPercent, this.discountAmount);
  next();
});

// Runs on batch inserts (insertMany does NOT trigger 'save' middleware)
TransactionSchema.pre('insertMany', function (next, docs) {
  if (Array.isArray(docs)) {
    for (const d of docs) {
      d.finalPrice = computeFinal(d.originalPrice, d.discountPercent, d.discountAmount);
      d.discountLabel = buildDiscountLabel(d.discountPercent, d.discountAmount);
    }
  }
  next();
});

// Optional: index by date for faster recent queries
TransactionSchema.index({ serviceDate: -1, createdAt: -1 });

module.exports = mongoose.model('Transaction', TransactionSchema);
