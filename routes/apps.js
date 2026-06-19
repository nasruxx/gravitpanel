const express = require('express');
const router = express.Router();
const { execSync } = require('child_process');
const config = require('../config/default');

// GET /api/apps
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const installed = db.prepare('SELECT * FROM installed_apps ORDER BY installed_at DESC').all().map(a => a.app_id);

  // Check system-installed packages
  const checkInstall = (cmd) => {
    try { execSync(cmd, { timeout: 5000 }); return true; } catch (e) { return false; }
  };

  const apps = config.appStore.map(app => {
    let sysInstalled = false;
    switch (app.id) {
      case 'nginx': sysInstalled = checkInstall('which nginx'); break;
      case 'apache': sysInstalled = checkInstall('which apache2'); break;
      case 'mysql': sysInstalled = checkInstall('which mysql'); break;
      case 'mariadb': sysInstalled = checkInstall('which mariadb'); break;
      case 'redis': sysInstalled = checkInstall('which redis-server'); break;
      case 'docker': sysInstalled = checkInstall('which docker'); break;
      case 'phpmyadmin': sysInstalled = checkInstall('which phpmyadmin'); break;
      case 'php': sysInstalled = checkInstall('which php'); break;
      case 'nodejs': sysInstalled = checkInstall('which node'); break;
      case 'python': sysInstalled = checkInstall('which python3'); break;
      case 'fail2ban': sysInstalled = checkInstall('which fail2ban-server'); break;
      case 'certbot': sysInstalled = checkInstall('which certbot'); break;
      case 'dockercompose': sysInstalled = checkInstall('which docker-compose') || checkInstall('docker compose version'); break;
    }
    return { ...app, installed: installed.includes(app.id) || sysInstalled };
  });

  res.json({ apps });
});

// POST /api/apps/:id/install
router.post('/:id/install', (req, res) => {
  const db = req.app.locals.db;
  const appId = req.params.id;

  const installCommands = {
    nginx: 'apt-get update && apt-get install -y nginx',
    apache: 'apt-get update && apt-get install -y apache2',
    mysql: 'apt-get update && apt-get install -y mysql-server',
    mariadb: 'apt-get update && apt-get install -y mariadb-server',
    redis: 'apt-get update && apt-get install -y redis-server',
    docker: 'curl -fsSL https://get.docker.com | sh',
    phpmyadmin: 'apt-get update && apt-get install -y phpmyadmin',
    php: 'apt-get update && apt-get install -y php-fpm php-mysql php-curl php-gd php-mbstring php-xml php-zip',
    nodejs: 'curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs',
    python: 'apt-get update && apt-get install -y python3 python3-pip',
    fail2ban: 'apt-get update && apt-get install -y fail2ban',
    certbot: 'apt-get update && apt-get install -y certbot python3-certbot-nginx',
    dockercompose: 'apt-get update && apt-get install -y docker-compose-plugin',
    ftp: 'apt-get update && apt-get install -y pure-ftpd',
    proftpd: 'apt-get update && apt-get install -y proftpd',
    wordpress: 'apt-get update && apt-get install -y php-mysql',
    vscode: 'curl -fsSL https://code-server.dev/install.sh | sh',
    postgres: 'apt-get update && apt-get install -y postgresql postgresql-contrib',
    mongodb: 'apt-get update && apt-get install -y mongodb'
  };

  const cmd = installCommands[appId];
  if (!cmd) return res.status(400).json({ error: 'Unknown app' });

  // Run installation in background
  const { spawn } = require('child_process');
  const install = spawn('bash', ['-c', cmd], {
    env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';
  install.stdout.on('data', (d) => { output += d.toString(); });
  install.stderr.on('data', (d) => { output += d.toString(); });

  install.on('close', (code) => {
    if (code === 0) {
      // Create installed_apps table if not exists
      db.exec(`CREATE TABLE IF NOT EXISTS installed_apps (app_id TEXT PRIMARY KEY, installed_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
      db.prepare('INSERT OR REPLACE INTO installed_apps (app_id) VALUES (?)').run(appId);
      res.json({ message: `${appId} installed successfully` });
    } else {
      res.status(500).json({ error: `Installation failed with code ${code}`, output: output.slice(-2000) });
    }
  });
});

// POST /api/apps/:id/uninstall
router.post('/:id/uninstall', (req, res) => {
  const db = req.app.locals.db;
  const appId = req.params.id;

  const uninstallCommands = {
    nginx: 'apt-get remove -y nginx',
    apache: 'apt-get remove -y apache2',
    mysql: 'apt-get remove -y mysql-server',
    redis: 'apt-get remove -y redis-server',
    docker: 'apt-get remove -y docker docker-ce docker.io containerd runc',
    php: 'apt-get remove -y php-fpm php-mysql php-curl php-gd php-mbstring php-xml php-zip',
    fail2ban: 'apt-get remove -y fail2ban',
    certbot: 'apt-get remove -y certbot python3-certbot-nginx'
  };

  const cmd = uninstallCommands[appId];
  if (!cmd) return res.status(400).json({ error: 'Cannot uninstall this app' });

  try {
    execSync(cmd + ' 2>/dev/null', { timeout: 120000 });
    db.prepare('DELETE FROM installed_apps WHERE app_id = ?').run(appId);
    res.json({ message: `${appId} uninstalled` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
