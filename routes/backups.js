const express = require('express');
const router = express.Router();
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../config/default');

// Ensure backup dir exists
if (!fs.existsSync(config.paths.backups)) {
  fs.mkdirSync(config.paths.backups, { recursive: true });
}

// GET /api/backups
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const backups = db.prepare('SELECT * FROM backups ORDER BY created_at DESC').all();
  res.json({ backups });
});

// POST /api/backups/website
router.post('/website', (req, res) => {
  const db = req.app.locals.db;
  const { website_id } = req.body;
  const website = db.prepare('SELECT * FROM websites WHERE id = ?').get(website_id);
  if (!website) return res.status(404).json({ error: 'Website not found' });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(config.paths.backups, `website_${website.domain}_${timestamp}.tar.gz`);

  try {
    execSync(
      `tar -czf "${backupFile}" -C "${path.dirname(website.root_dir)}" "${path.basename(website.root_dir)}"`,
      { timeout: 300000 }
    );

    const size = fs.statSync(backupFile).size;
    db.prepare('INSERT INTO backups (type, target, file_path, file_size) VALUES (?, ?, ?, ?)').run(
      'website', website.domain, backupFile, size
    );

    res.json({ message: 'Backup created', file: backupFile, size });
  } catch (e) {
    res.status(500).json({ error: 'Backup failed: ' + e.message });
  }
});

// POST /api/backups/database
router.post('/database', (req, res) => {
  const db = req.app.locals.db;
  const { database_id } = req.body;
  const database = db.prepare('SELECT * FROM databases WHERE id = ?').get(database_id);
  if (!database) return res.status(404).json({ error: 'Database not found' });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(config.paths.backups, `database_${database.name}_${timestamp}.sql`);

  try {
    execSync(`mysqldump -u root "${database.name}" > "${backupFile}"`, { timeout: 60000 });

    const size = fs.statSync(backupFile).size;
    db.prepare('INSERT INTO backups (type, target, file_path, file_size) VALUES (?, ?, ?, ?)').run(
      'database', database.name, backupFile, size
    );

    res.json({ message: 'Database backup created', file: backupFile, size });
  } catch (e) {
    res.status(500).json({ error: 'Backup failed: ' + e.message });
  }
});

// POST /api/backups/restore
router.post('/restore', (req, res) => {
  const { backup_id } = req.body;
  const db = req.app.locals.db;
  const backup = db.prepare('SELECT * FROM backups WHERE id = ?').get(backup_id);
  if (!backup) return res.status(404).json({ error: 'Backup not found' });

  if (!fs.existsSync(backup.file_path)) {
    return res.status(404).json({ error: 'Backup file not found on disk' });
  }

  try {
    if (backup.type === 'website') {
      execSync(`tar -xzf "${backup.file_path}" -C /var/www/`, { timeout: 300000 });
    } else if (backup.type === 'database') {
      // Get DB name from target
      execSync(`mysql -u root "${backup.target}" < "${backup.file_path}"`, { timeout: 120000 });
    }
    res.json({ message: 'Restored successfully' });
  } catch (e) {
    res.status(500).json({ error: 'Restore failed: ' + e.message });
  }
});

// GET /api/backups/download/:id
router.get('/download/:id', (req, res) => {
  const db = req.app.locals.db;
  const backup = db.prepare('SELECT * FROM backups WHERE id = ?').get(req.params.id);
  if (!backup) return res.status(404).json({ error: 'Backup not found' });

  if (!fs.existsSync(backup.file_path)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.download(backup.file_path, path.basename(backup.file_path));
});

// DELETE /api/backups/:id
router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const backup = db.prepare('SELECT * FROM backups WHERE id = ?').get(req.params.id);
  if (!backup) return res.status(404).json({ error: 'Backup not found' });

  try {
    if (fs.existsSync(backup.file_path)) fs.unlinkSync(backup.file_path);
  } catch (e) {}

  db.prepare('DELETE FROM backups WHERE id = ?').run(backup.id);
  res.json({ message: 'Backup deleted' });
});

module.exports = router;
