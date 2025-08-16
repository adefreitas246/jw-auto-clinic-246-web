// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET) {
  console.warn('⚠️ Warning: JWT_SECRET is not set in your environment variables.');
}
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key';

const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization token missing or malformed.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    // include type + keep both id and userId for downstream code
    req.user = {
      id: decoded.userId,
      userId: decoded.userId,
      role: decoded.role || 'user',
      name: decoded.name || '',
      type: decoded.type || 'User',   // <-- IMPORTANT
    };

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

module.exports = authMiddleware;