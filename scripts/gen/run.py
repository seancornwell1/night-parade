"""Asset generation run. Runs in GitHub Actions only (see .github/workflows/generate.yml).

For every request in generation/requests/, makes each missing candidate by walking the
provider chain from generation/config.json, post-processes and checks it, and writes it to
generation/candidates/<batch>/ with a manifest recording which provider made each file.
Candidates blocked only by free limits stay pending; the daily run resumes them.
"""

from __future__ import annotations

import datetime as dt
import json
import sys
import traceback
from pathlib import Path

from PIL import Image

from process import palette_strip, process, hex_to_rgb
from providers import LimitHit, ProviderError, Refused, make_providers

ROOT = Path(__file__).resolve().parents[2]
GEN = ROOT / "generation"
TYPES = ("tile", "sprite", "sheet")


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        return default


def save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n")


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class Usage:
    """Per-day provider usage, so daily caps and free-limit hits carry across runs."""

    def __init__(self, path: Path, caps: dict):
        self.path = path
        self.caps = caps
        today = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")
        data = load_json(path, {})
        if data.get("date") != today:
            data = {"date": today, "counts": {}, "limited": {}}
        self.data = data
        self.dirty = False

    def available(self, name: str) -> str | None:
        if name in self.data["limited"]:
            return f"free limit reached today ({self.data['limited'][name]})"
        if self.data["counts"].get(name, 0) >= self.caps.get(name, 10**9):
            return f"daily cap of {self.caps[name]} reached"
        return None

    def count(self, name: str) -> None:
        self.data["counts"][name] = self.data["counts"].get(name, 0) + 1
        self.dirty = True

    def limit(self, name: str, why: str) -> None:
        self.data["limited"][name] = why[:200]
        self.dirty = True

    def save(self) -> None:
        if self.dirty:
            save_json(self.path, self.data)


def validate(req: dict, path: Path) -> None:
    def need(ok, msg):
        if not ok:
            raise ValueError(f"{path.name}: {msg}")

    need(isinstance(req.get("batch"), str) and req["batch"].replace("-", "").replace("_", "").isalnum(), "batch must be letters, digits, - or _")
    need(isinstance(req.get("items"), list) and req["items"], "items must be a non-empty list")
    for it in req["items"]:
        need(it.get("type") in TYPES, f"item {it.get('id')}: type must be one of {TYPES}")
        need(isinstance(it.get("id"), str) and it["id"], "every item needs an id")
        need(isinstance(it.get("prompt"), str) and it["prompt"], f"item {it['id']}: needs a prompt")
        size = it.get("size")
        need(isinstance(size, list) and len(size) == 2 and all(isinstance(v, int) and 8 <= v <= 512 for v in size), f"item {it['id']}: size must be [w, h], 8-512")
        if it["type"] == "sheet":
            need(isinstance(it.get("grid"), list) and len(it["grid"]) == 2, f"item {it['id']}: sheets need grid [cols, rows]")


def resolve_palette(req: dict) -> dict:
    p = req.get("palette", {"mode": "auto", "colors": 16})
    if p.get("mode") == "file":
        colors = load_json(GEN / "palettes" / f"{p['name']}.json", None)
        if not colors:
            raise ValueError(f"palette file generation/palettes/{p['name']}.json is missing")
        return {"mode": "file", "name": p["name"], "colors": colors["colors"] if isinstance(colors, dict) else colors}
    return {"mode": "auto", "colors": int(p.get("colors", 16))}


