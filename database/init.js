const DatabaseWrapper = require('./wrapper');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'gravitpanel.db');

async function initDatabase() {
  const db = await new DatabaseWrapper(dbPath).init();

  // Enable WAL mode
  db.pragma('journal_mode = WAL');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL DEFAULT 'admin',
      password TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      password_changed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS websites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT UNIQUE NOT NULL,
      root_dir TEXT NOT NULL,
      php_version TEXT DEFAULT '8.1',
      ssl_enabled INTEGER DEFAULT 0,
      ssl_cert_path TEXT,
      ssl_key_path TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      server_type TEXT DEFAULT 'nginx'
    );

    CREATE TABLE IF NOT EXISTS domains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      website_id INTEGER NOT NULL,
      domain TEXT UNIQUE NOT NULL,
      is_primary INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS databases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      type TEXT DEFAULT 'mysql',
      user_id INTEGER,
      size_bytes INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS db_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      host TEXT DEFAULT 'localhost',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS db_grants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      database_id INTEGER NOT NULL,
      permissions TEXT DEFAULT 'ALL PRIVILEGES'
    );

    CREATE TABLE IF NOT EXISTS ftp_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      home_dir TEXT NOT NULL,
      bandwidth_limit INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cron_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      command TEXT NOT NULL,
      schedule TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      last_run DATETIME,
      next_run DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS firewall_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      port TEXT,
      protocol TEXT DEFAULT 'tcp',
      source_ip TEXT,
      action TEXT DEFAULT 'allow',
      description TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ssl_certificates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL,
      cert_path TEXT NOT NULL,
      key_path TEXT NOT NULL,
      issuer TEXT,
      expires_at DATETIME,
      auto_renew INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS backups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      target TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER DEFAULT 0,
      status TEXT DEFAULT 'completed',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS docker_containers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      container_id TEXT,
      name TEXT,
      image TEXT,
      status TEXT,
      ports TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS installed_apps (
      app_id TEXT PRIMARY KEY,
      installed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Insert default admin if not exists
  const adminUser = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!adminUser) {
    const hashedPassword = bcrypt.hashSync('admin', 10);
    db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('admin', hashedPassword, 'admin');
    console.log('[GravitPanel] Default admin created (admin/admin)');
  }

  // Insert default settings
  const defaultSettings = [
    ['panel_name', 'GravitPanel'],
    ['panel_port', '8321'],
    ['panel_theme', 'dark'],
    ['admin_password_changed', 'false'],
    ['ssh_port', '22'],
    ['auto_backup', 'false'],
    ['backup_interval', 'daily'],
    ['backup_retention', '7'],
    ['firewall_enabled', 'true'],
    ['fail2ban_enabled', 'false'],
    ['max_login_attempts', '5'],
    ['session_timeout', '24'],
    ['timezone', 'Asia/Jakarta']
  ];

  defaultSettings.forEach(([key, value]) => {
    const existing = db.prepare('SELECT key FROM settings WHERE key = ?').get(key);
    if (!existing) {
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, value);
    }
  });

  console.log('[GravitPanel] Database initialized:', dbPath);
  return db;
}

module.exports = { initDatabase, DatabaseWrapper, dbPath };

// Run directly for initialization
if (require.main === module) {
  initDatabase().then(() => {
    console.log('[GravitPanel] Database setup complete');
    process.exit(0);
  }).catch(err => {
    console.error('[GravitPanel] Database init failed:', err);
    process.exit(1);
  });
}
