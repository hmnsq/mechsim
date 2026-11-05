// © 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// T-40 (P10.1): every configuration in docs/programs validates, there is one for every CMS-03 model, and every
// planted defect in tests/defects is refused with its expected code and path (EXPECTED.json); the control
// configuration (a consistent gear loop) is accepted. The JSON Schema check is tools/validate.py.

import fs from 'node:fs';
import path from 'node:path';
import { suite } from './harness.mjs';
import { REPO, loadModels, loadProgram, programFiles } from '../tools/lib.mjs';

const S = suite('p10_1_config');
const models = loadModels();
const programs = programFiles();
const covered = new Set();
for (const f of programs) {
  const { doc, result } = loadProgram(f, models);
  S.check(`valid ${f}`, result.ok, { note: result.ok ? `${result.config.kind}, hash ${result.hash.slice(0, 12)}` : JSON.stringify(result.errors.slice(0, 3)) });
  if (doc.model) covered.add(doc.model.id);
  if (result.ok && result.analysis) {
    const loops = result.analysis.closures.length;
    S.info(`${f}: ${result.config.shafts.length} shafts, ${result.config.elements.length} elements, ${result.analysis.states.length} states, spanning tree ${result.analysis.tree.length} relations, ${loops} loop closure(s)`);
  }
}
for (const id of Object.keys(models).sort()) S.check(`configuration for CMS-03 model ${id}`, covered.has(id));

const dir = path.join(REPO, 'tests/defects');
const expected = JSON.parse(fs.readFileSync(path.join(dir, 'EXPECTED.json'), 'utf8'));
for (const [f, want] of Object.entries(expected.refusals)) {
  const { result } = loadProgram(path.join(dir, f), models);
  const hit = (result.errors || []).find((e) => e.code === want.code && e.path === want.path);
  S.check(`refused ${f}`, !result.ok && !!hit, {
    note: result.ok ? 'ACCEPTED (the gate let a planted defect through)' : `${want.code} at ${want.path}: ${hit ? hit.message : 'expected refusal not found; got ' + JSON.stringify(result.errors)}`,
    errors: result.errors,
  });
}
for (const f of expected.accepted) {
  const { result } = loadProgram(path.join(dir, f), models);
  S.check(`accepted control ${f}`, result.ok, { note: result.ok ? `closures ${JSON.stringify(result.analysis.closures)}` : JSON.stringify(result.errors) });
}
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.yaml'));
S.check('every defect file has an expectation', files.every((f) => f in expected.refusals || expected.accepted.includes(f)));
S.finish({ programs: programs.length, defects: Object.keys(expected.refusals).length });
