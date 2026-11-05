// © 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Mechanism configurations (MEC-01, P10.1): loading, unit conversion and validation. The JSON Schema
// (spec/schema/mechanism.schema.json, checked by tools/validate.py) fixes the shape; the checks here fix the
// meaning, and they run the same in Node.js and in the browser:
//   - names, units (UCUM, converted to SI once, here) and evidence states of parameters (SUB-03);
//   - every element's fields, through its element module;
//   - every shaft connected to some element (UNCONNECTED);
//   - the mechanism graph (graph.js): over-constrained loops (OVERCONSTRAINED), undetermined shafts and
//     algebraic loops (UNDETERMINED), velocity loops (VELOCITY_LOOP);
//   - initial conditions that fix every state exactly once (INITIAL).
// Every error carries a code and the path of the field that caused it.

import { SubcoreError, parseUnit, toSI, sameDimension, loadYaml, compileFunctions, specHash, parseVectors } from './core.js';
import { ELEMENTS } from './elements/index.js';
import { interpolant } from './elements/cam.js';
import { analyse } from './graph.js';
import { checkDiscrete } from './discrete.js';

export const CONFIG_VERSION = '0.1.0';
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const EVIDENCE = { measured: 'record', sourced: 'citation', assumed: 'assumption', not_established: 'reason' };
const KINDS = ['continuous', 'function', 'discrete'];

export function parseConfig(text, path = '') { return loadYaml(text, path); }

