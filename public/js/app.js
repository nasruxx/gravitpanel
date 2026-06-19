/* GravitPanel - Main Application */

// ============================================================
// CORE & UTILITIES
// ============================================================
const GP = {
  token: localStorage.getItem('gp_token'),
  user: JSON.parse(localStorage.getItem('gp_user') || '{}'),
  currentPage: 'dashboard',
  ws: null,
  stats: {}
};

// Auth guard
if (!GP.token && !window.location.pathname.includes('login')) {
  window.location.href = '/login.html';
}

// API client
async function api(endpoint, options = {}) {
  const res = await fetch(`/api${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GP.token}`,
      ...options.headers
    }
  });

  if (res.status === 401) {
    localStorage.removeItem('gp_token');
    localStorage.removeItem('gp_user');
    window.location.href = '/login.html';
    return;
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// Toast notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="${type === 'success' ? '#34d399' : type === 'error' ? '#fb7185' : type === 'warning' ? '#fbbf24' : '#60a5fa'}" stroke-width="2">
      ${type === 'success' ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>' :
        type === 'error' ? '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>' :
        type === 'warning' ? '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>' :
        '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'}
    </svg>
    <span class="toast-message">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:18px;">×</button>
  `;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

// Modal
function showModal(title, content) {
  const overlay = document.getElementById('modalOverlay');
  const modal = document.getElementById('modalContent');
  modal.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">${title}</h3>
      <button class="modal-close" onclick="closeModal()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="modal-body">${content}</div>
  `;
  overlay.classList.add('active');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
}

// Format bytes
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Format seconds to uptime
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${mins}m`;
}

// Escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// ============================================================
// SIDEBAR & NAVIGATION
// ============================================================
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('collapsed');
}

function navigateTo(page) {
  GP.currentPage = page;

  // Update active nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });

  // Update header
  const titles = {
    dashboard: ['Dashboard', 'Overview'],
    websites: ['Websites', 'Management'],
    databases: ['Databases', 'Management'],
    files: ['File Manager', 'Management'],
    terminal: ['Terminal', 'System'],
    ftp: ['FTP Accounts', 'Services'],
    cron: ['Cron Jobs', 'Services'],
    docker: ['Docker', 'Containers'],
    security: ['Firewall & SSL', 'Security'],
    logs: ['Log Viewer', 'Security'],
    apps: ['App Store', 'System'],
    backups: ['Backups', 'System'],
    settings: ['Settings', 'System']
  };

  const [title, breadcrumb] = titles[page] || ['Dashboard', 'Overview'];
  document.getElementById('pageTitle').textContent = title;
  document.getElementById('pageBreadcrumb').textContent = breadcrumb;

  // Render page
  renderPage(page);
}

function logout() {
  localStorage.removeItem('gp_token');
  localStorage.removeItem('gp_user');
  window.location.href = '/login.html';
}

// ============================================================
// PAGE RENDERER
// ============================================================
async function renderPage(page) {
  const content = document.getElementById('pageContent');
  content.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:60vh;"><div class="spinner spinner-lg"></div></div>';

  try {
    switch (page) {
      case 'dashboard': await renderDashboard(content); break;
      case 'websites': await renderWebsites(content); break;
      case 'databases': await renderDatabases(content); break;
      case 'files': await renderFileManager(content); break;
      case 'terminal': renderTerminal(content); break;
      case 'ftp': await renderFTP(content); break;
      case 'cron': await renderCron(content); break;
      case 'docker': await renderDocker(content); break;
      case 'security': await renderSecurity(content); break;
      case 'logs': await renderLogs(content); break;
      case 'apps': await renderApps(content); break;
      case 'backups': await renderBackups(content); break;
      case 'settings': await renderSettings(content); break;
      default: await renderDashboard(content);
    }
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><h3>Error loading page</h3><p>${escapeHtml(err.message)}</p><button class="btn btn-primary" onclick="renderPage('${page}')">Retry</button></div>`;
  }
}

