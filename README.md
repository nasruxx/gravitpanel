# GravitPanel

**Free VPS Server Control Panel** — A full-featured, open-source alternative to aaPanel built with Node.js.

![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)
![Version](https://img.shields.io/badge/version-1.0.0-blue)

## Features

- 🖥️ **Real-time Dashboard** — CPU, RAM, Disk monitoring with live updates
- 🌐 **Website Management** — Nginx virtual hosts, PHP version control, SSL certificates
- 🗄️ **Database Management** — MySQL/MariaDB CRUD, users, grants, export/import
- 📁 **File Manager** — Browse, upload, edit files with code editor
- 💻 **Web Terminal** — Full shell access via WebSocket + xterm.js
- 🔧 **FTP Management** — Create and manage FTP accounts
- ⏰ **Cron Jobs** — Schedule recurring tasks with visual builder
- 🔥 **Firewall** — UFW rules, Fail2Ban, SSH port management
- 🔒 **SSL/TLS** — One-click Let's Encrypt certificates
- 🐳 **Docker** — Container and image management
- 🛒 **App Store** — 19+ apps with one-click install (Nginx, MySQL, Redis, Docker, etc.)
- 💾 **Backups** — Website and database backup/restore
- 📋 **Log Viewer** — Nginx, auth, syslog, cron logs
- ⚙️ **Settings** — Password management, panel configuration

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express |
| Frontend | HTML + Vanilla CSS + JavaScript (SPA) |
| Database | SQLite (sql.js - pure WASM, no native deps) |
| Real-time | Socket.IO + WebSocket (ws) |
| Auth | JWT + bcrypt |
| Terminal | xterm.js over WebSocket |
| Design | Dark glassmorphism theme |

## Quick Start

### Local Development

```bash
git clone https://github.com/YOUR_USERNAME/gravitpanel.git
cd gravitpanel
npm install
node server.js
```

Open **http://localhost:8321** in your browser.

**Default Login:** `admin` / `admin` (change password immediately!)

### Install on VPS (Ubuntu/Debian)

```bash
# Upload to VPS
scp -r gravitpanel root@YOUR_VPS_IP:/tmp/

# SSH into VPS
ssh root@YOUR_VPS_IP

# Run installer
cd /tmp/gravitpanel
chmod +x install.sh
sudo bash install.sh
```

The installer will automatically set up:
- Node.js 20
- Nginx (reverse proxy)
- MySQL
- UFW Firewall
- Fail2Ban
- Docker
- GravitPanel as systemd service

After installation, access the panel at: **http://YOUR_VPS_IP**

## Configuration

Environment variables (`.env`):

```env
PANEL_PORT=8321
JWT_SECRET=your-secret-key-here
NODE_ENV=production
```

## Project Structure

```
gravitpanel/
├── server.js              # Main entry point
├── package.json           # Dependencies
├── install.sh             # VPS installer script
├── config/
│   └── default.js         # Configuration
├── database/
│   ├── init.js            # Schema & initialization
│   └── wrapper.js         # SQLite wrapper (sql.js)
├── middleware/
│   ├── auth.js            # JWT authentication
│   └── rateLimit.js       # Rate limiting
├── routes/
│   ├── auth.js            # Login/setup/password
│   ├── dashboard.js       # System monitoring
│   ├── websites.js        # Website management
│   ├── databases.js       # Database management
│   ├── files.js           # File manager
│   ├── ftp.js             # FTP management
│   ├── cron.js            # Cron jobs
│   ├── security.js        # Firewall, SSL, SSH
│   ├── docker.js          # Docker management
│   ├── apps.js            # App store
│   ├── backups.js         # Backup management
│   ├── logs.js            # Log viewer
│   └── settings.js        # Panel settings
└── public/
    ├── index.html         # Main SPA shell
    ├── login.html         # Login page
    ├── css/               # Design system
    ├── js/
    │   └── app.js         # All frontend logic
    └── img/
        └── logo.svg       # Panel logo
```

## Service Management

```bash
# Status
systemctl status gravitpanel

# Restart
systemctl restart gravitpanel

# Stop
systemctl stop gravitpanel

# View logs
journalctl -u gravitpanel -f
```

## Security

- JWT authentication with token rotation
- Rate limiting on login (10 attempts/15min)
- API rate limiting (100 req/min)
- Password hashing with bcrypt
- Security headers (X-Frame-Options, CSP, etc.)
- UFW firewall integration
- Fail2Ban integration

## License

[MIT License](LICENSE)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Acknowledgments

- Inspired by [aaPanel](https://www.aapanel.com/)
- Built with Node.js, Express, Socket.IO
- UI design: Dark glassmorphism theme
