// © 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// T-43 (P10.3, MEC-03): the mechanical binary and balanced ternary adders equal their reference functions on
// every vector of the repsynth vector files, read directly (CNF-01), and on 20000 further seeded cases each
// against the C reference functions compiled from hmnsq/repsynth (read only). Also: detent wheels, carry
// pawls and ratchets behave exactly as Guidelines 8.3 states, and a continuous ratchet passes only forward
// motion. Writes the realisation records (SUB-02) with the class this run supports.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { suite } from './harness.mjs';
import { REPO, REPSYNTH, loadProgram, loadModels } from '../tools/lib.mjs';
import { parseVectors, createRng } from '../docs/src/core.js';
import { buildAdder, DetentWheel, Register } from '../docs/src/discrete.js';
import { checkConfig } from '../docs/src/config.js';
import { compileMechanism, runMechanism } from '../docs/src/kinematic.js';
import { sha256File } from '../tools/record.mjs';

const S = suite('p10_3_adders');
const ADDERS = ['balanced-ternary.adder16.yaml', 'balanced-ternary.adder32.yaml', 'binary.adder32.yaml', 'binary.adder64.yaml'];

// ---- the C reference runner
const build = path.join(REPO, '.cache/tmp/refrun');
fs.mkdirSync(path.dirname(build), { recursive: true });
const csrc = [
  path.join(REPSYNTH, 'spec/ref/balanced_ternary/balanced_ternary.c'),
  path.join(REPSYNTH, 'spec/ref/binary_integer/binary_integer.c'),
];
let refOk = false;
try {
  execFileSync('cc', ['-std=c11', '-O1', '-Wall', '-Werror', `-I${path.join(REPSYNTH, 'spec/ref/balanced_ternary')}`, `-I${path.join(REPSYNTH, 'spec/ref/binary_integer')}`,
    '-o', build, path.join(REPO, 'tests/ref/refrun.c'), ...csrc], { stdio: 'pipe' });
  refOk = true;
} catch (e) { S.info(`cc failed: ${e.stderr}`); }
S.check('C reference functions compiled from repsynth', refOk, { note: csrc.map((f) => `${path.relative(path.dirname(REPO), f)} ${sha256File(f).slice(0, 16)}`).join(', ') });
const refRun = (sym, pairs) => execFileSync(build, [sym], { input: pairs.map(([a, b]) => `${a.toString(16)} ${b.toString(16)}`).join('\n') + '\n', maxBuffer: 1 << 26 })
  .toString().trim().split('\n').map((h) => BigInt('0x' + h));

const realisations = [];
for (const f of ADDERS) {
  const { doc, result } = loadProgram(f, loadModels());
  if (!S.check(`program ${f} valid`, result.ok, { note: JSON.stringify(result.errors) })) continue;
  const ref = doc.operation.reference;
  const vecPath = path.join(REPSYNTH, ref.vectors);
  const v = parseVectors(fs.readFileSync(vecPath, 'utf8'));
  const width = Number(v.meta.width.split(' ')[0]);
  S.check(`${f} vector header names ${ref.spec_id} add width ${result.config.registers[0].wheels}`,
    v.meta.spec === ref.spec_id && v.meta.op === 'add' && width === result.config.registers[0].wheels, { note: `${path.relative(path.dirname(REPO), vecPath)}: spec ${v.meta.spec} ${v.meta.version}, width ${v.meta.width}, ${v.cases.length} cases` });
  const adder = buildAdder(result.config);
  let equal = 0, jams = 0, carries = 0, overflows = 0, steps = 0;
  const bad = [];
  for (const [a, b, r] of v.cases) {
    const out = adder.add(a, b);
    if (out.jam) jams++;
    carries += out.carries; overflows += out.overflows; steps += out.steps;
    if (out.word === r) equal++; else if (bad.length < 5) bad.push({ a: a.toString(16), b: b.toString(16), expected: r.toString(16), got: out.word.toString(16) });
  }
  S.check(`T-43 ${f}: equal to ${ref.symbol} on every vector`, equal === v.cases.length, {
    note: `${equal}/${v.cases.length} equal; ${v.cases.length - jams} through the wheels (${steps} detent steps, ${carries} carries, ${overflows} overflows), ${jams} with a code that names no detent position (levers jam; interface returns the invalid word)`,
    bad, vectors: path.relative(path.dirname(REPO), vecPath), vectors_sha256: sha256File(vecPath),
  });
  // seeded extra cases against the compiled reference
  if (refOk) {
    const rng = createRng(0x6d656368n + BigInt(width));
    const pairs = [];
    const digits = result.config.registers[0].digits;
    const enc = result.config.interface.encoding;
    const word = () => {
      let w = 0n;
      for (let i = 0; i < width; i++) {
        const d = digits[rng.nextU32() % digits.length];
        const code = enc === 'pair' ? (d === 0 ? 0n : d === 1 ? 1n : 2n) : BigInt(d);
        w |= code << BigInt(i * (enc === 'pair' ? 2 : 1));
      }
      return w;
    };
    for (let k = 0; k < 20000; k++) pairs.push([word(), word()]);
    const want = refRun(ref.symbol, pairs);
    let same = 0;
    pairs.forEach(([a, b], k) => { if (adder.add(a, b).word === want[k]) same++; });
    S.check(`T-43 ${f}: equal to compiled ${ref.symbol} on 20000 seeded cases`, same === pairs.length, { note: `${same}/${pairs.length}, seed 0x6d656368+${width}` });
  }
  realisations.push({ program: f, representation: ref.spec_id, symbol: ref.symbol, width, vectors: v.cases.length, equal, jams });
}