// ============================================================
// DASHBOARD
// ============================================================
async function renderDashboard(el) {
  el.innerHTML = `
    <div class="page-transition">
      <div class="grid grid-4" id="statCards">
        <div class="stat-card cpu stagger-item"><div class="skeleton" style="width:48px;height:48px;"></div><div style="flex:1"><div class="skeleton skeleton-text" style="width:60px;"></div><div class="skeleton skeleton-text" style="width:40px;"></div></div></div>
        <div class="stat-card memory stagger-item"><div class="skeleton" style="width:48px;height:48px;"></div><div style="flex:1"><div class="skeleton skeleton-text" style="width:60px;"></div><div class="skeleton skeleton-text" style="width:40px;"></div></div></div>
        <div class="stat-card disk stagger-item"><div class="skeleton" style="width:48px;height:48px;"></div><div style="flex:1"><div class="skeleton skeleton-text" style="width:60px;"></div><div class="skeleton skeleton-text" style="width:40px;"></div></div></div>
        <div class="stat-card network stagger-item"><div class="skeleton" style="width:48px;height:48px;"></div><div style="flex:1"><div class="skeleton skeleton-text" style="width:60px;"></div><div class="skeleton skeleton-text" style="width:40px;"></div></div></div>
      </div>
      <div class="grid grid-2" style="margin-top:1.5rem;">
        <div class="card stagger-item"><div class="card-header"><h4 class="card-title">System Information</h4></div><div id="sysInfo"><div class="skeleton" style="height:200px;"></div></div></div>
        <div class="card stagger-item"><div class="card-header"><h4 class="card-title">Service Status</h4></div><div id="svcStatus"><div class="skeleton" style="height:200px;"></div></div></div>
      </div>
      <div class="card stagger-item" style="margin-top:1.5rem;"><div class="card-header"><h4 class="card-title">Top Processes</h4></div><div id="processList"><div class="skeleton" style="height:200px;"></div></div></div>
    </div>
  `;

  // Load dashboard data
  try {
    const data = await api('/dashboard/info');
    GP.stats = data;

    // Stat cards
    document.getElementById('statCards').innerHTML = `
      <div class="stat-card cpu stagger-item">
        <div class="stat-icon blue"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg></div>
        <div class="stat-info"><h3>${data.cpu.usage}%</h3><p>CPU (${data.cpu.cores} cores)</p><div class="progress" style="margin-top:8px;width:120px;"><div class="progress-bar ${data.cpu.usage > 80 ? 'red' : data.cpu.usage > 50 ? 'orange' : 'blue'}" style="width:${data.cpu.usage}%"></div></div></div>
      </div>
      <div class="stat-card memory stagger-item">
        <div class="stat-icon purple"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="10" x2="6" y2="14"/><line x1="10" y1="10" x2="10" y2="14"/><line x1="14" y1="10" x2="14" y2="14"/><line x1="18" y1="10" x2="18" y2="14"/></svg></div>
        <div class="stat-info"><h3>${data.memory.percentage}%</h3><p>RAM (${formatBytes(data.memory.used)} / ${formatBytes(data.memory.total)})</p><div class="progress" style="margin-top:8px;width:120px;"><div class="progress-bar ${data.memory.percentage > 80 ? 'red' : data.memory.percentage > 50 ? 'orange' : 'blue'}" style="width:${data.memory.percentage}%"></div></div></div>
      </div>
      <div class="stat-card disk stagger-item">
        <div class="stat-icon orange"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><line x1="22" y1="12" x2="2" y2="12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" y1="16" x2="6.01" y2="16"/><line x1="10" y1="16" x2="10.01" y2="16"/></svg></div>
        <div class="stat-info"><h3>${data.disk.percentage}%</h3><p>Disk (${formatBytes(data.disk.used)} / ${formatBytes(data.disk.total)})</p><div class="progress" style="margin-top:8px;width:120px;"><div class="progress-bar ${data.disk.percentage > 80 ? 'red' : data.disk.percentage > 60 ? 'orange' : 'green'}" style="width:${data.disk.percentage}%"></div></div></div>
      </div>
      <div class="stat-card network stagger-item">
        <div class="stat-icon green"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg></div>
        <div class="stat-info"><h3>${data.network.ip}</h3><p>Server IP Address</p><span class="badge badge-success" style="margin-top:6px;">Connected</span></div>
      </div>
    `;

    // System info
    document.getElementById('sysInfo').innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;">
        <div style="padding:0.75rem;background:rgba(15,23,42,0.4);border-radius:var(--radius-md);"><span style="font-size:var(--text-xs);color:var(--text-muted);">Hostname</span><div style="font-size:var(--text-sm);font-weight:500;margin-top:2px;">${data.system.hostname}</div></div>
        <div style="padding:0.75rem;background:rgba(15,23,42,0.4);border-radius:var(--radius-md);"><span style="font-size:var(--text-xs);color:var(--text-muted);">Platform</span><div style="font-size:var(--text-sm);font-weight:500;margin-top:2px;">${data.system.platform} / ${data.system.arch}</div></div>
        <div style="padding:0.75rem;background:rgba(15,23,42,0.4);border-radius:var(--radius-md);"><span style="font-size:var(--text-xs);color:var(--text-muted);">Uptime</span><div style="font-size:var(--text-sm);font-weight:500;margin-top:2px;">${formatUptime(data.system.uptime)}</div></div>
        <div style="padding:0.75rem;background:rgba(15,23,42,0.4);border-radius:var(--radius-md);"><span style="font-size:var(--text-xs);color:var(--text-muted);">Load Average</span><div style="font-size:var(--text-sm);font-weight:500;margin-top:2px;">${data.system.loadavg?.map(l => l.toFixed(2)).join(' / ') || 'N/A'}</div></div>
        <div style="padding:0.75rem;background:rgba(15,23,42,0.4);border-radius:var(--radius-md);"><span style="font-size:var(--text-xs);color:var(--text-muted);">Kernel</span><div style="font-size:var(--text-sm);font-weight:500;margin-top:2px;word-break:break-all;">${data.system.release?.substring(0, 40) || 'N/A'}</div></div>
        <div style="padding:0.75rem;background:rgba(15,23,42,0.4);border-radius:var(--radius-md);"><span style="font-size:var(--text-xs);color:var(--text-muted);">Node.js</span><div style="font-size:var(--text-sm);font-weight:500;margin-top:2px;">${data.system.nodeVersion}</div></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:0.75rem;margin-top:1rem;">
        <div style="text-align:center;padding:0.75rem;background:rgba(15,23,42,0.4);border-radius:var(--radius-md);"><div style="font-size:var(--text-2xl);font-weight:700;color:var(--primary-400);">${data.stats.websites}</div><div style="font-size:var(--text-xs);color:var(--text-muted);">Websites</div></div>
        <div style="text-align:center;padding:0.75rem;background:rgba(15,23,42,0.4);border-radius:var(--radius-md);"><div style="font-size:var(--text-2xl);font-weight:700;color:var(--accent-400);">${data.stats.databases}</div><div style="font-size:var(--text-xs);color:var(--text-muted);">Databases</div></div>
        <div style="text-align:center;padding:0.75rem;background:rgba(15,23,42,0.4);border-radius:var(--radius-md);"><div style="font-size:var(--text-2xl);font-weight:700;color:var(--info-400);">${data.stats.ftpAccounts}</div><div style="font-size:var(--text-xs);color:var(--text-muted);">FTP</div></div>
        <div style="text-align:center;padding:0.75rem;background:rgba(15,23,42,0.4);border-radius:var(--radius-md);"><div style="font-size:var(--text-2xl);font-weight:700;color:var(--success-400);">${data.stats.cronJobs}</div><div style="font-size:var(--text-xs);color:var(--text-muted);">Cron Jobs</div></div>
      </div>
    `;

    // Services
    document.getElementById('svcStatus').innerHTML = `
      <div style="display:grid;gap:0.5rem;">
        ${Object.entries(data.services).map(([name, svc]) => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:0.625rem 0.75rem;background:rgba(15,23,42,0.4);border-radius:var(--radius-md);">
            <div style="display:flex;align-items:center;gap:0.75rem;">
              <span class="status-dot ${svc.active ? 'online' : 'offline'}"></span>
              <span style="font-size:var(--text-sm);font-weight:500;text-transform:capitalize;">${name.replace('-', ' ')}</span>
            </div>
            <span class="badge ${svc.active ? 'badge-success' : 'badge-danger'}">${svc.active ? 'Running' : 'Stopped'}</span>
          </div>
        `).join('')}
      </div>
    `;

    // Processes
    try {
      const procData = await api('/dashboard/processes');
      document.getElementById('processList').innerHTML = `
        <div class="table-wrapper">
          <table class="table">
            <thead><tr><th>User</th><th>PID</th><th>CPU%</th><th>MEM%</th><th>Command</th></tr></thead>
            <tbody>
              ${procData.processes.map(p => `
                <tr>
                  <td style="font-family:var(--font-mono);font-size:var(--text-xs);">${escapeHtml(p.user)}</td>
                  <td>${p.pid}</td>
                  <td><span style="color:${p.cpu > 50 ? 'var(--danger-400)' : 'var(--text-primary)'}">${p.cpu}%</span></td>
                  <td>${p.mem}%</td>
                  <td style="max-width:300px;" class="truncate font-mono" style="font-size:var(--text-xs);">${escapeHtml(p.command)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } catch (e) {
      document.getElementById('processList').innerHTML = '<p class="text-muted">Unable to load processes</p>';
    }

  } catch (err) {
    showToast('Failed to load dashboard: ' + err.message, 'error');
  }
}

// ============================================================
// WEBSITES
// ============================================================
async function renderWebsites(el) {
  el.innerHTML = `
    <div class="page-transition">
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:start;">
        <div><h1>Websites</h1><p>Manage your websites and virtual hosts</p></div>
        <button class="btn btn-primary" onclick="showAddWebsiteModal()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add Website</button>
      </div>
      <div id="websiteList"></div>
    </div>
  `;
  loadWebsites();
}

async function loadWebsites() {
  try {
    const data = await api('/websites');
    const list = document.getElementById('websiteList');
    if (!data.websites.length) {
      list.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg><h3>No websites yet</h3><p>Add your first website to get started</p><button class="btn btn-primary" onclick="showAddWebsiteModal()">Add Website</button></div>`;
      return;
    }
    list.innerHTML = `
      <div class="table-wrapper">
        <table class="table">
          <thead><tr><th>Domain</th><th>Root Directory</th><th>PHP</th><th>SSL</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${data.websites.map(w => `
              <tr>
                <td><div style="font-weight:600;color:var(--text-primary);">${escapeHtml(w.domain)}</div><div style="font-size:var(--text-xs);color:var(--text-muted);">${escapeHtml(w.all_domains || w.domain)}</div></td>
                <td class="font-mono" style="font-size:var(--text-xs);">${escapeHtml(w.root_dir)}</td>
                <td><span class="badge badge-info">PHP ${escapeHtml(w.php_version)}</span></td>
                <td>${w.ssl_enabled ? '<span class="badge badge-success">SSL</span>' : '<span class="badge badge-neutral">No SSL</span>'}</td>
                <td><span class="badge badge-success">Active</span></td>
                <td>
                  <div style="display:flex;gap:4px;">
                    ${!w.ssl_enabled ? `<button class="btn btn-sm btn-success" onclick="enableSSL(${w.id})" title="Enable SSL"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></button>` : ''}
                    <button class="btn btn-sm btn-ghost" onclick="viewWebsiteLogs(${w.id})" title="Logs"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></button>
                    <button class="btn btn-sm btn-danger" onclick="deleteWebsite(${w.id}, '${escapeHtml(w.domain)}')" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (e) {
    document.getElementById('websiteList').innerHTML = `<div class="empty-state"><h3>Error loading websites</h3><p>${escapeHtml(e.message)}</p></div>`;
  }
}

function showAddWebsiteModal() {
  showModal('Add Website', `
    <form id="addWebsiteForm" onsubmit="createWebsite(event)">
      <div class="form-group"><label class="form-label">Domain Name</label><input type="text" class="form-input" id="siteDomain" placeholder="example.com" required></div>
      <div class="form-group"><label class="form-label">Document Root</label><input type="text" class="form-input" id="siteRoot" placeholder="/var/www/example.com"><div class="form-helper">Leave empty to auto-generate from domain name</div></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">PHP Version</label><select class="form-select" id="sitePHP"><option value="8.1">PHP 8.1</option><option value="8.2">PHP 8.2</option><option value="8.3">PHP 8.3</option><option value="7.4">PHP 7.4</option></select></div>
        <div class="form-group"><label class="form-label">Server</label><select class="form-select" id="siteServer"><option value="nginx">Nginx</option><option value="apache">Apache</option></select></div>
      </div>
      <div class="modal-footer" style="border:none;padding:0;"><button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button><button type="submit" class="btn btn-primary">Create Website</button></div>
    </form>
  `);
}

async function createWebsite(e) {
  e.preventDefault();
  try {
    await api('/websites', {
      method: 'POST',
      body: JSON.stringify({
        domain: document.getElementById('siteDomain').value,
        root_dir: document.getElementById('siteRoot').value,
        php_version: document.getElementById('sitePHP').value,
        server_type: document.getElementById('siteServer').value
      })
    });
    closeModal();
    showToast('Website created successfully!', 'success');
    loadWebsites();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteWebsite(id, domain) {
  if (!confirm(`Delete website ${domain}? This will remove Nginx configuration.`)) return;
  try {
    await api(`/websites/${id}`, { method: 'DELETE' });
    showToast('Website deleted', 'success');
    loadWebsites();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function enableSSL(id) {
  try {
    showToast('Obtaining SSL certificate...', 'info');
    await api(`/websites/${id}/ssl`, { method: 'POST' });
    showToast('SSL certificate installed!', 'success');
    loadWebsites();
  } catch (err) {
    showToast('SSL error: ' + err.message, 'error');
  }
}

async function viewWebsiteLogs(id) {
  try {
    const data = await api(`/websites/${id}/logs?type=access&lines=100`);
    showModal('Website Access Log', `<div class="log-viewer">${escapeHtml(data.logs)}</div>`);
  } catch (e) {
    showToast('Failed to load logs', 'error');
  }
}

// ============================================================
// DATABASES
// ============================================================
async function renderDatabases(el) {
  el.innerHTML = `
    <div class="page-transition">
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:start;">
        <div><h1>Databases</h1><p>Manage MySQL/MariaDB databases and users</p></div>
        <div style="display:flex;gap:0.5rem;">
          <button class="btn btn-secondary" onclick="showAddDBUserModal()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Add User</button>
          <button class="btn btn-primary" onclick="showAddDBModal()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add Database</button>
        </div>
      </div>
      <div id="dbList"></div>
    </div>
  `;
  loadDatabases();
}

async function loadDatabases() {
  try {
    const data = await api('/databases');
    const list = document.getElementById('dbList');
    if (!data.databases.length) {
      list.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg><h3>No databases yet</h3><p>Create your first MySQL/MariaDB database</p><button class="btn btn-primary" onclick="showAddDBModal()">Create Database</button></div>`;
      return;
    }
    list.innerHTML = `
      <div class="table-wrapper">
        <table class="table">
          <thead><tr><th>Database Name</th><th>Size</th><th>Created</th><th>Actions</th></tr></thead>
          <tbody>
            ${data.databases.map(db => `
              <tr>
                <td><div style="font-weight:600;color:var(--text-primary);">${escapeHtml(db.name)}</div></td>
                <td>${db.size_mb ? db.size_mb + ' MB' : 'N/A'}</td>
                <td style="font-size:var(--text-xs);color:var(--text-muted);">${new Date(db.created_at).toLocaleDateString()}</td>
                <td>
                  <div style="display:flex;gap:4px;">
                    <button class="btn btn-sm btn-ghost" onclick="exportDB(${db.id})" title="Export"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
                    <button class="btn btn-sm btn-danger" onclick="deleteDB(${db.id}, '${escapeHtml(db.name)}')" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${data.users.length ? `
        <h3 style="margin-top:2rem;margin-bottom:1rem;">Database Users</h3>
        <div class="table-wrapper">
          <table class="table">
            <thead><tr><th>Username</th><th>Host</th><th>Created</th><th>Actions</th></tr></thead>
            <tbody>
              ${data.users.map(u => `
                <tr>
                  <td style="font-weight:600;color:var(--text-primary);">${escapeHtml(u.username)}</td>
                  <td>${escapeHtml(u.host)}</td>
                  <td style="font-size:var(--text-xs);">${new Date(u.created_at).toLocaleDateString()}</td>
                  <td><button class="btn btn-sm btn-danger" onclick="deleteDBUser(${u.id})">Delete</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}
    `;
  } catch (e) {
    document.getElementById('dbList').innerHTML = `<div class="empty-state"><h3>Error loading databases</h3><p>${escapeHtml(e.message)}</p></div>`;
  }
}

function showAddDBModal() {
  showModal('Create Database', `
    <form onsubmit="createDB(event)">
      <div class="form-group"><label class="form-label">Database Name</label><input type="text" class="form-input" id="dbName" placeholder="my_database" required></div>
      <div class="modal-footer" style="border:none;padding:0;"><button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button><button type="submit" class="btn btn-primary">Create</button></div>
    </form>
  `);
}

function showAddDBUserModal() {
  showModal('Create Database User', `
    <form onsubmit="createDBUser(event)">
      <div class="form-group"><label class="form-label">Username</label><input type="text" class="form-input" id="dbUsername" required></div>
      <div class="form-group"><label class="form-label">Password</label><input type="text" class="form-input" id="dbPassword" required></div>
      <div class="form-group"><label class="form-label">Host</label><input type="text" class="form-input" id="dbHost" value="localhost"></div>
      <div class="modal-footer" style="border:none;padding:0;"><button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button><button type="submit" class="btn btn-primary">Create User</button></div>
    </form>
  `);
}

async function createDB(e) {
  e.preventDefault();
  try {
    await api('/databases', { method: 'POST', body: JSON.stringify({ name: document.getElementById('dbName').value }) });
    closeModal(); showToast('Database created!', 'success'); loadDatabases();
  } catch (err) { showToast(err.message, 'error'); }
}

async function createDBUser(e) {
  e.preventDefault();
  try {
    await api('/databases/users', { method: 'POST', body: JSON.stringify({ username: document.getElementById('dbUsername').value, password: document.getElementById('dbPassword').value, host: document.getElementById('dbHost').value }) });
    closeModal(); showToast('User created!', 'success'); loadDatabases();
  } catch (err) { showToast(err.message, 'error'); }
}

async function deleteDB(id, name) {
  if (!confirm(`Delete database "${name}"? This cannot be undone.`)) return;
  try { await api(`/databases/${id}`, { method: 'DELETE' }); showToast('Database deleted', 'success'); loadDatabases(); } catch (err) { showToast(err.message, 'error'); }
}

async function deleteDBUser(id) {
  if (!confirm('Delete this database user?')) return;
  try { await api(`/databases/users/${id}`, { method: 'DELETE' }); showToast('User deleted', 'success'); loadDatabases(); } catch (err) { showToast(err.message, 'error'); }
}

async function exportDB(id) {
  try {
    showToast('Exporting database...', 'info');
    const res = await fetch(`/api/databases/${id}/export`, { headers: { 'Authorization': `Bearer ${GP.token}` } });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `database_export_${Date.now()}.sql`; a.click();
      showToast('Database exported!', 'success');
    }
  } catch (e) { showToast('Export failed', 'error'); }
}

// ============================================================
// FILE MANAGER
// ============================================================
let currentPath = '/';

async function renderFileManager(el) {
  el.innerHTML = `
    <div class="page-transition">
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:start;">
        <div><h1>File Manager</h1><p>Browse and manage server files</p></div>
        <div style="display:flex;gap:0.5rem;">
          <button class="btn btn-secondary" onclick="showNewFolderModal()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg> New Folder</button>
          <label class="btn btn-primary" style="cursor:pointer;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Upload<input type="file" style="display:none;" onchange="uploadFile(this)" multiple></label>
        </div>
      </div>
      <div class="breadcrumb" id="fileBreadcrumb"></div>
      <div id="fileList"></div>
    </div>
  `;
  loadFiles('/');
}

async function loadFiles(dirPath) {
  currentPath = dirPath;
  const list = document.getElementById('fileList');
  list.innerHTML = '<div style="text-align:center;padding:2rem;"><div class="spinner"></div></div>';

  try {
    const data = await api(`/files/list?path=${encodeURIComponent(dirPath)}`);

    // Breadcrumb
    const parts = dirPath.split('/').filter(Boolean);
    document.getElementById('fileBreadcrumb').innerHTML = `
      <span class="breadcrumb-item" onclick="loadFiles('/')">/</span>
      ${parts.map((p, i) => `
        <span class="breadcrumb-sep">›</span>
        <span class="breadcrumb-item" onclick="loadFiles('${parts.slice(0, i + 1).join('/')}')">${escapeHtml(p)}</span>
      `).join('')}
    `;

    list.innerHTML = `
      <div class="table-wrapper">
        <table class="table">
          <thead><tr><th>Name</th><th>Size</th><th>Modified</th><th>Permissions</th><th>Actions</th></tr></thead>
          <tbody>
            ${dirPath !== '/' ? `<tr><td colspan="5"><a style="cursor:pointer;color:var(--primary-400);" onclick="loadFiles('${escapeHtml(data.parent)}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><path d="M15 18l-6-6 6-6"/></svg> Parent Directory</a></td></tr>` : ''}
            ${data.files.map(f => `
              <tr ondblclick="${f.isDirectory ? `loadFiles('${escapeHtml(f.path)}')` : `editFile('${escapeHtml(f.path)}')`}" style="cursor:pointer;">
                <td>
                  <div style="display:flex;align-items:center;gap:0.5rem;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${f.isDirectory ? '#f59e0b' : '#60a5fa'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      ${f.isDirectory ? '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>' : '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>'}
                    </svg>
                    <span style="font-weight:500;color:var(--text-primary);">${escapeHtml(f.name)}</span>
                  </div>
                </td>
                <td style="font-size:var(--text-xs);">${f.isDirectory ? '-' : formatBytes(f.size)}</td>
                <td style="font-size:var(--text-xs);color:var(--text-muted);">${f.modified ? new Date(f.modified).toLocaleString() : '-'}</td>
                <td style="font-family:var(--font-mono);font-size:var(--text-xs);">${f.permissions || '-'}</td>
                <td>
                  <div style="display:flex;gap:4px;" onclick="event.stopPropagation()">
                    ${!f.isDirectory ? `<button class="btn btn-sm btn-ghost" onclick="editFile('${escapeHtml(f.path)}')" title="Edit"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>` : ''}
                    <button class="btn btn-sm btn-ghost" onclick="renameItem('${escapeHtml(f.path)}')" title="Rename"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                    <button class="btn btn-sm btn-danger" onclick="deleteFile('${escapeHtml(f.path)}')" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (e) {
    list.innerHTML = `<div class="empty-state"><h3>Error loading directory</h3><p>${escapeHtml(e.message)}</p></div>`;
  }
}

async function editFile(path) {
  try {
    const data = await api(`/files/read?path=${encodeURIComponent(path)}`);
    showModal(`Edit: ${path.split('/').pop()}`, `
      <textarea class="form-textarea" id="fileContent" style="min-height:400px;font-family:var(--font-mono);font-size:var(--text-xs);tab-size:2;" spellcheck="false">${escapeHtml(data.content)}</textarea>
      <div class="modal-footer" style="border:none;padding:0;"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveFile('${escapeHtml(path)}')">Save File</button></div>
    `);
    // Tab key support
    document.getElementById('fileContent').addEventListener('keydown', function(e) {
      if (e.key === 'Tab') { e.preventDefault(); const s = this.selectionStart; this.value = this.value.substring(0, s) + '\t' + this.value.substring(this.selectionEnd); this.selectionStart = this.selectionEnd = s + 1; }
    });
  } catch (e) { showToast('Failed to read file', 'error'); }
}

async function saveFile(path) {
  try {
    await api('/files/write', { method: 'POST', body: JSON.stringify({ path, content: document.getElementById('fileContent').value }) });
    closeModal(); showToast('File saved!', 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

async function deleteFile(path) {
  if (!confirm(`Delete ${path}?`)) return;
  try { await api(`/files/delete?path=${encodeURIComponent(path)}`, { method: 'DELETE' }); showToast('Deleted', 'success'); loadFiles(currentPath); } catch (e) { showToast(e.message, 'error'); }
}

function showNewFolderModal() {
  showModal('New Folder', `
    <form onsubmit="createFolder(event)">
      <div class="form-group"><label class="form-label">Folder Name</label><input type="text" class="form-input" id="folderName" required></div>
      <div class="modal-footer" style="border:none;padding:0;"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button type="submit" class="btn btn-primary">Create</button></div>
    </form>
  `);
}

async function createFolder(e) {
  e.preventDefault();
  const name = document.getElementById('folderName').value;
  try { await api('/files/mkdir', { method: 'POST', body: JSON.stringify({ path: currentPath + '/' + name }) }); closeModal(); showToast('Folder created', 'success'); loadFiles(currentPath); } catch (e) { showToast(e.message, 'error'); }
}

async function renameItem(path) {
  const oldName = path.split('/').pop();
  showModal('Rename', `
    <form onsubmit="doRename(event, '${escapeHtml(path)}')">
      <div class="form-group"><label class="form-label">New Name</label><input type="text" class="form-input" id="newName" value="${escapeHtml(oldName)}" required></div>
      <div class="modal-footer" style="border:none;padding:0;"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button type="submit" class="btn btn-primary">Rename</button></div>
    </form>
  `);
}

async function doRename(e, oldPath) {
  e.preventDefault();
  const dir = oldPath.substring(0, oldPath.lastIndexOf('/'));
  const newPath = dir + '/' + document.getElementById('newName').value;
  try { await api('/files/rename', { method: 'POST', body: JSON.stringify({ oldPath, newPath }) }); closeModal(); showToast('Renamed', 'success'); loadFiles(currentPath); } catch (e) { showToast(e.message, 'error'); }
}

async function uploadFile(input) {
  const formData = new FormData();
  formData.append('path', currentPath);
  for (const file of input.files) formData.append('file', file);

  try {
    const res = await fetch('/api/files/upload', { method: 'POST', headers: { 'Authorization': `Bearer ${GP.token}` }, body: formData });
    if (res.ok) { showToast('File uploaded!', 'success'); loadFiles(currentPath); } else { showToast('Upload failed', 'error'); }
  } catch (e) { showToast('Upload error', 'error'); }
  input.value = '';
}

// ============================================================
// TERMINAL (WebSocket-based)
// ============================================================
function renderTerminal(el) {
  el.innerHTML = `
    <div class="page-transition">
      <div class="page-header"><h1>Terminal</h1><p>Web-based terminal access</p></div>
      <div class="card" style="padding:0;overflow:hidden;">
        <div id="terminal" style="height:calc(100vh - 220px);min-height:400px;background:#0d1117;"></div>
      </div>
    </div>
  `;

  // Load xterm.js from CDN
  if (!window.Terminal) {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdn.jsdelivr.net/npm/@xterm/xterm@5.3.0/css/xterm.min.css';
    document.head.appendChild(css);

    const script1 = document.createElement('script');
    script1.src = 'https://cdn.jsdelivr.net/npm/@xterm/xterm@5.3.0/lib/xterm.min.js';
    script1.onload = () => {
      const script2 = document.createElement('script');
      script2.src = 'https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.8.0/lib/addon-fit.min.js';
      script2.onload = initTerminal;
      document.head.appendChild(script2);
    };
    document.head.appendChild(script1);
  } else {
    initTerminal();
  }
}

function initTerminal() {
  const container = document.getElementById('terminal');
  if (!container || !window.Terminal) return;

  const terminal = new Terminal({
    theme: {
      background: '#0d1117',
      foreground: '#c9d1d9',
      cursor: '#58a6ff',
      cursorAccent: '#0d1117',
      selectionBackground: 'rgba(56,139,253,0.3)',
      black: '#484f58',
      red: '#ff7b72',
      green: '#3fb950',
      yellow: '#d29922',
      blue: '#58a6ff',
      magenta: '#bc8cff',
      cyan: '#39c5cf',
      white: '#b1bac4',
      brightBlack: '#6e7681',
      brightRed: '#ffa198',
      brightGreen: '#56d364',
      brightYellow: '#e3b341',
      brightBlue: '#79c0ff',
      brightMagenta: '#d2a8ff',
      brightCyan: '#56d4dd',
      brightWhite: '#f0f6fc'
    },
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    fontSize: 14,
    cursorBlink: true,
    cursorStyle: 'bar'
  });

  if (window.FitAddon) {
    const fitAddon = new FitAddon.FitAddon();
    terminal.loadAddon(fitAddon);
    fitAddon.fit();
    window.addEventListener('resize', () => fitAddon.fit());
  }

  terminal.open(container);

  // WebSocket connection
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${location.host}/terminal`);
  let termBuffer = '';

  terminal.onData(data => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data }));
    }
  });

  ws.onopen = () => {
    terminal.writeln('\r\n\x1b[1;36m   ╔════════════════════════════════════════╗\x1b[0m');
    terminal.writeln('\x1b[1;36m   ║      GravitPanel Web Terminal          ║\x1b[0m');
    terminal.writeln('\x1b[1;36m   ╚════════════════════════════════════════╝\x1b[0m\r\n');
  };

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'output') {
        terminal.write(msg.data);
      } else if (msg.type === 'error') {
        terminal.writeln('\r\n\x1b[31m[Error] ' + msg.data + '\x1b[0m');
      }
    } catch (err) {}
  };

  ws.onclose = () => {
    terminal.writeln('\r\n\x1b[31m[Connection closed]\x1b[0m');
  };

  terminal.focus();
}

