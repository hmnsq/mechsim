// © 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Helpers shared by the element modules. An element module exports:
//   kind, title, relation (text of the ideal relation, Guidelines 8.1),
//   check(el, ctx, path)      structural checks; ctx.shaft(name, path, unit) and ctx.quantity(q, path, unit)
//                             record errors with a code and the path of the field;
//   shafts(el)                the shaft names the element references;
//   relations(el, path)       linear relations sum(coef * angle) = 0 between shafts, coefficients as Coef;
//   drivers(el, path)         shafts the element drives directly (a crank, a setting, an integrator wheel,
//                             a ratchet, a cam follower), each with its basis description.
// Quantities in a configuration are { value, unit } with a UCUM unit; they are converted to SI once, by the
// configuration loader, into el._si.

export const none = () => [];

export function isInt(x) { return Number.isInteger(x); }
