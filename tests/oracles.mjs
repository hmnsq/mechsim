// © 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Comparison helpers with the metrics of Test Plan section 5, and exact rational views of doubles.

// The exact value of a double as a BigInt fraction { n, d } (d a power of two).
export function exactRational(x) {
  if (!Number.isFinite(x)) throw new Error(`not finite: ${x}`);
  if (x === 0) return { n: 0n, d: 1n };
  const buf = new DataView(new ArrayBuffer(8));
  buf.setFloat64(0, x);
  const bits = buf.getBigUint64(0);
  const sign = bits >> 63n ? -1n : 1n;
  const exp = Number((bits >> 52n) & 0x7ffn);
  let mant = bits & ((1n << 52n) - 1n);
  let e;
  if (exp === 0) e = -1074; else { mant |= 1n << 52n; e = exp - 1075; }
  return e >= 0 ? { n: sign * mant * (1n << BigInt(e)), d: 1n } : { n: sign * mant, d: 1n << BigInt(-e) };
}

// |a - b| / |b| for exact rationals, as a double (b non-zero)
export function relDiffExact(a, b) {
  const num = a.n * b.d - b.n * a.d;
  const den = b.n * a.d;
  const abs = (v) => (v < 0n ? -v : v);
  if (den === 0n) return num === 0n ? 0 : Infinity;
  // scale to keep precision when converting
  const q = abs(num) * (10n ** 30n) / abs(den);
  return Number(q) / 1e30;
}

// Fixed-step RK4 against analytic: maximum absolute error over the amplitude (Test Plan: 1e-4 at the step).
export function maxAbsOverAmplitude(rowsSim, rowsRef) {
  const ncol = rowsRef[0].length;
  const out = [];
  for (let j = 0; j < ncol; j++) {
    let amp = 0, err = 0;
    for (let k = 0; k < rowsRef.length; k++) { amp = Math.max(amp, Math.abs(rowsRef[k][j])); err = Math.max(err, Math.abs(rowsSim[k][j] - rowsRef[k][j])); }
    out.push({ maxAbs: err, amplitude: amp, metric: err / amp });
  }
  return out;
}

// Adaptive runs against analytic: maximum relative error with an absolute floor. A point is within the bound b
// when |d| <= max(b |y|, floor); the metric reported is max |d| / max(|y|, floor / b), which is <= b exactly when
// every point is within the bound.
export function maxRelWithFloor(rowsSim, rowsRef, bound, floor = 1e-9) {
  const ncol = rowsRef[0].length;
  const out = [];
  for (let j = 0; j < ncol; j++) {
    let m = 0, ma = 0;
    for (let k = 0; k < rowsRef.length; k++) {
      const d = Math.abs(rowsSim[k][j] - rowsRef[k][j]);
      ma = Math.max(ma, d);
      m = Math.max(m, d / Math.max(Math.abs(rowsRef[k][j]), floor / bound));
    }
    out.push({ metric: m, maxAbs: ma });
  }
  return out;
}

export function maxAbs(rowsSim, rowsRef) {
  let m = 0;
  for (let k = 0; k < rowsRef.length; k++) for (let j = 0; j < rowsRef[k].length; j++) m = Math.max(m, Math.abs(rowsSim[k][j] - rowsRef[k][j]));
  return m;
}
