// models/Employees.js
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const employeeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, trim: true, lowercase: true, required: true, index: true },
    phone: { type: String, trim: true },
    avatar: { type: String },
    role: { type: String, enum: ['admin', 'staff'], default: 'staff' },
    hourlyRate: { type: Number, default: 0 },
    clockedIn: { type: Boolean, default: false },
    password: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// helper
async function hashPassword(plain) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
}

// Create: default + hash
employeeSchema.pre('save', async function (next) {
  try {
    if (!this.password) {
      this.password = this.role === 'admin' ? 'Jw@admin1!' : 'Jw@staff1!';
    }
    if (!this.isModified('password')) return next();
    this.password = await hashPassword(this.password);
    next();
  } catch (err) {
    next(err);
  }
});

// Update: hash if password provided via findOneAndUpdate
employeeSchema.pre('findOneAndUpdate', async function (next) {
  try {
    const update = this.getUpdate() || {};
    const nextPwd = update.password ?? update.$set?.password;
    if (nextPwd) {
      const hashed = await hashPassword(nextPwd);
      if (update.$set?.password) update.$set.password = hashed;
      else update.password = hashed;
      this.setUpdate(update);
    }
    next();
  } catch (err) {
    next(err);
  }
});

// Compare with legacy fallback + auto-upgrade
employeeSchema.methods.comparePassword = async function (enteredPassword) {
  const stored = this.password || '';

  // If it looks like a bcrypt hash, compare normally
  if (/^\$2[aby]\$/.test(stored)) {
    return bcrypt.compare(enteredPassword, stored);
  }

  // Legacy plaintext fallback
  if (enteredPassword === stored) {
    // transparently upgrade to hashed
    this.password = await hashPassword(enteredPassword);
    await this.save();
    return true;
  }
  return false;
};

module.exports = mongoose.model('Employee', employeeSchema);
