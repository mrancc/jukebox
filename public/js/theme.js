// ── 主题切换 ─────────────────────────────────────────────────
const THEMES = ['cyber', 'aurora', 'sakura'];
const THEME_NAMES = { cyber: '赛博', aurora: '极光', sakura: '樱花' };
const THEME_ICONS = { cyber: '🔮', aurora: '🌌', sakura: '🌸' };

// 各主题对应的粒子调色板
const THEME_PALETTE = {
  cyber: ['#a78bfa', '#7c5cfc', '#c084fc', '#e879f9', '#fc5c7d', '#fb7185', '#818cf8', '#ddd6fe'],
  aurora: ['#818cf8', '#6366f1', '#a78bfa', '#f472b6', '#8b5cf6', '#c4b5fd', '#38bdf8', '#e0e7ff'],
  sakura: ['#f9a8d4', '#f472b6', '#c084fc', '#e879f9', '#fda4af', '#f0abfc', '#d946ef', '#fce7f3'],
};

// 各主题对应的 Three.js 粒子颜色
const THEME_PARTICLES = {
  cyber: {
    particle: [0.50, 0.35, 0.75],
    firefly: [0.80, 0.85, 1.0],
  },
  aurora: {
    particle: [0.40, 0.55, 0.95],
    firefly: [0.70, 0.75, 1.0],
  },
  sakura: {
    particle: [0.75, 0.50, 0.65],
    firefly: [1.0, 0.85, 0.92],
  },
};

// 点击爆炸粒子颜色
const THEME_CLICK_COLORS = {
  cyber: ['#7c5cfc', '#fc5c7d', '#43e97b', '#38f9d7', '#ffd86f', '#ff8c42'],
  aurora: ['#818cf8', '#f472b6', '#34d399', '#38bdf8', '#a78bfa', '#fbbf24'],
  sakura: ['#f9a8d4', '#c084fc', '#86efac', '#fda4af', '#e879f9', '#f472b6'],
};

let currentTheme = localStorage.getItem('jk_theme') || 'aurora';

function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('jk_theme', theme);
  const btn = document.getElementById('btn-theme');
  if (btn) btn.innerHTML = `${THEME_ICONS[theme]} <span class="theme-name">${THEME_NAMES[theme]}</span>`;
  window._updateParticleTheme && window._updateParticleTheme(theme);
  window._updateClickTheme && window._updateClickTheme(theme);
  window._updateLyricPalette && window._updateLyricPalette(theme);
}

function toggleTheme() {
  const idx = THEMES.indexOf(currentTheme);
  const next = THEMES[(idx + 1) % THEMES.length];
  applyTheme(next);
}

// 页面加载时应用
applyTheme(currentTheme);
