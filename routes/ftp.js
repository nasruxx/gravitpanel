const express = require('express');
const router = express.Router();
const { execSync } = require('child_process');
const bcrypt = require('bcryptjs');

// GET /api/ftp
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const accounts = db.prepare('SELECT id, username, home_dir, bandwidth_limit, status, created_at FROM ftp_accounts ORDER BY created_at DESC').all();
  res.json({ accounts });
});

// POST /api/ftp
router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const { username, password, home_dir, bandwidth_limit } = req.body;

  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const existing = db.prepare('SELECT id FROM ftp_accounts WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'FTP account already exists' });

  const dir = home_dir || `/var/ftp/${username}`;
  try {
    execSync(`mkdir -p "${dir}"`, { timeout: 5000 });
    execSync(`useradd -d "${dir}" -s /bin/false "${username}" 2>/dev/null || true`, { timeout: 5000 });
    execSync(`echo "${username}:${password}" | chpasswd`, { timeout: 5000 });
    execSync(`chown -R ${username}:${username} "${dir}"`, { timeout: 5000 });
  } catch (e) {}

  const hashedPassword = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO ftp_accounts (username, password, home_dir, bandwidth_limit) VALUES (?, ?, ?, ?)').run(username, hashedPassword, dir, bandwidth_limit || 0);

  db.prepare('INSERT INTO activity_log (action, details, ip_address) VALUES (?, ?, ?)').run(
    'ftp_create', `Created FTP account: ${username}`, req.ip
  );

  res.json({ message: 'FTP account created' });
});

// DELETE /api/ftp/:id
router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const account = db.prepare('SELECT * FROM ftp_accounts WHERE id = ?').get(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  try {
    execSync(`userdel "${account.username}" 2>/dev/null || true`, { timeout: 5000 });
  } catch (e) {}

  db.prepare('DELETE FROM ftp_accounts WHERE id = ?').run(account.id);
  res.json({ message: 'FTP account deleted' });
});

// PUT /api/ftp/:id/toggle
router.put('/:id/toggle', (req, res) => {
  const db = req.app.locals.db;
  const account = db.prepare('SELECT * FROM ftp_accounts WHERE id = ?').get(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  const newStatus = account.status === 'active' ? 'disabled' : 'active';
  try {
    if (newStatus === 'disabled') {
      execSync(`usermod -L "${account.username}" 2>/dev/null || true`, { timeout: 5000 });
    } else {
      execSync(`usermod -U "${account.username}" 2>/dev/null || true`, { timeout: 5000 });
    }
  } catch (e) {}

  db.prepare('UPDATE ftp_accounts SET status = ? WHERE id = ?').run(newStatus, account.id);
  res.json({ message: `FTP account ${newStatus === 'active' ? 'enabled' : 'disabled'}` });
});

module.exports = router;
