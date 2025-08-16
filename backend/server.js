// server.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const customersRouter = require('./routes/customers');
const transactionsRouter = require('./routes/transactions');
const authRouter = require('./routes/auth');
const employeesRouter = require('./routes/employees');
const shiftsRouter = require('./routes/shifts');
const profileRouter = require('./routes/profile');
const reportRoutes = require('./routes/reports');
const serviceRoutes = require('./routes/services');
const specialRoutes = require('./routes/specials');
const supportRoutes = require('./routes/support');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/customers', customersRouter);
app.use('/api/transactions', transactionsRouter); 
app.use('/api/auth', authRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/shifts', shiftsRouter);
app.use('/api/profile', profileRouter);
app.use('/api/reports', reportRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/specials', specialRoutes);
app.use('/api/support', supportRoutes);

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error(err));

app.get("/", (req, res) => res.send("JW Auto Clinic API Running"));

app.listen(process.env.PORT, () => console.log(`Server running on ${process.env.PORT}`));
