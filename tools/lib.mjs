// © 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Node.js helpers for the tools and tests: read configurations, the vendored CMS-03 models and the repsynth
// vectors from disk. The numerical modules themselves never touch the file system.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadYaml } from '../docs/src/core.js';
import { checkConfig } from '../docs/src/config.js';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SUBCORE_DIR = path.join(REPO, 'docs/vendor/subcore/0.1.0');
export const PROGRAMS = path.join(REPO, 'docs/programs');
export const REPSYNTH = process.env.MECHSIM_REPSYNTH || path.resolve(REPO, '..', 'repsynth');

export const readText = (p) => fs.readFileSync(path.resolve(REPO, p), 'utf8');

export function loadModels() {
  const dir = path.join(SUBCORE_DIR, 'spec/models');
  const out = {};
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith('.yaml')) continue;
    const m = loadYaml(fs.readFileSync(path.join(dir, f), 'utf8'), f);
    out[m.identity.id] = m;
  }
  return out;
}

export function programFiles() {
  return fs.readdirSync(PROGRAMS).filter((f) => f.endsWith('.yaml')).sort();
}

export function loadProgram(file, models = loadModels()) {
  const p = path.isAbsolute(file) ? file : path.join(PROGRAMS, file);
  const doc = loadYaml(fs.readFileSync(p, 'utf8'), p);
  const files = tableFiles(doc);
  return { doc, files, result: checkConfig(doc, { models, files }), file: path.relative(REPO, p) };
}

// The table files a program refers to, read from docs/programs: { relative path: text }.
export function tableFiles(doc) {
  const out = {};
  for (const el of doc.elements || []) {
    if (el.kind === 'cam' && el.table && el.table.vectors) {
      const p = path.join(PROGRAMS, el.table.vectors);
      if (fs.existsSync(p)) out[el.table.vectors] = fs.readFileSync(p, 'utf8');
    }
  }
  return out;
}

export function writeJson(p, obj) {
  const abs = path.resolve(REPO, p);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify({ _notice: '© 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI. SPDX-License-Identifier: CC0-1.0', ...obj }, null, 1) + '\n');
}
