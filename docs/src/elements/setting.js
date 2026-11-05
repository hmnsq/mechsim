// © 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Setting: a set screw or setting wheel that holds a shaft at a constant angle (a constant term).

export const kind = 'setting';
export const title = 'Setting wheel';
export const relation = 'theta = value';

export function check(el, ctx, path) {
  const u = ctx.unitOf(el.shaft);
  ctx.shaft(el.shaft, `${path}.shaft`);
  ctx.quantity(el.value, `${path}.value`, u || 'rad', 'value');
}
export const shafts = (el) => [el.shaft];
export const relations = () => [];
export const drivers = (el, path) => [{ shaft: el.shaft, path, basis: { type: 'setting', value: el._si.value } }];
