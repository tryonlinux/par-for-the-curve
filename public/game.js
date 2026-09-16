(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const minus = (s) => String(s).replace(/-/g, '−');
  const fmt = (v) => minus(String(+(+v).toFixed(4)));
  const toParStr = (d) => (d === 0 ? 'E' : d > 0 ? `+${d}` : minus(d));
  const toParClass = (d) => (d < 0 ? 'under' : d > 0 ? 'over' : '');

  const PREFIX = 'gtg:v3:';
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem(PREFIX + k);
        return v == null ? d : JSON.parse(v);
      } catch { return d; }
    },
    set(k, v) {
      try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch { /* storage unavailable */ }
    },
    del(k) {
      try { localStorage.removeItem(PREFIX + k); } catch { /* storage unavailable */ }
    },
  };

  function seedFrom(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const steps = (lo, hi, step = 1) => {
    const o = [];
    for (let v = lo; v <= hi + 1e-9; v += step) o.push(+v.toFixed(6));
    return o;
  };
  const ints = (lo, hi) => steps(lo, hi);
  const nz = (lo, hi) => ints(lo, hi).filter((v) => v !== 0);
  const nzs = (lo, hi, step) => steps(lo, hi, step).filter((v) => v !== 0);
  const pm = (...vs) => [...vs.map((v) => -v).reverse(), ...vs];

  // ---------------------------------------------------------------------------
  // The course: 18 holes, getting harder. Template placeholders are {name:role}
  //   c = coefficient, k = constant, s = shift inside (x − h), e = exponent.
  // ---------------------------------------------------------------------------
  const HOLES = [
    { name: 'The Straightaway', par: 3, tpl: 'y = {a:c}x + {b:k}',
      params: { a: nz(-7, 7), b: steps(-14, 14, 0.5) },
      f: (p, x) => p.a * x + p.b },
    { name: 'Gentle Slope', par: 3, tpl: 'y = {a:c}x + {b:k}',
      params: { a: pm(0.25, 0.5, 0.75, 1.25, 1.5, 1.75, 2.5, 3.5), b: steps(-14, 14, 0.5) },
      f: (p, x) => p.a * x + p.b },
    { name: 'The Bowl', par: 3, tpl: 'y = {a:c}x² + {c:k}',
      params: { a: pm(0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3), c: steps(-12, 12, 0.5) },
      f: (p, x) => p.a * x * x + p.c },
    { name: 'Shifted Valley', par: 4, tpl: 'y = {a:c}(x − {h:s})² + {k:k}',
      params: { a: pm(0.25, 0.5, 1, 2), h: nz(-7, 7), k: ints(-6, 6) },
      f: (p, x) => p.a * (x - p.h) ** 2 + p.k },
    { name: 'The Dogleg', par: 4, tpl: 'y = {a:c}|x − {h:s}| + {k:k}',
      params: { a: pm(0.25, 0.5, 1, 1.5, 2, 3), h: nz(-7, 7), k: ints(-6, 6) },
      f: (p, x) => p.a * Math.abs(x - p.h) + p.k },
    { name: 'Full Quadratic', par: 5, tpl: 'y = {a:c}x² + {b:c}x + {c:k}',
      params: { a: pm(0.25, 0.5, 1, 2), b: nz(-6, 6), c: ints(-8, 8) },
      f: (p, x) => p.a * x * x + p.b * x + p.c },
    { name: 'Power Play', par: 4, tpl: 'y = {a:c}x{n:e} + {k:k}',
      params: { a: pm(0.25, 0.5, 1, 2, 3), n: ints(2, 6), k: ints(-6, 6) },
      f: (p, x) => p.a * Math.pow(x, p.n) + p.k },
    { name: 'The S-Curve', par: 4, tpl: 'y = {a:c}x³ + {b:c}x',
      params: { a: pm(0.1, 0.2, 0.25, 0.4, 0.5, 0.6, 0.75, 1), b: nzs(-10, 10, 0.5) },
      f: (p, x) => p.a * x ** 3 + p.b * x },
    { name: 'Moved Power', par: 6, tpl: 'y = {a:c}(x − {h:s}){n:e} + {k:k}',
      params: { a: pm(0.25, 0.5, 1, 2), h: nz(-6, 6), n: ints(2, 4), k: ints(-6, 6) },
      f: (p, x) => p.a * Math.pow(x - p.h, p.n) + p.k },

    { name: 'Water Hazard', par: 3, tpl: 'y = {a:c}sin(x) + {c:k}',
      params: { a: nzs(-6, 6, 0.5), c: steps(-8, 8, 0.5) },
      f: (p, x) => p.a * Math.sin(x) + p.c },
    { name: 'Rolling Waves', par: 3, tpl: 'y = {a:c}sin({b:c}x)',
      params: { a: nzs(-6, 6, 0.5), b: steps(0.25, 6, 0.25) },
      f: (p, x) => p.a * Math.sin(p.b * x) },
    { name: "Surf's Up", par: 4, tpl: 'y = {a:c}cos({b:c}x) + {k:k}',
      params: { a: nzs(-5, 5, 0.5), b: steps(0.25, 2, 0.25), k: ints(-4, 4) },
      f: (p, x) => p.a * Math.cos(p.b * x) + p.k },
    { name: 'The Root Cellar', par: 4, tpl: 'y = {a:c}√(x − {h:s}) + {k:k}',
      params: { a: pm(0.25, 0.5, 1, 1.5, 2, 3), h: nz(-8, 4), k: ints(-6, 6) },
      f: (p, x) => p.a * Math.sqrt(x - p.h) + p.k },
    { name: 'The Hyperbola', par: 4, tpl: 'y = {a:c}/(x − {h:s}) + {k:k}',
      params: { a: nz(-9, 9), h: nz(-6, 6), k: ints(-5, 5) },
      f: (p, x) => p.a / (x - p.h) + p.k },
    { name: 'Wavy Ramp', par: 4, tpl: 'y = {a:c}sin({b:c}x) + {c:c}x',
      params: { a: nzs(-5, 5, 0.5), b: steps(0.25, 2, 0.25), c: pm(0.25, 0.5, 0.75, 1) },
      f: (p, x) => p.a * Math.sin(p.b * x) + p.c * x },
    { name: 'Double Power', par: 4, tpl: 'y = {a:c}x{n:e} + {b:c}x{m:e}',
      params: { a: pm(0.1, 0.2, 0.25, 0.5, 0.75, 1), n: [3, 4, 5], b: nz(-6, 6), m: [1, 2] },
      f: (p, x) => p.a * Math.pow(x, p.n) + p.b * Math.pow(x, p.m) },
    { name: 'Three Roots', par: 5, tpl: 'y = {a:c}(x − {p:s})(x − {q:s})(x − {r:s})',
      params: { a: pm(0.1, 0.2, 0.25, 0.5), p: nz(-6, 6), q: nz(-6, 6), r: nz(-6, 6) },
      valid: (p) => p.p < p.q && p.q < p.r,
      f: (p, x) => p.a * (x - p.p) * (x - p.q) * (x - p.r) },
    { name: 'The Clubhouse', par: 5, tpl: 'y = {a:c}sin({b:c}x) + {c:c}x² + {d:k}',
      params: { a: nz(-4, 4), b: steps(0.5, 3, 0.5), c: pm(0.1, 0.2, 0.25, 0.5), d: ints(-4, 4) },
      f: (p, x) => p.a * Math.sin(p.b * x) + p.c * x * x + p.d },
  ];

  function tokenize(tpl) {
    const re = /( [+−] )?\{(\w+):([ckse])\}/g;
    const toks = [];
    let last = 0;
    let m;
    while ((m = re.exec(tpl))) {
      if (m.index > last) toks.push({ t: 'txt', s: tpl.slice(last, m.index) });
      toks.push({ t: 'p', op: m[1] ? m[1].trim() : null, k: m[2], role: m[3] });
      last = re.lastIndex;
    }
    if (last < tpl.length) toks.push({ t: 'txt', s: tpl.slice(last) });
    return toks;
  }

  HOLES.forEach((h) => {
    h.toks = tokenize(h.tpl);
    h.keys = h.toks.filter((t) => t.t === 'p').map((t) => t.k);
  });
  const TOTAL_PAR = HOLES.reduce((s, h) => s + h.par, 0);
  const DEFAULT_XH = 10;

  // ---------------------------------------------------------------------------
  // Math
  // ---------------------------------------------------------------------------
  // Every playable target for a hole, shuffled once into a fixed order. Built on
  // first use of that hole and then cached for the session.
  function holePool(hole) {
    if (hole.pool) return hole.pool;
    const keys = hole.keys;
    const sets = keys.map((k) => hole.params[k]);
    const pool = [];
    const walk = (i, p) => {
      if (i === keys.length) {
        if ((!hole.valid || hole.valid(p)) && frameable(hole, p)) pool.push(p);
        return;
      }
      for (const v of sets[i]) walk(i + 1, { ...p, [keys[i]]: v });
    };
    walk(0, {});
    const rng = mulberry32(seedFrom(`pool:${hole.name}`));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    hole.pool = pool;
    return pool;
  }

  // Framing: pick a window that shows a useful amount of the curve. Zoom ladder is
  // centred on the standard window so a curve that already fits keeps the usual scale.
  const FIT_STEPS = [2, 2.5, 3, 4, 5, 6.5, 8, 10, 13, 16, 20, 26, 32, 40, 50, 65, 80, 100];
  // How much of the window the curve actually occupies: either a good stretch of x,
  // or a good stretch of y (a steep line crosses the window even at tiny x-extent).
  const cover = (frac, spread) => Math.max(frac, 0.6 * spread);
  const GOOD_COVER = 0.35;
  const MIN_COVER = 0.3;

  function frameScore(hole, p, xh, aspect, N = 160) {
    const yh = xh * aspect;
    let inView = 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i <= N; i++) {
      const y = hole.f(p, -xh + (2 * xh * i) / N);
      if (!Number.isFinite(y) || Math.abs(y) > yh) continue;
      inView++;
      if (y < lo) lo = y;
      if (y > hi) hi = y;
    }
    return { frac: inView / (N + 1), spread: inView ? (hi - lo) / (2 * yh) : 0 };
  }

  function fitXh(hole, p, aspect) {
    if (!p) return DEFAULT_XH;
    const near = (xh) => Math.abs(Math.log(xh / DEFAULT_XH));
    let pick = null;
    let best = DEFAULT_XH;
    let bestCover = -1;
    for (const xh of FIT_STEPS) {
      const { frac, spread } = frameScore(hole, p, xh, aspect);
      const c = cover(frac, spread);
      // Prefer the standard window, and among good frames the one nearest to it.
      if (c >= GOOD_COVER && (pick === null || near(xh) < near(pick))) pick = xh;
      if (c > bestCover) { bestCover = c; best = xh; }
    }
    return pick === null ? best : pick;
  }

  // Pool filter: is there any window that shows a useful amount of this curve?
  const COARSE_STEPS = [10, 5, 20, 3, 40, 2, 80];
  function frameable(hole, p) {
    for (const xh of COARSE_STEPS) {
      const { frac, spread } = frameScore(hole, p, xh, 0.72, 48);
      if (cover(frac, spread) >= MIN_COVER) return true;
    }
    return false;
  }

  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const mod = (a, n) => ((a % n) + n) % n;
  const DAY_ZERO = Date.UTC(2026, 0, 1);

  function dayNumber(id) {
    const [y, m, d] = id.slice(2).split('-').map(Number);
    return Math.round((Date.UTC(y, m - 1, d) - DAY_ZERO) / 86400000);
  }

  // Daily courses step through each hole's shuffled pool with a stride coprime to
  // the pool size, so a hole cannot repeat until its whole pool is used up.
  function pickTarget(id, i) {
    const hole = HOLES[i];
    const pool = holePool(hole);
    const n = pool.length;
    if (!n) return null;
    if (id.startsWith('D-')) {
      const seed = seedFrom(`stride:${hole.name}`);
      let stride = 1 + (seed % n);
      while (gcd(stride, n) !== 1) stride = (stride % n) + 1;
      const offset = seedFrom(`offset:${hole.name}`) % n;
      return pool[mod(offset + stride * dayNumber(id), n)];
    }
    return pool[Math.floor(mulberry32(seedFrom(`${id}#${i}`))() * n)];
  }

  function matches(hole, target, guess) {
    for (let i = 0; i <= 300; i++) {
      const x = -12 + (24 * i) / 300 + 0.012345;
      const a = hole.f(target, x);
      const b = hole.f(guess, x);
      const fa = Number.isFinite(a);
      const fb = Number.isFinite(b);
      if (fa !== fb) return false;
      if (fa && Math.abs(a - b) > 1e-6 * Math.max(1, Math.abs(a))) return false;
    }
    return true;
  }

  function parseNum(raw) {
    const s = String(raw).trim().replace(/[−–—]/g, '-').replace(/\s+/g, '');
    if (!s) return NaN;
    const frac = s.match(/^([+-]?(?:\d+\.?\d*|\.\d+))\/((?:\d+\.?\d*|\.\d+))$/);
    if (frac) return +frac[1] / +frac[2];
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(s)) return +s;
    return NaN;
  }

  const toParams = (hole, vals) => Object.fromEntries(hole.keys.map((k, i) => [k, vals[i]]));

  // ---------------------------------------------------------------------------
  // Equation rendering
  // ---------------------------------------------------------------------------
  const mathHTML = (s) => esc(s).replace(/[xy]/g, (m) => `<i>${m}</i>`);

  function equationHTML(hole, p) {
    const toks = hole.toks;
    let out = '';
    for (let i = 0; i < toks.length; i++) {
      const tk = toks[i];
      if (tk.t === 'txt') { out += mathHTML(tk.s); continue; }
      const v = p[tk.k];
      if (tk.role === 'e') {
        if (v !== 1) out += `<sup>${fmt(v)}</sup>`;
        continue;
      }
      if (tk.role === 'k' && v === 0) continue;
      let neg = v < 0;
      if (tk.op === '−') neg = !neg;
      const abs = Math.abs(v);
      let num = fmt(abs);
      const next = toks[i + 1];
      if (tk.role === 'c' && abs === 1 && next && next.t === 'txt' && /^[a-z(|√]/i.test(next.s)) num = '';
      if (tk.op) out += neg ? ' − ' : ' + ';
      else if (neg) out += '−';
      out += num;
    }
    return out;
  }

  function describeSet(k, set) {
    const lo = Math.min(...set);
    const hi = Math.max(...set);
    const hasZero = set.includes(0);
    const full = hasZero ? set.slice() : [...set, 0].sort((a, b) => a - b);
    const gap = +(full[1] - full[0]).toFixed(6);
    const even = lo < 0 && hi > 0 && full.every((v, i) => i === 0 || +(v - full[i - 1]).toFixed(6) === gap);
    if (even) {
      const tail = hasZero ? '' : ', not 0';
      const unit = gap === 1 ? `whole number ${fmt(lo)}` : `multiple of ${fmt(gap)} from ${fmt(lo)}`;
      return `<i>${k}</i>: ${unit} to ${fmt(hi)}${tail}`;
    }
    if (set.every(Number.isInteger) && hi - lo + 1 === set.length) {
      return `<i>${k}</i>: whole number ${fmt(lo)} to ${fmt(hi)}`;
    }
    const gap2 = +(set[1] - set[0]).toFixed(6);
    if (lo > 0 && set.every((v, i) => i === 0 || +(v - set[i - 1]).toFixed(6) === gap2)) {
      const unit = gap2 === 1 ? `whole number ${fmt(lo)}` : `multiple of ${fmt(gap2)} from ${fmt(lo)}`;
      return `<i>${k}</i>: ${unit} to ${fmt(hi)}`;
    }
    return `<i>${k}</i> ∈ {${set.map(fmt).join(', ')}}`;
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const el = {
    canvas: $('#canvas'),
    plot: $('#plot'),
    equation: $('#equation'),
    hints: $('#hints'),
    form: $('#guessForm'),
    shotMsg: $('#shotMsg'),
    result: $('#result'),
    history: $('#history'),
    scorecard: $('#scorecard'),
    toast: $('#toast'),
  };
  const ctx = el.canvas.getContext('2d');

  let course = null; // { id, targets, cur, holes, submitted, entryId }
  let view = { cx: 0, cy: 0, xh: DEFAULT_XH, marksOn: false };
  let builtKey = '';
  let lastSlot = null;

  const pad2 = (n) => String(n).padStart(2, '0');
  function dailyId() {
    const d = new Date();
    return `D-${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function courseLabel(id) {
    if (id.startsWith('D-')) {
      const [y, m, d] = id.slice(2).split('-').map(Number);
      const date = new Date(y, m - 1, d);
      return `Daily · ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    return `Course ${id.slice(2)}`;
  }

  function courseUrl(id) {
    const base = location.origin + location.pathname;
    return id.startsWith('R-') ? `${base}?c=${id.slice(2)}` : base;
  }

  const freshHole = () => ({ g: [], marks: false, win: false, done: false, picked: false, score: null });

  function loadCourse(id) {
    const saved = store.get(`course:${id}`, null);
    course = {
      id,
      targets: [],
      cur: 0,
      holes: HOLES.map(freshHole),
      submitted: false,
      entryId: null,
    };
    if (saved && Array.isArray(saved.holes) && saved.holes.length === HOLES.length) {
      Object.assign(course, { cur: clamp(saved.cur | 0, 0, HOLES.length - 1), holes: saved.holes, submitted: !!saved.submitted, entryId: saved.entryId || null });
    }
    store.set('active', id);
    const url = id.startsWith('R-') ? `?c=${id.slice(2)}` : location.pathname;
    history.replaceState(null, '', url);
    resetView();
    builtKey = '';
    render();
  }

  function save() {
    store.set(`course:${course.id}`, { cur: course.cur, holes: course.holes, submitted: course.submitted, entryId: course.entryId });
  }

  const hole = () => HOLES[course.cur];
  const hs = () => course.holes[course.cur];
  function targetAt(i) {
    if (!course.targets[i]) course.targets[i] = pickTarget(course.id, i);
    return course.targets[i];
  }
  const target = () => targetAt(course.cur);
  const liveStrokes = (h) => (h.done ? h.score : h.g.length + (h.marks ? 1 : 0) + (h.win ? 1 : 0));
  const courseDone = () => course.holes.every((h) => h.done);

  function roundTotals() {
    let strokes = 0;
    let toPar = 0;
    let played = 0;
    course.holes.forEach((h, i) => {
      if (!h.done) return;
      strokes += h.score;
      toPar += h.score - HOLES[i].par;
      played++;
    });
    return { strokes, toPar, played };
  }

  function plotAspect() {
    const rect = el.plot.getBoundingClientRect();
    return rect.width ? rect.height / rect.width : 0.75;
  }

  // Frames the hole's curve without charging the window assist.
  function fitWindow() {
    view.cx = 0;
    view.cy = 0;
    view.xh = fitXh(hole(), target(), plotAspect());
    view.fitted = true;
  }

  function resetView() {
    view = { cx: 0, cy: 0, xh: DEFAULT_XH, marksOn: false, fitted: true };
    fitWindow();
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  function render() {
    renderHud();
    renderEquation();
    renderTools();
    renderResult();
    renderHistory();
    renderScorecard();
    draw();
  }

  function renderHud() {
    const h = hole();
    const { toPar, played } = roundTotals();
    $('#hudHole').textContent = course.cur + 1;
    $('#hudName').textContent = h.name;
    $('#hudCourse').textContent = courseLabel(course.id);
    $('#footCourse').textContent = courseLabel(course.id);
    $('#hudPar').textContent = h.par;
    $('#hudStrokes').textContent = liveStrokes(hs());
    const round = $('#hudRound');
    round.textContent = played ? toParStr(toPar) : 'E';
    round.className = toParClass(toPar);
  }

  function renderEquation() {
    const h = hole();
    const st = hs();
    const key = `${course.id}:${course.cur}`;
    if (builtKey !== key) {
      builtKey = key;
      el.equation.innerHTML = '';
      const last = st.g[st.g.length - 1];
      h.toks.forEach((tk) => {
        if (tk.t === 'txt') {
          const span = document.createElement('span');
          span.className = 'txt';
          span.innerHTML = mathHTML(tk.s);
          el.equation.append(span);
          return;
        }
        if (tk.op) {
          const op = document.createElement('span');
          op.className = 'op';
          op.textContent = ` ${tk.op} `;
          el.equation.append(op);
        }
        const input = document.createElement('input');
        input.className = 'slot' + (tk.role === 'e' ? ' sup' : '');
        input.dataset.k = tk.k;
        input.placeholder = tk.k;
        input.inputMode = 'decimal';
        input.enterKeyHint = 'go';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.maxLength = 7;
        input.setAttribute('aria-label', `Value of ${tk.k}`);
        const idx = h.keys.indexOf(tk.k);
        if (last) input.value = fmt(last[idx]).replace(/−/g, '-');
        el.equation.append(input);
      });
      el.hints.innerHTML = h.keys
        .filter((k, i) => h.keys.indexOf(k) === i)
        .map((k) => `<span>${describeSet(k, h.params[k])}</span>`)
        .join('');
      el.shotMsg.textContent = '';
      lastSlot = null;
    }
    const done = st.done;
    const slots = $$('.slot', el.equation);
    if (done) {
      const vals = st.picked ? h.keys.map((k) => target()[k]) : st.g[st.g.length - 1];
      slots.forEach((s, i) => { s.value = fmt(vals[i]).replace(/−/g, '-'); });
    }
    slots.forEach((s) => { s.disabled = done; });
    $('#shotBtn').disabled = done;
    $('#pickUpBtn').disabled = done;
    $('#signBtn').disabled = done;
  }

  function renderTools() {
    const st = hs();
    const mark = $('#toggleMarks');
    mark.setAttribute('aria-pressed', String(view.marksOn));
    const mc = $('#marksCost');
    const wc = $('#winCost');
    mc.textContent = st.marks ? 'used' : st.done ? 'free' : '+1';
    mc.classList.toggle('paid', st.marks || st.done);
    wc.textContent = st.win ? 'used' : st.done ? 'free' : '+1';
    wc.classList.toggle('paid', st.win || st.done);
    const pannable = canPan();
    el.plot.classList.toggle('pannable', pannable);
    $('#panHint').hidden = !pannable;
  }

  function renderResult() {
    const st = hs();
    const h = hole();
    if (!st.done) { el.result.hidden = true; el.form.hidden = false; return; }
    el.result.hidden = false;
    el.result.classList.toggle('picked', st.picked);
    $('#resTerm').textContent = termFor(st.score, h.par, st.picked);
    const shots = st.g.length;
    const assists = (st.marks ? 1 : 0) + (st.win ? 1 : 0);
    let sub = `${st.score} stroke${st.score === 1 ? '' : 's'} on a par ${h.par}`;
    if (!st.picked && assists) sub += ` · ${shots} shot${shots === 1 ? '' : 's'} + ${assists} assist${assists === 1 ? '' : 's'}`;
    $('#resSub').textContent = sub;
    $('#resEq').innerHTML = equationHTML(h, target());
    const next = $('#nextBtn');
    const n = nextHoleIndex();
    next.textContent = n === -1 ? 'Round summary' : `Hole ${n + 1} →`;
  }

  function renderHistory() {
    const st = hs();
    const h = hole();
    el.history.innerHTML = '';
    st.g.forEach((vals, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      const isWin = st.done && !st.picked && i === st.g.length - 1;
      if (isWin) b.classList.add('win');
      b.innerHTML = `#${i + 1} ` + h.keys.map((k, j) => `<i>${k}</i>=<b>${fmt(vals[j])}</b>`).join(' ');
      b.title = 'Load this shot into the boxes';
      b.addEventListener('click', () => {
        if (st.done) return;
        $$('.slot', el.equation).forEach((s, j) => { s.value = fmt(vals[j]).replace(/−/g, '-'); });
      });
      el.history.append(b);
    });
  }

  function termFor(score, par, picked) {
    if (picked) return 'Picked up';
    if (score === 1) return 'Hole in one!';
    const d = score - par;
    const names = { '-4': 'Condor!', '-3': 'Albatross!', '-2': 'Eagle!', '-1': 'Birdie!', 0: 'Par', 1: 'Bogey', 2: 'Double bogey', 3: 'Triple bogey' };
    return names[d] || (d < 0 ? 'Unreal!' : `${d} over par`);
  }

  function markClass(h, par) {
    if (h.picked) return 'picked';
    const d = h.score - par;
    if (d <= -2) return 'eagle';
    if (d === -1) return 'birdie';
    if (d === 0) return '';
    if (d === 1) return 'bogey';
    return 'double';
  }

  function renderScorecard() {
    const half = (from, to, label) => {
      let head = '<th scope="row">Hole</th>';
      let par = '<th scope="row">Par</th>';
      let score = '<th scope="row">Score</th>';
      let parSum = 0;
      let scoreSum = 0;
      let any = false;
      for (let i = from; i < to; i++) {
        const cur = i === course.cur ? ' class="cur"' : '';
        const h = course.holes[i];
        parSum += HOLES[i].par;
        head += `<th${cur}>${i + 1}</th>`;
        par += `<td${cur}>${HOLES[i].par}</td>`;
        if (h.done) {
          any = true;
          scoreSum += h.score;
          score += `<td${cur}><span class="mark ${markClass(h, HOLES[i].par)}">${h.score}</span></td>`;
        } else if (i === course.cur && liveStrokes(h) > 0) {
          score += `<td${cur}><span class="mark live">${liveStrokes(h)}</span></td>`;
        } else {
          score += `<td${cur}></td>`;
        }
      }
      head += `<th class="sum">${label}</th>`;
      par += `<td class="sum">${parSum}</td>`;
      score += `<td class="sum">${any ? scoreSum : ''}</td>`;
      return `<div class="sc-scroll"><table class="sc"><thead><tr>${head}</tr></thead><tbody><tr>${par}</tr><tr>${score}</tr></tbody></table></div>`;
    };
    el.scorecard.innerHTML = half(0, 9, 'Out') + half(9, 18, 'In');
    const { strokes, toPar, played } = roundTotals();
    $('#scoreTotal').textContent = played
      ? `${strokes} strokes through ${played} · ${toParStr(toPar)} · par ${TOTAL_PAR}`
      : `Par ${TOTAL_PAR}`;
  }

  // ---------------------------------------------------------------------------
  // Canvas
  // ---------------------------------------------------------------------------
  function niceStep(span, count) {
    const raw = span / count;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / p;
    return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p;
  }

  function draw() {
    const rect = el.plot.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (!w || !h || !course) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.round(w * dpr);
    const ch = Math.round(h * dpr);
    if (el.canvas.width !== cw || el.canvas.height !== ch) {
      el.canvas.width = cw;
      el.canvas.height = ch;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const css = getComputedStyle(document.documentElement);
    const col = (n) => css.getPropertyValue(n).trim();

    const xh = view.xh;
    const yh = (xh * h) / w;
    const x0 = view.cx - xh;
    const x1 = view.cx + xh;
    const y0 = view.cy - yh;
    const y1 = view.cy + yh;
    const scale = w / (2 * xh);
    const X = (x) => (x - x0) * scale;
    const Y = (y) => (y1 - y) * scale;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = col('--plot-bg');
    ctx.fillRect(0, 0, w, h);

    const ax = X(0);
    const ay = Y(0);

    if (view.marksOn) {
      const step = niceStep(2 * xh, Math.max(4, w / 64));
      ctx.strokeStyle = col('--grid');
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = Math.ceil(x0 / step); i <= Math.floor(x1 / step); i++) {
        const px = Math.round(X(i * step)) + 0.5;
        ctx.moveTo(px, 0); ctx.lineTo(px, h);
      }
      for (let i = Math.ceil(y0 / step); i <= Math.floor(y1 / step); i++) {
        const py = Math.round(Y(i * step)) + 0.5;
        ctx.moveTo(0, py); ctx.lineTo(w, py);
      }
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = col('--axis');
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (ay >= 0 && ay <= h) { ctx.moveTo(0, Math.round(ay) + 0.5); ctx.lineTo(w, Math.round(ay) + 0.5); }
    if (ax >= 0 && ax <= w) { ctx.moveTo(Math.round(ax) + 0.5, 0); ctx.lineTo(Math.round(ax) + 0.5, h); }
    ctx.stroke();

    if (view.marksOn) {
      const step = niceStep(2 * xh, Math.max(4, w / 64));
      const label = (v) => minus(String(+v.toFixed(6)));
      ctx.fillStyle = col('--label');
      ctx.strokeStyle = col('--axis');
      ctx.font = '11px ' + col('--font');
      ctx.lineWidth = 1;
      const tickY = clamp(ay, 0, h);
      const tickX = clamp(ax, 0, w);
      ctx.beginPath();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const labelY = ay + 18 > h ? clamp(ay, 0, h) - 17 : clamp(ay, 0, h) + 5;
      for (let i = Math.ceil(x0 / step); i <= Math.floor(x1 / step); i++) {
        if (i === 0) continue;
        const px = X(i * step);
        ctx.moveTo(px, tickY - 4); ctx.lineTo(px, tickY + 4);
        if (px > 14 && px < w - 14) ctx.fillText(label(i * step), px, labelY);
      }
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const labelX = ax - 36 < 0 ? clamp(ax, 0, w) + 40 : clamp(ax, 0, w) - 7;
      for (let i = Math.ceil(y0 / step); i <= Math.floor(y1 / step); i++) {
        if (i === 0) continue;
        const py = Y(i * step);
        ctx.moveTo(tickX - 4, py); ctx.lineTo(tickX + 4, py);
        if (py > 10 && py < h - 10) ctx.fillText(label(i * step), labelX, py);
      }
      ctx.stroke();
      if (ax >= 0 && ax <= w && ay >= 0 && ay <= h) {
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText('0', ax - 5, ay + 5);
      }
    }

    const plotFn = (fn, color, width, alpha = 1, dash = null) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.globalAlpha = alpha;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath();
      let pen = false;
      let prev = 0;
      for (let px = -1; px <= w + 1; px += 0.5) {
        const y = fn(x0 + px / scale);
        if (!Number.isFinite(y)) { pen = false; continue; }
        const py = Y(y);
        if (pen && ((prev < -h && py > 2 * h) || (prev > 2 * h && py < -h))) pen = false;
        const cpy = clamp(py, -4 * h, 5 * h);
        if (pen) ctx.lineTo(px, cpy);
        else { ctx.moveTo(px, cpy); pen = true; }
        prev = py;
      }
      ctx.stroke();
      ctx.restore();
    };

    const hl = hole();
    const st = hs();
    const tgt = target();
    const guesses = st.g;
    const lastIdx = guesses.length - 1;

    const ghostFrom = Math.max(0, lastIdx - 6);
    for (let i = ghostFrom; i < lastIdx; i++) {
      const p = toParams(hl, guesses[i]);
      plotFn((x) => hl.f(p, x), col('--ghost'), 1.5, 0.45);
    }

    plotFn((x) => hl.f(tgt, x), col('--target'), 4.5);

    if (lastIdx >= 0 && !st.picked) {
      const p = toParams(hl, guesses[lastIdx]);
      const solved = st.done;
      plotFn((x) => hl.f(p, x), col('--guess'), 2.5, 1, solved ? [8, 8] : null);
    }
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  function shake(input) {
    input.classList.remove('shake');
    void input.offsetWidth;
    input.classList.add('shake');
    setTimeout(() => input.classList.remove('shake'), 400);
  }

  function reject(input, msg) {
    el.shotMsg.textContent = msg;
    toast(msg);
    input.focus();
    input.select();
  }

  function takeShot(e) {
    e.preventDefault();
    const st = hs();
    if (st.done) return;
    const h = hole();
    const slots = $$('.slot', el.equation);
    const vals = [];
    const bad = [];
    const out = [];
    slots.forEach((s, i) => {
      const v = parseNum(s.value);
      vals.push(v);
      if (!Number.isFinite(v)) { bad.push(s); return; }
      const set = h.params[h.keys[i]];
      if (!set.some((allowed) => Math.abs(allowed - v) < 1e-9)) out.push({ s, k: h.keys[i], v });
    });
    if (bad.length) {
      bad.forEach(shake);
      reject(bad[0], 'Fill every box with a number, like 3, -2, 0.5 or 1/2.');
      return;
    }
    if (out.length) {
      out.forEach((o) => shake(o.s));
      const names = out.map((o) => `${o.k} = ${fmt(o.v)}`).join(' and ');
      reject(out[0].s, `${names} ${out.length > 1 ? 'are not on the list' : 'is not on the list'} for this hole. No stroke counted.`);
      return;
    }
    if (st.g.some((g) => g.every((v, j) => Math.abs(v - vals[j]) < 1e-9))) {
      el.shotMsg.textContent = 'You already tried that shot. No stroke counted.';
      toast('You already tried that shot. No stroke counted.');
      return;
    }
    st.g.push(vals);
    if (matches(h, target(), toParams(h, vals))) {
      finishHole(false);
      return;
    }
    const n = st.g.length;
    const lines = ['Not in the hole yet.', 'Close the gap between the curves.', 'Keep swinging.', 'Read the green and try again.'];
    el.shotMsg.textContent = `Shot ${n}: ${lines[(n - 1) % lines.length]}`;
    save();
    render();
  }

  function pickUp() {
    const st = hs();
    if (st.done) return;
    if (!confirm(`Pick up and take ${Math.max(liveStrokes(st) + 1, hole().par + 5)} strokes for this hole?`)) return;
    finishHole(true);
  }

  function finishHole(picked) {
    const st = hs();
    const h = hole();
    const raw = liveStrokes(st);
    st.done = true;
    st.picked = picked;
    st.score = picked ? Math.max(raw + 1, h.par + 5) : raw;
    save();
    el.shotMsg.textContent = '';
    render();
    if (!picked) {
      const d = st.score - h.par;
      if (st.score === 1) confetti(160);
      else if (d <= -1) confetti(d <= -2 ? 120 : 60);
    }
    $('#nextBtn').focus({ preventScroll: true });
    if (courseDone()) setTimeout(openFinish, picked ? 300 : 1100);
  }

  function nextHoleIndex() {
    const after = course.holes.findIndex((h, i) => i > course.cur && !h.done);
    return after !== -1 ? after : course.holes.findIndex((h) => !h.done);
  }

  function nextHole() {
    const n = nextHoleIndex();
    if (n !== -1) {
      course.cur = n;
      save();
      resetView();
      render();
      if (matchMedia('(pointer: fine)').matches) {
        const first = $('.slot', el.equation);
        if (first) first.focus({ preventScroll: true });
      }
      $('.hud').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      openFinish();
    }
  }

  function useAssist(kind) {
    const st = hs();
    if (st.done || st[kind]) return;
    st[kind] = true;
    save();
    toast(kind === 'marks' ? '+1 stroke: axis marks on for this hole.' : '+1 stroke: window unlocked for this hole. Drag to pan, scroll to zoom.');
  }

  const canPan = () => hs().win || hs().done;

  function zoomAt(factor, px, py) {
    const rect = el.plot.getBoundingClientRect();
    const xh = view.xh;
    const yh = (xh * rect.height) / rect.width;
    const mx = view.cx - xh + (px / rect.width) * 2 * xh;
    const my = view.cy + yh - (py / rect.height) * 2 * yh;
    const nxh = clamp(xh * factor, 0.5, 400);
    const k = nxh / xh;
    view.cx = mx - (mx - view.cx) * k;
    view.cy = my - (my - view.cy) * k;
    view.xh = nxh;
    view.fitted = false;
  }

  function zoomButton(factor) {
    useAssist('win');
    const rect = el.plot.getBoundingClientRect();
    zoomAt(factor, rect.width / 2, rect.height / 2);
    render();
  }

  // ---------------------------------------------------------------------------
  // Toast & confetti
  // ---------------------------------------------------------------------------
  let toastTimer = 0;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2800);
  }

  function confetti(n) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const layer = document.createElement('div');
    layer.className = 'confetti';
    const colors = ['#1f8a4c', '#4ade80', '#fb923c', '#facc15', '#60a5fa', '#f472b6'];
    for (let i = 0; i < n; i++) {
      const s = document.createElement('span');
      s.style.left = `${Math.random() * 100}%`;
      s.style.background = colors[i % colors.length];
      s.style.setProperty('--x', `${(Math.random() - 0.5) * 240}px`);
      s.style.setProperty('--r', `${(Math.random() - 0.5) * 1080}deg`);
      s.style.setProperty('--d', `${1.6 + Math.random() * 1.4}s`);
      s.style.animationDelay = `${Math.random() * 0.4}s`;
      layer.append(s);
    }
    document.body.append(layer);
    setTimeout(() => layer.remove(), 3600);
  }

  // ---------------------------------------------------------------------------
  // Dialogs, leaderboard, sharing
  // ---------------------------------------------------------------------------
  const dialogs = {
    help: $('#dlg-help'),
    board: $('#dlg-board'),
    course: $('#dlg-course'),
    finish: $('#dlg-finish'),
  };

  function openDialog(name) {
    Object.values(dialogs).forEach((d) => { if (d.open) d.close(); });
    if (name === 'board') renderBoard('course');
    if (name === 'course') renderCourseDialog();
    dialogs[name].showModal();
  }

  function holeEmoji(h, i) {
    if (h.picked) return '⬛';
    if (h.score === 1) return '⭐';
    const d = h.score - HOLES[i].par;
    if (d <= -2) return '🟪';
    if (d === -1) return '🟦';
    if (d === 0) return '🟩';
    if (d === 1) return '🟨';
    return '🟥';
  }

  function emojiGrid() {
    const e = course.holes.map(holeEmoji);
    return `${e.slice(0, 9).join('')}\n${e.slice(9).join('')}`;
  }

  function openFinish() {
    const { strokes, toPar } = roundTotals();
    $('#finStrokes').textContent = strokes;
    const tp = $('#finToPar');
    tp.textContent = toParStr(toPar);
    tp.className = `topar ${toParClass(toPar)}`;
    const counts = { birdies: 0, pars: 0, aces: 0 };
    course.holes.forEach((h, i) => {
      if (h.picked) return;
      if (h.score === 1) counts.aces++;
      const d = h.score - HOLES[i].par;
      if (d < 0) counts.birdies++;
      else if (d === 0) counts.pars++;
    });
    const bits = [`${courseLabel(course.id)}`];
    if (counts.aces) bits.push(`${counts.aces} hole${counts.aces > 1 ? 's' : ''} in one`);
    bits.push(`${counts.birdies} under par`, `${counts.pars} par${counts.pars === 1 ? '' : 's'}`);
    $('#finLine').textContent = bits.join(' · ');
    $('#finEmoji').textContent = emojiGrid();
    $('#lbName').value = store.get('name', '');
    $('#lbForm').hidden = course.submitted;
    $('#lbSaved').hidden = !course.submitted;
    openDialog('finish');
    if (toPar <= 0) confetti(140);
  }

  function saveScore(e) {
    e.preventDefault();
    const name = $('#lbName').value.trim().slice(0, 20);
    if (!name || course.submitted || !courseDone()) return;
    store.set('name', name);
    const { strokes, toPar } = roundTotals();
    const entry = {
      id: Math.random().toString(36).slice(2, 10),
      name,
      strokes,
      toPar,
      course: course.id,
      date: new Date().toISOString(),
      grid: emojiGrid(),
    };
    const board = store.get('board', []);
    board.push(entry);
    store.set('board', board.slice(-500));
    course.submitted = true;
    course.entryId = entry.id;
    save();
    $('#lbForm').hidden = true;
    $('#lbSaved').hidden = false;
    toast('Score saved.');
  }

  function renderBoard(tab) {
    $$('#dlg-board [role="tab"]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    let rows = store.get('board', []);
    if (tab === 'course') rows = rows.filter((r) => r.course === course.id);
    rows.sort((a, b) => a.strokes - b.strokes || a.date.localeCompare(b.date));
    const body = $('#boardBody');
    if (!rows.length) {
      body.innerHTML = `<p class="empty">${tab === 'course' ? 'No finished rounds on this course yet.' : 'No finished rounds yet. Play 18 holes to get on the board.'}</p>`;
      return;
    }
    const trs = rows.slice(0, 50).map((r, i) => {
      const me = r.id === course.entryId ? ' class="me"' : '';
      const when = new Date(r.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const courseCell = tab === 'all' ? `<td class="muted">${esc(courseLabel(r.course))}</td>` : '';
      return `<tr${me}><td>${i + 1}</td><td class="name">${esc(r.name)}</td><td class="num"><b>${r.strokes}</b></td><td class="num">${toParStr(r.toPar)}</td>${courseCell}<td class="muted">${when}</td></tr>`;
    }).join('');
    const courseHead = tab === 'all' ? '<th>Course</th>' : '';
    body.innerHTML = `<div class="board-scroll"><table class="board"><thead><tr><th>#</th><th>Name</th><th class="num">Score</th><th class="num">±</th>${courseHead}<th>Date</th></tr></thead><tbody>${trs}</tbody></table></div>`;
  }

  function courseStatus(id) {
    const saved = store.get(`course:${id}`, null);
    if (!saved || !saved.holes) return 'Not started';
    const done = saved.holes.filter((h) => h.done);
    if (done.length === HOLES.length) {
      const strokes = done.reduce((s, h) => s + h.score, 0);
      return `Finished · ${strokes} (${toParStr(strokes - TOTAL_PAR)})`;
    }
    return done.length ? `In progress · through ${done.length}` : 'In progress';
  }

  function renderCourseDialog() {
    $('#dailyStatus').textContent = `Same 18 holes for everyone today. ${courseStatus(dailyId())}.`;
    $('#currentCourseInfo').textContent = `${courseLabel(course.id)} · ${courseStatus(course.id)}`;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.append(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
      return ok;
    }
  }

  async function share() {
    const { strokes, toPar } = roundTotals();
    const text = `Graph Golf ⛳ ${courseLabel(course.id)}\n${strokes} strokes (${toParStr(toPar)})\n${emojiGrid()}\n${courseUrl(course.id)}`;
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ text }); return; } catch { /* fall through to copy */ }
    }
    toast((await copyText(text)) ? 'Result copied to clipboard.' : 'Could not copy. Try again.');
  }

  function randomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------
  el.form.addEventListener('submit', takeShot);
  el.equation.addEventListener('focusin', (e) => {
    if (e.target.classList.contains('slot')) {
      lastSlot = e.target;
      e.target.select();
    }
  });

  const signBtn = $('#signBtn');
  signBtn.addEventListener('pointerdown', (e) => e.preventDefault());
  signBtn.addEventListener('click', () => {
    const s = lastSlot || $('.slot', el.equation);
    if (!s || s.disabled) return;
    const v = s.value.trim();
    s.value = v.startsWith('-') || v.startsWith('−') ? v.slice(1) : `-${v}`;
    s.focus();
    const end = s.value.length;
    s.setSelectionRange(end, end);
  });

  $('#pickUpBtn').addEventListener('click', pickUp);
  $('#nextBtn').addEventListener('click', nextHole);

  $('#toggleMarks').addEventListener('click', () => {
    if (!view.marksOn) useAssist('marks');
    view.marksOn = !view.marksOn;
    render();
  });
  $('#zoomIn').addEventListener('click', () => zoomButton(1 / 1.5));
  $('#zoomOut').addEventListener('click', () => zoomButton(1.5));
  $('#zoomReset').addEventListener('click', () => {
    if (view.fitted) return;
    fitWindow();
    render();
  });

  let drag = null;
  el.plot.addEventListener('pointerdown', (e) => {
    if (!canPan()) return;
    drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
    el.plot.setPointerCapture(e.pointerId);
    el.plot.classList.add('dragging');
  });
  el.plot.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const rect = el.plot.getBoundingClientRect();
    const upp = (2 * view.xh) / rect.width;
    view.cx -= (e.clientX - drag.x) * upp;
    view.cy += (e.clientY - drag.y) * upp;
    view.fitted = false;
    drag.x = e.clientX;
    drag.y = e.clientY;
    draw();
  });
  const endDrag = () => { drag = null; el.plot.classList.remove('dragging'); };
  el.plot.addEventListener('pointerup', endDrag);
  el.plot.addEventListener('pointercancel', endDrag);
  el.plot.addEventListener('wheel', (e) => {
    if (!canPan()) return;
    e.preventDefault();
    const rect = el.plot.getBoundingClientRect();
    zoomAt(e.deltaY > 0 ? 1.12 : 1 / 1.12, e.clientX - rect.left, e.clientY - rect.top);
    draw();
  }, { passive: false });

  new ResizeObserver(() => {
    if (course && view.fitted) fitWindow();
    draw();
  }).observe(el.plot);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => draw());

  $$('[data-open]').forEach((b) => b.addEventListener('click', () => openDialog(b.dataset.open)));
  Object.values(dialogs).forEach((d) => {
    d.addEventListener('click', (e) => {
      if (e.target === d || e.target.closest('[data-close]')) d.close();
    });
  });
  dialogs.help.addEventListener('close', () => store.set('seenHelp', true));

  $$('#dlg-board [role="tab"]').forEach((b) => b.addEventListener('click', () => renderBoard(b.dataset.tab)));

  $('#lbForm').addEventListener('submit', saveScore);
  $('#shareBtn').addEventListener('click', share);

  $('#playDaily').addEventListener('click', () => {
    dialogs.course.close();
    if (course.id !== dailyId()) loadCourse(dailyId());
  });
  $('#playRandom').addEventListener('click', () => {
    dialogs.course.close();
    loadCourse(`R-${randomCode()}`);
    toast(`New course ${course.id.slice(2)}. Share the link to challenge a friend.`);
  });
  $('#codeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = $('#codeInput').value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    if (!code) return;
    dialogs.course.close();
    $('#codeInput').value = '';
    loadCourse(`R-${code}`);
  });
  $('#copyLink').addEventListener('click', async () => {
    toast((await copyText(courseUrl(course.id))) ? 'Course link copied.' : 'Could not copy the link.');
  });
  $('#restartCourse').addEventListener('click', () => {
    if (!confirm(`Restart ${courseLabel(course.id)}? Your progress on this course will be cleared.`)) return;
    store.del(`course:${course.id}`);
    dialogs.course.close();
    loadCourse(course.id);
  });

  // ---------------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------------
  function isFinished(id) {
    const saved = store.get(`course:${id}`, null);
    return !!(saved && saved.holes && saved.holes.every((h) => h.done));
  }

  const code = (new URLSearchParams(location.search).get('c') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  let startId;
  if (code) {
    startId = `R-${code}`;
  } else {
    const active = store.get('active', null);
    const resumable = active && !isFinished(active) && (active.startsWith('R-') || active === dailyId());
    startId = resumable ? active : dailyId();
  }
  loadCourse(startId);

  if (!store.get('seenHelp', false)) openDialog('help');
})();
