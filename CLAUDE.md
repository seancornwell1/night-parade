# Night Parade — rules for Claude

1. **Read `docs/SPEC.md` before any work.** It is the design source of truth.
2. **Nothing hand-drawn.** Never draw art with canvas/vector/shape primitives
   and never synthesize audio in code. Code only places, moves, tints, scales
   and animates generated image and audio files.
3. **Grey rectangles are temporary scaffolding only** and never ship.
4. **Missing assets go in `ASSETS_NEEDED.md`.** Never improvise replacements.
5. **All content is data.** Enemies, weapons, shikigami, upgrades and rifts are
   data files in a schema documented in `docs/SCHEMAS.md`, never hard-coded.
6. **Never commit API keys.** Read them from environment variables / secrets.
7. **The user works only from their phone.** They can't run commands or open a
   terminal. Every build must deploy to GitHub Pages (the workflow in
   `.github/workflows/deploy.yml` does this on every push to any branch), and
   you end each session by giving them the link to test and what to look for:
   https://seancornwell1.github.io/night-parade/
8. **Build only the step asked for.**

## Project

- TypeScript + Phaser, bundled with Vite. Source in `src/`, static files in `public/`.
- Landscape iPhone Safari, installable via Add to Home Screen (`public/manifest.webmanifest`).
- `npm run build` must pass (typecheck + bundle) before pushing.
- Every tuning number lives in `src/config/tuning.ts`. Triple-tap the top-left
  corner in game to open the tuning panel; "Copy changes" gives back the edited
  values to paste into that file.
- Content data lives in `content/` and is loaded and validated by `src/content/`.
  Schemas are documented in `docs/SCHEMAS.md`.
- Open the game with `?debug` to expose `window.__np` (game, controls, status, actions)
  for automated playtests.
- Asset generation runs only in GitHub Actions; see `docs/PIPELINE.md`. Start a run by
  committing a request to `generation/requests/`. Candidates appear at `/review/`.
