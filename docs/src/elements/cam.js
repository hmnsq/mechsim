// © 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Cam and follower: the follower position is y = s_y f(x), x = (theta - theta_0) / s_x, with f given by a table
// and interpolated with continuous first derivative (C1, cubic Hermite with three-point slopes). The table comes
// from a function-generation model (its expression evaluated at the table points by the shared core) or is
// listed in the configuration, or read from a table file (subcore-vectors, fields x y) such as the tables
// tools/camtables.py cuts from the mpmath oracle. Outside the table the cam has no profile: the run stops with CAM_RANGE.

export const kind = 'cam';
export const title = 'Cam and follower';
export const relation = 'y = s_y f((theta - theta_0) / s_x), f from a table with C1 interpolation';

export function check(el, ctx, path) {
  ctx.shaft(el.shaft, `${path}.shaft`, 'rad');
  const fu = ctx.unitOf(el.follower);
  ctx.shaft(el.follower, `${path}.follower`);
  ctx.quantity(el.input_scale, `${path}.input_scale`, 'rad', 'input_scale');
  ctx.quantity(el.output_scale, `${path}.output_scale`, fu || 'm', 'output_scale');
  if (el.input_offset !== undefined) ctx.quantity(el.input_offset, `${path}.input_offset`, 'rad', 'input_offset');
  const t = el.table;
  if (!t || typeof t !== 'object') { ctx.err('VALUE', `${path}.table`, 'a cam needs a table'); return; }
  if (t.values !== undefined) {
    if (!Array.isArray(t.values) || t.values.length < 3 || !t.values.every(Number.isFinite)) ctx.err('VALUE', `${path}.table.values`, 'at least three finite values');
  } else if (t.vectors !== undefined) {
    if (typeof t.vectors !== 'string') ctx.err('VALUE', `${path}.table.vectors`, 'the path of a table file');
  } else if (!t.model || !t.function) ctx.err('VALUE', `${path}.table`, 'a table is values, a table file (vectors), or a model and a function');
  if (!(Number.isFinite(t.from) && Number.isFinite(t.to) && t.to > t.from)) ctx.err('VALUE', `${path}.table`, 'from and to are finite with to > from');
  if (t.values === undefined && t.vectors === undefined && !(Number.isInteger(t.points) && t.points >= 3)) ctx.err('VALUE', `${path}.table.points`, 'points is an integer of at least 3');
}
export const shafts = (el) => [el.shaft, el.follower];
export const relations = () => [];
export const drivers = (el, path) => [{ shaft: el.follower, path, basis: { type: 'cam', input: el.shaft, cam: el._cam } }];

// The C1 table interpolant. values at x_k = from + k h. Slopes: central three-point differences inside,
// one-sided three-point differences at the ends. Returns { f(x), df(x), from, to, n }.
export function interpolant(from, to, values) {
  const n = values.length, h = (to - from) / (n - 1);
  const m = new Float64Array(n);
  for (let k = 1; k < n - 1; k++) m[k] = (values[k + 1] - values[k - 1]) / (2 * h);
  m[0] = (-3 * values[0] + 4 * values[1] - values[2]) / (2 * h);
  m[n - 1] = (3 * values[n - 1] - 4 * values[n - 2] + values[n - 3]) / (2 * h);
  // node k sits at from + (to - from) k / (n - 1), computed the same way as the table was tabulated
  const node = (k) => from + ((to - from) * k) / (n - 1);
  const locate = (x) => {
    let k = Math.floor((x - from) / h);
    if (k < 0) k = 0; if (k > n - 2) k = n - 2;
    if (k < n - 2 && x >= node(k + 1)) k++;
    if (k > 0 && x < node(k)) k--;
    return k;
  };
  return {
    node, from, to, n, h, values, slopes: m,
    inRange: (x) => x >= from && x <= to,
    f(x) {
      const k = locate(x), u = (x - node(k)) / h;
      if (u === 0) return values[k];
      if (x === node(k + 1)) return values[k + 1];
      const u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * values[k] + (u3 - 2 * u2 + u) * h * m[k] + (-2 * u3 + 3 * u2) * values[k + 1] + (u3 - u2) * h * m[k + 1];
    },
    df(x) {
      const k = locate(x), u = (x - node(k)) / h, u2 = u * u;
      return ((6 * u2 - 6 * u) * values[k] + (3 * u2 - 4 * u + 1) * h * m[k] + (-6 * u2 + 6 * u) * values[k + 1] + (3 * u2 - 2 * u) * h * m[k + 1]) / h;
    },
  };
}
