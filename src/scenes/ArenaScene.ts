import Phaser from 'phaser';
import { ARENA, GREY, tuning } from '../config/tuning';
import { controls, status } from '../game/shared';

// Session 1 test arena: movement, four-hit combo, charge attacks, dodge and feel,
// against grey-box scaffolding. Grey boxes never ship (see CLAUDE.md).

const DEG = Math.PI / 180;

type PlayerState = 'free' | 'attack' | 'charging' | 'chargeAttack' | 'dodge';
type ChargeKind = 'launcher' | 'sweep' | 'big';

interface Enemy {
  rect: Phaser.GameObjects.Rectangle;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  alive: boolean;
  respawn: number;
  stun: number;
  pop: number;
  popDur: number;
  flash: number;
  cooldown: number;
  windup: number;
  hasToken: boolean;
}

interface Swing {
  rect: Phaser.GameObjects.Rectangle;
  t: number;
  dur: number;
  from: number;
  to: number;
}

function wrapAngle(a: number): number {
  return Phaser.Math.Angle.Wrap(a);
}

export class ArenaScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private nose!: Phaser.GameObjects.Rectangle;
  private arcLines: Phaser.GameObjects.Rectangle[] = [];
  private snapMarker!: Phaser.GameObjects.Rectangle;
  private enemies: Enemy[] = [];
  private swings: Swing[] = [];

  private px = ARENA.width / 2;
  private py = ARENA.height / 2;
  private facing = 0;
  private state: PlayerState = 'free';
  private stateT = 0;
  private comboIndex = 0; // next hit in the string, 0..3
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

  private keys?: Record<string, Phaser.Input.Keyboard.Key>;

  constructor() {
    super('Arena');
  }

  create(): void {
    this.enemies = [];
    this.swings = [];
    this.arcLines = [];
    this.hp = tuning.playerMaxHp;
    status.downs = 0;
    status.kills = 0;

    this.buildFloor();

    for (let i = 0; i < 2; i++) {
      this.arcLines.push(this.add.rectangle(0, 0, 10, 2, GREY.arc, 0.3).setOrigin(0, 0.5).setVisible(false));
    }
    this.snapMarker = this.add.rectangle(0, 0, 10, 10, GREY.arc, 0.8).setVisible(false);

    this.player = this.add.rectangle(this.px, this.py, tuning.playerSize, tuning.playerSize, GREY.player);
    this.nose = this.add.rectangle(this.px, this.py, 8, 8, GREY.nose);
    this.player.setDepth(10);
    this.nose.setDepth(11);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, ARENA.width, ARENA.height);
    cam.startFollow(this.player, true, tuning.cameraLerp, tuning.cameraLerp);

    const kb = this.input.keyboard;
    if (kb) {
      this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,J,K,SPACE,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
      const attackKeys = [this.keys.J, this.keys.SPACE];
      for (const k of attackKeys) {
        k.on('down', () => controls.events.push('attackDown'));
        k.on('up', () => controls.events.push('attackUp'));
      }
      for (const k of [this.keys.K, this.keys.SHIFT]) k.on('down', () => controls.events.push('dodge'));
    }

    this.scene.launch('Hud');
  }

  private buildFloor(): void {
    this.add.rectangle(0, 0, ARENA.width, ARENA.height, GREY.floor).setOrigin(0);
    for (let x = 0; x <= ARENA.width; x += ARENA.grid) this.add.rectangle(x, 0, 2, ARENA.height, GREY.grid).setOrigin(0.5, 0);
    for (let y = 0; y <= ARENA.height; y += ARENA.grid) this.add.rectangle(0, y, ARENA.width, 2, GREY.grid).setOrigin(0, 0.5);
    const w = 12;
    this.add.rectangle(0, 0, ARENA.width, w, GREY.wall).setOrigin(0);
    this.add.rectangle(0, ARENA.height - w, ARENA.width, w, GREY.wall).setOrigin(0);
    this.add.rectangle(0, 0, w, ARENA.height, GREY.wall).setOrigin(0);
    this.add.rectangle(ARENA.width - w, 0, w, ARENA.height, GREY.wall).setOrigin(0);
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
    for (const ev of controls.events.splice(0)) {
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
    const realDt = Math.min(deltaMs / 1000, 0.05);
    this.handleInput(realDt);

    let dt = realDt;
    if (this.hitStopT > 0) {
      this.hitStopT -= realDt;
      dt = 0;
    }

    if (dt > 0) {
      this.updatePlayer(dt);
      this.updateEnemies(dt);
      this.resolveCollisions();
    }
    this.updateSwings(dt);
    this.syncVisuals();

    const cam = this.cameras.main;
    cam.setZoom(this.scale.width / tuning.cameraViewWidth);
    cam.setLerp(tuning.cameraLerp, tuning.cameraLerp);

    status.hp = Math.max(0, Math.ceil(this.hp));
    status.maxHp = tuning.playerMaxHp;
    status.combo = this.state === 'attack' ? this.curHit + 1 : this.comboIndex;
    status.cooldown = this.cooldown > 0;
    status.charging = this.state === 'charging' ? this.chargeKindNow() : '';
  }

  private updatePlayer(dt: number): void {
    const s = this.stick();
    this.stateT += dt;
    this.cooldown -= dt;
    this.dodgeCd -= dt;
    this.hurtT -= dt;
    if (this.bufferT > 0) this.bufferT -= dt;

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
        this.move(s, tuning.moveSpeed, dt);
        if (s.mag > 0) this.facing = s.angle;
        break;
      case 'charging':
        this.move(s, tuning.moveSpeed * tuning.chargeMoveMult, dt);
        if (s.mag > 0) this.facing = s.angle;
        break;
      case 'attack':
      case 'chargeAttack': {
        this.move(s, tuning.moveSpeed * tuning.attackMoveMult, dt);
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
        // Ease-out roll: fast start, total distance = dodgeDistance.
        const T = tuning.dodgeTime;
        const t0 = Math.min(this.stateT - dt, T);
        const t1 = Math.min(this.stateT, T);
        const dist = (2 * tuning.dodgeDistance) / T * ((t1 - t0) - (t1 * t1 - t0 * t0) / (2 * T));
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

  private move(s: { x: number; y: number; mag: number }, speed: number, dt: number): void {
    this.px += s.x * speed * dt;
    this.py += s.y * speed * dt;
  }

  private setState(st: PlayerState): void {
    this.state = st;
    this.stateT = 0;
  }

  private get invulnerable(): boolean {
    return (this.state === 'dodge' && this.stateT < tuning.dodgeIFrames) || this.hurtT > 0;
  }

  // ---------------------------------------------------------------- combo

  /** Direction for the next hit: clamped to the turn arc mid-string, then snapped to the nearest enemy in it. */
  private aimNextHit(): number {
    const s = this.stick();
    const desired = s.mag > 0 ? s.angle : this.facing;
    const clamp = tuning.turnClampDeg * DEG;
    const midString = this.comboIndex > 0;
    const base = midString ? this.lastHitFacing : desired;
    let dir = desired;
    if (midString) {
      const diff = wrapAngle(desired - base);
      dir = base + Phaser.Math.Clamp(diff, -clamp, clamp);
    }
    const target = this.snapTarget(base, clamp);
    if (target) dir = Math.atan2(target.y - this.py, target.x - this.px);
    return wrapAngle(dir);
  }

  private snapTarget(base: number, clamp: number): Enemy | undefined {
    let best: Enemy | undefined;
    let bestD = tuning.snapRange;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - this.px, e.y - this.py);
      if (d > bestD) continue;
      const a = Math.atan2(e.y - this.py, e.x - this.px);
      if (Math.abs(wrapAngle(a - base)) > clamp) continue;
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
  }

  private chargeKindNow(): ChargeKind {
    if (this.comboIndex === 0) return 'launcher';
    return this.comboIndex < 3 ? 'sweep' : 'big';
  }

  private releaseCharge(): void {
    this.chargeKind = this.chargeKindNow();
    this.facing = this.aimNextHit();
    this.lastHitFacing = this.facing;
    this.hitApplied = false;
    this.setState('chargeAttack');
  }

  private applyHit(i: number): void {
    let hits = 0;
    if (i < 3) {
      hits = this.hitArc(tuning.hitRange, tuning.hitArcDeg, tuning.hitDamage, tuning.hitKnockback, 0);
      this.spawnSwing(tuning.hitRange, 10, this.facing, tuning.hitArcDeg, 0.08, i % 2 === 1);
      if (hits) this.feel(tuning.hitStop, tuning.shakeIntensity);
    } else {
      hits = this.hitArc(tuning.finisherRadius, 360, tuning.finisherDamage, tuning.finisherKnockback, 0);
      this.spawnSwing(tuning.finisherRadius, 12, this.facing, 360, 0.14, false);
      this.cooldown = tuning.finisherCooldown;
      if (hits) this.feel(tuning.finisherHitStop, tuning.finisherShakeIntensity);
    }
  }

  private applyCharge(): void {
    let hits = 0;
    switch (this.chargeKind) {
      case 'launcher':
        hits = this.hitArc(tuning.launcherRange, tuning.launcherArcDeg, tuning.launcherDamage, 60, tuning.launcherStun);
        this.spawnSwing(tuning.launcherRange, 26, this.facing, 0, 0.16, false);
        if (hits) this.feel(tuning.finisherHitStop, tuning.finisherShakeIntensity);
        break;
      case 'sweep':
        hits = this.hitArc(tuning.sweepRadius, tuning.sweepArcDeg, tuning.sweepDamage, tuning.sweepKnockback, 0);
        this.spawnSwing(tuning.sweepRadius, 16, this.facing, tuning.sweepArcDeg, 0.14, false);
        if (hits) this.feel(tuning.finisherHitStop, tuning.finisherShakeIntensity);
        break;
      case 'big':
        hits = this.hitArc(tuning.bigRadius, 360, tuning.bigDamage, tuning.bigKnockback, 0);
        this.spawnSwing(tuning.bigRadius, 18, this.facing, 720, 0.24, false);
        this.cooldown = tuning.finisherCooldown;
        if (hits) this.feel(tuning.bigHitStop, tuning.finisherShakeIntensity * 1.5);
        break;
    }
  }

  /** Damage every enemy inside an arc centred on the current facing. Returns number hit. */
  private hitArc(range: number, arcDeg: number, damage: number, knockback: number, stun: number): number {
    const half = (arcDeg * DEG) / 2;
    let hits = 0;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.x - this.px;
      const dy = e.y - this.py;
      const d = Math.hypot(dx, dy);
      if (d > range + tuning.enemySize / 2) continue;
      if (arcDeg < 360 && Math.abs(wrapAngle(Math.atan2(dy, dx) - this.facing)) > half) continue;
      hits++;
      const nx = d > 0.001 ? dx / d : Math.cos(this.facing);
      const ny = d > 0.001 ? dy / d : Math.sin(this.facing);
      this.damageEnemy(e, damage, nx * knockback, ny * knockback, stun);
    }
    return hits;
  }

  private damageEnemy(e: Enemy, damage: number, kx: number, ky: number, stun: number): void {
    e.hp -= damage;
    e.vx = kx;
    e.vy = ky;
    e.flash = tuning.enemyFlashTime;
    e.stun = Math.max(e.stun, tuning.enemyHitStun, stun);
    if (stun > 0) {
      e.pop = stun;
      e.popDur = stun;
    }
    e.windup = 0;
    e.hasToken = false;
    if (e.hp <= 0) {
      e.alive = false;
      e.respawn = tuning.enemyRespawnDelay;
      status.kills++;
      this.tweens.add({ targets: e.rect, alpha: 0, scaleX: e.rect.scaleX * 1.4, scaleY: e.rect.scaleY * 1.4, duration: 180 });
    }
  }

  private feel(stop: number, shake: number): void {
    this.hitStopT = Math.max(this.hitStopT, stop);
    if (tuning.shakeDuration > 0 && shake > 0) this.cameras.main.shake(tuning.shakeDuration * 1000, shake, true);
  }

  private spawnSwing(length: number, thickness: number, facing: number, arcDeg: number, dur: number, reverse: boolean): void {
    const half = (arcDeg * DEG) / 2;
    let from = facing - half;
    let to = facing + half;
    if (reverse) [from, to] = [to, from];
    const rect = this.add.rectangle(this.px, this.py, length, thickness, GREY.swing, 0.8).setOrigin(0, 0.5).setDepth(12);
    rect.setRotation(from);
    this.swings.push({ rect, t: 0, dur, from, to });
  }

  private updateSwings(dt: number): void {
    for (const s of this.swings) {
      s.t += dt;
      const k = Math.min(1, s.t / s.dur);
      s.rect.setPosition(this.px, this.py);
      s.rect.setRotation(s.from + (s.to - s.from) * Math.min(1, k * 1.6));
      s.rect.setAlpha(0.8 * (1 - k));
    }
    this.swings = this.swings.filter((s) => {
      if (s.t < s.dur) return true;
      s.rect.destroy();
      return false;
    });
  }

  // ---------------------------------------------------------------- dodge

  private tryDodge(): void {
    if (this.dodgeCd > 0 || this.state === 'dodge') return;
    // Cancels the string: lose the remaining hits, skip any cooldown not yet triggered.
    this.comboIndex = 0;
    this.comboTimer = 0;
    this.bufferT = 0;
    if (this.state === 'charging') this.attackHeld = false;
    const s = this.stick();
    this.dodgeDir = s.mag > 0 ? s.angle : this.facing;
    this.facing = this.dodgeDir;
    this.setState('dodge');
  }

  // ---------------------------------------------------------------- enemies

  private updateEnemies(dt: number): void {
    this.syncEnemyCount();

    let tokensUsed = this.enemies.filter((e) => e.alive && e.hasToken).length;
    const byDist = this.enemies
      .filter((e) => e.alive)
      .map((e) => ({ e, d: Math.hypot(e.x - this.px, e.y - this.py) }))
      .sort((a, b) => a.d - b.d);

    for (const e of this.enemies) {
      if (!e.alive) {
        e.respawn -= dt;
        if (e.respawn <= 0) this.spawnEnemy(e);
      }
    }

    for (const { e, d } of byDist) {
      e.flash -= dt;
      e.cooldown -= dt;
      if (e.pop > 0) e.pop -= dt;
      const fr = Math.exp(-tuning.enemyFriction * dt);
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.vx *= fr;
      e.vy *= fr;

      if (e.stun > 0) {
        e.stun -= dt;
        continue;
      }

      const dx = (this.px - e.x) / (d || 1);
      const dy = (this.py - e.y) / (d || 1);
      const speed = tuning.enemySpeed;

      if (e.windup > 0) {
        e.windup -= dt;
        if (e.windup <= 0) {
          if (d <= tuning.enemyStrikeReach + tuning.playerSize / 2) this.hurtPlayer();
          e.hasToken = false;
          tokensUsed--;
          e.cooldown = tuning.enemyAttackCooldown;
        }
        continue;
      }

      if (!e.hasToken && e.cooldown <= 0 && tokensUsed < tuning.attackTokens && d <= tuning.enemyWaitRadius + 40) {
        e.hasToken = true;
        tokensUsed++;
      }

      if (e.hasToken) {
        if (d > tuning.enemyAttackRange + tuning.playerSize / 2) {
          e.x += dx * speed * dt;
          e.y += dy * speed * dt;
        } else {
          e.windup = tuning.enemyWindup;
        }
      } else {
        const ring = tuning.enemyWaitRadius;
        if (d > ring) {
          e.x += dx * speed * dt;
          e.y += dy * speed * dt;
        } else if (d < ring - 15) {
          e.x -= dx * speed * 0.5 * dt;
          e.y -= dy * speed * 0.5 * dt;
        }
      }
    }
  }

  private syncEnemyCount(): void {
    const want = Math.round(tuning.enemyCount);
    while (this.enemies.length < want) {
      const e: Enemy = {
        rect: this.add.rectangle(0, 0, 1, 1, GREY.enemy).setDepth(5),
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        hp: 0,
        alive: false,
        respawn: 0,
        stun: 0,
        pop: 0,
        popDur: 1,
        flash: 0,
        cooldown: 0,
        windup: 0,
        hasToken: false,
      };
      this.spawnEnemy(e);
      this.enemies.push(e);
    }
    while (this.enemies.length > want) this.enemies.pop()!.rect.destroy();
  }

  private spawnEnemy(e: Enemy): void {
    const a = Math.random() * Math.PI * 2;
    const r = tuning.cameraViewWidth * (0.5 + Math.random() * 0.3);
    const m = 60;
    e.x = Phaser.Math.Clamp(this.px + Math.cos(a) * r, m, ARENA.width - m);
    e.y = Phaser.Math.Clamp(this.py + Math.sin(a) * r, m, ARENA.height - m);
    e.vx = e.vy = 0;
    e.hp = tuning.enemyHp;
    e.alive = true;
    e.stun = e.pop = e.flash = e.windup = 0;
    e.cooldown = Math.random() * tuning.enemyAttackCooldown;
    e.hasToken = false;
    this.tweens.killTweensOf(e.rect);
    e.rect.setAlpha(1).setScale(1);
  }

  private hurtPlayer(): void {
    if (this.invulnerable) return;
    this.hp -= tuning.enemyDamage;
    this.hurtT = tuning.playerHurtIFrames;
    if (tuning.shakeDuration > 0) this.cameras.main.shake(tuning.shakeDuration * 1000, tuning.hurtShakeIntensity, true);
    if (this.hp <= 0) {
      this.hp = tuning.playerMaxHp;
      status.downs++;
    }
  }

  private resolveCollisions(): void {
    const alive = this.enemies.filter((e) => e.alive);
    const es = tuning.enemySize;
    for (let i = 0; i < alive.length; i++) {
      const a = alive[i];
      for (let j = i + 1; j < alive.length; j++) {
        const b = alive[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= es || d < 0.0001) continue;
        const push = (es - d) / 2;
        a.x -= (dx / d) * push;
        a.y -= (dy / d) * push;
        b.x += (dx / d) * push;
        b.y += (dy / d) * push;
      }
    }
    // Rolls pass through enemies; otherwise the player shoulders them aside.
    const minD = (tuning.playerSize + es) / 2;
    const m = es / 2 + 12;
    for (const e of alive) {
      if (this.state !== 'dodge') {
        const dx = e.x - this.px;
        const dy = e.y - this.py;
        const d = Math.hypot(dx, dy);
        if (d < minD) {
          const nx = d > 0.0001 ? dx / d : 1;
          const ny = d > 0.0001 ? dy / d : 0;
          e.x = this.px + nx * minD;
          e.y = this.py + ny * minD;
        }
      }
      e.x = Phaser.Math.Clamp(e.x, m, ARENA.width - m);
      e.y = Phaser.Math.Clamp(e.y, m, ARENA.height - m);
    }
  }

  // ---------------------------------------------------------------- visuals

  private syncVisuals(): void {
    const p = this.player;
    p.setPosition(this.px, this.py).setRotation(this.facing).setSize(tuning.playerSize, tuning.playerSize);
    p.setDisplaySize(tuning.playerSize, tuning.playerSize);
    let color = GREY.player;
    if (this.state === 'charging') color = Math.floor(this.time.now / 80) % 2 ? GREY.playerCharging : GREY.player;
    else if (this.hurtT > tuning.playerHurtIFrames - 0.1) color = GREY.playerHurt;
    else if (this.cooldown > 0) color = GREY.playerCooldown;
    p.setFillStyle(color);
    p.setAlpha(this.state === 'dodge' && this.stateT < tuning.dodgeIFrames ? 0.4 : this.hurtT > 0 ? 0.7 : 1);
    const nd = tuning.playerSize / 2 + 4;
    this.nose.setPosition(this.px + Math.cos(this.facing) * nd, this.py + Math.sin(this.facing) * nd).setRotation(this.facing);

    // Turn-clamp arc and snap target, shown while the string can continue.
    const showArc = this.state === 'free' && this.comboIndex > 0;
    const clamp = tuning.turnClampDeg * DEG;
    this.arcLines.forEach((l, i) => {
      l.setVisible(showArc);
      if (showArc) {
        l.setPosition(this.px, this.py);
        l.setSize(tuning.snapRange, 2).setDisplaySize(tuning.snapRange, 2);
        l.setRotation(this.lastHitFacing + (i ? clamp : -clamp));
      }
    });
    const target = showArc ? this.snapTarget(this.lastHitFacing, clamp) : undefined;
    this.snapMarker.setVisible(!!target);
    if (target) this.snapMarker.setPosition(target.x, target.y - tuning.enemySize);

    for (const e of this.enemies) {
      if (!e.alive) {
        e.rect.setPosition(e.x, e.y);
        continue;
      }
      let c = e.hasToken ? GREY.enemyToken : GREY.enemy;
      if (e.windup > 0) c = GREY.enemyWindup;
      if (e.flash > 0) c = GREY.enemyFlash;
      const pop = e.pop > 0 ? 1 + 0.4 * Math.sin((1 - e.pop / e.popDur) * Math.PI) : 1;
      const windupPulse = e.windup > 0 ? 1.12 : 1;
      e.rect.setPosition(e.x, e.y).setFillStyle(c);
      e.rect.setDisplaySize(tuning.enemySize * pop * windupPulse, tuning.enemySize * pop * windupPulse);
    }
  }
}
