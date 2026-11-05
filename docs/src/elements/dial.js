// © 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Dial: a graduated dial on a shaft. An output; it adds nothing to the kinematics.

export const kind = 'dial';
export const title = 'Dial';
export const relation = 'reads theta';
export function check(el, ctx, path) { ctx.shaft(el.shaft, `${path}.shaft`); }
export const shafts = (el) => [el.shaft];
export const relations = () => [];
export const drivers = () => [];