// Validate and normalise. opts.models: { id: model document } for cam tables taken from a model.
// Returns { ok, errors, config (normalised, with _si fields), analysis, hash }.
export function checkConfig(doc, opts = {}) {
  const errors = [];
  const err = (code, path, message) => errors.push({ code, path, message });
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    err('CONFIG', '', 'a configuration is a mapping');
    return { ok: false, errors };
  }
  const cfg = JSON.parse(JSON.stringify(doc));
  const id = cfg.identity || {};
  if (!id.id || !NAME.test(String(id.id).replace(/[-.]/g, '_'))) err('CONFIG', 'identity.id', 'missing or invalid id');
  if (!id.version || !/^\d+\.\d+\.\d+$/.test(id.version)) err('CONFIG', 'identity.version', 'a semantic version is required');
  if (!cfg.substrate || cfg.substrate.id !== 'mechanical') err('CONFIG', 'substrate.id', "the substrate of a mechanism configuration is 'mechanical'");
  if (!KINDS.includes(cfg.kind)) err('CONFIG', 'kind', `kind is one of ${KINDS.join(', ')}`);

  checkParameters(cfg.parameters || [], err);

  if (cfg.kind === 'discrete') {
    checkDiscrete(cfg, err);
    return { ok: errors.length === 0, errors, config: cfg, hash: specHash(doc) };
  }

  // shafts
  const shafts = new Map();
  if (!Array.isArray(cfg.shafts) || cfg.shafts.length === 0) err('CONFIG', 'shafts', 'a mechanism has shafts');
  (cfg.shafts || []).forEach((s, k) => {
    const p = `shafts[${k}]`;
    if (!s || typeof s.name !== 'string' || !NAME.test(s.name)) { err('NAME', `${p}.name`, 'invalid shaft name'); return; }
    if (shafts.has(s.name)) err('NAME', `${p}.name`, `shaft '${s.name}' is declared twice`);
    for (const k of Object.keys(s)) if (!['name', 'unit', 'description'].includes(k)) err('CONFIG', `${p}.${k}`, `unknown key '${k}' (quote a description that holds a comma)`);
    if (s.unit !== 'rad' && s.unit !== 'm') err('UNIT', `${p}.unit`, "a shaft angle is in 'rad'; a slide position is in 'm'");
    shafts.set(s.name, { ...s, index: k });
  });
  cfg.shafts = cfg.shafts || [];

  // elements
  const names = new Set();
  const used = new Map();
  if (!Array.isArray(cfg.elements) || cfg.elements.length === 0) err('CONFIG', 'elements', 'a mechanism has elements');
  cfg.elements = cfg.elements || [];
  cfg.elements.forEach((el, k) => {
    const path = `elements[${k}]`;
    if (!el || typeof el !== 'object') { err('CONFIG', path, 'an element is a mapping'); return; }
    const mod = ELEMENTS[el.kind];
    if (!mod) { err('KIND', `${path}.kind`, `unknown element kind '${el.kind}'`); return; }
    if (typeof el.name !== 'string' || !NAME.test(el.name)) err('NAME', `${path}.name`, 'invalid element name');
    else if (names.has(el.name)) err('NAME', `${path}.name`, `element '${el.name}' is declared twice`);
    names.add(el.name);
    el._si = {};
    const ctx = {
      err,
      unitOf: (n) => (shafts.has(n) ? shafts.get(n).unit : undefined),
      shaft(n, p, unit) {
        if (typeof n !== 'string' || !shafts.has(n)) { err('REFERENCE', p, `'${n}' is not a declared shaft`); return; }
        if (!used.has(n)) used.set(n, []);
        used.get(n).push(p);
        if (unit && shafts.get(n).unit !== unit) err('UNIT', p, `shaft '${n}' is in '${shafts.get(n).unit}', this field needs '${unit}'`);
      },
      quantity(q, p, unit, key) {
        const v = quantity(q, p, unit, err);
        if (v !== undefined && key) el._si[key] = v;
        return v;
      },
    };
    mod.check(el, ctx, path);
    if (el.kind === 'cam' && el.table) el._cam = camTable(el, path, opts, err);
  });
  cfg.shafts.forEach((s, k) => {
    if (s && s.name && !used.has(s.name)) err('UNCONNECTED', `shafts[${k}]`, `shaft '${s.name}' is not connected to any element`);
  });

  // scales, run, initial
  (cfg.scales || []).forEach((sc, k) => {
    const p = `scales[${k}]`;
    if (!shafts.has(sc.shaft)) err('REFERENCE', `${p}.shaft`, `'${sc.shaft}' is not a declared shaft`);
    const u = shafts.has(sc.shaft) ? `${shafts.get(sc.shaft).unit}` : 'rad';
    sc._factor = quantity(sc.factor, `${p}.factor`, undefined, err);
    if (sc.factor && sc.factor.unit && shafts.has(sc.shaft)) {
      // factor is shaft units per model unit: its numerator must be the shaft's unit
      try {
        const fu = parseUnit(sc.factor.unit), su = parseUnit(u);
        if (sc.model_unit !== undefined) {
          const mu = parseUnit(String(sc.model_unit));
          const expect = fu.dim.map((d, i) => d + mu.dim[i]);
          if (expect.some((d, i) => d !== su.dim[i])) err('UNIT', `${p}.factor`, `factor in ${sc.factor.unit} times the model unit ${sc.model_unit} is not the shaft unit ${u}`);
        }
      } catch (e) { /* reported by quantity() */ }
    }
  });
  const run = cfg.run || {};
  cfg._run = {};
  if (cfg.run) {
    for (const k of ['t0', 't1']) {
      if (!Number.isFinite(run[k])) err('VALUE', `run.${k}`, 'a finite number');
      else cfg._run[k] = toSI(run[k], run.unit || 's');
    }
    if (run.unit !== undefined) { try { if (!sameDimension(run.unit, 's')) err('UNIT', 'run.unit', 'a time unit'); } catch (e) { err('UNIT', 'run.unit', e.message); } }
    for (const k of ['rk4_step', 'rtol', 'atol']) if (run[k] !== undefined && !(run[k] > 0)) err('VALUE', `run.${k}`, 'a positive number');
    cfg._run.rk4_step = run.rk4_step !== undefined ? toSI(run.rk4_step, run.unit || 's') : undefined;
    cfg._run.rtol = run.rtol; cfg._run.atol = run.atol; cfg._run.points = run.points;
  }
  (cfg.initial || []).forEach((ic, k) => {
    const p = `initial[${k}]`;
    if (!shafts.has(ic.shaft)) { err('REFERENCE', `${p}.shaft`, `'${ic.shaft}' is not a declared shaft`); return; }
    ic._si = quantity(ic, p, shafts.get(ic.shaft).unit, err);
  });

  let analysis = null;
  if (errors.length === 0) {
    analysis = analyse(cfg);
    errors.push(...analysis.errors);
    if (errors.length === 0) checkInitial(cfg, analysis, err);
  }
  return { ok: errors.length === 0, errors, config: cfg, analysis, hash: specHash(doc) };
}

