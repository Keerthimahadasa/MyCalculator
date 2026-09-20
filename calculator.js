'use strict';
/* ========== State and helpers ========== */
const $ = s => document.querySelector(s);
const state = { expr: '', ans: 0, angle: 'DEG', mem: 0, memSet: false, vars: { A: 0, B: 0, C: 0, X: 0, Y: 0 },
  fmt: 'norm', frac: false, second: false, done: false, hist: [] };
class CalcError extends Error {}
const bad = m => { throw new CalcError(m); };
const errMsg = e => e instanceof CalcError ? e.message : 'Invalid expression';
const SI = { p: 1e-12, n: 1e-9, u: 1e-6, m: 1e-3, k: 1e3, M: 1e6, G: 1e9, T: 1e12 };

/* ========== Scientific functions ========== */
// Angle helpers: trig functions take the selected mode into account
const toRad = x => state.angle === 'DEG' ? x * Math.PI / 180 : state.angle === 'GRAD' ? x * Math.PI / 200 : x;
const fromRad = x => state.angle === 'DEG' ? x * 180 / Math.PI : state.angle === 'GRAD' ? x * 200 / Math.PI : x;
const tidy = v => Math.abs(v) < 1e-12 ? 0 : v; // removes 1.2e-16 style noise
const fact = n => { if (!Number.isInteger(n) || n < 0 || n > 170) bad('Invalid factorial: use an integer from 0 to 170');
  let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };
const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
const acs = f => x => Math.abs(x) > 1 ? bad('Invalid input: value must be between -1 and 1') : fromRad(f(x));
const FN = {
  sin: x => tidy(Math.sin(toRad(x))), cos: x => tidy(Math.cos(toRad(x))),
  tan: x => Math.abs(Math.cos(toRad(x))) < 1e-12 ? bad('Tangent is undefined here') : tidy(Math.tan(toRad(x))),
  asin: acs(Math.asin), acos: acs(Math.acos), atan: x => fromRad(Math.atan(x)),
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, asinh: Math.asinh,
  acosh: x => x < 1 ? bad('Invalid input: x must be at least 1') : Math.acosh(x),
  atanh: x => Math.abs(x) >= 1 ? bad('Invalid input: |x| must be less than 1') : Math.atanh(x),
  log: x => x <= 0 ? bad('Invalid logarithm: value must be positive') : Math.log10(x),
  ln: x => x <= 0 ? bad('Invalid logarithm: value must be positive') : Math.log(x),
  log2: x => x <= 0 ? bad('Invalid logarithm: value must be positive') : Math.log2(x),
  exp: Math.exp, sqrt: x => x < 0 ? bad('Invalid square root of a negative number') : Math.sqrt(x), cbrt: Math.cbrt,
  abs: Math.abs, floor: Math.floor, ceil: Math.ceil, sign: Math.sign, rand: () => Math.random(),
  fact, npr: (n, r) => Math.round(fact(n) / fact(n - r)), ncr: (n, r) => Math.round(fact(n) / (fact(r) * fact(n - r))),
  gcd, lcm: (a, b) => a && b ? Math.abs(a * b) / gcd(a, b) : 0,
  root: (n, x) => n === 0 ? bad('Invalid root') : x < 0 ? (n % 2 ? -Math.pow(-x, 1 / n) : bad('Even root of a negative number')) : Math.pow(x, 1 / n),
};
FN.log10 = FN.log;
const CONST = { pi: Math.PI, e: Math.E, phi: (1 + Math.sqrt(5)) / 2 };

