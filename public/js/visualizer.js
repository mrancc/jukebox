// ── Three.js 宇宙星球音频可视化背景（Simplex Noise + Fibonacci 粒子）──
;(function initAudioVisualizer() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas || typeof THREE === 'undefined') return;

  const ap = window.ap;
  ap.crossOrigin = 'anonymous';

  // Web Audio 延迟初始化
  let audioCtx = null, analyser = null, freqData = null, audioSource = null, audioInited = false;

  function connectAudio() {
    if (audioInited) return;
    audioInited = true;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.82;
      freqData = new Uint8Array(analyser.frequencyBinCount);
      audioSource = audioCtx.createMediaElementSource(ap);
      audioSource.connect(analyser);
      analyser.connect(audioCtx.destination);
    } catch (e) { console.warn('Web Audio 初始化失败:', e); audioInited = false; }
  }

  function onFirstInteraction() {
    connectAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }
  document.addEventListener('click', onFirstInteraction);
  document.addEventListener('touchstart', onFirstInteraction);
  ap.addEventListener('play', () => {
    if (!audioInited) connectAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  });

  // Three.js 场景
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.001, 1000);
  camera.position.set(0, 0, 4);
  camera.lookAt(0, 0, 0);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ── 颜色调色板（可通过主题切换更新）─────────────────────────
  let cParticle = [0.50, 0.35, 0.75];
  let cFirefly = [0.80, 0.85, 1.0];

  // ══════════════════════════════════════════════════════════
  // Simplex 4D Noise（by Ian McEwan, Ashima Arts）
  // ══════════════════════════════════════════════════════════
  const snoise = `
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
float permute(float x){return floor(mod(((x*34.0)+1.0)*x, 289.0));}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float taylorInvSqrt(float r){return 1.79284291400159 - 0.85373472095314 * r;}
vec4 grad4(float j, vec4 ip){
  const vec4 ones = vec4(1.0, 1.0, 1.0, -1.0);
  vec4 p, s;
  p.xyz = floor(fract(vec3(j) * ip.xyz) * 7.0) * ip.z - 1.0;
  p.w = 1.5 - dot(abs(p.xyz), ones.xyz);
  s = vec4(lessThan(p, vec4(0.0)));
  p.xyz = p.xyz + (s.xyz*2.0 - 1.0) * s.www;
  return p;
}
float snoise(vec4 v){
  const vec2 C = vec2(0.138196601125010504, 0.309016994374947451);
  vec4 i = floor(v + dot(v, C.yyyy));
  vec4 x0 = v - i + dot(i, C.xxxx);
  vec4 i0;
  vec3 isX = step(x0.yzw, x0.xxx);
  vec3 isYZ = step(x0.zww, x0.yyz);
  i0.x = isX.x + isX.y + isX.z;
  i0.yzw = 1.0 - isX;
  i0.y += isYZ.x + isYZ.y;
  i0.zw += 1.0 - isYZ.xy;
  i0.z += isYZ.z;
  i0.w += 1.0 - isYZ.z;
  vec4 i3 = clamp(i0, 0.0, 1.0);
  vec4 i2 = clamp(i0-1.0, 0.0, 1.0);
  vec4 i1 = clamp(i0-2.0, 0.0, 1.0);
  vec4 x1 = x0 - i1 + 1.0 * C.xxxx;
  vec4 x2 = x0 - i2 + 2.0 * C.xxxx;
  vec4 x3 = x0 - i3 + 3.0 * C.xxxx;
  vec4 x4 = x0 - 1.0 + 4.0 * C.xxxx;
  i = mod(i, 289.0);
  float j0 = permute(permute(permute(permute(i.w)+i.z)+i.y)+i.x);
  vec4 j1 = permute(permute(permute(permute(
    i.w+vec4(i1.w,i2.w,i3.w,1.0))+i.z+vec4(i1.z,i2.z,i3.z,1.0))
    +i.y+vec4(i1.y,i2.y,i3.y,1.0))+i.x+vec4(i1.x,i2.x,i3.x,1.0));
  vec4 ip = vec4(1.0/294.0, 1.0/49.0, 1.0/7.0, 0.0);
  vec4 p0 = grad4(j0, ip);
  vec4 p1 = grad4(j1.x, ip);
  vec4 p2 = grad4(j1.y, ip);
  vec4 p3 = grad4(j1.z, ip);
  vec4 p4 = grad4(j1.w, ip);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  p4 *= taylorInvSqrt(dot(p4,p4));
  vec3 m0 = max(0.6 - vec3(dot(x0,x0),dot(x1,x1),dot(x2,x2)), 0.0);
  vec2 m1 = max(0.6 - vec2(dot(x3,x3),dot(x4,x4)), 0.0);
  m0 = m0*m0; m1 = m1*m1;
  return 49.0 * (dot(m0*m0, vec3(dot(p0,x0),dot(p1,x1),dot(p2,x2)))
    + dot(m1*m1, vec2(dot(p3,x3),dot(p4,x4))));
}
`;

  // HSV → RGB
  const hsv2rgb = `
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
`;

  // ══════════════════════════════════════════════════════════
  // 1. 中心星球（Simplex 4D 噪声变形着色器）
  // ══════════════════════════════════════════════════════════
  const sphereGeo = new THREE.SphereGeometry(1, 200, 200);

  const sphereVert = `
    uniform float uTime;
    uniform float uPulse;
    varying vec3 vColor;
    varying vec3 vNormal;
    ${snoise}
    ${hsv2rgb}
    void main() {
      vNormal = normalize(normalMatrix * normal);
      float noise = snoise(vec4(position * 10.0, uTime * 0.2));
      vColor = hsv2rgb(vec3(noise * 0.1 + 0.04, 0.8, 1.0));
      vec3 newPos = position + (0.8 + uPulse * 0.5) * normal * noise;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
    }
  `;
  const sphereFrag = `
    varying vec3 vColor;
    varying vec3 vNormal;
    void main() {
      gl_FragColor = vec4(vColor, 1.0);
    }
  `;

  const sphereMat = new THREE.ShaderMaterial({
    vertexShader: sphereVert,
    fragmentShader: sphereFrag,
    uniforms: { uTime: { value: 0 }, uPulse: { value: 0 } },
  });
  const sphere = new THREE.Mesh(sphereGeo, sphereMat);
  scene.add(sphere);

  // ══════════════════════════════════════════════════════════
  // 2. 球面粒子（Fibonacci 均匀分布，10000 粒子）
  // ══════════════════════════════════════════════════════════
  const PN = 10000;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(PN * 3);
  const pBase = new Float32Array(PN * 3);
  const PR = 2;

  const inc = Math.PI * (3 - Math.sqrt(5));
  const off = 2 / PN;
  for (let i = 0; i < PN; i++) {
    const y = i * off - 1 + off / 2;
    const r = Math.sqrt(1 - y * y);
    const phi = i * inc;
    const px = PR * Math.cos(phi) * r;
    const py = PR * y;
    const pz = PR * Math.sin(phi) * r;
    pPos[i*3] = px; pPos[i*3+1] = py; pPos[i*3+2] = pz;
    pBase[i*3] = px; pBase[i*3+1] = py; pBase[i*3+2] = pz;
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));

  const pVert = `
    uniform float uTime;
    varying float vAlpha;
    void main() {
      vec3 newPos = position;
      newPos.y += 0.1 * sin(newPos.y * 6.0 + uTime);
      newPos.z += 0.05 * sin(newPos.y * 10.0 + uTime);
      vec4 mvPosition = modelViewMatrix * vec4(newPos, 1.0);
      gl_PointSize = 6.0 / -mvPosition.z;
      vAlpha = 0.6;
      gl_Position = projectionMatrix * mvPosition;
    }
  `;
  const pFrag = `
    uniform vec3 uColor;
    varying float vAlpha;
    void main() {
      gl_FragColor = vec4(uColor, vAlpha);
    }
  `;

  const pMat = new THREE.ShaderMaterial({
    vertexShader: pVert,
    fragmentShader: pFrag,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(cParticle[0], cParticle[1], cParticle[2]) },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
  });
  const particles = new THREE.Points(pGeo, pMat);
  scene.add(particles);

  // ══════════════════════════════════════════════════════════
  // 3. 萤火虫 / 背景粒子（500 个远景发光光点）
  // ══════════════════════════════════════════════════════════
  const FN = 500;
  const fGeo = new THREE.BufferGeometry();
  const fPos = new Float32Array(FN * 3);
  const fSizes = new Float32Array(FN);

  for (let i = 0; i < FN; i++) {
    const r = Math.random() * 5 + 5;
    fPos[i*3] = (Math.random() - 0.5) * r;
    fPos[i*3+1] = (Math.random() - 0.5) * r;
    fPos[i*3+2] = (Math.random() - 0.5) * r;
    fSizes[i] = Math.random() + 0.4;
  }
  fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
  fGeo.setAttribute('aSize', new THREE.BufferAttribute(fSizes, 1));

  const fVert = `
    uniform float uTime;
    attribute float aSize;
    varying float vStrength;
    void main() {
      vec3 newPos = position;
      newPos.y += sin(uTime * 0.5 + newPos.x * 100.0) * aSize * 0.2;
      newPos.x += sin(uTime * 0.5 + newPos.x * 200.0) * aSize * 0.1;
      vec4 mvPosition = modelViewMatrix * vec4(newPos, 1.0);
      gl_PointSize = 40.0 * aSize / -mvPosition.z;
      vStrength = aSize;
      gl_Position = projectionMatrix * mvPosition;
    }
  `;
  const fFrag = `
    uniform vec3 uColor;
    varying float vStrength;
    void main() {
      float d = length(gl_PointCoord - vec2(0.5));
      float strength = clamp(0.05 / d - 0.05 * 2.0, 0.0, 1.0);
      gl_FragColor = vec4(uColor, strength);
    }
  `;

  const fMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(cFirefly[0], cFirefly[1], cFirefly[2]) },
    },
    vertexShader: fVert,
    fragmentShader: fFrag,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const fireflies = new THREE.Points(fGeo, fMat);
  scene.add(fireflies);

  // ══════════════════════════════════════════════════════════
  // 4. 音频分析 + 动画循环
  // ══════════════════════════════════════════════════════════
  let smoothBass = 0, smoothMid = 0, smoothHigh = 0, smoothTotal = 0;

  function animate() {
    requestAnimationFrame(animate);

    if (analyser && freqData) analyser.getByteFrequencyData(freqData);

    const len = freqData ? freqData.length : 0;
    const t = performance.now() * 0.001;

    // 频段能量
    let bassE = 0, midE = 0, highE = 0;
    if (freqData && len > 0) {
      const bassEnd = Math.floor(len * 0.15);
      const midEnd = Math.floor(len * 0.5);
      for (let i = 0; i < bassEnd; i++) bassE += freqData[i];
      bassE /= (bassEnd * 255);
      for (let i = bassEnd; i < midEnd; i++) midE += freqData[i];
      midE /= ((midEnd - bassEnd) * 255);
      for (let i = midEnd; i < len; i++) highE += freqData[i];
      highE /= ((len - midEnd) * 255);
    }
    smoothBass += (bassE - smoothBass) * 0.18;
    smoothMid += (midE - smoothMid) * 0.15;
    smoothHigh += (highE - smoothHigh) * 0.12;
    smoothTotal = (smoothBass + smoothMid + smoothHigh) / 3;

    // ── 星球：脉动 + 旋转 ──
    sphere.rotation.y += 0.002;
    sphereMat.uniforms.uTime.value = t;
    sphereMat.uniforms.uPulse.value = smoothBass * 2.0;

    // ── 球面粒子：旋转 + 音频扩散 ──
    pMat.uniforms.uTime.value = t;
    particles.rotation.y = t * 0.1;
    // 音频响应：低频让粒子沿法线方向扩张
    const expandScale = 1 + smoothBass * 0.15;
    for (let i = 0; i < PN; i++) {
      const bx = pBase[i*3], by = pBase[i*3+1], bz = pBase[i*3+2];
      pPos[i*3]   = bx * expandScale;
      pPos[i*3+1] = by * expandScale;
      pPos[i*3+2] = bz * expandScale;
    }
    pGeo.attributes.position.needsUpdate = true;

    // ── 萤火虫：时间驱动波动 + 高频闪烁 ──
    fMat.uniforms.uTime.value = t;

    // ── 镜头呼吸 ──
    camera.position.z = 4 - smoothTotal * 0.3 + Math.sin(t * 0.15) * 0.05;

    renderer.render(scene, camera);
  }

  animate();

  // 主题切换时更新颜色
  window._updateParticleTheme = function (theme) {
    const p = window.THEME_PARTICLES && window.THEME_PARTICLES[theme];
    if (!p) return;
    if (p.particle) {
      cParticle = [...p.particle];
      pMat.uniforms.uColor.value.setRGB(cParticle[0], cParticle[1], cParticle[2]);
    }
    if (p.firefly) {
      cFirefly = [...p.firefly];
      fMat.uniforms.uColor.value.setRGB(cFirefly[0], cFirefly[1], cFirefly[2]);
    }
  };
})();
