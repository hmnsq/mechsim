// © 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Differential: the carrier turns by the mean of the two input shafts, theta_c = (theta_a + theta_b)/2.

import { Coef } from '../coef.js';

export const kind = 'differential';
export const title = 'Differential';
export const relation = 'theta_c = (theta_a + theta_b)/2';

export function check(el, ctx, path) {
  for (const k of ['a', 'b', 'carrier']) ctx.shaft(el[k], `${path}.${k}`, 'rad');
  const s = new Set([el.a, el.b, el.carrier]);
  if (s.size !== 3) ctx.err('CONNECTION', path, 'a differential joins three different shafts');
}
export const shafts = (el) => [el.a, el.b, el.carrier];
export function relations(el, path) {
  const h = Coef.rational(-1, 2);
  return [{ path, element: el.name, terms: [[el.carrier, Coef.rational(1)], [el.a, h], [el.b, h]] }];
}
export const drivers = () => [];
