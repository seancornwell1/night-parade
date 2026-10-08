# Assets needed

Generated assets the game is waiting on. Never improvise replacements.

| Asset | Used for | Spec |
|---|---|---|
| App icon, 180×180 PNG (`public/icons/apple-touch-icon.png`) | iPhone home-screen icon | Generated, 16-bit pixel art in the day palette |
| App icons, 192×192 and 512×512 PNG (`public/icons/`) | Web manifest icons | Same art as the 180×180 icon |
| Title screen background | Title scene | Generated, landscape, day palette |
| Title logo | Title scene | Generated "Night Parade" wordmark |
| Player sprite sheet (idle, run, 4 combo hits, charge attacks, dodge roll) | Session 1 grey box: player | Spec "Animation"; size fixed in asset phase 1 |
| Slash trail, sweep and finisher effect images | Session 1 grey box: swing bars | Spec "Effects" |
| Move stick, attack and dodge button art | Session 1 grey box: touch controls | UI frames and icons, day palette |
| Day enemy sprites: Gaki, Kappa, Tengu Archer, Nuppeppo, Nuppeppo Blob, Oni | Session 2 grey boxes: `content/enemies` | One sheet per enemy; size from its data file |
| Red Lotus rift sprites: Frostbitten Gaki, Guren Hound, Icicle Monk, Lotus Shade, Petal Shard, Glacier Oni | Session 2 grey boxes: test rift | Rift palette; phase 3 pipeline generates these daily |
| Boss sprite: Mahapadma, the Great Red Lotus | Session 2 grey box: boss | Larger sheet with telegraph frames |
| Shikigami sprites: Kitsune-bi, Yuki Doll, Raiju, Paper Crane, Komainu | Session 2 grey boxes + name labels | Paper-familiar look, tagged by element |
| Projectiles: enemy shot, boss burst shot, fox-fire bolt, crane dart, spirit wave | Session 2 grey boxes | Effects, see spec "Effects" |
| Lightning arc, frost pulse, burn and freeze status effects | Session 2 grey lines/boxes | Effects |
| XP orb and heal pickup | Session 2 grey boxes | Small, readable against the floor |
| Shrine (with in-use and on-cooldown states) and its use-progress bar | Session 2 grey boxes | Map object, day palette |
| Ground tiles, day and night | Session 2 grey floor and grid | Phase 1 templates; night uses the rift tileset |
| Level-up card frame, path icons (fire, frost, thunder, spirit, beast), reroll button | Session 2 grey cards | UI frames and icons |
| HP bar and XP bar frames | Session 2 grey bars | UI frames |
| Death and victory screen backgrounds | Session 2 result screen | Generated, landscape |
| Day music, night (rift) music, hit / roll / pickup / level-up sounds | No audio yet | Chiptune, see spec "Music and sound" |
