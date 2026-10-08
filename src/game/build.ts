import { tuning } from '../config/tuning';
import { content } from '../content';
import type { HitEffect, RiftDef, Slot, StatId, Tag, UpgradeDef } from '../content/types';

// The player's build for one run: upgrades taken, path depth, locks, and what they add.

export interface SlotEffect {
  slot: Slot;
  tag?: Tag;
  effect: HitEffect;
}

export interface OfferCard {
  upgrade: UpgradeDef;
  pathName: string;
  stacks: number;
  notes: string[];
}

const STAT_DEFAULTS: Record<StatId, number> = {
  maxHp: 0,
  moveSpeed: 1,
  damage: 1,
  pickupRadius: 1,
  shikigamiDamage: 1,
  shikigamiRate: 1,
  finisherCooldown: 1,
};

export class Build {
  stats: Record<StatId, number> = { ...STAT_DEFAULTS };
  stacks = new Map<string, number>();
  picks = new Map<Tag, number>();
  locked = new Set<Tag>();
  effects: SlotEffect[] = [];
  taken: string[] = [];

  constructor(private rift: RiftDef) {}

  pathPicks(tag: Tag): number {
    return this.picks.get(tag) ?? 0;
  }

  /** Effects that apply to a hit from the given slot, and the damage tags they give it. */
  forSlot(slot: Exclude<Slot, 'all'>): { effects: HitEffect[]; tags: Tag[] } {
    const list = this.effects.filter((e) => e.slot === slot || e.slot === 'all');
    const tags = [...new Set(list.map((e) => e.tag).filter((t): t is Tag => !!t))];
    return { effects: list.map((e) => e.effect), tags };
  }

  has(kind: HitEffect['kind']): HitEffect | undefined {
    return this.effects.find((e) => e.effect.kind === kind)?.effect;
  }

  private eligible(u: UpgradeDef): boolean {
    if ((this.stacks.get(u.id) ?? 0) >= (u.maxStacks ?? 1)) return false;
    if (!u.path) return true;
    if (this.locked.has(u.path)) return false;
    const picks = this.pathPicks(u.path);
    if (u.tier === 2 && picks < tuning.tier2Picks) return false;
    if (u.tier === 3 && picks < tuning.tier3Picks) return false;
    return true;
  }

  private weight(u: UpgradeDef): number {
    const base = u.weight ?? 1;
    return u.path ? base * (1 + tuning.pathLean * this.pathPicks(u.path)) : base;
  }

  /** Draw a weighted set of distinct upgrades; offers lean toward paths already taken. */
  offer(): OfferCard[] {
    const pool = [...content.upgrades.values()].filter((u) => this.eligible(u));
    const cards: OfferCard[] = [];
    const n = Math.round(tuning.offerCount);
    while (cards.length < n && pool.length) {
      const total = pool.reduce((s, u) => s + this.weight(u), 0);
      let r = Math.random() * total;
      let i = 0;
      for (; i < pool.length - 1; i++) {
        r -= this.weight(pool[i]);
        if (r <= 0) break;
      }
      const u = pool.splice(i, 1)[0];
      cards.push(this.card(u));
    }
    return cards;
  }

  private card(u: UpgradeDef): OfferCard {
    const notes: string[] = [];
    let pathName = 'General';
    if (u.path) {
      const p = content.paths.get(u.path)!;
      pathName = `${p.name} · ${u.tier === 3 ? 'DEEP' : `tier ${u.tier}`}`;
      if (u.tier === 3) notes.push(`Locks out ${content.paths.get(p.opposes)!.name}`);
      if (p.minorVs === this.rift.tag) notes.push(`${p.name} is strong vs tonight's rift`);
      if (this.rift.feared === u.path) notes.push(`Tonight's rift fears ${p.name}`);
      if (this.rift.resisted === u.path) notes.push(`Tonight's rift resists ${p.name}`);
    }
    return { upgrade: u, pathName, stacks: this.stacks.get(u.id) ?? 0, notes };
  }

  /** Apply an upgrade. Returns shikigami grants and healing for the arena to act on. */
  take(u: UpgradeDef): { shikigami: { id: string; levels: number; extra: boolean }[]; heal: number } {
    this.stacks.set(u.id, (this.stacks.get(u.id) ?? 0) + 1);
    this.taken.push(u.name);
    if (u.path) {
      this.picks.set(u.path, this.pathPicks(u.path) + 1);
      if (u.tier === 3) this.locked.add(content.paths.get(u.path)!.opposes);
    }
    const out = { shikigami: [] as { id: string; levels: number; extra: boolean }[], heal: 0 };
    for (const ef of u.effects) {
      switch (ef.type) {
        case 'stat':
          this.stats[ef.stat] = (this.stats[ef.stat] + (ef.add ?? 0)) * (ef.mult ?? 1);
          break;
        case 'onHit':
          this.effects.push({ slot: ef.slot, tag: ef.tag, effect: ef.effect });
          break;
        case 'shikigami':
          out.shikigami.push({ id: ef.id, levels: ef.levels ?? 1, extra: !!ef.extra });
          break;
        case 'heal':
          out.heal += ef.amount;
          break;
      }
    }
    return out;
  }

  /** Damage multiplier from tonight's rift for a hit carrying these tags. */
  tagMult(tags: Tag[]): number {
    let m = 1;
    for (const t of tags) {
      if (t === this.rift.feared) m *= tuning.fearedMult;
      if (t === this.rift.resisted) m *= tuning.resistedMult;
      if (content.paths.get(t)?.minorVs === this.rift.tag) m *= tuning.matchupMult;
    }
    return m;
  }

  summary(): string {
    const parts = [...this.picks.entries()].map(([t, n]) => `${content.paths.get(t)!.name} ${n}`);
    if (this.locked.size) parts.push(`locked: ${[...this.locked].map((t) => content.paths.get(t)!.name).join(', ')}`);
    return parts.join(' · ');
  }
}
