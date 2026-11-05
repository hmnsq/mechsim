// © 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// A probe, not a gate: do Node.js and Chromium return the same doubles from Math.sin, Math.exp, Math.log,
// Math.tanh, Math.sqrt and Math.pow on the function-generation grid? Guidelines 5 assumes they do (one engine);
// this records what the installed versions actually do. Exit 0 always; the counts go to the results file.

import { suite } from './harness.mjs';
import { serve } from '../tools/serve.mjs';
import { REPO } from '../tools/lib.mjs';
import { playwright } from './browser/pw.mjs';

const S = suite('transcendental_probe');
const FN = {
  sin: (x) => Math.sin(3.141592653589793 * x), exp: (x) => Math.exp(-x), log: (x) => Math.log(1 + x),
  tanh: (x) => Math.tanh(4 * x - 2), sqrt: (x) => Math.sqrt(x), pow: (x) => Math.pow(x, 2), cos: (x) => Math.cos(3.141592653589793 * x),
};
const xs = Array.from({ length: 1001 }, (_, k) => k / 1000);
const srv = await serve({ root: REPO });
const b = await playwright.chromium.launch();
const p = await b.newPage();
await p.goto(`${srv.url}/tests/browser/parity.html?programs=&models=`).catch(() => {});
const remote = await p.evaluate((src) => {
  const xs = Array.from({ length: 1001 }, (_, k) => k / 1000);
  const out = {};
  for (const [k, body] of Object.entries(src)) {
    const pi = 3.141592653589793;
    const f = { sin: (x) => Math.sin(pi * x), exp: (x) => Math.exp(-x), log: (x) => Math.log(1 + x), tanh: (x) => Math.tanh(4 * x - 2), sqrt: (x) => Math.sqrt(x), pow: (x) => Math.pow(x, 2), cos: (x) => Math.cos(pi * x) }[k];
    out[k] = xs.map(f);
  }
  return out;
}, Object.fromEntries(Object.keys(FN).map((k) => [k, k])));
const counts = {};
for (const [k, f] of Object.entries(FN)) {
  let n = 0, maxRel = 0, first = null;
  xs.forEach((x, i) => {
    const a = f(x), c = remote[k][i];
    if (a !== c) { n++; maxRel = Math.max(maxRel, Math.abs(a - c) / Math.abs(a)); first = first || { x, node: a, chromium: c }; }
  });
  counts[k] = { differ: n, of: xs.length, maxRel, first };
  S.info(`${k}: ${n} of ${xs.length} differ, max relative ${maxRel.toExponential(2)}${first ? `, e.g. x=${first.x}: node ${first.node} chromium ${first.chromium}` : ''}`);
}
const version = b.version();
await b.close(); await srv.close();
S.check('probe ran in Node.js and Chromium', true, { note: `node ${process.version}, chromium ${version}` });
S.finish({ node: process.version, chromium: version, counts });