/* ========== Expression parser (no eval) ========== */
function tokenize(s) {
  s = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/π/g, 'pi').replace(/φ/g, 'phi')
       .replace(/√/g, 'sqrt').replace(/[µμ]/g, 'u').replace(/²/g, '^2').replace(/³/g, '^3');
  const out = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    let m = s.slice(i).match(/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i);
    if (m) { // number, optional scientific notation (6.02e23) and SI prefix (4.7k)
      let v = parseFloat(m[0]); i += m[0].length;
      if (s[i] && SI[s[i]] && !/[a-z]/i.test(s[i + 1] || '')) v *= SI[s[i++]];
      out.push({ t: 'n', v }); continue;
    }
    m = s.slice(i).match(/^[a-z][a-z0-9]*/i);
    if (m) { out.push({ t: 'i', v: m[0] }); i += m[0].length; continue; }
    if ('+-*/^!%(),'.includes(c)) { out.push({ t: 'o', v: c }); i++; continue; }
    bad('Invalid expression');
  }
  return out;
}
// Recursive descent: expr > term > unary > power > postfix > primary
function evaluate(str, extra) {
  try {
    const open = (str.match(/\(/g) || []).length - (str.match(/\)/g) || []).length;
    const tk = tokenize(str + ')'.repeat(Math.max(open, 0))); let p = 0;
    const isO = v => tk[p] && tk[p].t === 'o' && tk[p].v === v;
    const need = v => isO(v) ? p++ : bad('Invalid expression');
    const expr = () => { let v = term(); while (isO('+') || isO('-')) { const o = tk[p++].v, r = term(); v = o === '+' ? v + r : v - r; } return v; };
    const term = () => { let v = unary();
      for (;;) {
        if (isO('*') || isO('/')) { const o = tk[p++].v, r = unary(); if (o === '/') { if (r === 0) bad('Cannot divide by zero'); v /= r; } else v *= r; }
        else if (tk[p] && tk[p].t === 'i' && tk[p].v.toLowerCase() === 'mod') { p++; const r = unary(); if (r === 0) bad('Cannot divide by zero'); v = ((v % r) + r) % r; }
        else if (tk[p] && (tk[p].t === 'n' || tk[p].t === 'i' || isO('('))) v *= unary(); // implicit multiplication: 2π, 3(4)
        else return v;
      } };
    const unary = () => isO('-') ? (p++, -unary()) : isO('+') ? (p++, unary()) : power();
    const power = () => { const b = post(); if (isO('^')) { p++; return Math.pow(b, unary()); } return b; };
    const post = () => { let v = primary(); for (;;) { if (isO('!')) { p++; v = fact(v); } else if (isO('%')) { p++; v /= 100; } else return v; } };
    const primary = () => {
      const k = tk[p++]; if (!k) bad('Invalid expression');
      if (k.t === 'n') return k.v;
      if (k.t === 'o' && k.v === '(') { const v = expr(); need(')'); return v; }
      if (k.t === 'i') {
        const n = k.v.toLowerCase();
        if (isO('(') && Object.hasOwn(FN, n)) { p++; const a = []; if (!isO(')')) { a.push(expr()); while (isO(',')) { p++; a.push(expr()); } } need(')'); return FN[n](...a); }
        if (n === 'ans') return state.ans;
        if (Object.hasOwn(CONST, n)) return CONST[n];
        const V = k.v.toUpperCase();
        if (extra && V in extra) return extra[V];
        if (V in state.vars) return state.vars[V];
      }
      return bad('Invalid expression');
    };
    const v = expr();
    if (p < tk.length) bad('Invalid expression');
    if (!isFinite(v)) bad('Invalid mathematical operation');
    return v;
  } catch (e) { throw e instanceof CalcError ? e : new CalcError('Invalid expression'); }
}

/* ========== Number formatting ========== */
function toFraction(x) { // continued fractions
  if (Number.isInteger(x)) return null;
  const s = x < 0 ? '-' : ''; x = Math.abs(x);
  let h1 = 1, h0 = 0, k1 = 0, k0 = 1, b = x;
  for (let i = 0; i < 20; i++) {
    const a = Math.floor(b);
    [h1, h0] = [a * h1 + h0, h1]; [k1, k0] = [a * k1 + k0, k1];
    if (Math.abs(x - h1 / k1) < 1e-10) return k1 <= 10000 ? `${s}${h1}/${k1}` : null;
    b = 1 / (b - a);
  }
  return null;
}
function fmt(n) {
  n = parseFloat(n.toPrecision(12)); // hides floating-point noise like 0.1+0.2
  if (state.frac) { const f = toFraction(n); if (f) return f; }
  if (n === 0) return '0';
  if (state.fmt === 'sci') return n.toExponential().replace('e+', 'e');
  if (state.fmt === 'eng') { const ex = Math.floor(Math.log10(Math.abs(n)) / 3) * 3; return parseFloat((n / 10 ** ex).toPrecision(12)) + 'e' + ex; }
  return Math.abs(n) >= 1e12 || Math.abs(n) < 1e-9 ? n.toExponential().replace('e+', 'e') : String(n);
}

/* ========== Calculator display, memory, history, variables ========== */
const setExpr = s => { state.expr = s; $('#expr').textContent = s; $('#expr').scrollLeft = 1e6;
  try { $('#result').textContent = s ? fmt(evaluate(s)) : '0'; } catch { $('#result').textContent = s ? '' : '0'; } };
