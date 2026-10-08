import type { HitEffect, Tag } from '../content/types';

/** Everything about one instance of damage besides its amount. */
export interface HitOpts {
  tags: Tag[];
  effects?: HitEffect[];
  pierce?: boolean; // ignore armor
  kx?: number; // knockback velocity
  ky?: number;
  stun?: number;
  source: 'combo' | 'shikigami' | 'effect';
}

export function piercesArmor(effects: HitEffect[] | undefined): boolean {
  return !!effects?.some((e) => e.kind === 'pierceArmor');
}
