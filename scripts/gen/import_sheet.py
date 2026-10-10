"""Import user-provided animation sheets for one character.

Usage:
  python scripts/gen/import_sheet.py <name> <height> <colours> <sheet.png>:<anim>:<frames>[:r<row>] [...]

  height:  pixel height of the first animation's frames; frames that reach further (a raised
           sword, a long slash) make the shared frame bigger instead of shrinking the character
  :r<row>: take one row of a grid image (rows are found at the empty bands between them)

  colours: "keep" (shared palette of up to 32 colours from the sheets themselves) or "day"
           (snap to the locked day palette)

Each sheet is a row of equal frame cells on a flat background. The backdrop is removed along
with anything painted onto it that would clash with the map: the drop shadow under the feet,
glow haloes around light sources, and background trapped between limbs and props. Every frame
is pinned on its torso centre (horizontally) and its lowest foot (vertically): generators
place frames inconsistently inside their cells, which made the idle sway, while pinning the
torso keeps the body steady and lets legs, sleeves and props move. Everything is scaled by one
shared factor so the character never changes size between animations. Output: one horizontal
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
    """Cut a row into n frames at the empty columns between figures (midway through each gap),
    or into n equal cells if the figures can't be told apart."""
    a = np.asarray(img.convert("RGB")).astype(int)
    bg = np.median(np.concatenate([a[:4].reshape(-1, 3), a[-4:].reshape(-1, 3)]), 0)
    busy = (np.abs(a - bg).sum(-1) > 40).any(0)
    runs, start = [], None
    for x, v in enumerate(busy):
        if v and start is None:
            start = x
        if not v and start is not None:
            runs.append([start, x])
            start = None
    if start is not None:
        runs.append([start, len(busy)])
    merged: list[list[int]] = []
    for r in runs:  # join slivers (sword tips, slash ends) separated by tiny gaps
        if merged and r[0] - merged[-1][1] < 12:
            merged[-1][1] = r[1]
        else:
            merged.append(r)
    merged = [r for r in merged if r[1] - r[0] > 8]
    if len(merged) == n:
        cuts = [0] + [(merged[i][1] + merged[i + 1][0]) // 2 for i in range(n - 1)] + [img.width]
    else:
        cuts = [round(i * img.width / n) for i in range(n + 1)]
    return [img.crop((cuts[i], 0, cuts[i + 1], img.height)) for i in range(n)]


def anchor(mask: np.ndarray) -> tuple[float, float]:
    """Torso centre (the middle band of the body, so legs, sleeves and props can move around it)
    and the lowest foot."""
    ys, xs = np.nonzero(mask)
    top, feet = ys.min(), ys.max()
    band = (ys > top + (feet - top) * 0.45) & (ys < top + (feet - top) * 0.72)
    return float(np.median(xs[band])), float(feet)


def rows_of(img: Image.Image) -> list[Image.Image]:
    """Split a grid image into its rows of frames at the empty horizontal bands between them."""
    a = np.asarray(img.convert("RGB")).astype(int)
    bg = np.median(a[:4].reshape(-1, 3), 0)
    busy = (np.abs(a - bg).sum(-1) > 40).any(1)
    runs, start = [], None
    for y, v in enumerate(busy):
        if v and start is None:
            start = y
        if not v and start is not None:
            if y - start > 20:
                runs.append([start, y])
            start = None
    if start is not None:
        runs.append([start, len(busy)])
    cuts = [0] + [(runs[i][1] + runs[i + 1][0]) // 2 for i in range(len(runs) - 1)] + [img.height]
    return [img.crop((0, cuts[i], img.width, cuts[i + 1])) for i in range(len(runs))]


def hat_width(img: Image.Image) -> int:
    """Width of the straw hat, the one rigid object in every pose, used as a size ruler."""
    a = np.asarray(img.convert("RGB")).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = ndi.binary_closing((r > 120) & (r < 240) & (g > 85) & (b < 150) & (r - b > 55) & (r - g > 15) & (r - g < 75), iterations=2)
    lab, n = ndi.label(m)
    if n == 0:
        return 0
    xs = np.nonzero(lab == 1 + int(np.argmax(ndi.sum(m, lab, range(1, n + 1)))))[1]
    return int(xs.max() - xs.min() + 1)


def main(name: str, height: int, colours: str, specs: list[str]) -> None:
    # 1. Cut every spec into frame cells (a spec may pick one row of a grid with :rN).
    cells: list[tuple[str, str, list[Image.Image]]] = []
    for spec in specs:
        parts = spec.split(":")
        row = None
        if parts[-1].startswith("r") and parts[-1][1:].isdigit():
            row = int(parts.pop()[1:])
        path, anim, n = ":".join(parts[:-2]), parts[-2], int(parts[-1])
        img = Image.open(path).convert("RGB")
        if row is not None:
            img = rows_of(img)[row]
        cells.append((path, anim, split_cells(img, n)))
    # 2. Sheets drawn at a different size (different generations) are scaled to match the
    #    first sheet, measured by the hat. Small differences are left alone.
    hats: dict[str, int] = {}
    for path, _, cs in cells:
        hats[path] = max(hats.get(path, 0), *(hat_width(c) for c in cs))
    ref = hats[cells[0][0]]
    anims = []
    for path, anim, cs in cells:
        k = ref / hats[path] if hats[path] else 1.0
        if abs(1 - k) < 0.25:
            k = 1.0
        frames = []
        for c in cs:
            if k != 1.0:
                c = c.resize((round(c.width * k), round(c.height * k)), Image.Resampling.NEAREST)
            f, mask = clean_mask(strip_backdrop(c), 40)
            ax, ay = anchor(mask)
            ys, xs = np.nonzero(mask)
            frames.append({"img": f, "ox": ax, "oy": ay, "x0": xs.min(), "x1": xs.max() + 1, "y0": ys.min(), "y1": ys.max() + 1})
        anims.append((anim, frames))
        if k != 1.0:
            print(f"{path}: hat {hats[path]}px vs {ref}px, scaled x{k:.2f}")
    # 3. One canvas holds every frame; its scale comes from the first animation alone, so a
    #    raised sword or a long slash makes the frame bigger instead of shrinking the character.
    allf = [f for _, fs in anims for f in fs]
    margin = 4
    left = max(f["ox"] - f["x0"] for f in allf)
    right = max(f["x1"] - f["ox"] for f in allf)
    up = max(f["oy"] - f["y0"] for f in allf)
    down = max(0.0, max(f["y1"] - f["oy"] for f in allf))
    cw, ch = int(left + right + 2 * margin), int(up + down + 2 * margin)
    first = anims[0][1]
    ref_h = max(f["oy"] - f["y0"] for f in first) + max(f["y1"] - f["oy"] for f in first) + 2 * margin
    scale = height / ref_h
    out_w, out_h = max(1, round(cw * scale)), max(1, round(ch * scale))
    small = []
    for anim, frames in anims:
        row = []
        for f in frames:
            canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
            canvas.paste(f["img"], (int(margin + left - f["ox"]), int(margin + up - f["oy"])), f["img"])
            row.append(canvas.resize((out_w, out_h), Image.Resampling.BOX))
        small.append((anim, row))
    if colours == "day":
        pal = np.array([hex_to_rgb(c) for c in json.loads((ROOT / "generation/palettes/day.json").read_text())["colors"]])
    else:
        strip = Image.new("RGBA", (out_w * sum(len(r) for _, r in small), out_h))
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
        sheet = Image.new("RGBA", (out_w * len(row), out_h), (0, 0, 0, 0))
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
        entry = {"key": key, "frameWidth": out_w, "frameHeight": out_h, "frames": len(row),
                 "anchor": [round((margin + left) * scale / out_w, 4), round((margin + up) * scale / out_h, 4)],
                 "provider": "user", "colours": colours, "palette": palette_used(sheet)}
        day["sheets"] = [s for s in day["sheets"] if s["key"] != key] + [entry]
        med = float(np.median(areas))
        print(f"{key}: {len(row)} frames of {out_w}x{out_h}, area vs median {[round(a / med, 2) for a in areas]}")
    day_path.write_text(json.dumps(day, indent=2) + "\n")


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4:])
