const express = require('express');
const router = express.Router();
const { execSync } = require('child_process');

// GET /api/cron
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const jobs = db.prepare('SELECT * FROM cron_jobs ORDER BY created_at DESC').all();
  res.json({ jobs });
});

// POST /api/cron
router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const { name, command, schedule, minute, hour, day, month, weekday } = req.body;

  if (!name || !command) return res.status(400).json({ error: 'Name and command are required' });

  // Build cron expression if individual parts provided
  let cronExpr = schedule;
  if (!cronExpr && (minute !== undefined || hour !== undefined)) {
    cronExpr = `${minute || '*'} ${hour || '*'} ${day || '*'} ${month || '*'} ${weekday || '*'}`;
  }
  if (!cronExpr) return res.status(400).json({ error: 'Cron schedule is required' });

  // Add to system crontab
  try {
    const cronLine = `${cronExpr} ${command} >> /var/log/gravitpanel_cron.log 2>&1`;
    execSync(`(crontab -l 2>/dev/null; echo "${cronLine}") | crontab -`, { timeout: 10000 });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to add cron job: ' + e.message });
  }

  const result = db.prepare('INSERT INTO cron_jobs (name, command, schedule) VALUES (?, ?, ?)').run(name, command, cronExpr);

  db.prepare('INSERT INTO activity_log (action, details, ip_address) VALUES (?, ?, ?)').run(
    'cron_create', `Created cron job: ${name}`, req.ip
  );

  res.json({ message: 'Cron job created', id: result.lastInsertRowid });
});

// DELETE /api/cron/:id
router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const job = db.prepare('SELECT * FROM cron_jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Cron job not found' });

  // Remove from system crontab
  try {
    const line = `${job.schedule} ${job.command}`;
    execSync(`crontab -l 2>/dev/null | grep -v '${job.command}' | crontab -`, { timeout: 10000 });
  } catch (e) {}

  db.prepare('DELETE FROM cron_jobs WHERE id = ?').run(job.id);
  res.json({ message: 'Cron job deleted' });
});

// PUT /api/cron/:id/toggle
router.put('/:id/toggle', (req, res) => {
  const db = req.app.locals.db;
  const job = db.prepare('SELECT * FROM cron_jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Cron job not found' });

  const newStatus = job.status === 'active' ? 'disabled' : 'active';

  if (newStatus === 'disabled') {
    try {
      execSync(`crontab -l 2>/dev/null | grep -v '${job.command}' | crontab -`, { timeout: 10000 });
    } catch (e) {}
  } else {
    try {
      const cronLine = `${job.schedule} ${job.command} >> /var/log/gravitpanel_cron.log 2>&1`;
      execSync(`(crontab -l 2>/dev/null; echo "${cronLine}") | crontab -`, { timeout: 10000 });
    } catch (e) {}
  }

  db.prepare('UPDATE cron_jobs SET status = ? WHERE id = ?').run(newStatus, job.id);
  res.json({ message: `Cron job ${newStatus === 'active' ? 'enabled' : 'disabled'}` });
});

// POST /api/cron/:id/run
router.post('/:id/run', (req, res) => {
  const db = req.app.locals.db;
  const job = db.prepare('SELECT * FROM cron_jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Cron job not found' });

  try {
    execSync(`${job.command}`, { timeout: 30000 });
    db.prepare('UPDATE cron_jobs SET last_run = CURRENT_TIMESTAMP WHERE id = ?').run(job.id);
    res.json({ message: 'Job executed successfully' });
  } catch (e) {
    res.status(500).json({ error: 'Job execution failed: ' + e.message });
  }
});

// GET /api/cron/system
router.get('/system', (req, res) => {
  try {
    const crontab = execSync('crontab -l 2>/dev/null || echo "# No crontab"', { timeout: 5000 }).toString();
    res.json({ crontab });
  } catch (e) {
    res.json({ crontab: '# Unable to read crontab' });
  }
});

module.exports = router;
