// Content schemas. Every type here is documented in docs/SCHEMAS.md; keep them in sync.

export const TAGS = ['fire', 'frost', 'thunder', 'spirit', 'beast'] as const;
export type Tag = (typeof TAGS)[number];

export const BEHAVIORS = ['swarmer', 'charger', 'ranged', 'splitter', 'tank', 'boss'] as const;
export type BehaviorId = (typeof BEHAVIORS)[number];

export interface EnemyDef {
  id: string;
  name: string;
  behavior: BehaviorId;
  size: number;
  hp: number;
  speed: number;
  damage: number;
  xp: number;
  armor?: number; // 0..1 fraction of damage blocked; spirit hits ignore it
  knockbackResist?: number; // 0..1
  windup?: number; // seconds of telegraph before a melee strike
  attackCooldown?: number;
  reach?: number; // melee strike reach
  usesTokens?: boolean; // default true for melee behaviors
  groupSize?: number; // spawned together as a pack
  // charger
  chargeRange?: number;
  chargeSpeed?: number;
  chargeTime?: number;
  // ranged
  preferredRange?: number;
  projectileSpeed?: number;
  projectileSize?: number;
  // splitter
  splitInto?: string;
  splitCount?: number;
  // boss
  pattern?: BossStep[];
}

export type BossStep =
  | { kind: 'chase'; time: number }
  | { kind: 'charge'; windup: number; speed: number; time: number }
  | { kind: 'burst'; windup: number; count: number; projectileSpeed: number }
  | { kind: 'summon'; enemy: string; count: number };

export interface PathDef {
  id: Tag;
  name: string;
  major: string;
  minor: string;
  minorVs: Tag; // bonus against rifts with this tag
  opposes: Tag; // locked out by a deep pick in this path
}

export type Slot = 'string' | 'finisher' | 'charge' | 'all';

export type HitEffect =
  | { kind: 'burn'; dps: number; maxHpPct?: number; duration: number }
  | { kind: 'slow'; amount: number; duration: number }
  | { kind: 'freeze'; duration: number } // stuns enemies that are already slowed
  | { kind: 'chain'; count: number; range: number; damagePct: number }
  | { kind: 'pierceArmor' }
  | { kind: 'wave'; damagePct: number; speed: number; range: number; width: number }
  | { kind: 'explodeOnDeath'; radius: number; damagePct: number }; // burning enemies burst

export type StatId =
  | 'maxHp'
  | 'moveSpeed'
  | 'damage'
  | 'pickupRadius'
  | 'shikigamiDamage'
  | 'shikigamiRate'
  | 'finisherCooldown';

export type UpgradeEffect =
  | { type: 'stat'; stat: StatId; add?: number; mult?: number }
  | { type: 'onHit'; slot: Slot; tag?: Tag; effect: HitEffect }
  | { type: 'shikigami'; id: string; levels?: number; extra?: boolean } // extra = summon another copy
  | { type: 'heal'; amount: number };

export interface UpgradeDef {
  id: string;
  name: string;
  description: string;
  path?: Tag; // omitted = general upgrade, no path
  tier: 1 | 2 | 3; // 3 = deep pick: locks out the opposing path
  maxStacks?: number; // default 1
  weight?: number; // default 1
  effects: UpgradeEffect[];
}

export type ShikigamiAttack = 'bolt' | 'nova' | 'chain' | 'pierce' | 'bite';

export interface ShikigamiDef {
  id: string;
  name: string;
  tag: Tag;
  attack: ShikigamiAttack;
  cooldown: number;
  damage: number;
  range: number;
  damagePerLevel: number;
  cooldownPerLevel: number; // multiplier per extra level, e.g. 0.9
  projectileSpeed?: number;
  radius?: number; // nova radius
  chains?: number; // chain count
  effects?: HitEffect[];
}

export interface Spawn {
  enemy: string;
  weight: number;
}

export interface DayDef {
  enemies: Spawn[];
}

export interface RiftDef {
  id: string;
  name: string;
  flavor: string;
  theme: string;
  tag: Tag; // what kind of rift it is; drives path minor matchups
  resisted: Tag;
  feared: Tag;
  enemies: Spawn[]; // the night parade
  boss: string;
  omens: Spawn[]; // rift enemies that leak into the day as hints
  palette?: string[]; // 16 colours, filled by the asset pipeline later
  tileset?: string;
  music?: string;
}
