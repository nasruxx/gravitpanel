const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const multer = require('multer');
const upload = multer({ dest: '/tmp/gravitpanel_uploads/' });

// GET /api/files/list
router.get('/list', (req, res) => {
  const dirPath = req.query.path || '/';

  try {
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: 'Not a directory' });
    }
  } catch (e) {
    return res.status(404).json({ error: 'Directory not found' });
  }

  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    const files = items.map(item => {
      const fullPath = path.join(dirPath, item.name);
      try {
        const stat = fs.statSync(fullPath);
        return {
          name: item.name,
          path: fullPath,
          isDirectory: item.isDirectory(),
          isFile: item.isFile(),
          isLink: item.isSymbolicLink(),
          size: stat.size,
          modified: stat.mtime,
          created: stat.birthtime,
          permissions: (stat.mode & 0o777).toString(8),
          owner: stat.uid,
          group: stat.gid,
          mimetype: getMimeType(item.name)
        };
      } catch (e) {
        return {
          name: item.name,
          path: fullPath,
          isDirectory: item.isDirectory(),
          isFile: item.isFile(),
          isLink: item.isSymbolicLink(),
          size: 0,
          modified: null,
          permissions: '000',
          error: e.message
        };
      }
    });

    // Sort: directories first, then files
    files.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    res.json({ path: dirPath, files, parent: path.dirname(dirPath) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/files/read
router.get('/read', (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'File path is required' });

  try {
    const stat = fs.statSync(filePath);
    if (stat.size > 10 * 1024 * 1024) { // 10MB limit
      return res.status(413).json({ error: 'File too large to read (>10MB)' });
    }

    const content = fs.readFileSync(filePath, 'utf8');
    res.json({ path: filePath, content, size: stat.size, modified: stat.mtime });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/files/write
router.post('/write', (req, res) => {
  const { path: filePath, content } = req.body;
  if (!filePath) return res.status(400).json({ error: 'File path is required' });

  try {
    fs.writeFileSync(filePath, content || '', 'utf8');
    res.json({ message: 'File saved successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/files/mkdir
router.post('/mkdir', (req, res) => {
  const { path: dirPath } = req.body;
  if (!dirPath) return res.status(400).json({ error: 'Directory path is required' });

  try {
    fs.mkdirSync(dirPath, { recursive: true });
    res.json({ message: 'Directory created' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/files/delete
router.delete('/delete', (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'Path is required' });

  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      execSync(`rm -rf "${filePath}"`, { timeout: 30000 });
    } else {
      fs.unlinkSync(filePath);
    }
    res.json({ message: 'Deleted successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/files/rename
router.post('/rename', (req, res) => {
  const { oldPath, newPath } = req.body;
  if (!oldPath || !newPath) return res.status(400).json({ error: 'Both paths are required' });

  try {
    fs.renameSync(oldPath, newPath);
    res.json({ message: 'Renamed successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/files/chmod
router.post('/chmod', (req, res) => {
  const { path: filePath, permissions } = req.body;
  if (!filePath || !permissions) return res.status(400).json({ error: 'Path and permissions are required' });

  try {
    fs.chmodSync(filePath, parseInt(permissions, 8));
    res.json({ message: 'Permissions updated' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/files/upload
router.post('/upload', upload.single('file'), (req, res) => {
  const destDir = req.body.path || '/tmp';

  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const destPath = path.join(destDir, req.file.originalname);
    fs.copyFileSync(req.file.path, destPath);
    fs.unlinkSync(req.file.path);
    res.json({ message: 'File uploaded successfully', path: destPath });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/files/download
router.get('/download', (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'File path is required' });

  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      // Create zip and download
      const zipPath = `/tmp/gravitpanel_${Date.now()}.zip`;
      execSync(`cd "${path.dirname(filePath)}" && zip -r "${zipPath}" "${path.basename(filePath)}"`, { timeout: 60000 });
      res.download(zipPath, `${path.basename(filePath)}.zip`, (err) => {
        try { fs.unlinkSync(zipPath); } catch (e) {}
      });
    } else {
      res.download(filePath);
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/files/zip
router.post('/zip', (req, res) => {
  const { path: sourcePath, outputPath } = req.body;
  if (!sourcePath) return res.status(400).json({ error: 'Source path is required' });

  const zipPath = outputPath || `${sourcePath}.zip`;
  try {
    execSync(`cd "${path.dirname(sourcePath)}" && zip -r "${zipPath}" "${path.basename(sourcePath)}"`, { timeout: 120000 });
    res.json({ message: 'Created zip archive', path: zipPath });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/files/unzip
router.post('/unzip', (req, res) => {
  const { path: zipPath, destPath } = req.body;
  if (!zipPath) return res.status(400).json({ error: 'ZIP path is required' });

  const dest = destPath || path.dirname(zipPath);
  try {
    execSync(`unzip -o "${zipPath}" -d "${dest}"`, { timeout: 120000 });
    res.json({ message: 'Extracted successfully', path: dest });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const types = {
    '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
    '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain',
    '.md': 'text/markdown', '.php': 'application/x-httpd-php',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
    '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.pdf': 'application/pdf',
    '.zip': 'application/zip', '.tar': 'application/x-tar', '.gz': 'application/gzip',
    '.sql': 'application/sql', '.sh': 'application/x-sh', '.py': 'text/x-python',
    '.rb': 'text/x-ruby', '.java': 'text/x-java', '.c': 'text/x-c', '.cpp': 'text/x-c++',
    '.go': 'text/x-go', '.rs': 'text/x-rust', '.ts': 'text/typescript'
  };
  return types[ext] || 'application/octet-stream';
}

module.exports = router;
