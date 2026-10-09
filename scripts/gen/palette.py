"""Build a palette from approved images and lock it (spec: the day palette comes from the
first approved day-stage images and is locked forever).

Usage: python scripts/gen/palette.py <name> <colors> <image> [<image> ...]
Writes generation/palettes/<name>.json. Refuses to overwrite a locked palette.
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]


def to_lab(rgb: np.ndarray) -> np.ndarray:
    c = rgb / 255.0
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[:, 1] - 16, 500 * (f[:, 0] - f[:, 1]), 200 * (f[:, 1] - f[:, 2])], axis=1)


def build(paths: list[Path], k: int, per_image: int = 4000, seed: int = 7) -> list[str]:
    rng = np.random.default_rng(seed)
    samples = []
    for p in paths:
        a = np.asarray(Image.open(p).convert("RGBA")).reshape(-1, 4)
        px = a[a[:, 3] >= 128][:, :3].astype(np.float64)
        if len(px):
            samples.append(px[rng.integers(0, len(px), per_image)])  # equal weight per image
    rgb = np.concatenate(samples)
    lab = to_lab(rgb)
    # k-means++ in Lab space
    centers = [lab[rng.integers(len(lab))]]
    for _ in range(k - 1):
        d = np.min(((lab[:, None] - np.array(centers)[None]) ** 2).sum(-1), axis=1)
        centers.append(lab[rng.choice(len(lab), p=d / d.sum())])
    centers = np.array(centers)
    for _ in range(40):
        idx = ((lab[:, None] - centers[None]) ** 2).sum(-1).argmin(1)
        new = np.array([lab[idx == i].mean(0) if (idx == i).any() else centers[i] for i in range(k)])
        if np.allclose(new, centers):
            break
        centers = new
    idx = ((lab[:, None] - centers[None]) ** 2).sum(-1).argmin(1)
    # Report each cluster as the most common actual source colour in it (keeps colours crisp).
    out = []
    for i in range(k):
        members = rgb[idx == i].astype(int)
        if len(members) == 0:
            continue
        vals, counts = np.unique(members, axis=0, return_counts=True)
        out.append(vals[counts.argmax()])
    out.sort(key=lambda c: 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2])
    return ["#%02x%02x%02x" % tuple(int(v) for v in c) for c in out]


if __name__ == "__main__":
    name, k = sys.argv[1], int(sys.argv[2])
    dest = ROOT / "generation" / "palettes" / f"{name}.json"
    if dest.exists() and json.loads(dest.read_text()).get("locked"):
        sys.exit(f"{dest} is locked; refusing to overwrite")
    paths = [Path(p).resolve() for p in sys.argv[3:]]
    colors = build(paths, k)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps({"name": name, "locked": False, "colors": colors, "from": [str(p.relative_to(ROOT)) for p in paths]}, indent=2) + "\n")
    print(colors)
