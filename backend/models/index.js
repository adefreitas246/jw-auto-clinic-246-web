// models/index.js
const User = require('./Users');
const Transaction = require('./Transaction');
const Employee = require('./Employees');
const Customer = require('./Customer');
const Shift = require('./Shift');
const Services = require('./Services');
const Specials = require('./Specials');
const PasswordResetToken = require('./PasswordResetToken');

// Add more models here as needed, e.g.:
// const Appointment = require('./Appointment');
// const ShiftLog = require('./ShiftLog');

module.exports = {
  User,
  Transaction,
  Employee,
  Customer,
  Shift,
  Services,
  Specials,
  PasswordResetToken,
  // Appointment,
  // ShiftLog,
};
