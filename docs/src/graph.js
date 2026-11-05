// © 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The mechanism graph (Guidelines 7): kinematic constraints are explicit linear relations between shaft
// angles, solved along a spanning tree. Drivers (cranks, settings, integrator wheels, ratchets and cam
// followers) start the tree; a relation with exactly one shaft not yet determined determines it, and the
// relations used this way form the spanning tree. A relation whose shafts are all determined already closes
// a loop: the loop must be consistent (its residual is exactly zero for rational coefficients), and an
// inconsistent loop is the validation error OVERCONSTRAINED. A shaft no relation reaches is UNDETERMINED: it
// has no driver, or it lies in an algebraic loop with no integrator in it.
//
// Every determined shaft carries a linear form over the drivers (the basis), with exact rational
// coefficients where the path is made of gears and differentials.

import { Coef, formAdd, formScale, formIsZero, formString } from './coef.js';
import { ELEMENTS } from './elements/index.js';

const ONE = Coef.rational(1);

// cfg: a normalised configuration (config.js). Returns
// { forms: Map shaft -> form, bases: [{ id, type, shaft, path, ... }], order: [shaft...], tree: [paths],
//   closures: [{ path, consistent }], stateOrder: [basis ids], errors: [{ code, path, message }] }
export function analyse(cfg) {
  const errors = [];
  const err = (code, path, message) => errors.push({ code, path, message });
  const forms = new Map();
  const bases = [];
  const order = [];
  const tree = [];
  const closures = [];
  const drivenBy = new Map();
  const pendingCams = [];
  const relations = [];

  cfg.elements.forEach((el, k) => {
    const path = `elements[${k}]`;
    const mod = ELEMENTS[el.kind];
    for (const d of mod.drivers(el, path)) {
      if (drivenBy.has(d.shaft)) {
        err('OVERCONSTRAINED', path, `shaft '${d.shaft}' is driven by both ${drivenBy.get(d.shaft)} and ${path} (${el.kind} '${el.name}')`);
        continue;
      }
      drivenBy.set(d.shaft, `${path} (${el.kind} '${el.name}')`);
      const id = `${d.basis.type}:${el.name}`;
      const b = { id, shaft: d.shaft, path, element: el.name, kind: el.kind, ...d.basis };
      if (d.basis.type === 'cam') { pendingCams.push(b); continue; }
      bases.push(b);
      forms.set(d.shaft, new Map([[id, ONE]]));
      order.push(d.shaft);
    }
    for (const r of mod.relations(el, path)) relations.push({ ...r, used: false });
  });

  let progress = true;
  while (progress) {
    progress = false;
    for (const r of relations) {
      if (r.used) continue;
      // merge repeated shafts in one relation
      const terms = new Map();
      for (const [s, c] of r.terms) terms.set(s, (terms.get(s) || Coef.rational(0)).add(c));
      const unknown = [...terms.keys()].filter((s) => !forms.has(s));
      if (unknown.length > 1) continue;
      let rest = new Map();
      let scaleRef = 0;
      for (const [s, c] of terms) {
        scaleRef = Math.max(scaleRef, Math.abs(c.value()));
        if (forms.has(s)) rest = formAdd(rest, forms.get(s), c);
      }
      if (unknown.length === 0) {
        const ok = formIsZero(rest, scaleRef);
        closures.push({ path: r.path, element: r.element, consistent: ok, residual: formString(rest) });
        if (!ok) err('OVERCONSTRAINED', r.path, `the relation of '${r.element}' closes a loop that is not consistent: residual ${formString(rest)} is not zero`);
        r.used = true;
        progress = true;
        continue;
      }
      const u = unknown[0];
      const cu = terms.get(u);
      if (cu.isZero) continue;
      forms.set(u, formScale(rest, ONE.neg().div(cu))); // c_u u + rest = 0  =>  u = -rest / c_u
      order.push(u);
      tree.push(r.path);
      r.used = true;
      progress = true;
    }
    for (const b of pendingCams) {
      if (b.done || !forms.has(b.input)) continue;
      b.done = true;
      if (forms.has(b.shaft)) {
        err('OVERCONSTRAINED', b.path, `cam follower '${b.shaft}' is already determined by another path`);
        continue;
      }
      b.inputForm = forms.get(b.input);
      bases.push(b);
      forms.set(b.shaft, new Map([[b.id, ONE]]));
      order.push(b.shaft);
      progress = true;
    }
  }

  cfg.shafts.forEach((s, k) => {
    if (!forms.has(s.name)) {
      const loop = relations.filter((r) => !r.used && r.terms.some(([x]) => x === s.name)).map((r) => r.path);
      err('UNDETERMINED', `shafts[${k}]`, `shaft '${s.name}' is not determined: ${loop.length
        ? `it lies in relations ${loop.join(', ')} with more than one undetermined shaft (an algebraic loop without an integrator, or a branch with no driver)`
        : 'nothing drives it'}`);
    }
  });
  for (const b of pendingCams) if (!b.done) err('UNDETERMINED', b.path, `cam '${b.element}': its input shaft '${b.input}' is not determined`);

  // Velocity dependencies of the states: an integrator needs the speed of its disc shaft, a ratchet the speed
  // of its input. A state whose speed needs its own speed is a velocity loop.
  const byId = new Map(bases.map((b) => [b.id, b]));
  const velDeps = (form) => {
    const out = new Set();
    const visit = (f) => {
      for (const id of f.keys()) {
        const b = byId.get(id);
        if (!b) continue;
        if (b.type === 'state') out.add(id);
        else if (b.type === 'cam') visit(b.inputForm);
      }
    };
    visit(form);
    return out;
  };
  const stateOrder = [];
  if (!errors.length) {
    const states = bases.filter((b) => b.type === 'state');
    for (const b of states) b.velForm = forms.get(b.integrator ? b.disc : b.input);
    const mark = new Map();
    const visit = (b, stack) => {
      if (mark.get(b.id) === 2) return true;
      if (mark.get(b.id) === 1) {
        err('VELOCITY_LOOP', b.path, `the speed of '${b.shaft}' depends on itself through ${[...stack, b.id].join(' -> ')}`);
        return false;
      }
      mark.set(b.id, 1);
      for (const d of velDeps(b.velForm)) if (!visit(byId.get(d), [...stack, b.id])) return false;
      mark.set(b.id, 2);
      stateOrder.push(b.id);
      return true;
    };
    for (const b of states) if (!visit(b, [])) break;
  }
  return { forms, bases, order, tree, closures, stateOrder, errors };
}

// The exact coefficient of shaft `to` with respect to the single driver of shaft `from` (a gear train's ratio):
// requires the form of `to` to depend on the basis of `from` alone.
export function ratioBetween(analysis, from, to) {
  const ff = analysis.forms.get(from), ft = analysis.forms.get(to);
  if (!ff || !ft || ff.size !== 1) return null;
  const [[id, c]] = [...ff];
  const ct = ft.get(id);
  if (!ct || ft.size !== 1) return null;
  return ct.div(c);
}
