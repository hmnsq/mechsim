// © 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Coefficients of the linear relations between shafts. Gear ratios come from tooth counts and differential
// means from the factor 1/2, so they are rational: they are held exactly as BigInt fractions, and a train of
// gears composes to its exact ratio (T-41). A coefficient that involves a length or pi (a lead screw) is real
// and is held as a double. A rational coefficient is converted to a double once, by one correctly rounded
// division, when a run is compiled.

import { SubcoreError } from './core.js';

const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };

export class Coef {
  constructor(n, d = 1n, real = null) {
    if (real !== null) { this.real = real; this.n = null; this.d = null; return; }
    if (d === 0n) throw new SubcoreError('COEF', 'denominator', 'zero denominator');
    if (d < 0n) { n = -n; d = -d; }
    const g = gcd(n, d) || 1n;
    this.n = n / g; this.d = d / g; this.real = null;
  }
  static rational(n, d = 1) { return new Coef(BigInt(n), BigInt(d)); }
  static real(x) {
    if (!Number.isFinite(x)) throw new SubcoreError('COEF', 'real', `coefficient ${x} is not finite`);
    return new Coef(0n, 1n, x);
  }
  get isRational() { return this.real === null; }
  get isZero() { return this.isRational ? this.n === 0n : this.real === 0; }
  value() { return this.isRational ? Number(this.n) / Number(this.d) : this.real; }
  add(o) {
    if (this.isRational && o.isRational) return new Coef(this.n * o.d + o.n * this.d, this.d * o.d);
    return Coef.real(this.value() + o.value());
  }
  neg() { return this.isRational ? new Coef(-this.n, this.d) : Coef.real(-this.real); }
  sub(o) { return this.add(o.neg()); }
  mul(o) {
    if (this.isRational && o.isRational) return new Coef(this.n * o.n, this.d * o.d);
    return Coef.real(this.value() * o.value());
  }
  div(o) {
    if (o.isZero) throw new SubcoreError('COEF', 'divide', 'division by a zero coefficient');
    if (this.isRational && o.isRational) return new Coef(this.n * o.d, this.d * o.n);
    return Coef.real(this.value() / o.value());
  }
  toString() { return this.isRational ? (this.d === 1n ? `${this.n}` : `${this.n}/${this.d}`) : `${this.real}`; }
  toJSON() { return this.toString(); }
}

// A linear form: Map from basis id to Coef. Helpers keep forms free of zero terms.
export function formAdd(a, b, scale = Coef.rational(1)) {
  const out = new Map(a);
  for (const [k, c] of b) {
    const v = (out.get(k) || Coef.rational(0)).add(c.mul(scale));
    if (v.isZero) out.delete(k); else out.set(k, v);
  }
  return out;
}

export function formScale(a, s) {
  const out = new Map();
  for (const [k, c] of a) { const v = c.mul(s); if (!v.isZero) out.set(k, v); }
  return out;
}

// True when a residual form is zero: rational terms exactly, real terms within a relative bound of the
// largest coefficient that produced them (real coefficients carry rounding).
export function formIsZero(r, scaleRef = 1, tol = 1e-12) {
  for (const c of r.values()) {
    if (c.isRational) { if (c.n !== 0n) return false; }
    else if (Math.abs(c.real) > tol * Math.max(1, scaleRef)) return false;
  }
  return true;
}

export function formString(f) {
  if (f.size === 0) return '0';
  return [...f].map(([k, c]) => `${c}*${k}`).join(' + ');
}