// ============================================================
// FTP
// ============================================================
async function renderFTP(el) {
  el.innerHTML = `
    <div class="page-transition">
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:start;">
        <div><h1>FTP Accounts</h1><p>Manage FTP server accounts</p></div>
        <button class="btn btn-primary" onclick="showAddFTPModal()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add FTP Account</button>
      </div>
      <div id="ftpList"></div>
    </div>
  `;
  loadFTP();
}

async function loadFTP() {
  try {
    const data = await api('/ftp');
    const list = document.getElementById('ftpList');
    if (!data.accounts.length) {
      list.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg><h3>No FTP accounts</h3><p>Create an FTP account for file access</p><button class="btn btn-primary" onclick="showAddFTPModal()">Add FTP Account</button></div>`;
      return;
    }
    list.innerHTML = `
      <div class="table-wrapper"><table class="table"><thead><tr><th>Username</th><th>Home Directory</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${data.accounts.map(a => `<tr><td style="font-weight:600;">${escapeHtml(a.username)}</td><td class="font-mono" style="font-size:var(--text-xs);">${escapeHtml(a.home_dir)}</td>
          <td><span class="badge ${a.status === 'active' ? 'badge-success' : 'badge-danger'}">${a.status}</span></td>
          <td><div style="display:flex;gap:4px;"><button class="btn btn-sm btn-ghost" onclick="toggleFTP(${a.id})">Toggle</button><button class="btn btn-sm btn-danger" onclick="deleteFTP(${a.id})">Delete</button></div></td></tr>`).join('')}</tbody></table></div>
    `;
  } catch (e) { document.getElementById('ftpList').innerHTML = `<p class="text-muted">Unable to load FTP accounts</p>`; }
}

function showAddFTPModal() {
  showModal('Add FTP Account', `
    <form onsubmit="createFTP(event)">
      <div class="form-group"><label class="form-label">Username</label><input type="text" class="form-input" id="ftpUser" required></div>
      <div class="form-group"><label class="form-label">Password</label><input type="text" class="form-input" id="ftpPass" required></div>
      <div class="form-group"><label class="form-label">Home Directory</label><input type="text" class="form-input" id="ftpHome" placeholder="/var/ftp/user"></div>
      <div class="modal-footer" style="border:none;padding:0;"><button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button><button type="submit" class="btn btn-primary">Create</button></div>
    </form>
  `);
}

async function createFTP(e) {
  e.preventDefault();
  try { await api('/ftp', { method: 'POST', body: JSON.stringify({ username: document.getElementById('ftpUser').value, password: document.getElementById('ftpPass').value, home_dir: document.getElementById('ftpHome').value }) }); closeModal(); showToast('FTP account created', 'success'); loadFTP(); } catch (err) { showToast(err.message, 'error'); }
}

async function toggleFTP(id) { try { await api(`/ftp/${id}/toggle`, { method: 'PUT' }); loadFTP(); } catch (e) { showToast(e.message, 'error'); } }
async function deleteFTP(id) { if (!confirm('Delete FTP account?')) return; try { await api(`/ftp/${id}`, { method: 'DELETE' }); showToast('Deleted', 'success'); loadFTP(); } catch (e) { showToast(e.message, 'error'); } }

// ============================================================
// CRON JOBS
// ============================================================
async function renderCron(el) {
  el.innerHTML = `
    <div class="page-transition">
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:start;">
        <div><h1>Cron Jobs</h1><p>Schedule and manage recurring tasks</p></div>
        <button class="btn btn-primary" onclick="showAddCronModal()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add Cron Job</button>
      </div>
      <div id="cronList"></div>
    </div>
  `;
  loadCron();
}

async function loadCron() {
  try {
    const data = await api('/cron');
    const list = document.getElementById('cronList');
    if (!data.jobs.length) {
      list.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><h3>No cron jobs</h3><p>Schedule tasks to run automatically</p><button class="btn btn-primary" onclick="showAddCronModal()">Add Cron Job</button></div>`;
      return;
    }
    list.innerHTML = `<div class="table-wrapper"><table class="table"><thead><tr><th>Name</th><th>Schedule</th><th>Command</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${data.jobs.map(j => `<tr><td style="font-weight:600;">${escapeHtml(j.name)}</td><td class="font-mono" style="font-size:var(--text-xs);">${escapeHtml(j.schedule)}</td><td class="font-mono truncate" style="font-size:var(--text-xs);max-width:250px;">${escapeHtml(j.command)}</td>
        <td><span class="badge ${j.status === 'active' ? 'badge-success' : 'badge-danger'}">${j.status}</span></td>
        <td><div style="display:flex;gap:4px;"><button class="btn btn-sm btn-success" onclick="runCron(${j.id})" title="Run Now"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg></button><button class="btn btn-sm btn-ghost" onclick="toggleCron(${j.id})">Toggle</button><button class="btn btn-sm btn-danger" onclick="deleteCron(${j.id})">Delete</button></div></td></tr>`).join('')}</tbody></table></div>`;
  } catch (e) { document.getElementById('cronList').innerHTML = `<p class="text-muted">Error loading cron jobs</p>`; }
}

