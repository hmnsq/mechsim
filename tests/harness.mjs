// © 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// A small test harness on Node.js built-ins: named checks, verbose output, a results file and an exit code
// (0 when every check passes). Results go to reports/results/<name>.json so run records can carry them.

import { writeJson } from '../tools/lib.mjs';

export function suite(name) {
  const checks = [];
  return {
    check(id, ok, detail = {}) {
      checks.push({ id, ok: !!ok, ...detail });
      console.log(`${ok ? 'PASS' : 'FAIL'} ${id}${detail.note ? ' - ' + detail.note : ''}`);
      return !!ok;
    },
    info(line) { console.log(`     ${line}`); },
    finish(extra = {}) {
      const failed = checks.filter((c) => !c.ok);
      const res = { suite: name, checks: checks.length, passed: checks.length - failed.length, failed: failed.map((c) => c.id), ...extra, details: checks };
      writeJson(`reports/results/${name}.json`, res);
      console.log(`[${name}] ${res.passed}/${res.checks} checks pass${failed.length ? '; FAILED: ' + res.failed.join(', ') : ''}`);
      process.exitCode = failed.length ? 1 : 0;
      return res;
    },
  };
}
