# Content schemas

Every enemy, upgrade, shikigami, path and rift is a JSON data file under `content/`.
Adding content means adding a file; no code changes. The TypeScript types live in
`src/content/types.ts` and `src/content/index.ts` validates every file when the game
loads (unknown ids, behaviors or tags stop the game with a clear error). Keep this
document, the types and the validator in sync.

Weapons are not defined yet (v1 has two; they come in a later step). Global feel numbers
(combo timing, spawn rates, XP curve, matchup multipliers…) are not content: they live in
`src/config/tuning.ts` and the in-game tuning panel.

## Layout

```
content/
  paths.json            the five paths (array)
  day.json              the frozen day stage's enemy roster
  enemies/<id>.json     one enemy per file
  shikigami/<id>.json   one shikigami per file
  upgrades/<name>.json  an array of upgrades (one file per path, plus general.json)
  rifts/<id>.json       one rift per file
```

Files under `enemies/`, `shikigami/` and `rifts/` may hold one object or an array of
objects. Ids must be unique within their kind.

## Tags

`"fire" | "frost" | "thunder" | "spirit" | "beast"`

Tags tie paths, upgrades, shikigami and rifts together. A hit carries the tags of the
upgrade effects that touched it. Against tonight's rift, each tag on a hit multiplies its
damage:

