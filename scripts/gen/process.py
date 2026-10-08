"""Post-processing and checks for generated images.

Every candidate goes through: crop/resize to its fixed size, palette lock, then type-specific
work (seamless tiles; masks and hitboxes for sprites; fixed-grid slicing and frame consistency
for sheets) and checks. Nothing here draws art; it only cleans up provider output.
"""

from __future__ import annotations

from collections import deque

import numpy as np
from PIL import Image, ImageDraw

# ---------------------------------------------------------------- palette


def hex_to_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def rgb_to_hex(c) -> str:
    return "#%02x%02x%02x" % tuple(int(v) for v in c[:3])


def auto_palette(img: Image.Image, colors: int) -> np.ndarray:
    """Median-cut palette of the opaque pixels."""
    a = np.asarray(img.convert("RGBA"))
    opaque = a[a[..., 3] >= 128][:, :3]
    if len(opaque) == 0:
        opaque = a.reshape(-1, 4)[:, :3]
    strip = Image.fromarray(opaque.reshape(1, -1, 3).astype(np.uint8), "RGB")
    q = strip.quantize(colors=colors, method=Image.Quantize.MEDIANCUT)
    pal = np.array(q.getpalette()[: colors * 3]).reshape(-1, 3)
    used = sorted(set(np.asarray(q).flatten().tolist()))
    return pal[used].astype(np.int32)


def snap(img: Image.Image, palette: np.ndarray) -> Image.Image:
    """Snap every pixel to the nearest palette colour (red-mean distance); alpha becomes 0 or 255."""
    a = np.asarray(img.convert("RGBA")).astype(np.int32)
    rgb = a[..., :3].reshape(-1, 1, 3)
    pal = palette.reshape(1, -1, 3)
    rmean = (rgb[..., 0] + pal[..., 0]) / 2
    d = rgb - pal
    dist = (2 + rmean / 256) * d[..., 0] ** 2 + 4 * d[..., 1] ** 2 + (2 + (255 - rmean) / 256) * d[..., 2] ** 2
    idx = dist.argmin(axis=1)
    out = palette[idx].reshape(a.shape[0], a.shape[1], 3)
    alpha = np.where(a[..., 3] >= 128, 255, 0)
    return Image.fromarray(np.dstack([out, alpha]).astype(np.uint8), "RGBA")


def palette_used(img: Image.Image) -> list[str]:
    a = np.asarray(img.convert("RGBA"))
    cols = {tuple(p[:3]) for p in a.reshape(-1, 4) if p[3] > 0}
    return sorted(rgb_to_hex(c) for c in cols)


def palette_strip(palette: np.ndarray) -> Image.Image:
    """1-pixel-per-colour image, the format providers accept as a palette reference."""
    return Image.fromarray(palette.reshape(1, -1, 3).astype(np.uint8), "RGB")


# ---------------------------------------------------------------- sizing and background


