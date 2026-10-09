# Art: fixed sizes and templates

Phase 1 fixes these sizes; every generated asset must use them.

**Scale:** 1 art pixel = 2 world units. The camera's 900-unit view is about 450 art pixels wide.
All sprites are 3/4 top-down, facing south-east unless noted.

| Asset | Frame (art px) |
|---|---|
| Tiles (ground, path, water, wall) | 32×32 |
| Player | 48×48 (body ~20×32; room for swings and the roll) |
| Weapons (katana, naginata) | 48×48, same frame as the player |
| Shikigami | 24×24 |
| Swarmer | 24×24 |
| Charger | 32×32 |
| Ranged | 32×32 |
| Splitter | 40×40 |
| Tank | 48×48 |
| Boss | 96×96 |
| Tree | 48×64 |
| Shrine | 48×48 |
| Lantern | 16×32 |
| Rock | 32×32 |
| Keep | 128×128 |

Hitboxes come from each kept template's mask. Enemy `size` values in `content/enemies`
are updated to match when real art replaces grey boxes (phase 2).

## Template library

Kept candidates live in `assets/templates/` (`tiles/`, `objects/`, `silhouettes/`), listed in
`assets/templates/templates.json` with the provider, prompt, palette and source batch of each.
Silhouette templates keep the sprite and its exact mask (`<id>.mask.png`); phase 2 fills
the silhouettes in the locked day palette.
