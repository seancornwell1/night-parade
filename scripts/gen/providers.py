"""Image providers, tried in the order set in generation/config.json.

Each provider raises one of the errors below so the chain knows what to do next.
Keys come from environment variables (GitHub Actions secrets), never from files.
"""

from __future__ import annotations

import base64
import io
import os
import time
import uuid

import requests
from PIL import Image

TIMEOUT = 120


class LimitHit(Exception):
    """Free limit, quota or balance reached: skip this provider until tomorrow."""


class Refused(Exception):
    """Content filter or policy refusal: try the next provider."""


class ProviderError(Exception):
    """Anything else (bad request, server error, timeout)."""


LIMIT_WORDS = ("limit", "quota", "balance", "credit", "insufficient", "allocation", "neurons", "payment", "exceeded")
REFUSE_WORDS = ("nsfw", "safety", "content policy", "moderation", "filter", "inappropriate", "flagged", "refus")


def classify(status: int, text: str) -> Exception:
    low = text.lower()
    if status in (402, 429) or (status in (400, 403) and any(w in low for w in LIMIT_WORDS)):
        return LimitHit(f"HTTP {status}: {text[:300]}")
    if any(w in low for w in REFUSE_WORDS):
        return Refused(f"HTTP {status}: {text[:300]}")
    return ProviderError(f"HTTP {status}: {text[:300]}")


def post(url: str, **kw) -> requests.Response:
    try:
        r = requests.post(url, timeout=TIMEOUT, **kw)
    except requests.RequestException as e:
        raise ProviderError(f"network: {e}") from e
    if r.status_code >= 400:
        raise classify(r.status_code, r.text)
    return r


def b64_image(data: str) -> Image.Image:
    return Image.open(io.BytesIO(base64.b64decode(data))).convert("RGBA")


class Provider:
    name = "base"

    def configured(self) -> bool:
        raise NotImplementedError

    def generate(self, item: dict, size: tuple[int, int], palette_img: Image.Image | None) -> Image.Image:
        raise NotImplementedError


class PixelLab(Provider):
    """PixelLab PixFlux: https://api.pixellab.ai/v1 (Bearer token)."""

    name = "pixellab"

    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.key = os.environ.get("PIXELLAB_API_KEY", "")

    def configured(self) -> bool:
        return bool(self.key)

    def generate(self, item, size, palette_img):
        w, h = size
        scale = 1
        while min(w, h) * scale < self.cfg.get("minSize", 32):
            scale += 1
        w, h = min(w * scale, self.cfg.get("maxSize", 400)), min(h * scale, self.cfg.get("maxSize", 400))
        body = {
            "description": item["prompt"],
            "image_size": {"width": w, "height": h},
            "negative_description": "text, watermark, border, frame, blurry",
            "view": self.cfg.get("view", "high top-down"),
            "no_background": item["type"] != "tile",
            "seed": int(time.time() * 1000) % 2_000_000_000,
        }
        if palette_img is not None:
            body["color_image"] = {"type": "base64", "base64": png_b64(palette_img.convert("RGB")), "format": "png"}
        r = post("https://api.pixellab.ai/v1/generate-image-pixflux", headers={"Authorization": f"Bearer {self.key}"}, json=body)
        data = r.json()
        try:
            return b64_image(data["image"]["base64"])
        except (KeyError, TypeError) as e:
            raise ProviderError(f"unexpected response: {str(data)[:300]}") from e


class RetroDiffusion(Provider):
    """Retro Diffusion v2: https://api.retrodiffusion.ai/v2 (X-RD-Token). Async: submit then poll."""

    name = "retrodiffusion"
    base = "https://api.retrodiffusion.ai/v2"

    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.key = os.environ.get("RETRO_DIFFUSION_API_KEY", "")

    def configured(self) -> bool:
        return bool(self.key)

    def generate(self, item, size, palette_img):
        w, h = size
        body = {
            "prompt": item["prompt"],
            "prompt_style": self.cfg["styles"][item["type"]],
            "width": w,
            "height": h,
            "num_images": 1,
        }
        if item["type"] == "tile":
            if self.cfg.get("tileSeamless", True):
                body["tile_x"] = body["tile_y"] = True
        else:
            body["remove_bg"] = True
        if palette_img is not None:
            body["input_palette"] = png_b64(palette_img.convert("RGB"))
        headers = {"X-RD-Token": self.key}
        # Free dry run first: never spend more than the free balance.
        cost = post(f"{self.base}/inferences", headers=headers, json={**body, "check_cost": True}).json()
        cost = cost.get("result", cost)
        if cost.get("remaining_balance") is not None and cost.get("balance_cost", 0) > cost["remaining_balance"]:
            raise LimitHit(f"cost {cost.get('balance_cost')} exceeds remaining balance {cost['remaining_balance']}")
        task = post(f"{self.base}/inferences", headers={**headers, "Idempotency-Key": str(uuid.uuid4())}, json=body).json()
        if "base64_images" in task:
            result = task
        else:
            task_id = task.get("task_id")
            if not task_id:
                raise ProviderError(f"no task id: {str(task)[:300]}")
            result = self.poll(task_id, headers)
        images = result.get("base64_images") or []
        if not images:
            raise ProviderError(f"no images: {str(result)[:300]}")
        return b64_image(images[0])

    def poll(self, task_id: str, headers: dict) -> dict:
        deadline = time.time() + 300
        while time.time() < deadline:
            time.sleep(3)
            try:
                r = requests.get(f"{self.base}/inferences/tasks/{task_id}", headers=headers, timeout=TIMEOUT)
            except requests.RequestException as e:
                raise ProviderError(f"network: {e}") from e
            if r.status_code >= 400:
                raise classify(r.status_code, r.text)
            data = r.json()
            status = data.get("status")
            if status == "succeeded":
                return data.get("result", data)
            if status == "failed":
                err = str(data.get("error", data))
                raise classify(400, err)
        raise ProviderError("timed out waiting for task")


class Cloudflare(Provider):
    """Cloudflare Workers AI REST API, FLUX.1 schnell. Free plan hard-stops at the daily allocation."""

    name = "cloudflare"

    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.account = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
        self.token = os.environ.get("CLOUDFLARE_API_TOKEN", "")

    def configured(self) -> bool:
        return bool(self.account and self.token)

    def generate(self, item, size, palette_img):
        prompt = f"{item['prompt']}. {self.cfg.get('styleSuffix', '')}"
        if item["type"] == "tile":
            prompt += ", seamless tileable texture filling the whole image, top-down"
        else:
            prompt += ", single subject centered on a plain flat solid background"
        url = f"https://api.cloudflare.com/client/v4/accounts/{self.account}/ai/run/{self.cfg['model']}"
        r = post(url, headers={"Authorization": f"Bearer {self.token}"}, json={"prompt": prompt[:2000], "steps": self.cfg.get("steps", 4)})
        data = r.json()
        if not data.get("success", True):
            raise classify(400, str(data.get("errors")))
        try:
            return b64_image(data["result"]["image"])
        except (KeyError, TypeError) as e:
            raise ProviderError(f"unexpected response: {str(data)[:300]}") from e


def png_b64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def make_providers(cfg: dict) -> dict[str, Provider]:
    return {
        "pixellab": PixelLab(cfg.get("pixellab", {})),
        "retrodiffusion": RetroDiffusion(cfg.get("retrodiffusion", {})),
        "cloudflare": Cloudflare(cfg.get("cloudflare", {})),
    }
