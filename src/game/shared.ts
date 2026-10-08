import type { OfferCard } from './build';

// State shared between the arena, HUD and result scenes.

export type InputEvent = 'attackDown' | 'attackUp' | 'dodge' | 'reset';

export const controls = {
  moveX: 0,
  moveY: 0,
  events: [] as InputEvent[],
};

export function clearControls(): void {
  controls.moveX = 0;
  controls.moveY = 0;
  controls.events.length = 0;
  controls.events.push('reset');
}

export type Phase = 'day' | 'dusk' | 'night' | 'over';

export interface Offer {
  cards: OfferCard[];
  rerolls: number;
  title: string;
  openedAt: number;
}

export const status = {
  hp: 0,
  maxHp: 0,
  combo: 0,
  cooldown: false,
  charging: '',
  kills: 0,
  level: 1,
  xp: 0,
  xpNext: 1,
  phase: 'day' as Phase,
  phaseLeft: 0,
  build: '',
  shikigami: '',
  banner: null as null | { title: string; sub: string; until: number },
  offer: null as Offer | null,
};

/** Set by the arena; called by the HUD's level-up cards. */
export const actions = {
  pick: (_i: number) => {},
  reroll: () => {},
};

export interface RunResult {
  victory: boolean;
  rift: string;
  phase: Phase;
  time: number;
  level: number;
  kills: number;
  bosses: number;
  damageDealt: number;
  damageTaken: number;
  healed: number;
  xp: number;
  shrines: number;
  killsBy: Record<string, number>;
  upgrades: string[];
  build: string;
}
