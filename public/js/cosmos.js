// ── Cosmos: 宇宙漩涡数学曲线粒子系统 ──
// 3000 颗粒子在 Koch/心形/蝴蝶/阿基米德螺旋/悬链线/伯努利双扭/玫瑰曲线间无缝切换
;(function initCosmos() {
  const canvas = document.getElementById('cosmos-canvas');
  if (!canvas || typeof THREE === 'undefined') return;

  const PARTICLE_COUNT = 3000;

  // ── 渲染器 & 场景 ──
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
  camera.position.set(0, 0, 12);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ── 颜色调色板 ──
  let cPrimary = [0.50, 0.35, 0.98];
  let cSecondary = [0.80, 0.85, 1.0];

  // ══════════════════════════════════════════════
  // 数学曲线生成器
  // ══════════════════════════════════════════════

  // Koch 雪花变体（极坐标）
  function koch(t, scale) {
    const a = t * Math.PI * 6;
    const r = scale * (0.6 + 0.3 * Math.cos(3 * a) + 0.1 * Math.cos(9 * a));
    return [r * Math.cos(a), r * Math.sin(a)];
  }

  // 心形线
  function cardioid(t, scale) {
    const a = t * Math.PI * 2;
    const r = scale * (1 - Math.sin(a)) * 0.6;
    return [r * Math.cos(a), r * Math.sin(a) + scale * 0.15];
  }

  // 蝴蝶曲线
  function butterfly(t, scale) {
    const a = t * Math.PI * 2 * 3;
    const r = Math.exp(Math.sin(a)) - 2 * Math.cos(4 * a) + Math.pow(Math.sin((2 * a - Math.PI) / 24), 5);
    return [scale * r * Math.sin(a) * 0.35, scale * r * Math.cos(a) * 0.35];
  }

  // 阿基米德螺旋线
  function archimedeanSpiral(t, scale) {
    const a = t * Math.PI * 8;
    const r = scale * a / (Math.PI * 8) * 0.9;
    return [r * Math.cos(a), r * Math.sin(a)];
  }

  // 悬链线
  function catenary(t, scale) {
    const x = (t - 0.5) * scale * 2.4;
    const a = scale * 0.5;
    const y = a * Math.cosh(x / a) - a * 1.2;
    return [x, y];
  }

  // 伯努利双扭线
  function lemniscate(t, scale) {
    const a = t * Math.PI * 2;
    const cos2 = Math.cos(2 * a);
    const denom = Math.max(Math.abs(1 + cos2), 0.01);
    const r = scale * Math.sqrt(Math.abs(1 - cos2)) / Math.sqrt(denom) * 0.8;
    return [r * Math.cos(a), r * Math.sin(a)];
  }

  // 玫瑰曲线
  function rose(t, scale) {
    const a = t * Math.PI * 2 * 3;
    const r = scale * Math.cos(3 * a) * 0.9;
    return [r * Math.cos(a), r * Math.sin(a)];
  }

  const curves = [koch, cardioid, butterfly, archimedeanSpiral, catenary, lemniscate, rose];
  const CURVE_DUR = 6; // 每条曲线停留秒数
  const TRANS_DUR = 2; // 过渡秒数

  // ── 粒子数据 ──
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const aTarget = new Float32Array(PARTICLE_COUNT * 3); // 目标位置
  const aSize = new Float32Array(PARTICLE_COUNT);
  const aPhase = new Float32Array(PARTICLE_COUNT);
  const aColorMix = new Float32Array(PARTICLE_COUNT);

  const SCALE = 5;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const t = i / PARTICLE_COUNT;
    const p = curves[0](t, SCALE);
    const depth = (Math.random() - 0.5) * 3;
    positions[i * 3] = p[0] + (Math.random() - 0.5) * 0.3;
    positions[i * 3 + 1] = p[1] + (Math.random() - 0.5) * 0.3;
    positions[i * 3 + 2] = depth;
    aTarget[i * 3] = p[0];
    aTarget[i * 3 + 1] = p[1];
    aTarget[i * 3 + 2] = depth;
    aSize[i] = Math.random() * 1.5 + 0.5;
    aPhase[i] = Math.random() * Math.PI * 2;
    aColorMix[i] = Math.random();
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aTarget', new THREE.BufferAttribute(aTarget, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(aPhase, 1));
  geometry.setAttribute('aColorMix', new THREE.BufferAttribute(aColorMix, 1));

  // ── Shader ──
  const vertexShader = `
    attribute vec3 aTarget;
    attribute float aSize;
    attribute float aPhase;
    attribute float aColorMix;
    uniform float uTime;
    uniform float uMorph; // 0→1 过渡进度
    varying float vAlpha;
    varying float vColorMix;
    void main() {
      vec3 pos = mix(position, aTarget, uMorph);
      // 微小浮动
      pos.x += sin(uTime * 0.8 + aPhase) * 0.06;
      pos.y += cos(uTime * 0.6 + aPhase * 1.3) * 0.06;
      pos.z += sin(uTime * 0.4 + aPhase * 0.7) * 0.04;
      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      float depth = -mvPosition.z;
      gl_PointSize = (aSize * 60.0) / depth;
      gl_Position = projectionMatrix * mvPosition;
      vAlpha = clamp(1.2 - depth * 0.04, 0.15, 0.85);
      vColorMix = aColorMix;
    }
  `;

  const fragmentShader = `
    uniform vec3 uColor1;
    uniform vec3 uColor2;
    varying float vAlpha;
    varying float vColorMix;
    void main() {
      float d = length(gl_PointCoord - vec2(0.5));
      if (d > 0.5) discard;
      // 柔和辉光
      float glow = exp(-d * 4.0) * 0.9;
      float core = smoothstep(0.15, 0.0, d);
      float alpha = (glow + core * 0.6) * vAlpha;
      vec3 col = mix(uColor1, uColor2, vColorMix);
      // 中心偏亮
      col += core * 0.3;
      gl_FragColor = vec4(col, alpha);
    }
  `;

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uMorph: { value: 1.0 },
      uColor1: { value: new THREE.Color(cPrimary[0], cPrimary[1], cPrimary[2]) },
      uColor2: { value: new THREE.Color(cSecondary[0], cSecondary[1], cSecondary[2]) },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  // ── 曲线切换状态机 ──
  let currentCurveIdx = 0;
  let morphProgress = 1.0;
  let isTransitioning = false;
  let lastSwitchTime = 0;

  function computeTargets(curveIdx) {
    const curve = curves[curveIdx];
    const tArr = geometry.attributes.aTarget.array;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const t = i / PARTICLE_COUNT;
      const p = curve(t, SCALE);
      const depth = (Math.random() - 0.5) * 3;
      tArr[i * 3] = p[0] + (Math.random() - 0.5) * 0.25;
      tArr[i * 3 + 1] = p[1] + (Math.random() - 0.5) * 0.25;
      tArr[i * 3 + 2] = depth;
    }
    geometry.attributes.aTarget.needsUpdate = true;
  }

  function switchCurve() {
    currentCurveIdx = (currentCurveIdx + 1) % curves.length;
    computeTargets(currentCurveIdx);
    isTransitioning = true;
    morphProgress = 0;
    lastSwitchTime = performance.now() * 0.001;
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // ── 动画循环 ──
  let prevTime = performance.now() * 0.001;
  let holdTimer = 0;
  let started = false;

  function animate() {
    requestAnimationFrame(animate);

    if (!started) return;
    const now = performance.now() * 0.001;
    const dt = Math.min(now - prevTime, 0.05);
    prevTime = now;

    material.uniforms.uTime.value = now;

    // 自动切换逻辑
    if (!isTransitioning) {
      holdTimer += dt;
      if (holdTimer >= CURVE_DUR) {
        holdTimer = 0;
        switchCurve();
      }
    } else {
      morphProgress += dt / TRANS_DUR;
      if (morphProgress >= 1) {
        morphProgress = 1;
        isTransitioning = false;
        holdTimer = 0;
        // 过渡完成：把当前位置更新为最终目标
        const posArr = geometry.attributes.position.array;
        const tarArr = geometry.attributes.aTarget.array;
        for (let i = 0; i < PARTICLE_COUNT * 3; i++) {
          posArr[i] = tarArr[i];
        }
        geometry.attributes.position.needsUpdate = true;
      }
      material.uniforms.uMorph.value = easeInOutCubic(morphProgress);
    }

    // 整体缓慢旋转形成漩涡感
    const rotSpeed = isTransitioning ? 0.3 : 0.08;
    points.rotation.y += rotSpeed * dt;
    points.rotation.x = Math.sin(now * 0.1) * 0.05;

    // 镜头缓慢呼吸
    camera.position.z = 12 + Math.sin(now * 0.15) * 0.5;

    renderer.render(scene, camera);
  }

  animate();

  // ── 生命周期：启动/停止/主题更新 ──
  function start() {
    started = true;
    prevTime = performance.now() * 0.001;
    holdTimer = 0;
  }

  function stop() {
    started = false;
  }

  function updateTheme(theme) {
    const p = window.THEME_PARTICLES && window.THEME_PARTICLES[theme];
    if (!p) return;
    if (p.particle) {
      cPrimary = [...p.particle];
      material.uniforms.uColor1.value.setRGB(cPrimary[0], cPrimary[1], cPrimary[2]);
    }
    if (p.firefly) {
      cSecondary = [...p.firefly];
      material.uniforms.uColor2.value.setRGB(cSecondary[0], cSecondary[1], cSecondary[2]);
    }
  }

  // 暴露给外部
  window._cosmos = { start, stop, updateTheme };
})();