// ---- detent wheels, carries and ratchets (Guidelines 8.3)
{
  const t = new DetentWheel([-1, 0, 1]);
  t.set(1); const c1 = t.step(1);
  S.check('ternary detent: +1 plus +1 gives -1 with a carry of +1', t.digit === -1 && c1 === 1);
  t.set(-1); const c2 = t.step(-1);
  S.check('ternary detent: -1 plus -1 gives +1 with a carry of -1', t.digit === 1 && c2 === -1);
  t.set(0); const c3 = t.step(1);
  S.check('ternary detent: 0 plus +1 gives +1 with no carry', t.digit === 1 && c3 === 0);
  const r = new Register(4, [0, 1], { ratchet: true });
  r.set([1, 1, 1, 1]); r.step(0, 1);
  S.check('binary register: 1111 plus 1 ripples three carries and one overflow', r.read().join('') === '0000' && r.carries === 3 && r.overflows === 1, { note: `wheels ${r.read().join('')}, carries ${r.carries}, overflows ${r.overflows}` });
  let blocked = false;
  try { r.step(2, -1); } catch (e) { blocked = e.code === 'RATCHET'; }
  S.check('binary register: the ratchet pawl blocks a backward step', blocked);
  // exhaustive 3-trit register against integer arithmetic modulo 27
  let ok = 0, n = 0;
  const dec = (ds) => ds.reduce((s, d, i) => s + d * 3 ** i, 0);
  const all = [];
  for (let a = 0; a < 27; a++) all.push([a % 3 - 1, Math.floor(a / 3) % 3 - 1, Math.floor(a / 9) - 1]);
  for (const A of all) for (const B of all) {
    const reg = new Register(3, [-1, 0, 1]);
    reg.set(A);
    B.forEach((d, i) => { if (d) reg.turn(i, d); });
    const want = ((dec(A) + dec(B)) % 27 + 27 + 13) % 27 - 13;
    n++; if (dec(reg.read()) === want) ok++;
  }
  S.check('3-trit register exhaustive: 729 sums equal integer addition modulo 27 in the balanced range', ok === n, { note: `${ok}/${n}` });
}

// ---- a continuous ratchet on the harmonic oscillator's x shaft passes forward motion only
{
  const { doc } = loadProgram('harmonic-oscillator.analyser.yaml', loadModels());
  const d = JSON.parse(JSON.stringify(doc));
  d.shafts.push({ name: 'r', unit: 'rad' });
  d.elements.push({ kind: 'ratchet', name: 'ratchet', input: 'x', output: 'r', direction: 'forward' });
  d.initial.push({ shaft: 'r', value: 0, unit: 'rad' });
  d.run.t1 = Math.PI; // one period of omega = 2: x = 10 cos 2t falls from 10 to -10, then rises back to 10
  d.run.rk4_step = Math.PI / 4000;
  const r = checkConfig(d, {});
  const m = compileMechanism(r);
  const res = runMechanism(m, {});
  const ir = m.shaftNames.indexOf('r');
  const end = res.shafts.at(-1)[ir];
  let monotone = true;
  for (let k = 1; k < res.shafts.length; k++) if (res.shafts[k][ir] < res.shafts[k - 1][ir] - 1e-15) monotone = false;
  S.check('continuous ratchet: output never turns back, and gains exactly the forward travel of x (20 rad over one period)', monotone && Math.abs(end - 20) < 1e-3, { note: `r(T) = ${end}` });
}

// ---- realisation records (SUB-02): representation, substrate, mechanism and class, from this run
const N = '© 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI. SPDX-License-Identifier: CC0-1.0';
fs.mkdirSync(path.join(REPO, 'reports/realisations'), { recursive: true });
for (const rep of ['balanced_ternary', 'binary_integer']) {
  const rows = realisations.filter((x) => x.representation === rep);
  const all = rows.length === 2 && rows.every((x) => x.equal === x.vectors);
  const yaml = [
    `_notice: "${N}"`,
    `representation: {kind: representation, id: ${rep}, version: 0.3.0, repository: hmnsq/repsynth}`,
    'substrate: {id: mechanical, version: 0.1.0}',
    `mechanism: "${rep === 'balanced_ternary' ? 'counter wheels with three detent positions (-1, 0, +1) joined by carry pawls of -1, 0 or +1, set by setting levers (Guidelines 8.3)' : 'counter wheels with two detent positions (0, 1) joined by carry pawls, held by ratchet pawls, set by setting levers'}"`,
    `programs: [${rows.map((x) => x.program).join(', ')}]`,
    `capability_class: ${all ? 'supported' : 'not_established'}`,
    'rung: SIMULATED',
    `evidence: {state: ${all ? 'measured' : 'not_established'}, record: "reports/results/p10_3_adders.json and the P10.3 adders run record in records/", note: "${rows.map((x) => `${x.symbol}: ${x.equal}/${x.vectors} vectors equal`).join('; ')}. Simulated, not built (XSC-04): no physical claim."}`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(REPO, `reports/realisations/${rep.replace('_', '-')}.mechanical.yaml`), yaml);
}
S.finish({ realisations });
