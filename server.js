require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const config = require('./config/default');
const authMiddleware = require('./middleware/auth');
const rateLimit = require('./middleware/rateLimit');
const { initDatabase } = require('./database/init');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

async function startServer() {
  // Initialize database
  const db = await initDatabase();

  // Make db accessible to routes
  app.locals.db = db;
  app.locals.config = config;

  // File uploads with multer
  const multer = require('multer');
  const upload = multer({ dest: path.join(__dirname, 'tmp'), limits: { fileSize: 100 * 1024 * 1024 } });

  // Middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  // Rate limiting
  app.use('/api/auth', rateLimit.authLimiter);

  // CORS headers
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });

  // Request logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      if (req.path.startsWith('/api')) {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
      }
    });
    next();
  });

  // Routes
  const authRoutes = require('./routes/auth');
  const dashboardRoutes = require('./routes/dashboard');
  const websitesRoutes = require('./routes/websites');
  const databasesRoutes = require('./routes/databases');
  const filesRoutes = require('./routes/files');
  const ftpRoutes = require('./routes/ftp');
  const cronRoutes = require('./routes/cron');
  const securityRoutes = require('./routes/security');
  const dockerRoutes = require('./routes/docker');
  const appsRoutes = require('./routes/apps');
  const backupsRoutes = require('./routes/backups');
  const logsRoutes = require('./routes/logs');
  const settingsRoutes = require('./routes/settings');

  // Public routes
  app.use('/api/auth', authRoutes);

  // Protected routes
  app.use('/api/dashboard', authMiddleware, dashboardRoutes);
  app.use('/api/websites', authMiddleware, websitesRoutes);
  app.use('/api/databases', authMiddleware, databasesRoutes);
  app.use('/api/files', authMiddleware, filesRoutes);
  app.use('/api/ftp', authMiddleware, ftpRoutes);
  app.use('/api/cron', authMiddleware, cronRoutes);
  app.use('/api/security', authMiddleware, securityRoutes);
  app.use('/api/docker', authMiddleware, dockerRoutes);
  app.use('/api/apps', authMiddleware, appsRoutes);
  app.use('/api/backups', authMiddleware, backupsRoutes);
  app.use('/api/logs', authMiddleware, logsRoutes);
  app.use('/api/settings', authMiddleware, settingsRoutes);

  // SPA fallback
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
  });

  // WebSocket Terminal
  const { spawn } = require('child_process');
  const { WebSocketServer } = require('ws');

  const wss = new WebSocketServer({ server, path: '/terminal' });
  wss.on('connection', (ws) => {
    console.log('[Terminal] Client connected');
    const isWin = process.platform === 'win32';
    const shell = spawn(isWin ? 'powershell.exe' : 'bash', [], {
      env: process.env,
      cwd: isWin ? process.env.USERPROFILE : (process.env.HOME || '/root'),
      cols: 120,
      rows: 30
    });

    shell.stdout.on('data', (data) => {
      try { ws.send(JSON.stringify({ type: 'output', data: data.toString() })); } catch(e) {}
    });
    shell.stderr.on('data', (data) => {
      try { ws.send(JSON.stringify({ type: 'output', data: data.toString() })); } catch(e) {}
    });
    shell.on('exit', (code) => {
      try { ws.send(JSON.stringify({ type: 'output', data: `\r\n[Process exited with code ${code}]\r\n` })); } catch(e) {}
    });

    ws.on('message', (msg) => {
      try {
        const data = JSON.parse(msg.toString());
        if (data.type === 'input' && shell.stdin.writable) {
          shell.stdin.write(data.data);
        }
      } catch(e) {}
    });

    ws.on('close', () => {
      shell.kill();
      console.log('[Terminal] Client disconnected');
    });
  });

  // Socket.IO for real-time monitoring
  const os = require('os');

  io.on('connection', (socket) => {
    console.log('[WebSocket] Client connected');

    const interval = setInterval(() => {
      const sysInfo = getSystemInfo(os);
      socket.emit('system:stats', sysInfo);
    }, 2000);

    socket.on('disconnect', () => {
      clearInterval(interval);
      console.log('[WebSocket] Client disconnected');
    });
  });

  function getSystemInfo(osModule) {
    try {
      const cpus = osModule.cpus();
      const totalMem = osModule.totalmem();
      const freeMem = osModule.freemem();
      const usedMem = totalMem - freeMem;

      let cpuUsage = 0;
      cpus.forEach(cpu => {
        const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
        const idle = cpu.times.idle;
        cpuUsage += ((total - idle) / total) * 100;
      });
      cpuUsage = parseFloat((cpuUsage / cpus.length).toFixed(1));

      let diskInfo = { total: 0, used: 0, free: 0 };
      try {
        const { execSync } = require('child_process');
        const df = execSync("df -B1 / 2>/dev/null | tail -1", { timeout: 5000 }).toString().trim().split(/\s+/);
        diskInfo = { total: parseInt(df[1]) || 0, used: parseInt(df[2]) || 0, free: parseInt(df[3]) || 0 };
      } catch(e) {}

      let networkIP = 'N/A';
      const netInterfaces = osModule.networkInterfaces();
      for (const name of Object.keys(netInterfaces)) {
        for (const net of netInterfaces[name]) {
          if (net.family === 'IPv4' && !net.internal) {
            networkIP = net.address;
            break;
          }
        }
      }

      return {
        cpu: { usage: cpuUsage, cores: cpus.length, model: cpus[0]?.model || 'Unknown', speed: cpus[0]?.speed || 0 },
        memory: { total: totalMem, used: usedMem, free: freeMem, percentage: ((usedMem / totalMem) * 100).toFixed(1) },
        disk: diskInfo,
        system: {
          hostname: osModule.hostname(),
          platform: osModule.platform(),
          arch: osModule.arch(),
          release: osModule.release(),
          uptime: osModule.uptime(),
          loadavg: osModule.loadavg(),
          ip: networkIP
        }
      };
    } catch (err) {
      return { cpu: { usage: 0 }, memory: { total: 0, used: 0, free: 0, percentage: 0 }, disk: { total: 0, used: 0, free: 0 }, system: {} };
    }
  }

  // Ensure directories exist
  const dirs = [config.paths.temp, config.paths.backups, config.paths.webRoot, path.join(__dirname, 'tmp')];
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });

  // Start server
  const PORT = config.port;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════╗
║                                                  ║
║   ____  ____  __  ____  __  _  _  ____  ____    ║
║  / __)/ ___)/ _\\\\(  _ \\\\  )( \\\\/ )(_  _)/ ___)   ║
║ ( (__ /___ (/    \\\\   / )(  )  /   )(  \\\\___ \\\\    ║
║  \\\\____)\\\\____)\\\\_/(__ \\\\)(__)/__/\\\\ (__) (____/    ║
║                                                  ║
║   Free VPS Server Control Panel v1.0.0           ║
║   Port: ${PORT}                                      ║
║   URL: http://0.0.0.0:${PORT}                       ║
║                                                  ║
╚══════════════════════════════════════════════════╝
    `);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[GravitPanel] Shutting down...');
    db.close();
    server.close(() => process.exit(0));
  });

  process.on('SIGTERM', () => {
    console.log('\n[GravitPanel] Shutting down...');
    db.close();
    server.close(() => process.exit(0));
  });
}

startServer().catch(err => {
  console.error('[GravitPanel] Failed to start:', err);
  process.exit(1);
});
