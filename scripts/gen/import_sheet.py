"""Import user-provided animation sheets for one character.

Usage:
  python scripts/gen/import_sheet.py <name> <height> <colours> <sheet.png>:<anim>:<frames> [...]

  colours: "keep" (shared palette of up to 32 colours from the sheets themselves) or "day"
           (snap to the locked day palette)

Each sheet is a row of frames on a flat background. Frames are found by their gaps (or split
evenly), the background is removed, and every frame of every animation is aligned on the
same anchor (feet at the bottom, body centre from the legs) and scaled by one shared factor,
so the character never changes size or jitters between animations. Output: one horizontal
strip per animation in assets/day/characters/<name>-<anim>.png, plus frame size and anchor
in assets/day/day.json under "sheets".
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

from process import auto_palette, clean_mask, hex_to_rgb, palette_used, remove_background, snap

ROOT = Path(__file__).resolve().parents[2]


def split_frames(img: Image.Image, n: int) -> list[Image.Image]:
    a = np.asarray(img.convert("RGB")).astype(int)
    h, w, _ = a.shape
    bg = np.median(a[[0, 0, h - 1, h - 1], [0, w - 1, 0, w - 1]], axis=0)
    cols = (np.abs(a - bg).sum(-1) > 40).any(0)
    runs, start = [], None
    for x, v in enumerate(cols):
        if v and start is None:
            start = x
        if not v and start is not None:
            runs.append([start, x])
            start = None
    if start is not None:
        runs.append([start, w])
    merged: list[list[int]] = []
    for r in runs:  # join slivers separated by tiny gaps
        if merged and r[0] - merged[-1][1] < 24:
            merged[-1][1] = r[1]
        else:
            merged.append(r)
    merged = [r for r in merged if r[1] - r[0] > 20]
    if len(merged) != n:
        step = w / n
        merged = [[round(i * step), round((i + 1) * step)] for i in range(n)]
    pad = 12
    return [img.crop((max(0, x0 - pad), 0, min(w, x1 + pad), h)) for x0, x1 in merged]


def anchor(mask: np.ndarray) -> tuple[float, float]:
    ys, xs = np.nonzero(mask)
    feet = ys.max()
    low = ys > feet - (feet - ys.min()) * 0.35
    return float(np.median(xs[low])), float(feet)


def main(name: str, height: int, colours: str, specs: list[str]) -> None:
    anims = []
    for spec in specs:
        path, anim, n = spec.rsplit(":", 2)
        frames = []
        for f in split_frames(Image.open(path).convert("RGBA"), int(n)):
            f = remove_background(f, tolerance=48)
            f, mask = clean_mask(f, 40)
            ax, ay = anchor(mask)
            ys, xs = np.nonzero(mask)
            frames.append({"img": f, "ax": ax, "ay": ay, "x0": xs.min(), "x1": xs.max() + 1, "y0": ys.min()})
        anims.append((anim, frames))
    allf = [f for _, fs in anims for f in fs]
    left = max(f["ax"] - f["x0"] for f in allf)
    right = max(f["x1"] - f["ax"] for f in allf)
    up = max(f["ay"] - f["y0"] for f in allf)
    margin = 4
    cw, ch = int(left + right + 2 * margin), int(up + 2 * margin)
    scale = height / ch
    out_w = max(1, round(cw * scale))
    small = []
    for anim, frames in anims:
        row = []
        for f in frames:
            canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
            canvas.paste(f["img"], (int(margin + left - f["ax"]), int(margin + up - f["ay"])), f["img"])
            row.append(canvas.resize((out_w, height), Image.Resampling.BOX))
        small.append((anim, row))
    if colours == "day":
        pal = np.array([hex_to_rgb(c) for c in json.loads((ROOT / "generation/palettes/day.json").read_text())["colors"]])
    else:
        strip = Image.new("RGBA", (out_w * sum(len(r) for _, r in small), height))
        x = 0
        for _, r in small:
            for f in r:
                strip.paste(f, (x, 0))
                x += out_w
        pal = auto_palette(strip, 32)
    day_path = ROOT / "assets/day/day.json"
    day = json.loads(day_path.read_text())
    day.setdefault("sheets", [])
    for anim, row in small:
        sheet = Image.new("RGBA", (out_w * len(row), height), (0, 0, 0, 0))
        areas = []
        for i, f in enumerate(row):
            f = snap(f, pal)
            f, m = clean_mask(f, 3)
            areas.append(int(m.sum()))
            sheet.paste(f, (i * out_w, 0))
        key = f"characters/{name}-{anim}"
        dest = ROOT / "assets/day" / f"{key}.png"
        dest.parent.mkdir(parents=True, exist_ok=True)
        sheet.save(dest)
        entry = {"key": key, "frameWidth": out_w, "frameHeight": height, "frames": len(row),
                 "anchor": [round((margin + left) * scale / out_w, 4), round((margin + up) * scale / height, 4)],
                 "provider": "user", "colours": colours, "palette": palette_used(sheet)}
        day["sheets"] = [s for s in day["sheets"] if s["key"] != key] + [entry]
        med = float(np.median(areas))
        print(f"{key}: {len(row)} frames of {out_w}x{height}, area vs median {[round(a / med, 2) for a in areas]}")
    day_path.write_text(json.dumps(day, indent=2) + "\n")


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4:])
