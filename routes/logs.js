const express = require('express');
const router = express.Router();
const { execSync } = require('child_process');
const fs = require('fs');

const logFiles = {
  nginx_access: '/var/log/nginx/access.log',
  nginx_error: '/var/log/nginx/error.log',
  apache_access: '/var/log/apache2/access.log',
  apache_error: '/var/log/apache2/error.log',
  auth: '/var/log/auth.log',
  syslog: '/var/log/syslog',
  panel: '/var/log/gravitpanel.log',
  cron: '/var/log/gravitpanel_cron.log'
};

// GET /api/logs
router.get('/', (req, res) => {
  const { type, lines } = req.query;
  const numLines = parseInt(lines) || 200;

  if (type && logFiles[type]) {
    try {
      const content = execSync(`tail -n ${numLines} "${logFiles[type]}" 2>/dev/null || echo "Log file not found or empty"`, { timeout: 10000 }).toString();
      res.json({ logs: content, type, available: Object.keys(logFiles) });
    } catch (e) {
      res.json({ logs: 'Unable to read log file', type, available: Object.keys(logFiles) });
    }
  } else {
    // Return list of available log files
    const files = Object.entries(logFiles).map(([key, filePath]) => {
      let exists = false;
      let size = 0;
      try {
        const stat = fs.statSync(filePath);
        exists = true;
        size = stat.size;
      } catch (e) {}
      return { key, path: filePath, exists, size };
    });
    res.json({ available: files });
  }
});

// GET /api/logs/nginx
router.get('/nginx', (req, res) => {
  const { type, lines } = req.query;
  const numLines = parseInt(lines) || 200;
  const logType = type === 'error' ? 'error' : 'access';
  const logPath = `/var/log/nginx/${logType}.log`;

  try {
    const content = execSync(`tail -n ${numLines} "${logPath}" 2>/dev/null || echo "No logs"`, { timeout: 10000 }).toString();
    res.json({ logs: content, type: logType });
  } catch (e) {
    res.json({ logs: 'Unable to read log', type: logType });
  }
});

// GET /api/logs/system
router.get('/system', (req, res) => {
  const { lines } = req.query;
  const numLines = parseInt(lines) || 200;

  try {
    const dmesg = execSync(`dmesg --time-format iso 2>/dev/null | tail -n ${numLines} || dmesg | tail -n ${numLines}`, { timeout: 10000 }).toString();
    res.json({ logs: dmesg });
  } catch (e) {
    res.json({ logs: 'Unable to read system logs' });
  }
});

// GET /api/logs/process
router.get('/process', (req, res) => {
  try {
    const top = execSync('top -bn1 -o %MEM | head -30', { timeout: 10000 }).toString();
    res.json({ logs: top });
  } catch (e) {
    res.json({ logs: 'Unable to read process info' });
  }
});

module.exports = router;