// Throws the first error (with the whole list in .detail) when the configuration is not valid.
export function loadConfig(docOrText, opts = {}) {
  const doc = typeof docOrText === 'string' ? parseConfig(docOrText, opts.path) : docOrText;
  const r = checkConfig(doc, opts);
  if (!r.ok) {
    const e = r.errors[0];
    throw new SubcoreError(e.code, e.path, `${opts.path ? opts.path + ': ' : ''}${e.message}${r.errors.length > 1 ? ` (and ${r.errors.length - 1} more)` : ''}`, r.errors);
  }
  return r;
}

export function quantity(q, path, unit, err) {
  if (!q || typeof q !== 'object' || typeof q.value !== 'number' || !Number.isFinite(q.value)) {
    err('VALUE', path, 'a quantity is { value: <finite number>, unit: <UCUM> }');
    return undefined;
  }
  if (typeof q.unit !== 'string') { err('UNIT', `${path}.unit`, 'a quantity carries a UCUM unit (1 when dimensionless)'); return undefined; }
  try {
    parseUnit(q.unit);
    if (unit !== undefined && !sameDimension(q.unit, unit)) {
      err('UNIT', `${path}.unit`, `'${q.unit}' does not have the dimension of '${unit}'`);
      return undefined;
    }
    return toSI(q.value, q.unit);
  } catch (e) {
    err('UNIT', `${path}.unit`, e.message);
    return undefined;
  }
}

function checkParameters(params, err) {
  const seen = new Set();
  params.forEach((p, k) => {
    const path = `parameters[${k}]`;
    if (!p || typeof p.name !== 'string' || !NAME.test(p.name)) { err('NAME', `${path}.name`, 'invalid parameter name'); return; }
    if (seen.has(p.name)) err('NAME', `${path}.name`, `parameter '${p.name}' is declared twice`);
    seen.add(p.name);
    if (typeof p.unit !== 'string') err('UNIT', `${path}.unit`, 'a parameter carries a UCUM unit');
    else { try { parseUnit(p.unit); } catch (e) { err('UNIT', `${path}.unit`, e.message); } }
    const ev = p.evidence;
    if (!ev || !EVIDENCE[ev.state]) { err('EVIDENCE', `${path}.evidence.state`, `evidence state is one of ${Object.keys(EVIDENCE).join(', ')}`); return; }
    const need = EVIDENCE[ev.state];
    if (typeof ev[need] !== 'string' || !ev[need]) err('EVIDENCE', `${path}.evidence.${need}`, `evidence '${ev.state}' names its ${need}`);
    if (ev.state === 'not_established') {
      if (p.value !== undefined) err('EVIDENCE', `${path}.value`, 'a value that is not established is not given (it is never a guess)');
    } else if (typeof p.value !== 'number' || !Number.isFinite(p.value)) err('VALUE', `${path}.value`, 'a finite value');
  });
}

