"""Move kept candidates into assets/templates/ and record them in templates.json.

Usage: python scripts/gen/keep.py <batch> <kind> <number>[=<name>] ...
A name defaults to the candidate id; repeats of an id get -2, -3 suffixes.
"""

import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main(batch: str, kind: str, picks: list[str]) -> None:
    src = ROOT / "generation" / "candidates" / batch
    dest = ROOT / "assets" / "templates" / kind
    dest.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((src / "manifest.json").read_text())
    by_num = {c["number"]: c for c in manifest["candidates"]}
    tpath = ROOT / "assets" / "templates" / "templates.json"
    templates = json.loads(tpath.read_text())
    taken = {t["file"] for t in templates["templates"]}
    for pick in picks:
        num, _, name = pick.partition("=")
        c = by_num[int(num)]
        name = name or c["id"]
        stem, n = name, 1
        while f"{kind}/{stem}.png" in taken:
            n += 1
            stem = f"{name}-{n}"
        shutil.copy(src / c["files"]["image"], dest / f"{stem}.png")
        entry = {"id": stem, "kind": kind, "file": f"{kind}/{stem}.png", "size": c["size"], "provider": c["provider"],
                 "prompt": c["prompt"], "palette": c["palette"], "from": f"{batch} #{c['number']}", "made": c.get("made")}
        if c["files"].get("mask"):
            shutil.copy(src / c["files"]["mask"], dest / f"{stem}.mask.png")
            entry["mask"] = f"{kind}/{stem}.mask.png"
            entry["hitbox"] = (c.get("hitboxes") or [None])[0]
        templates["templates"] = [t for t in templates["templates"] if t["file"] != entry["file"]] + [entry]
        taken.add(entry["file"])
        print(f"{batch} #{num} -> {entry['file']}")
    tpath.write_text(json.dumps(templates, indent=2) + "\n")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3:])