function press(t) {
  if (state.done) { state.done = false; state.expr = /^[+\-*/^%!]|^ mod/.test(t) ? 'Ans' : ''; }
  setExpr(state.expr + t);
}
const current = () => state.expr ? evaluate(state.expr) : state.ans;
function guard(f) { try { f(); } catch (e) { $('#result').textContent = 'Error: ' + errMsg(e); state.done = true; } }
function loadHist() { try { state.hist = JSON.parse(localStorage.getItem('ecalc_hist')) || []; } catch { state.hist = []; } renderHist(); }
function renderHist() {
  const ul = $('#histList'); ul.innerHTML = '';
  state.hist.forEach(([e, r]) => { const li = document.createElement('li'); li.innerHTML = '<span></span><b></b>';
    li.children[0].textContent = e; li.children[1].textContent = '= ' + r;
    li.onclick = () => { state.done = false; setExpr(e); }; ul.append(li); });
}
function addHist(e, r) { state.hist.unshift([e, r]); state.hist = state.hist.slice(0, 50);
  try { localStorage.setItem('ecalc_hist', JSON.stringify(state.hist)); } catch {} renderHist(); }
const updateMem = () => { $('#memFlag').textContent = state.memSet ? 'M' : ''; };
const updateVars = () => { $('#varVals').textContent = Object.entries(state.vars).map(([k, v]) => k + '=' + fmt(v)).join('  '); };
function factors(n) { const f = []; for (let d = 2; d * d <= n; d++) while (n % d === 0) { f.push(d); n /= d; } if (n > 1) f.push(n); return f; }

