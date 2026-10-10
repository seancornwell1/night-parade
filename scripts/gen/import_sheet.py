"""Import user-provided animation sheets for one character.

Usage:
  python scripts/gen/import_sheet.py <name> <height> <colours> <sheet.png>:<anim>:<frames> [...]

  colours: "keep" (shared palette of up to 32 colours from the sheets themselves) or "day"
           (snap to the locked day palette)

Each sheet is a row of equal frame cells on a flat background. The backdrop is removed along
with anything painted onto it that would clash with the map: the drop shadow under the feet,
glow haloes around light sources, and background trapped between limbs and props. Frames keep
their own position inside their cell, so the motion drawn in the sheet (bob, step, lunge)
survives; each animation as a whole is shifted so its median foot anchor lines up with the
others, and everything is scaled by one shared factor so the character never changes size
between animations. Output: one horizontal
strip per animation in assets/day/characters/<name>-<anim>.png, plus frame size and anchor
in assets/day/day.json under "sheets".
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

from scipy import ndimage as ndi

from process import auto_palette, clean_mask, hex_to_rgb, palette_used, snap

ROOT = Path(__file__).resolve().parents[2]


def strip_backdrop(img: Image.Image) -> Image.Image:
    """Make the flat backdrop transparent, plus its drop shadow, light glow and trapped pockets."""
    a = np.asarray(img.convert("RGB")).astype(float)
    h, w, _ = a.shape
    edges = np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3), a[:, :8].reshape(-1, 3), a[:, -8:].reshape(-1, 3)])
    bg = np.median(edges, 0)
    d = a - bg
    lum = a.mean(-1)
    grad = ndi.uniform_filter(ndi.generic_gradient_magnitude(lum, ndi.sobel), 7)

    def grow(seed: np.ndarray, allowed: np.ndarray, steps: int) -> np.ndarray:
        out = seed.copy()
        for _ in range(steps):
            nxt = ndi.binary_dilation(out, iterations=2) & (allowed | out)
            if (nxt == out).all():
                break
            out = nxt
        return out

    plain = np.abs(d).max(-1) <= 10
    lab, _ = ndi.label(plain)
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    outside = np.isin(lab, edge[edge > 0])
    # Glow: the backdrop blended toward warm lantern light.
    warm = np.array([255, 170, 40.0]) - bg
    t = (d @ warm) / (warm @ warm)
    glow = (t > -0.05) & (t < 0.4) & (np.linalg.norm(d - t[..., None] * warm, axis=-1) < 20)
    # Pockets: large, flat enclosed patches of backdrop (between the pole and the hat).
    lab, n = ndi.label((plain | glow) & (grad < 30) & ~outside)
    sizes = ndi.sum(np.ones_like(lab), lab, range(1, n + 1))
    pockets = np.isin(lab, 1 + np.nonzero(sizes > 1500)[0])
    # Shadow: darkened, flat backdrop around the feet, eaten only a short way in from outside.
    chroma = a / np.maximum(lum[..., None], 1) - bg / bg.mean()
    shadow = (lum < bg.mean() + 2) & (lum > bg.mean() * 0.45) & (np.abs(chroma).max(-1) < 0.32) & (grad < 70)
    ys = np.arange(h)[:, None].repeat(w, 1)
    feet = np.zeros_like(shadow)
    figs, nf = ndi.label(ndi.binary_opening(~outside, iterations=2))
    for i in range(1, nf + 1):
        yy = np.nonzero(figs == i)[0]
        if len(yy) >= 3000:
            feet |= ys > yy.max() - (yy.max() - yy.min()) * 0.16
    base = grow(outside | pockets, glow, 40)
    gone = grow(base, shadow & feet, 14)
    out = np.asarray(img.convert("RGBA")).copy()
    out[..., 3] = np.where(gone, 0, 255)
    return Image.fromarray(out, "RGBA")


def split_cells(img: Image.Image, n: int) -> list[Image.Image]:
    step = img.width / n
    return [img.crop((round(i * step), 0, round((i + 1) * step), img.height)) for i in range(n)]


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
        for f in split_cells(strip_backdrop(Image.open(path)), int(n)):
            f, mask = clean_mask(f, 40)
            ax, ay = anchor(mask)
            ys, xs = np.nonzero(mask)
            frames.append({"img": f, "ax": ax, "ay": ay, "x0": xs.min(), "x1": xs.max() + 1, "y0": ys.min()})
        # One shift per animation (its median foot anchor), so motion inside the cells survives.
        mx = float(np.median([f["ax"] for f in frames]))
        my = float(np.median([f["ay"] for f in frames]))
        for f in frames:
            f["ox"], f["oy"] = mx, my
        anims.append((anim, frames))
    allf = [f for _, fs in anims for f in fs]
    left = max(f["ox"] - f["x0"] for f in allf)
    right = max(f["x1"] - f["ox"] for f in allf)
    up = max(f["oy"] - f["y0"] for f in allf)
    down = max(0.0, max(float(np.nonzero(np.asarray(f["img"])[..., 3])[0].max()) + 1 - f["oy"] for f in allf))
    margin = 4
    cw, ch = int(left + right + 2 * margin), int(up + down + 2 * margin)
    scale = height / ch
    out_w = max(1, round(cw * scale))
    small = []
    for anim, frames in anims:
        row = []
        for f in frames:
            canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
            canvas.paste(f["img"], (int(margin + left - f["ox"]), int(margin + up - f["oy"])), f["img"])
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
