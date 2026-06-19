const express = require('express');
const router = express.Router();
const { execSync } = require('child_process');
const fs = require('fs');

// GET /api/databases
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const databases = db.prepare('SELECT * FROM databases ORDER BY created_at DESC').all();
  const users = db.prepare('SELECT * FROM db_users ORDER BY created_at DESC').all();

  // Try to get sizes from MySQL
  databases.forEach(database => {
    try {
      const size = execSync(
        `mysql -u root -e "SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) FROM information_schema.tables WHERE table_schema = '${database.name}';" 2>/dev/null`,
        { timeout: 5000 }
      ).toString().trim().split('\n')[1];
      database.size_mb = parseFloat(size) || 0;
    } catch (e) {
      database.size_mb = 0;
    }
  });

  res.json({ databases, users });
});

// POST /api/databases
router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const { name, charset } = req.body;

  if (!name) return res.status(400).json({ error: 'Database name is required' });

  const existing = db.prepare('SELECT id FROM databases WHERE name = ?').get(name);
  if (existing) return res.status(409).json({ error: 'Database already exists' });

  try {
    execSync(
      `mysql -u root -e "CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"`,
      { timeout: 10000 }
    );
  } catch (e) {
    return res.status(500).json({ error: 'Failed to create database: ' + e.message });
  }

  db.prepare('INSERT INTO databases (name) VALUES (?)').run(name);
  db.prepare('INSERT INTO activity_log (action, details, ip_address) VALUES (?, ?, ?)').run(
    'db_create', `Created database: ${name}`, req.ip
  );

  res.json({ message: 'Database created successfully' });
});

// DELETE /api/databases/:id
router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const database = db.prepare('SELECT * FROM databases WHERE id = ?').get(req.params.id);
  if (!database) return res.status(404).json({ error: 'Database not found' });

  try {
    execSync(`mysql -u root -e "DROP DATABASE IF EXISTS \`${database.name}\`;"`, { timeout: 10000 });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to drop database: ' + e.message });
  }

  db.prepare('DELETE FROM db_grants WHERE database_id = ?').run(database.id);
  db.prepare('DELETE FROM databases WHERE id = ?').run(database.id);
  db.prepare('INSERT INTO activity_log (action, details, ip_address) VALUES (?, ?, ?)').run(
    'db_delete', `Deleted database: ${database.name}`, req.ip
  );

  res.json({ message: 'Database deleted successfully' });
});

// POST /api/databases/users
router.post('/users', (req, res) => {
  const db = req.app.locals.db;
  const { username, password, host } = req.body;

  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

  try {
    execSync(
      `mysql -u root -e "CREATE USER IF NOT EXISTS '${username}'@'${host || 'localhost'}' IDENTIFIED BY '${password}';"`,
      { timeout: 10000 }
    );
  } catch (e) {
    return res.status(500).json({ error: 'Failed to create user: ' + e.message });
  }

  db.prepare('INSERT INTO db_users (username, password, host) VALUES (?, ?, ?)').run(username, password, host || 'localhost');
  res.json({ message: 'Database user created successfully' });
});

// DELETE /api/databases/users/:id
router.delete('/users/:id', (req, res) => {
  const db = req.app.locals.db;
  const user = db.prepare('SELECT * FROM db_users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  try {
    execSync(`mysql -u root -e "DROP USER IF EXISTS '${user.username}'@'${user.host}';"`, { timeout: 10000 });
  } catch (e) {}

  db.prepare('DELETE FROM db_grants WHERE user_id = ?').run(user.id);
  db.prepare('DELETE FROM db_users WHERE id = ?').run(user.id);
  res.json({ message: 'Database user deleted' });
});

// POST /api/databases/grant
router.post('/grant', (req, res) => {
  const db = req.app.locals.db;
  const { user_id, database_id, permissions } = req.body;

  const user = db.prepare('SELECT * FROM db_users WHERE id = ?').get(user_id);
  const database = db.prepare('SELECT * FROM databases WHERE id = ?').get(database_id);
  if (!user || !database) return res.status(404).json({ error: 'User or database not found' });

  try {
    execSync(
      `mysql -u root -e "GRANT ${permissions || 'ALL PRIVILEGES'} ON \`${database.name}\`.* TO '${user.username}'@'${user.host}'; FLUSH PRIVILEGES;"`,
      { timeout: 10000 }
    );
  } catch (e) {
    return res.status(500).json({ error: 'Failed to grant permissions: ' + e.message });
  }

  db.prepare('INSERT OR REPLACE INTO db_grants (user_id, database_id, permissions) VALUES (?, ?, ?)').run(user_id, database_id, permissions || 'ALL PRIVILEGES');
  res.json({ message: 'Permissions granted' });
});

// POST /api/databases/:id/export
router.post('/:id/export', (req, res) => {
  const db = req.app.locals.db;
  const database = db.prepare('SELECT * FROM databases WHERE id = ?').get(req.params.id);
  if (!database) return res.status(404).json({ error: 'Database not found' });

  const exportPath = `/tmp/gravitpanel_${database.name}_${Date.now()}.sql`;
  try {
    execSync(`mysqldump -u root "${database.name}" > "${exportPath}" 2>/dev/null`, { timeout: 60000 });
    res.download(exportPath, `${database.name}_backup.sql`, (err) => {
      fs.unlinkSync(exportPath);
    });
  } catch (e) {
    res.status(500).json({ error: 'Export failed: ' + e.message });
  }
});

// POST /api/databases/:id/import
router.post('/:id/import', (req, res) => {
  const db = req.app.locals.db;
  const database = db.prepare('SELECT * FROM databases WHERE id = ?').get(req.params.id);
  if (!database) return res.status(404).json({ error: 'Database not found' });

  if (!req.files || !req.files.file) return res.status(400).json({ error: 'SQL file is required' });

  const uploadPath = `/tmp/gravitpanel_import_${Date.now()}.sql`;
  req.files.file.mv(uploadPath, (err) => {
    if (err) return res.status(500).json({ error: 'Upload failed' });

    try {
      execSync(`mysql -u root "${database.name}" < "${uploadPath}"`, { timeout: 120000 });
      fs.unlinkSync(uploadPath);
      res.json({ message: 'Database imported successfully' });
    } catch (e) {
      fs.unlinkSync(uploadPath);
      res.status(500).json({ error: 'Import failed: ' + e.message });
    }
  });
});

module.exports = router;
