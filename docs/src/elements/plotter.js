// © 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Plotter: a pen on a carriage driven by two shafts, drawing y against x. An output.

export const kind = 'plotter';
export const title = 'Plotter';
export const relation = 'draws (theta_x, theta_y)';
export function check(el, ctx, path) {
  ctx.shaft(el.x, `${path}.x`);
  ctx.shaft(el.y, `${path}.y`);
}
export const shafts = (el) => [el.x, el.y];
export const relations = () => [];
export const drivers = () => [];
