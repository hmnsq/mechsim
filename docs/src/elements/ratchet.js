// © 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Ratchet: one-way coupling. The output follows the input while the input turns in the allowed direction and
// stays where it is (the pawl slips over the teeth) while the input turns back. Its angle is a state:
// d theta_out / dt = max(0, omega_in) (forward) or min(0, omega_in) (reverse).

export const kind = 'ratchet';
export const title = 'Ratchet';
export const relation = 'd theta_out = max(0, d theta_in) (forward)';

export function check(el, ctx, path) {
  ctx.shaft(el.input, `${path}.input`, 'rad');
  ctx.shaft(el.output, `${path}.output`, 'rad');
  if (!['forward', 'reverse'].includes(el.direction)) ctx.err('VALUE', `${path}.direction`, 'direction is forward or reverse');
  if (el.input === el.output) ctx.err('CONNECTION', `${path}.output`, 'input and output differ');
}
export const shafts = (el) => [el.input, el.output];
export const relations = () => [];
export const drivers = (el, path) => [{ shaft: el.output, path, basis: { type: 'state', ratchet: true, input: el.input, direction: el.direction } }];
