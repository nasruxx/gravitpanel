const express = require('express');
const router = express.Router();
const { execSync } = require('child_process');

// GET /api/security/status
router.get('/status', (req, res) => {
  const db = req.app.locals.db;

  // Firewall status
  let firewall = { enabled: false, rules: [] };
  try {
    const ufwStatus = execSync('ufw status 2>/dev/null || echo "inactive"', { timeout: 5000 }).toString();
    firewall.enabled = ufwStatus.includes('active');
    const rules = db.prepare('SELECT * FROM firewall_rules ORDER BY created_at DESC').all();
    firewall.rules = rules;
  } catch (e) {
    firewall.rules = [];
  }

  // Fail2Ban status
  let fail2ban = { enabled: false, jails: [] };
  try {
    const f2bStatus = execSync('systemctl is-active fail2ban 2>/dev/null || echo inactive', { timeout: 5000 }).toString().trim();
    fail2ban.enabled = f2bStatus === 'active';
    if (fail2ban.enabled) {
      const jails = execSync('fail2ban-client status 2>/dev/null', { timeout: 5000 }).toString();
      fail2ban.jails = jails;
    }
  } catch (e) {}

  // SSH info
  let ssh = { port: 22, configured: false };
  try {
    const sshdConfig = execSync('grep -E "^#?Port" /etc/ssh/sshd_config 2>/dev/null', { timeout: 5000 }).toString();
    const portMatch = sshdConfig.match(/Port\s+(\d+)/);
    if (portMatch) ssh.port = parseInt(portMatch[1]);
    ssh.configured = true;
  } catch (e) {}

  // Recent failed logins
  let failedLogins = [];
  try {
    const logins = execSync('lastb 2>/dev/null | head -20 || echo "No failed logins"', { timeout: 5000 }).toString();
    failedLogins = logins.trim().split('\n').filter(l => l.trim());
  } catch (e) {}

  // Open ports
  let openPorts = [];
  try {
    const ports = execSync('ss -tlnp 2>/dev/null | tail -n +2', { timeout: 5000 }).toString();
    openPorts = ports.trim().split('\n').map(line => {
      const parts = line.split(/\s+/);
      return { address: parts[3] || '', process: parts[6] || '' };
    });
  } catch (e) {}

  res.json({ firewall, fail2ban, ssh, failedLogins, openPorts });
});

// POST /api/security/firewall/enable
router.post('/firewall/enable', (req, res) => {
  try {
    execSync('ufw --force enable', { timeout: 10000 });
    execSync('ufw allow ssh', { timeout: 5000 });
    res.json({ message: 'Firewall enabled' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to enable firewall: ' + e.message });
  }
});

// POST /api/security/firewall/disable
router.post('/firewall/disable', (req, res) => {
  try {
    execSync('ufw disable', { timeout: 10000 });
    res.json({ message: 'Firewall disabled' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to disable firewall: ' + e.message });
  }
});

// POST /api/security/firewall/rules
router.post('/firewall/rules', (req, res) => {
  const db = req.app.locals.db;
  const { port, protocol, action, source_ip, description } = req.body;

  if (!port) return res.status(400).json({ error: 'Port is required' });

  try {
    if (source_ip) {
      execSync(`ufw allow from ${source_ip} to any port ${port} proto ${protocol || 'tcp'}`, { timeout: 10000 });
    } else if (action === 'deny') {
      execSync(`ufw deny ${port}/${protocol || 'tcp'}`, { timeout: 10000 });
    } else {
      execSync(`ufw allow ${port}/${protocol || 'tcp'}`, { timeout: 10000 });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  db.prepare('INSERT INTO firewall_rules (type, port, protocol, source_ip, action, description) VALUES (?, ?, ?, ?, ?, ?)').run(
    'custom', port, protocol || 'tcp', source_ip || null, action || 'allow', description || ''
  );

  res.json({ message: 'Firewall rule added' });
});

// DELETE /api/security/firewall/rules/:id
router.delete('/firewall/rules/:id', (req, res) => {
  const db = req.app.locals.db;
  const rule = db.prepare('SELECT * FROM firewall_rules WHERE id = ?').get(req.params.id);
  if (!rule) return res.status(404).json({ error: 'Rule not found' });

  try {
    if (rule.action === 'deny') {
      execSync(`ufw delete deny ${rule.port}/${rule.protocol}`, { timeout: 10000 });
    } else {
      execSync(`ufw delete allow ${rule.port}/${rule.protocol}`, { timeout: 10000 });
    }
  } catch (e) {}

  db.prepare('DELETE FROM firewall_rules WHERE id = ?').run(rule.id);
  res.json({ message: 'Rule deleted' });
});

// POST /api/security/ssh/port
router.post('/ssh/port', (req, res) => {
  const { port } = req.body;
  if (!port) return res.status(400).json({ error: 'Port is required' });

  try {
    execSync(`sed -i 's/^#*Port .*/Port ${port}/' /etc/ssh/sshd_config`, { timeout: 5000 });
    execSync('systemctl restart sshd', { timeout: 10000 });
    res.json({ message: `SSH port changed to ${port}. Please reconnect with the new port.` });
  } catch (e) {
    res.status(500).json({ error: 'Failed to change SSH port: ' + e.message });
  }
});

// POST /api/security/fail2ban/enable
router.post('/fail2ban/enable', (req, res) => {
  try {
    execSync('apt-get install -y fail2ban 2>/dev/null || yum install -y fail2ban 2>/dev/null', { timeout: 120000 });
    execSync('systemctl enable fail2ban && systemctl start fail2ban', { timeout: 15000 });
    res.json({ message: 'Fail2Ban enabled' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/security/fail2ban/disable
router.post('/fail2ban/disable', (req, res) => {
  try {
    execSync('systemctl stop fail2ban && systemctl disable fail2ban', { timeout: 10000 });
    res.json({ message: 'Fail2Ban disabled' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/security/ssl
router.get('/ssl', (req, res) => {
  const db = req.app.locals.db;
  const certificates = db.prepare('SELECT * FROM ssl_certificates ORDER BY created_at DESC').all();
  res.json({ certificates });
});

// POST /api/security/ssl/obtain
router.post('/ssl/obtain', (req, res) => {
  const { domain } = req.body;
  if (!domain) return res.status(400).json({ error: 'Domain is required' });

  const certDir = `/etc/letsencrypt/live/${domain}`;
  try {
    execSync(
      `certbot certonly --standalone -d ${domain} --agree-tos --non-interactive --email admin@${domain}`,
      { timeout: 120000 }
    );

    const db = req.app.locals.db;
    db.prepare('INSERT INTO ssl_certificates (domain, cert_path, key_path, issuer) VALUES (?, ?, ?, ?)').run(
      domain, `${certDir}/fullchain.pem`, `${certDir}/privkey.pem`, "Let's Encrypt"
    );

    res.json({ message: 'SSL certificate obtained successfully' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to obtain certificate: ' + e.message });
  }
});

// POST /api/security/ssl/renew
router.post('/ssl/renew', (req, res) => {
  try {
    execSync('certbot renew --quiet', { timeout: 120000 });
    res.json({ message: 'Certificates renewed' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
