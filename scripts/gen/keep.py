"""Move kept candidates into assets/templates/ and record them in templates.json.

Usage: python scripts/gen/keep.py [--day] <batch> <kind> <number>[=<name>] ...
A name defaults to the candidate id; repeats of an id get -2, -3 suffixes.
--day also ships the candidate as game art: for batches generated in the locked day palette,
the processed image and mask go straight to assets/day/<kind>/ and into assets/day/day.json.
"""

import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main(batch: str, kind: str, picks: list[str], day: bool = False) -> None:
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
        if day:
            ship(src, c, kind, stem)
    tpath.write_text(json.dumps(templates, indent=2) + "\n")


def ship(src: Path, c: dict, kind: str, stem: str) -> None:
    locked = json.loads((ROOT / "generation" / "palettes" / "day.json").read_text())["colors"]
    used = {x.lower() for x in (c.get("palette") or [])}
    assert used and used <= {x.lower() for x in locked}, f"#{c['number']} is not in the locked day palette"
    dest = ROOT / "assets" / "day" / kind
    dest.mkdir(parents=True, exist_ok=True)
    shutil.copy(src / c["files"]["image"], dest / f"{stem}.png")
    entry = {"id": stem, "kind": kind, "file": f"{kind}/{stem}.png", "size": c["size"], "template": f"templates/{kind}/{stem}.png"}
    if c["files"].get("mask"):
        shutil.copy(src / c["files"]["mask"], dest / f"{stem}.mask.png")
        entry["mask"] = f"{kind}/{stem}.mask.png"
        entry["hitbox"] = (c.get("hitboxes") or [None])[0]
    dpath = ROOT / "assets" / "day" / "day.json"
    d = json.loads(dpath.read_text())
    d["assets"] = [a for a in d["assets"] if a["file"] != entry["file"]] + [entry]
    dpath.write_text(json.dumps(d, indent=2) + "\n")
    print(f"  shipped -> assets/day/{entry['file']}")


if __name__ == "__main__":
    args = sys.argv[1:]
    day = "--day" in args
    args = [a for a in args if a != "--day"]
    main(args[0], args[1], args[2:], day)
