/* ==========================================================================
   Visualizador 3D e vista explodida do purgador de 10 mm
   Carrega os 7 STL reais do projeto (pasta /stl). Coordenadas dos STL já
   estão na posição de montagem (origem no centro do corpo, Z para cima).
   Requer THREE (r128, build global).
   ========================================================================== */
(() => {
  'use strict';

  const wrap = document.getElementById('viewerCanvasWrap');
  if (!wrap) return;
  const statusEl = document.getElementById('viewerStatus');
  const setStatus = (msg, isError) => {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.hidden = !msg;
    statusEl.dataset.error = isError ? '1' : '0';
  };

  if (!window.THREE) {
    setStatus('Não foi possível carregar a biblioteca 3D (Three.js). Verifique a conexão e recarregue a página.', true);
    return;
  }
  const THREE = window.THREE;

  /* ---------- Definição das peças (STL reais) ---------- */
  const PARTS = [
    { id: 'corpo', file: 'stl/corpo.stl', name: 'Corpo', dim: '88 × 50 × 36 mm', color: 0x94a3b8,
      explode: 0,
      desc: 'Canal Ø10 no eixo X, rebaixos Ø10,3 (assento dos O-rings), câmara Ø32, bucha do eixo Ø6,36 e fixação 4× M4.' },
    { id: 'obturador', file: 'stl/obturador.stl', name: 'Obturador', dim: 'Ø32 × 3 mm', color: 0xf97316,
      explode: -38, spin: true,
      desc: 'Disco da borboleta com furo central Ø6 para o eixo. A 0° fica perpendicular ao fluxo; a 90°, alinhado.' },
    { id: 'eixo', file: 'stl/eixo.stl', name: 'Eixo', dim: 'Ø6 × 43 mm', color: 0xeab308,
      explode: -85, spin: true,
      desc: 'Vertical (Z). A ponta superior fica dentro da caixa eletrônica e leva o ímã diametral lido pelo AS5600.' },
    { id: 'caixa_eletronica', file: 'stl/caixa_eletronica.stl', name: 'Caixa eletrônica', dim: '68 × 48 × 22 mm', color: 0x38bdf8,
      explode: 22,
      desc: 'Três passagens Ø7 na parede +Y, em x = −20 / 0 / +20: alimentação 12 V, DS18B20 e reserva.' },
    { id: 'placa_sensores', file: 'stl/placa_sensores.stl', name: 'Placa AS5600', dim: '54 × 34 × 3 mm', color: 0x22c55e,
      explode: 48,
      desc: 'PCB com o AS5600 centrado sobre a ponta do eixo. O DS3231 pode ficar na mesma placa ou em módulo ao lado.' },
    { id: 'junta', file: 'stl/junta.stl', name: 'Junta de vedação', dim: '62 × 42 × 1 mm', color: 0x0284c7,
      explode: 72,
      desc: 'Vedação entre a caixa eletrônica e a tampa.' },
    { id: 'tampa', file: 'stl/tampa.stl', name: 'Tampa', dim: '68 × 48 × 6 mm', color: 0xe5e7eb,
      explode: 100,
      desc: 'Fecha a caixa eletrônica, com 4 furos de fixação.' }
  ];

  const VIEWS = {
    conjunto: { ids: null, explode: 0 },
    camara:   { ids: ['corpo', 'obturador'], explode: 45 },
    canal:    { ids: ['corpo'], explode: 0 },
    encoder:  { ids: ['eixo', 'placa_sensores'], explode: 70 },
    caixa:    { ids: ['caixa_eletronica', 'placa_sensores', 'junta', 'tampa'], explode: 80 }
  };

  /* ---------- Parser de STL binário + normais com ângulo de vinco ---------- */
  function parseBinarySTL(buf) {
    const dv = new DataView(buf);
    const n = dv.getUint32(80, true);
    if (84 + n * 50 !== buf.byteLength) throw new Error('STL inválido (esperado binário)');
    const pos = new Float32Array(n * 9);
    for (let i = 0; i < n; i++) {
      const o = 84 + i * 50 + 12;
      for (let k = 0; k < 9; k++) pos[i * 9 + k] = dv.getFloat32(o + k * 4, true);
    }
    return pos;
  }

  function creaseNormals(pos, angleDeg) {
    const n = pos.length / 9;
    const fn = new Float32Array(n * 3);
    for (let f = 0; f < n; f++) {
      const o = f * 9;
      const ax = pos[o + 3] - pos[o], ay = pos[o + 4] - pos[o + 1], az = pos[o + 5] - pos[o + 2];
      const bx = pos[o + 6] - pos[o], by = pos[o + 7] - pos[o + 1], bz = pos[o + 8] - pos[o + 2];
      let x = ay * bz - az * by, y = az * bx - ax * bz, z = ax * by - ay * bx;
      const l = Math.hypot(x, y, z) || 1;
      fn[f * 3] = x / l; fn[f * 3 + 1] = y / l; fn[f * 3 + 2] = z / l;
    }
    const key = (o) => Math.round(pos[o] * 50) + ',' + Math.round(pos[o + 1] * 50) + ',' + Math.round(pos[o + 2] * 50);
    const map = new Map();
    for (let f = 0; f < n; f++) {
      for (let c = 0; c < 3; c++) {
        const k = key(f * 9 + c * 3);
        let arr = map.get(k);
        if (!arr) { arr = []; map.set(k, arr); }
        arr.push(f);
      }
    }
    const cosT = Math.cos(angleDeg * Math.PI / 180);
    const out = new Float32Array(n * 9);
    for (let f = 0; f < n; f++) {
      for (let c = 0; c < 3; c++) {
        const list = map.get(key(f * 9 + c * 3));
        let sx = 0, sy = 0, sz = 0;
        for (const g of list) {
          const d = fn[f * 3] * fn[g * 3] + fn[f * 3 + 1] * fn[g * 3 + 1] + fn[f * 3 + 2] * fn[g * 3 + 2];
          if (d >= cosT) { sx += fn[g * 3]; sy += fn[g * 3 + 1]; sz += fn[g * 3 + 2]; }
        }
        const l = Math.hypot(sx, sy, sz) || 1;
        const o = f * 9 + c * 3;
        out[o] = sx / l; out[o + 1] = sy / l; out[o + 2] = sz / l;
      }
    }
    return out;
  }

  /* ---------- Cena ---------- */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (e) {
    setStatus('Seu navegador não conseguiu iniciar o WebGL, necessário para o modelo 3D. Tente outro navegador ou ative a aceleração de hardware.', true);
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  const canvas = renderer.domElement;
  canvas.className = 'viewer-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Modelo 3D interativo do purgador de 10 mm. Arraste para girar, use as setas do teclado para girar e + e − para aproximar.');
  wrap.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 1, 3000);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 0.9); key.position.set(160, 260, 200); scene.add(key);
  const rim = new THREE.DirectionalLight(0x93c5fd, 0.45); rim.position.set(-220, 90, -160); scene.add(rim);

  const grid = new THREE.GridHelper(420, 21, 0x475569, 0x334155);
  grid.position.y = -122;
  grid.material.transparent = true; grid.material.opacity = 0.55;
  scene.add(grid);

  // Grupo do modelo: Z do CAD vira Y (para cima) no mundo
  const group = new THREE.Group();
  group.rotation.x = -Math.PI / 2;
  scene.add(group);

  // Linha tracejada do eixo de montagem
  const axisGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -118), new THREE.Vector3(0, 0, 158)]);
  const axisLine = new THREE.Line(axisGeo, new THREE.LineDashedMaterial({ color: 0xeab308, dashSize: 4, gapSize: 4, transparent: true, opacity: 0 }));
  axisLine.computeLineDistances();
  group.add(axisLine);

  const meshes = {};
  const partState = {};
  PARTS.forEach((p) => { partState[p.id] = { visible: true, opacity: 1, goal: 1 }; });

  /* ---------- Estado da vista ---------- */
  const view = {
    explode: 0, explodeGoal: 0,
    angle: 0,
    sync: true,
    target: new THREE.Vector3(0, 15, 0), targetGoal: new THREE.Vector3(0, 15, 0),
    radius: 330, radiusGoal: 330,
    theta: -0.62, phi: 1.12,
    auto: false,
    current: 'conjunto',
    selected: null,
    hover: null
  };

  const explodeRange = document.getElementById('explodeRange');
  const explodeOut = document.getElementById('explodeOut');
  const angleRange = document.getElementById('viewerAngle');
  const angleOut = document.getElementById('viewerAngleOut');
  const syncChk = document.getElementById('syncSim');
  const partList = document.getElementById('partList');
  const partInfo = document.getElementById('partInfo');
  const autoBtn = document.getElementById('autoRotate');
  const resetBtn = document.getElementById('resetView');

  /* ---------- Carregamento dos STL ---------- */
  setStatus('Carregando as 7 peças do CAD…');
  let loaded = 0;
  Promise.all(PARTS.map((p) =>
    fetch(p.file)
      .then((r) => { if (!r.ok) throw new Error(p.file + ' (HTTP ' + r.status + ')'); return r.arrayBuffer(); })
      .then((buf) => {
        const pos = parseBinarySTL(buf);
        const nrm = creaseNormals(pos, 38);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
        geo.computeBoundingSphere();
        const mat = new THREE.MeshStandardMaterial({
          color: p.color, metalness: 0.15, roughness: 0.5, emissive: 0x000000
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData.id = p.id;
        group.add(mesh);
        meshes[p.id] = mesh;
        loaded++;
        setStatus('Carregando as 7 peças do CAD… ' + loaded + '/' + PARTS.length);
      })
  )).then(() => {
    setStatus('');
    applyView('conjunto', true);
    fitCamera(true);
  }).catch((err) => {
    setStatus('Não foi possível carregar os arquivos STL: ' + err.message + '. Confirme que a pasta stl/ foi publicada junto com o site e abra a página por um servidor (não por file://).', true);
  });

  /* ---------- Interface: lista de peças ---------- */
  function buildPartList() {
    if (!partList) return;
    partList.innerHTML = '';
    PARTS.forEach((p) => {
      const li = document.createElement('li');
      li.className = 'part-item';
      li.dataset.id = p.id;
      const hex = '#' + p.color.toString(16).padStart(6, '0');
      li.innerHTML =
        '<button type="button" class="part-pick" aria-pressed="false">' +
          '<span class="part-swatch" style="background:' + hex + '"></span>' +
          '<span class="part-text"><span class="part-name">' + p.name + '</span><span class="part-dim">' + p.dim + '</span></span>' +
        '</button>' +
        '<label class="part-vis"><input type="checkbox" checked aria-label="Mostrar ' + p.name + '"><span>Mostrar</span></label>';
      const pick = li.querySelector('.part-pick');
      pick.addEventListener('click', () => selectPart(view.selected === p.id ? null : p.id));
      pick.addEventListener('mouseenter', () => { view.hover = p.id; });
      pick.addEventListener('mouseleave', () => { view.hover = null; });
      pick.addEventListener('focus', () => { view.hover = p.id; });
      pick.addEventListener('blur', () => { view.hover = null; });
      li.querySelector('input').addEventListener('change', (e) => { partState[p.id].visible = e.target.checked; });
      partList.appendChild(li);
    });
  }

  function selectPart(id) {
    view.selected = id;
    partList && partList.querySelectorAll('.part-item').forEach((li) => {
      const on = li.dataset.id === id;
      li.classList.toggle('is-selected', on);
      li.querySelector('.part-pick').setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (!partInfo) return;
    const p = PARTS.find((x) => x.id === id);
    partInfo.innerHTML = p
      ? '<strong>' + p.name + '</strong> <span class="part-dim">' + p.dim + '</span><br>' + p.desc
      : 'Clique em uma peça no modelo ou na lista para ver a descrição.';
  }

  /* ---------- Abas de subsistema ---------- */
  function applyView(name, instant) {
    const v = VIEWS[name]; if (!v) return;
    view.current = name;
    document.querySelectorAll('[data-view]').forEach((b) => {
      const on = b.dataset.view === name;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    PARTS.forEach((p) => {
      partState[p.id].goal = (!v.ids || v.ids.includes(p.id)) ? 1 : 0.1;
    });
    view.explodeGoal = v.explode;
    if (explodeRange) explodeRange.value = v.explode;
    if (explodeOut) explodeOut.textContent = v.explode + '%';
    if (instant) { view.explode = v.explode; }
    fitCamera(!!instant);
  }

  function fitCamera(instant) {
    // Enquadra as peças em destaque considerando a explosão alvo
    const v = VIEWS[view.current];
    const t = view.explodeGoal / 100;
    const box = new THREE.Box3();
    PARTS.forEach((p) => {
      const m = meshes[p.id]; if (!m) return;
      if (v.ids && !v.ids.includes(p.id)) return;
      if (!partState[p.id].visible) return;
      const b = new THREE.Box3().copy(m.geometry.boundingBox || (m.geometry.computeBoundingBox(), m.geometry.boundingBox));
      b.min.z += p.explode * t; b.max.z += p.explode * t;
      box.union(b);
    });
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3());
    // coordenadas do CAD (x,y,z) → mundo (x, z, -y)
    view.targetGoal.set(c.x, c.z, -c.y);
    const size = Math.max(s.x, s.y, s.z);
    const aspect = Math.max(camera.aspect, 0.5);
    view.radiusGoal = Math.max(150, size * (aspect < 1 ? 2.6 : 1.9));
    if (instant) { view.target.copy(view.targetGoal); view.radius = view.radiusGoal; }
  }

  document.querySelectorAll('[data-view]').forEach((b) => {
    b.addEventListener('click', () => applyView(b.dataset.view, false));
  });

  explodeRange && explodeRange.addEventListener('input', () => {
    view.explodeGoal = +explodeRange.value;
    explodeOut && (explodeOut.textContent = explodeRange.value + '%');
    fitCamera(false);
  });
  angleRange && angleRange.addEventListener('input', () => {
    view.angle = +angleRange.value;
    angleOut && (angleOut.textContent = angleRange.value + '°');
  });
  syncChk && syncChk.addEventListener('change', () => {
    view.sync = syncChk.checked;
    if (angleRange) angleRange.disabled = view.sync;
  });
  if (syncChk) { view.sync = syncChk.checked; if (angleRange) angleRange.disabled = view.sync; }
  autoBtn && autoBtn.addEventListener('click', () => {
    view.auto = !view.auto;
    autoBtn.setAttribute('aria-pressed', view.auto ? 'true' : 'false');
    autoBtn.classList.toggle('is-active', view.auto);
  });
  resetBtn && resetBtn.addEventListener('click', () => {
    view.theta = -0.62; view.phi = 1.12;
    applyView(view.current, false);
  });

  /* ---------- Controles de órbita (mouse, toque, teclado) ---------- */
  const pointers = new Map();
  let lastPinch = 0, moved = 0, wheelOn = false;

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = 0; wheelOn = true;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      lastPinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (pointers.size === 1) {
      view.theta -= dx * 0.008;
      view.phi = Math.min(Math.PI - 0.12, Math.max(0.12, view.phi - dy * 0.008));
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (lastPinch) view.radiusGoal = view.radius = clampR(view.radius * (lastPinch / d));
      lastPinch = d;
    }
  });
  const endPointer = (e) => {
    const wasClick = moved < 6 && pointers.size === 1;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) lastPinch = 0;
    if (wasClick && e.type === 'pointerup') pickAt(e);
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', () => { wheelOn = false; });
  canvas.addEventListener('wheel', (e) => {
    if (!wheelOn) return;
    e.preventDefault();
    view.radiusGoal = clampR(view.radiusGoal * (1 + Math.sign(e.deltaY) * 0.1));
  }, { passive: false });
  canvas.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowLeft') view.theta += 0.1;
    else if (k === 'ArrowRight') view.theta -= 0.1;
    else if (k === 'ArrowUp') view.phi = Math.max(0.12, view.phi - 0.1);
    else if (k === 'ArrowDown') view.phi = Math.min(Math.PI - 0.12, view.phi + 0.1);
    else if (k === '+' || k === '=') view.radiusGoal = clampR(view.radiusGoal * 0.9);
    else if (k === '-' || k === '_') view.radiusGoal = clampR(view.radiusGoal * 1.1);
    else return;
    e.preventDefault();
  });
  const clampR = (r) => Math.min(900, Math.max(70, r));

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pickAt(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const objs = PARTS.filter((p) => meshes[p.id] && partState[p.id].visible && partState[p.id].opacity > 0.5).map((p) => meshes[p.id]);
    const hit = ray.intersectObjects(objs, false)[0];
    selectPart(hit ? hit.object.userData.id : null);
  }

  /* ---------- Redimensionamento ---------- */
  function resize() {
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    canvas.style.width = '100%'; canvas.style.height = '100%';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(wrap);
  else window.addEventListener('resize', resize);
  resize();

  /* ---------- Loop (só roda quando o visualizador está na tela) ---------- */
  let visible = true, raf = 0;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lerp = (a, b, k) => a + (b - a) * k;
  const dim = new THREE.Color(0x1f2937);

  function frame() {
    raf = requestAnimationFrame(frame);
    const k = reduceMotion ? 1 : 0.14;

    view.explode = lerp(view.explode, view.explodeGoal, k);
    if (Math.abs(view.explode - view.explodeGoal) < 0.05) view.explode = view.explodeGoal;
    const t = view.explode / 100;

    const ang = view.sync && window.Purga ? window.Purga.angle : view.angle;
    if (view.sync && angleRange) { angleRange.value = Math.round(ang); }
    if (angleOut) angleOut.textContent = Math.round(ang) + '°';

    PARTS.forEach((p) => {
      const m = meshes[p.id]; if (!m) return;
      const st = partState[p.id];
      m.visible = st.visible;
      m.position.z = p.explode * t;
      m.rotation.z = p.spin ? THREE.MathUtils.degToRad(ang) : 0;
      st.opacity = lerp(st.opacity, st.goal, k);
      const mat = m.material;
      mat.opacity = st.opacity;
      const translucent = st.opacity < 0.985;
      if (mat.transparent !== translucent) { mat.transparent = translucent; mat.needsUpdate = true; }
      mat.depthWrite = !translucent || st.opacity > 0.5;
      const hot = (view.hover === p.id || view.selected === p.id) ? 0.28 : 0;
      mat.emissive.setRGB(hot * 0.9, hot * 0.7, hot * 0.2);
    });
    axisLine.material.opacity = Math.min(0.75, t * 1.6);

    if (view.auto && !pointers.size && !reduceMotion) view.theta += 0.006;
    view.target.lerp(view.targetGoal, k);
    view.radius = lerp(view.radius, view.radiusGoal, k);

    const sp = Math.sin(view.phi), cp = Math.cos(view.phi);
    camera.position.set(
      view.target.x + view.radius * sp * Math.sin(view.theta),
      view.target.y + view.radius * cp,
      view.target.z + view.radius * sp * Math.cos(view.theta)
    );
    camera.lookAt(view.target);
    renderer.render(scene, camera);
  }
  const start = () => { if (!raf) raf = requestAnimationFrame(frame); };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => {
      visible = es[0].isIntersecting;
      visible ? start() : stop();
    }, { rootMargin: '120px' }).observe(wrap);
  } else start();
  document.addEventListener('visibilitychange', () => { document.hidden ? stop() : (visible && start()); });
  start();

  buildPartList();
  selectPart(null);
})();
