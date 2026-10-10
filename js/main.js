/* ==========================================================================
   Proteção Solar Inteligente · Purga anti-congelamento de 10 mm
   - Widget 1: simulador de temperatura e purga automática
   - Widget 2: calculadora de economia de água
   - Gráfico da densidade da água e mostrador do hero
   Os parâmetros espelham o firmware do repositório (purgaantigelo).
   ========================================================================== */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const fmt = (n, d = 1) => n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Estado compartilhado com o visualizador 3D
  const Purga = (window.Purga = { angle: 0, temp: 4, flowPurge: 4 });

  /* Parâmetros do firmware */
  const LIMITE_C = 3.0;          // TEMP_LIMITE_CONGELAMENTO
  const T_PURGA_S = 30;          // T_PURGA_SEGUNDOS
  const HOLD_S = 30 * 60;        // T_ESPERA_ENTRE_PURGAS_MIN
  const RATE_DEG_S = 60;         // velocidade de manobra (didática)

  /* ======================================================================
     Widget 1 · Simulador
     ====================================================================== */
  const S = {
    temp: 4, night: true, speed: 60,
    state: 'FECHADA', angle: 0,
    purgeLeft: 0, hold: 0,
    purges: 0, litros: 0,
    clock: 0, manual: false,
    hist: [], log: []
  };

  const el = {
    card: $('simCard'),
    range: $('tempRange'), out: $('tempOut'),
    night: $('btnNight'), day: $('btnDay'),
    speed: $('speedSel'),
    manual: $('btnManual'), reset: $('btnReset'),
    state: $('simState'), cond: $('simCond'),
    purgeCd: $('purgeCountdown'), holdCd: $('holdCountdown'),
    purges: $('purgeTotal'), liters: $('litersTotal'),
    disc: $('valveDisc'), angleTxt: $('valveAngleTxt'), flow: $('valveFlow'),
    chart: $('chartLine'), log: $('simLog'),
    heroArc: $('heroArc'), heroNeedle: $('heroNeedle'), heroTemp: $('heroTemp'),
    heroState: $('heroState'), heroAngle: $('heroAngle'), heroWin: $('heroWindow'), hero: $('heroDial')
  };

  const STATE_LABEL = { FECHADA: 'Fechada', ABRINDO: 'Abrindo', PURGANDO: 'Purgando', FECHANDO: 'Fechando' };

  function stamp() {
    const s = Math.floor(S.clock);
    const m = Math.floor(s / 60), r = s % 60;
    return '+' + String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
  }
  function logLine(obj) {
    S.log.push(JSON.stringify(Object.assign({ t: stamp() }, obj)));
    if (S.log.length > 7) S.log.shift();
    if (el.log) el.log.textContent = S.log.join('\n');
  }

  function startPurge(kind) {
    if (S.state !== 'FECHADA') return;
    S.state = 'ABRINDO';
    logLine({ evento: kind === 'manual' ? 'PURGA_MANUAL' : 'PURGA_AUTO', T: +S.temp.toFixed(1), noite: S.night, estado: 'ABRINDO' });
  }

  function step(dt) {
    S.clock += dt * (S.state === 'FECHADA' ? S.speed : 1);
    switch (S.state) {
      case 'FECHADA':
        if (S.hold > 0) S.hold = Math.max(0, S.hold - dt * S.speed);
        if (S.hold === 0 && S.night && S.temp < LIMITE_C) startPurge('auto');
        break;
      case 'ABRINDO':
        S.angle = Math.min(90, S.angle + RATE_DEG_S * dt);
        if (S.angle >= 90) {
          S.state = 'PURGANDO'; S.purgeLeft = T_PURGA_S;
          logLine({ evento: 'ABERTA', Angulo: 90, estado: 'PURGANDO', T_PURGA_s: T_PURGA_S });
        }
        break;
      case 'PURGANDO':
        S.purgeLeft = Math.max(0, S.purgeLeft - dt);
        S.litros += (Purga.flowPurge / 60) * dt;
        if (S.purgeLeft === 0) {
          S.state = 'FECHANDO';
          logLine({ evento: 'FIM_PURGA', estado: 'FECHANDO' });
        }
        break;
      case 'FECHANDO':
        S.angle = Math.max(0, S.angle - RATE_DEG_S * dt);
        if (S.angle <= 0) {
          S.state = 'FECHADA'; S.hold = HOLD_S; S.purges++;
          logLine({ evento: 'FECHADA_OK', Angulo: 0, validacao: '0±3°', espera_min: 30 });
        }
        break;
    }
  }

  function condText() {
    if (S.state !== 'FECHADA') return { txt: 'Ciclo em andamento: o firmware conclui a manobra antes de reavaliar.', tone: 'run' };
    if (!S.night) return { txt: 'Janela diurna: purga bloqueada pelo RTC, mesmo com frio.', tone: 'idle' };
    if (S.temp >= LIMITE_C) return { txt: 'T ≥ ' + fmt(LIMITE_C) + ' °C: sem risco de congelamento.', tone: 'idle' };
    if (S.hold > 0) return { txt: 'Frio e noite, mas em espera (hold-off) entre purgas.', tone: 'frost' };
    return { txt: 'Noite e T < ' + fmt(LIMITE_C) + ' °C: condição de purga atendida.', tone: 'frost' };
  }

  const mmss = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0');

  function renderSim() {
    const cold = S.night && S.temp < LIMITE_C;
    const tone = condText().tone;
    const mode = S.angle > 0.5 ? 'purge' : (cold ? 'frost' : 'ok');
    if (el.card) el.card.dataset.mode = mode;

    if (el.out) el.out.textContent = fmt(S.temp) + ' °C';
    if (el.state) el.state.textContent = STATE_LABEL[S.state];
    if (el.cond) { el.cond.textContent = condText().txt; el.cond.dataset.tone = tone; }
    if (el.purgeCd) el.purgeCd.textContent = S.state === 'PURGANDO' ? String(Math.ceil(S.purgeLeft)).padStart(2, '0') + ' s' : (S.state === 'FECHADA' ? '— s' : '30 s');
    if (el.holdCd) el.holdCd.textContent = S.hold > 0 ? mmss(S.hold) : '00:00';
    if (el.purges) el.purges.textContent = S.purges;
    if (el.liters) el.liters.textContent = fmt(S.litros, 1) + ' L';

    if (el.disc) el.disc.setAttribute('transform', 'rotate(' + S.angle.toFixed(2) + ')');
    if (el.angleTxt) el.angleTxt.textContent = Math.round(S.angle) + '°';
    if (el.flow) el.flow.style.opacity = clamp((S.angle - 8) / 70, 0, 1).toFixed(2);

    // gráfico de histórico do ângulo (120 s)
    if (el.chart) {
      const n = S.hist.length, W = 474, X0 = 36, Y0 = 92, H = 80;
      let d = '';
      for (let i = 0; i < n; i++) {
        const x = X0 + (i / 479) * W;
        const y = Y0 - (S.hist[i] / 90) * H;
        d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
      }
      el.chart.setAttribute('d', d);
    }

    // mostrador do hero
    renderHero(mode);
  }

  function renderHero(mode) {
    if (!el.heroArc) return;
    const cx = 160, cy = 168, r = 118;
    const f = S.angle / 90;
    const px = cx - r * Math.cos(f * Math.PI), py = cy - r * Math.sin(f * Math.PI);
    el.heroArc.setAttribute('d', f < 0.003 ? '' : 'M' + (cx - r) + ' ' + cy + ' A' + r + ' ' + r + ' 0 0 1 ' + px.toFixed(2) + ' ' + py.toFixed(2));
    const nx = cx - (r - 22) * Math.cos(f * Math.PI), ny = cy - (r - 22) * Math.sin(f * Math.PI);
    el.heroNeedle.setAttribute('x2', nx.toFixed(2));
    el.heroNeedle.setAttribute('y2', ny.toFixed(2));
    el.heroTemp.textContent = fmt(S.temp) + ' °C';
    el.heroAngle.textContent = Math.round(S.angle) + '°';
    el.heroState.textContent = 'Válvula ' + STATE_LABEL[S.state].toLowerCase();
    el.heroWin.textContent = S.night ? 'Janela noturna (22h–06h)' : 'Janela diurna';
    el.hero.dataset.mode = mode;
  }

  let last = performance.now(), acc = 0;
  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.25);
    last = now;
    step(dt);
    acc += dt;
    while (acc >= 0.25) {
      acc -= 0.25;
      S.hist.push(S.angle);
      if (S.hist.length > 480) S.hist.shift();
    }
    Purga.angle = S.angle; Purga.temp = S.temp;
    renderSim();
    requestAnimationFrame(tick);
  }

  function setNight(v) {
    S.night = v;
    el.night.setAttribute('aria-pressed', v ? 'true' : 'false');
    el.day.setAttribute('aria-pressed', v ? 'false' : 'true');
    el.night.classList.toggle('is-active', v);
    el.day.classList.toggle('is-active', !v);
  }

  if (el.range) {
    el.range.addEventListener('input', () => { S.temp = +el.range.value; });
    document.querySelectorAll('[data-preset]').forEach((b) => {
      b.addEventListener('click', () => {
        const [t, night] = b.dataset.preset.split('|');
        S.temp = +t; el.range.value = t; setNight(night === 'n');
      });
    });
    el.night.addEventListener('click', () => setNight(true));
    el.day.addEventListener('click', () => setNight(false));
    el.speed.addEventListener('change', () => { S.speed = +el.speed.value; });
    el.manual.addEventListener('click', () => startPurge('manual'));
    el.reset.addEventListener('click', () => {
      Object.assign(S, { state: 'FECHADA', angle: 0, purgeLeft: 0, hold: 0, purges: 0, litros: 0, clock: 0, hist: [], log: [] });
      if (el.log) el.log.textContent = '{"evento":"RESET","estado":"FECHADA","Angulo":0}';
    });
    S.temp = +el.range.value;
    S.speed = +el.speed.value;
    if (el.log) el.log.textContent = '{"evento":"PARTIDA","estado":"FECHADA","Angulo":0}';
  }
  requestAnimationFrame(tick);

  /* ======================================================================
     Widget 2 · Calculadora de economia de água
     ====================================================================== */
  const calc = {
    cold: $('calcCold'), coldOut: $('calcColdOut'),
    cont: $('calcCont'), contOut: $('calcContOut'),
    purge: $('calcPurge'), purgeOut: $('calcPurgeOut'),
    nights: $('calcNights'), nightsOut: $('calcNightsOut'),
    barA: $('barTrad'), barB: $('barIot'),
    valA: $('valTrad'), valB: $('valIot'),
    saved: $('calcSaved'), pct: $('calcPct'), season: $('calcSeason'),
    pulses: $('calcPulses'), ticks: $('calcTicks'), note: $('calcNote')
  };

  function runCalc() {
    if (!calc.cold) return;
    const coldH = +calc.cold.value;
    const contFlow = +calc.cont.value;
    const purgeFlow = +calc.purge.value;
    const nights = +calc.nights.value;
    Purga.flowPurge = purgeFlow;

    calc.coldOut.textContent = fmt(coldH) + ' h';
    calc.contOut.textContent = fmt(contFlow, 2) + ' L/min';
    calc.purgeOut.textContent = fmt(purgeFlow) + ' L/min';
    calc.nightsOut.textContent = nights + ' noites';

    const coldMin = coldH * 60;
    const cycleMin = 30 + (T_PURGA_S + 3) / 60; // hold-off + purga + manobras
    const pulses = coldMin > 0 ? Math.floor(coldMin / cycleMin) + 1 : 0;
    const perPulse = purgeFlow * (T_PURGA_S / 60);
    const trad = contFlow * coldMin;
    const iot = pulses * perPulse;
    const saved = Math.max(0, trad - iot);
    const pct = trad > 0 ? (saved / trad) * 100 : 0;
    const max = Math.max(trad, iot, 1);

    calc.barA.style.width = (trad / max * 100).toFixed(1) + '%';
    calc.barB.style.width = (iot / max * 100).toFixed(1) + '%';
    calc.valA.textContent = fmt(trad, 0) + ' L/noite';
    calc.valB.textContent = fmt(iot, 0) + ' L/noite';
    calc.saved.textContent = fmt(saved, 0) + ' L';
    calc.pct.textContent = fmt(pct, 0) + '%';
    calc.season.textContent = fmt(saved * nights / 1000, 1) + ' m³';
    calc.pulses.textContent = pulses + (pulses === 1 ? ' pulso' : ' pulsos') + ' de ' + fmt(perPulse, 1) + ' L';

    // Linha do tempo noturna (8 h) com os pulsos
    if (calc.ticks) {
      const total = 8 * 60;
      let html = '<span class="tl-cold" style="width:' + clamp(coldMin / total * 100, 0, 100).toFixed(1) + '%"></span>';
      for (let i = 0; i < pulses; i++) {
        const left = clamp((i * cycleMin) / total * 100, 0, 99.4);
        html += '<span class="tl-tick" style="left:' + left.toFixed(2) + '%"></span>';
      }
      calc.ticks.innerHTML = html;
    }
    if (calc.note) {
      calc.note.textContent = contFlow * coldMin < iot
        ? 'Com esses valores a purga por pulsos gastaria mais água que o descarte contínuo. Reduza a vazão de purga ou aumente o descarte contínuo para ver o cenário típico de válvulas passivas.'
        : '';
    }
  }
  ['cold', 'cont', 'purge', 'nights'].forEach((k) => calc[k] && calc[k].addEventListener('input', runCalc));
  runCalc();

  /* ======================================================================
     Gráfico: densidade da água entre 0 e 10 °C
     ====================================================================== */
  (function density() {
    const svg = $('densityChart');
    if (!svg) return;
    // kg/m³ (água pura, 1 atm) — Kell (1975)
    const data = [[0, 999.84], [1, 999.90], [2, 999.94], [3, 999.96], [4, 999.97], [5, 999.96], [6, 999.94], [7, 999.90], [8, 999.85], [9, 999.78], [10, 999.70]];
    const L = 58, R = 18, T = 28, B = 46, W = 520, H = 280;
    const x = (t) => L + (t / 10) * (W - L - R);
    const yMin = 999.65, yMax = 999.99;
    const y = (v) => T + (1 - (v - yMin) / (yMax - yMin)) * (H - T - B);
    let s = '';
    [999.7, 999.8, 999.9].forEach((v) => {
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="g-grid"/>' +
           '<text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end" class="g-tick">' + fmt(v, 1) + '</text>';
    });
    for (let t = 0; t <= 10; t += 2) {
      s += '<text x="' + x(t) + '" y="' + (H - B + 20) + '" text-anchor="middle" class="g-tick">' + t + '</text>';
    }
    s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - B) + '" y2="' + (H - B) + '" class="g-axis"/>';
    s += '<text x="' + (L + (W - L - R) / 2) + '" y="' + (H - 6) + '" text-anchor="middle" class="g-label">Temperatura da água (°C)</text>';
    s += '<text transform="translate(14 ' + (T + (H - T - B) / 2) + ') rotate(-90)" text-anchor="middle" class="g-label">Densidade (kg/m³)</text>';
    const pts = data.map(([t, v]) => x(t).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
    s += '<polyline points="' + pts + '" class="g-line"/>';
    data.forEach(([t, v]) => { s += '<circle cx="' + x(t) + '" cy="' + y(v) + '" r="' + (t === 4 ? 6 : 3) + '" class="' + (t === 4 ? 'g-peak' : 'g-dot') + '"/>'; });
    s += '<line x1="' + x(4) + '" x2="' + x(4) + '" y1="' + y(999.972) + '" y2="' + (H - B) + '" class="g-drop"/>';
    s += '<text x="' + (x(4) + 12) + '" y="' + (y(999.972) - 8) + '" class="g-note">Densidade máxima: 4 °C</text>';
    s += '<text x="' + (x(0) + 8) + '" y="' + (y(999.84) + 22) + '" class="g-note g-note-frost">0 °C: a água já é menos densa</text>';
    svg.innerHTML = s;
  })();
})();
