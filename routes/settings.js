const express = require('express');
const router = express.Router();

// GET /api/settings
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const settings = db.prepare('SELECT * FROM settings').all();
  const settingsObj = {};
  settings.forEach(s => { settingsObj[s.key] = s.value; });
  res.json({ settings: settingsObj });
});

// PUT /api/settings
router.put('/', (req, res) => {
  const db = req.app.locals.db;
  const updates = req.body;

  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
  const updateMany = db.transaction((data) => {
    for (const [key, value] of Object.entries(data)) {
      stmt.run(key, String(value));
    }
  });

  updateMany(updates);
  res.json({ message: 'Settings updated' });
});

// GET /api/settings/panel-info
router.get('/panel-info', (req, res) => {
  res.json({
    name: 'GravitPanel',
    version: '1.0.0',
    description: 'Free VPS Server Control Panel',
    features: ['Website Management', 'Database Management', 'File Manager', 'Terminal', 'FTP', 'Cron Jobs', 'Security', 'SSL', 'Docker', 'App Store', 'Backups', 'Log Viewer']
  });
});

module.exports = router;