def make_candidate(item, number, palette_cfg, cfg, providers, usage, log) -> dict:
    """Walk the provider chain for one candidate. Returns a manifest entry."""
    entry = {"number": number, "id": item["id"], "type": item["type"], "prompt": item["prompt"], "size": item["size"], "attempts": []}
    if item["type"] == "sheet":
        entry["grid"] = item["grid"]
    palette_img = None
    if palette_cfg["mode"] == "file":
        import numpy as np

        palette_img = palette_strip(np.array([hex_to_rgb(c) for c in palette_cfg["colors"]]))
    silhouette = None
    if item.get("silhouette"):
        silhouette = Image.open(ROOT / item["silhouette"])
    fw, fh = item["size"]
    cols, rows = item.get("grid", [1, 1]) if item["type"] == "sheet" else (1, 1)
    gen_size = (fw * cols, fh * rows)

    waiting = False
    order = item.get("providers") or cfg["providers"][item["type"]]
    for name in order:
        p = providers.get(name)
        if p is None:
            entry["attempts"].append({"provider": name, "outcome": "unknown provider"})
            continue
        if not p.configured():
            entry["attempts"].append({"provider": name, "outcome": "skipped: no API key secret"})
            waiting = True
            continue
        why = usage.available(name)
        if why:
            entry["attempts"].append({"provider": name, "outcome": f"skipped: {why}"})
            waiting = True
            continue
        errors = 0
        for attempt in range(1, cfg["attemptsPerProvider"] + 1):
            why = usage.available(name)
            if why:
                entry["attempts"].append({"provider": name, "outcome": f"skipped: {why}"})
                waiting = True
                break
            try:
                raw = p.generate(item, gen_size, palette_img)
            except LimitHit as e:
                usage.limit(name, str(e))
                entry["attempts"].append({"provider": name, "outcome": f"free limit hit: {e}"})
                log(f"  {name}: free limit hit, moving on ({e})")
                waiting = True
                break
            except Refused as e:
                entry["attempts"].append({"provider": name, "outcome": f"refused: {e}"})
                log(f"  {name}: refused, moving on ({e})")
                break
            except ProviderError as e:
                errors += 1
                entry["attempts"].append({"provider": name, "outcome": f"error: {e}"})
                log(f"  {name}: error ({e})")
                if errors >= 2:
                    break
                continue
            except Exception as e:  # noqa: BLE001 - any provider bug must not stop the batch
                entry["attempts"].append({"provider": name, "outcome": f"error: {e!r}"})
                log(f"  {name}: unexpected error {e!r}")
                break
            usage.count(name)
            result = process(item, raw, palette_cfg, cfg, silhouette)
            failed = [c for c in result["checks"] if not c["pass"]]
            entry["attempts"].append(
                {"provider": name, "outcome": "ok" if not failed else "checks failed: " + "; ".join(f"{c['name']} = {c['value']}" for c in failed)}
            )
            if not failed:
                log(f"  {name}: ok on attempt {attempt}")
                return {**entry, "status": "ok", "provider": name, "made": now(), "raw": raw, "result": result}
            log(f"  {name}: checks failed ({len(failed)}), attempt {attempt}")
            entry["lastChecks"] = result["checks"]
        # next provider
    entry["status"] = "pending" if waiting else "failed"
    entry["reason"] = (
        "Waiting: providers are out of free generations or have no API key yet. The daily run will retry."
        if waiting
        else "Every provider failed or refused. Change the prompt and re-request."
    )
    return entry


def save_candidate(batch_dir: Path, e: dict) -> dict:
    """Write files for a finished candidate and return its manifest entry."""
    stem = f"{e['number']:02d}-{e['id']}"
    raw, result = e.pop("raw"), e.pop("result")
    files = {"image": f"{stem}.png", "raw": f"{stem}.raw.png"}
    result["image"].save(batch_dir / files["image"])
    raw_small = raw.copy()
    raw_small.thumbnail((512, 512))
    raw_small.save(batch_dir / files["raw"])
    ex = result["extras"]
    if "mask" in ex:
        files["mask"] = f"{stem}.mask.png"
        ex["mask"].save(batch_dir / files["mask"])
    if "frames" in ex:
        files["frames"] = []
        for i, f in enumerate(ex["frames"]):
            name = f"{stem}.frame{i + 1:02d}.png"
            f.save(batch_dir / name)
            files["frames"].append(name)
    e.update({"files": files, "palette": result["palette"], "checks": result["checks"], "hitboxes": ex.get("hitboxes")})
    e.pop("lastChecks", None)
    return e


