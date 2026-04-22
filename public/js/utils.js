// ── 工具函数 ─────────────────────────────────────────────────
function fmt(ms) { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function toast(msg, type = 'info') {
  const w = document.getElementById('tw');
  const t = document.createElement('div');
  t.className = 'toast ' + type; t.textContent = msg; w.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 3500);
}