const ACT = {
  ac: () => { state.done = false; setExpr(''); $('#prev').textContent = ''; },
  bs: () => { state.done = false; setExpr(state.expr.replace(/(?:[a-z0-9]+\(| mod |.)$/i, '')); },
  neg: () => setExpr(/^-\(.*\)$/.test(state.expr) ? state.expr.slice(2, -1) : state.expr ? `-(${state.expr})` : ''),
  eq: () => guard(() => { if (!state.expr) return; const v = evaluate(state.expr); state.ans = v;
    addHist(state.expr, fmt(v)); $('#prev').textContent = state.expr + ' ='; $('#result').textContent = fmt(v); state.done = true; }),
  mc: () => { state.mem = 0; state.memSet = false; updateMem(); },
  mr: () => press(String(state.mem)),
  mp: () => guard(() => { state.mem += current(); state.memSet = true; updateMem(); }),
  mm: () => guard(() => { state.mem -= current(); state.memSet = true; updateMem(); }),
  ms: () => guard(() => { state.mem = current(); state.memSet = true; updateMem(); }),
  sto: () => guard(() => { state.vars[$('#varSel').value] = current(); updateVars(); }),
  rcl: () => press($('#varSel').value),
  sci: b => { $('#sci').hidden = !$('#sci').hidden; b.classList.toggle('on'); },
  inv: b => { state.second = !state.second; b.classList.toggle('on', state.second); relabel(); },
  frac: b => { state.frac = !state.frac; b.classList.toggle('on', state.frac); setExpr(state.expr); },
  fmt: b => { state.fmt = { norm: 'sci', sci: 'eng', eng: 'norm' }[state.fmt]; b.textContent = { norm: 'Norm', sci: 'Sci fmt', eng: 'Eng fmt' }[state.fmt]; setExpr(state.expr); },
  prime: () => guard(() => { const n = current(); if (!Number.isInteger(n) || n < 2 || n > 1e14) bad('Enter an integer from 2 to 10^14');
    const f = factors(n); $('#prev').textContent = n + (f.length === 1 ? ' is prime' : ' is not prime'); $('#result').textContent = f.join(' × '); state.done = true; }),
  clearhist: () => { state.hist = []; try { localStorage.removeItem('ecalc_hist'); } catch {} renderHist(); },
  theme: b => { const d = document.documentElement, l = d.dataset.theme === 'dark'; d.dataset.theme = l ? 'light' : 'dark';
    b.textContent = l ? 'Dark mode' : 'Light mode'; try { localStorage.setItem('ecalc_theme', d.dataset.theme); } catch {} },
  stats: () => runStats(), ohm: () => runOhm(), rnet: () => runNet(), solve: () => runSolve(), bit: () => runBit(),
};

/* ========== Key layout ========== */
// "label|insert|2nd label|2nd insert" ; inserts starting with @ call an action
const SCI = ['sin|sin(|sin⁻¹|asin(', 'cos|cos(|cos⁻¹|acos(', 'tan|tan(|tan⁻¹|atan(', 'sinh|sinh(|sinh⁻¹|asinh(', 'cosh|cosh(|cosh⁻¹|acosh(', 'tanh|tanh(|tanh⁻¹|atanh(',
  'log|log(|log₂|log2(', 'ln|ln(|eˣ|exp(', '√x|sqrt(|∛x|cbrt(', 'x²|^2|x³|^3', 'xʸ|^|ʸ√x|root(', '1/x|1/(|10ˣ|10^(',
  'x!|!', 'nPr|npr(', 'nCr|ncr(', 'π|π', 'e|e', 'φ|φ', 'abs|abs(', 'mod| mod ', 'EXP|e', 'rand|rand()', 'floor|floor(', 'ceil|ceil(', 'sign|sign(', 'gcd|gcd(', 'lcm|lcm(', ',|,',
  'p|p', 'n|n', 'µ|u', 'm|m', 'k|k', 'M|M', 'G|G', 'T|T'];
const BASIC = ['AC|@ac', '(|(', ')|)', '⌫|@bs', '÷|/', '7|7', '8|8', '9|9', '%|%', '×|*', '4|4', '5|5', '6|6', '±|@neg', '−|-',
  '1|1', '2|2', '3|3', 'Ans|Ans', '+|+', '0|0', '.|.', '=|@eq'];
function build(host, list, cls) {
  list.forEach(s => { const [l, i, al, ai] = s.split('|'); const b = document.createElement('button');
    b.textContent = l; b.dataset.l = l; b.dataset.al = al || l;
    if (i[0] === '@') b.dataset.act = i.slice(1); else { b.dataset.ins = i; b.dataset.ai = ai || i; }
    b.className = cls || (/^[\d.]$/.test(l) ? 'num' : '÷×−+'.includes(l) ? 'op' : l === '=' ? 'eq' : 'fn');
    host.append(b); });
}
const relabel = () => document.querySelectorAll('#sci button').forEach(b => b.textContent = state.second ? b.dataset.al : b.dataset.l);

/* ========== Statistics ========== */
function runStats() {
  const d = $('#stData').value.split(/[\s,;]+/).filter(Boolean).map(Number);
  if (!d.length || d.some(isNaN)) { $('#stOut').innerHTML = '<tr><td>Error: enter numbers only</td></tr>'; return; }
  const n = d.length, sum = d.reduce((a, b) => a + b, 0), mean = sum / n, s = [...d].sort((a, b) => a - b);
  const median = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  const cnt = {}; d.forEach(x => cnt[x] = (cnt[x] || 0) + 1); const mx = Math.max(...Object.values(cnt));
  const modes = mx === 1 ? 'none' : Object.keys(cnt).filter(k => cnt[k] === mx).join(', ');
  const ss = d.reduce((a, x) => a + (x - mean) ** 2, 0), pv = ss / n, sv = n > 1 ? ss / (n - 1) : NaN;
  const rows = [['Count', n], ['Sum', sum], ['Mean', mean], ['Median', median], ['Mode', modes], ['Minimum', s[0]], ['Maximum', s[n - 1]],
    ['Range', s[n - 1] - s[0]], ['Population variance', pv], ['Population std dev', Math.sqrt(pv)],
    ['Sample variance', isNaN(sv) ? 'needs 2+ values' : sv], ['Sample std dev', isNaN(sv) ? 'needs 2+ values' : Math.sqrt(sv)]];
  $('#stOut').innerHTML = rows.map(([k, v]) => `<tr><td>${k}</td><td>${typeof v === 'number' ? parseFloat(v.toPrecision(10)) : v}</td></tr>`).join('');
}

/* ========== Unit conversion (factors are relative to a base unit) ========== */
const UNITS = {
  Length: { mm: .001, cm: .01, m: 1, km: 1000, inch: .0254, foot: .3048, yard: .9144, mile: 1609.344 },
  Mass: { mg: 1e-6, g: .001, kg: 1, ounce: .028349523125, pound: .45359237 },
  Temperature: { Celsius: 1, Fahrenheit: 1, Kelvin: 1 },
  Area: { 'mm²': 1e-6, 'cm²': 1e-4, 'm²': 1, 'km²': 1e6, acre: 4046.8564224, hectare: 1e4 },
  Volume: { mL: .001, L: 1, 'm³': 1000, gallon: 3.785411784 },
  Time: { milliseconds: .001, seconds: 1, minutes: 60, hours: 3600, days: 86400 },
  Speed: { 'm/s': 1, 'km/h': 1 / 3.6, mph: .44704 },
  Pressure: { Pa: 1, kPa: 1e3, MPa: 1e6, bar: 1e5, atm: 101325, psi: 6894.757293168 },
  Energy: { Joule: 1, kJ: 1e3, Wh: 3600, kWh: 3.6e6, calorie: 4.184 },
  Power: { Watt: 1, kW: 1e3, MW: 1e6, horsepower: 745.6998715823 },
  Force: { Newton: 1, kN: 1e3, lbf: 4.4482216152605 },
};
const opts = (sel, arr, i) => { sel.innerHTML = arr.map(x => `<option>${x}</option>`).join(''); sel.selectedIndex = i; };
function fillUnits() { const u = Object.keys(UNITS[$('#cat').value]); opts($('#cFrom'), u, 0); opts($('#cTo'), u, 1); convert(); }
function convert() {
  const c = $('#cat').value, f = $('#cFrom').value, t = $('#cTo').value, v = parseFloat($('#cIn').value); let r;
  if (c === 'Temperature') { const C = f === 'Celsius' ? v : f === 'Fahrenheit' ? (v - 32) * 5 / 9 : v - 273.15;
    r = t === 'Celsius' ? C : t === 'Fahrenheit' ? C * 9 / 5 + 32 : C + 273.15; }
  else r = v * UNITS[c][f] / UNITS[c][t];
  $('#cOut').textContent = isNaN(r) ? '' : `${v} ${f} = ${parseFloat(r.toPrecision(10))} ${t}`;
}

/* ========== Electrical engineering ========== */
const val = id => { const s = $(id).value.trim(); return s ? evaluate(s) : NaN; };
function runOhm() {
  try {
    const g = { V: val('#eV'), I: val('#eI'), R: val('#eR'), P: val('#eP') }, has = k => !isNaN(g[k]); let r = {};
    if (has('V') && has('I')) r = { R: g.V / g.I, P: g.V * g.I };
    else if (has('V') && has('R')) r = { I: g.V / g.R, P: g.V ** 2 / g.R };
    else if (has('I') && has('R')) r = { V: g.I * g.R, P: g.I ** 2 * g.R };
    else if (has('P') && has('V')) r = { I: g.P / g.V, R: g.V ** 2 / g.P };
    else if (has('P') && has('I')) r = { V: g.P / g.I, R: g.P / g.I ** 2 };
    else if (has('P') && has('R')) r = { V: Math.sqrt(g.P * g.R), I: Math.sqrt(g.P / g.R) };
    else bad('Enter at least two values');
    Object.entries(r).forEach(([k, v]) => { if (!isFinite(v)) bad('Cannot divide by zero'); $('#e' + k).value = parseFloat(v.toPrecision(8)); });
    $('#ohmMsg').textContent = '';
  } catch (e) { $('#ohmMsg').textContent = 'Error: ' + errMsg(e); }
}
function runNet() {
  try { const r = $('#rList').value.split(',').map(s => evaluate(s)); if (r.some(x => x <= 0)) bad('Resistances must be positive');
    $('#rOut').textContent = `Series: ${parseFloat(r.reduce((a, b) => a + b).toPrecision(8))} Ω | Parallel: ${parseFloat((1 / r.reduce((a, b) => a + 1 / b, 0)).toPrecision(8))} Ω`;
  } catch (e) { $('#rOut').textContent = 'Error: ' + errMsg(e); }
}

/* ========== Equation solver (linear and quadratic) ========== */
// Evaluate f(x) = left - right at x = 0, 1, -1 and recover a, b, c of ax² + bx + c
function runSolve() {
  try {
    const [l, r = '0'] = $('#eqIn').value.split('=');
    const f = x => evaluate(l, { X: x }) - evaluate(r, { X: x });
    const c = f(0), a = (f(1) + f(-1)) / 2 - c, b = (f(1) - f(-1)) / 2, z = v => Math.abs(v) < 1e-12, n = v => parseFloat(v.toPrecision(10));
    let out;
    if (z(a)) out = z(b) ? (z(c) ? 'Every x is a solution' : 'No solution') : 'x = ' + n(-c / b);
    else { const d = b * b - 4 * a * c;
      if (z(d)) out = 'x = ' + n(-b / (2 * a));
      else if (d > 0) out = 'x = ' + [n((-b - Math.sqrt(d)) / (2 * a)), n((-b + Math.sqrt(d)) / (2 * a))].sort((p, q) => p - q).join(', ');
      else out = `x = ${n(-b / (2 * a))} ± ${n(Math.sqrt(-d) / (2 * Math.abs(a)))}i`; }
    $('#eqOut').textContent = out;
  } catch (e) { $('#eqOut').textContent = 'Error: ' + errMsg(e); }
}

/* ========== Number systems and bitwise operations ========== */
const RX = { 2: /^[01]+$/, 8: /^[0-7]+$/, 10: /^\d+$/, 16: /^[0-9a-f]+$/i };
const show = n => `DEC ${n}\nBIN ${n.toString(2)}\nOCT ${n.toString(8)}\nHEX ${n.toString(16).toUpperCase()}`;
function parseBase(id) { const b = +$('#nsBase').value, s = $(id).value.trim(); if (!RX[b].test(s)) throw new CalcError('Invalid digits for this base'); return parseInt(s, b); }
function runNs() { try { $('#nsOut').textContent = show(parseBase('#nsIn')); } catch (e) { $('#nsOut').textContent = 'Error: ' + errMsg(e); } }
function runBit() {
  try { const a = parseBase('#nsIn'), op = $('#bitOp').value, b = op === 'NOT' ? 0 : parseBase('#nsIn2');
    const r = { AND: a & b, OR: a | b, XOR: a ^ b, NOT: ~a, SHL: a << b, SHR: a >> b }[op] >>> 0; // shown as unsigned 32-bit
    $('#bitOut').textContent = show(r);
  } catch (e) { $('#bitOut').textContent = 'Error: ' + errMsg(e); }
}

/* ========== UI wiring ========== */
function showPane(id) {
  document.querySelectorAll('.pane').forEach(p => p.classList.toggle('active', p.id === id));
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.id === id));
}
document.querySelectorAll('.pane').forEach(p => { const b = document.createElement('button');
  b.textContent = p.dataset.title; b.dataset.id = p.id; b.onclick = () => showPane(p.id); $('#tabs').append(b); });
