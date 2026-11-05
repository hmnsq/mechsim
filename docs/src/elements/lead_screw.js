// © 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Lead screw of pitch p: the nut travels x = p theta / (2 pi). The coefficient involves pi, so it is real.

import { Coef } from '../coef.js';

export const kind = 'lead_screw';
export const title = 'Lead screw';
export const relation = 'x = p theta / (2 pi)';

export function check(el, ctx, path) {
  ctx.shaft(el.shaft, `${path}.shaft`, 'rad');
  ctx.shaft(el.slide, `${path}.slide`, 'm');
  const p = ctx.quantity(el.pitch, `${path}.pitch`, 'm', 'pitch');
  if (p !== undefined && !(p > 0)) ctx.err('VALUE', `${path}.pitch`, 'pitch must be positive');
}
export const shafts = (el) => [el.shaft, el.slide];
export function relations(el, path) {
  return [{ path, element: el.name, terms: [[el.slide, Coef.rational(1)], [el.shaft, Coef.real(-el._si.pitch / (2 * Math.PI))]] }];
}
export const drivers = () => [];
