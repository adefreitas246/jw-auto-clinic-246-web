const mongoose = require('mongoose');

const ServiceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true }
});

module.exports = mongoose.model('Service', ServiceSchema);
