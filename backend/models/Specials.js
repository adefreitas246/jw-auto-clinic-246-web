const mongoose = require('mongoose');

const SpecialSchema = new mongoose.Schema({
  name: { type: String, required: true },
  discountPercent: { type: Number, required: true }
});

module.exports = mongoose.model('Special', SpecialSchema);
