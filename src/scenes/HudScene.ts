import Phaser from 'phaser';
import { GREY, tuning } from '../config/tuning';
import { clearControls, controls, status } from '../game/shared';
import { TuningPanel } from '../ui/TuningPanel';

// Touch controls and status readout. Grey-box scaffolding: these never ship.

const CORNER = 70; // top-left zone for the triple-tap that opens the tuning panel

export class HudScene extends Phaser.Scene {
  private stickBase!: Phaser.GameObjects.Rectangle;
  private stickKnob!: Phaser.GameObjects.Rectangle;
  private attackBtn!: Phaser.GameObjects.Rectangle;
  private dodgeBtn!: Phaser.GameObjects.Rectangle;
  private attackLabel!: Phaser.GameObjects.Text;
  private dodgeLabel!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Text;

  private stickId: number | null = null;
  private stickX = 0;
  private stickY = 0;
  private attackId: number | null = null;
  private dodgeId: number | null = null;
  private cornerTaps: number[] = [];
  private panel!: TuningPanel;

  constructor() {
    super('Hud');
  }

  create(): void {
    this.stickBase = this.add.rectangle(0, 0, 10, 10, GREY.ui).setVisible(false);
    this.stickKnob = this.add.rectangle(0, 0, 10, 10, GREY.uiPressed).setVisible(false);
    this.attackBtn = this.add.rectangle(0, 0, 10, 10, GREY.ui);
    this.dodgeBtn = this.add.rectangle(0, 0, 10, 10, GREY.ui);
    const labelStyle = { fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: '#111111' };
    this.attackLabel = this.add.text(0, 0, 'ATTACK', labelStyle).setOrigin(0.5);
    this.dodgeLabel = this.add.text(0, 0, 'DODGE', labelStyle).setOrigin(0.5);
    this.info = this.add.text(12, 10, '', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
      color: '#cccccc',
    });

    this.panel = new TuningPanel(
      () => {
        this.releaseAll();
        this.scene.pause('Arena');
      },
      () => {
        this.releaseAll();
        this.scene.resume('Arena');
      },
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.panel.destroy());

    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('pointerupoutside', this.onUp, this);
    this.game.events.on(Phaser.Core.Events.BLUR, this.releaseAll, this);
  }

  private inButton(btn: Phaser.GameObjects.Rectangle, x: number, y: number): boolean {
    const pad = tuning.buttonHitPad;
    return (
      Math.abs(x - btn.x) <= btn.displayWidth / 2 + pad && Math.abs(y - btn.y) <= btn.displayHeight / 2 + pad
    );
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (p.x < CORNER && p.y < CORNER) {
      const now = this.time.now;
      this.cornerTaps = this.cornerTaps.filter((t) => now - t < 900);
      this.cornerTaps.push(now);
      if (this.cornerTaps.length >= 3) {
        this.cornerTaps = [];
        this.panel.open();
      }
      return;
    }
    if (this.dodgeId === null && this.inButton(this.dodgeBtn, p.x, p.y)) {
      this.dodgeId = p.id;
      controls.events.push('dodge');
      return;
    }
    if (this.attackId === null && this.inButton(this.attackBtn, p.x, p.y)) {
      this.attackId = p.id;
      controls.events.push('attackDown');
      return;
    }
    if (this.stickId === null && p.x < this.scale.width / 2) {
      this.stickId = p.id;
      this.stickX = p.x;
      this.stickY = p.y;
      this.updateStick(p.x, p.y);
    }
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.id === this.stickId) this.updateStick(p.x, p.y);
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id === this.stickId) {
      this.stickId = null;
      controls.moveX = 0;
      controls.moveY = 0;
    }
    if (p.id === this.attackId) {
      this.attackId = null;
      controls.events.push('attackUp');
    }
    if (p.id === this.dodgeId) this.dodgeId = null;
  }

  private updateStick(x: number, y: number): void {
    const r = tuning.stickRadius;
    let dx = x - this.stickX;
    let dy = y - this.stickY;
    const d = Math.hypot(dx, dy);
    // Floating stick: the base follows the thumb when dragged past the rim.
    if (d > r) {
      this.stickX += (dx / d) * (d - r);
      this.stickY += (dy / d) * (d - r);
      dx = x - this.stickX;
      dy = y - this.stickY;
    }
    const mag = Math.min(1, Math.hypot(dx, dy) / r);
    const dz = tuning.stickDeadzone;
    if (mag <= dz) {
      controls.moveX = 0;
      controls.moveY = 0;
    } else {
      const scaled = (mag - dz) / (1 - dz);
      const len = Math.hypot(dx, dy);
      controls.moveX = (dx / len) * scaled;
      controls.moveY = (dy / len) * scaled;
    }
  }

  private releaseAll(): void {
    this.stickId = this.attackId = this.dodgeId = null;
    clearControls();
  }

  update(): void {
    const { width, height } = this.scale;
    const a = tuning.uiAlpha;
    const size = tuning.buttonSize;
    const m = tuning.buttonMargin;
    const ax = width - m - size / 2;
    const ay = height - m - size / 2;
    this.attackBtn.setPosition(ax, ay).setDisplaySize(size, size).setAlpha(a);
    this.attackBtn.setFillStyle(this.attackId !== null ? GREY.uiPressed : GREY.ui);
    this.attackLabel.setPosition(ax, ay).setAlpha(Math.min(1, a + 0.3));

    const ds = size * tuning.dodgeButtonScale;
    const dx = ax - size / 2 - ds / 2 - 16;
    const dy = ay - size * 0.45;
    this.dodgeBtn.setPosition(dx, dy).setDisplaySize(ds, ds).setAlpha(a);
    this.dodgeBtn.setFillStyle(this.dodgeId !== null ? GREY.uiPressed : GREY.ui);
    this.dodgeLabel.setPosition(dx, dy).setAlpha(Math.min(1, a + 0.3));

    const r = tuning.stickRadius;
    const on = this.stickId !== null;
    this.stickBase.setVisible(on).setPosition(this.stickX, this.stickY).setDisplaySize(r * 2, r * 2).setAlpha(a * 0.5);
    this.stickKnob
      .setVisible(on)
      .setPosition(this.stickX + controls.moveX * r, this.stickY + controls.moveY * r)
      .setDisplaySize(r * 0.8, r * 0.8)
      .setAlpha(a);

    const combo = status.combo > 0 ? `Combo ${status.combo}/4` : '';
    const extra = status.charging ? `Charging: ${status.charging}` : status.cooldown ? 'Cooldown' : '';
    this.info.setText(
      `HP ${status.hp}/${status.maxHp}   Downs ${status.downs}   Kills ${status.kills}   ${Math.round(this.game.loop.actualFps)} fps\n${combo}  ${extra}`,
    );
    this.info.setPosition(CORNER + 6, 10);
  }
}
