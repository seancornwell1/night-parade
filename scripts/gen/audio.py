"""Audio providers (ElevenLabs, Stability) and audio post-processing.

Nothing here synthesizes sound: providers generate it, and ffmpeg only trims, normalises,
fades, loops and re-encodes their output.
"""

from __future__ import annotations

import os
import re
import subprocess
import tempfile
from pathlib import Path

import requests

from providers import ProviderError, Provider, classify

TIMEOUT = 300


def _post(url: str, **kw) -> requests.Response:
    try:
        r = requests.post(url, timeout=TIMEOUT, **kw)
    except requests.RequestException as e:
        raise ProviderError(f"network: {e}") from e
    if r.status_code >= 400:
        raise classify(r.status_code, r.text)
    if not r.headers.get("content-type", "").startswith(("audio", "application/octet-stream")):
        raise ProviderError(f"expected audio, got {r.headers.get('content-type')}: {r.text[:200]}")
    return r


class ElevenLabs(Provider):
    """ElevenLabs sound effects and music (xi-api-key)."""

    name = "elevenlabs"

    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.key = os.environ.get("ELEVENLABS_API_KEY", "")

    def configured(self) -> bool:
        return bool(self.key)

    def generate(self, item, size, palette_img):
        headers = {"xi-api-key": self.key}
        if item["type"] == "music":
            body = {"prompt": item["prompt"], "music_length_ms": int(item["duration"] * 1000)}
            r = _post("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", headers=headers, json=body)
        else:
            body = {"text": item["prompt"], "duration_seconds": item["duration"], "prompt_influence": item.get("promptInfluence", 0.6)}
            r = _post("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128", headers=headers, json=body)
        self.last_cost = None
        return r.content


class Stability(Provider):
    """Stability AI Stable Audio (Bearer token, multipart form)."""

    name = "stability"

    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.key = os.environ.get("STABILITY_API_KEY", "")

    def configured(self) -> bool:
        return bool(self.key)

    def generate(self, item, size, palette_img):
        data = {
            "prompt": item["prompt"],
            "duration": str(item["duration"]),
            "model": self.cfg.get("model", "stable-audio-2.5"),
            "output_format": "mp3",
        }
        r = _post(
            "https://api.stability.ai/v2beta/audio/stable-audio-2/text-to-audio",
            headers={"Authorization": f"Bearer {self.key}", "Accept": "audio/*"},
            files={"none": ""},
            data=data,
        )
        self.last_cost = None
        return r.content


# ---------------------------------------------------------------- post-processing


def _ffmpeg(*args: str) -> str:
    p = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-y", *args], capture_output=True, text=True)
    if p.returncode != 0:
        raise ProviderError(f"ffmpeg failed: {p.stderr[-400:]}")
    return p.stderr


def _duration(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)], capture_output=True, text=True)
    try:
        return float(out.stdout.strip())
    except ValueError:
        return 0.0


def _stats(path: Path) -> dict:
    err = _ffmpeg("-i", str(path), "-af", "volumedetect,silencedetect=n=-45dB:d=0.3", "-f", "null", "-")
    mean = re.search(r"mean_volume: (-?[\d.]+) dB", err)
    peak = re.search(r"max_volume: (-?[\d.]+) dB", err)
    silent = sum(float(x) for x in re.findall(r"silence_duration: ([\d.]+)", err))
    return {"mean": float(mean.group(1)) if mean else -99.0, "peak": float(peak.group(1)) if peak else 0.0, "silent": silent}


def check(name: str, ok: bool, value, limit) -> dict:
    return {"name": name, "pass": bool(ok), "value": round(float(value), 2) if isinstance(value, (int, float)) else value, "limit": limit}


def process_audio(item: dict, data: bytes, cfg: dict) -> dict:
    """Trim, normalise and encode; music is cut into a seamless loop. Returns {"audio": bytes, "checks": [...]}."""
    c = cfg.get("audioChecks", {})
    music = item["type"] == "music"
    with tempfile.TemporaryDirectory() as tmp:
        raw = Path(tmp) / "raw.mp3"
        raw.write_bytes(data)
        out = Path(tmp) / "out.mp3"
        trim = "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse"
        if music:
            dur = _duration(raw)
            xf = min(2.0, dur / 4)
            # Seamless loop: cross-fade the last xf seconds into the opening xf seconds, so the end flows into the start.
            norm = Path(tmp) / "norm.wav"
            _ffmpeg("-i", str(raw), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100", "-ac", "2", str(norm))
            graph = (
                f"[0:a]atrim=start={xf},asetpts=PTS-STARTPTS[body];"
                f"[1:a]atrim=end={xf},asetpts=PTS-STARTPTS[head];"
                f"[body][head]acrossfade=d={xf}:c1=tri:c2=tri[out]"
            )
            _ffmpeg("-i", str(norm), "-i", str(norm), "-filter_complex", graph, "-map", "[out]", "-b:a", "160k", str(out))
        else:
            _ffmpeg("-i", str(raw), "-af", f"{trim},loudnorm=I=-14:TP=-1.0:LRA=7,afade=t=in:d=0.004", "-ar", "44100", "-ac", "1", "-b:a", "128k", str(out))
        dur = _duration(out) if out.exists() and out.stat().st_size > 1000 else 0.0
        try:
            st = _stats(out) if dur > 0 else {"mean": -99.0, "peak": -99.0, "silent": 0.0}
        except ProviderError:
            st = {"mean": -99.0, "peak": -99.0, "silent": 0.0}
        lo, hi = item.get("durationRange") or ([c.get("musicMin", 20), c.get("musicMax", 240)] if music else [c.get("sfxMin", 0.08), c.get("sfxMax", 4)])
        checks = [
            check("length", lo <= dur <= hi, dur, f"{lo}-{hi} s"),
            check("not silent", st["mean"] > c.get("minMeanDb", -38), st["mean"], f"> {c.get('minMeanDb', -38)} dB mean"),
            check("no clipping", st["peak"] <= c.get("maxPeakDb", -0.3), st["peak"], f"<= {c.get('maxPeakDb', -0.3)} dB peak"),
            check("no long silences", st["silent"] / max(dur, 0.01) <= c.get("maxSilentFraction", 0.25), st["silent"] / max(dur, 0.01), f"<= {c.get('maxSilentFraction', 0.25)} of the clip"),
        ]
        return {"audio": out.read_bytes(), "raw": data, "checks": checks, "duration": dur}


def make_audio_providers(cfg: dict) -> dict[str, Provider]:
    return {"elevenlabs": ElevenLabs(cfg.get("elevenlabs", {})), "stability": Stability(cfg.get("stability", {}))}
