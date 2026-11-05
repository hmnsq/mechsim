// © 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// P10.2, the ideal kinematic engine.
//   T-41: gear trains give their exact ratios (the rational product of the tooth ratios, composed independently
//         here from the configuration's tooth counts) and every output angle is that ratio times the input to
//         one rounding; differential means hold within 1e-12.
//   T-42: wheel-and-disc integrators against analytic solutions: a lone integrator (integral of t dt), the
//         exponential decay and the harmonic oscillator, fixed-step RK4 (maximum absolute error over amplitude,
//         1e-4) and adaptive Dormand-Prince at rtol 1e-10 (relative error with an absolute floor of 1e-9, 1e-7).
//   Cams: the C1 interpolant reproduces the table at every node and has a continuous slope at every knot.
// Node.js against Chromium parity (WEB-06) is tests/p10_2_parity.test.mjs.

import { suite } from './harness.mjs';
import { loadModels, loadProgram } from '../tools/lib.mjs';
import { analyticSolution, loadYaml } from '../docs/src/core.js';
import { checkConfig } from '../docs/src/config.js';
import { ratioBetween } from '../docs/src/graph.js';
import { compileMechanism, runMechanism, variables } from '../docs/src/kinematic.js';
import { interpolant } from '../docs/src/elements/cam.js';
import { exactRational, relDiffExact, maxAbsOverAmplitude, maxRelWithFloor } from './oracles.mjs';

const S = suite('p10_2_kinematic');
const models = loadModels();

// ---- T-41 gear train
{
  const { doc, result } = loadProgram('gear-train.yaml', models);
  // independent expectation from the tooth counts
  let n = 1n, d = 1n;
  for (const g of doc.elements.filter((e) => e.kind === 'gear_pair')) {
    n *= BigInt(g.teeth[0]) * (g.mesh === 'external' ? -1n : 1n);
    d *= BigInt(g.teeth[1]);
  }
  const r = ratioBetween(result.analysis, 's0', 's3');
  const same = r && r.isRational && r.n * d === n * r.d;
  S.check('T-41 gear train ratio is the exact rational product of tooth ratios', same, { note: `engine ${r}, expected ${n}/${d}` });
  for (const [a, b] of [['s0', 's1'], ['s1', 's2'], ['s2', 's3']]) {
    const g = doc.elements.find((e) => e.kind === 'gear_pair' && e.from === a && e.to === b);
    const rr = ratioBetween(result.analysis, a, b);
    const want = BigInt(g.teeth[0]) * (g.mesh === 'external' ? -1n : 1n);
    S.check(`T-41 stage ${g.name} ratio`, rr.n * BigInt(g.teeth[1]) === want * rr.d, { note: `${rr}` });
  }
  const m = compileMechanism(result);
  const res = runMechanism(m, {});
  const i0 = m.shaftNames.indexOf('s0'), i3 = m.shaftNames.indexOf('s3');
  const exact = { n, d };
  let worst = 0;
  for (const row of res.shafts) {
    if (row[i0] === 0) continue;
    const out = exactRational(row[i3]), inp = exactRational(row[i0]);
    const want = { n: inp.n * exact.n, d: inp.d * exact.d };
    worst = Math.max(worst, relDiffExact(out, want));
  }
  S.check('T-41 output angle equals the exact ratio times the input to within two roundings (2^-52 relative)', worst <= 2 ** -52, { note: `worst relative difference ${worst.toExponential(3)} over ${res.t.length} points`, worst });
}

// ---- T-41 differential means
{
  const { result } = loadProgram('differential.yaml', models);
  const m = compileMechanism(result);
  const res = runMechanism(m, { points: 1000 });
  const [ia, ib, ic, id] = ['a', 'b', 'c', 'd'].map((s) => m.shaftNames.indexOf(s));
  let worst = 0, rev = 0;
  for (const row of res.shafts) {
    worst = Math.max(worst, Math.abs(row[ic] - (row[ia] + row[ib]) / 2) / Math.max(1, Math.abs(row[ic])));
    rev = Math.max(rev, Math.abs(row[id] + row[ic]));
  }
  S.check('T-41 differential carrier is the mean of its inputs within 1e-12', worst <= 1e-12, { note: `worst ${worst.toExponential(3)}`, worst });
  S.check('T-41 1:1 external pair reverses exactly', rev === 0, { note: `max |d + c| = ${rev}` });
}

