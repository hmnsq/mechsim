// © 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The ideal kinematic engine (MEC-02, P10.2). From a validated configuration (config.js) it builds:
//   - the shaft angles as linear forms over the drivers (graph.js), evaluated with one multiply per term;
//   - the integrator equations d theta_w / dt = (r / R_w) omega_d, r = p theta_i / (2 pi), and the ratchet
//     equations d theta_out / dt = max(0, omega_in), as a derivative function f(t, y, dydt) for the shared
//     core's integrators (fixed-step RK4 for parity and interactive runs, Dormand-Prince 5(4) for accuracy);
//   - the speeds of the shafts, propagated through the same linear forms (a cam multiplies by its slope).
// Machine time is crank angle; the model's independent variable is the crank's time t.

import { SubcoreError, integrateFixed, dopri54, grid, writeTrace, sha256Hex, canonicalJson } from './core.js';

export const ENGINE_VERSION = '0.1.0';
const TWO_PI = 2 * Math.PI;

export function compileMechanism(checked) {
  const { config: cfg, analysis } = checked;
  if (!analysis || !analysis.states) throw new SubcoreError('CONFIG', '', 'compileMechanism needs a configuration that passed checkConfig');
  const bases = analysis.bases;
  const bIdx = new Map(bases.map((b, i) => [b.id, i]));
  const states = analysis.states;
  const sIdx = new Map(states.map((s, i) => [s.id, i]));
  const nb = bases.length, ns = states.length;
  const compileForm = (f) => {
    const idx = new Int32Array(f.size), c = new Float64Array(f.size);
    let k = 0;
    for (const [id, co] of f) { idx[k] = bIdx.get(id); c[k] = co.value(); k++; }
    return { idx, c };
  };
  const shaftNames = cfg.shafts.map((s) => s.name);
  const shaftForms = shaftNames.map((n) => compileForm(analysis.forms.get(n)));
  const bv = new Float64Array(nb), bw = new Float64Array(nb), stamp = new Int32Array(nb);
  let epoch = 0;
  const dot = (fm, v) => { let s = 0; for (let k = 0; k < fm.idx.length; k++) s += fm.c[k] * v[fm.idx[k]]; return s; };
  const plan = bases.map((b) => {
    const p = { id: b.id, type: b.type, shaft: b.shaft, path: b.path };
    if (b.type === 'crank') { p.rate = b.rate; p.phase = b.phase; }
    else if (b.type === 'setting') p.value = b.value;
    else if (b.type === 'state') {
      p.s = sIdx.get(b.id);
      p.velForm = compileForm(b.velForm);
      if (b.integrator) {
        p.integrator = true;
        p.integrandForm = compileForm(analysis.forms.get(b.integrand));
        p.pitch = b.pitch; p.wheelRadius = b.wheelRadius; p.halfTravel = b.travel !== undefined ? b.travel / 2 : Infinity;
      } else { p.ratchet = true; p.forward = b.direction === 'forward'; }
    } else if (b.type === 'cam') { p.cam = b.cam; p.inputForm = compileForm(b.inputForm); }
    return p;
  });
  const order = analysis.stateOrder.map((id) => plan[bIdx.get(id)]);
  const stats = { maxRadius: new Float64Array(ns), travelExceeded: new Set() };

  function evalBases(t, y) {
    for (let i = 0; i < nb; i++) {
      const p = plan[i];
      switch (p.type) {
        case 'crank': bv[i] = p.phase + p.rate * t; break;
        case 'setting': bv[i] = p.value; break;
        case 'state': bv[i] = y[p.s]; break;
        case 'cam': {
          const c = p.cam;
          const x = (dot(p.inputForm, bv) - c.inputOffset) / c.inputScale;
          if (!(x >= c.from && x <= c.to)) throw new SubcoreError('CAM_RANGE', p.path, `cam input ${x} is outside its table [${c.from}, ${c.to}] at t=${t}`, { t, x });
          bv[i] = c.outputScale * c.f(x);
          break;
        }
        default: throw new SubcoreError('ENGINE', p.path, `unknown basis type ${p.type}`);
      }
    }
  }
  // speed of basis i (memoised per evaluation by epoch); states must have been computed already
  function vel(i, dydt) {
    if (stamp[i] === epoch) return bw[i];
    const p = plan[i];
    let w;
    if (p.type === 'crank') w = p.rate;
    else if (p.type === 'setting') w = 0;
    else if (p.type === 'state') w = dydt[p.s];
    else {
      const c = p.cam;
      const x = (dot(p.inputForm, bv) - c.inputOffset) / c.inputScale;
      w = c.outputScale * c.df(x) * formVel(p.inputForm, dydt) / c.inputScale;
    }
    bw[i] = w; stamp[i] = epoch;
    return w;
  }
  function formVel(fm, dydt) { let s = 0; for (let k = 0; k < fm.idx.length; k++) s += fm.c[k] * vel(fm.idx[k], dydt); return s; }

  function f(t, y, dydt) {
    evalBases(t, y);
    epoch++;
    for (const p of order) {
      const w = formVel(p.velForm, dydt);
      let d;
      if (p.integrator) {
        const ti = dot(p.integrandForm, bv);
        const r = p.pitch !== undefined ? (p.pitch * ti) / TWO_PI : ti;
        const ar = Math.abs(r);
        if (ar > stats.maxRadius[p.s]) stats.maxRadius[p.s] = ar;
        if (ar > p.halfTravel) stats.travelExceeded.add(p.path);
        d = (r / p.wheelRadius) * w;
      } else d = p.forward ? Math.max(0, w) : Math.min(0, w);
      dydt[p.s] = d;
      stamp[bIdx.get(p.id)] = epoch - 1; // its own speed is now dydt[p.s]; recomputed by vel() on demand
    }
  }
  const shaftValues = (t, y) => { evalBases(t, y); return shaftNames.map((_, k) => dot(shaftForms[k], bv)); };
  const shaftSpeeds = (t, y) => {
    const dydt = new Float64Array(ns);
    f(t, y, dydt);
    epoch++;
    return shaftNames.map((_, k) => formVel(shaftForms[k], dydt));
  };
  return {
    shaftNames, stateNames: states.map((s) => s.shaft), stateElements: states.map((s) => s.element),
    y0: Float64Array.from(analysis.y0), f, shaftValues, shaftSpeeds, stats, config: cfg, hash: checked.hash,
    scales: cfg.scales || [],
  };
}

