// ── 歌词沉浸特效（电影级重力错落掉落） ──────────────────────
(() => {
  const canvas = document.getElementById('lyric-fly-canvas');
  const ctx = canvas.getContext('2d');
  let W = canvas.width = window.innerWidth;
  let H = canvas.height = window.innerHeight;
  window.addEventListener('resize', () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; });

  // 主题色板（可通过主题切换更新）
  let PALETTE = ['#a78bfa', '#7c5cfc', '#c084fc', '#e879f9', '#fc5c7d', '#fb7185', '#818cf8', '#ddd6fe'];

  // ── easing ────────────────────────────────────────────────────
  function easeOutBack(t) {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
  function easeOutBounceLight(t) {
    if (t < 1 / 2.75) return 7.5625 * t * t;
    if (t < 2 / 2.75) { t -= 1.5 / 2.75; return 7.5625 * t * t + 0.75; }
    if (t < 2.5 / 2.75) { t -= 2.25 / 2.75; return 7.5625 * t * t + 0.9375; }
    t -= 2.625 / 2.75; return 7.5625 * t * t + 0.984375;
  }
  function easeGravity(t) {
    return t < 0.72
      ? easeOutBack(t / 0.72) * 0.96
      : 0.96 + easeOutBounceLight((t - 0.72) / 0.28) * 0.04;
  }

  // ── CharParticle ──────────────────────────────────────────────
  let charParticles = [];
  let activeText = '';
  let globalAlpha = 1;
  let phase = 'idle'; // idle | in | hold | fadeout
  let pendingText = null;
  let lastTime = 0;

  class CharParticle {
    constructor(char, targetX, targetY, fontSize, charIndex) {
      this.char = char;
      this.fontSize = fontSize;
      this.targetX = targetX;
      this.targetY = targetY;
      this.color = PALETTE[charIndex % PALETTE.length];

      // 从屏幕顶部区域错落高度开始掉落（长程飞落感）
      const dropH = targetY * 0.75 + charIndex * 18 + Math.random() * 80;
      this._startY = targetY - dropH;
      this.x = targetX + (Math.random() - 0.5) * 24;
      this.y = this._startY;

      // 时序延迟：逐字从左到右依次
      this.delay = charIndex * 0.036 + Math.random() * 0.016;
      this.duration = 0.50 + Math.random() * 0.14;
      this.elapsed = 0;
      this.progress = 0;

      this.initRot = (Math.random() - 0.5) * 0.28;
      this.rotation = this.initRot;

      this.breathPhase = Math.random() * Math.PI * 2;
      this.breathSpeed = 0.038 + Math.random() * 0.022;

      this.alpha = 0;
      this.settled = false;
    }

    update(dt) {
      this.delay -= dt;
      if (this.delay > 0) return;
      this.elapsed = Math.min(this.elapsed + dt, this.duration);
      this.progress = this.elapsed / this.duration;
      const t = easeGravity(this.progress);
      this.y = this._startY + t * (this.targetY - this._startY);
      this.x += (this.targetX - this.x) * 0.16;
      this.rotation = this.initRot * (1 - t);
      this.alpha = Math.min(1, this.progress / 0.28);
      if (this.progress >= 1) {
        this.settled = true;
        this.x = this.targetX;
        this.y = this.targetY;
        this.rotation = 0;
      }
      if (this.settled) this.breathPhase += this.breathSpeed;
    }

    draw(ctx, gAlpha) {
      if (this.delay > 0 || this.alpha <= 0) return;
      const breath = this.settled
        ? 0.80 + 0.20 * (0.5 + 0.5 * Math.sin(this.breathPhase))
        : 1;
      const fa = this.alpha * gAlpha * breath;
      if (fa <= 0.01) return;

      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation);
      ctx.font = `bold ${this.fontSize}px "PingFang SC","Microsoft YaHei",sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 层1：大范围柔光光晕
      ctx.globalAlpha = fa * 0.22;
      ctx.shadowBlur = 44;
      ctx.shadowColor = this.color;
      ctx.fillStyle = this.color;
      ctx.fillText(this.char, 0, 0);

      // 层2：中光晕
      ctx.globalAlpha = fa * 0.55;
      ctx.shadowBlur = 18;
      ctx.fillText(this.char, 0, 0);

      // 层3：主体字形
      ctx.globalAlpha = fa;
      ctx.shadowBlur = 0;
      ctx.fillText(this.char, 0, 0);

      // 层4：白色高光（呼吸峰值时）
      if (this.settled && breath > 0.92) {
        ctx.globalAlpha = fa * (breath - 0.92) * 2.0;
        ctx.strokeStyle = 'rgba(255,255,255,0.50)';
        ctx.lineWidth = 0.5;
        ctx.strokeText(this.char, 0, 0);
      }
      ctx.restore();
    }
  }

  // ── triggerLyricFly ───────────────────────────────────────────
  function triggerLyricFly(text) {
    if (!text || !text.trim()) { phase = 'idle'; return; }
    text = text.trim();
    activeText = text;
    globalAlpha = 1;
    phase = 'in';
    charParticles = [];

    const fontSize = Math.min(46, Math.max(22, W / (text.length * 1.05 + 1.5)));
    ctx.font = `bold ${fontSize}px "PingFang SC","Microsoft YaHei",sans-serif`;
    const GAP = fontSize * 0.08;
    const charWidths = text.split('').map(c => ctx.measureText(c).width + GAP);
    const totalWidth = charWidths.reduce((a, b) => a + b, 0);
    const centerY = H * 0.82;
    let startX = (W - totalWidth) / 2;

    for (let i = 0; i < text.length; i++) {
      const targetX = startX + charWidths[i] / 2;
      charParticles.push(new CharParticle(text[i], targetX, centerY, fontSize, i));
      startX += charWidths[i];
    }
  }

  // ── 渲染主循环 ────────────────────────────────────────────────
  function loop(ts) {
    const dt = lastTime ? Math.min((ts - lastTime) / 1000, 0.05) : 0.016;
    lastTime = ts;
    ctx.clearRect(0, 0, W, H);

    // 淡出阶段
    if (phase === 'fadeout') {
      globalAlpha -= dt * 2.2; // ~0.45s 淡出
      if (globalAlpha <= 0) {
        globalAlpha = 0;
        charParticles = [];
        phase = 'idle';
        if (pendingText) {
          const txt = pendingText;
          pendingText = null;
          triggerLyricFly(txt);
        }
      }
    }

    // 检查是否全部落定
    if (phase === 'in' && charParticles.length && charParticles.every(p => p.settled)) {
      phase = 'hold';
    }

    // 有待播歌词且当前在 hold/in → 触发淡出
    if (pendingText && (phase === 'hold' || phase === 'in')) {
      phase = 'fadeout';
    }

    for (const p of charParticles) {
      p.update(dt);
      p.draw(ctx, globalAlpha);
    }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ── 对外 API ──────────────────────────────────────────────────
  window._lyricFlyTrigger = function (text) {
    if (!text || !text.trim()) return;
    const t = text.trim();
    if (t === activeText && phase !== 'fadeout') return;
    if (phase === 'idle') {
      triggerLyricFly(t);
    } else {
      pendingText = t;
      if (phase === 'hold') phase = 'fadeout';
    }
  };
  window._lyricFlyClear = function () {
    pendingText = null;
    globalAlpha = 0;
    charParticles = [];
    phase = 'idle';
    activeText = '';
  };
  window._updateLyricPalette = function (theme) {
    const p = window.THEME_PALETTE && window.THEME_PALETTE[theme];
    if (p) PALETTE = [...p];
  };
})();
