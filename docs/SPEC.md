# Night Parade — Concept Draft

Oct 8, 2026 · @Sean Cornwell

A landscape iPhone game that crosses Dynasty Warriors melee with Vampire Survivors builds. You calibrate your build by day, survive the Night Parade by night, and face a new generated rift every day. Every image and sound is computer-generated, made for me and my daughter to play.

## Setting

Day is feudal Japan, generated once and then fixed, so it looks the same every run. Demon-hunter clans hold provinces and keeps, and paper lanterns mark held ground.

Night is the hyakki yagō, the Night Parade of One Hundred Demons, but warped. Tears open across time and space, and what marches through comes from somewhere new each day: a Buddhist hell, a drowned cathedral, a dimension of melted clocks. The folklore explains the variety instead of fighting it.

- **Day world:** generated once, then frozen. Forests, villages, keeps.
- **Rift worlds:** generated fresh each day. Tonight's hell, its tiles, its demons, its music.
- Daytime foreshadows the night. Ember spirits in the forest hint at a fire hell after dark.

## Modes

Classic day-to-night is the main mode and the only one in v1. The others are designed for now and built later.

| Mode | Shape | Who fights | Role | Build order |
|---|---|---|---|---|
| Classic (day → night) | ~10 min day, ~10 min night | Solo | Calibrate your build by day, survive the parade by night | v1 |
| Sortie (day only) | Army battle over keeps | You plus your army | Keep your soldiers alive; take outposts to stop enemy spawns and start yours. Enemies retake keeps. | Later |
| Night-night | Night only, hardest | You plus AI copies of saved player loadouts | Async co-op: your daughter's loadout fights in your night, yours in hers | Later |
| Night-today | Reverse curve, ultra hard | Solo, then army | Start overrun; dawn brings your army and the worst monsters | Later |
| Events | Two-week limited modes | Varies | Different game styles (Hellevator, Bagholder, Ghost Bottle from Game Ideas) using shared characters and art | Later |

Day-only and night-only double as the easy and hard difficulties.

## A classic run

A run lasts about 20 minutes: roughly 10 of day, a short dusk, and 10 of night.

| Phase | Length | What happens |
|---|---|---|
| Day | ~10 min | Daytime demons; build your paths; omens hint at tonight's rift |
| Dusk | ~15 s | Calm, plus one guaranteed upgrade pick |
| Night | ~10 min | The parade arrives; double XP, bosses drop weapons and shikigami |

- **Spawns:** mostly a march from one direction, with stragglers from the flanks.
- **XP:** pickups you walk over, so collecting is a risk.
- **Healing:** rare drops plus shrines that cost time to use. Health is hard to restore by design.
- Night pays more, so building for night is an investment, not just endurance.

## Controls and combat

Landscape and two thumbs, like 20 Minutes Till Dawn: the left thumb moves, the right thumb fights, and you can attack without stopping. The camera is fairly wide, in a 3/4 top-down view like Vampire Survivors. Melee is a commitment: every hit carries you forward and only lets you turn so far.

### Layout (landscape)

- Floating move stick on the left half.
- Attack button on the right: tap to attack, hold to charge. No swiping.
- Dodge button next to attack.
- Upgrade cards sit in the lower middle, in reach of both thumbs.

### The combo

1. A four-tap string. Each hit lunges you forward a short distance, and moving steers it.
2. Between hits you can turn up to a clamped angle (start at about 45° and tune it). The next hit snaps toward the nearest enemy inside that angle.
3. Hits one to three strike forward. Hit four, the finisher, is a 360° sweep with knockback, followed by a short cooldown.
4. Holding attack instead of tapping launches a charge attack that depends on where you are in the string (launcher, sweep, big finisher).

### Being surrounded (late game)

- The radial finisher clears your back once per string and pushes the ring outward.
- Dodge rolls pass through enemies, so one roll turns a surround into a front.
- **Attack tokens:** only a few enemies can strike at once while the rest crowd in and wait, as in Dynasty Warriors. A full ring is pressure, not instant death.
- Shikigami guard your back. By default they target enemies outside your attack arc.

### Dodge

- Roll in the stick direction, with brief invulnerability.
- Cancels the string before the finisher: you skip the cooldown but lose the big hit.

### Feel

- Hit-stop (about 0.05 s) and screenshake on every hit. Tune these first.
- Movement slows while attacking, like 20 Minutes Till Dawn's firing slowdown.

