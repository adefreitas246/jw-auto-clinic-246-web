// // seed/createUsers.js
// require('dotenv').config();
// const mongoose = require('mongoose');
// const User = require('../models/Users');

// const MONGO_URI = process.env.MONGO_URI;

// const seedUsers = async () => {
//   try {
//     await mongoose.connect(MONGO_URI);

//     await User.deleteMany();

//     const users = [
//       {
//         name: 'Admin User',
//         email: 'admin@jw.com',
//         password: 'admin123',
//         role: 'admin',
//       },
//       {
//         name: 'Staff User',
//         email: 'staff@jw.com',
//         password: 'staff123',
//         role: 'staff',
//       },
//     ];

//     for (const user of users) {
//       const newUser = new User(user);
//       await newUser.save();
//     }

//     console.log('Users seeded');
//     process.exit();
//   } catch (err) {
//     console.error('Error seeding users:', err);
//     process.exit(1);
//   }
// };

// seedUsers();
