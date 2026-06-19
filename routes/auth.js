const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/default');

// POST /api/auth/login
router.post('/login', (req, res) => {
  const db = req.app.locals.db;
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const validPassword = bcrypt.compareSync(password, user.password);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiry }
  );

  // Update last login
  db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

  // Log activity
  db.prepare('INSERT INTO activity_log (action, details, ip_address) VALUES (?, ?, ?)').run(
    'login', `User ${username} logged in`, req.ip
  );

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      lastLogin: user.last_login
    },
    passwordChanged: user.password_changed_at ? true : false
  });
});

// POST /api/auth/change-password
router.post('/change-password', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Authentication required' });

  const token = authHeader.split(' ')[1];
  let decoded;
  try {
    decoded = jwt.verify(token, config.jwtSecret);
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const db = req.app.locals.db;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new passwords are required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id);
  if (!bcrypt.compareSync(currentPassword, user.password)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password = ?, password_changed_at = CURRENT_TIMESTAMP WHERE id = ?').run(hashedPassword, decoded.id);
  db.prepare('UPDATE settings SET value = ? WHERE key = ?').run('true', 'admin_password_changed');

  db.prepare('INSERT INTO activity_log (action, details, ip_address) VALUES (?, ?, ?)').run(
    'change_password', `User ${decoded.username} changed password`, req.ip
  );

  res.json({ message: 'Password changed successfully' });
});

// POST /api/auth/setup (first-time setup)
router.post('/setup', (req, res) => {
  const db = req.app.locals.db;
  const { username, password } = req.body;

  const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_password_changed');
  if (setting && setting.value === 'true') {
    return res.status(403).json({ error: 'Admin already set up. Use change-password instead.' });
  }

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET username = ?, password = ? WHERE username = ?').run(username, hashedPassword, 'admin');
  db.prepare('UPDATE settings SET value = ? WHERE key = ?').run('true', 'admin_password_changed');

  res.json({ message: 'Admin user created successfully' });
});

// GET /api/auth/check
router.get('/check', (req, res) => {
  const db = req.app.locals.db;
  const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_password_changed');
  const needsSetup = !setting || setting.value !== 'true';
  res.json({ needsSetup, authenticated: false });
});

module.exports = router;
