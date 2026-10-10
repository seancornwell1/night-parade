"""Bring a user-provided image or sound into the game.

Usage:
  python scripts/gen/import_asset.py <file> <kind> <name> [--size WxH] [--keep-colours] [--tile]
  python scripts/gen/import_asset.py <file.mp3|wav|m4a> audio <name> [--music]
  python scripts/gen/import_asset.py <file> audio <name> --loop START:END

Images are cleaned up like generated ones: background removed (unless --tile), cropped to the
subject, resized to the fixed size, and snapped to the locked day palette (unless
--keep-colours). They land in assets/templates/<kind>/ (as given, resized) and assets/day/<kind>/
(game-ready), and are listed in templates.json and day.json with provider "user".
Sounds are trimmed and loudness-levelled (music is cut into a seamless loop) into
assets/day/audio/. With --loop, a whole track is kept as it is (levelled only): the game plays
it from the start once, then repeats START..END (seconds) forever, so the intro is heard once
and the outro never. Pick START and END on bar lines.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path

import numpy as np
from PIL import Image

from audio import _duration, _ffmpeg, process_audio
from process import clean_mask, crop_to_subject, fit, has_transparency, hex_to_rgb, hitbox, make_seamless, remove_background, snap

ROOT = Path(__file__).resolve().parents[2]

# Default fixed sizes (docs/ART.md) when --size isn't given.
DEFAULT_SIZES = {"characters": (48, 48), "weapons": (48, 48), "shikigami": (24, 24), "tiles": (32, 32), "fx": (16, 16), "ui": (48, 48)}


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load(path: Path, default):
    return json.loads(path.read_text()) if path.exists() else default


def import_image(src: Path, kind: str, name: str, size: tuple[int, int] | None, keep_colours: bool, tile: bool) -> None:
    img = Image.open(src).convert("RGBA")
    w, h = size or DEFAULT_SIZES.get(kind) or img.size
    if tile:
        out = fit(img, w, h)
        out = Image.alpha_composite(Image.new("RGBA", out.size, (0, 0, 0, 255)), out)
        out = make_seamless(out)
    else:
        if not has_transparency(img):
            img = remove_background(img)
        out = fit(crop_to_subject(img, w, h), w, h)
    template = out
    if not keep_colours:
        pal = json.loads((ROOT / "generation/palettes/day.json").read_text())
        out = snap(out, np.array([hex_to_rgb(c) for c in pal["colors"]]))
    entry = {"id": name, "kind": kind, "file": f"{kind}/{name}.png", "size": [w, h], "provider": "user", "from": src.name, "made": now()}
    for base, image in ((ROOT / "assets/templates", template), (ROOT / "assets/day", out)):
        dest = base / kind / f"{name}.png"
        dest.parent.mkdir(parents=True, exist_ok=True)
        image.save(dest)
    if not tile:
        cleaned, mask = clean_mask(out, 4)
        cleaned.save(ROOT / "assets/day" / kind / f"{name}.png")
        Image.fromarray(np.where(mask, 255, 0).astype(np.uint8), "L").save(ROOT / "assets/day" / kind / f"{name}.mask.png")
        entry["mask"] = f"{kind}/{name}.mask.png"
        entry["hitbox"] = hitbox(mask)
    for manifest_path, key in ((ROOT / "assets/templates/templates.json", "templates"), (ROOT / "assets/day/day.json", "assets")):
        m = load(manifest_path, {key: []})
        m[key] = [e for e in m[key] if e.get("file") != entry["file"]] + [entry]
        manifest_path.write_text(json.dumps(m, indent=2) + "\n")
    print(f"{src.name} -> assets/day/{entry['file']} ({w}x{h}{', original colours' if keep_colours else ', day palette'})")


def import_track(src: Path, name: str, loop: tuple[float, float]) -> None:
    dest = ROOT / "assets/day/audio" / f"{name}.mp3"
    dest.parent.mkdir(parents=True, exist_ok=True)
    _ffmpeg("-i", str(src), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.89:attack=1:release=30:level=disabled",
            "-ar", "44100", "-ac", "2", "-b:a", "160k", str(dest))
    length = _duration(dest)
    assert 0 <= loop[0] < loop[1] <= length, f"loop {loop} outside 0..{length:.2f}s"
    day = load(ROOT / "assets/day/day.json", {"assets": []})
    day.setdefault("audio", [])
    day["audio"] = [a for a in day["audio"] if a["id"] != name] + [
        {"id": name, "file": f"audio/{name}.mp3", "provider": "user", "from": src.name, "length": round(length, 2), "loop": [loop[0], loop[1]]}
    ]
    (ROOT / "assets/day/day.json").write_text(json.dumps(day, indent=2) + "\n")
    print(f"{src.name} -> assets/day/audio/{name}.mp3 ({length:.1f}s, loops {loop[0]:.3f}-{loop[1]:.3f}s)")


def import_audio(src: Path, name: str, music: bool) -> None:
    cfg = json.loads((ROOT / "generation/config.json").read_text())
    item = {"id": name, "type": "music" if music else "sfx", "duration": 0, "durationRange": [0.05, 600]}
    result = process_audio(item, src.read_bytes(), cfg)
    dest = ROOT / "assets/day/audio" / f"{name}.mp3"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(result["audio"])
    day = load(ROOT / "assets/day/day.json", {"assets": []})
    day.setdefault("audio", [])
    day["audio"] = [a for a in day["audio"] if a["id"] != name] + [
        {"id": name, "file": f"audio/{name}.mp3", "provider": "user", "from": src.name, "length": round(result["duration"], 2)}
    ]
    (ROOT / "assets/day/day.json").write_text(json.dumps(day, indent=2) + "\n")
    print(f"{src.name} -> assets/day/audio/{name}.mp3 ({result['duration']:.1f}s)", [f"{c['name']}: {'ok' if c['pass'] else c['value']}" for c in result["checks"]])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("file", type=Path)
    ap.add_argument("kind")
    ap.add_argument("name")
    ap.add_argument("--size")
    ap.add_argument("--keep-colours", action="store_true")
    ap.add_argument("--tile", action="store_true")
    ap.add_argument("--music", action="store_true")
    ap.add_argument("--loop")
    a = ap.parse_args()
    if a.kind == "audio" and a.loop:
        start, end = (float(v) for v in a.loop.split(":"))
        import_track(a.file, a.name, (start, end))
    elif a.kind == "audio":
        import_audio(a.file, a.name, a.music)
    else:
        size = tuple(int(v) for v in a.size.split("x")) if a.size else None
        import_image(a.file, a.kind, a.name, size, a.keep_colours, a.tile or a.kind == "tiles")