def fit(img: Image.Image, w: int, h: int) -> Image.Image:
    """Center-crop to the target aspect, then resize to the exact fixed size."""
    sw, sh = img.size
    target = w / h
    if abs(sw / sh - target) > 0.01:
        if sw / sh > target:
            nw = round(sh * target)
            img = img.crop(((sw - nw) // 2, 0, (sw - nw) // 2 + nw, sh))
        else:
            nh = round(sw / target)
            img = img.crop((0, (sh - nh) // 2, sw, (sh - nh) // 2 + nh))
    if img.size == (w, h):
        return img
    sw, sh = img.size
    if sw % w == 0 and sh % h == 0 and is_blocky(img, sw // w, sh // h):
        return img.resize((w, h), Image.Resampling.NEAREST)
    return img.resize((w, h), Image.Resampling.BOX)


def is_blocky(img: Image.Image, kx: int, ky: int) -> bool:
    """True if the image is already pixel art upscaled by an integer factor."""
    if kx < 2 or ky < 2:
        return False
    a = np.asarray(img.convert("RGB")).astype(np.int16)
    blocks = a.reshape(a.shape[0] // ky, ky, a.shape[1] // kx, kx, 3)
    spread = blocks.max(axis=(1, 3)) - blocks.min(axis=(1, 3))
    return float((spread.max(axis=-1) <= 24).mean()) > 0.9


def has_transparency(img: Image.Image) -> bool:
    return bool((np.asarray(img.convert("RGBA"))[..., 3] < 128).mean() > 0.02)


def remove_background(img: Image.Image, tolerance: int = 40) -> Image.Image:
    """Flood-fill the background from the border (for providers that return opaque images)."""
    img = img.convert("RGBA")
    small = img.copy()
    if max(small.size) > 256:
        small.thumbnail((256, 256), Image.Resampling.BOX)
    w, h = small.size
    probe = small.convert("RGB")
    marker = (255, 0, 255)
    border = [(x, 0) for x in range(0, w, max(1, w // 16))] + [(x, h - 1) for x in range(0, w, max(1, w // 16))]
    border += [(0, y) for y in range(0, h, max(1, h // 16))] + [(w - 1, y) for y in range(0, h, max(1, h // 16))]
    for xy in border:
        if probe.getpixel(xy) != marker:
            ImageDraw.floodfill(probe, xy, marker, thresh=tolerance)
    bg = np.all(np.asarray(probe) == marker, axis=-1)
    mask = Image.fromarray(np.where(bg, 0, 255).astype(np.uint8), "L").resize(img.size, Image.Resampling.NEAREST)
    out = np.asarray(img).copy()
    out[..., 3] = np.minimum(out[..., 3], np.asarray(mask))
    return Image.fromarray(out, "RGBA")


# ---------------------------------------------------------------- masks and hitboxes


def components(mask: np.ndarray) -> list[list[tuple[int, int]]]:
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    out = []
    for y in range(h):
        for x in range(w):
            if mask[y, x] and not seen[y, x]:
                comp = []
                q = deque([(y, x)])
                seen[y, x] = True
                while q:
                    cy, cx = q.popleft()
                    comp.append((cy, cx))
                    for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            q.append((ny, nx))
                out.append(comp)
    return out


def clean_mask(img: Image.Image, min_pixels: int) -> tuple[Image.Image, np.ndarray]:
    """Exact silhouette mask: opaque pixels minus specks smaller than min_pixels."""
    a = np.asarray(img).copy()
    mask = a[..., 3] > 0
    for comp in components(mask):
        if len(comp) < min_pixels:
            for y, x in comp:
                mask[y, x] = False
    a[..., 3] = np.where(mask, 255, 0)
    return Image.fromarray(a, "RGBA"), mask


def hitbox(mask: np.ndarray) -> dict | None:
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return None
    return {"x": int(xs.min()), "y": int(ys.min()), "w": int(xs.max() - xs.min() + 1), "h": int(ys.max() - ys.min() + 1)}


def mask_image(mask: np.ndarray) -> Image.Image:
    return Image.fromarray(np.where(mask, 255, 0).astype(np.uint8), "L")


# ---------------------------------------------------------------- tiles


def make_seamless(img: Image.Image) -> Image.Image:
    """Cross-fade a band at each edge with the opposite edge so the tile wraps without a seam."""
    a = np.asarray(img.convert("RGB")).astype(np.float64)
    h, w, _ = a.shape
    for axis, n in ((1, w), (0, h)):
        band = max(2, n // 8)
        src = a.copy()
        for i in range(band):
            weight = 0.5 * (1 - i / band)  # 0.5 at the edge, fading to 0 inside
            lo = np.take(src, i, axis=axis)
            hi = np.take(src, n - 1 - i, axis=axis)
            # Pixel i blends toward its wrap-around neighbour n-1-i and vice versa.
            idx_lo = [slice(None)] * 3
            idx_hi = [slice(None)] * 3
            idx_lo[axis] = i
            idx_hi[axis] = n - 1 - i
            a[tuple(idx_lo)] = lo * (1 - weight) + hi * weight
            a[tuple(idx_hi)] = hi * (1 - weight) + lo * weight
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGB").convert("RGBA")


def seam_ratio(img: Image.Image) -> float:
    """Colour step across the wrap-around seams relative to the average step inside the tile."""
    a = np.asarray(img.convert("RGB")).astype(np.float64)
    inner_x = np.abs(np.diff(a, axis=1)).mean()
    inner_y = np.abs(np.diff(a, axis=0)).mean()
    seam_x = np.abs(a[:, 0] - a[:, -1]).mean()
    seam_y = np.abs(a[0, :] - a[-1, :]).mean()
    inner = max((inner_x + inner_y) / 2, 1e-6)
    return float(max(seam_x, seam_y) / inner)


# ---------------------------------------------------------------- contrast and consistency


def luminance(rgb) -> float:
    c = np.asarray(rgb, dtype=np.float64) / 255
    c = np.where(c <= 0.03928, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return float(0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2])


def contrast(img: Image.Image, mask: np.ndarray, background: str) -> float:
    """WCAG-style contrast ratio between the sprite's outline pixels and the stage background."""
    a = np.asarray(img.convert("RGB"))
    edge = mask & ~(
        np.roll(mask, 1, 0) & np.roll(mask, -1, 0) & np.roll(mask, 1, 1) & np.roll(mask, -1, 1)
    )
    if not edge.any():
        return 1.0
    l1 = luminance(a[edge].mean(axis=0))
    l2 = luminance(hex_to_rgb(background))
    hi, lo = max(l1, l2), min(l1, l2)
    return float((hi + 0.05) / (lo + 0.05))


def color_hist(img: Image.Image, mask: np.ndarray, palette: np.ndarray) -> np.ndarray:
    a = np.asarray(img.convert("RGB"))[mask]
    hist = np.zeros(len(palette))
    if len(a) == 0:
        return hist
    for i, c in enumerate(palette):
        hist[i] = np.all(a == c, axis=-1).sum()
    return hist / hist.sum()


# ---------------------------------------------------------------- per-type pipelines


def check(name: str, ok: bool, value, limit) -> dict:
    return {"name": name, "pass": bool(ok), "value": round(float(value), 3) if isinstance(value, (int, float)) else value, "limit": limit}


def process(item: dict, raw: Image.Image, palette_cfg: dict, cfg: dict, silhouette: Image.Image | None = None) -> dict:
    """Returns {"image", "palette", "checks", "extras": {...}}. All checks must pass."""
    c = cfg["checks"]
    kind = item["type"]
    fw, fh = item["size"]
    cols, rows = item.get("grid", [1, 1]) if kind == "sheet" else (1, 1)
    w, h = fw * cols, fh * rows
    img = raw.convert("RGBA")
    if kind != "tile" and not has_transparency(img):
        img = remove_background(img)
    img = fit(img, w, h)
    if kind == "tile":
        bg = Image.new("RGBA", img.size, (0, 0, 0, 255))
        img = Image.alpha_composite(bg, img)

    if palette_cfg.get("mode") == "file":
        palette = np.array([hex_to_rgb(x) for x in palette_cfg["colors"]], dtype=np.int32)
    else:
        palette = auto_palette(img, palette_cfg.get("colors", 16))

    checks: list[dict] = []
    extras: dict = {}

    if kind == "tile":
        # Judge the provider's own edges: blending can hide any seam, so measure before it.
        ratio = seam_ratio(snap(img, palette))
        checks.append(check("original edges wrap seamlessly", ratio <= c["tileSeamRatio"], ratio, f"<= {c['tileSeamRatio']}"))
        img = snap(make_seamless(img), palette)
        n = len(palette_used(img))
        checks.append(check("enough detail (colours)", n >= c["tileMinColors"], n, f">= {c['tileMinColors']}"))
    else:
        img = snap(img, palette)
        img, mask = clean_mask(img, c["minComponentPixels"])
        background = item.get("background", "#2a2a2a")
        if kind == "sprite":
            frames = [(img, mask)]
        else:
            frames = []
            for r in range(rows):
                for col in range(cols):
                    box = (col * fw, r * fh, (col + 1) * fw, (r + 1) * fh)
                    fimg = img.crop(box)
                    frames.append((fimg, np.asarray(fimg)[..., 3] > 0))
        info = []
        for i, (fimg, fmask) in enumerate(frames):
            cov = float(fmask.mean())
            label = "" if kind == "sprite" else f"frame {i + 1}: "
            checks.append(check(f"{label}coverage", c["spriteMinCoverage"] <= cov <= c["spriteMaxCoverage"], cov, f"{c['spriteMinCoverage']}-{c['spriteMaxCoverage']}"))
            if fmask.any():
                ct = contrast(fimg, fmask, background)
                checks.append(check(f"{label}contrast vs {background}", ct >= c["contrastMin"], ct, f">= {c['contrastMin']}"))
            info.append({"hitbox": hitbox(fmask), "mask": fmask, "image": fimg})
        if kind == "sheet":
            areas = np.array([f["mask"].sum() for f in info], dtype=np.float64)
            heights = np.array([f["hitbox"]["h"] if f["hitbox"] else 0 for f in info], dtype=np.float64)
            hists = [color_hist(f["image"], f["mask"], palette) for f in info]
            med_a, med_h = np.median(areas), np.median(heights)
            med_hist = np.median(np.array(hists), axis=0)
            lo, hi = c["frameAreaRange"]
            hlo, hhi = c["frameHeightRange"]
            for i in range(len(info)):
                ra = areas[i] / med_a if med_a else 0
                rh = heights[i] / med_h if med_h else 0
                cd = float(np.abs(hists[i] - med_hist).sum())
                ok = lo <= ra <= hi and hlo <= rh <= hhi and cd <= c["frameColorDistanceMax"]
                checks.append(check(f"frame {i + 1}: consistent with others", ok, f"area x{ra:.2f}, height x{rh:.2f}, colour {cd:.2f}", "matches median frame"))
        if silhouette is not None:
            sil = np.asarray(silhouette.convert("L").resize(img.size, Image.Resampling.NEAREST)) > 127
            spill = float((mask & ~sil).sum() / max(1, mask.sum()))
            checks.append(check("stays inside silhouette", spill <= c["silhouetteSpillMax"], spill, f"<= {c['silhouetteSpillMax']}"))
        extras["mask"] = mask_image(mask)
        extras["hitboxes"] = [f["hitbox"] for f in info]
        if kind == "sheet":
            extras["frames"] = [f["image"] for f in info]

    return {"image": img, "palette": [rgb_to_hex(p) for p in palette], "checks": checks, "extras": extras}