function showAddCronModal() {
  showModal('Add Cron Job', `
    <form onsubmit="createCron(event)">
      <div class="form-group"><label class="form-label">Name</label><input type="text" class="form-input" id="cronName" placeholder="My backup job" required></div>
      <div class="form-group"><label class="form-label">Command</label><input type="text" class="form-input font-mono" id="cronCmd" placeholder="/path/to/script.sh" required></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Minute</label><input type="text" class="form-input" id="cronMin" value="0" placeholder="0-59"></div>
        <div class="form-group"><label class="form-label">Hour</label><input type="text" class="form-input" id="cronHour" value="*" placeholder="0-23"></div>
        <div class="form-group"><label class="form-label">Day</label><input type="text" class="form-input" id="cronDay" value="*" placeholder="1-31"></div>
        <div class="form-group"><label class="form-label">Month</label><input type="text" class="form-input" id="cronMonth" value="*" placeholder="1-12"></div>
        <div class="form-group"><label class="form-label">Weekday</label><input type="text" class="form-input" id="cronWeek" value="*" placeholder="0-7"></div>
      </div>
      <div class="modal-footer" style="border:none;padding:0;"><button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button><button type="submit" class="btn btn-primary">Create</button></div>
    </form>
  `);
}

async function createCron(e) {
  e.preventDefault();
  try { await api('/cron', { method: 'POST', body: JSON.stringify({ name: document.getElementById('cronName').value, command: document.getElementById('cronCmd').value, minute: document.getElementById('cronMin').value, hour: document.getElementById('cronHour').value, day: document.getElementById('cronDay').value, month: document.getElementById('cronMonth').value, weekday: document.getElementById('cronWeek').value }) }); closeModal(); showToast('Cron job created', 'success'); loadCron(); } catch (err) { showToast(err.message, 'error'); }
}

