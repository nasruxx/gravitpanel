const express = require('express');
const router = express.Router();
const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../config/default');

// GET /api/websites
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const websites = db.prepare(`
    SELECT w.*, GROUP_CONCAT(d.domain) as all_domains
    FROM websites w
    LEFT JOIN domains d ON d.website_id = w.id
    GROUP BY w.id
    ORDER BY w.created_at DESC
  `).all();

  // Enrich with disk usage
  websites.forEach(site => {
    try {
      const du = execSync(`du -sb "${site.root_dir}" 2>/dev/null || echo 0`, { timeout: 5000 }).toString().trim();
      site.disk_usage = parseInt(du.split('\t')[0]) || 0;
    } catch (e) {
      site.disk_usage = 0;
    }
  });

  res.json({ websites });
});

// POST /api/websites
router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const { domain, root_dir, php_version, server_type } = req.body;

  if (!domain) return res.status(400).json({ error: 'Domain is required' });

  // Check if domain already exists
  const existing = db.prepare('SELECT id FROM websites WHERE domain = ?').get(domain);
  if (existing) return res.status(409).json({ error: 'Domain already exists' });

  const docRoot = root_dir || path.join(config.paths.webRoot, domain);

  // Create directory
  try {
    if (!fs.existsSync(docRoot)) {
      fs.mkdirSync(docRoot, { recursive: true });
    }
    // Create default index
    const indexFile = path.join(docRoot, 'index.html');
    if (!fs.existsSync(indexFile)) {
      fs.writeFileSync(indexFile, `<!DOCTYPE html>
<html>
<head><title>${domain}</title></head>
<body>
<h1>Welcome to ${domain}</h1>
<p>This website is configured and working!</p>
<p>Server: GravitPanel</p>
</body>
</html>`);
    }
  } catch (e) {
    return res.status(500).json({ error: 'Failed to create document root: ' + e.message });
  }

  // Create Nginx config
  const nginxConf = `server {
    listen 80;
    server_name ${domain};
    root ${docRoot};
    index index.html index.htm index.php;

    location / {
        try_files $uri $uri/ =404;
    }

    location ~ \\.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php${php_version || '8.1'}-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    }

    location ~ /\\.ht {
        deny all;
    }

    access_log /var/log/nginx/${domain}_access.log;
    error_log /var/log/nginx/${domain}_error.log;
}`;

  try {
    const nginxPath = path.join(config.paths.sites, domain);
    fs.writeFileSync(nginxPath, nginxConf);

    // Enable site
    const enabledPath = path.join(config.paths.sitesEnabled, domain);
    if (!fs.existsSync(enabledPath)) {
      try {
        execSync(`ln -sf "${nginxPath}" "${enabledPath}"`, { timeout: 5000 });
      } catch (e) {}
    }

    // Reload Nginx
    try {
      execSync('nginx -t && systemctl reload nginx', { timeout: 10000 });
    } catch (e) {
      console.log('[Website] Nginx reload skipped or failed:', e.message);
    }
  } catch (e) {
    console.log('[Website] Nginx config creation skipped:', e.message);
  }

  // Save to DB
  const result = db.prepare(
    'INSERT INTO websites (domain, root_dir, php_version, server_type) VALUES (?, ?, ?, ?)'
  ).run(domain, docRoot, php_version || '8.1', server_type || 'nginx');

  db.prepare('INSERT INTO activity_log (action, details, ip_address) VALUES (?, ?, ?)').run(
    'website_create', `Created website: ${domain}`, req.ip
  );

  const website = db.prepare('SELECT * FROM websites WHERE id = ?').get(result.lastInsertRowid);
  res.json({ website, message: 'Website created successfully' });
});

