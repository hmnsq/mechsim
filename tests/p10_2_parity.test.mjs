// © 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// T-33 for the mechanical engine (P10.2, WEB-06): every continuous and function program is run with fixed-step
// RK4 in Node.js and in Chromium (Playwright, files served by tools/serve.mjs) through the same command surface,
// and the trace texts must be byte-identical (equal sha256). Other engines (Firefox, WebKit) are compared
// within the cross-engine bound when their browsers are installed; here only Chromium is, and that is recorded.

import fs from 'node:fs';
import path from 'node:path';
import { suite } from './harness.mjs';
import { REPO, SUBCORE_DIR, programFiles, readText, loadModels, tableFiles } from '../tools/lib.mjs';
import { loadYaml } from '../docs/src/core.js';
import { run } from '../docs/src/api.js';
import { serve } from '../tools/serve.mjs';
import { playwright } from './browser/pw.mjs';

const S = suite('p10_2_parity');
const models = loadModels();
const programs = programFiles().filter((f) => !/adder/.test(f));
const node = {};
for (const p of programs) {
  const src = readText(`docs/programs/${p}`);
  const r = run(src, models, { solver: 'rk4' }, tableFiles(loadYaml(src)));
  node[p] = r.sha256;
  S.info(`node ${p} ${r.sha256} (${r.trace.length} bytes)`);
}
const modelFiles = fs.readdirSync(path.join(SUBCORE_DIR, 'spec/models')).filter((f) => f.endsWith('.yaml'));
const srv = await serve({ root: REPO });
const engines = {};
for (const name of ['chromium', 'firefox', 'webkit']) {
  let browser;
  try { browser = await playwright[name].launch(); } catch (e) {
    engines[name] = { launched: false, reason: String(e.message).split('\n')[0] };
    S.info(`${name}: not available here (${engines[name].reason})`);
    continue;
  }
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${srv.url}/tests/browser/parity.html?programs=${programs.join(',')}&models=${modelFiles.join(',')}`);
  await page.waitForFunction(() => window.__parity, null, { timeout: 120000 });
  const res = await page.evaluate(() => window.__parity);
  engines[name] = { launched: true, version: browser.version(), userAgent: res.userAgent, ok: res.ok, error: res.error, errors };
  await browser.close();
  if (!res.ok) { S.check(`${name} ran the programs`, false, { note: res.error }); continue; }
  for (const p of programs) {
    const same = res.results[p].sha256 === node[p];
    if (name === 'chromium') S.check(`chromium ${browser.version ? '' : ''}byte-identical trace ${p}`, same, { note: `${res.results[p].sha256.slice(0, 16)} vs node ${node[p].slice(0, 16)}, ${res.results[p].ms.toFixed(0)} ms` });
    else S.check(`${name} trace ${p} (cross-engine bound)`, same, { note: same ? 'identical' : 'differs: compare within 1e-12' });
  }
}
await srv.close();
S.check('chromium was available and ran', engines.chromium && engines.chromium.launched);
S.finish({ node: process.version, engines, programs, node_sha256: node });