async function runCron(id) { try { await api(`/cron/${id}/run`, { method: 'POST' }); showToast('Job executed', 'success'); } catch (e) { showToast(e.message, 'error'); } }
async function toggleCron(id) { try { await api(`/cron/${id}/toggle`, { method: 'PUT' }); loadCron(); } catch (e) { showToast(e.message, 'error'); } }
async function deleteCron(id) { if (!confirm('Delete this cron job?')) return; try { await api(`/cron/${id}`, { method: 'DELETE' }); showToast('Deleted', 'success'); loadCron(); } catch (e) { showToast(e.message, 'error'); } }

// ============================================================
// DOCKER
// ============================================================
async function renderDocker(el) {
  el.innerHTML = `
    <div class="page-transition">
      <div class="page-header"><h1>Docker Management</h1><p>Manage containers, images, and volumes</p></div>
      <div class="tabs">
        <button class="tab active" onclick="loadDockerTab('containers', this)">Containers</button>
        <button class="tab" onclick="loadDockerTab('images', this)">Images</button>
        <button class="tab" onclick="loadDockerTab('volumes', this)">Volumes</button>
      </div>
      <div id="dockerContent"></div>
    </div>
  `;
  loadDockerTab('containers', document.querySelector('.tab.active'));
}

async function loadDockerTab(tab, btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const el = document.getElementById('dockerContent');
  el.innerHTML = '<div style="text-align:center;padding:2rem;"><div class="spinner"></div></div>';

  try {
    if (tab === 'containers') {
      const data = await api('/docker/containers');
      if (!data.containers.length) { el.innerHTML = '<div class="empty-state"><h3>No containers</h3><p>No Docker containers found</p></div>'; return; }
      el.innerHTML = `<div class="table-wrapper"><table class="table"><thead><tr><th>Name</th><th>Image</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${data.containers.map(c => `<tr><td style="font-weight:600;">${escapeHtml(c.name)}</td><td class="font-mono" style="font-size:var(--text-xs);">${escapeHtml(c.image)}</td>
          <td><span class="badge ${c.running ? 'badge-success' : 'badge-danger'}">${c.running ? 'Running' : 'Stopped'}</span></td>
          <td><div style="display:flex;gap:4px;">
            ${c.running ? `<button class="btn btn-sm btn-warning" onclick="dockerAction('containers','${c.id}','stop')">Stop</button>` : `<button class="btn btn-sm btn-success" onclick="dockerAction('containers','${c.id}','start')">Start</button>`}
            <button class="btn btn-sm btn-ghost" onclick="dockerAction('containers','${c.id}','restart')">Restart</button>
            <button class="btn btn-sm btn-danger" onclick="dockerAction('containers','${c.id}','delete')">Remove</button>
          </div></td></tr>`).join('')}</tbody></table></div>`;
    } else if (tab === 'images') {
      const data = await api('/docker/images');
      if (!data.images.length) { el.innerHTML = '<div class="empty-state"><h3>No images</h3></div>'; return; }
      el.innerHTML = `<div class="table-wrapper"><table class="table"><thead><tr><th>Repository</th><th>ID</th><th>Size</th><th>Created</th><th>Actions</th></tr></thead>
        <tbody>${data.images.map(i => `<tr><td style="font-weight:500;">${escapeHtml(i.repo)}</td><td class="font-mono" style="font-size:var(--text-xs);">${escapeHtml(i.id)}</td><td>${i.size}</td><td>${i.created}</td>
          <td><button class="btn btn-sm btn-danger" onclick="dockerAction('images','${i.id}','delete')">Remove</button></td></tr>`).join('')}</tbody></table></div>`;
    } else if (tab === 'volumes') {
      const data = await api('/docker/volumes');
      if (!data.volumes.length) { el.innerHTML = '<div class="empty-state"><h3>No volumes</h3></div>'; return; }
      el.innerHTML = `<div class="table-wrapper"><table class="table"><thead><tr><th>Name</th><th>Driver</th></tr></thead>
        <tbody>${data.volumes.map(v => `<tr><td style="font-weight:500;">${escapeHtml(v.name)}</td><td>${v.driver}</td></tr>`).join('')}</tbody></table></div>`;
    }
  } catch (e) { el.innerHTML = `<div class="empty-state"><h3>Docker not available</h3><p>${escapeHtml(e.message)}</p><p style="margin-top:0.5rem;">Install Docker from the App Store</p></div>`; }
}