function camTable(el, path, opts, err) {
  const t = el.table;
  try {
    let values = t.values;
    if (values === undefined && t.vectors !== undefined) {
      const text = (opts.files || {})[t.vectors];
      if (text === undefined) { err('REFERENCE', `${path}.table.vectors`, `table file '${t.vectors}' is not available to the loader`); return undefined; }
      const v = parseVectors(text);
      if (v.kind !== 'continuous' || v.fields.join() !== 'x,y') { err('VALUE', `${path}.table.vectors`, 'a table file is subcore-vectors with fields x y'); return undefined; }
      const n = v.cases.length;
      for (let k = 0; k < n; k++) {
        const xk = t.from + ((t.to - t.from) * k) / (n - 1);
        if (v.cases[k][0] !== xk) { err('VALUE', `${path}.table.vectors`, `case ${k + 1}: x = ${v.cases[k][0]} is not the table point ${xk}`); return undefined; }
      }
      values = v.cases.map((c) => c[1]);
      el._tableFrom = { vectors: t.vectors, function: v.meta.function, oracle: v.meta.oracle };
    } else if (values === undefined) {
      const model = (opts.models || {})[t.model];
      if (!model) { err('REFERENCE', `${path}.table.model`, `model '${t.model}' is not available to the loader`); return undefined; }
      const fns = compileFunctions(model);
      const j = fns.names.indexOf(t.function);
      if (j < 0) { err('REFERENCE', `${path}.table.function`, `'${t.function}' is not an output of model '${t.model}'`); return undefined; }
      values = [];
      for (let k = 0; k < t.points; k++) values.push(fns.at(t.from + ((t.to - t.from) * k) / (t.points - 1))[j]);
      el._tableFrom = { model: t.model, version: model.identity.version, hash: specHash(model), function: t.function };
    }
    if (!values.every(Number.isFinite)) { err('VALUE', `${path}.table`, 'the table has a non-finite value'); return undefined; }
    const ip = interpolant(t.from, t.to, values);
    return { ...ip, inputScale: el._si.input_scale, outputScale: el._si.output_scale, inputOffset: el._si.input_offset || 0 };
  } catch (e) {
    err(e.code || 'VALUE', `${path}.table`, e.message);
    return undefined;
  }
}

// Initial conditions: every state (integrator wheel, ratchet) is fixed by the initial shaft angles, which
// must give a square, non-singular linear system in the states.
function checkInitial(cfg, analysis, err) {
  const states = analysis.bases.filter((b) => b.type === 'state');
  const n = states.length;
  const ics = cfg.initial || [];
  if (ics.length !== n) {
    err('INITIAL', 'initial', `${n} state(s) (${states.map((s) => s.shaft).join(', ') || 'none'}) need ${n} initial condition(s); ${ics.length} given`);
    return;
  }
  const sIdx = new Map(states.map((s, i) => [s.id, i]));
  const A = [], rhs = [];
  const t0 = cfg._run.t0 || 0;
  for (const [k, ic] of ics.entries()) {
    const f = analysis.forms.get(ic.shaft);
    const row = new Float64Array(n);
    let c0 = 0;
    for (const [id, c] of f) {
      const b = analysis.bases.find((x) => x.id === id);
      if (b.type === 'state') row[sIdx.get(id)] = c.value();
      else if (b.type === 'crank') c0 += c.value() * (b.phase + b.rate * t0);
      else if (b.type === 'setting') c0 += c.value() * b.value;
      else { err('INITIAL', `initial[${k}].shaft`, `shaft '${ic.shaft}' depends on a cam; set initial conditions on shafts the cams do not drive`); return; }
    }
    A.push(row); rhs.push(ic._si - c0);
  }
  const y0 = solveLinear(A, rhs);
  if (!y0) { err('INITIAL', 'initial', 'the initial conditions do not fix every state (the system is singular)'); return; }
  analysis.y0 = y0;
  analysis.states = states;
}

export function solveLinear(A0, b0) {
  const n = b0.length;
  const A = A0.map((r) => Float64Array.from(r)), b = Float64Array.from(b0);
  let scale = 0;
  for (const r of A) for (const v of r) scale = Math.max(scale, Math.abs(v));
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (!(Math.abs(A[p][c]) > 1e-12 * Math.max(scale, 1e-300))) return null;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const m = A[r][c] / A[c][c];
      if (m === 0) continue;
      for (let j = c; j < n; j++) A[r][j] -= m * A[c][j];
      b[r] -= m * b[c];
    }
  }
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = b[i] / A[i][i];
  return x;
}