## Build system

Runs specialize hard. Every path has a floor that always works and a ceiling that depends on the run, so a committed build is never dead, just unlucky.

### Two treasure types

- **Weapons** change how you fight: each has its own four-hit string, charge set and reach. Horizontal, never strictly better.
- **Shikigami** are paper familiars that carry the auto-fire abilities and guard your back. They have bodies and personalities, come in tiers, and are summoned with in-game currency (see Persistence and rewards).

Tags tie everything together. Five to start: fire, frost, thunder, spirit, beast. A weapon and shikigami sharing a tag resonate, so obvious pairs (fox-fire familiar plus flame blade) feel intuitive.

### Paths: major and minor benefits

| Path | Major (how it plays, always useful) | Minor (matchup, run-dependent) |
|---|---|---|
| Fire | Tag enemies and kite while they burn; strong vs high health | Bonus vs frost rifts |
| Frost | Slow and control crowds | Bonus vs beast rifts |
| Thunder | Chains through dense packs | Bonus vs spirit rifts |
| Spirit | Pierces armor and shields | Bonus vs thunder rifts |
| Beast | Shikigami-heavy, swarm support | Bonus vs fire rifts |

Matchups are placeholders; keep the chart small enough to hold in your head.

### Level-ups

- Offers deepen: once you take a path, future offers lean toward it.
- Deep picks lock out the opposing path for the run.
- Upgrades bend your core attack (a burn path sets the finisher on fire) as well as adding shikigami abilities, so the combo matters to the end.
- Rerolls are scarce.
- Specials are not a free button. Each character's tree has a special as its capstone, reachable only by giving up other upgrades.

## Enemies and the daily rift

Each enemy is a generated look on top of a fixed behavior written in code. The rift only decides which behaviors show up and what they look like, so a generated night is always fair.

**Behavior library (v1):** charger, swarmer, ranged, splitter, tank, plus one boss pattern.

### Daily rift data card

- Name and short flavor text (generated text is cheap and safe).
- Theme prompt ("Buddhist hell", "drowned cathedral").
- About a dozen enemy entries, each a generated sprite on a behavior from the library.
- One resisted tag and one feared tag.
- Its own 16-color palette, tileset and themed chiptune track.
- Daytime omens: which hint enemies appear during the day.

One rift per day, generated on my side and pushed to every copy of the game, so the cost is per day, not per play.

## Asset generation

Every image and sound in the game is computer-generated. Nothing is hand-drawn, and code never draws art or synthesizes sound: code only places, moves, tints, scales and animates generated files.

### The fixed look

- 16-bit pixel art with a limited palette, 3/4 top-down, with fixed sprite sizes set in phase 1.
- Day has one 16-color palette, taken from the first approved day-stage images and locked forever.
- Each night has its own 16-color palette, generated with that rift's theme, so the parade looks different from the day world as well as from last night.

**Phase 1: template library (once).** Image generators produce many candidates for:

- Tile templates (ground, path, water, wall) with matching edges.
- Map objects (trees, shrines, lanterns, keeps, rocks).
- Silhouettes for the player character, weapons, shikigami, and enemies (several per behavior type).

Scripts then clean them up: silhouettes become exact masks that also set hitboxes, tile edges are forced to match so they tile seamlessly, and everything snaps to size. My only job is picking keepers from the candidates.

**Phase 2: the day stage (once, then frozen).** Generators fill the templates for feudal Japan in the day palette: forest, village outskirts, keeps, the player, weapons, shikigami, day enemies, UI frames and icons, plus the day chiptune track and sound effects. Once approved, it ships with the game and never changes.

**Phase 3: nightly rifts (daily).** A script picks a theme, writes the rift's data card and generates its 16-color palette. Generators then fill the same templates with a tileset, about a dozen enemies and a themed chiptune track. Because every night uses the same templates, every night fits the same game.

### Checks on every generated file

1. **Palette lock:** every pixel is snapped to the day palette or that night's palette.
2. **Mask check:** the art stays inside its silhouette.
3. **Contrast check:** it reads clearly against the stage background.
4. A failed file is regenerated; too many failures trigger the fallback.

**Provider chain.** Each asset type has an ordered list of generators. If one refuses (a content filter), errors, hits its free limit, or keeps failing checks, the script moves to the next. Hell and demon themes will trip some filters, so this will happen. The script logs which provider made each file. The last resort is yesterday's rift or a stored backup, never a broken night.

