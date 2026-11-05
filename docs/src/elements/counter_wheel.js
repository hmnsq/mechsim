// © 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Counter wheel on a shaft: a wheel with n detent positions per turn that reads the shaft angle as a detent
// position and counts carries on wrap. In a continuous mechanism it is a reader (like a dial); the discrete
// adders (docs/src/discrete.js) build their registers from the same detent wheel.

export const kind = 'counter_wheel';
export const title = 'Counter wheel';
export const relation = 'position = floor(theta n / (2 pi)) mod n; carry on wrap';

export function check(el, ctx, path) {
  ctx.shaft(el.shaft, `${path}.shaft`, 'rad');
  if (!(Number.isInteger(el.positions) && el.positions >= 2)) ctx.err('VALUE', `${path}.positions`, 'positions is an integer of at least 2');
}
export const shafts = (el) => [el.shaft];
export const relations = () => [];
export const drivers = () => [];

// Reading of a shaft angle: { position, turns } with position in 0..n-1 and turns the signed number of wraps.
export function read(theta, n) {
  const step = (2 * Math.PI) / n;
  const k = Math.floor(theta / step + 1e-9);
  const position = ((k % n) + n) % n;
  return { position, turns: Math.floor(k / n) };
}