async function dockerAction(type, id, action) {
  try {
    if (action === 'delete') {
      if (!confirm('Are you sure?')) return;
      await api(`/${type}/${id}`, { method: 'DELETE' });
    } else {
      await api(`/${type}/${id}/${action}`, { method: 'POST' });
    }
    showToast('Action completed', 'success');
    const activeTab = document.querySelector('.tab.active');
    loadDockerTab(activeTab?.textContent.toLowerCase() || 'containers', activeTab);
  } catch (e) { showToast(e.message, 'error'); }
}

// ============================================================
// SECURITY
// ============================================================
async function renderSecurity(el) {
  el.innerHTML = `
    <div class="page-transition">
      <div class="page-header"><h1>Firewall & Security</h1><p>Manage firewall rules, SSL certificates, and SSH</p></div>
      <div class="grid grid-2">
        <div class="card" id="firewallCard"><h3 class="card-title" style="margin-bottom:1rem;">🔥 Firewall (UFW)</h3><div id="fwContent"><div class="spinner"></div></div></div>
        <div class="card" id="sslCard"><h3 class="card-title" style="margin-bottom:1rem;">🔒 SSL Certificates</h3><div id="sslContent"><div class="spinner"></div></div></div>
      </div>
      <div class="card" style="margin-top:1.5rem;" id="sshCard"><h3 class="card-title" style="margin-bottom:1rem;">🔐 SSH & Security</h3><div id="sshContent"><div class="spinner"></div></div></div>
    </div>
  `;
  loadSecurity();
}

