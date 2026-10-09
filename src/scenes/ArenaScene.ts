import Phaser from 'phaser';
import { ART_SCALE, hasArt, hasSound, SHEETS } from '../art';
import { ARENA, GREY, tuning } from '../config/tuning';
import { content, currentRift, enemy as enemyDef, mainCharacter } from '../content';
import type { EnemyDef, HitEffect, RiftDef, Spawn, Tag } from '../content/types';
import { Build } from '../game/build';
import { Enemy, type EnemyWorld } from '../game/enemies';
import { piercesArmor, type HitOpts } from '../game/hit';
import { actions, controls, status, type Phase, type RunResult } from '../game/shared';
import { Familiar, type ShikiWorld } from '../game/shikigami';
import { buildStage, type BuiltStage } from '../game/stage';

// The classic run: day, dusk, night. Day art comes from assets/day; anything without art yet
// is still a grey box (listed in ASSETS_NEEDED.md). Grey boxes never ship.

const DEG = Math.PI / 180;

type PlayerState = 'free' | 'attack' | 'charging' | 'chargeAttack' | 'dodge';
type ChargeKind = 'launcher' | 'sweep' | 'big';

type Visual = Phaser.GameObjects.Rectangle | Phaser.GameObjects.Image;

interface Fx {
  obj: Visual;
  rotOffset?: number;
  t: number;
  dur: number;
  alpha: number;
  follow?: boolean;
  from?: number;
  to?: number;
  grow?: number;
}

interface Projectile {
  rect: Visual;
  x: number;
  y: number;
  vx: number;
  vy: number;
  travelled: number;
  range: number;
  radius: number;
  damage: number;
  owner: 'enemy' | 'player';
  pierceThrough: boolean;
  hit?: HitOpts;
  hitSet: Set<Enemy>;
  dead: boolean;
}

interface Pickup {
  rect: Visual;
  x: number;
  y: number;
  kind: 'xp' | 'heal';
  value: number;
  pulled: boolean;
}

interface Shrine {
  sprite: Phaser.GameObjects.Image;
  bar: Phaser.GameObjects.Rectangle;
  x: number;
  y: number;
  progress: number;
  cooldown: number;
}

const wrapAngle = (a: number) => Phaser.Math.Angle.Wrap(a);

export class ArenaScene extends Phaser.Scene implements EnemyWorld, ShikiWorld {
  private stage!: BuiltStage;
  private player!: Phaser.GameObjects.Sprite;
  /** Draw scale of the hero (art pixels to world units). */
  private heroScale = ART_SCALE;
  /** Which hero animations exist (user-provided sheets); the rest stays code-animated. */
  private heroAnims = { idle: false, run: false, attack: false };
  private weapon!: { key: string; offset: number };
  private music?: Phaser.Sound.BaseSound;
  private lastXpSound = 0;
  private moving = false;
  private arcLines: Phaser.GameObjects.Rectangle[] = [];
  private snapMarker!: Phaser.GameObjects.Rectangle;
  enemies: Enemy[] = [];
  private familiars: Familiar[] = [];
  private projectiles: Projectile[] = [];
  private pickups: Pickup[] = [];
  private shrines: Shrine[] = [];
  private fx: Fx[] = [];

  rift!: RiftDef;
  build!: Build;

  px = ARENA.width / 2;
  py = ARENA.height / 2;
  facing = 0;
  tokensUsed = 0;
  private state: PlayerState = 'free';
  private stateT = 0;
  private comboIndex = 0;
  private comboTimer = 0;
  private curHit = 0;
  private hitApplied = false;
  private lastHitFacing = 0;
  private cooldown = 0;
  private dodgeCd = 0;
  private dodgeDir = 0;
  private hurtT = 0;
  private hp = 0;
  private chargeKind: ChargeKind = 'launcher';
  private attackHeld = false;
  private holdT = 0;
  private bufferT = 0;
  private hitStopT = 0;

  private phase: Phase = 'day';
  private phaseT = 0;
  private marchAngle = 0;
  private marchT = 0;
  private spawnAcc = 0;
  private bossesSpawned = 0;
  private level = 1;
  private xp = 0;
  private pendingPicks = 0;
  private rerolls = 0;
  private stats!: Omit<RunResult, 'victory' | 'rift' | 'phase' | 'level' | 'upgrades' | 'build'>;

  private keys?: Record<string, Phaser.Input.Keyboard.Key>;

  constructor() {
    super('Arena');
  }

  create(): void {
    this.enemies = [];
    this.familiars = [];
    this.projectiles = [];
    this.pickups = [];
    this.shrines = [];
    this.fx = [];
    this.arcLines = [];
    this.rift = currentRift();
    this.build = new Build(this.rift);
    this.px = ARENA.width / 2;
    this.py = ARENA.height / 2;
    this.facing = 0;
    this.state = 'free';
    this.comboIndex = this.cooldown = this.dodgeCd = this.hurtT = this.hitStopT = 0;
    this.attackHeld = false;
    this.bufferT = 0;
    this.hp = this.maxHp;
    this.phase = 'day';
    this.phaseT = this.spawnAcc = this.bossesSpawned = this.marchT = 0;
    this.marchAngle = Math.random() * Math.PI * 2;
    this.level = 1;
    this.xp = 0;
    this.pendingPicks = 0;
    this.rerolls = Math.round(tuning.rerollsPerRun);
    this.stats = { time: 0, kills: 0, bosses: 0, damageDealt: 0, damageTaken: 0, healed: 0, xp: 0, shrines: 0, killsBy: {} };
    status.offer = null;
    status.kills = 0;
    actions.pick = (i) => this.pick(i);
    actions.reroll = () => this.reroll();

    const shrineSpots = this.shrineSpots();
    this.stage = buildStage(this, content.day.stage, ARENA.width, ARENA.height, [
      { x: this.px, y: this.py, r: content.day.stage.clearRadius },
      ...shrineSpots.map((s) => ({ ...s, r: tuning.shrineRadius + 40 })),
      ...content.day.stage.landmarks.map((l) => ({ x: l.x, y: l.y, r: 160 })),
    ]);
    this.buildShrines(shrineSpots);

    for (let i = 0; i < 2; i++) {
      this.arcLines.push(this.add.rectangle(0, 0, 10, 2, GREY.arc, 0.3).setOrigin(0, 0.5).setVisible(false));
    }
    this.snapMarker = this.add.rectangle(0, 0, 10, 10, GREY.arc, 0.8).setVisible(false);
    const hero = mainCharacter();
    const weapon = content.weapons.get(hero.weapon)!;
    this.weapon = { key: weapon.sprite, offset: weapon.angleOffsetDeg * DEG };
    this.heroScale = ART_SCALE * (hero.displayScale ?? 1);
    const anims = hero.animations ?? {};
    const first = anims.idle ?? anims.run ?? anims.attack;
    this.player = this.add.sprite(this.px, this.py, first ? first.sheet : hero.sprite);
    if (first) this.player.setOrigin(...SHEETS[first.sheet].anchor);
    else this.player.setOrigin(0.5, 0.78);
    for (const name of ['idle', 'run', 'attack'] as const) {
      const a = anims[name];
      if (!a) continue;
      const key = `hero-${name}`;
      if (!this.anims.exists(key)) {
        this.anims.create({ key, frames: this.anims.generateFrameNumbers(a.sheet, {}), frameRate: a.fps, repeat: name === 'attack' ? 0 : -1 });
      }
      this.heroAnims[name] = true;
    }
    if (this.heroAnims.idle) this.player.play('hero-idle');
    this.player.setScale(this.heroScale);
    this.arcLines.forEach((l) => l.setDepth(5000));
    this.snapMarker.setDepth(5000);
    this.startMusic(false);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, ARENA.width, ARENA.height);
    cam.startFollow(this.player, true, tuning.cameraLerp, tuning.cameraLerp);

