#!/usr/bin/env python3
# © 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI.
# SPDX-License-Identifier: GPL-3.0-or-later
"""JSON Schema 2020-12 check of mechanism configurations (Guidelines 13: YAML validated against JSON Schema).

    python3 tools/validate.py [--json out.json] file.yaml ...

Prints one line per file (valid, or each error with its path) and exits 0 when every file is valid against
spec/schema/mechanism.schema.json. The schema fixes the shape; docs/src/config.js checks the meaning."""
import argparse, json, sys
from pathlib import Path
import importlib.metadata
import jsonschema, yaml

REPO = Path(__file__).resolve().parent.parent
SCHEMA = REPO / "spec" / "schema" / "mechanism.schema.json"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--json")
    a = ap.parse_args()
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    jsonschema.Draft202012Validator.check_schema(schema)
    v = jsonschema.Draft202012Validator(schema)
    out, bad = {}, 0
    for f in a.files:
        doc = yaml.safe_load(Path(f).read_text(encoding="utf-8"))
        errs = sorted(v.iter_errors(doc), key=lambda e: list(e.absolute_path))
        rel = str(Path(f).resolve().relative_to(REPO))
        out[rel] = [{"path": "/".join(str(p) for p in e.absolute_path), "message": e.message[:300]} for e in errs]
        if errs:
            bad += 1
            for e in out[rel][:5]:
                print(f"INVALID {rel}: at /{e['path']}: {e['message']}")
        else:
            print(f"valid {rel}")
    print(f"[validate] {len(a.files) - bad}/{len(a.files)} valid against {SCHEMA.relative_to(REPO)} "
          f"(jsonschema {importlib.metadata.version("jsonschema")}, Draft 2020-12)")
    if a.json:
        p = REPO / a.json
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps({"_notice": "© 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI. SPDX-License-Identifier: CC0-1.0",
                                 "schema": str(SCHEMA.relative_to(REPO)), "files": out}, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
