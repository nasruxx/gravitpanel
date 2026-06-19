const express = require('express');
const router = express.Router();
const { execSync, exec } = require('child_process');

// GET /api/docker/containers
router.get('/containers', (req, res) => {
  try {
    const output = execSync('docker ps -a --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}|{{.CreatedAt}}" 2>/dev/null || echo ""', { timeout: 10000 }).toString().trim();
    const containers = output ? output.split('\n').map(line => {
      const [id, name, image, status, ports, created] = line.split('|');
      return { id, name, image, status, ports, created, running: status && status.startsWith('Up') };
    }).filter(c => c.id) : [];
    res.json({ containers });
  } catch (e) {
    res.json({ containers: [] });
  }
});

// GET /api/docker/images
router.get('/images', (req, res) => {
  try {
    const output = execSync('docker images --format "{{.Repository}}:{{.Tag}}|{{.ID}}|{{.Size}}|{{.CreatedSince}}" 2>/dev/null || echo ""', { timeout: 10000 }).toString().trim();
    const images = output ? output.split('\n').map(line => {
      const [repo, id, size, created] = line.split('|');
      return { repo, id, size, created };
    }).filter(i => i.repo) : [];
    res.json({ images });
  } catch (e) {
    res.json({ images: [] });
  }
});

// GET /api/docker/volumes
router.get('/volumes', (req, res) => {
  try {
    const output = execSync('docker volume ls --format "{{.Name}}|{{.Driver}}" 2>/dev/null || echo ""', { timeout: 10000 }).toString().trim();
    const volumes = output ? output.split('\n').map(line => {
      const [name, driver] = line.split('|');
      return { name, driver };
    }).filter(v => v.name) : [];
    res.json({ volumes });
  } catch (e) {
    res.json({ volumes: [] });
  }
});

// POST /api/docker/containers/:id/start
router.post('/containers/:id/start', (req, res) => {
  try {
    execSync(`docker start ${req.params.id}`, { timeout: 30000 });
    res.json({ message: 'Container started' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/docker/containers/:id/stop
router.post('/containers/:id/stop', (req, res) => {
  try {
    execSync(`docker stop ${req.params.id}`, { timeout: 30000 });
    res.json({ message: 'Container stopped' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/docker/containers/:id/restart
router.post('/containers/:id/restart', (req, res) => {
  try {
    execSync(`docker restart ${req.params.id}`, { timeout: 30000 });
    res.json({ message: 'Container restarted' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/docker/containers/:id
router.delete('/containers/:id', (req, res) => {
  try {
    execSync(`docker rm -f ${req.params.id}`, { timeout: 30000 });
    res.json({ message: 'Container removed' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/docker/images/:id
router.delete('/images/:id', (req, res) => {
  try {
    execSync(`docker rmi -f ${req.params.id}`, { timeout: 30000 });
    res.json({ message: 'Image removed' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/docker/containers/:id/logs
router.get('/containers/:id/logs', (req, res) => {
  try {
    const lines = parseInt(req.query.lines) || 100;
    const logs = execSync(`docker logs --tail ${lines} ${req.params.id} 2>&1`, { timeout: 10000 }).toString();
    res.json({ logs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/docker/compose
router.post('/compose', (req, res) => {
  const { content, name } = req.body;
  if (!content) return res.status(400).json({ error: 'Docker Compose content is required' });

  const fs = require('fs');
  const composeDir = `/tmp/gravitpanel_compose_${Date.now()}`;
  const composePath = `${composeDir}/docker-compose.yml`;

  try {
    fs.mkdirSync(composeDir, { recursive: true });
    fs.writeFileSync(composePath, content);
    execSync(`cd "${composeDir}" && docker compose up -d`, { timeout: 120000 });
    res.json({ message: 'Docker Compose stack deployed', path: composeDir });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
