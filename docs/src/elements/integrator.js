// © 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Wheel-and-disc integrator (Guidelines 8.1): d theta_w = (r / R_w) d theta_d. The disc turns with the disc
// shaft; the wheel rests on the disc at radius r, set by the integrand shaft through the integrator's own lead
// screw, r = p theta_i / (2 pi) (or r is the integrand slide itself when the integrand is a slide in metres).
// The wheel drives the output shaft. Its angle is a state of the run, so the integrator is a driver.
// The carriage travel limits |r| to half the travel either side of the disc centre (a resource constraint).

export const kind = 'integrator';
export const title = 'Wheel-and-disc integrator';
export const relation = 'd theta_w = (r / R_w) d theta_d, r = p theta_i / (2 pi)';

export function check(el, ctx, path) {
  ctx.shaft(el.disc, `${path}.disc`, 'rad');
  ctx.shaft(el.output, `${path}.output`, 'rad');
  const iu = ctx.unitOf(el.integrand);
  ctx.shaft(el.integrand, `${path}.integrand`);
  if (iu === 'rad') {
    const p = ctx.quantity(el.screw_pitch, `${path}.screw_pitch`, 'm', 'screw_pitch');
    if (p !== undefined && !(p > 0)) ctx.err('VALUE', `${path}.screw_pitch`, 'screw pitch must be positive');
  } else if (iu === 'm') {
    if (el.screw_pitch !== undefined) ctx.err('VALUE', `${path}.screw_pitch`, 'an integrand slide in metres takes no screw pitch');
  } else if (iu !== undefined) {
    ctx.err('UNIT', `${path}.integrand`, 'the integrand is a shaft (rad) or a slide (m)');
  }
  const rw = ctx.quantity(el.wheel_radius, `${path}.wheel_radius`, 'm', 'wheel_radius');
  if (rw !== undefined && !(rw > 0)) ctx.err('VALUE', `${path}.wheel_radius`, 'wheel radius must be positive');
  if (el.travel !== undefined) ctx.quantity(el.travel, `${path}.travel`, 'm', 'travel');
  if (el.output === el.disc || el.output === el.integrand) ctx.err('CONNECTION', `${path}.output`, 'the output shaft must differ from the disc and integrand shafts');
}
export const shafts = (el) => [el.disc, el.integrand, el.output];
export const relations = () => [];
export function drivers(el, path) {
  return [{ shaft: el.output, path, basis: {
    type: 'state', integrator: true, disc: el.disc, integrand: el.integrand,
    pitch: el._si.screw_pitch, wheelRadius: el._si.wheel_radius, travel: el._si.travel,
  } }];
}
