# Asset generation pipeline

Generation runs only in GitHub Actions (`.github/workflows/generate.yml`), never in a
Claude session. API keys are repository secrets, read from environment variables.

## Secrets

Add these under GitHub → repo **Settings → Secrets and variables → Actions → New repository secret**.
A provider without its secret is skipped.

| Secret | Provider |
|---|---|
| `PIXELLAB_API_KEY` | PixelLab API token |
| `RETRO_DIFFUSION_API_KEY` | Retro Diffusion API key |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID (Workers AI) |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with **Workers AI** permission |

## Starting a run

Commit a request file to `generation/requests/<name>.json`. That push starts a run. A daily
run (07:17 UTC) also resumes anything still waiting. Results are committed to
`generation/candidates/<batch>/` and published at
https://seancornwell1.github.io/night-parade/review/

### Request format

```json
{
  "batch": "day-tiles-001",
  "note": "What this batch is for",
  "palette": { "mode": "auto", "colors": 16 },
  "items": [
    { "id": "grass", "type": "tile", "size": [32, 32], "prompt": "...", "candidates": 3 }
  ]
}
```

| Field | Meaning |
|---|---|
| `batch` | Output folder name: letters, digits, `-`, `_` |
| `note` | Shown on the review page |
| `palette` | `{"mode": "auto", "colors": 16}` builds a 16-colour palette per image (phase 1, before the day palette exists). `{"mode": "file", "name": "day"}` locks to `generation/palettes/day.json` (`{"colors": ["#rrggbb", ...]}`) |
| `items[].id` | Name of the asset |
| `items[].type` | `tile` (opaque, seamless), `sprite` (transparent, mask + hitbox), `sheet` (sprite sheet on a fixed grid) |
| `items[].size` | `[w, h]` in pixels; for sheets, the size of **one frame** |
| `items[].grid` | Sheets only: `[cols, rows]` |
| `items[].prompt` | What to generate |
| `items[].candidates` | How many to make (default 1) |
| `items[].background` | Sprites and sheets: stage colour for the contrast check (default `#2a2a2a`) |
| `items[].silhouette` | Optional path to a mask PNG; the art must stay inside it |
| `items[].providers` | Optional override of the provider order |
| `items[].direction` | PixelLab: which way the subject faces (`south-east`, `south`, …) |
| `items[].rdStyle` | Retro Diffusion: style id overriding the default for the type (e.g. `rd_tile__tile_object`) |

## Provider chain

`generation/config.json` holds the agreed order per asset type, daily caps and check limits:

- Tiles: Retro Diffusion → PixelLab → Cloudflare
- Sprites and sheets: PixelLab → Retro Diffusion → Cloudflare

Each provider gets up to `attemptsPerProvider` tries. The chain moves on after a refusal,
an error (twice), a free-limit hit, or repeated check failures. A free-limit hit (HTTP 402/429
or a quota/balance message) marks that provider used up for the rest of the UTC day, recorded in
`generation/usage.json`. Retro Diffusion runs a free cost check first and never spends past
its balance. Daily caps keep every provider inside its free allowance.

A candidate that couldn't be made only because providers are out of free generations (or have
no key yet) stays **waiting** and is retried by the next run. One that every provider failed
is **failed**. Every attempt and the provider that made each file are in the batch's
`manifest.json` and `log.txt`.

## Post-processing and checks

All candidates: center-crop to the target aspect, resize to the fixed size (nearest-neighbour
when the source is already blocky pixel art, area-averaged otherwise), then snap every pixel
to the palette (alpha becomes fully on or off).

| Type | Processing | Checks |
|---|---|---|
| tile | Opaque; small edge mismatches cross-faded with the opposite edge so it wraps cleanly | the provider's **original** edges must already wrap: colour step across the wrap seam vs the interior ≤ `tileSeamRatio` (a truly seamless texture scores about 1.0); at least `tileMinColors` colours |
| sprite | Background flood-filled away if the provider returned an opaque image; specks removed; exact mask PNG; hitbox = mask bounds | coverage in range; outline contrast vs stage background ≥ `contrastMin`; inside silhouette if given |
| sheet | As sprite, then sliced on the fixed grid into frames with per-frame hitboxes | per-frame coverage and contrast; each frame's area, height and colour use within range of the median frame (drifting frames fail) |

A candidate is accepted only if every check passes; otherwise the attempt counts as a check
failure.

## Outputs

`generation/candidates/<batch>/`:

- `manifest.json`: every candidate with number, status, provider, prompt, checks, palette, hitboxes and attempts
- `NN-<id>.png`: the processed candidate
- `NN-<id>.raw.png`: the provider's original (thumbnail)
- `NN-<id>.mask.png`: silhouette mask (sprites, sheets)
- `NN-<id>.frameMM.png`: sliced frames (sheets)
- `log.txt`: run log