**Animation.** Generators produce sprite sheets: one image holding every frame, laid out on a fixed grid. The player sheet covers idle, run, the four combo hits, charge attacks and the dodge roll. Enemy sheets can be shorter. The checks run per frame, and a sheet whose frames drift apart (a different face, extra limbs) is rejected and regenerated.

Effects (hit sparks, slash trails, embers) are generated images that code spawns and moves.

**Music and sound.** All chiptune. Day has one track that is always the same, generated once in phase 2. Each night gets a new chiptune track themed to its rift, generated daily in phase 3. A sound-effect generator makes hits, rolls and pickups. Music and sound use the same provider-chain rule.

Every provider needs an official API and a usable free tier; check the terms before depending on one. Midjourney and Suno have not historically offered public APIs.

## Persistence and rewards

No stats carry between runs. Your collection and your currency do. No real money anywhere.

### Drops

| Source | Reward |
|---|---|
| Enemies | Currency, all run long |
| Bosses | A weapon or shikigami |
| Finishing the night | A large currency bonus plus a treasure chest with a random weapon or shikigami |
| Dying | You keep everything collected so far; you lose only the finish bonus and chest |

Shikigami summoning is gacha-style, paid with in-game currency only. Shikigami come in tiers of usefulness (for example common, rare, legendary). Proposed: duplicates raise a shikigami's tier, so a favourite common one can be grown rather than replaced.

### Saves and sharing

- Saves export and import from day one (iPhone web apps can lose stored data).
- The same export is a loadout code: send it to my daughter and her character appears in my night-night run as an AI ally, and mine in hers.
- Content is data, not code: every enemy, weapon, shikigami, upgrade and rift is a file in a documented schema, so a weekly update is a new folder, not a rewrite.

## Build approach

A web game in TypeScript with Phaser, played in landscape and installed on the iPhone with Add to Home Screen. No Mac, Xcode or developer account needed.

The project folder holds this spec, the locked palette, API keys with the ordered provider lists, and a CLAUDE.md of rules:

- Nothing hand-drawn. Code never draws art or synthesizes audio; it only places, moves, tints, scales and animates generated files.
- Grey boxes are temporary scaffolding for early sessions and never ship.
- A missing asset is listed in ASSETS_NEEDED.md, never improvised.
- Build only the current step.

**v1 scope:** classic day-to-night only, one character, two weapons, three shikigami, the generated day stage, and the daily rift pipeline.

### Session order

1. Movement, the four-hit combo, dodge and feel, against grey boxes.
2. Day into night, enemy behaviors, level-ups and paths.
3. Asset phase 1: template library and cleanup scripts.
4. Asset phase 2: the day stage, replacing all grey boxes.
5. Asset phase 3: the nightly rift pipeline, provider chain and fallback.
6. Currency, rewards, summoning, saves and loadout codes.
7. Further modes and events, one per update.

**Gate:** steps 1 and 2 must be fun twice with grey boxes before step 3 starts.

### Technical notes

- Cap on-screen sprites and test on the actual phone.
- Auto-pause when the app loses focus; save one in-progress run.
- A title-screen tap starts audio (iOS requires it).
- iPhone Safari has no vibration, so hit feel comes from hit-stop, shake and sound.

## Amendments

- **Music direction (Oct 9, 2026):** music no longer has to be chiptune. Day: subdued, sinister
  and thumping, like a dark club track (in the spirit of 20 Minutes Till Dawn). Night: opens up
  into Japanese-themed metal fight music. Sound effects stay retro.
- **Exceptions to "every asset is generated" (Oct 9, 2026):** art and sounds the player's family
  provide can be added to the game, and a free open-licence pixel font is used for text.
- **Crowds and map (Oct 10, 2026):** being surrounded is the norm from the start, not only late
  game: many small, slow grunts arrive from every side and slow down further as they close in,
  packing a tight ring around the player (attack tokens still limit how many strike at once).
  The day map is much larger (12,000 units square, nine times the old area) with dense prop
  sections (forest, village, rocky hills). The attack lunge and dodge roll are short.
  You can't escape the parade: enemies off screen hurry to catch up, and ones left far behind
  re-enter around you. XP needs are steeper to match the bigger crowds.
