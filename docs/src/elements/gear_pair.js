// © 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Gear pair (z1, z2 teeth): external theta2 = -(z1/z2) theta1; internal gear or belt theta2 = (z1/z2) theta1
// (Guidelines 8.1). The ratio is exact: a rational of the tooth counts.

import { Coef } from '../coef.js';

export const kind = 'gear_pair';
export const title = 'Gear pair';
export const relation = 'theta2 = -(z1/z2) theta1 (external); theta2 = (z1/z2) theta1 (internal, belt)';
export const MESHES = ['external', 'internal', 'belt'];

export function check(el, ctx, path) {
  ctx.shaft(el.from, `${path}.from`, 'rad');
  ctx.shaft(el.to, `${path}.to`, 'rad');
  if (el.from === el.to) ctx.err('CONNECTION', `${path}.to`, 'a gear pair joins two different shafts');
  if (!Array.isArray(el.teeth) || el.teeth.length !== 2 || !el.teeth.every((z) => Number.isInteger(z) && z >= 1)) {
    ctx.err('VALUE', `${path}.teeth`, 'teeth is a pair of positive integers [z1, z2]');
  }
  if (!MESHES.includes(el.mesh)) ctx.err('VALUE', `${path}.mesh`, `mesh is one of ${MESHES.join(', ')}`);
}
export const shafts = (el) => [el.from, el.to];

// The ratio theta_to / theta_from as an exact rational.
export function ratio(el) {
  const [z1, z2] = el.teeth;
  const r = Coef.rational(z1, z2);
  return el.mesh === 'external' ? r.neg() : r;
}

// theta_to - ratio * theta_from = 0
export function relations(el, path) {
  return [{ path, element: el.name, terms: [[el.to, Coef.rational(1)], [el.from, ratio(el).neg()]] }];
}
export const drivers = () => [];