    const kb = this.input.keyboard;
    if (kb) {
      kb.removeAllKeys(true);
      this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,J,K,SPACE,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
      for (const k of [this.keys.J, this.keys.SPACE]) {
        k.on('down', () => controls.events.push('attackDown'));
        k.on('up', () => controls.events.push('attackUp'));
      }
      for (const k of [this.keys.K, this.keys.SHIFT]) k.on('down', () => controls.events.push('dodge'));
    }

    const p = (t: Tag) => content.paths.get(t)!.name;
    this.banner(`Tonight: ${this.rift.name}`, `Resists ${p(this.rift.resisted)} · Fears ${p(this.rift.feared)} · ${p(this.rift.tag)} rift`, 5000);
    this.scene.launch('Hud');
  }

  private get maxHp(): number {
    return tuning.playerMaxHp + (this.build?.stats.maxHp ?? 0);
  }

  private durations(): [number, number, number] {
    if (tuning.debugShortRun >= 1) return [120, 15, 120];
    return [tuning.dayDuration, tuning.duskDuration, tuning.nightDuration];
  }

  private banner(title: string, sub: string, ms: number): void {
    status.banner = { title, sub, until: this.time.now + ms };
  }

  private shrineSpots(): { x: number; y: number }[] {
    const n = Math.round(tuning.shrineCount);
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + Math.PI / 4;
      return { x: ARENA.width / 2 + Math.cos(a) * 750, y: ARENA.height / 2 + Math.sin(a) * 750 };
    });
  }

  private buildShrines(spots: { x: number; y: number }[]): void {
    const art = content.day.stage.shrines;
    spots.forEach(({ x, y }, i) => {
      const sprite = this.add.image(x, y, art[i % art.length]).setOrigin(0.5, 0.85).setScale(ART_SCALE).setDepth(y);
      // Progress bar: grey scaffolding until generated UI bar frames exist (ASSETS_NEEDED.md).
      const bar = this.add.rectangle(x - 30, y - 110, 0, 6, GREY.heal).setOrigin(0, 0.5).setDepth(5000);
      this.shrines.push({ sprite, bar, x, y, progress: 0, cooldown: 0 });
    });
  }

  // ---------------------------------------------------------------- sound

  private sfx(key: string, volume = 1): void {
    const k = `audio/${key}`;
    if (hasSound(k) && tuning.sfxVolume > 0) this.sound.play(k, { volume: tuning.sfxVolume * volume });
  }

  /** Day theme by day; the night track at night, or the day theme until one exists. */
  private startMusic(night: boolean): void {
    this.music?.stop();
    const own = night && hasSound('audio/night-theme');
    const key = own ? 'audio/night-theme' : 'audio/day-theme';
    if (!hasSound(key)) return;
    this.music = this.sound.add(key, { loop: true, volume: tuning.musicVolume });
    this.music.play();
  }

  // ---------------------------------------------------------------- input

  private stick(): { x: number; y: number; mag: number; angle: number } {
    let x = controls.moveX;
    let y = controls.moveY;
    if (this.keys) {
      const k = this.keys;
      const kx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
      const ky = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
      if (kx || ky) {
        const l = Math.hypot(kx, ky);
        x = kx / l;
        y = ky / l;
      }
    }
    const mag = Math.min(1, Math.hypot(x, y));
    return { x, y, mag, angle: Math.atan2(y, x) };
  }

  private handleInput(realDt: number): void {
    const events = controls.events.splice(0);
    if (status.offer || this.phase === 'over') {
      this.attackHeld = false;
      return;
    }
    for (const ev of events) {
      if (ev === 'attackDown') {
        this.attackHeld = true;
        this.holdT = 0;
      } else if (ev === 'attackUp') {
        if (!this.attackHeld) continue;
        this.attackHeld = false;
        if (this.state === 'charging') this.releaseCharge();
        else if (this.holdT < tuning.chargeHoldTime) this.bufferT = tuning.inputBuffer || 0.0001;
      } else if (ev === 'dodge') {
        this.tryDodge();
      } else if (ev === 'reset') {
        this.attackHeld = false;
        this.bufferT = 0;
        if (this.state === 'charging') this.setState('free');
      }
    }
    if (this.attackHeld) this.holdT += realDt;
  }

  // ---------------------------------------------------------------- update

  update(_time: number, deltaMs: number): void {
    if (this.phase === 'over') return;
    const realDt = Math.min(deltaMs / 1000, 0.05);
    this.handleInput(realDt);

    if (!status.offer && this.pendingPicks > 0) this.openOffer(this.phase === 'dusk' ? 'Dusk: choose an upgrade' : `Level ${this.level}`);

    let dt = status.offer ? 0 : realDt;
    if (dt > 0 && this.hitStopT > 0) {
      this.hitStopT -= realDt;
      dt = 0;
    }

    if (dt > 0) {
      this.updateRun(dt);
      if ((this.phase as Phase) === 'over') return;
      this.updatePlayer(dt);
      this.updateEnemies(dt);
      this.updateFamiliars(dt);
      this.updateProjectiles(dt);
      this.updatePickups(dt);
      this.updateShrines(dt);
      this.resolveCollisions();
    }
    this.updateFx(dt);
    this.syncVisuals();

    const cam = this.cameras.main;
    cam.setZoom(this.scale.width / tuning.cameraViewWidth);
    cam.setLerp(tuning.cameraLerp, tuning.cameraLerp);

    const [dDay, dDusk, dNight] = this.durations();
    const len = this.phase === 'day' ? dDay : this.phase === 'dusk' ? dDusk : dNight;
    status.hp = Math.max(0, Math.ceil(this.hp));
    status.maxHp = this.maxHp;
    status.combo = this.state === 'attack' ? this.curHit + 1 : this.comboIndex;
    status.cooldown = this.cooldown > 0;
    status.charging = this.state === 'charging' ? this.chargeKindNow() : '';
    status.kills = this.stats.kills;
    status.level = this.level;
    status.xp = this.xp;
    status.xpNext = this.xpNeeded();
    status.phase = this.phase;
    status.phaseLeft = Math.max(0, len - this.phaseT);
    status.build = this.build.summary();
    status.shikigami = this.familiars.map((f) => (f.level > 1 ? `${f.def.name} ${f.level}` : f.def.name)).join(', ');
  }

  // ---------------------------------------------------------------- run phases and spawns

  private updateRun(dt: number): void {
    this.phaseT += dt;
    this.stats.time += dt;
    const [dDay, dDusk, dNight] = this.durations();
    if (this.phase === 'day') {
      this.spawn(dt, tuning.daySpawnStart, tuning.daySpawnEnd, this.phaseT / dDay, [...content.day.enemies, ...this.rift.omens]);
      if (this.phaseT >= dDay) this.startDusk();
    } else if (this.phase === 'dusk') {
      if (this.phaseT >= dDusk) this.startNight();
    } else if (this.phase === 'night') {
      this.spawn(dt, tuning.nightSpawnStart, tuning.nightSpawnEnd, this.phaseT / dNight, this.rift.enemies);
      const bosses = Math.round(tuning.nightBossCount);
      if (this.bossesSpawned < bosses && this.phaseT >= ((this.bossesSpawned + 1) / (bosses + 1)) * dNight) {
        this.bossesSpawned++;
        this.spawnBoss();
      }
      if (this.phaseT >= dNight) this.endRun(true);
    }
  }

  private startDusk(): void {
    this.phase = 'dusk';
    this.phaseT = 0;
    // Calm: the day's demons melt away, and one upgrade pick is guaranteed.
    for (const e of this.enemies) this.removeEnemy(e);
    for (const p of this.projectiles) if (p.owner === 'enemy') p.dead = true;
    if (this.music) this.tweens.add({ targets: this.music, volume: 0, duration: 3000 });
    this.pendingPicks++;
    this.banner('Dusk', 'The lanterns are lit. The parade is coming.', 3500);
  }

  private startNight(): void {
    this.phase = 'night';
    this.phaseT = 0;
    this.spawnAcc = 0;
    this.marchAngle = Math.random() * Math.PI * 2;
    for (const g of this.stage.ground) g.setTint(0x6a6fa8);
    for (const d of this.stage.decor) d.setTint(0x6a6fa8);
    for (const sh of this.shrines) sh.sprite.setTint(0x8a8fc0);
    this.startMusic(true);
    this.banner('The Night Parade', `${this.rift.name}. Night pays double XP.`, 4000);
  }

  private spawn(dt: number, start: number, end: number, k: number, roster: Spawn[]): void {
    if (tuning.marchShiftTime > 0) {
      this.marchT += dt;
      if (this.marchT >= tuning.marchShiftTime) {
        this.marchT = 0;
        this.marchAngle += (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.6);
      }
    }
    this.spawnAcc += Phaser.Math.Linear(start, end, Math.min(1, k)) * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.enemies.length >= tuning.maxEnemies) continue;
      this.spawnGroup(enemyDef(this.pickWeighted(roster)));
    }
  }

  private pickWeighted(list: Spawn[]): string {
    const total = list.reduce((s, x) => s + x.weight, 0);
    let r = Math.random() * total;
    for (const s of list) {
      r -= s.weight;
      if (r <= 0) return s.enemy;
    }
    return list[list.length - 1].enemy;
  }

  /** Mostly a march from one direction, with stragglers from the flanks. */
  private spawnGroup(def: EnemyDef): void {
    const straggler = Math.random() < tuning.stragglerChance;
    const spread = tuning.marchSpreadDeg * DEG;
    const a = straggler
      ? this.marchAngle + (Math.random() < 0.5 ? -1 : 1) * Math.PI * 0.5 + (Math.random() - 0.5) * 0.7
      : this.marchAngle + (Math.random() * 2 - 1) * spread;
    const bx = this.px + Math.cos(a) * tuning.spawnDistance;
    const by = this.py + Math.sin(a) * tuning.spawnDistance;
    const n = def.groupSize ?? 1;
    for (let i = 0; i < n; i++) this.addEnemy(def, bx + (Math.random() - 0.5) * 80, by + (Math.random() - 0.5) * 80);
  }

  private spawnBoss(): void {
    const def = enemyDef(this.rift.boss);
    this.addEnemy(def, this.px + Math.cos(this.marchAngle) * tuning.spawnDistance, this.py + Math.sin(this.marchAngle) * tuning.spawnDistance);
    this.banner(def.name, 'A boss joins the parade.', 3000);
  }

  private addEnemy(def: EnemyDef, x: number, y: number): Enemy {
    const m = def.size / 2 + 14;
    const e = new Enemy(this, def, Phaser.Math.Clamp(x, m, ARENA.width - m), Phaser.Math.Clamp(y, m, ARENA.height - m));
    this.enemies.push(e);
    return e;
  }

  summon(id: string, x: number, y: number): void {
    if (this.enemies.length < tuning.maxEnemies + 30) this.addEnemy(enemyDef(id), x, y);
  }

  private removeEnemy(e: Enemy): void {
    e.alive = false;
    this.tweens.add({ targets: e.rect, alpha: 0, duration: 400, onComplete: () => e.rect.destroy() });
  }

  private endRun(victory: boolean): void {
    this.phase = 'over';
    status.offer = null;
    const result: RunResult = {
      ...this.stats,
      victory,
      rift: this.rift.name,
      phase: victory ? 'night' : (status.phase as Phase),
      level: this.level,
      upgrades: this.build.taken,
      build: this.build.summary(),
    };
    if (!victory) this.sfx('death');
    this.music?.stop();
    this.scene.stop('Hud');
    this.scene.start('Result', result);
  }

  // ---------------------------------------------------------------- player

  private updatePlayer(dt: number): void {
    const s = this.stick();
    this.moving = s.mag > 0;
    this.stateT += dt;
    this.cooldown -= dt;
    this.dodgeCd -= dt;
    this.hurtT -= dt;
    if (this.bufferT > 0) this.bufferT -= dt;
    const speed = tuning.moveSpeed * this.build.stats.moveSpeed;

    if (this.state === 'free') {
      if (this.comboIndex > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) this.comboIndex = 0;
      }
      if (this.attackHeld && this.holdT >= tuning.chargeHoldTime && this.cooldown <= 0) {
        this.setState('charging');
      } else if (this.bufferT > 0 && this.cooldown <= 0) {
        this.bufferT = 0;
        this.startHit();
      }
    }

    switch (this.state) {
      case 'free':
        this.move(s, speed, dt);
        if (s.mag > 0) this.facing = s.angle;
        break;
      case 'charging':
        this.move(s, speed * tuning.chargeMoveMult, dt);
        if (s.mag > 0) this.facing = s.angle;
        break;
      case 'attack':
      case 'chargeAttack': {
        this.move(s, speed * tuning.attackMoveMult, dt);
        if (this.stateT - dt < tuning.lungeTime) {
          const lt = Math.min(dt, tuning.lungeTime - (this.stateT - dt));
          const v = tuning.lungeDistance / tuning.lungeTime;
          this.px += Math.cos(this.facing) * v * lt;
          this.py += Math.sin(this.facing) * v * lt;
        }
        const isCharge = this.state === 'chargeAttack';
        const duration = isCharge ? tuning.chargeRecovery : tuning.hitDuration;
        if (!this.hitApplied && (this.stateT >= tuning.hitActiveDelay || this.stateT >= duration)) {
          this.hitApplied = true;
          if (isCharge) this.applyCharge();
          else this.applyHit(this.curHit);
        }
        if (this.stateT >= duration) {
          if (isCharge || this.curHit === 3) {
            this.comboIndex = 0;
          } else {
            this.comboIndex = this.curHit + 1;
            this.comboTimer = tuning.comboWindow;
          }
          this.setState('free');
        }
        break;
      }
      case 'dodge': {
        const T = tuning.dodgeTime;
        const t0 = Math.min(this.stateT - dt, T);
        const t1 = Math.min(this.stateT, T);
        const dist = ((2 * tuning.dodgeDistance) / T) * (t1 - t0 - (t1 * t1 - t0 * t0) / (2 * T));
        this.px += Math.cos(this.dodgeDir) * dist;
        this.py += Math.sin(this.dodgeDir) * dist;
        if (this.stateT >= T) {
          this.dodgeCd = tuning.dodgeCooldown;
          this.setState('free');
        }
        break;
      }
    }

    const half = tuning.playerSize / 2 + 12;
    this.px = Phaser.Math.Clamp(this.px, half, ARENA.width - half);
    this.py = Phaser.Math.Clamp(this.py, half, ARENA.height - half);
  }

  private move(s: { x: number; y: number }, speed: number, dt: number): void {
    this.px += s.x * speed * dt;
    this.py += s.y * speed * dt;
  }

  private setState(st: PlayerState): void {
    this.state = st;
    this.stateT = 0;
  }

  private get invulnerable(): boolean {
    return (this.state === 'dodge' && this.stateT < tuning.dodgeIFrames) || this.hurtT > 0 || tuning.debugInvincible >= 1;
  }

  hurtPlayer(damage: number): void {
    if (this.invulnerable || this.phase === 'over') return;
    this.hp -= damage;
    this.stats.damageTaken += damage;
    this.sfx('hurt');
    this.hurtT = tuning.playerHurtIFrames;
    if (tuning.shakeDuration > 0) this.cameras.main.shake(tuning.shakeDuration * 1000, tuning.hurtShakeIntensity, true);
    if (this.hp <= 0) this.endRun(false);
  }

  private heal(amount: number): void {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.stats.healed += this.hp - before;
  }

  // ---------------------------------------------------------------- combo

  private aimNextHit(): number {
    const s = this.stick();
    const desired = s.mag > 0 ? s.angle : this.facing;
    const clamp = tuning.turnClampDeg * DEG;
    const midString = this.comboIndex > 0;
    const base = midString ? this.lastHitFacing : desired;
    let dir = desired;
    if (midString) dir = base + Phaser.Math.Clamp(wrapAngle(desired - base), -clamp, clamp);
    const target = this.snapTarget(base, clamp);
    if (target) dir = Math.atan2(target.y - this.py, target.x - this.px);
    return wrapAngle(dir);
  }

  private snapTarget(base: number, clamp: number): Enemy | undefined {
    let best: Enemy | undefined;
    let bestD = tuning.snapRange;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - this.px, e.y - this.py) - e.size / 2;
      if (d > bestD) continue;
      if (Math.abs(wrapAngle(Math.atan2(e.y - this.py, e.x - this.px) - base)) > clamp) continue;
      best = e;
      bestD = d;
    }
    return best;
  }

  private startHit(): void {
    this.facing = this.aimNextHit();
    this.lastHitFacing = this.facing;
    this.curHit = this.comboIndex;
    this.hitApplied = false;
    this.setState('attack');
    this.playAttackAnim(tuning.hitDuration);
  }

  /** Plays the hero's attack sheet once, stretched to the swing's length. */
  private playAttackAnim(seconds: number): void {
    if (!this.heroAnims.attack) return;
    this.player.play({ key: 'hero-attack', duration: seconds * 1000 }, false);
  }

  private chargeKindNow(): ChargeKind {
    if (this.comboIndex === 0) return 'launcher';
    return this.comboIndex < 3 ? 'sweep' : 'big';
  }

  private releaseCharge(): void {
    this.sfx('charge');
    this.chargeKind = this.chargeKindNow();
    this.facing = this.aimNextHit();
    this.lastHitFacing = this.facing;
    this.hitApplied = false;
    this.setState('chargeAttack');
    this.playAttackAnim(tuning.chargeRecovery);
  }

  private applyHit(i: number): void {
    const slot = i < 3 ? 'string' : 'finisher';
    const { effects, tags } = this.build.forSlot(slot);
    const hit: HitOpts = { tags, effects, pierce: piercesArmor(effects), source: 'combo' };
    if (i < 3) {
      const n = this.hitArc(tuning.hitRange, tuning.hitArcDeg, tuning.hitDamage, tuning.hitKnockback, 0, hit);
      this.spawnSwing(tuning.hitRange, 10, this.facing, tuning.hitArcDeg, 0.08, i % 2 === 1);
      if (n) {
        this.feel(tuning.hitStop, tuning.shakeIntensity);
        this.sfx('hit');
      }
      this.launchWaves(effects, tags, tuning.hitDamage);
    } else {
      const n = this.hitArc(tuning.finisherRadius, 360, tuning.finisherDamage, tuning.finisherKnockback, 0, hit);
      this.spawnSwing(tuning.finisherRadius, 12, this.facing, 360, 0.14, false);
      this.sfx('finisher');
      this.cooldown = tuning.finisherCooldown * this.build.stats.finisherCooldown;
      if (n) this.feel(tuning.finisherHitStop, tuning.finisherShakeIntensity);
      this.launchWaves(effects, tags, tuning.finisherDamage);
    }
  }

  private applyCharge(): void {
    const { effects, tags } = this.build.forSlot('charge');
    const hit: HitOpts = { tags, effects, pierce: piercesArmor(effects), source: 'combo' };
    let n = 0;
    switch (this.chargeKind) {
      case 'launcher':
        n = this.hitArc(tuning.launcherRange, tuning.launcherArcDeg, tuning.launcherDamage, 60, tuning.launcherStun, hit);
        this.spawnSwing(tuning.launcherRange, 26, this.facing, 0, 0.16, false);
        if (n) this.feel(tuning.finisherHitStop, tuning.finisherShakeIntensity);
        this.launchWaves(effects, tags, tuning.launcherDamage);
        break;
      case 'sweep':
        n = this.hitArc(tuning.sweepRadius, tuning.sweepArcDeg, tuning.sweepDamage, tuning.sweepKnockback, 0, hit);
        this.spawnSwing(tuning.sweepRadius, 16, this.facing, tuning.sweepArcDeg, 0.14, false);
        if (n) this.feel(tuning.finisherHitStop, tuning.finisherShakeIntensity);
        this.launchWaves(effects, tags, tuning.sweepDamage);
        break;
      case 'big':
        n = this.hitArc(tuning.bigRadius, 360, tuning.bigDamage, tuning.bigKnockback, 0, hit);
        this.spawnSwing(tuning.bigRadius, 18, this.facing, 720, 0.24, false);
        this.cooldown = tuning.finisherCooldown * this.build.stats.finisherCooldown;
        if (n) this.feel(tuning.bigHitStop, tuning.finisherShakeIntensity * 1.5);
        this.launchWaves(effects, tags, tuning.bigDamage);
        break;
    }
  }

  /** Spirit waves fire with the swing whether or not it connects. */
  private launchWaves(effects: HitEffect[], tags: Tag[], baseDamage: number): void {
    for (const ef of effects) {
      if (ef.kind !== 'wave') continue;
      this.shoot({
        x: this.px,
        y: this.py,
        angle: this.facing,
        speed: ef.speed,
        range: ef.range,
        size: 12,
        width: ef.width,
        damage: baseDamage * ef.damagePct * this.build.stats.damage,
        pierceThrough: true,
        hit: { tags, pierce: true, source: 'effect' },
        sprite: 'fx/spirit-wave',
      });
    }
  }

  private hitArc(range: number, arcDeg: number, damage: number, knockback: number, stun: number, hit: HitOpts): number {
    const half = (arcDeg * DEG) / 2;
    let n = 0;
    for (const e of [...this.enemies]) {
      if (!e.alive) continue;
      const dx = e.x - this.px;
      const dy = e.y - this.py;
      const d = Math.hypot(dx, dy);
      if (d > range + e.size / 2) continue;
      if (arcDeg < 360 && Math.abs(wrapAngle(Math.atan2(dy, dx) - this.facing)) > half) continue;
      n++;
      const nx = d > 0.001 ? dx / d : Math.cos(this.facing);
      const ny = d > 0.001 ? dy / d : Math.sin(this.facing);
      this.hitEnemy(e, damage, { ...hit, kx: nx * knockback, ky: ny * knockback, stun });
    }
    return n;
  }

  // ---------------------------------------------------------------- damage

  /** All damage to enemies goes through here: rift matchups, armor, status effects, death. */
  hitEnemy(e: Enemy, amount: number, hit: HitOpts): void {
    if (!e.alive) return;
    const wasSlowed = e.slowT > 0;
    let mult = this.build.tagMult(hit.tags);
    if (hit.source === 'combo') mult *= this.build.stats.damage;
    const armor = hit.pierce ? 0 : (e.def.armor ?? 0);
    const dmg = amount * mult * (1 - armor);
    e.hp -= dmg;
    this.stats.damageDealt += dmg;
    const resist = e.def.knockbackResist ?? 0;
    if (hit.source !== 'effect' || hit.kx) e.flash = tuning.enemyFlashTime;
    if (hit.kx !== undefined && hit.ky !== undefined) {
      e.vx = hit.kx * (1 - resist);
      e.vy = hit.ky * (1 - resist);
    }
    if (hit.source === 'combo') {
      const stun = Math.max(tuning.enemyHitStun, hit.stun ?? 0) * (1 - resist);
      e.stun = Math.max(e.stun, stun);
      if (hit.stun) {
        e.pop = e.popDur = hit.stun;
      }
      e.interrupt();
    }
    for (const ef of hit.effects ?? []) {
      switch (ef.kind) {
        case 'burn':
          e.burnT = Math.max(e.burnT, ef.duration);
          e.burnDps = Math.max(e.burnDps, ef.dps + (ef.maxHpPct ?? 0) * e.maxHp);
          break;
        case 'slow':
          e.slowAmt = e.slowT > 0 ? Math.max(e.slowAmt, ef.amount) : ef.amount;
          e.slowT = Math.max(e.slowT, ef.duration);
          break;
        case 'freeze':
          if (wasSlowed && !e.isBoss) {
            e.stun = Math.max(e.stun, ef.duration * (1 - resist));
            e.pop = e.popDur = 0.3;
            e.interrupt();
          }
          break;
        case 'chain':
          if (hit.source !== 'effect') {
            this.chain(e, ef.count, ef.range, amount * ef.damagePct * (hit.source === 'combo' ? this.build.stats.damage : 1), {
              tags: ['thunder'],
              source: 'effect',
            });
          }
          break;
      }
    }
    if (e.hp <= 0) this.kill(e);
  }

  chain(from: Enemy, count: number, range: number, damage: number, hit: HitOpts, already = new Set<Enemy>([from])): void {
    let cur = from;
    for (let i = 0; i < count; i++) {
      let next: Enemy | undefined;
      let bestD = range;
      for (const e of this.enemies) {
        if (!e.alive || already.has(e)) continue;
        const d = Math.hypot(e.x - cur.x, e.y - cur.y);
        if (d < bestD) {
          bestD = d;
          next = e;
        }
      }
      if (!next) break;
      this.lightning(cur.x, cur.y, next.x, next.y);
      already.add(next);
      this.hitEnemy(next, damage, { ...hit, source: 'effect' });
      cur = next;
    }
  }

  private kill(e: Enemy): void {
    e.alive = false;
    this.stats.kills++;
    this.stats.killsBy[e.def.name] = (this.stats.killsBy[e.def.name] ?? 0) + 1;
    this.tweens.add({
      targets: e.rect,
      alpha: 0,
      scaleX: e.rect.scaleX * 1.4,
      scaleY: e.rect.scaleY * 1.4,
      duration: 180,
      onComplete: () => e.rect.destroy(),
    });
    const xp = e.def.xp * (this.phase === 'night' ? tuning.nightXpMult : 1);
    this.dropXp(e.x, e.y, xp);
    if (Math.random() < tuning.healDropChance) this.dropPickup(e.x, e.y, 'heal', tuning.healDropAmount);
    if (e.isBoss) {
      this.stats.bosses++;
      this.dropPickup(e.x, e.y, 'heal', tuning.healDropAmount * 2);
      // Stand-in for the boss's weapon/shikigami drop (rewards come in session 6).
      this.pendingPicks++;
      this.banner('Boss defeated', 'A free upgrade pick.', 2500);
    }
    if (e.def.splitInto) {
      const def = enemyDef(e.def.splitInto);
      for (let i = 0; i < (e.def.splitCount ?? 2); i++) {
        const a = Math.random() * Math.PI * 2;
        const c = this.addEnemy(def, e.x + Math.cos(a) * 12, e.y + Math.sin(a) * 12);
        c.vx = Math.cos(a) * 220;
        c.vy = Math.sin(a) * 220;
        c.stun = 0.25;
      }
    }
    const explode = this.build.has('explodeOnDeath');
    if (explode && explode.kind === 'explodeOnDeath' && e.burnT > 0) {
      this.pulse(e.x, e.y, explode.radius);
      for (const o of [...this.enemies]) {
        if (o.alive && Math.hypot(o.x - e.x, o.y - e.y) <= explode.radius + o.size / 2) {
          this.hitEnemy(o, e.maxHp * explode.damagePct, { tags: ['fire'], effects: [{ kind: 'burn', dps: 4, duration: 3 }], source: 'effect' });
        }
      }
    }
  }

  private feel(stop: number, shake: number): void {
    this.hitStopT = Math.max(this.hitStopT, stop);
    if (tuning.shakeDuration > 0 && shake > 0) this.cameras.main.shake(tuning.shakeDuration * 1000, shake, true);
  }

  // ---------------------------------------------------------------- dodge

  private tryDodge(): void {
    if (this.dodgeCd > 0 || this.state === 'dodge') return;
    this.comboIndex = 0;
    this.comboTimer = 0;
    this.bufferT = 0;
    if (this.state === 'charging') this.attackHeld = false;
    const s = this.stick();
    this.dodgeDir = s.mag > 0 ? s.angle : this.facing;
    this.facing = this.dodgeDir;
    this.setState('dodge');
    this.sfx('roll');
  }

  // ---------------------------------------------------------------- enemies

  private updateEnemies(dt: number): void {
    this.enemies = this.enemies.filter((e) => e.alive);
    this.tokensUsed = this.enemies.filter((e) => e.hasToken).length;
    const sorted = this.enemies
      .map((e) => ({ e, d: Math.hypot(e.x - this.px, e.y - this.py) }))
      .sort((a, b) => a.d - b.d);
    for (const { e } of sorted) {
      if (!e.alive) continue;
      e.update(dt, this, tuning.playerSize);
      if (e.burnT > 0) {
        e.burnT -= dt;
        e.burnTick += dt;
        if (e.burnTick >= 0.5) {
          e.burnTick -= 0.5;
          this.hitEnemy(e, e.burnDps * 0.5, { tags: ['fire'], pierce: true, source: 'effect' });
        }
        if (e.burnT <= 0) e.burnDps = 0;
      }
    }
  }

  /** A generated image if it exists, otherwise a grey box (listed in ASSETS_NEEDED.md). */
  private visual(key: string | undefined, x: number, y: number, size: number, grey: number, alpha = 1): Visual {
    if (key && hasArt(key)) return this.add.image(x, y, key).setScale(ART_SCALE).setDepth(4000);
    return this.add.rectangle(x, y, size, size, grey, alpha).setDepth(4000);
  }

  fireEnemyProjectile(x: number, y: number, angle: number, speed: number, size: number, damage: number, sprite?: string): void {
    if (this.projectiles.length > 400) return;
    this.projectiles.push({
      rect: this.visual(sprite ?? 'fx/fireball', x, y, size, GREY.projectileEnemy).setRotation(angle),
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      travelled: 0,
      range: speed * tuning.enemyProjectileLife,
      radius: size / 2,
      damage,
      owner: 'enemy',
      pierceThrough: false,
      hitSet: new Set(),
      dead: false,
    });
  }

  shoot(o: { x: number; y: number; angle: number; speed: number; range: number; size: number; width?: number; damage: number; pierceThrough: boolean; hit: HitOpts; sprite?: string }): void {
    if (this.projectiles.length > 400) return;
    const w = o.width ?? o.size;
    this.projectiles.push({
      rect: this.visual(o.sprite, o.x, o.y, o.size, GREY.projectilePlayer).setRotation(o.angle),
      x: o.x,
      y: o.y,
      vx: Math.cos(o.angle) * o.speed,
      vy: Math.sin(o.angle) * o.speed,
      travelled: 0,
      range: o.range,
      radius: w / 2,
      damage: o.damage,
      owner: 'player',
      pierceThrough: o.pierceThrough,
      hit: o.hit,
      hitSet: new Set(),
      dead: false,
    });
  }

  private updateProjectiles(dt: number): void {
    for (const p of this.projectiles) {
      if (p.dead) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.travelled += Math.hypot(p.vx, p.vy) * dt;
      if (p.travelled > p.range || p.x < 0 || p.y < 0 || p.x > ARENA.width || p.y > ARENA.height) p.dead = true;
      else if (p.owner === 'enemy') {
        // Dodge rolls pass through projectiles too.
        if (Math.hypot(p.x - this.px, p.y - this.py) < p.radius + tuning.playerSize / 2 && !this.invulnerable) {
          this.hurtPlayer(p.damage);
          p.dead = true;
        }
      } else {
        for (const e of this.enemies) {
          if (!e.alive || p.hitSet.has(e)) continue;
          if (Math.hypot(e.x - p.x, e.y - p.y) < e.size / 2 + p.radius) {
            p.hitSet.add(e);
            this.hitEnemy(e, p.damage, p.hit!);
            if (!p.pierceThrough) {
              p.dead = true;
              break;
            }
          }
        }
      }
      p.rect.setPosition(p.x, p.y);
    }
    this.projectiles = this.projectiles.filter((p) => {
      if (p.dead) p.rect.destroy();
      return !p.dead;
    });
  }

  // ---------------------------------------------------------------- shikigami

  private addShikigami(id: string, levels: number, extra: boolean): void {
    const existing = this.familiars.find((f) => f.def.id === id);
    if (existing && !extra) {
      existing.level += levels;
      return;
    }
    const f = new Familiar(this, content.shikigami.get(id)!, this.px, this.py);
    f.level = levels;
    this.familiars.push(f);
  }

  private updateFamiliars(dt: number): void {
    const n = this.familiars.length;
    this.familiars.forEach((f, i) => {
      const a = this.facing + Math.PI + (i - (n - 1) / 2) * 0.7;
      f.update(dt, this, this.px + Math.cos(a) * tuning.shikigamiFollowDist, this.py + Math.sin(a) * tuning.shikigamiFollowDist);
    });
  }

  // ---------------------------------------------------------------- pickups, levels, shrines

  private dropXp(x: number, y: number, value: number): void {
    const orbs = this.pickups.filter((p) => p.kind === 'xp');
    if (orbs.length >= tuning.maxOrbs) {
      const o = orbs[Math.floor(Math.random() * orbs.length)];
      o.value += value;
      return;
    }
    this.dropPickup(x, y, 'xp', value);
  }

  private dropPickup(x: number, y: number, kind: 'xp' | 'heal', value: number): void {
    const rect = this.visual(kind === 'xp' ? 'fx/xp-orb' : 'fx/heal-onigiri', x, y, 8, kind === 'xp' ? GREY.xp : GREY.heal).setDepth(y);
    this.pickups.push({ rect, x, y, kind, value, pulled: false });
  }

  private updatePickups(dt: number): void {
    const r = tuning.pickupRadius * this.build.stats.pickupRadius;
    for (const p of this.pickups) {
      const dx = this.px - p.x;
      const dy = this.py - p.y;
      const d = Math.hypot(dx, dy);
      if (d < tuning.playerSize / 2 + 6) {
        if (p.kind === 'xp') {
          this.gainXp(p.value);
          if (this.time.now - this.lastXpSound > 70) {
            this.lastXpSound = this.time.now;
            this.sfx('pickup-xp', 0.6);
          }
        } else {
          this.heal(p.value);
          this.sfx('pickup-heal');
        }
        p.value = -1;
        continue;
      }
      if (p.pulled || d < r) {
        p.pulled = true;
        const s = Math.min(d, tuning.pickupPullSpeed * dt);
        p.x += (dx / d) * s;
        p.y += (dy / d) * s;
      }
    }
    this.pickups = this.pickups.filter((p) => {
      if (p.value < 0) p.rect.destroy();
      return p.value >= 0;
    });
  }

  private xpNeeded(): number {
    return Math.max(1, Math.round(tuning.xpBase * Math.pow(tuning.xpGrowth, this.level - 1)));
  }

  private gainXp(v: number): void {
    this.xp += v;
    this.stats.xp += v;
    while (this.xp >= this.xpNeeded()) {
      this.xp -= this.xpNeeded();
      this.level++;
      this.pendingPicks++;
    }
  }

  private openOffer(title: string): void {
    const cards = this.build.offer();
    if (!cards.length) {
      this.pendingPicks--;
      return;
    }
    this.attackHeld = false;
    this.bufferT = 0;
    if (this.state === 'charging') this.setState('free');
    status.offer = { cards, rerolls: this.rerolls, title, openedAt: this.time.now };
    this.sfx('level-up');
  }

  private pick(i: number): void {
    const offer = status.offer;
    if (!offer || !offer.cards[i]) return;
    const got = this.build.take(offer.cards[i].upgrade);
    for (const s of got.shikigami) this.addShikigami(s.id, s.levels, s.extra);
    if (got.heal) this.heal(got.heal);
    this.pendingPicks--;
    status.offer = null;
  }

  private reroll(): void {
    const offer = status.offer;
    if (!offer || this.rerolls <= 0) return;
    this.rerolls--;
    offer.cards = this.build.offer();
    offer.rerolls = this.rerolls;
  }

  private updateShrines(dt: number): void {
    for (const s of this.shrines) {
      const inside = Math.hypot(this.px - s.x, this.py - s.y) < tuning.shrineRadius;
      if (s.cooldown > 0) {
        s.cooldown -= dt;
        s.progress = 0;
      } else if (inside) {
        s.progress += dt;
        if (s.progress >= tuning.shrineChannelTime) {
          this.heal(tuning.shrineHeal);
          this.sfx('pickup-heal');
          this.stats.shrines++;
          s.cooldown = tuning.shrineCooldown;
          s.progress = 0;
        }
      } else s.progress = Math.max(0, s.progress - dt * 2);
      // A shrine you can use glows warmly when you're near; a used one fades until it recovers.
      const night = this.phase === 'night';
      if (s.cooldown > 0) s.sprite.setTint(0x777777).setAlpha(0.7);
      else if (inside) s.sprite.setTint(Math.floor(this.time.now / 200) % 2 ? 0xfff2b0 : 0xffffff).setAlpha(1);
      else s.sprite.setTint(night ? 0x8a8fc0 : 0xffffff).setAlpha(1);
      s.bar.width = (60 * s.progress) / tuning.shrineChannelTime;
    }
  }

  // ---------------------------------------------------------------- collisions

  private resolveCollisions(): void {
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const min = (a.size + b.size) / 2;
        const dx = b.x - a.x;
        if (dx > min || dx < -min) continue;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= min || d < 0.0001) continue;
        const push = min - d;
        const wa = b.size / (a.size + b.size);
        a.x -= (dx / d) * push * wa;
        a.y -= (dy / d) * push * wa;
        b.x += (dx / d) * push * (1 - wa);
        b.y += (dy / d) * push * (1 - wa);
      }
    }
    // Rolls pass through enemies; otherwise the player shoulders them aside (bosses push back).
    for (const e of list) {
      const min = (tuning.playerSize + e.size) / 2;
      if (this.state !== 'dodge') {
        const dx = e.x - this.px;
        const dy = e.y - this.py;
        const d = Math.hypot(dx, dy);
        if (d < min) {
          const nx = d > 0.0001 ? dx / d : 1;
          const ny = d > 0.0001 ? dy / d : 0;
          if (e.isBoss) {
            this.px = e.x - nx * min;
            this.py = e.y - ny * min;
          } else {
            e.x = this.px + nx * min;
            e.y = this.py + ny * min;
          }
        }
      }
      const m = e.size / 2 + 12;
      e.x = Phaser.Math.Clamp(e.x, m, ARENA.width - m);
      e.y = Phaser.Math.Clamp(e.y, m, ARENA.height - m);
    }
  }

  // ---------------------------------------------------------------- effects and visuals

  /** The weapon's own art swings through the arc (a grey bar only if the weapon has no art). */
  private spawnSwing(length: number, thickness: number, facing: number, arcDeg: number, dur: number, reverse: boolean): void {
    const half = (arcDeg * DEG) / 2;
    let from = facing - half;
    let to = facing + half;
    if (reverse) [from, to] = [to, from];
    if (hasArt(this.weapon.key)) {
      // The attack sheet already draws the blade and its slash; only spins still show the weapon art.
      if (this.heroAnims.attack && arcDeg < 360) return;
      const blade = 45 * Math.SQRT2; // diagonal of the 48px weapon art
      const obj = this.add.image(this.px, this.py, this.weapon.key).setOrigin(0.12, 0.88).setScale((length * 0.95) / blade).setDepth(this.py + 1);
      this.fx.push({ obj, t: 0, dur: Math.max(dur, 0.12), alpha: 1, follow: true, from, to, rotOffset: this.weapon.offset });
      if (hasArt('fx/slash-arc') && arcDeg > 0) {
        const mid = facing;
        const trail = this.add
          .image(this.px + Math.cos(mid) * length * 0.55, this.py + Math.sin(mid) * length * 0.55, 'fx/slash-arc')
          .setScale((length * 1.1) / 48)
          .setRotation(mid)
          .setDepth(this.py + 2);
        this.fx.push({ obj: trail, t: 0, dur: dur * 1.4, alpha: 0.9 });
      }
      return;
    }
    const obj = this.add.rectangle(this.px, this.py, length, thickness, GREY.swing, 0.8).setOrigin(0, 0.5).setDepth(12).setRotation(from);
    this.fx.push({ obj, t: 0, dur, alpha: 0.8, follow: true, from, to });
  }

  lightning(x1: number, y1: number, x2: number, y2: number): void {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const obj = this.add
      .rectangle(x1, y1, len, 3, GREY.swing, 0.9)
      .setOrigin(0, 0.5)
      .setRotation(Math.atan2(y2 - y1, x2 - x1))
      .setDepth(12);
    this.fx.push({ obj, t: 0, dur: 0.15, alpha: 0.9 });
  }

  pulse(x: number, y: number, radius: number): void {
    const obj = this.add.rectangle(x, y, radius * 2, radius * 2, GREY.swing, 0.3).setDepth(3).setScale(0.6);
    this.fx.push({ obj, t: 0, dur: 0.25, alpha: 0.3, grow: 1 });
  }

  private updateFx(dt: number): void {
    for (const f of this.fx) {
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      if (f.follow) f.obj.setPosition(this.px, this.py);
      if (f.follow) f.obj.setDepth(this.py + 1);
      if (f.from !== undefined && f.to !== undefined) f.obj.setRotation(f.from + (f.to - f.from) * Math.min(1, k * 1.6) + (f.rotOffset ?? 0));
      if (f.grow) f.obj.setScale(0.6 + 0.4 * k);
      f.obj.setAlpha(f.alpha * (1 - k));
    }
    this.fx = this.fx.filter((f) => {
      if (f.t < f.dur) return true;
      f.obj.destroy();
      return false;
    });
  }

  private syncVisuals(): void {
    // Hotaru's sheets (idle, run, attack) plus code motion: bob, lean, squash, spin and tints.
    // Without sheets the single frame is animated by code alone.
    const p = this.player;
    const t = this.time.now / 1000;
    const flip = Math.cos(this.facing) < 0;
    const dir = flip ? -1 : 1;
    const sheet = this.heroAnims.idle || this.heroAnims.run;
    const loop = (name: 'idle' | 'run') => {
      if (!this.heroAnims[name]) return;
      const key = `hero-${name}`;
      if (p.anims.currentAnim?.key !== key || !p.anims.isPlaying) p.play(key, true);
    };
    let rot = 0;
    let sx = 1;
    let sy = 1;
    let oy = 0;
    switch (this.state) {
      case 'free':
        if (this.moving) {
          loop('run');
          oy = sheet ? 0 : -Math.abs(Math.sin(t * 14)) * 5;
          rot = Math.sin(t * 14) * (sheet ? 0.02 : 0.06);
        } else {
          loop('idle');
          if (!sheet) {
            sy = 1 + 0.025 * Math.sin(t * 3);
            sx = 1 - 0.015 * Math.sin(t * 3);
          }
        }
        break;
      case 'attack':
      case 'chargeAttack': {
        const k = Math.min(1, this.stateT / (this.state === 'attack' ? tuning.hitDuration : tuning.chargeRecovery));
        const amt = this.heroAnims.attack ? 0.4 : 1;
        rot = dir * 0.2 * (1 - k) * amt;
        sx = 1 + 0.1 * (1 - k) * amt;
        sy = 1 - 0.08 * (1 - k) * amt;
        break;
      }
      case 'charging':
        // Wind-up: hold the first attack frame.
        if (this.heroAnims.attack) {
          if (p.anims.currentAnim?.key !== 'hero-attack' || p.anims.isPlaying) {
            p.play('hero-attack');
            p.anims.stop();
          }
          p.setFrame(0);
        }
        sx = 1.05;
        sy = 0.93;
        break;
      case 'dodge':
        loop('run');
        rot = dir * Math.PI * 2 * Math.min(1, this.stateT / tuning.dodgeTime);
        sy = 0.85;
        break;
    }
    p.setPosition(this.px, this.py + oy).setFlipX(flip).setRotation(rot).setScale(this.heroScale * sx, this.heroScale * sy).setDepth(this.py);
    p.clearTint();
    const hurtFlash = this.hurtT > tuning.playerHurtIFrames - 0.12;
    p.setTintMode(hurtFlash ? Phaser.TintModes.FILL : Phaser.TintModes.MULTIPLY);
    if (hurtFlash) p.setTint(0xff5050);
    else if (this.state === 'charging' && Math.floor(this.time.now / 80) % 2) p.setTint(0xffe066);
    else if (this.cooldown > 0) p.setTint(0xbbbbbb);
    else if (this.phase === 'night') p.setTint(0xc8cbf0);
    const iframes = this.state === 'dodge' && this.stateT < tuning.dodgeIFrames;
    p.setAlpha(iframes ? 0.6 : this.hurtT > 0 && Math.floor(this.time.now / 90) % 2 ? 0.55 : 1);

    const showArc = tuning.showAimGuides >= 1 && this.state === 'free' && this.comboIndex > 0;
    const clamp = tuning.turnClampDeg * DEG;
    this.arcLines.forEach((l, i) => {
      l.setVisible(showArc);
      if (showArc) {
        l.setPosition(this.px, this.py).setDisplaySize(tuning.snapRange, 2);
        l.setRotation(this.lastHitFacing + (i ? clamp : -clamp));
      }
    });
    const target = showArc ? this.snapTarget(this.lastHitFacing, clamp) : undefined;
    this.snapMarker.setVisible(!!target);
    if (target) this.snapMarker.setPosition(target.x, target.y - target.size / 2 - 10);

    const now = this.time.now;
    for (const e of this.enemies) if (e.alive) e.sync(now, this.px);
    for (const pk of this.pickups) {
      if (pk.rect instanceof Phaser.GameObjects.Image) {
        const k = pk.kind === 'heal' ? 1 + 0.08 * Math.sin(now / 150) : 0.6 + Math.min(0.6, Math.sqrt(pk.value) * 0.12);
        pk.rect.setPosition(pk.x, pk.y - 4 - Math.sin(now / 200 + pk.x) * 2).setScale(ART_SCALE * k).setDepth(pk.y);
      } else {
        const s = pk.kind === 'heal' ? 14 + Math.sin(now / 150) * 2 : 6 + Math.min(10, Math.sqrt(pk.value) * 2);
        pk.rect.setPosition(pk.x, pk.y).setDisplaySize(s, s);
      }
    }
  }
}
