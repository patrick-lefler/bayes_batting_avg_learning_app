(() => {
  'use strict';
  const GAMES = 160, BLOCKS = 16;
  const DEFAULTS = {
    h1: 140, ab1: 500, h2: 150, ab2: 520, w1: 0.4, w2: 0.5,
    blocks: [[28,10],[32,11],[29,8],[35,10],[33,11],[33,11],[32,11],[33,10],[32,12],[28,8],[31,10],[31,10],[35,12],[33,10],[31,9],[28,10]]
  };
  const $ = id => document.getElementById(id);
  const fmt = v => (isFinite(v) ? (v >= 1 ? v.toFixed(3) : v.toFixed(3).replace(/^0/, '')) : '—');
  const f1 = v => v.toFixed(1), f4 = v => v.toFixed(4);

  // ---------- math ----------
  const LG = [676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-0.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
  function lgamma(x){
    if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
    x -= 1; let a = 0.99999999999980993; const t = x + 7.5;
    for (let i = 0; i < 8; i++) a += LG[i] / (x + i + 1);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  const lbeta = (a, b) => lgamma(a) + lgamma(b) - lgamma(a + b);
  const lchoose = (n, k) => lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);

  function betaBinomPmf(R, a, b){
    const out = new Array(R + 1), lb = lbeta(a, b);
    for (let y = 0; y <= R; y++) out[y] = Math.exp(lchoose(R, y) + lbeta(y + a, R - y + b) - lb);
    return out;
  }

  // ---------- state ----------
  let state = JSON.parse(JSON.stringify(DEFAULTS));
  let step = 2, model = null, playing = null;

  function readInt(el){
    const s = el.value.trim();
    if (!/^\d+$/.test(s)) return NaN;
    return parseInt(s, 10);
  }

  function validate(){
    const pm = [], lm = []; let ok = true;
    const seasons = [['h1','ab1','w1','Season 1'],['h2','ab2','w2','Season 2']];
    for (const [hk, abk, wk, name] of seasons){
      const hEl = $(hk), abEl = $(abk); hEl.classList.remove('bad','warn'); abEl.classList.remove('bad','warn');
      const h = readInt(hEl), ab = readInt(abEl), w = state[wk];
      if (isNaN(h)) { hEl.classList.add('bad'); pm.push(['err', `${name}: hits must be a whole number ≥ 0.`]); ok = false; }
      if (isNaN(ab)) { abEl.classList.add('bad'); pm.push(['err', `${name}: at-bats must be a whole number ≥ 0.`]); ok = false; }
      if (!isNaN(h) && !isNaN(ab)){
        if (h > ab) { hEl.classList.add('bad'); pm.push(['err', `${name}: hits (${h}) can't exceed at-bats (${ab}).`]); ok = false; }
        else if (ab < 1 && w > 0) { abEl.classList.add('bad'); pm.push(['err', `${name}: needs at least 1 at-bat unless its weight is 0.`]); ok = false; }
        if (ab > 700) { abEl.classList.add('warn'); pm.push(['warn', `${name}: ${ab} at-bats is more than a realistic full season.`]); }
        state[hk] = h; state[abk] = ab;
      }
    }
    if (state.w1 === 0 && state.w2 === 0) pm.push(['warn', 'Both weights are 0. The prior is reduced to the minimum Beta(0.5, 0.5).']);
    // blocks
    const rows = document.querySelectorAll('#logBody tr');
    rows.forEach((tr, i) => {
      const hEl = tr.querySelector('.h'), abEl = tr.querySelector('.ab');
      hEl.classList.remove('bad','warn'); abEl.classList.remove('bad','warn');
      const h = readInt(hEl), ab = readInt(abEl), lab = `Games ${i*10+1}–${i*10+10}`;
      if (isNaN(h)) { hEl.classList.add('bad'); lm.push(['err', `${lab}: hits must be a whole number ≥ 0.`]); ok = false; return; }
      if (isNaN(ab)) { abEl.classList.add('bad'); lm.push(['err', `${lab}: at-bats must be a whole number ≥ 0.`]); ok = false; return; }
      if (h > ab) { hEl.classList.add('bad'); lm.push(['err', `${lab}: hits (${h}) can't exceed at-bats (${ab}).`]); ok = false; return; }
      if (ab > 70) { abEl.classList.add('warn'); lm.push(['warn', `${lab}: ${ab} at-bats in 10 games is unusually high.`]); }
      state.blocks[i] = [ab, h];
    });
    renderMsgs($('priorMsgs'), pm); renderMsgs($('logMsgs'), lm);
    return ok;
  }
  function renderMsgs(el, list){ el.innerHTML = list.map(([t, m]) => `<div class="msg ${t}">${m}</div>`).join(''); }

  function compute(){
    const { h1, ab1, h2, ab2, w1, w2 } = state;
    const a0raw = w1*h1 + w2*h2, b0raw = w1*(ab1-h1) + w2*(ab2-h2);
    const a0 = Math.max(0.5, a0raw), b0 = Math.max(0.5, b0raw);
    const priorABs = [ab1, ab2].filter(x => x > 0);
    const pacePerGame = priorABs.length ? priorABs.reduce((s,x)=>s+x,0) / priorABs.length / GAMES : 3;
    const states = [];
    let H = 0, AB = 0;
    for (let k = 0; k <= BLOCKS; k++){
      let bh = null, bab = null;
      if (k > 0){ [bab, bh] = state.blocks[k-1]; H += bh; AB += bab; }
      const g = k * 10, a = a0 + H, b = b0 + (AB - H);
      const p = a / (a + b);
      let R;
      if (g >= GAMES) R = 0;
      else if (AB > 0) R = Math.round(AB / g * (GAMES - g));
      else R = Math.round(pacePerGame * (GAMES - g));
      const N = AB + R;
      const varTheta = p * (1 - p) / (a + b + 1);
      const luck = R * p * (1 - p), ign = R * R * varTheta;
      let mean, lo, hi, pts = [];
      if (R === 0 || N === 0){
        mean = lo = hi = AB ? H / AB : p;
      } else {
        const pmf = betaBinomPmf(R, a, b);
        let c = 0; lo = null; hi = null;
        for (let y = 0; y <= R; y++){
          c += pmf[y];
          if (lo === null && c >= 0.025) lo = (H + y) / N;
          if (hi === null && c >= 0.975) hi = (H + y) / N;
          pts.push([(H + y) / N, pmf[y] * N]);
        }
        mean = (H + R * p) / N;
      }
      states.push({ k, g, bh, bab, H, AB, a, b, p, R, N, mean, lo, hi, pts, luck, ign, varTheta,
        blockAvg: bab ? bh / bab : null, seasonAvg: AB ? H / AB : null });
    }
    return { a0, b0, a0raw, b0raw, priorMean: a0/(a0+b0), priorN: a0+b0, states };
  }

  // ---------- rendering ----------
  function renderPrior(m){
    $('avg1').textContent = state.ab1 ? `${fmt(state.h1/state.ab1)} avg` : '— avg';
    $('avg2').textContent = state.ab2 ? `${fmt(state.h2/state.ab2)} avg` : '— avg';
    $('w1v').textContent = state.w1.toFixed(2); $('w2v').textContent = state.w2.toFixed(2);
    $('weightSummary').textContent = `S1 ${state.w1.toFixed(2)} · S2 ${state.w2.toFixed(2)} → ${Math.round(m.priorN)} pseudo-AB`;
    $('priorResult').textContent = `Prior θ ~ Beta(${f1(m.a0)}, ${f1(m.b0)}) · mean ${fmt(m.priorMean)} · worth ${Math.round(m.priorN)} at-bats`;
    document.querySelectorAll('.chip').forEach(c => {
      const p = c.dataset.preset;
      const on = (p === 'weighted' && state.w1 === 0.4 && state.w2 === 0.5) || (p === 'pooled' && state.w1 === 1 && state.w2 === 1) || (p === 'recent' && state.w1 === 0 && state.w2 === 1);
      c.classList.toggle('on', on);
    });
  }

  function renderKpis(m){
    const s = m.states[step];
    $('gameLabel').textContent = step === 0 ? 'Preseason (prior only)' : `After game ${s.g}`;
    if (step === 0){
      $('k1').textContent = '—'; $('k1s').textContent = 'no games yet';
      $('k2').textContent = '—'; $('k2s').textContent = '0 H / 0 AB';
    } else {
      $('k1').textContent = fmt(s.blockAvg); $('k1s').textContent = `${s.bh} H / ${s.bab} AB`;
      $('k2').textContent = fmt(s.seasonAvg); $('k2s').textContent = `${s.H} H / ${s.AB} AB`;
    }
    $('k3').textContent = fmt(s.mean);
    $('k3s').textContent = s.R ? `95%: ${fmt(s.lo)}–${fmt(s.hi)}` : 'season complete';
    $('k4').textContent = fmt(s.p); $('k4s').textContent = `α ${f1(s.a)} · β ${f1(s.b)}`;
    $('stepRange').value = step;
  }

  function renderSteps(m){
    const s = m.states[step], ol = $('steps');
    const sd = Math.sqrt(s.luck + s.ign);
    const items = [];
    items.push(`<li><span class="what">Build the prior from two seasons.</span>
<pre>α₀ = ${state.w1.toFixed(2)}×${state.h1} + ${state.w2.toFixed(2)}×${state.h2} = ${f1(m.a0)}
β₀ = ${state.w1.toFixed(2)}×${state.ab1-state.h1} + ${state.w2.toFixed(2)}×${state.ab2-state.h2} = ${f1(m.b0)}
prior mean = ${f1(m.a0)} / ${f1(m.a0+m.b0)} = <span class="res">${fmt(m.priorMean)}</span></pre></li>`);
    if (step > 0){
      items.push(`<li><span class="what">Update with every game so far: add hits to α and outs to β.</span>
<pre>α = ${f1(m.a0)} + ${s.H} hits = ${f1(s.a)}
β = ${f1(m.b0)} + ${s.AB - s.H} outs = ${f1(s.b)}
talent θ̂ = ${f1(s.a)} / ${f1(s.a+s.b)} = <span class="res">${fmt(s.p)}</span></pre></li>`);
    } else {
      items.push(`<li><span class="what">No games yet, so the posterior equals the prior.</span>
<pre>talent θ̂ = <span class="res">${fmt(s.p)}</span></pre></li>`);
    }
    if (s.R > 0){
      const paceTxt = s.AB > 0 ? `(${s.AB} AB / ${s.g} G) × ${GAMES - s.g} G` : `prior pace × ${GAMES - s.g} G`;
      items.push(`<li><span class="what">Estimate the at-bats still to come.</span>
<pre>R = ${paceTxt} = ${s.R}</pre></li>`);
      items.push(`<li><span class="what">Item 3: the expected final average.</span>
<pre>future hits = ${s.R} × ${f4(s.p)} = ${(s.R*s.p).toFixed(1)}
final = (${s.H} + ${(s.R*s.p).toFixed(1)}) / (${s.AB} + ${s.R}) = <span class="res">${fmt(s.mean)}</span></pre></li>`);
      items.push(`<li><span class="what">Item 4: the uncertainty curve. Future hits ~ Beta-Binomial(${s.R}, ${f1(s.a)}, ${f1(s.b)}).</span>
<pre>luck      = R·p(1−p)  = ${s.luck.toFixed(1)}
ignorance = R²·Var(θ) = ${s.R}² × ${s.varTheta.toExponential(2)} = ${s.ign.toFixed(1)}
SD = √${(s.luck+s.ign).toFixed(1)} = ${sd.toFixed(1)} hits → ${(sd/s.N).toFixed(3)} in AVG
95% range (exact) = <span class="res">${fmt(s.lo)} – ${fmt(s.hi)}</span></pre></li>`);
    } else {
      items.push(`<li><span class="what">Season complete. R = 0, so there is nothing left to forecast.</span>
<pre>final = ${s.H} / ${s.AB} = <span class="res">${fmt(s.mean)}</span>
The talent estimate (${fmt(s.p)}) still differs: one season can't settle true ability.</pre></li>`);
    }
    ol.innerHTML = items.join('');
  }

  function domain(m){
    let lo = 1, hi = 0;
    m.states.forEach(s => {
      if (s.lo != null) lo = Math.min(lo, s.lo); if (s.hi != null) hi = Math.max(hi, s.hi);
      if (s.seasonAvg != null && s.k >= 4){ lo = Math.min(lo, s.seasonAvg); hi = Math.max(hi, s.seasonAvg); }
      lo = Math.min(lo, s.p); hi = Math.max(hi, s.p);
    });
    lo = Math.max(0, Math.floor((lo - 0.02) * 50) / 50); hi = Math.min(1, Math.ceil((hi + 0.02) * 50) / 50);
    if (hi - lo < 0.06){ const c = (hi + lo) / 2; lo = Math.max(0, c - 0.03); hi = Math.min(1, c + 0.03); }
    return [lo, hi];
  }
  const ns = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, txt) => { const e = document.createElementNS(ns, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (txt != null) e.textContent = txt; return e; };
  function ticks(lo, hi){ const span = hi - lo, st = span > 0.3 ? 0.05 : span > 0.12 ? 0.02 : 0.01, out = []; for (let v = Math.ceil(lo/st)*st; v <= hi + 1e-9; v += st) out.push(+v.toFixed(3)); return out; }

  function renderCurve(m){
    const svg = $('curveChart'); svg.innerHTML = '';
    const W = 640, Hh = 300, L = 16, Rr = 16, T = 18, B = 34;
    const [x0, x1] = domain(m);
    const X = v => L + (v - x0) / (x1 - x0) * (W - L - Rr);
    const cur = m.states[step];
    const ref = cur.R > 0 ? cur : m.states[Math.max(0, step - 1)];
    const ymax = Math.max(...ref.pts.map(p => p[1]), 1) * 1.12;
    const Y = v => Hh - B - v / ymax * (Hh - B - T);
    ticks(x0, x1).forEach(t => {
      svg.appendChild(el('line', { x1: X(t), x2: X(t), y1: T, y2: Hh - B, stroke: '#1c2638' }));
      svg.appendChild(el('text', { x: X(t), y: Hh - 12, 'text-anchor': 'middle' }, fmt(t)));
    });
    svg.appendChild(el('line', { x1: L, x2: W - Rr, y1: Hh - B, y2: Hh - B, stroke: '#2a3850' }));
    const pathFor = pts => pts.filter(p => p[0] >= x0 - 0.01 && p[0] <= x1 + 0.01).map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Math.max(T - 4, Y(p[1])).toFixed(1)}`).join('');
    // preseason
    const pre = m.states[0];
    if (step !== 0) svg.appendChild(el('path', { d: pathFor(pre.pts), fill: 'none', stroke: '#8a96a8', 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }));
    // earlier windows
    for (let k = 1; k < step; k++){
      const s = m.states[k]; if (!s.pts.length) continue;
      svg.appendChild(el('path', { d: pathFor(s.pts), fill: 'none', stroke: 'rgba(111,211,160,.28)', 'stroke-width': 1.2 }));
    }
    if (cur.R > 0){
      const d = pathFor(cur.pts);
      const pts = cur.pts.filter(p => p[0] >= x0 - 0.01 && p[0] <= x1 + 0.01);
      if (pts.length){
        const area = `${d}L${X(pts[pts.length-1][0]).toFixed(1)},${Hh-B}L${X(pts[0][0]).toFixed(1)},${Hh-B}Z`;
        // 95% band shading
        const band = cur.pts.filter(p => p[0] >= cur.lo && p[0] <= cur.hi);
        if (band.length > 1){
          const bd = band.map((p,i)=>`${i?'L':'M'}${X(p[0]).toFixed(1)},${Math.max(T-4,Y(p[1])).toFixed(1)}`).join('') + `L${X(band[band.length-1][0]).toFixed(1)},${Hh-B}L${X(band[0][0]).toFixed(1)},${Hh-B}Z`;
          svg.appendChild(el('path', { d: area, fill: 'rgba(111,211,160,.06)' }));
          svg.appendChild(el('path', { d: bd, fill: 'rgba(111,211,160,.18)' }));
        }
        svg.appendChild(el('path', { d, fill: 'none', stroke: '#6fd3a0', 'stroke-width': 2.6, 'stroke-linejoin': 'round' }));
      }
      // mean marker
      svg.appendChild(el('line', { x1: X(cur.mean), x2: X(cur.mean), y1: T, y2: Hh - B, stroke: '#6fd3a0', 'stroke-width': 1, 'stroke-dasharray': '2 3' }));
      const lx = Math.min(Math.max(X(cur.mean), L + 60), W - Rr - 60);
      svg.appendChild(el('text', { x: lx, y: T + 2, 'text-anchor': 'middle', fill: '#6fd3a0', style: 'fill:#6fd3a0;font-weight:700' }, `E = ${fmt(cur.mean)}`));
      svg.appendChild(el('text', { x: W - Rr, y: T + 18, 'text-anchor': 'end' }, `shaded: 95% range ${fmt(cur.lo)}–${fmt(cur.hi)}`));
    } else {
      svg.appendChild(el('line', { x1: X(cur.mean), x2: X(cur.mean), y1: T + 10, y2: Hh - B, stroke: '#6fd3a0', 'stroke-width': 3 }));
      const lx = Math.min(Math.max(X(cur.mean), L + 110), W - Rr - 110);
      svg.appendChild(el('text', { x: lx, y: T + 2, 'text-anchor': 'middle', style: 'fill:#6fd3a0;font-weight:700' }, `Final ${fmt(cur.mean)}: no uncertainty left`));
    }
    if (cur.seasonAvg != null && cur.R > 0 && cur.seasonAvg >= x0 && cur.seasonAvg <= x1){
      svg.appendChild(el('line', { x1: X(cur.seasonAvg), x2: X(cur.seasonAvg), y1: T + 26, y2: Hh - B, stroke: '#f2c46d', 'stroke-width': 1.5, 'stroke-dasharray': '1 3' }));
    }
    // variance split
    const vs = $('varSplit');
    if (cur.R > 0){
      const tot = cur.luck + cur.ign, lp = cur.luck / tot * 100;
      vs.innerHTML = `<div class="muted">Where the uncertainty comes from (variance in future hits)</div>
        <div class="var-bar"><div class="luck" style="width:${lp}%"></div><div class="ign" style="width:${100-lp}%"></div></div>
        <div class="var-labels"><span><span style="color:var(--blue)">■</span> Luck <b>${cur.luck.toFixed(1)}</b> (${lp.toFixed(0)}%)</span><span><span style="color:#c9a3ff">■</span> Talent uncertainty <b>${cur.ign.toFixed(1)}</b> (${(100-lp).toFixed(0)}%)</span><span>SD <b>${(Math.sqrt(tot)/cur.N).toFixed(3)}</b></span></div>`;
    } else vs.innerHTML = `<div class="muted">All 160 games played. Both luck and talent uncertainty about this season's average are now zero.</div>`;
  }

  function renderTraj(m){
    const svg = $('trajChart'); svg.innerHTML = '';
    const W = 640, Hh = 280, L = 46, Rr = 14, T = 14, B = 30;
    const [y0, y1] = domain(m);
    const X = g => L + g / GAMES * (W - L - Rr), Y = v => T + (1 - (v - y0) / (y1 - y0)) * (Hh - T - B);
    const clampY = v => Y(Math.min(y1, Math.max(y0, v)));
    ticks(y0, y1).forEach(t => {
      svg.appendChild(el('line', { x1: L, x2: W - Rr, y1: Y(t), y2: Y(t), stroke: '#1c2638' }));
      svg.appendChild(el('text', { x: L - 6, y: Y(t) + 4, 'text-anchor': 'end' }, fmt(t)));
    });
    [0,40,80,120,160].forEach(g => svg.appendChild(el('text', { x: X(g), y: Hh - 10, 'text-anchor': 'middle' }, g === 0 ? 'Pre' : `G${g}`)));
    const S = m.states;
    // band
    const up = S.map(s => `${X(s.g).toFixed(1)},${clampY(s.hi).toFixed(1)}`), dn = S.slice().reverse().map(s => `${X(s.g).toFixed(1)},${clampY(s.lo).toFixed(1)}`);
    svg.appendChild(el('path', { d: `M${up.join('L')}L${dn.join('L')}Z`, fill: 'rgba(111,211,160,.13)' }));
    // talent
    svg.appendChild(el('path', { d: 'M' + S.map(s => `${X(s.g).toFixed(1)},${clampY(s.p).toFixed(1)}`).join('L'), fill: 'none', stroke: '#c9a3ff', 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }));
    // season avg
    const sa = S.filter(s => s.seasonAvg != null);
    svg.appendChild(el('path', { d: 'M' + sa.map(s => `${X(s.g).toFixed(1)},${clampY(s.seasonAvg).toFixed(1)}`).join('L'), fill: 'none', stroke: '#f2c46d', 'stroke-width': 1.8 }));
    // projection
    svg.appendChild(el('path', { d: 'M' + S.map(s => `${X(s.g).toFixed(1)},${clampY(s.mean).toFixed(1)}`).join('L'), fill: 'none', stroke: '#6fd3a0', 'stroke-width': 2.6 }));
    // 10-game dots
    S.forEach(s => { if (s.blockAvg != null) svg.appendChild(el('circle', { cx: X(s.g - 5), cy: clampY(s.blockAvg), r: 3.4, fill: '#7fb2ff', opacity: s.k <= step ? 0.95 : 0.3 })); });
    // future fade
    if (step < BLOCKS) svg.appendChild(el('rect', { x: X(S[step].g), y: T, width: X(GAMES) - X(S[step].g), height: Hh - T - B, fill: 'rgba(10,14,22,.55)' }));
    const cx = X(S[step].g);
    svg.appendChild(el('line', { x1: cx, x2: cx, y1: T, y2: Hh - B, stroke: '#e6ebf2', 'stroke-width': 1, opacity: .5 }));
    svg.appendChild(el('circle', { cx, cy: clampY(S[step].mean), r: 5, fill: '#6fd3a0', stroke: '#0a0e16', 'stroke-width': 2 }));
    // click to select
    const hit = el('rect', { x: L, y: T, width: W - L - Rr, height: Hh - T - B, fill: 'transparent', style: 'cursor:pointer' });
    hit.addEventListener('click', ev => {
      const r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) / r.width * W;
      setStep(Math.round(Math.min(GAMES, Math.max(0, (px - L) / (W - L - Rr) * GAMES)) / 10));
    });
    svg.appendChild(hit);
  }

  function buildTable(){
    const tb = $('logBody'); tb.innerHTML = '';
    state.blocks.forEach(([ab, h], i) => {
      const tr = document.createElement('tr'); tr.dataset.k = i + 1;
      tr.innerHTML = `<td>${i*10+1}–${i*10+10}</td>
        <td><input class="num h" inputmode="numeric" value="${h}" aria-label="Hits games ${i*10+1} to ${i*10+10}"></td>
        <td><input class="num ab" inputmode="numeric" value="${ab}" aria-label="At-bats games ${i*10+1} to ${i*10+10}"></td>
        <td class="c-blk"></td><td class="c-sea"></td><td class="c-bay bayes"></td><td class="c-rng"></td>`;
      tr.addEventListener('click', e => { if (e.target.tagName !== 'INPUT') setStep(i + 1); });
      tb.appendChild(tr);
    });
    tb.querySelectorAll('input').forEach(inp => inp.addEventListener('input', update));
  }
  function renderTable(m){
    document.querySelectorAll('#logBody tr').forEach((tr, i) => {
      const s = m.states[i + 1];
      tr.querySelector('.c-blk').textContent = fmt(s.blockAvg);
      tr.querySelector('.c-sea').textContent = fmt(s.seasonAvg);
      tr.querySelector('.c-bay').textContent = fmt(s.mean);
      tr.querySelector('.c-rng').textContent = s.R ? `${fmt(s.lo)}–${fmt(s.hi)}` : 'final';
      tr.classList.toggle('sel', i + 1 === step);
      tr.classList.toggle('future', i + 1 > step);
    });
  }

  function renderGuide(m){
    // Worked example follows the window selected in the Simulator (needs games played and games remaining).
    const ex = step >= 1 && step <= 15 ? step : (step === 0 ? 1 : 15);
    const s = m.states[ex];
    const { h1, ab1, h2, ab2, w1, w2 } = state;
    const W = v => v.toFixed(2), pts = d => Math.round(Math.abs(d) * 1000);
    const outs = s.AB - s.H, sa = s.seasonAvg, pm = m.priorMean, N0 = m.priorN;
    const cmp = (d, up, down, same) => Math.abs(d) < 0.0005 ? same : d > 0 ? up : down;
    const note = ex === step
      ? `Worked numbers below use your current inputs and the window selected in the Simulator (game ${s.g}).`
      : `Worked numbers below use your current inputs at game ${s.g}. Select a window from 10 to 150 in the Simulator to change it.`;
    const startTxt = sa == null
      ? `After ${s.g} games our batter has no at-bats yet.`
      : `After ${s.g} games our batter is hitting <b>${fmt(sa)}</b> (${s.H} for ${s.AB}).`;
    const histTxt = sa == null ? '' : cmp(sa - pm, ` That's ${pts(sa - pm)} points above what his history suggests.`, ` That's ${pts(sa - pm)} points below what his history suggests.`, ' That matches his history.');
    const poolN = ab1 + ab2, poolMean = poolN ? (h1 + h2) / poolN : NaN;
    const wShare = s.AB / (s.AB + N0);
    const talentVsStart = sa == null ? '' : cmp(s.p - sa,
      ` That's above his ${fmt(sa)} start.`,
      ` That's well short of his ${fmt(sa)} start.`,
      ` That's the same as his ${fmt(sa)} start.`);
    const weightTxt = N0 > s.AB
      ? ` The ${Math.round(N0)} pseudo-at-bats of history still outweigh his ${s.AB} real ones.`
      : ` His ${s.AB} real at-bats now outweigh the ${Math.round(N0)} pseudo-at-bats of history.`;
    const fut = s.R * s.p;
    const finVsTalent = cmp(s.mean - s.p,
      `The final-average estimate (${fmt(s.mean)}) sits above the talent estimate (${fmt(s.p)}) because his ${s.H} hits in ${s.AB} at-bats, a better rate than ${fmt(s.p)}, are already banked.`,
      `The final-average estimate (${fmt(s.mean)}) sits below the talent estimate (${fmt(s.p)}) because his ${s.H} hits in ${s.AB} at-bats, a worse rate than ${fmt(s.p)}, are already banked.`,
      `The final-average estimate (${fmt(s.mean)}) matches the talent estimate (${fmt(s.p)}).`);
    const tot = s.luck + s.ign, sd = Math.sqrt(tot);

    $('guideDyn').innerHTML = `
      <section class="card">
        <h2 class="g">1. The Question</h2>
        <p class="guide-note">${note}</p>
        <p>${startTxt} His two previous seasons, weighted ${W(w1)} and ${W(w2)}, say he is a <b>${fmt(pm)}</b> hitter.${histTxt} What will he hit by game 160, and how sure can we be?</p>
        <p>Bayes' theorem answers both questions with one rule: <b>posterior ∝ likelihood × prior</b>. We start with what history says (the prior), weigh it against what we've seen this season (the likelihood), and end up with an updated belief (the posterior). That posterior becomes the prior for the next 10 games.</p>
        <div class="callout"><b>Yesterday's posterior is today's prior.</b> Updating once with all 160 games gives exactly the same answer as updating 16 times, 10 games at a time. Bayes only cares about total hits and total outs, not the order they came in.</div>
      </section>

      <section class="card">
        <h2 class="g">2. Building the Prior from Two Seasons</h2>
        <p>A hitter's true chance of a hit in any at-bat, θ, is unknown. We describe our belief about it with a <b>Beta distribution</b>. You can read its two parameters as pseudo-hits and pseudo-outs:</p>
        <pre class="eq">α₀ = w₁·H₁ + w₂·H₂        β₀ = w₁·(AB₁−H₁) + w₂·(AB₂−H₂)</pre>
        <p>With your inputs (Season 1: ${h1}/${ab1}, Season 2: ${h2}/${ab2}, weights ${W(w1)} and ${W(w2)}):</p>
        <pre class="eq">α₀ = ${W(w1)}·${h1} + ${W(w2)}·${h2} = ${f1(m.a0)}
β₀ = ${W(w1)}·${ab1 - h1} + ${W(w2)}·${ab2 - h2} = ${f1(m.b0)}
Prior mean = ${f1(m.a0)} / ${f1(N0)} = ${fmt(pm)}      Prior strength = ${Math.round(N0)} pseudo-at-bats</pre>
        <p>Two choices go into the weights:</p>
        <ul>
          <li><b>Recency.</b> Last year usually counts more than two years ago, because players change. A 5:4 ratio (for example 0.5 and 0.4) follows Tom Tango's Marcel projection system, which weights recent seasons 5/4/3.</li>
          <li><b>Overall trust.</b> Pooling both seasons at full weight (1.0/1.0) would give ${poolN.toLocaleString()} pseudo-at-bats with a mean of ${fmt(poolMean)}, which the current season could barely move. Batting average is noisy (FanGraphs puts its stabilization point near 910 at-bats), so a lighter prior is usually more honest.</li>
        </ul>
      </section>

      <section class="card">
        <h2 class="g">3. Updating: Beta-Binomial Conjugacy</h2>
        <p>Each at-bat is a hit or an out, so the data follow a Binomial distribution. Because the Beta is the <b>conjugate prior</b> for the Binomial, Bayes' theorem reduces to simple addition:</p>
        <pre class="eq">α = α₀ + total hits so far
β = β₀ + total outs so far          (outs = AB − H, not AB)
E[θ | data] = α / (α + β)</pre>
        <p>At game ${s.g}: α = ${f1(m.a0)} + ${s.H} = ${f1(s.a)}, β = ${f1(m.b0)} + ${outs} = ${f1(s.b)}, so the talent estimate is ${f1(s.a)} / ${f1(s.a + s.b)} = <b>${fmt(s.p)}</b>.${talentVsStart}${weightTxt}</p>
        <p>The estimate is a weighted average of the two sources:</p>
        <pre class="eq">θ̂ = (1 − w)·prior mean + w·season avg,     w = AB / (AB + α₀ + β₀)
   = (1 − ${wShare.toFixed(3)})·${fmt(pm)} + ${wShare.toFixed(3)}·${sa == null ? '—' : fmt(sa)} = ${fmt(s.p)}</pre>
      </section>

      <section class="card">
        <h2 class="g">4. Item 3: The Bayes Final-Average Estimate</h2>
        <p>The final average is <b>not</b> the same thing as θ. The hits already recorded are locked in. Only the at-bats still to come are uncertain. So we split the season into its past and its future:</p>
        <pre class="eq">R = remaining at-bats = (AB so far / games so far) × (160 − games)
E[final AVG] = (H so far + R · α/(α+β)) / (AB so far + R)</pre>
        <p>At game ${s.g}: R = ${s.AB > 0 ? `(${s.AB} / ${s.g}) × ${GAMES - s.g}` : `prior pace × ${GAMES - s.g}`} = ${s.R}, so expected future hits = ${s.R} × ${f4(s.p)} = ${fut.toFixed(1)}.</p>
        <pre class="eq">E[final AVG] = (${s.H} + ${fut.toFixed(1)}) / (${s.AB} + ${s.R}) = ${(s.H + fut).toFixed(1)} / ${s.N} = ${fmt(s.mean)}</pre>
        <p>${finVsTalent}</p>
      </section>

      <section class="card">
        <h2 class="g">5. Item 4: The Uncertainty Curve</h2>
        <p>Future hits Y follow a <b>Beta-Binomial</b> distribution, which is a Binomial whose hit probability is itself uncertain:</p>
        <pre class="eq">P(Y = y) = C(R, y) · B(y + α, R − y + β) / B(α, β),    y = 0 … R
Final AVG for each y = (H + y) / (AB + R)</pre>
        <p>The app computes this probability for every possible y, using log-gamma functions to avoid overflow, and plots it. That plot is the uncertainty curve for that 10-game window. The 95% range comes from reading the 2.5% and 97.5% points off the cumulative distribution.</p>
        <p>The variance splits into two kinds of uncertainty:</p>
        <pre class="eq">Var(Y) = R·p(1−p)           ← luck: dice still to be rolled
       + R²·Var(θ)          ← ignorance: we don't know his true talent
where p = α/(α+β),  Var(θ) = p(1−p)/(α+β+1)</pre>
        <p>At game ${s.g}: luck = ${s.R} × ${f4(s.p)} × ${f4(1 - s.p)} = ${s.luck.toFixed(1)}; ignorance = ${s.R}² × ${s.varTheta.toExponential(2)} = ${s.ign.toFixed(1)}. The total is ${tot.toFixed(1)} hits², so the SD is ${sd.toFixed(1)} hits, or ${(sd / s.N).toFixed(3)} in batting average. The exact 95% range is <b>${fmt(s.lo)}–${fmt(s.hi)}</b>.</p>
        <div class="callout"><b>Why the curve narrows.</b> Both parts shrink as the season goes on, but for different reasons. Luck shrinks because fewer at-bats remain. Ignorance shrinks because the posterior sharpens. At game 160, R = 0 and the curve collapses onto his actual average.</div>
      </section>`;
  }

  function renderAll(){
    if (!model) return;
    renderPrior(model); renderKpis(model); renderSteps(model); renderCurve(model); renderTraj(model); renderTable(model); renderGuide(model);
  }
  function update(){
    if (validate()) model = compute();
    renderAll();
  }
  function setStep(k){ step = Math.max(0, Math.min(BLOCKS, k)); renderAll(); }

  // ---------- wiring ----------
  function syncInputs(){
    ['h1','ab1','h2','ab2'].forEach(k => $(k).value = state[k]);
    $('w1').value = state.w1; $('w2').value = state.w2;
  }
  ['h1','ab1','h2','ab2'].forEach(k => $(k).addEventListener('input', update));
  $('w1').addEventListener('input', e => { state.w1 = +e.target.value; update(); });
  $('w2').addEventListener('input', e => { state.w2 = +e.target.value; update(); });
  document.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
    const p = c.dataset.preset;
    if (p === 'weighted') { state.w1 = 0.4; state.w2 = 0.5; }
    if (p === 'pooled') { state.w1 = 1; state.w2 = 1; }
    if (p === 'recent') { state.w1 = 0; state.w2 = 1; }
    syncInputs(); update();
  }));
  $('resetBtn').addEventListener('click', () => {
    stopPlay(); state = JSON.parse(JSON.stringify(DEFAULTS)); syncInputs(); buildTable(); step = 2; update();
  });
  $('stepRange').addEventListener('input', e => { stopPlay(); setStep(+e.target.value); });
  $('prevBtn').addEventListener('click', () => { stopPlay(); setStep(step - 1); });
  $('nextBtn').addEventListener('click', () => { stopPlay(); setStep(step + 1); });
  function stopPlay(){ if (playing){ clearInterval(playing); playing = null; $('playBtn').textContent = 'Play'; } }
  $('playBtn').addEventListener('click', () => {
    if (playing) return stopPlay();
    if (step >= BLOCKS) setStep(0);
    $('playBtn').textContent = 'Pause';
    playing = setInterval(() => { if (step >= BLOCKS) return stopPlay(); setStep(step + 1); }, 750);
  });
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => { x.classList.toggle('active', x === t); x.setAttribute('aria-selected', x === t); });
    $('tab-sim').classList.toggle('hidden', t.dataset.tab !== 'sim');
    $('tab-guide').classList.toggle('hidden', t.dataset.tab !== 'guide');
  }));

  buildTable(); update();
})();