def run() -> int:
    cfg = load_json(GEN / "config.json", None)
    providers = make_providers(cfg)
    usage = Usage(GEN / "usage.json", cfg.get("dailyCaps", {}))
    configured = [n for n, p in providers.items() if p.configured()]
    print(f"Providers with keys: {', '.join(configured) or 'none'}")
    changed = False

    for path in sorted((GEN / "requests").glob("*.json")):
        req = json.loads(path.read_text())
        try:
            validate(req, path)
            palette_cfg = resolve_palette(req)
        except ValueError as e:
            print(f"Skipping {path.name}: {e}")
            continue
        batch_dir = GEN / "candidates" / req["batch"]
        batch_dir.mkdir(parents=True, exist_ok=True)
        manifest_path = batch_dir / "manifest.json"
        manifest = load_json(manifest_path, {"batch": req["batch"], "request": f"generation/requests/{path.name}", "created": now(), "candidates": []})
        manifest["note"] = req.get("note", "")
        manifest["palette"] = palette_cfg
        by_number = {c["number"]: c for c in manifest["candidates"]}
        lines: list[str] = []
        number = 0
        for item in req["items"]:
            for _ in range(int(item.get("candidates", 1))):
                number += 1
                prev = by_number.get(number)
                if prev and prev.get("status") in ("ok", "failed") and prev.get("id") == item["id"]:
                    continue
                item_lines: list[str] = [f"[{req['batch']}] #{number} {item['id']} ({item['type']})"]
                print(item_lines[0])
                try:
                    e = make_candidate(item, number, palette_cfg, cfg, providers, usage, lambda m: (print(m), item_lines.append(m)))
                except Exception:  # noqa: BLE001
                    item_lines.append(traceback.format_exc())
                    print(item_lines[-1])
                    e = {"number": number, "id": item["id"], "type": item["type"], "status": "failed", "reason": "pipeline error, see log", "attempts": []}
                tried = any(not a["outcome"].startswith("skipped") for a in e.get("attempts", []))
                if prev and e["status"] == "pending" and not tried:
                    continue  # still waiting and nothing was attempted: no change to record
                lines.extend(item_lines)
                if e["status"] == "ok":
                    e = save_candidate(batch_dir, e)
                by_number[number] = e
                changed = True

        if not lines and manifest_path.exists():
            continue
        manifest["candidates"] = [by_number[k] for k in sorted(by_number)]
        manifest["updated"] = now()
        counts = {}
        for c in manifest["candidates"]:
            counts[c["status"]] = counts.get(c["status"], 0) + 1
        manifest["counts"] = counts
        save_json(manifest_path, manifest)
        if lines:
            with open(batch_dir / "log.txt", "a") as f:
                f.write(f"--- run {now()}\n" + "\n".join(lines) + "\n")

    usage.save()
    print("Changes written." if changed else "Nothing to do.")
    return 0


def reprocess(batch: str) -> int:
    """Re-run post-processing on a batch's saved provider originals (no provider calls).
    Candidates that now fail a check go back to pending so the next run regenerates them."""
    cfg = load_json(GEN / "config.json", None)
    batch_dir = GEN / "candidates" / batch
    manifest = load_json(batch_dir / "manifest.json", None)
    req_path = next(p for p in (GEN / "requests").glob("*.json") if json.loads(p.read_text()).get("batch") == batch)
    req = json.loads(req_path.read_text())
    manifest["request"] = f"generation/requests/{req_path.name}"
    items = {i["id"]: i for i in req["items"]}
    palette_cfg = resolve_palette(req)
    out = []
    for c in manifest["candidates"]:
        if c.get("status") != "ok":
            out.append(c)
            continue
        raw = Image.open(batch_dir / c["files"]["raw"]).convert("RGBA")
        for f in [c["files"]["image"], c["files"].get("mask"), *c["files"].get("frames", [])]:
            if f:
                (batch_dir / f).unlink(missing_ok=True)
        result = process(items[c["id"]], raw, palette_cfg, cfg)
        failed = [k for k in result["checks"] if not k["pass"]]
        if failed:
            (batch_dir / c["files"]["raw"]).unlink(missing_ok=True)
            note = "reprocessed, checks failed: " + "; ".join(f"{k['name']} = {k['value']}" for k in failed)
            out.append({k: c[k] for k in ("number", "id", "type", "prompt", "size", "attempts")} | {
                "status": "pending", "reason": "Failed a check after reprocessing; the next run regenerates it.",
                "attempts": c["attempts"] + [{"provider": c["provider"], "outcome": note}]})
            print(f"#{c['number']} {c['id']}: {note}")
            continue
        e = {**c, "raw": raw, "result": result}
        e = save_candidate(batch_dir, e)
        out.append(e)
        print(f"#{c['number']} {c['id']}: reprocessed")
    manifest["candidates"] = out
    manifest["updated"] = now()
    counts = {}
    for c in out:
        counts[c["status"]] = counts.get(c["status"], 0) + 1
    manifest["counts"] = counts
    save_json(batch_dir / "manifest.json", manifest)
    with open(batch_dir / "log.txt", "a") as f:
        f.write(f"--- reprocessed {now()} (post-processing only, no provider calls)\n")
    return 0


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--reprocess":
        sys.exit(reprocess(sys.argv[2]))
    sys.exit(run())
