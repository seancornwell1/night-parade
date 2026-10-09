import Phaser from 'phaser';
import { ART_SCALE, hasArt } from '../art';
import { GREY, tuning } from '../config/tuning';
import type { BossStep, EnemyDef } from '../content/types';

// The behavior library. Each enemy is a data file (content/enemies) naming one of these
// fixed behaviors; the rift only chooses which behaviors appear and how they look.

export interface EnemyWorld {
  px: number;
  py: number;
  tokensUsed: number;
  hurtPlayer(damage: number): void;
  fireEnemyProjectile(x: number, y: number, angle: number, speed: number, size: number, damage: number, sprite?: string): void;
  summon(id: string, x: number, y: number): void;
}

type Mode = 'move' | 'windup' | 'charge';

export class Enemy {
  rect: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Image;
  private art: boolean;
  private baseTint: number;
  private bob = Math.random() * 10;
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  hp: number;
  maxHp: number;
  alive = true;
  stun = 0;
  pop = 0;
  popDur = 1;
  flash = 0;
  cooldown: number;
  hasToken = false;
  slowT = 0;
  slowAmt = 0;
  burnT = 0;
  burnDps = 0;
  burnTick = 0;
  mode: Mode = 'move';
  modeT = 0;
  dirX = 0;
  dirY = 0;
  struck = false;
  strafe = Math.random() < 0.5 ? 1 : -1;
  step = 0;
  stepT = 0;

  constructor(
    scene: Phaser.Scene,
    readonly def: EnemyDef,
    x: number,
    y: number,
  ) {
    this.x = x;
    this.y = y;
    this.maxHp = this.hp = def.hp * tuning.enemyHpMult;
    this.cooldown = Math.random() * (def.attackCooldown ?? 1);
    this.art = !!def.sprite && hasArt(def.sprite);
    this.baseTint = def.tint ? parseInt(def.tint.slice(1), 16) : 0xffffff;
    if (this.art) {
      this.rect = scene.add.image(x, y, def.sprite!).setOrigin(0.5, 0.75);
    } else {
      // Grey box until this enemy has art (night/rift enemies come in asset phase 3).
      const color = def.behavior === 'boss' ? GREY.boss : GREY.enemy;
      this.rect = scene.add.rectangle(x, y, def.size, def.size, color).setDepth(def.behavior === 'boss' ? 6 : 5);
    }
  }

  get isBoss(): boolean {
    return this.def.behavior === 'boss';
  }

  get size(): number {
    return this.def.size;
  }

  get usesTokens(): boolean {
    return this.def.usesTokens ?? !['ranged', 'boss'].includes(this.def.behavior);
  }

  get speed(): number {
    return this.def.speed * tuning.enemySpeedMult * (this.slowT > 0 ? 1 - this.slowAmt : 1);
  }

  get damage(): number {
    return this.def.damage * tuning.enemyDamageMult;
  }

  get reach(): number {
    return this.def.reach ?? this.def.size / 2 + 20;
  }

  get telegraphing(): boolean {
    return this.mode === 'windup';
  }

  /** A hit interrupts any attack in progress, except a boss's. */
  interrupt(): void {
    if (this.isBoss) return;
    if (this.mode !== 'move') this.cooldown = Math.max(this.cooldown, (this.def.attackCooldown ?? 1) * 0.5);
    this.mode = 'move';
    this.hasToken = false;
  }

  private finish(): void {
    this.mode = 'move';
    this.hasToken = false;
    this.cooldown = this.def.attackCooldown ?? 1.2;
  }

