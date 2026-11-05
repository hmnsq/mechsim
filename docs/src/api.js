// © 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The one command surface of the simulator (WEB-06): the same functions serve tools/cli.mjs in Node.js, the
// module Web Worker of the page, and the browser parity test. Inputs are texts (YAML programs and models), so
// nothing here touches the file system or the DOM.

import { loadYaml, sha256Hex, SubcoreError } from './core.js';
import { checkConfig } from './config.js';
import { compileMechanism, runMechanism, traceText, variables, ENGINE_VERSION } from './kinematic.js';
import { buildAdder } from './discrete.js';

export const MECHSIM_VERSION = '0.1.0';

export function modelsFromTexts(texts) {
  const out = {};
  for (const t of texts) { const m = loadYaml(t); out[m.identity.id] = m; }
  return out;
}

// The table files a program refers to (cam tables), as relative paths under docs/programs.
export function referencedFiles(programText) {
  const doc = loadYaml(programText);
  return (doc.elements || []).filter((e) => e.kind === 'cam' && e.table && e.table.vectors).map((e) => e.table.vectors);
}

export function check(programText, models = {}, files = {}) {
  const doc = loadYaml(programText);
  const r = checkConfig(doc, { models, files });
  return { ok: r.ok, errors: r.errors, kind: r.config && r.config.kind, hash: r.hash };
}

// Run a continuous or function program. opts as runMechanism. Returns { trace, sha256, stats, variables, shaftNames, t, shafts }.
export function run(programText, models = {}, opts = {}, files = {}) {
  const doc = loadYaml(programText);
  const r = checkConfig(doc, { models, files });
  if (!r.ok) throw new SubcoreError(r.errors[0].code, r.errors[0].path, r.errors[0].message, r.errors);
  if (r.config.kind === 'discrete') throw new SubcoreError('RUN', 'kind', 'a discrete program runs with add()');
  const m = compileMechanism(r);
  const res = runMechanism(m, opts);
  const trace = traceText(m, res);
  return { trace, sha256: sha256Hex(trace), stats: res.stats, variables: variables(m, res), shaftNames: m.shaftNames, t: res.t, shafts: res.shafts, mechanism: m, meta: res.meta, engine: ENGINE_VERSION };
}

// Add two words (hexadecimal strings or BigInt) on a discrete adder program.
export function add(programText, a, b) {
  const doc = loadYaml(programText);
  const r = checkConfig(doc, {});
  if (!r.ok) throw new SubcoreError(r.errors[0].code, r.errors[0].path, r.errors[0].message, r.errors);
  const adder = buildAdder(r.config);
  const big = (x) => (typeof x === 'bigint' ? x : BigInt('0x' + String(x)));
  const out = adder.add(big(a), big(b));
  return { ...out, hex: out.word.toString(16) };
}
