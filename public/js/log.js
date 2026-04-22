// ── 操作日志 ─────────────────────────────────────────────────
let logPanelOpen = false;
let logData = [];
let lastLogCount = 0;

function toggleLogPanel() {
  logPanelOpen = !logPanelOpen;
  document.getElementById('log-panel').classList.toggle('open', logPanelOpen);
  if (logPanelOpen) lastLogCount = logData.length;
  updateLogBadge();
}

function updateLogBadge() {
  const unread = logData.length - lastLogCount;
  const badge = document.getElementById('log-badge');
  if (unread > 0) {
    badge.textContent = unread > 99 ? '99+' : unread;
    badge.classList.add('show');
  } else {
    badge.classList.remove('show');
  }
}

function renderLogs(logs) {
  logData = logs || [];
  const el = document.getElementById('log-list');
  if (!logData.length) { el.innerHTML = '<div class="log-empty">暂无记录</div>'; return; }
  el.innerHTML = logData.slice().reverse().map(l => {
    const t = new Date(l.time);
    const hh = String(t.getHours()).padStart(2, '0');
    const mm = String(t.getMinutes()).padStart(2, '0');
    const ss = String(t.getSeconds()).padStart(2, '0');
    return `<div class="log-item"><span class="log-time">${hh}:${mm}:${ss}</span><span class="log-action">[${l.action}]</span> <span class="log-nick">${esc(l.nickname)}</span> ${l.detail ? `<span class="log-detail">${esc(l.detail)}</span>` : ''}<span class="log-ip">${l.ip}</span></div>`;
  }).join('');
  if (logPanelOpen) {
    lastLogCount = logData.length;
    el.scrollTop = 0;
  }
  updateLogBadge();
}

// 监听操作日志
socket.on('op_log', (logs) => renderLogs(logs));