// Run a compiled mechanism. opts: { solver: 'rk4' | 'dopri54', h, t0, t1, every, points, rtol, atol, log }
// Returns { t: number[], shafts: number[][] (rows of shaft angles), stats, meta }.
export function runMechanism(m, opts = {}) {
  const run = m.config._run || {};
  const t0 = opts.t0 ?? run.t0 ?? 0, t1 = opts.t1 ?? run.t1;
  if (!Number.isFinite(t1)) throw new SubcoreError('RUN', 'run.t1', 'a run needs a horizon');
  const solver = opts.solver || 'rk4';
  const log = opts.log || (() => {});
  m.stats.maxRadius.fill(0); m.stats.travelExceeded.clear();
  let res, meta;
  if (m.stateNames.length === 0) {
    const n = opts.points || run.points || 100;
    const ts = grid(t0, t1, n);
    res = { t: ts, y: ts.map(() => new Float64Array(0)), stats: { steps: 0 } };
    meta = { solver: 'kinematic', step: `${(t1 - t0) / n}` };
  } else if (solver === 'rk4') {
    const h = opts.h ?? run.rk4_step;
    const steps = Math.round((t1 - t0) / h);
    if (Math.abs(steps * h - (t1 - t0)) > 1e-9 * Math.max(1, Math.abs(t1))) throw new SubcoreError('RUN', 'run.rk4_step', `the horizon ${t1 - t0} is not a whole number of steps ${h}`);
    log(`[mechsim] rk4: ${m.stateNames.length} states, h=${h}, ${steps} steps`);
    res = integrateFixed({ f: m.f, t0, y0: m.y0, h, steps, every: opts.every || 1, names: m.stateNames });
    meta = { solver: 'rk4', step: `${h}` };
  } else if (solver === 'dopri54') {
    const tOut = opts.tOut || grid(t0, t1, opts.points || 200);
    const rtol = opts.rtol ?? run.rtol ?? 1e-10, atol = opts.atol ?? run.atol ?? 1e-12;
    log(`[mechsim] dopri54: ${m.stateNames.length} states, rtol=${rtol}, atol=${atol}, ${tOut.length} output times`);
    res = dopri54({ f: m.f, t0, y0: m.y0, tOut, rtol, atol, names: m.stateNames });
    meta = { solver: 'dopri54', tolerances: `rtol=${rtol} atol=${atol}` };
  } else throw new SubcoreError('RUN', 'solver', `unknown solver ${solver}`);
  const shafts = res.t.map((t, k) => m.shaftValues(t, res.y[k]));
  const stats = {
    ...res.stats,
    maxRadius: Object.fromEntries(m.stateNames.map((n, i) => [m.stateElements[i], m.stats.maxRadius[i]]).filter(([e]) => m.config.elements.some((x) => x.name === e && x.kind === 'integrator'))),
    travelExceeded: [...m.stats.travelExceeded],
  };
  log(`[mechsim] ${res.t.length} output points; integrator travel exceeded: ${stats.travelExceeded.length ? stats.travelExceeded.join(', ') : 'none'}`);
  return { t: res.t, shafts, stats, meta };
}

// Model variables from shaft angles through the configuration's scale factors: variable = theta / factor.
export function variables(m, result) {
  const sc = m.scales;
  const idx = sc.map((s) => m.shaftNames.indexOf(s.shaft));
  return {
    names: sc.map((s) => s.variable),
    rows: result.t.map((t, k) => sc.map((s, j) => (result.shafts[k][idx[j]] - (s.offset || 0)) / s._factor)),
  };
}

// The trace text of a run (Guidelines 13): t and every shaft, 17 significant digits, no timestamp.
export function traceText(m, result) {
  return writeTrace({
    model: `${m.config.identity.id} ${m.config.identity.version}`,
    model_sha256: m.hash,
    substrate: 'mechanical 0.1.0',
    parameter_sha256: sha256Hex(canonicalJson(m.config.parameters || [])),
    solver: result.meta.solver,
    step: result.meta.step,
    tolerances: result.meta.tolerances,
    extra: { engine: `mechsim.kinematic ${ENGINE_VERSION}` },
  }, ['t', ...m.shaftNames], result.t.map((t, k) => [t, ...result.shafts[k]]));
}