async function loadSecurity() {
  try {
    const data = await api('/security/status');

    // Firewall
    document.getElementById('fwContent').innerHTML = `
      <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1rem;">
        <span class="status-dot ${data.firewall.enabled ? 'online' : 'offline'}"></span>
        <span style="font-weight:500;">${data.firewall.enabled ? 'Active' : 'Inactive'}</span>
        <button class="btn btn-sm ${data.firewall.enabled ? 'btn-danger' : 'btn-success'}" onclick="toggleFirewall(${data.firewall.enabled})">
          ${data.firewall.enabled ? 'Disable' : 'Enable'}
        </button>
      </div>
      <button class="btn btn-primary btn-sm" onclick="showAddFWRuleModal()" style="margin-bottom:1rem;">Add Rule</button>
      ${data.firewall.rules.length ? `
        <div class="table-wrapper"><table class="table"><thead><tr><th>Port</th><th>Protocol</th><th>Action</th><th>Description</th><th></th></tr></thead>
          <tbody>${data.firewall.rules.map(r => `<tr><td class="font-mono">${escapeHtml(r.port)}</td><td>${escapeHtml(r.protocol)}</td><td><span class="badge ${r.action === 'allow' ? 'badge-success' : 'badge-danger'}">${r.action}</span></td><td>${escapeHtml(r.description || '-')}</td><td><button class="btn btn-sm btn-danger" onclick="deleteFWRule(${r.id})">×</button></td></tr>`).join('')}</tbody></table></div>
      ` : '<p class="text-muted">No custom rules</p>'}
    `;

    // SSL
    document.getElementById('sslContent').innerHTML = `
      <button class="btn btn-primary btn-sm" onclick="showObtainSSLModal()" style="margin-bottom:1rem;">Obtain SSL Certificate</button>
      <button class="btn btn-secondary btn-sm" onclick="renewSSL()" style="margin-bottom:1rem;">Renew All</button>
      ${data.firewall.rules.length ? '<p class="text-muted">SSL certificates are managed per website. Go to Websites to enable SSL.</p>' : ''}
      <p class="text-muted" style="margin-top:0.5rem;">Use Certbot to obtain free SSL certificates from Let's Encrypt.</p>
    `;

    // SSH
    document.getElementById('sshContent').innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div style="padding:1rem;background:rgba(15,23,42,0.4);border-radius:var(--radius-md);">
          <div style="font-weight:500;margin-bottom:0.5rem;">SSH Port: <span class="font-mono" style="color:var(--primary-400);">${data.ssh.port}</span></div>
          <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
            <input type="number" class="form-input" id="sshPort" value="${data.ssh.port}" style="width:120px;">
            <button class="btn btn-sm btn-primary" onclick="changeSSHPort()">Change</button>
          </div>
        </div>
        <div style="padding:1rem;background:rgba(15,23,42,0.4);border-radius:var(--radius-md);">
          <div style="font-weight:500;margin-bottom:0.5rem;">Fail2Ban: <span class="badge ${data.fail2ban.enabled ? 'badge-success' : 'badge-danger'}">${data.fail2ban.enabled ? 'Active' : 'Inactive'}</span></div>
          <button class="btn btn-sm ${data.fail2ban.enabled ? 'btn-danger' : 'btn-success'}" style="margin-top:0.5rem;" onclick="toggleFail2Ban(${data.fail2ban.enabled})">${data.fail2ban.enabled ? 'Disable' : 'Enable'} Fail2Ban</button>
        </div>
      </div>
      ${data.openPorts.length ? `
        <h4 style="margin-top:1.5rem;margin-bottom:0.75rem;">Open Ports</h4>
        <div class="table-wrapper"><table class="table"><thead><tr><th>Address</th><th>Process</th></tr></thead>
          <tbody>${data.openPorts.slice(0, 15).map(p => `<tr><td class="font-mono" style="font-size:var(--text-xs);">${escapeHtml(p.address)}</td><td style="font-size:var(--text-xs);">${escapeHtml(p.process)}</td></tr>`).join('')}</tbody></table></div>
      ` : ''}
    `;
  } catch (e) {
    document.getElementById('fwContent').innerHTML = '<p class="text-muted">Failed to load firewall status</p>';
  }
}

async function toggleFirewall(enabled) {
  try {
    await api(`/security/firewall/${enabled ? 'disable' : 'enable'}`, { method: 'POST' });
    showToast(`Firewall ${enabled ? 'disabled' : 'enabled'}`, 'success');
    loadSecurity();
  } catch (e) { showToast(e.message, 'error'); }
}

function showAddFWRuleModal() {
  showModal('Add Firewall Rule', `
    <form onsubmit="createFWRule(event)">
      <div class="form-group"><label class="form-label">Port</label><input type="text" class="form-input" id="fwPort" placeholder="80,443 or 8000:9000" required></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Protocol</label><select class="form-select" id="fwProto"><option value="tcp">TCP</option><option value="udp">UDP</option><option value="both">Both</option></select></div>
        <div class="form-group"><label class="form-label">Action</label><select class="form-select" id="fwAction"><option value="allow">Allow</option><option value="deny">Deny</option></select></div>
      </div>
      <div class="form-group"><label class="form-label">Source IP (optional)</label><input type="text" class="form-input" id="fwIP" placeholder="Leave empty for all"></div>
      <div class="form-group"><label class="form-label">Description</label><input type="text" class="form-input" id="fwDesc" placeholder="Description"></div>
      <div class="modal-footer" style="border:none;padding:0;"><button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button><button type="submit" class="btn btn-primary">Add Rule</button></div>
    </form>
  `);
}

async function createFWRule(e) {
  e.preventDefault();
  try {
    await api('/security/firewall/rules', { method: 'POST', body: JSON.stringify({ port: document.getElementById('fwPort').value, protocol: document.getElementById('fwProto').value, action: document.getElementById('fwAction').value, source_ip: document.getElementById('fwIP').value, description: document.getElementById('fwDesc').value }) });
    closeModal(); showToast('Rule added', 'success'); loadSecurity();
  } catch (err) { showToast(err.message, 'error'); }
}

async function deleteFWRule(id) { if (!confirm('Delete rule?')) return; try { await api(`/security/firewall/rules/${id}`, { method: 'DELETE' }); showToast('Deleted', 'success'); loadSecurity(); } catch (e) { showToast(e.message, 'error'); } }

function showObtainSSLModal() {
  showModal('Obtain SSL Certificate', `
    <form onsubmit="obtainSSL(event)">
      <div class="form-group"><label class="form-label">Domain</label><input type="text" class="form-input" id="sslDomain" placeholder="example.com" required><div class="form-helper">Domain must point to this server's IP</div></div>
      <div class="modal-footer" style="border:none;padding:0;"><button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button><button type="submit" class="btn btn-primary">Obtain Certificate</button></div>
    </form>
  `);
}

async function obtainSSL(e) { e.preventDefault(); try { showToast('Obtaining certificate...', 'info'); await api('/security/ssl/obtain', { method: 'POST', body: JSON.stringify({ domain: document.getElementById('sslDomain').value }) }); closeModal(); showToast('SSL certificate obtained!', 'success'); } catch (err) { showToast(err.message, 'error'); } }
async function renewSSL() { try { showToast('Renewing certificates...', 'info'); await api('/security/ssl/renew', { method: 'POST' }); showToast('Certificates renewed', 'success'); } catch (e) { showToast(e.message, 'error'); } }
async function changeSSHPort() { const port = document.getElementById('sshPort').value; if (!confirm(`Change SSH port to ${port}? Make sure to update your SSH client.`)) return; try { await api('/security/ssh/port', { method: 'POST', body: JSON.stringify({ port }) }); showToast('SSH port changed', 'success'); } catch (e) { showToast(e.message, 'error'); } }
async function toggleFail2Ban(enabled) { try { await api(`/security/fail2ban/${enabled ? 'disable' : 'enable'}`, { method: 'POST' }); showToast(`Fail2Ban ${enabled ? 'disabled' : 'enabled'}`, 'success'); loadSecurity(); } catch (e) { showToast(e.message, 'error'); } }

// ============================================================
// LOGS
// ============================================================
async function renderLogs(el) {
  el.innerHTML = `
    <div class="page-transition">
      <div class="page-header"><h1>Log Viewer</h1><p>View system and application logs</p></div>
      <div class="tabs" id="logTabs">
        <button class="tab active" onclick="loadLog('nginx_access', this)">Nginx Access</button>
        <button class="tab" onclick="loadLog('nginx_error', this)">Nginx Error</button>
        <button class="tab" onclick="loadLog('auth', this)">Auth</button>
        <button class="tab" onclick="loadLog('syslog', this)">Syslog</button>
        <button class="tab" onclick="loadLog('cron', this)">Cron</button>
      </div>
      <div style="display:flex;gap:0.5rem;margin-bottom:1rem;">
        <select class="form-select" id="logLines" style="width:120px;" onchange="loadLog(document.querySelector('#logTabs .tab.active').textContent.toLowerCase().replace(/ /g,'_').replace('nginx_',''), document.querySelector('#logTabs .tab.active'))">
          <option value="50">50 lines</option>
          <option value="100" selected>100 lines</option>
          <option value="200">200 lines</option>
          <option value="500">500 lines</option>
        </select>
        <button class="btn btn-sm btn-ghost" onclick="loadLog(document.querySelector('#logTabs .tab.active').textContent.toLowerCase().replace(/ /g,'_').replace('nginx_',''), document.querySelector('#logTabs .tab.active'))">Refresh</button>
      </div>
      <div id="logContent" class="log-viewer">Loading...</div>
    </div>
  `;
  loadLog('nginx_access', document.querySelector('.tab.active'));
}

async function loadLog(type, btn) {
  document.querySelectorAll('#logTabs .tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const lines = document.getElementById('logLines').value;
  const el = document.getElementById('logContent');
  el.textContent = 'Loading...';

  try {
    const data = await api(`/logs?type=${type}&lines=${lines}`);
    el.textContent = data.logs || 'No logs available';
    el.scrollTop = el.scrollHeight;
  } catch (e) { el.textContent = 'Failed to load logs: ' + e.message; }
}

// ============================================================
// APP STORE
// ============================================================
async function renderApps(el) {
  el.innerHTML = `
    <div class="page-transition">
      <div class="page-header"><h1>App Store</h1><p>Install and manage server applications with one click</p></div>
      <div class="tabs" id="appTabs">
        <button class="tab active" onclick="filterApps('all', this)">All</button>
        <button class="tab" onclick="filterApps('Web Server', this)">Web Servers</button>
        <button class="tab" onclick="filterApps('Database', this)">Databases</button>
        <button class="tab" onclick="filterApps('Runtime', this)">Runtimes</button>
        <button class="tab" onclick="filterApps('Tools', this)">Tools</button>
        <button class="tab" onclick="filterApps('Container', this)">Containers</button>
      </div>
      <div id="appGrid" class="grid grid-4"></div>
    </div>
  `;
  loadApps();
}

let allApps = [];

async function loadApps() {
  try {
    const data = await api('/apps');
    allApps = data.apps;
    renderAppGrid(allApps);
  } catch (e) { document.getElementById('appGrid').innerHTML = '<p class="text-muted">Failed to load apps</p>'; }
}

function renderAppGrid(apps) {
  const el = document.getElementById('appGrid');
  el.innerHTML = apps.map((app, i) => `
    <div class="card stagger-item" style="text-align:center;padding:1.5rem 1rem;" data-category="${app.category}">
      <div style="width:48px;height:48px;margin:0 auto 1rem;background:${app.installed ? 'var(--gradient-success)' : 'var(--gradient-primary)'};border-radius:var(--radius-md);display:flex;align-items:center;justify-content:center;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
      </div>
      <h4 style="font-size:var(--text-sm);margin-bottom:0.25rem;">${escapeHtml(app.name)}</h4>
      <span class="badge ${app.installed ? 'badge-success' : 'badge-neutral'}" style="margin-bottom:1rem;">${app.installed ? 'Installed' : app.category}</span>
      <button class="btn btn-sm ${app.installed ? 'btn-danger' : 'btn-primary'} btn-block" onclick="${app.installed ? `uninstallApp('${app.id}')` : `installApp('${app.id}')`}" ${app.installed && ['nginx','mysql','php','nodejs'].includes(app.id) ? 'disabled title="System package - use with caution"' : ''}>
        ${app.installed ? 'Uninstall' : 'Install'}
      </button>
    </div>
  `).join('');
}

function filterApps(category, btn) {
  document.querySelectorAll('#appTabs .tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const filtered = category === 'all' ? allApps : allApps.filter(a => a.category === category);
  renderAppGrid(filtered);
}

async function installApp(id) {
  if (!confirm(`Install ${id}? This may take a few minutes.`)) return;
  showToast(`Installing ${id}... This may take a while.`, 'info');
  try {
    await api(`/apps/${id}/install`, { method: 'POST' });
    showToast(`${id} installed successfully!`, 'success');
    loadApps();
  } catch (e) { showToast(`Failed: ${e.message}`, 'error'); }
}

async function uninstallApp(id) {
  if (!confirm(`Uninstall ${id}?`)) return;
  try { await api(`/apps/${id}/uninstall`, { method: 'POST' }); showToast(`${id} uninstalled`, 'success'); loadApps(); } catch (e) { showToast(e.message, 'error'); }
}

// ============================================================
// BACKUPS
// ============================================================
async function renderBackups(el) {
  el.innerHTML = `
    <div class="page-transition">
      <div class="page-header"><h1>Backups</h1><p>Backup and restore your data</p></div>
      <div class="grid grid-2" style="margin-bottom:1.5rem;">
        <div class="card"><h4 class="card-title" style="margin-bottom:1rem;">Website Backup</h4>
          <form onsubmit="backupWebsite(event)" style="display:flex;gap:0.5rem;">
            <select class="form-select" id="backupSite" style="flex:1;"></select>
            <button type="submit" class="btn btn-primary">Backup</button>
          </form>
        </div>
        <div class="card"><h4 class="card-title" style="margin-bottom:1rem;">Database Backup</h4>
          <form onsubmit="backupDatabase(event)" style="display:flex;gap:0.5rem;">
            <select class="form-select" id="backupDB" style="flex:1;"></select>
            <button type="submit" class="btn btn-primary">Backup</button>
          </form>
        </div>
      </div>
      <h3 style="margin-bottom:1rem;">Backup History</h3>
      <div id="backupList"></div>
    </div>
  `;
  loadBackups();
}

async function loadBackups() {
  try {
    const [backupData, siteData, dbData] = await Promise.all([api('/backups'), api('/websites'), api('/databases')]);

    // Populate selects
    const siteSelect = document.getElementById('backupSite');
    if (siteSelect) siteSelect.innerHTML = siteData.websites.map(w => `<option value="${w.id}">${escapeHtml(w.domain)}</option>`).join('') || '<option>No websites</option>';

    const dbSelect = document.getElementById('backupDB');
    if (dbSelect) dbSelect.innerHTML = dbData.databases.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('') || '<option>No databases</option>';

    const list = document.getElementById('backupList');
    if (!backupData.backups.length) {
      list.innerHTML = '<p class="text-muted">No backups yet</p>';
      return;
    }
    list.innerHTML = `<div class="table-wrapper"><table class="table"><thead><tr><th>Type</th><th>Target</th><th>Size</th><th>Created</th><th>Actions</th></tr></thead>
      <tbody>${backupData.backups.map(b => `<tr>
        <td><span class="badge ${b.type === 'website' ? 'badge-info' : 'badge-success'}">${b.type}</span></td>
        <td style="font-weight:500;">${escapeHtml(b.target)}</td>
        <td>${formatBytes(b.file_size)}</td>
        <td style="font-size:var(--text-xs);">${new Date(b.created_at).toLocaleString()}</td>
        <td><div style="display:flex;gap:4px;">
          <a href="/api/backups/download/${b.id}" class="btn btn-sm btn-ghost" download>Download</a>
          <button class="btn btn-sm btn-danger" onclick="deleteBackup(${b.id})">Delete</button>
        </div></td></tr>`).join('')}</tbody></table></div>`;
  } catch (e) { document.getElementById('backupList').innerHTML = '<p class="text-muted">Error loading backups</p>'; }
}

async function backupWebsite(e) {
  e.preventDefault();
  try { showToast('Creating backup...', 'info'); await api('/backups/website', { method: 'POST', body: JSON.stringify({ website_id: document.getElementById('backupSite').value }) }); showToast('Backup created!', 'success'); loadBackups(); } catch (err) { showToast(err.message, 'error'); }
}

async function backupDatabase(e) {
  e.preventDefault();
  try { showToast('Creating backup...', 'info'); await api('/backups/database', { method: 'POST', body: JSON.stringify({ database_id: document.getElementById('backupDB').value }) }); showToast('Backup created!', 'success'); loadBackups(); } catch (err) { showToast(err.message, 'error'); }
}

async function deleteBackup(id) { if (!confirm('Delete backup?')) return; try { await api(`/backups/${id}`, { method: 'DELETE' }); showToast('Deleted', 'success'); loadBackups(); } catch (e) { showToast(e.message, 'error'); } }

// ============================================================
// SETTINGS
// ============================================================
async function renderSettings(el) {
  el.innerHTML = `
    <div class="page-transition">
      <div class="page-header"><h1>Settings</h1><p>Configure GravitPanel</p></div>
      <div class="grid grid-2">
        <div class="card">
          <h4 class="card-title" style="margin-bottom:1rem;">🔐 Change Password</h4>
          <form onsubmit="changePassword(event)">
            <div class="form-group"><label class="form-label">Current Password</label><input type="password" class="form-input" id="curPass" required></div>
            <div class="form-group"><label class="form-label">New Password</label><input type="password" class="form-input" id="newPass" required minlength="6"></div>
            <div class="form-group"><label class="form-label">Confirm New Password</label><input type="password" class="form-input" id="confirmPass" required></div>
            <button type="submit" class="btn btn-primary">Update Password</button>
          </form>
        </div>
        <div class="card">
          <h4 class="card-title" style="margin-bottom:1rem;">ℹ️ Panel Information</h4>
          <div style="display:grid;gap:0.75rem;">
            <div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid var(--border-secondary);"><span style="color:var(--text-muted);">Panel Name</span><span style="font-weight:500;">GravitPanel</span></div>
            <div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid var(--border-secondary);"><span style="color:var(--text-muted);">Version</span><span style="font-weight:500;">1.0.0</span></div>
            <div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid var(--border-secondary);"><span style="color:var(--text-muted);">Port</span><span style="font-weight:500;">8321</span></div>
            <div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid var(--border-secondary);"><span style="color:var(--text-muted);">License</span><span style="font-weight:500;">MIT</span></div>
            <div style="display:flex;justify-content:space-between;padding:0.5rem 0;"><span style="color:var(--text-muted);">Admin User</span><span style="font-weight:500;">${escapeHtml(GP.user.username || 'admin')}</span></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function changePassword(e) {
  e.preventDefault();
  const newPass = document.getElementById('newPass').value;
  const confirmPass = document.getElementById('confirmPass').value;

  if (newPass !== confirmPass) { showToast('Passwords do not match', 'error'); return; }
  if (newPass.length < 6) { showToast('Password must be at least 6 characters', 'error'); return; }

  try {
    await api('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: document.getElementById('curPass').value, newPassword: newPass })
    });
    showToast('Password updated! Please login again.', 'success');
    setTimeout(() => logout(), 2000);
  } catch (err) { showToast(err.message, 'error'); }
}

// ============================================================
// INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // Set user info
  const user = GP.user;
  if (user.username) {
    document.getElementById('userName').textContent = user.username;
    document.getElementById('userAvatar').textContent = user.username.charAt(0).toUpperCase();
  }

  // Check auth
  if (!GP.token) {
    window.location.href = '/login.html';
    return;
  }

  // Load dashboard
  navigateTo('dashboard');

  // Close modal on overlay click
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Keyboard shortcut: Escape to close modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
});
