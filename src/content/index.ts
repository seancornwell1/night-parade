import {
  BEHAVIORS,
  TAGS,
  type DayDef,
  type EnemyDef,
  type PathDef,
  type RiftDef,
  type ShikigamiDef,
  type UpgradeDef,
} from './types';

// Loads every content file under /content and checks it against the schemas in docs/SCHEMAS.md.
// Adding content means adding a file; no code changes.

function collect<T extends { id: string }>(mods: Record<string, unknown>, kind: string): Map<string, T> {
  const out = new Map<string, T>();
  for (const [path, mod] of Object.entries(mods)) {
    const list = (Array.isArray(mod) ? mod : [mod]) as T[];
    for (const item of list) {
      if (!item || typeof item.id !== 'string') throw new Error(`${kind} in ${path} is missing an id`);
      if (out.has(item.id)) throw new Error(`Duplicate ${kind} id "${item.id}" in ${path}`);
      out.set(item.id, item);
    }
  }
  return out;
}

const enemies = collect<EnemyDef>(import.meta.glob('../../content/enemies/*.json', { eager: true, import: 'default' }), 'enemy');
const upgrades = collect<UpgradeDef>(import.meta.glob('../../content/upgrades/*.json', { eager: true, import: 'default' }), 'upgrade');
const shikigami = collect<ShikigamiDef>(import.meta.glob('../../content/shikigami/*.json', { eager: true, import: 'default' }), 'shikigami');
const rifts = collect<RiftDef>(import.meta.glob('../../content/rifts/*.json', { eager: true, import: 'default' }), 'rift');
const paths = collect<PathDef>(import.meta.glob('../../content/paths.json', { eager: true, import: 'default' }), 'path');
const day = Object.values(import.meta.glob('../../content/day.json', { eager: true, import: 'default' }))[0] as DayDef;

function check(ok: unknown, msg: string): void {
  if (!ok) throw new Error(`Content error: ${msg}`);
}

const isTag = (t: unknown) => (TAGS as readonly unknown[]).includes(t);

for (const e of enemies.values()) {
  check((BEHAVIORS as readonly string[]).includes(e.behavior), `enemy ${e.id} has unknown behavior "${e.behavior}"`);
  for (const k of ['size', 'hp', 'speed', 'damage', 'xp'] as const) check(typeof e[k] === 'number', `enemy ${e.id} needs number "${k}"`);
  if (e.splitInto) check(enemies.has(e.splitInto), `enemy ${e.id} splits into unknown enemy "${e.splitInto}"`);
  if (e.behavior === 'splitter') check(e.splitInto, `splitter ${e.id} needs splitInto`);
  if (e.behavior === 'boss') check(e.pattern?.length, `boss ${e.id} needs a pattern`);
  for (const s of e.pattern ?? []) if (s.kind === 'summon') check(enemies.has(s.enemy), `boss ${e.id} summons unknown "${s.enemy}"`);
}
for (const p of paths.values()) {
  check(isTag(p.id) && isTag(p.minorVs) && isTag(p.opposes), `path ${p.id} has an unknown tag`);
}
for (const t of TAGS) check(paths.has(t), `paths.json is missing path "${t}"`);
for (const s of shikigami.values()) check(isTag(s.tag), `shikigami ${s.id} has unknown tag "${s.tag}"`);
for (const u of upgrades.values()) {
  if (u.path) check(paths.has(u.path), `upgrade ${u.id} has unknown path "${u.path}"`);
  check([1, 2, 3].includes(u.tier), `upgrade ${u.id} tier must be 1, 2 or 3`);
  check(Array.isArray(u.effects) && u.effects.length, `upgrade ${u.id} needs effects`);
  for (const ef of u.effects) {
    if (ef.type === 'shikigami') check(shikigami.has(ef.id), `upgrade ${u.id} grants unknown shikigami "${ef.id}"`);
    if (ef.type === 'onHit' && ef.tag) check(isTag(ef.tag), `upgrade ${u.id} has unknown tag "${ef.tag}"`);
  }
}
const spawnsOk = (list: { enemy: string }[], where: string) =>
  list.forEach((s) => check(enemies.has(s.enemy), `${where} spawns unknown enemy "${s.enemy}"`));
check(day, 'content/day.json is missing');
spawnsOk(day.enemies, 'day.json');
for (const r of rifts.values()) {
  check(isTag(r.tag) && isTag(r.resisted) && isTag(r.feared), `rift ${r.id} has an unknown tag`);
  check(enemies.get(r.boss)?.behavior === 'boss', `rift ${r.id} boss "${r.boss}" must be a boss-behavior enemy`);
  spawnsOk(r.enemies, `rift ${r.id}`);
  spawnsOk(r.omens, `rift ${r.id} omens`);
}
check(rifts.size > 0, 'no rift files in content/rifts');

export const content = { enemies, upgrades, shikigami, rifts, paths, day };

/** Tonight's rift. One test rift for now; the daily pipeline picks it later. */
export function currentRift(): RiftDef {
  return [...rifts.values()].sort((a, b) => a.id.localeCompare(b.id))[0];
}

export function enemy(id: string): EnemyDef {
  const e = enemies.get(id);
  if (!e) throw new Error(`Unknown enemy "${id}"`);
  return e;
}
