import Phaser from 'phaser';
import { ART_SCALE, hasArt } from '../art';
import { GREY, tuning } from '../config/tuning';
import type { ShikigamiDef } from '../content/types';
import type { Build } from './build';
import type { Enemy } from './enemies';
import { piercesArmor, type HitOpts } from './hit';

// Shikigami: paper familiars carrying the auto-fire abilities. By default they guard your
// back, only targeting enemies outside your attack arc.

export interface ShikiWorld {
  px: number;
  py: number;
  facing: number;
  enemies: Enemy[];
  build: Build;
  hitEnemy(e: Enemy, damage: number, hit: HitOpts): void;
  chain(from: Enemy, count: number, range: number, damage: number, hit: HitOpts, already?: Set<Enemy>): void;
  shoot(opts: { x: number; y: number; angle: number; speed: number; range: number; size: number; width?: number; damage: number; pierceThrough: boolean; hit: HitOpts; sprite?: string }): void;
  lightning(x1: number, y1: number, x2: number, y2: number): void;
  pulse(x: number, y: number, radius: number): void;
}

export class Familiar {
  rect: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Image;
  label?: Phaser.GameObjects.Text;
  private bob = Math.random() * 10;
  x: number;
  y: number;
  level = 1;
  cd = 0.5;
  private state: 'follow' | 'dash' | 'return' = 'follow';
  private target?: Enemy;
  private dashT = 0;

  constructor(
    scene: Phaser.Scene,
    readonly def: ShikigamiDef,
    x: number,
    y: number,
  ) {
    this.x = x;
    this.y = y;
    if (def.sprite && hasArt(def.sprite)) {
      this.rect = scene.add.image(x, y, def.sprite).setScale(ART_SCALE * 0.8).setDepth(y);
    } else {
      // Grey box and name label until this shikigami has art.
      this.rect = scene.add.rectangle(x, y, 14, 14, GREY.shikigami).setDepth(9);
      this.label = scene.add
        .text(x, y, def.name, { fontFamily: 'system-ui, sans-serif', fontSize: '10px', color: '#bbbbbb' })
        .setOrigin(0.5, 1)
        .setDepth(9);
    }
  }

  private damage(b: Build): number {
    return (this.def.damage + this.def.damagePerLevel * (this.level - 1)) * b.stats.shikigamiDamage;
  }

  private cooldown(b: Build): number {
    return (this.def.cooldown * Math.pow(this.def.cooldownPerLevel, this.level - 1)) / b.stats.shikigamiRate;
  }

  private hitOpts(): HitOpts {
    return { tags: [this.def.tag], effects: this.def.effects, pierce: piercesArmor(this.def.effects), source: 'shikigami' };
  }

  /** Nearest living enemy in range of the player and outside the player's attack arc. */
  private pickTarget(w: ShikiWorld, range: number): Enemy | undefined {
    const half = (tuning.hitArcDeg / 2) * (Math.PI / 180);
    let best: Enemy | undefined;
    let bestD = range;
    for (const e of w.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - w.px, e.y - w.py);
      if (d > bestD) continue;
      const a = Math.atan2(e.y - w.py, e.x - w.px);
      if (Math.abs(Phaser.Math.Angle.Wrap(a - w.facing)) <= half) continue;
      best = e;
      bestD = d;
    }
    return best;
  }

  update(dt: number, w: ShikiWorld, slotX: number, slotY: number): void {
    this.cd -= dt;
    const dash = tuning.shikigamiDashSpeed;
    if (this.state === 'follow') {
      const k = Math.min(1, dt * 10);
      this.x += (slotX - this.x) * k;
      this.y += (slotY - this.y) * k;
    } else if (this.state === 'dash') {
      const t = this.target;
      this.dashT += dt;
      if (!t || !t.alive || this.dashT > 1) this.state = 'return';
      else {
        const d = Math.hypot(t.x - this.x, t.y - this.y);
        if (d <= t.size / 2 + 10) {
          w.hitEnemy(t, this.damage(w.build), this.hitOpts());
          this.state = 'return';
        } else {
          const s = Math.min(d, dash * dt);
          this.x += ((t.x - this.x) / d) * s;
          this.y += ((t.y - this.y) / d) * s;
        }
      }
    } else {
      const d = Math.hypot(slotX - this.x, slotY - this.y);
      if (d < 12) this.state = 'follow';
      else {
        const s = Math.min(d, dash * dt);
        this.x += ((slotX - this.x) / d) * s;
        this.y += ((slotY - this.y) / d) * s;
      }
    }

    if (this.cd <= 0 && this.state === 'follow') this.attack(w);

    this.bob += dt * 4;
    const floatY = this.y - 6 - Math.sin(this.bob) * 3;
    this.rect.setPosition(this.x, floatY);
    if (this.rect instanceof Phaser.GameObjects.Image) this.rect.setDepth(this.y + 1).setFlipX(w.px < this.x);
    this.label?.setPosition(this.x, this.y - 9).setText(this.level > 1 ? `${this.def.name} ${this.level}` : this.def.name);
  }

  private attack(w: ShikiWorld): void {
    const def = this.def;
    const target = this.pickTarget(w, def.range);
    if (!target) return;
    const dmg = this.damage(w.build);
    const angle = Math.atan2(target.y - this.y, target.x - this.x);
    switch (def.attack) {
      case 'bolt':
      case 'pierce':
        w.shoot({
          x: this.x,
          y: this.y,
          angle,
          speed: def.projectileSpeed ?? 400,
          range: def.range * 1.3,
          size: 8,
          damage: dmg,
          pierceThrough: def.attack === 'pierce',
          hit: this.hitOpts(),
          sprite: def.projectileSprite,
        });
        break;
      case 'chain':
        w.lightning(this.x, this.y, target.x, target.y);
        w.hitEnemy(target, dmg, this.hitOpts());
        w.chain(target, def.chains ?? 3, 150, dmg * 0.7, this.hitOpts());
        break;
      case 'nova': {
        const r = def.radius ?? 120;
        w.pulse(this.x, this.y, r);
        for (const e of w.enemies) {
          if (e.alive && Math.hypot(e.x - this.x, e.y - this.y) <= r + e.size / 2) w.hitEnemy(e, dmg, this.hitOpts());
        }
        break;
      }
      case 'bite':
        this.target = target;
        this.state = 'dash';
        this.dashT = 0;
        break;
    }
    this.cd = this.cooldown(w.build);
  }

  destroy(): void {
    this.rect.destroy();
    this.label?.destroy();
  }
}
