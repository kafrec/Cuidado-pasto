(() => {
  'use strict';

  /* ---------- Constantes ---------- */
  const TOTAL = 28;
  const KEY = 'riego-pasto-v1';
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const DIAS3 = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const TASK_IDS = ['manana', 'repaso', 'largo', 'bordes', 'profundo', 'prueba', 'corte'];
  const TIERRA = { seca: 'Seca', humeda: 'Húmeda', encharcada: 'Encharcada' };
  const COLOR = { verde: 'Verde', amarillento: 'Amarillento', grisaceo: 'Grisáceo' };
  const LLUVIA = { si: 'Sí', no: 'No' };

  const FORECAST = {
    '2026-11-15': 22, '2026-11-16': 19, '2026-11-17': 22, '2026-11-18': 23, '2026-11-19': 22, '2026-11-20': 23,
    '2026-11-21': 21, '2026-11-22': 24, '2026-11-23': 24, '2026-11-24': 27, '2026-11-25': 30, '2026-11-26': 27
  };

  const PHASES = [null,
    { name: 'Enraizamiento', desc: 'Riego diario en la mañana y repaso corto a las 15:00 si la máxima es de 21 °C o más.', rango: 'Días 1 a 14 · 15 al 28 nov' },
    { name: 'Transición', desc: 'Riego largo día por medio. Los días sin riego, revisa los bordes.', rango: 'Días 15 a 21 · 29 nov al 5 dic' },
    { name: 'Establecido', desc: 'Riego profundo lunes, miércoles y viernes.', rango: 'Días 22 a 28 · 6 al 12 dic' }
  ];

  const HITOS = [
    { n: 14, txt: 'Prueba de enraizamiento' },
    { n: 16, txt: 'Primer corte' },
    { n: 21, txt: 'Último día sin pisar' },
    { n: 28, txt: 'Fin del seguimiento' }
  ];

  const SEED = {
    days: {
      '2026-11-15': { t: { manana: 'done', repaso: 'done' }, tierra: 'humeda', color: 'amarillento', lluvia: 'si', nota: 'Algunos pastos estaban más amarillos que otros.' },
      '2026-11-16': { t: { manana: 'done' }, tierra: 'humeda', color: 'amarillento', lluvia: 'no' },
      '2026-11-17': { t: { manana: 'done', repaso: 'done' }, tierra: 'humeda', color: 'amarillento', lluvia: 'no' },
      '2026-11-18': { t: { manana: 'done', repaso: 'done' }, tierra: 'humeda', color: 'verde', lluvia: 'no' },
      '2026-11-19': { t: { manana: 'done' }, tierra: 'humeda', color: 'verde', lluvia: 'no' },
      '2026-11-20': { t: { manana: 'done', repaso: 'done' } }
    },
    max: {}
  };

  /* ---------- Utilidades ---------- */
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dateOfDay = (n) => new Date(2026, 10, 15 + n - 1);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const longDate = (d) => `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
  const shortDate = (d) => `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;

  // Para pruebas: ?ahora=2026-11-21T16:00 simula la hora actual.
  const FAKE = (() => {
    try {
      const v = new URLSearchParams(location.search).get('ahora');
      const d = v ? new Date(v) : null;
      return d && !isNaN(d) ? d : null;
    } catch (e) { return null; }
  })();
  const now = () => FAKE || new Date();

  function todayRaw() {
    const t = now();
    const a = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    return Math.round((a - dateOfDay(1)) / 864e5) + 1;
  }
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------- Almacenamiento ---------- */
  let storageOK = true;

  function readStore() {
    try { return localStorage.getItem(KEY); } catch (e) { storageOK = false; return null; }
  }
  function writeStore(text) {
    try { localStorage.setItem(KEY, text); return true; } catch (e) { storageOK = false; return false; }
  }

  function sanitize(d) {
    if (!d || typeof d !== 'object' || !d.days || typeof d.days !== 'object') return null;
    const out = { days: {}, max: {} };
    const fecha = /^\d{4}-\d{2}-\d{2}$/;
    Object.keys(d.days).forEach((k) => {
      const r = d.days[k];
      if (!fecha.test(k) || !r || typeof r !== 'object') return;
      const o = { t: {} };
      if (r.t && typeof r.t === 'object') {
        TASK_IDS.forEach((id) => { if (r.t[id] === 'done' || r.t[id] === 'skip') o.t[id] = r.t[id]; });
      }
      if (r.tierra in TIERRA) o.tierra = r.tierra;
      if (r.color in COLOR) o.color = r.color;
      if (r.lluvia in LLUVIA) o.lluvia = r.lluvia;
      if (typeof r.nota === 'string') o.nota = r.nota.slice(0, 1000);
      out.days[k] = o;
    });
    if (d.max && typeof d.max === 'object') {
      Object.keys(d.max).forEach((k) => {
        const v = d.max[k];
        if (fecha.test(k) && typeof v === 'number' && isFinite(v) && v > -20 && v < 60) out.max[k] = v;
      });
    }
    return out;
  }

  function loadState() {
    const raw = readStore();
    if (raw) {
      try {
        const s = sanitize(JSON.parse(raw));
        if (s) return s;
      } catch (e) { /* datos dañados: se parte de los iniciales */ }
    }
    const s = clone(SEED);
    writeStore(JSON.stringify(s));
    return s;
  }

  let state = loadState();

  function persist() {
    const ok = writeStore(JSON.stringify(state));
    $('aviso-almacen').hidden = storageOK;
    return ok;
  }

  const rec = (key) => state.days[key] || {};
  function ensure(key) {
    if (!state.days[key]) state.days[key] = { t: {} };
    if (!state.days[key].t) state.days[key].t = {};
    return state.days[key];
  }
  function maxFor(key) {
    if (typeof state.max[key] === 'number') return state.max[key];
    return key in FORECAST ? FORECAST[key] : null;
  }

  /* ---------- Reglas del riego ---------- */
  const phaseOf = (n) => (n <= 14 ? 1 : n <= 21 ? 2 : 3);

  function tasksFor(n) {
    const d = dateOfDay(n), key = keyOf(d), ph = phaseOf(n), list = [];
    if (ph === 1) {
      list.push({ id: 'manana', title: 'Riego de la mañana', sub: 'Riego parejo, hasta dejar húmeda la tierra bajo el rollo', req: true });
      const m = maxFor(key);
      list.push({
        id: 'repaso', title: 'Repaso corto · 15:00', req: m !== null && m >= 21,
        sub: m === null ? 'Sin dato de máxima: solo si hace calor'
          : m >= 21 ? `Máxima de ${m} °C: toca repaso corto` : `Día fresco (${m} °C): repaso opcional`
      });
    } else if (ph === 2) {
      if ((n - 15) % 2 === 0) list.push({ id: 'largo', title: 'Riego largo', sub: 'Riego día por medio, en la mañana', req: true });
      else list.push({ id: 'bordes', title: 'Revisar los bordes', sub: 'Hoy no se riega: mira que bordes y uniones no se sequen', req: true });
    } else if ([1, 3, 5].includes(d.getDay())) {
      list.push({ id: 'profundo', title: 'Riego profundo', sub: 'Lunes, miércoles y viernes, en la mañana', req: true });
    }
    if (n === 14) list.push({ id: 'prueba', title: 'Prueba de enraizamiento', sub: 'Tira suave de una esquina: si ofrece resistencia, ya enraizó', req: true });
    if (n === 16) list.push({ id: 'corte', title: 'Primer corte', sub: 'Solo si mide 8 a 10 cm; corta solo la punta', req: true });
    return list;
  }

  function notasDia(n) {
    const out = [];
    if (phaseOf(n) === 3 && ![1, 3, 5].includes(dateOfDay(n).getDay())) out.push('Hoy no toca riego. Se riega lunes, miércoles y viernes.');
    if (n === 21) out.push('Desde mañana ya puedes pisar el pasto con cuidado.');
    if (n > 21) out.push('Ya puedes pisar el pasto con cuidado.');
    if (n === 28) out.push('Último día del seguimiento.');
    return out;
  }

  function dayStatus(n) {
    const tr = todayRaw();
    if (n > tr) return 'fut';
    const req = tasksFor(n).filter((t) => t.req);
    if (!req.length) return 'rest';
    const t = rec(keyOf(dateOfDay(n))).t || {};
    let d = 0, s = 0;
    req.forEach((x) => { if (t[x.id] === 'done') d++; else if (t[x.id] === 'skip') s++; });
    if (d + s === req.length) return d === 0 ? 'skip' : 'ok';
    if (d + s === 0) return n === tr ? 'pend' : 'miss';
    return 'part';
  }

  const resolvedDay = (n) => {
    const st = dayStatus(n);
    return st === 'ok' || st === 'skip' || st === 'rest';
  };

  function stats() {
    const tr = todayRaw(), last = Math.min(tr, TOTAL);
    let req = 0, done = 0;
    for (let n = 1; n <= last; n++) {
      const t = rec(keyOf(dateOfDay(n))).t || {};
      tasksFor(n).filter((x) => x.req).forEach((x) => {
        const s = t[x.id];
        if (s === 'skip') return;
        if (n === tr && !s) return; // lo pendiente de hoy aún no cuenta en contra
        req++;
        if (s === 'done') done++;
      });
    }
    let streak = 0;
    for (let n = last; n >= 1; n--) {
      if (resolvedDay(n)) streak++;
      else if (n === tr) continue;
      else break;
    }
    const base = clamp(tr, 1, TOTAL);
    const h = HITOS.find((x) => x.n >= base);
    let hito;
    if (tr > TOTAL) hito = { big: '✓', small: 'Seguimiento terminado' };
    else if (tr < 1) hito = { big: '—', small: 'Aún no parte' };
    else {
      const diff = h.n - tr;
      hito = { big: diff === 0 ? 'Hoy' : diff === 1 ? 'Mañana' : `${diff} días`, small: `${h.txt} · ${shortDate(dateOfDay(h.n))}` };
    }
    return { pct: req ? Math.round((done / req) * 100) : null, streak, hito };
  }

  function mensaje(n) {
    const nw = now(), h = nw.getHours() + nw.getMinutes() / 60;
    const tasks = tasksFor(n), t = rec(keyOf(dateOfDay(n))).t || {};
    const am = tasks.find((x) => ['manana', 'largo', 'profundo'].includes(x.id));
    const rep = tasks.find((x) => x.id === 'repaso');
    if (h >= 19) return { cls: 'stop', txt: 'Ya no riegues hoy. Pasadas las 19:00 el pasto queda húmedo toda la noche.' };
    if (h >= 15.5) return { cls: 'sol', txt: 'Sol directo sobre el pasto: si se ve grisáceo, dale un riego corto (antes de las 19:00).' };
    if (h >= 14 && rep) {
      return { cls: rep.req ? 'sol' : 'info', txt: (h >= 15 ? 'Es la hora del repaso de las 15:00. ' : 'Prepara el repaso de las 15:00. ') + (rep.req ? 'Hoy toca, por el calor.' : 'Hoy es opcional: es un día fresco.') };
    }
    if (am) {
      if (t[am.id] === 'done') return { cls: 'ok', txt: `${am.title} listo.` + (rep ? ' Más tarde viene el repaso de las 15:00.' : ' Hoy no necesitas regar más.') };
      if (t[am.id] === 'skip') return { cls: 'info', txt: `${am.title} omitido hoy.` };
      return { cls: 'info', txt: h < 14 ? `Hora del riego de la mañana (${am.title.toLowerCase()}).` : `Aún no registras el ${am.title.toLowerCase()}: hazlo antes de las 19:00.` };
    }
    return { cls: 'info', txt: phaseOf(n) === 2 ? 'Hoy no se riega: revisa los bordes y uniones.' : 'Hoy no toca riego.' };
  }

  function consejos(n, r) {
    const out = [];
    const tr = todayRaw(), late = n === tr && now().getHours() >= 19;
    if (r.tierra === 'seca') {
      out.push(late ? { a: true, txt: 'Tierra seca, pero ya pasó la hora: mañana riega temprano y un poco más.' }
        : n === tr ? { a: true, txt: 'Tierra seca: riega unos minutos ahora (solo si es antes de las 19:00).' }
          : { a: true, txt: 'Ese día la tierra estaba seca: riega unos minutos (siempre antes de las 19:00).' });
    }
    if (r.tierra === 'encharcada') out.push({ a: true, txt: 'Tierra encharcada: salta el próximo riego y deja que drene.' });
    if (r.color === 'grisaceo') out.push({ a: true, txt: late ? 'Pasto grisáceo: mañana temprano dale un riego corto.' : 'Pasto grisáceo: dale un riego corto ahora (antes de las 19:00).' });
    if (r.color === 'amarillento') {
      out.push({ txt: n <= 14 ? 'Pasto amarillento: es normal las primeras semanas. Da más agua en bordes y uniones.' : 'Pasto amarillento: da más agua en bordes y uniones y revisa que la tierra no esté seca.' });
    }
    if (r.lluvia === 'si') {
      out.push({ txt: r.tierra === 'humeda' ? 'Llovió y la tierra está húmeda: puedes marcar el riego como omitido.' : 'Llovió: revisa la tierra bajo el rollo antes de decidir si riegas o lo omites.' });
    }
    return out;
  }

  /* ---------- Estado de la interfaz ---------- */
  let tab = 'hoy';
  let sel = clamp(todayRaw(), 1, TOTAL);
  let toastTimer = null;

  function toast(txt) {
    const t = $('toast');
    t.textContent = txt;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1300);
  }
  function saved() { persist(); toast('Guardado'); }

  /* ---------- Vistas ---------- */
  function statsHTML() {
    const s = stats();
    return `<div class="stats">
      <div class="stat"><b>${s.pct === null ? '—' : s.pct + '%'}</b><span>riegos cumplidos</span></div>
      <div class="stat"><b>${s.streak}</b><span>${s.streak === 1 ? 'día al día (racha)' : 'días al día (racha)'}</span></div>
      <div class="stat hito"><b>${esc(s.hito.big)}</b><span>${esc(s.hito.small)}</span></div>
    </div>`;
  }

  function ringSVG(n) {
    const C = 2 * Math.PI * 52, off = C * (1 - n / TOTAL);
    return `<svg class="ring" viewBox="0 0 120 120" role="img" aria-label="Día ${n} de ${TOTAL}">
      <circle class="ring-bg" cx="60" cy="60" r="52"/>
      <circle class="ring-fg" cx="60" cy="60" r="52" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 60 60)"/>
      <text x="60" y="48" class="r-s">Día</text><text x="60" y="78" class="r-n">${n}</text><text x="60" y="97" class="r-s">de ${TOTAL}</text></svg>`;
  }

  function renderHoy(center) {
    const root = $('tab-hoy');
    const oldStrip = root.querySelector('.strip');
    const sl = oldStrip ? oldStrip.scrollLeft : 0, y = window.scrollY;

    const n = sel, d = dateOfDay(n), key = keyOf(d), r = rec(key), tr = todayRaw();
    const fut = n > tr, isToday = n === tr, ph = PHASES[phaseOf(n)];
    const tasks = tasksFor(n), t = r.t || {};
    const req = tasks.filter((x) => x.req);
    const hechas = req.filter((x) => t[x.id]).length;
    const pct = fut ? 0 : req.length ? Math.round((hechas / req.length) * 100) : 100;
    const m = maxFor(key), edited = typeof state.max[key] === 'number';
    const fuente = edited ? 'editada por ti' : key in FORECAST ? 'pronóstico' : 'sin dato';

    let chips = '';
    for (let i = 1; i <= TOTAL; i++) {
      const di = dateOfDay(i);
      chips += `<button class="chip${i === sel ? ' sel' : ''}${i === tr ? ' today' : ''}${i > tr ? ' fut' : ''}" data-act="sel-day" data-n="${i}" aria-label="Día ${i}, ${longDate(di)}"${i === sel ? ' aria-current="true"' : ''}>
        <span class="w">${DIAS3[di.getDay()]}</span><span class="d">${di.getDate()}</span><span class="dot st-${dayStatus(i)}"></span></button>`;
    }

    let banners = '';
    if (isToday) { const ms = mensaje(n); banners += `<div class="banner ${ms.cls}" id="msg">${esc(ms.txt)}</div>`; }
    else if (fut) banners += `<div class="banner info">Día futuro: puedes ver qué toca, pero aún no se registra.</div>`;
    else banners += `<div class="banner info">Estás viendo un día pasado. Puedes editarlo.</div>`;
    notasDia(n).forEach((x) => { banners += `<div class="banner ok">${esc(x)}</div>`; });

    const taskHTML = tasks.length ? tasks.map((x) => {
      const s = t[x.id] || '';
      const lab = s === 'done' ? 'Hecho' : s === 'skip' ? 'Omitido' : 'Pendiente';
      const ic = s === 'done' ? '✓' : s === 'skip' ? '–' : '';
      return `<button class="task ${s}" data-act="task" data-id="${x.id}"${fut ? ' disabled' : ''} aria-label="${esc(x.title)}: ${lab}. Toca para cambiar.">
        <span class="ic" aria-hidden="true">${ic}</span>
        <span class="tx"><b>${esc(x.title)}${x.req ? '' : '<span class="tag">opcional</span>'}</b><small>${esc(x.sub)}</small></span>
        <span class="lab">${lab}</span></button>`;
    }).join('') : '<p class="small">No hay tareas para este día.</p>';

    const opt = (field, map) => Object.keys(map).map((v) =>
      `<button class="opt${r[field] === v ? ' on' : ''}" data-act="opt" data-field="${field}" data-val="${v}"${fut ? ' disabled' : ''} aria-pressed="${r[field] === v}">${map[v]}</button>`).join('');

    const tips = fut ? [] : consejos(n, r);

    root.innerHTML = `
      <div class="strip" aria-label="Selector de días">${chips}</div>
      <div class="card hero">${ringSVG(n)}
        <div class="info"><div class="fecha">${longDate(d)}</div>
          <span class="badge">Fase ${phaseOf(n)} · ${ph.name}</span>
          <div class="fase">${ph.rango}</div></div></div>
      ${banners}
      <div class="rule">Nunca riegues después de las 19:00. Sol directo sobre el pasto: 15:30 a 19:00.</div>
      <div class="card"><h2>Tareas del día</h2>
        <div class="small">${fut ? 'Aún no corresponde' : req.length ? `${hechas} de ${req.length} tareas resueltas` : 'Día sin tareas obligatorias'}</div>
        <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
        ${taskHTML}
        ${tasks.length ? '<div class="small">Toca una tarea: pendiente → hecho → omitido.</div>' : ''}
      </div>
      <div class="card"><h2>Temperatura máxima</h2>
        <div class="maxrow"><div class="lbl small">Considera el repaso de las 15:00 (${fuente})</div>
          <button class="step" data-act="max-step" data-d="-1" aria-label="Bajar un grado">−</button>
          <input id="maxinput" type="number" inputmode="numeric" min="-5" max="45" step="1" value="${m === null ? '' : m}" placeholder="—" aria-label="Máxima en grados">
          <button class="step" data-act="max-step" data-d="1" aria-label="Subir un grado">+</button>
          <span>°C</span>
          ${edited ? '<button class="link" data-act="max-reset">Volver al pronóstico</button>' : ''}
        </div></div>
      <div class="card"><h2>Registro del día</h2>
        <div class="group"><div class="q">Tierra bajo el rollo</div><div class="opts">${opt('tierra', TIERRA)}</div></div>
        <div class="group"><div class="q">Color del pasto</div><div class="opts">${opt('color', COLOR)}</div></div>
        <div class="group"><div class="q">¿Llovió?</div><div class="opts">${opt('lluvia', LLUVIA)}</div></div>
        <div class="group"><div class="q"><label for="nota">Nota</label></div>
          <textarea id="nota" maxlength="500" placeholder="${fut ? 'Disponible cuando llegue el día' : 'Escribe lo que observaste…'}"${fut ? ' disabled' : ''}>${esc(r.nota || '')}</textarea></div>
      </div>
      ${tips.length ? `<div class="card"><h2>Consejo</h2><ul class="tips">${tips.map((x) => `<li class="${x.a ? 'alert' : ''}">${esc(x.txt)}</li>`).join('')}</ul></div>` : ''}
      ${statsHTML()}`;

    const strip = root.querySelector('.strip');
    if (center) {
      const b = strip.querySelector('.sel');
      strip.scrollLeft = b.offsetLeft - (strip.clientWidth - b.offsetWidth) / 2;
    } else strip.scrollLeft = sl;
    window.scrollTo(0, y);
  }

  function renderSeg() {
    const tr = todayRaw();
    let cells = ['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((x) => `<div class="h">${x}</div>`).join('');
    for (let n = 1; n <= TOTAL; n++) {
      const d = dateOfDay(n), r = rec(keyOf(d)), st = dayStatus(n);
      cells += `<button class="cell st-${st}${n === tr ? ' today' : ''}" data-act="go-day" data-n="${n}" aria-label="Día ${n}, ${longDate(d)}">
        <b>${n}</b><small>${d.getDate()}/${d.getMonth() + 1}</small>${r.color && n <= tr ? `<i class="pc ${r.color}"></i>` : ''}</button>`;
    }
    let log = '';
    for (let n = TOTAL; n >= 1; n--) {
      const d = dateOfDay(n), r = rec(keyOf(d));
      if (!r.nota || !r.nota.trim()) continue;
      const chips = [r.tierra && `tierra ${TIERRA[r.tierra].toLowerCase()}`, r.color && `pasto ${COLOR[r.color].toLowerCase()}`, r.lluvia === 'si' && 'llovió'].filter(Boolean).join(' · ');
      log += `<li><div class="meta"><button data-act="go-day" data-n="${n}">Día ${n} · ${longDate(d)}</button>${chips ? ' · ' + chips : ''}</div><p>${esc(r.nota)}</p></li>`;
    }
    $('tab-seg').innerHTML = `
      ${statsHTML()}
      <div class="card"><h2>Los 28 días</h2><div class="grid">${cells}</div>
        <div class="legend"><span><i style="background:var(--ok)"></i>Al día</span><span><i style="background:var(--part)"></i>Parcial</span><span><i style="background:var(--miss)"></i>Faltó</span><span><i style="background:var(--skip)"></i>Omitido</span><span><i style="background:var(--rest)"></i>Sin riego</span>
          <span><i class="c" style="background:#3fae4f"></i>Verde</span><span><i class="c" style="background:#e8c52e"></i>Amarillento</span><span><i class="c" style="background:#8d9690"></i>Grisáceo</span></div>
        <p class="small">Los riegos cumplidos cuentan las tareas obligatorias hechas; las omitidas a propósito no restan. Toca un día para abrirlo.</p></div>
      <div class="card"><h2>Bitácora</h2>${log ? `<ul class="log">${log}</ul>` : '<p class="small">Aún no hay notas. Escríbelas en el registro de cada día.</p>'}</div>`;
  }

  function renderDatos() {
    const canShare = !!(navigator.canShare && typeof File === 'function' && navigator.canShare({ files: [new File(['{}'], 'a.json', { type: 'application/json' })] }));
    $('tab-datos').innerHTML = `
      <div class="card"><h2>Respaldo</h2>
        <p class="small">Los datos viven solo en este teléfono. Exporta un archivo para guardarlos o pasarlos a otro teléfono.</p>
        <button class="btn" data-act="export">Exportar datos (JSON)</button>
        ${canShare ? '<button class="btn sec" data-act="share">Compartir respaldo…</button>' : ''}
        <button class="btn sec" data-act="import">Importar datos (JSON)</button>
        <input type="file" id="file" accept="application/json,.json" hidden>
      </div>
      <div class="card"><h2>Restaurar</h2>
        <p class="small">Vuelve a los datos iniciales (15 al 20 de noviembre) y borra lo registrado después.</p>
        <button class="btn danger" data-act="reset">Restaurar datos iniciales</button></div>
      <p class="small" style="text-align:center">${storageOK ? 'Almacenamiento local activo.' : 'Almacenamiento local no disponible.'}</p>`;
  }

  function render(center) {
    if (tab === 'hoy') renderHoy(center);
    else if (tab === 'seg') renderSeg();
    else renderDatos();
  }

  function setTab(name) {
    tab = name;
    ['hoy', 'seg', 'datos'].forEach((x) => { $('tab-' + x).hidden = x !== name; });
    document.querySelectorAll('.tabbar button').forEach((b) => {
      const on = b.dataset.tab === name;
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    render(true);
    window.scrollTo(0, 0);
  }

  /* ---------- Exportar / importar ---------- */
  function exportJSON() {
    return JSON.stringify({ app: 'riego-pasto', version: 1, exportado: now().toISOString(), days: state.days, max: state.max }, null, 2);
  }
  const fileName = () => `riego-pasto-${keyOf(now())}.json`;

  function doExport() {
    try {
      const url = URL.createObjectURL(new Blob([exportJSON()], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = fileName();
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast('Respaldo exportado');
    } catch (e) { toast('No se pudo exportar'); }
  }
  async function doShare() {
    try {
      await navigator.share({ files: [new File([exportJSON()], fileName(), { type: 'application/json' })], title: 'Respaldo riego del pasto' });
    } catch (e) { if (!e || e.name !== 'AbortError') toast('No se pudo compartir'); }
  }
  function doImport(file) {
    if (!file) return;
    const fr = new FileReader();
    fr.onerror = () => toast('No se pudo leer el archivo');
    fr.onload = () => {
      let s = null;
      try { s = sanitize(JSON.parse(fr.result)); } catch (e) { s = null; }
      if (!s) { toast('Archivo no válido'); return; }
      if (!confirm('Esto reemplaza los datos actuales de este teléfono por los del archivo. ¿Continuar?')) return;
      state = s; persist(); render(false); toast('Datos importados');
    };
    fr.readAsText(file);
  }

  /* ---------- Eventos ---------- */
  function setMax(v) {
    const key = keyOf(dateOfDay(sel));
    if (v === null) delete state.max[key]; else state.max[key] = clamp(Math.round(v), -5, 45);
    saved(); renderHoy(false);
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'tab') return setTab(b.dataset.tab);
    if (act === 'sel-day') { sel = +b.dataset.n; return renderHoy(true); }
    if (act === 'go-day') { sel = +b.dataset.n; return setTab('hoy'); }
    if (act === 'task') {
      if (sel > todayRaw()) return;
      const r = ensure(keyOf(dateOfDay(sel))), id = b.dataset.id, cur = r.t[id];
      if (!cur) r.t[id] = 'done'; else if (cur === 'done') r.t[id] = 'skip'; else delete r.t[id];
      saved(); return renderHoy(false);
    }
    if (act === 'opt') {
      if (sel > todayRaw()) return;
      const r = ensure(keyOf(dateOfDay(sel))), f = b.dataset.field, v = b.dataset.val;
      if (r[f] === v) delete r[f]; else r[f] = v;
      saved(); return renderHoy(false);
    }
    if (act === 'max-step') {
      const cur = maxFor(keyOf(dateOfDay(sel)));
      return setMax((cur === null ? 20 : cur) + (+b.dataset.d));
    }
    if (act === 'max-reset') return setMax(null);
    if (act === 'export') return doExport();
    if (act === 'share') return doShare();
    if (act === 'import') { const f = $('file'); if (f) f.click(); return; }
    if (act === 'reset') {
      if (confirm('Se borrará todo lo registrado y volverán los datos iniciales. ¿Continuar?')) {
        state = clone(SEED); persist(); render(false); toast('Datos restaurados');
      }
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.id !== 'nota' || sel > todayRaw()) return;
    const r = ensure(keyOf(dateOfDay(sel)));
    r.nota = e.target.value;
    saved();
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'maxinput') {
      const v = e.target.value.trim();
      const num = Number(v);
      if (v === '') setMax(null); else if (isFinite(num)) setMax(num); else renderHoy(false);
    } else if (e.target.id === 'file') {
      doImport(e.target.files && e.target.files[0]);
      e.target.value = '';
    }
  });

  function refreshClock() {
    const a = document.activeElement;
    if (tab === 'hoy' && sel === todayRaw() && !(a && /^(TEXTAREA|INPUT)$/.test(a.tagName))) renderHoy(false);
  }
  setInterval(refreshClock, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshClock(); });

  /* ---------- Inicio ---------- */
  $('aviso-almacen').hidden = storageOK;
  render(true);

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }
})();
