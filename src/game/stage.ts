import Phaser from 'phaser';
import { ART_SCALE } from '../art';
import type { StageDef, StageRect } from '../content/types';

// Builds the day world from content/day.json "stage". The layout comes from a fixed seed, so the
// day world is generated once and is the same every run (spec: "generated once, then frozen").

export interface BuiltStage {
  /** Ground layers, tinted at night. */
  ground: Phaser.GameObjects.Components.Tint[];
  /** Decoration sprites, also tinted at night. */
  decor: Phaser.GameObjects.Image[];
}

/** Small deterministic random generator (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tiled(scene: Phaser.Scene, r: StageRect, depth: number): Phaser.GameObjects.TileSprite {
  return scene.add
    .tileSprite(r.x, r.y, r.w, r.h, r.tile)
    .setOrigin(0)
    .setTileScale(ART_SCALE)
    .setDepth(depth);
}

export function buildStage(scene: Phaser.Scene, stage: StageDef, width: number, height: number, keepClear: { x: number; y: number; r: number }[]): BuiltStage {
  const rand = seeded(stage.seed);
  const ground: Phaser.GameObjects.Components.Tint[] = [];
  const decor: Phaser.GameObjects.Image[] = [];

  ground.push(tiled(scene, { tile: stage.ground, x: 0, y: 0, w: width, h: height }, -100));
  for (const p of stage.patches) {
    for (let i = 0; i < p.count; i++) {
      const snap = 32 * ART_SCALE;
      const w = Math.round((p.minSize + rand() * (p.maxSize - p.minSize)) / snap) * snap;
      const h = Math.round((p.minSize + rand() * (p.maxSize - p.minSize)) / snap) * snap;
      const x = Math.round((rand() * (width - w)) / snap) * snap;
      const y = Math.round((rand() * (height - h)) / snap) * snap;
      ground.push(tiled(scene, { tile: p.tile, x, y, w, h }, -95));
    }
  }
  for (const r of stage.water) ground.push(tiled(scene, r, -92));
  for (const r of stage.paths) ground.push(tiled(scene, r, -90));
  const t = stage.border.thickness;
  for (const r of [
    { x: 0, y: 0, w: width, h: t },
    { x: 0, y: height - t, w: width, h: t },
    { x: 0, y: 0, w: t, h: height },
    { x: width - t, y: 0, w: t, h: height },
  ]) {
    ground.push(tiled(scene, { tile: stage.border.tile, ...r }, -80));
  }

  const blocked = (x: number, y: number, pad: number) =>
    keepClear.some((c) => Math.hypot(c.x - x, c.y - y) < c.r + pad) ||
    stage.paths.some((p) => x > p.x - pad && x < p.x + p.w + pad && y > p.y - pad && y < p.y + p.h + pad) ||
    stage.water.some((p) => x > p.x - pad && x < p.x + p.w + pad && y > p.y - pad && y < p.y + p.h + pad);

  const place = (key: string, x: number, y: number) => {
    const img = scene.add.image(x, y, key).setOrigin(0.5, 0.9).setScale(ART_SCALE).setDepth(y);
    decor.push(img);
    return img;
  };

  for (const l of stage.landmarks) place(l.sprite, l.x, l.y);
  for (const region of stage.regions) {
    for (const o of region.objects) {
      let placed = 0;
      for (let tries = 0; placed < o.count && tries < o.count * 20; tries++) {
        const x = region.x + rand() * region.w;
        const y = region.y + rand() * region.h;
        if (blocked(x, y, 40)) continue;
        place(o.sprite, x, y).setFlipX(rand() < 0.5);
        placed++;
      }
    }
  }
  return { ground, decor };
}