// DELETE /api/websites/:id
router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const website = db.prepare('SELECT * FROM websites WHERE id = ?').get(req.params.id);
  if (!website) return res.status(404).json({ error: 'Website not found' });

  // Remove Nginx config
  try {
    execSync(`rm -f "${config.paths.sitesEnabled}/${website.domain}"`, { timeout: 5000 });
    execSync(`rm -f "${config.paths.sites}/${website.domain}"`, { timeout: 5000 });
    execSync('nginx -t && systemctl reload nginx', { timeout: 10000 });
  } catch (e) {}

  // Delete from DB
  db.prepare('DELETE FROM domains WHERE website_id = ?').run(website.id);
  db.prepare('DELETE FROM websites WHERE id = ?').run(website.id);

  db.prepare('INSERT INTO activity_log (action, details, ip_address) VALUES (?, ?, ?)').run(
    'website_delete', `Deleted website: ${website.domain}`, req.ip
  );

  res.json({ message: 'Website deleted successfully' });
});

// PUT /api/websites/:id
router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const { php_version, server_type, root_dir } = req.body;
  const website = db.prepare('SELECT * FROM websites WHERE id = ?').get(req.params.id);
  if (!website) return res.status(404).json({ error: 'Website not found' });

  db.prepare(
    'UPDATE websites SET php_version = ?, server_type = ?, root_dir = ? WHERE id = ?'
  ).run(php_version || website.php_version, server_type || website.server_type, root_dir || website.root_dir, website.id);

  res.json({ message: 'Website updated successfully' });
});

// POST /api/websites/:id/ssl
router.post('/:id/ssl', async (req, res) => {
  const db = req.app.locals.db;
  const website = db.prepare('SELECT * FROM websites WHERE id = ?').get(req.params.id);
  if (!website) return res.status(404).json({ error: 'Website not found' });

  try {
    const certDir = `/etc/letsencrypt/live/${website.domain}`;
    execSync(
      `certbot certonly --webroot -w "${website.root_dir}" -d "${website.domain}" --agree-tos --non-interactive --email admin@${website.domain}`,
      { timeout: 60000 }
    );

    db.prepare(
      'INSERT INTO ssl_certificates (domain, cert_path, key_path, issuer) VALUES (?, ?, ?, ?)'
    ).run(website.domain, `${certDir}/fullchain.pem`, `${certDir}/privkey.pem`, "Let's Encrypt");

    db.prepare('UPDATE websites SET ssl_enabled = 1 WHERE id = ?').run(website.id);

    // Update Nginx config with SSL
    const sslNginx = `server {
    listen 80;
    server_name ${website.domain};
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${website.domain};
    root ${website.root_dir};
    index index.html index.htm index.php;

    ssl_certificate ${certDir}/fullchain.pem;
    ssl_certificate_key ${certDir}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        try_files $uri $uri/ =404;
    }

    location ~ \\.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php${website.php_version}-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    }

    access_log /var/log/nginx/${website.domain}_access.log;
    error_log /var/log/nginx/${website.domain}_error.log;
}`;

    fs.writeFileSync(path.join(config.paths.sites, website.domain), sslNginx);
    execSync('nginx -t && systemctl reload nginx', { timeout: 10000 });

    res.json({ message: 'SSL certificate installed successfully' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to obtain SSL certificate: ' + e.message });
  }
});

// GET /api/websites/:id/logs
router.get('/:id/logs', (req, res) => {
  const db = req.app.locals.db;
  const website = db.prepare('SELECT * FROM websites WHERE id = ?').get(req.params.id);
  if (!website) return res.status(404).json({ error: 'Website not found' });

  const logType = req.query.type || 'access';
  const logFile = logType === 'error'
    ? `/var/log/nginx/${website.domain}_error.log`
    : `/var/log/nginx/${website.domain}_access.log`;

  try {
    const lines = parseInt(req.query.lines) || 100;
    const logs = execSync(`tail -n ${lines} "${logFile}" 2>/dev/null || echo "No logs found"`, { timeout: 5000 }).toString();
    res.json({ logs, logType });
  } catch (e) {
    res.json({ logs: 'Unable to read log file', logType });
  }
});

module.exports = router;
