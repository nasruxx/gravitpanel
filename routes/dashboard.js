const express = require('express');
const router = express.Router();
const os = require('os');
const { execSync } = require('child_process');

// GET /api/dashboard/info
router.get('/info', (req, res) => {
  try {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // CPU usage
    let cpuUsage = 0;
    cpus.forEach(cpu => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      const idle = cpu.times.idle;
      cpuUsage += ((total - idle) / total) * 100;
    });
    cpuUsage = parseFloat((cpuUsage / cpus.length).toFixed(1));

    // Disk info (cross-platform)
    let diskInfo = { total: 0, used: 0, free: 0, percentage: 0 };
    try {
      if (os.platform() === 'win32') {
        const wmic = execSync('wmic logicaldisk get Size,FreeSpace /format:csv', { timeout: 5000 }).toString();
        const wLines = wmic.trim().split('\n').filter(l => l.trim());
        if (wLines.length >= 2) {
          const wParts = wLines[1].split(',');
          const freeSpace = parseInt(wParts[1]) || 0;
          const totalSize = parseInt(wParts[2]) || 0;
          diskInfo = {
            total: totalSize,
            used: totalSize - freeSpace,
            free: freeSpace,
            percentage: totalSize > 0 ? parseFloat(((totalSize - freeSpace) / totalSize * 100).toFixed(1)) : 0
          };
        }
      } else {
        const df = execSync("df -B1 / | tail -1", { timeout: 5000 }).toString().trim().split(/\s+/);
        diskInfo = {
          total: parseInt(df[1]) || 0,
          used: parseInt(df[2]) || 0,
          free: parseInt(df[3]) || 0,
          percentage: parseFloat(((parseInt(df[2]) || 0) / (parseInt(df[1]) || 1) * 100).toFixed(1))
        };
      }
    } catch (e) {}

    // Network
    let networkIP = 'N/A';
    let networkInterfaces = [];
    const netInterfaces = os.networkInterfaces();
    for (const name of Object.keys(netInterfaces)) {
      for (const net of netInterfaces[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          networkIP = net.address;
          networkInterfaces.push({ name, address: net.address, netmask: net.netmask });
        }
      }
    }

    // Service status
    const services = {};
    const isLinux = os.platform() !== 'win32';
    const serviceChecks = [
      { name: 'nginx', cmd: 'systemctl is-active nginx 2>/dev/null || echo inactive' },
      { name: 'mysql', cmd: 'systemctl is-active mysql 2>/dev/null || systemctl is-active mariadb 2>/dev/null || echo inactive' },
      { name: 'php-fpm', cmd: 'systemctl is-active php*-fpm 2>/dev/null || echo inactive' },
      { name: 'docker', cmd: 'systemctl is-active docker 2>/dev/null || echo inactive' },
      { name: 'redis', cmd: 'systemctl is-active redis 2>/dev/null || echo inactive' },
      { name: 'fail2ban', cmd: 'systemctl is-active fail2ban 2>/dev/null || echo inactive' }
    ];

    if (isLinux) {
      serviceChecks.forEach(s => {
        try {
          const status = execSync(s.cmd, { timeout: 5000 }).toString().trim();
          services[s.name] = { active: status === 'active', status };
        } catch (e) {
          services[s.name] = { active: false, status: 'inactive' };
        }
      });
    } else {
      // Windows: check via sc query
      serviceChecks.forEach(s => {
        try {
          const result = execSync(`sc query ${s.name} 2>nul | findstr STATE`, { timeout: 3000 }).toString();
          const active = result.includes('RUNNING');
          services[s.name] = { active, status: active ? 'active' : 'inactive' };
        } catch (e) {
          services[s.name] = { active: false, status: 'inactive' };
        }
      });
    }

    // Website & database counts
    const db = req.app.locals.db;
    const websiteCount = db.prepare('SELECT COUNT(*) as count FROM websites').get().count;
    const dbCount = db.prepare('SELECT COUNT(*) as count FROM databases').get().count;
    const ftpCount = db.prepare('SELECT COUNT(*) as count FROM ftp_accounts').get().count;
    const cronCount = db.prepare('SELECT COUNT(*) as count FROM cron_jobs').get().count;

    res.json({
      cpu: {
        usage: cpuUsage,
        cores: cpus.length,
        model: cpus[0] ? cpus[0].model : 'Unknown',
        speed: cpus[0] ? cpus[0].speed : 0,
        times: cpus.map(c => c.times)
      },
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        percentage: parseFloat(((usedMem / totalMem) * 100).toFixed(1))
      },
      disk: diskInfo,
      network: {
        ip: networkIP,
        interfaces: networkInterfaces
      },
      system: {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        release: os.release(),
        uptime: os.uptime(),
        loadavg: os.loadavg(),
        nodeVersion: process.version,
        panelVersion: '1.0.0'
      },
      services,
      stats: {
        websites: websiteCount,
        databases: dbCount,
        ftpAccounts: ftpCount,
        cronJobs: cronCount
      }
    });
  } catch (err) {
    console.error('[Dashboard] Error:', err);
    res.status(500).json({ error: 'Failed to get dashboard info' });
  }
});

// GET /api/dashboard/processes
router.get('/processes', (req, res) => {
  try {
    if (os.platform() === 'win32') {
      // Windows: use tasklist
      const output = execSync('tasklist /fo csv /nh', { timeout: 10000 }).toString();
      const processes = [];
      output.trim().split('\n').slice(0, 20).forEach(line => {
        const parts = line.split(',').map(p => p.replace(/"/g, '').trim());
        if (parts.length >= 5) {
          processes.push({
            user: 'N/A',
            pid: parseInt(parts[1]) || 0,
            cpu: 0,
            mem: parseFloat(parts[4]) || 0,
            command: parts[0]
          });
        }
      });
      return res.json({ processes });
    }

    // Linux: use ps
    const ps = execSync("ps aux --sort=-%cpu | head -21", { timeout: 10000 }).toString();
    const lines = ps.trim().split('\n');
    const processes = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(/\s+/);
      if (parts.length >= 11) {
        processes.push({
          user: parts[0],
          pid: parseInt(parts[1]),
          cpu: parseFloat(parts[2]),
          mem: parseFloat(parts[3]),
          vsz: parseInt(parts[4]),
          rss: parseInt(parts[5]),
          command: parts.slice(10).join(' ')
        });
      }
    }
    res.json({ processes });
  } catch (err) {
    res.json({ processes: [] });
  }
});

// GET /api/dashboard/network
router.get('/network', (req, res) => {
  try {
    if (os.platform() === 'win32') {
      return res.json({ interfaces: [] });
    }
    const netDev = execSync("cat /proc/net/dev | tail -n +3", { timeout: 5000 }).toString();
    const interfaces = [];
    netDev.trim().split('\n').forEach(line => {
      const parts = line.trim().split(/[\s:]+/);
      if (parts.length >= 10) {
        interfaces.push({
          name: parts[0],
          rxBytes: parseInt(parts[1]),
          rxPackets: parseInt(parts[2]),
          txBytes: parseInt(parts[9]),
          txPackets: parseInt(parts[10])
        });
      }
    });
    res.json({ interfaces });
  } catch (err) {
    res.json({ interfaces: [] });
  }
});

// GET /api/dashboard/activity
router.get('/activity', (req, res) => {
  const db = req.app.locals.db;
  const limit = parseInt(req.query.limit) || 20;
  const activities = db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?').all(limit);
  res.json({ activities });
});

module.exports = router;
