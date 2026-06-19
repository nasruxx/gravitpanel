const jwt = require('jsonwebtoken');
const config = require('../config/default');

module.exports = function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded;

    // Check if password has been changed (force re-login)
    const db = req.app.locals.db;
    const settings = db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_password_changed');
    if (settings && settings.value === 'true') {
      const user = db.prepare('SELECT password_changed_at FROM users WHERE id = ?').get(decoded.id);
      if (user && user.password_changed_at) {
        const tokenIssued = new Date(decoded.iat * 1000);
        if (user.password_changed_at > tokenIssued) {
          return res.status(401).json({ error: 'Session expired. Please login again.', code: 'SESSION_EXPIRED' });
        }
      }
    }

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
  }
};
