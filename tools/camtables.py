#!/usr/bin/env python3
# © 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI.
# SPDX-License-Identifier: GPL-3.0-or-later
"""Cam tables and check points for the function-generation model, from mpmath (Test Plan 4: mpmath oracle).

    python3 -I tools/camtables.py [--points 1001]

A cam is cut from a table, so its profile is data: each function of the vendored function-generation model is
evaluated by mpmath at 40 decimal digits at the binary64 table points x_k = k / (n - 1) and rounded to binary64
(the model's own oracle statement). The tables go to docs/programs/tables/ and the midpoints x = (k + 1/2)/(n - 1),
where the C1 interpolation error is largest, go to tests/vectors/ for the comparison. The simulator then uses
no transcendental function of the JavaScript engine, whose last bits differ between engine versions
(tests/transcendental_probe.test.mjs). Files are deterministic: no timestamps."""
import argparse, hashlib, sys
from pathlib import Path
import importlib.metadata
import mpmath

REPO = Path(__file__).resolve().parent.parent
MODEL = REPO / "docs/vendor/subcore/0.1.0/spec/models/function-generation.yaml"
NOTICE = "© 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI. SPDX-License-Identifier: CC0-1.0"
GENERATOR = "mechsim tools/camtables.py 0.1.0"
PI64 = 3.141592653589793  # the model's parameter pi, binary64

FUNCS = {
    "f_sin": lambda x: mpmath.sin(mpmath.mpf(PI64) * x),
    "f_exp": lambda x: mpmath.exp(-x),
    "f_square": lambda x: x ** 2,
    "f_sqrt": lambda x: mpmath.sqrt(x),
    "f_log": lambda x: mpmath.log(1 + x),
    "f_tanh": lambda x: mpmath.tanh(4 * x - 2),
    "f_abs": lambda x: abs(2 * x - 1),
}
EXPR = {"f_sin": "sin(pi*x)", "f_exp": "exp(-x)", "f_square": "x^2", "f_sqrt": "sqrt(x)", "f_log": "log(1 + x)",
        "f_tanh": "tanh(4*x - 2)", "f_abs": "abs(2*x - 1)"}


def r17(v):
    return f"{float(v):.16e}"


def write(path, name, xs, kind):
    mpmath.mp.dps = 40
    lines = ["# subcore-vectors 1", f"# {NOTICE}", "# model: function-generation", "# version: 1.0.0",
             f"# model_file_sha256: {hashlib.sha256(MODEL.read_bytes()).hexdigest()}",
             f"# function: {name} = {EXPR[name]}",
             f"# oracle: mpmath {importlib.metadata.version('mpmath')} at 40 decimal digits, rounded to binary64; x exact binary64",
             "# error_bound: below one half unit in the last place of each value",
             f"# points: {kind}", "# fields: x y", f"# generator: {GENERATOR}", f"# cases: {len(xs)}"]
    for x in xs:
        lines.append(f"{r17(x)} {r17(FUNCS[name](mpmath.mpf(x)))}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--points", type=int, default=1001)
    a = ap.parse_args()
    n = a.points
    nodes = [k / (n - 1) for k in range(n)]  # one correctly rounded division, as docs/src/elements/cam.js computes them
    mids = [(2 * k + 1) / (2 * (n - 1)) for k in range(n - 1)]
    for name in FUNCS:
        write(REPO / f"docs/programs/tables/function-generation.{name}.{n}.vec", name, nodes, f"table nodes x_k = k/{n - 1}")
        write(REPO / f"tests/vectors/function-generation.{name}.mid{n - 1}.vec", name, mids, f"midpoints (2k+1)/{2 * (n - 1)}")
        print(f"[camtables] {name}: {n} nodes, {n - 1} midpoints")
    return 0


if __name__ == "__main__":
    sys.exit(main())
