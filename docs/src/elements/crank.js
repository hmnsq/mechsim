// © 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Crank: the input of a mechanism. It turns its shaft at a constant rate: theta = phase + rate * t.
// Machine time is crank angle (substrate mechanical, temporal behaviour), so the rate is a time scale factor.

export const kind = 'crank';
export const title = 'Crank';
export const relation = 'theta = phase + rate t';

export function check(el, ctx, path) {
  ctx.shaft(el.shaft, `${path}.shaft`, 'rad');
  ctx.quantity(el.rate, `${path}.rate`, 'rad/s', 'rate');
  if (el.phase !== undefined) ctx.quantity(el.phase, `${path}.phase`, 'rad', 'phase');
}
export const shafts = (el) => [el.shaft];
export const relations = () => [];
export function drivers(el, path) {
  const rate = el._si.rate, phase = el._si.phase || 0;
  return [{ shaft: el.shaft, path, basis: { type: 'crank', rate, phase } }];
}
