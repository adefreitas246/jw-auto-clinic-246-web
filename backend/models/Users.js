// models/Users.js
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true },
  phone: { type: String, trim: true },
  avatar: { type: String },
  notificationsEnabled: { type: Boolean, default: true },
  role: { type: String },
}, { timestamps: true });

async function hashIfNeeded(doc) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(doc.password, salt);
}

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await hashIfNeeded({ password: this.password });
  next();
});

UserSchema.pre('findOneAndUpdate', async function (next) {
  try {
    const update = this.getUpdate() || {};
    const nextPwd = update.password ?? update.$set?.password;
    if (nextPwd) {
      const hashed = await hashIfNeeded({ password: nextPwd });
      if (update.$set?.password) update.$set.password = hashed;
      else update.password = hashed;
      this.setUpdate(update);
    }
    next();
  } catch (err) {
    next(err);
  }
});

UserSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);