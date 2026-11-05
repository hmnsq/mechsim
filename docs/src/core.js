// © 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The one place that names the vendored shared core (hmnsq/subcore) by version. Re-vendoring a new core
// version changes the paths here and nowhere else. See docs/vendor/subcore/<version>/PROVENANCE.

export { SubcoreError, notImplemented } from '../vendor/subcore/0.1.0/src/errors.js';
export { toSI, fromSI, parseUnit, sameDimension, convert } from '../vendor/subcore/0.1.0/src/units.js';
export { rk4Step, rk4Work, integrateFixed, dopri54, grid } from '../vendor/subcore/0.1.0/src/solve.js';
export { bisect, integrateWithEvents } from '../vendor/subcore/0.1.0/src/events.js';
export { writeTrace, parseTrace, compareTraces, fmt17 } from '../vendor/subcore/0.1.0/src/trace.js';
export { parseVectors } from '../vendor/subcore/0.1.0/src/vectors.js';
export { loadYaml, specHash, compileModel, analyticSolution, compileFunctions, checkModel } from '../vendor/subcore/0.1.0/src/spec.js';
export { sha256Hex, canonicalJson } from '../vendor/subcore/0.1.0/src/hash.js';
export { createRng } from '../vendor/subcore/0.1.0/src/prng.js';
export { parse as parseExpr, compile as compileExpr } from '../vendor/subcore/0.1.0/src/expr.js';

export const SUBCORE_VERSION = '0.1.0';