| Condition | Multiplier (tuning key) |
|---|---|
| Tag is the rift's `feared` tag | `fearedMult` (1.5) |
| Tag is the rift's `resisted` tag | `resistedMult` (0.5) |
| The tag's path has `minorVs` equal to the rift's `tag` (the path's minor benefit) | `matchupMult` (1.3) |

## Path — `content/paths.json`

An array of exactly the five paths.

| Field | Type | Meaning |
|---|---|---|
| `id` | Tag | The path and its tag |
| `name` | string | Display name |
| `major` | string | How it plays; always useful |
| `minor` | string | Matchup text shown to the player |
| `minorVs` | Tag | Gets `matchupMult` against rifts whose `tag` is this |
| `opposes` | Tag | Taking a deep (tier 3) pick in this path locks that path out for the run |

## Enemy — `content/enemies/<id>.json`

Each enemy is a look (later: a generated sprite) on top of one fixed behavior written in
code. All numbers below are per-enemy; global multipliers (`enemyHpMult`,
`enemyDamageMult`, `enemySpeedMult`) and the attack-token rules come from tuning.

| Field | Type | Req | Meaning |
|---|---|---|---|
| `id` | string | yes | Unique id |
| `name` | string | yes | Display name (stats screen) |
| `behavior` | `"swarmer" \| "charger" \| "ranged" \| "splitter" \| "tank" \| "boss"` | yes | Which behavior from the library |
| `size` | number | yes | Box size in world units; also the hitbox |
| `hp` | number | yes | Health |
| `speed` | number | yes | Move speed (units/s) |
| `damage` | number | yes | Damage per strike, dash or projectile |
| `xp` | number | yes | XP dropped (doubled at night by `nightXpMult`) |
| `armor` | number 0–1 | no | Fraction of damage blocked. Spirit's `pierceArmor` ignores it |
| `knockbackResist` | number 0–1 | no | Reduces knockback, hit-stun and freeze |
| `windup` | number | no | Telegraph seconds before a strike, dash or shot |
| `attackCooldown` | number | no | Seconds between attacks |
| `reach` | number | no | Melee strike reach (default `size/2 + 20`) |
| `usesTokens` | boolean | no | Needs an attack token to attack. Default true, except `ranged` and `boss` |
| `groupSize` | number | no | Spawns as a pack of this many |
| `chargeRange` | number | charger | Starts its dash within this distance |
| `chargeSpeed` | number | charger | Dash speed |
| `chargeTime` | number | charger | Dash duration (s) |
| `preferredRange` | number | ranged | Distance it tries to keep |
| `projectileSpeed` | number | ranged | Shot speed |
| `projectileSize` | number | ranged | Shot size |
| `splitInto` | enemy id | splitter | What it splits into on death |
| `splitCount` | number | splitter | How many |
| `pattern` | BossStep[] | boss | Looping attack pattern, below |

### Behaviors

- **swarmer**: fast and fragile, comes in packs (`groupSize`). Walks in, waits on the
  ring for an attack token, then strikes after `windup`.
- **charger**: with a token and within `chargeRange`, telegraphs, then dashes in a
  straight line at `chargeSpeed` for `chargeTime`, hurting you on contact. Dodge sideways.
- **ranged**: keeps to `preferredRange`, strafes, and fires a projectile after `windup`.
  Doesn't use tokens. Dodge rolls pass through shots.
- **splitter**: melee like a swarmer; on death splits into `splitCount` × `splitInto`.
- **tank**: slow melee with heavy hits. Give it `armor` and `knockbackResist`.
- **boss**: ignores tokens, isn't interrupted, loops `pattern`.

### BossStep

| `kind` | Fields | Does |
|---|---|---|
| `chase` | `time` | Walks at you for `time` s, striking in melee when in `reach` |
| `charge` | `windup`, `speed`, `time` | Telegraphs, then dashes at you |
| `burst` | `windup`, `count`, `projectileSpeed` | Telegraphs, then fires `count` shots in a ring |
| `summon` | `enemy`, `count` | Summons `count` of an enemy around itself |

## Upgrade — `content/upgrades/*.json`

| Field | Type | Req | Meaning |
|---|---|---|---|
| `id` | string | yes | Unique id |
| `name` | string | yes | Card title |
| `description` | string | yes | Card text |
| `path` | Tag | no | Path it belongs to. Omit for general upgrades |
| `tier` | 1 \| 2 \| 3 | yes | 2 needs `tier2Picks` picks in the path, 3 needs `tier3Picks`. **3 is a deep pick: it locks out the path's `opposes` path** |
| `maxStacks` | number | no | Times it can be taken (default 1) |
| `weight` | number | no | Base offer weight (default 1) |
| `effects` | UpgradeEffect[] | yes | What it does |

Offers: each level-up draws `offerCount` distinct eligible upgrades, weighted by
`weight × (1 + pathLean × picks in that path)`, so offers lean toward paths you've taken.
Upgrades from locked paths, maxed upgrades and gated tiers are never offered.
Rerolls: `rerollsPerRun`.

### UpgradeEffect

| `type` | Fields | Does |
|---|---|---|
| `stat` | `stat`, `add?`, `mult?` | `stat = (stat + add) × mult`. Stats: `maxHp` (added to tuning's `playerMaxHp`), `moveSpeed`, `damage` (combo hits), `pickupRadius`, `shikigamiDamage`, `shikigamiRate`, `finisherCooldown` (all multipliers starting at 1, except `maxHp` at 0) |
| `onHit` | `slot`, `tag?`, `effect` | Bends the combo: attaches a HitEffect to hits from `slot`, and the hit gains `tag` |
| `shikigami` | `id`, `levels?`, `extra?` | Summons that shikigami, or adds `levels` (default 1) if you already have it. `extra: true` always summons another copy |
| `heal` | `amount` | Heals once when taken |

Slots: `string` (hits 1–3), `finisher` (hit 4), `charge` (any charge attack), `all`.

### HitEffect

| `kind` | Fields | Does |
|---|---|---|
| `burn` | `dps`, `maxHpPct?`, `duration` | Burns for `dps + maxHpPct × enemy max HP` per second (fire tag, ignores armor) |
| `slow` | `amount` 0–1, `duration` | Slows movement and dashes |
| `freeze` | `duration` | Stuns enemies that were **already** slowed when hit (not bosses) |
| `chain` | `count`, `range`, `damagePct` | Lightning jumps to `count` more enemies for `damagePct` of the hit (thunder tag) |
| `pierceArmor` | — | The hit ignores armor |
| `wave` | `damagePct`, `speed`, `range`, `width` | The swing also fires a piercing wave forward, whether or not it connects |
| `explodeOnDeath` | `radius`, `damagePct` | Burning enemies explode on death for `damagePct` of their max HP |

## Shikigami — `content/shikigami/<id>.json`

Paper familiars that follow behind you and auto-attack. By default they only target
enemies **outside your attack arc** (tuning `hitArcDeg`), so they guard your back.

| Field | Type | Req | Meaning |
|---|---|---|---|
| `id` | string | yes | Unique id |
| `name` | string | yes | Display name |
| `tag` | Tag | yes | Damage tag of its attacks |
| `attack` | `"bolt" \| "pierce" \| "chain" \| "nova" \| "bite"` | yes | How it attacks (below) |
| `cooldown` | number | yes | Seconds between attacks at level 1 |
| `damage` | number | yes | Damage at level 1 |
| `range` | number | yes | Targets enemies within this distance of you |
| `damagePerLevel` | number | yes | Added damage per level |
| `cooldownPerLevel` | number | yes | Cooldown multiplier per level (e.g. 0.85) |
| `projectileSpeed` | number | bolt, pierce | Shot speed |
| `radius` | number | nova | Pulse radius |
| `chains` | number | chain | Extra enemies the lightning jumps to |
| `effects` | HitEffect[] | no | Applied to everything it hits |

Attacks: `bolt` one shot, one target. `pierce` a shot through every enemy in its path.
`chain` instant lightning that jumps. `nova` a pulse around the familiar. `bite` it dashes
out, bites and returns.

Final damage is `(damage + damagePerLevel × (level − 1)) × shikigamiDamage`, then the rift
matchup. Cooldown is `cooldown × cooldownPerLevel^(level − 1) ÷ shikigamiRate`.

## Day roster — `content/day.json`

| Field | Type | Meaning |
|---|---|---|
| `enemies` | Spawn[] | The day stage's own demons |

During the day, spawns draw from `day.enemies` plus tonight's rift `omens`.

## Rift — `content/rifts/<id>.json`

The daily rift data card. For now the game uses the first rift by id; the daily pipeline
picks it later.

| Field | Type | Req | Meaning |
|---|---|---|---|
| `id` | string | yes | Unique id |
| `name` | string | yes | Shown at the start of the run and at nightfall |
| `flavor` | string | yes | Short flavor text |
| `theme` | string | yes | Theme prompt for the generators ("Buddhist cold hell") |
| `tag` | Tag | yes | What kind of rift it is. Paths whose `minorVs` matches get their minor bonus |
| `resisted` | Tag | yes | Hits with this tag deal `resistedMult` damage |
| `feared` | Tag | yes | Hits with this tag deal `fearedMult` damage |
| `enemies` | Spawn[] | yes | The night parade's roster (about a dozen in the full game) |
| `boss` | enemy id | yes | Must be a `boss`-behavior enemy. `nightBossCount` of them arrive during the night |
| `omens` | Spawn[] | yes | Rift enemies that leak into the day as a hint of tonight |
| `palette` | string[16] | no | The night's 16 colours (filled by the asset pipeline) |
| `tileset` | string | no | Tileset asset (asset pipeline) |
| `music` | string | no | Chiptune track (asset pipeline) |

### Spawn

| Field | Type | Meaning |
|---|---|---|
| `enemy` | enemy id | What to spawn |
| `weight` | number | Relative chance |

## Example: the test rift

`content/rifts/red-lotus.json`, Guren, the Red Lotus Hell: a `frost` rift that resists
frost and fears fire. Fire hits deal 1.5 (feared) × 1.3 (Fire's minor is "bonus vs frost
rifts") = 1.95× damage there. Frost hits deal 0.5×.

Asset generation requests have their own format, documented in `docs/PIPELINE.md`.