// ---- T-42 a lone integrator: integral of t dt = t^2 / 2
{
  const N = '© 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI. SPDX-License-Identifier: CC0-1.0';
  const I = { wheel_radius: { value: 0.001, unit: 'm' }, screw_pitch: { value: 0.006283185307179587, unit: 'm' } };
  const doc = {
    _notice: N, identity: { id: 'test.lone-integrator', version: '0.1.0', title: 'integral of t dt' },
    substrate: { id: 'mechanical', version: '0.1.0' }, kind: 'continuous',
    shafts: [{ name: 't', unit: 'rad' }, { name: 'w', unit: 'rad' }],
    elements: [{ kind: 'crank', name: 'crank', shaft: 't', rate: { value: 1, unit: 'rad/s' } }, { kind: 'integrator', name: 'i', disc: 't', integrand: 't', output: 'w', ...I }],
    initial: [{ shaft: 'w', value: 0, unit: 'rad' }], run: { t0: 0, t1: 4, unit: 's', rk4_step: 0.01 }, provenance: { source: 'test' },
  };
  const r = checkConfig(doc);
  const m = compileMechanism(r);
  const res = runMechanism(m, {});
  const iw = m.shaftNames.indexOf('w');
  let worst = 0;
  res.t.forEach((t, k) => { worst = Math.max(worst, Math.abs(res.shafts[k][iw] - t * t / 2)); });
  S.check('T-42 lone integrator gives t^2/2 (RK4 is exact for it up to rounding)', worst < 1e-12, { note: `max abs error ${worst.toExponential(3)}`, worst });
}

// ---- T-42 decay and oscillator against their analytic solutions
for (const f of ['exponential-decay.analyser.yaml', 'harmonic-oscillator.analyser.yaml']) {
  const { result } = loadProgram(f, models);
  const model = models[result.config.model ? result.config.model.id : ''] || models[loadYaml(JSON.stringify(result.config)).model.id];
  const sol = analyticSolution(model);
  const m = compileMechanism(result);
  // fixed step at the configured step
  const rk = runMechanism(m, { solver: 'rk4', every: 10 });
  const vr = variables(m, rk);
  const cols = sol.names.map((n) => vr.names.indexOf(n));
  const sim = vr.rows.map((row) => cols.map((j) => row[j]));
  const ref = rk.t.map((t) => sol.at(t));
  const a = maxAbsOverAmplitude(sim, ref);
  const worstRk = Math.max(...a.map((x) => x.metric));
  S.check(`T-42 ${f} RK4 h=${result.config._run.rk4_step}: max abs error over amplitude <= 1e-4`, worstRk <= 1e-4, { note: sol.names.map((n, j) => `${n} ${a[j].metric.toExponential(3)}`).join(', '), metric: worstRk });
  // adaptive
  const dp = runMechanism(m, { solver: 'dopri54', rtol: 1e-10, atol: 1e-12, points: 400 });
  const vd = variables(m, dp);
  const simd = vd.rows.map((row) => cols.map((j) => row[j]));
  const refd = dp.t.map((t) => sol.at(t));
  const b = maxRelWithFloor(simd, refd, 1e-7, 1e-9);
  const worstDp = Math.max(...b.map((x) => x.metric));
  S.check(`T-42 ${f} Dormand-Prince rtol 1e-10: relative error with floor 1e-9 <= 1e-7`, worstDp <= 1e-7, { note: `${sol.names.map((n, j) => `${n} ${b[j].metric.toExponential(3)}`).join(', ')}; ${dp.stats.accepted} steps, ${dp.stats.rejected} rejected`, metric: worstDp });
}

// ---- cams: C1 interpolant
{
  const vals = Array.from({ length: 21 }, (_, k) => Math.sin(k / 20 * 3));
  const ip = interpolant(0, 1, vals);
  let nodes = 0, slopeJump = 0;
  for (let k = 0; k < 21; k++) {
    const x = ip.node(k);
    if (ip.f(x) !== vals[k]) nodes++;
    if (k > 0 && k < 20) {
      const e = 1e-9;
      slopeJump = Math.max(slopeJump, Math.abs(ip.df(x - e) - ip.df(x + e)));
    }
  }
  S.check('cam interpolant reproduces the table at every node', nodes === 0, { note: `${nodes} nodes differ` });
  S.check('cam interpolant slope is continuous at every knot (C1)', slopeJump < 1e-6, { note: `largest slope jump ${slopeJump.toExponential(3)}` });
}

S.finish();
