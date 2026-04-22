// ── 点击粒子爆炸效果 ───────────────────────────────────────
(() => {
  const canvas = document.getElementById('click-canvas');
  const ctx = canvas.getContext('2d');
  let W = canvas.width = window.innerWidth;
  let H = canvas.height = window.innerHeight;
  window.addEventListener('resize', () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; });

  let COLORS = ['#7c5cfc', '#fc5c7d', '#43e97b', '#38f9d7', '#ffd86f', '#ff8c42'];
  const particles = [];

  class Particle {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 5;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.radius = 2 + Math.random() * 3;
      this.color = COLORS[Math.floor(Math.random() * COLORS.length)];
      this.alpha = 1;
      this.decay = 0.018 + Math.random() * 0.02;
      this.gravity = 0.12;
    }
    update() {
      this.vx *= 0.96;
      this.vy *= 0.96;
      this.vy += this.gravity;
      this.x += this.vx;
      this.y += this.vy;
      this.alpha -= this.decay;
    }
    draw() {
      ctx.save();
      ctx.globalAlpha = Math.max(0, this.alpha);
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.shadowBlur = 8;
      ctx.shadowColor = this.color;
      ctx.fill();
      ctx.restore();
    }
  }

  function spawnBurst(x, y, count = 22) {
    for (let i = 0; i < count; i++) particles.push(new Particle(x, y));
  }

  function loop() {
    ctx.clearRect(0, 0, W, H);
    for (let i = particles.length - 1; i >= 0; i--) {
      particles[i].update();
      particles[i].draw();
      if (particles[i].alpha <= 0) particles.splice(i, 1);
    }
    requestAnimationFrame(loop);
  }
  loop();

  document.addEventListener('click', e => spawnBurst(e.clientX, e.clientY));

  window._updateClickTheme = function (theme) {
    const c = window.THEME_CLICK_COLORS && window.THEME_CLICK_COLORS[theme];
    if (c) COLORS = [...c];
  };
})();
