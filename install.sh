#!/bin/bash
# ============================================================
# GravitPanel - VPS Installation Script
# Tested on: Ubuntu 20.04/22.04/24.04, Debian 11/12
# ============================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

PANEL_PORT="8321"
PANEL_DIR="/opt/gravitpanel"
NODE_VERSION="20"

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════╗"
echo "║                                                  ║"
echo "║   GravitPanel - VPS Control Panel Installer      ║"
echo "║   Version 1.0.0                                  ║"
echo "║                                                  ║"
echo "╚══════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[ERROR] Please run as root (sudo bash install.sh)${NC}"
  exit 1
fi

echo -e "${BLUE}[1/10]${NC} Updating system..."
apt-get update -qq && apt-get upgrade -y -qq

echo -e "${BLUE}[2/10]${NC} Installing dependencies..."
apt-get install -y -qq curl wget git build-essential

echo -e "${BLUE}[3/10]${NC} Installing Node.js ${NODE_VERSION}..."
if ! command -v node &> /dev/null || [ "$(node -v | cut -d'.' -f1 | tr -d 'v')" -lt "$NODE_VERSION" ]; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y -qq nodejs
fi
echo "  Node.js $(node -v) installed"
echo "  npm $(npm -v) installed"

echo -e "${BLUE}[4/10]${NC} Installing Nginx..."
if ! command -v nginx &> /dev/null; then
  apt-get install -y -qq nginx
fi
systemctl enable nginx
systemctl start nginx
echo "  Nginx $(nginx -v 2>&1 | cut -d/ -f2) installed"

echo -e "${BLUE}[5/10]${NC} Installing MySQL..."
if ! command -v mysql &> /dev/null; then
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq mysql-server
fi
systemctl enable mysql
systemctl start mysql
echo "  MySQL installed"

echo -e "${BLUE}[6/10]${NC} Installing UFW firewall..."
if ! command -v ufw &> /dev/null; then
  apt-get install -y -qq ufw
fi
echo "  UFW installed"

echo -e "${BLUE}[7/10]${NC} Installing Fail2Ban..."
if ! command -v fail2ban-client &> /dev/null; then
  apt-get install -y -qq fail2ban
fi
systemctl enable fail2ban
echo "  Fail2Ban installed"

echo -e "${BLUE}[8/10]${NC} Installing Docker..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable docker
systemctl start docker
echo "  Docker $(docker --version | cut -d' ' -f3 | tr -d ',') installed"

echo -e "${BLUE}[9/10]${NC} Installing GravitPanel..."
# Create panel directory
mkdir -p "$PANEL_DIR"

# Check if source exists, otherwise use current script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/server.js" ]; then
  cp -r "$SCRIPT_DIR"/* "$PANEL_DIR/"
else
  echo -e "${YELLOW}  Source not found. Copy files to $PANEL_DIR manually.${NC}"
  echo "  Or run: cp -r /path/to/gravitpanel/* $PANEL_DIR/"
fi

# Install Node.js dependencies
cd "$PANEL_DIR"
npm install --production 2>/dev/null
echo "  GravitPanel installed to $PANEL_DIR"

echo -e "${BLUE}[10/10]${NC} Configuring system..."

# Create systemd service
cat > /etc/systemd/system/gravitpanel.service << EOF
[Unit]
Description=GravitPanel - VPS Control Panel
After=network.target mysql.service nginx.service

[Service]
Type=simple
User=root
WorkingDirectory=$PANEL_DIR
ExecStart=$(which node) server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=$PANEL_PORT

[Install]
WantedBy=multi-user.target
EOF

# Generate JWT secret
JWT_SECRET=$(openssl rand -hex 32)

# Create .env
cat > "$PANEL_DIR/.env" << EOF
PANEL_PORT=$PANEL_PORT
JWT_SECRET=$JWT_SECRET
NODE_ENV=production
EOF

# Configure Nginx reverse proxy
cat > /etc/nginx/sites-available/gravitpanel << EOF
server {
    listen 80;
    server_name _;

    # Security headers
    add_header X-Frame-Options SAMEORIGIN;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy strict-origin-when-cross-origin;

    # GravitPanel
    location / {
        proxy_pass http://127.0.0.1:$PANEL_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # WebSocket terminal
    location /terminal {
        proxy_pass http://127.0.0.1:$PANEL_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 3600s;
    }

    # File upload size
    client_max_body_size 100M;
}
EOF

# Enable Nginx config
ln -sf /etc/nginx/sites-available/gravitpanel /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default 2>/dev/null
nginx -t && systemctl reload nginx

# Configure firewall
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow $PANEL_PORT/tcp
echo "y" | ufw enable

# Enable services
systemctl daemon-reload
systemctl enable gravitpanel
systemctl start gravitpanel

# Get server IP
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s ipinfo.io/ip 2>/dev/null || hostname -I | awk '{print $1}')

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                  ║${NC}"
echo -e "${GREEN}║   GravitPanel Installed Successfully!             ║${NC}"
echo -e "${GREEN}║                                                  ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}Panel URL:${NC}    http://${SERVER_IP}"
echo -e "  ${CYAN}Direct URL:${NC}   http://${SERVER_IP}:$PANEL_PORT"
echo ""
echo -e "  ${YELLOW}Default Login:${NC}"
echo -e "    Username: ${GREEN}admin${NC}"
echo -e "    Password: ${GREEN}admin${NC}"
echo ""
echo -e "  ${RED}⚠ IMPORTANT: Change the default password immediately!${NC}"
echo ""
echo -e "  ${CYAN}Service Commands:${NC}"
echo -e "    systemctl status gravitpanel"
echo -e "    systemctl restart gravitpanel"
echo -e "    systemctl stop gravitpanel"
echo -e "    journalctl -u gravitpanel -f"
echo ""
echo -e "  ${CYAN}Logs:${NC}"
echo -e "    /opt/gravitpanel/database/gravitpanel.db"
echo -e "    journalctl -u gravitpanel"
echo ""