  update(dt: number, w: EnemyWorld, playerSize: number): void {
    this.flash -= dt;
    this.cooldown -= dt;
    this.slowT -= dt;
    if (this.pop > 0) this.pop -= dt;
    const fr = Math.exp(-tuning.enemyFriction * dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= fr;
    this.vy *= fr;
    if (this.stun > 0) {
      this.stun -= dt;
      return;
    }
    const dx = w.px - this.x;
    const dy = w.py - this.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d;
    const ny = dy / d;

    switch (this.def.behavior) {
      case 'swarmer':
      case 'splitter':
      case 'tank':
        this.melee(dt, w, d, nx, ny, playerSize);
        break;
      case 'charger':
        this.charger(dt, w, d, nx, ny, playerSize);
        break;
      case 'ranged':
        this.ranged(dt, w, d, nx, ny);
        break;
      case 'boss':
        this.boss(dt, w, d, nx, ny, playerSize);
        break;
    }
  }

  private move(nx: number, ny: number, speed: number, dt: number): void {
    this.x += nx * speed * dt;
    this.y += ny * speed * dt;
  }

  private tryToken(w: EnemyWorld, d: number): void {
    if (!this.usesTokens || this.hasToken || this.cooldown > 0) return;
    if (d <= tuning.enemyWaitRadius + 40 && w.tokensUsed < tuning.attackTokens) {
      this.hasToken = true;
      w.tokensUsed++;
    }
  }

  /** Enemies without an attack token crowd in to the wait ring and hold there. */
  private hover(d: number, nx: number, ny: number, dt: number): void {
    const ring = tuning.enemyWaitRadius + this.size / 2;
    if (d > ring) this.move(nx, ny, this.speed, dt);
    else if (d < ring - 15) this.move(-nx, -ny, this.speed * 0.5, dt);
  }

  private melee(dt: number, w: EnemyWorld, d: number, nx: number, ny: number, ps: number): void {
    if (this.mode === 'windup') {
      this.modeT -= dt;
      if (this.modeT <= 0) {
        if (d <= this.reach + ps / 2) w.hurtPlayer(this.damage);
        this.finish();
      }
      return;
    }
    this.tryToken(w, d);
    if (this.hasToken || !this.usesTokens) {
      if (d > this.reach * 0.8 + ps / 2) this.move(nx, ny, this.speed, dt);
      else if (this.cooldown <= 0) {
        this.mode = 'windup';
        this.modeT = this.def.windup ?? 0.5;
      }
    } else this.hover(d, nx, ny, dt);
  }

  private charger(dt: number, w: EnemyWorld, d: number, nx: number, ny: number, ps: number): void {
    if (this.mode === 'windup') {
      this.modeT -= dt;
      if (this.modeT <= 0) {
        this.mode = 'charge';
        this.modeT = this.def.chargeTime ?? 0.45;
        this.struck = false;
      }
      return;
    }
    if (this.mode === 'charge') {
      this.dash(dt, w, ps, this.def.chargeSpeed ?? 450);
      this.modeT -= dt;
      if (this.modeT <= 0) this.finish();
      return;
    }
    this.tryToken(w, d);
    if (this.hasToken || !this.usesTokens) {
      if (d > (this.def.chargeRange ?? 200)) this.move(nx, ny, this.speed, dt);
      else if (this.cooldown <= 0) {
        this.mode = 'windup';
        this.modeT = this.def.windup ?? 0.6;
        this.dirX = nx;
        this.dirY = ny;
      }
    } else this.hover(d, nx, ny, dt);
  }

  private dash(dt: number, w: EnemyWorld, ps: number, speed: number): void {
    const s = speed * (this.slowT > 0 ? 1 - this.slowAmt : 1);
    this.move(this.dirX, this.dirY, s, dt);
    if (!this.struck && Math.hypot(w.px - this.x, w.py - this.y) < (this.size + ps) / 2 + 4) {
      this.struck = true;
      w.hurtPlayer(this.damage);
    }
  }

  private ranged(dt: number, w: EnemyWorld, d: number, nx: number, ny: number): void {
    if (this.mode === 'windup') {
      this.modeT -= dt;
      if (this.modeT <= 0) {
        w.fireEnemyProjectile(
          this.x,
          this.y,
          Math.atan2(w.py - this.y, w.px - this.x),
          this.def.projectileSpeed ?? 260,
          this.def.projectileSize ?? 8,
          this.damage,
          this.def.projectileSprite,
        );
        this.finish();
      }
      return;
    }
    const pref = this.def.preferredRange ?? 250;
    if (d > pref + 40) this.move(nx, ny, this.speed, dt);
    else if (d < pref - 60) this.move(-nx, -ny, this.speed * 0.8, dt);
    else this.move(-ny * this.strafe, nx * this.strafe, this.speed * 0.4, dt);
    if (this.cooldown <= 0 && d <= pref + 120) {
      this.mode = 'windup';
      this.modeT = this.def.windup ?? 0.5;
    }
  }

  private boss(dt: number, w: EnemyWorld, d: number, nx: number, ny: number, ps: number): void {
    const pattern = this.def.pattern!;
    const step: BossStep = pattern[this.step % pattern.length];
    this.stepT += dt;
    const next = () => {
      this.step = (this.step + 1) % pattern.length;
      this.stepT = 0;
      this.mode = 'move';
      this.struck = false;
    };
    switch (step.kind) {
      case 'chase':
        if (this.mode === 'windup') {
          this.modeT -= dt;
          if (this.modeT <= 0) {
            if (d <= this.reach + ps / 2) w.hurtPlayer(this.damage);
            this.mode = 'move';
            this.cooldown = 1;
          }
        } else if (d > this.reach * 0.8 + ps / 2) this.move(nx, ny, this.speed, dt);
        else if (this.cooldown <= 0) {
          this.mode = 'windup';
          this.modeT = 0.6;
        }
        if (this.stepT >= step.time && this.mode === 'move') next();
        break;
      case 'charge':
        if (this.stepT < step.windup) {
          this.mode = 'windup';
          this.dirX = nx;
          this.dirY = ny;
        } else if (this.stepT < step.windup + step.time) {
          this.mode = 'charge';
          this.dash(dt, w, ps, step.speed);
        } else next();
        break;
      case 'burst':
        if (this.stepT < step.windup) this.mode = 'windup';
        else {
          const base = Math.atan2(ny, nx);
          for (let i = 0; i < step.count; i++) {
            w.fireEnemyProjectile(this.x, this.y, base + (i / step.count) * Math.PI * 2, step.projectileSpeed, 10, this.damage * 0.5);
          }
          next();
        }
        break;
      case 'summon':
        for (let i = 0; i < step.count; i++) {
          const a = (i / step.count) * Math.PI * 2;
          w.summon(step.enemy, this.x + Math.cos(a) * (this.size + 20), this.y + Math.sin(a) * (this.size + 20));
        }
        next();
        break;
    }
  }

  sync(now: number, playerX: number): void {
    const pop = this.pop > 0 ? 1 + 0.4 * Math.sin((1 - this.pop / this.popDur) * Math.PI) : 1;
    const pulse = this.telegraphing ? 1.12 : 1;
    if (this.art) {
      const img = this.rect as Phaser.GameObjects.Image;
      const scale = ART_SCALE * (this.def.spriteScale ?? 1) * pop * pulse;
      const moving = this.stun <= 0 && this.mode !== 'windup';
      this.bob += moving ? 0.016 * (this.def.speed / 10) : 0;
      img.setPosition(this.x, this.y - (moving ? Math.abs(Math.sin(this.bob)) * 3 : 0));
      img.setScale(scale * (1 + 0.03 * Math.sin(this.bob * 2)), scale);
      img.setFlipX(playerX < this.x);
      img.setDepth(this.y);
      img.setTintMode(this.flash > 0 ? Phaser.TintModes.FILL : Phaser.TintModes.MULTIPLY);
      if (this.flash > 0) img.setTint(0xffffff);
      else if (this.telegraphing) img.setTint(0xffd27f);
      else if (this.burnT > 0 && Math.floor(now / 110) % 2) img.setTint(0xff9a5a);
      else if (this.stun > 0.3) img.setTint(0xb8f0ff);
      else if (this.slowT > 0) img.setTint(0x9fd8ff);
      else img.setTint(this.baseTint);
      img.setAlpha(1);
      return;
    }
    const rect = this.rect as Phaser.GameObjects.Rectangle;
    let c: number = this.isBoss ? GREY.boss : this.hasToken ? GREY.enemyToken : GREY.enemy;
    if (this.telegraphing) c = GREY.enemyWindup;
    if (this.burnT > 0 && Math.floor(now / 110) % 2) c = GREY.enemyToken;
    if (this.flash > 0) c = GREY.enemyFlash;
    const s = this.size * pop * pulse;
    rect.setPosition(this.x, this.y).setFillStyle(c).setDisplaySize(s, s);
    rect.setAlpha(this.slowT > 0 ? 0.7 : 1);
  }
}