build($('#sci'), SCI, 'sci'); build($('#basic'), BASIC);
opts($('#cat'), Object.keys(UNITS), 0);
$('#cat').onchange = fillUnits; ['#cIn', '#cFrom', '#cTo'].forEach(s => $(s).addEventListener('input', convert));
['#nsIn', '#nsBase'].forEach(s => $(s).addEventListener('input', runNs));

document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.a) { state.angle = b.dataset.a; document.querySelectorAll('#angle button').forEach(x => x.classList.toggle('on', x === b)); setExpr(state.expr); }
  else if (b.dataset.ins !== undefined) { const alt = state.second && b.dataset.ai !== b.dataset.ins; press(alt ? b.dataset.ai : b.dataset.ins);
    if (state.second) { state.second = false; document.querySelector('[data-act=inv]').classList.remove('on'); relabel(); } }
  else if (b.dataset.act && ACT[b.dataset.act]) ACT[b.dataset.act](b);
});

// Keyboard support (only on the Calculator tab and when not typing in a field)
document.addEventListener('keydown', e => {
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || !$('#calculator').classList.contains('active') || e.ctrlKey || e.metaKey) return;
  const k = e.key;
  if (/^[0-9.+\-*/()^%!,]$/.test(k)) press(k);
  else if (k === 'Enter' || k === '=') { e.preventDefault(); ACT.eq(); }
  else if (k === 'Backspace') ACT.bs(); else if (k === 'Escape') ACT.ac();
  else if (/^[a-z]$/i.test(k) && k.length === 1) press(k);
  else return;
  if (/^[ /'*]$/.test(k)) e.preventDefault();
});

try { const t = localStorage.getItem('ecalc_theme'); if (t) { document.documentElement.dataset.theme = t; $('#theme').textContent = t === 'dark' ? 'Light mode' : 'Dark mode'; } } catch {}
loadHist(); updateVars(); fillUnits(); runNs(); runStats(); runSolve(); showPane('calculator');
