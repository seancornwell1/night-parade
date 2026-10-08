import Phaser from 'phaser';
import { GREY, tuning } from '../config/tuning';
import { actions, clearControls, controls, status, type Offer } from '../game/shared';
import { TuningPanel } from '../ui/TuningPanel';

// Touch controls, run status, banners and level-up cards. Grey-box scaffolding: never ships.

const CORNER = 70; // top-left zone for the triple-tap that opens the tuning panel
const FONT = 'system-ui, -apple-system, sans-serif';

interface CardView {
  bg: Phaser.GameObjects.Rectangle;
  name: Phaser.GameObjects.Text;
  path: Phaser.GameObjects.Text;
  desc: Phaser.GameObjects.Text;
  notes: Phaser.GameObjects.Text;
}

export class HudScene extends Phaser.Scene {
  private stickBase!: Phaser.GameObjects.Rectangle;
  private stickKnob!: Phaser.GameObjects.Rectangle;
  private attackBtn!: Phaser.GameObjects.Rectangle;
  private dodgeBtn!: Phaser.GameObjects.Rectangle;
  private attackLabel!: Phaser.GameObjects.Text;
  private dodgeLabel!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Text;
  private sub!: Phaser.GameObjects.Text;
  private phaseText!: Phaser.GameObjects.Text;
  private hpBar!: Phaser.GameObjects.Rectangle;
  private xpBar!: Phaser.GameObjects.Rectangle;
  private bannerTitle!: Phaser.GameObjects.Text;
  private bannerSub!: Phaser.GameObjects.Text;
  private dim!: Phaser.GameObjects.Rectangle;
  private offerTitle!: Phaser.GameObjects.Text;
  private rerollBtn!: Phaser.GameObjects.Rectangle;
  private rerollLabel!: Phaser.GameObjects.Text;
  private cards: CardView[] = [];
  private shownCards: unknown = null;

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
    this.cards = [];
    this.shownCards = null;
    this.stickId = this.attackId = this.dodgeId = null;
    this.stickBase = this.add.rectangle(0, 0, 10, 10, GREY.ui).setVisible(false);
    this.stickKnob = this.add.rectangle(0, 0, 10, 10, GREY.uiPressed).setVisible(false);
    this.attackBtn = this.add.rectangle(0, 0, 10, 10, GREY.ui);
    this.dodgeBtn = this.add.rectangle(0, 0, 10, 10, GREY.ui);
    const label = { fontFamily: FONT, fontSize: '16px', color: '#111111' };
    this.attackLabel = this.add.text(0, 0, 'ATTACK', label).setOrigin(0.5);
    this.dodgeLabel = this.add.text(0, 0, 'DODGE', label).setOrigin(0.5);
    this.info = this.add.text(CORNER + 6, 6, '', { fontFamily: FONT, fontSize: '13px', color: '#dddddd' });
    this.add.rectangle(CORNER + 6, 26, 160, 8, 0x444444).setOrigin(0, 0.5);
    this.hpBar = this.add.rectangle(CORNER + 6, 26, 160, 8, GREY.heal).setOrigin(0, 0.5);
    this.add.rectangle(CORNER + 6, 36, 160, 5, 0x444444).setOrigin(0, 0.5);
    this.xpBar = this.add.rectangle(CORNER + 6, 36, 0, 5, GREY.xp).setOrigin(0, 0.5);
    this.sub = this.add.text(CORNER + 6, 42, '', { fontFamily: FONT, fontSize: '11px', color: '#aaaaaa', lineSpacing: 2 });
    this.phaseText = this.add.text(0, 6, '', { fontFamily: FONT, fontSize: '18px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5, 0);
    this.bannerTitle = this.add.text(0, 0, '', { fontFamily: 'Georgia, serif', fontSize: '28px', color: '#ffffff' }).setOrigin(0.5);
    this.bannerSub = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '14px', color: '#cccccc', align: 'center' })
      .setOrigin(0.5, 0);

    this.dim = this.add.rectangle(0, 0, 10, 10, 0x000000, 0.6).setOrigin(0).setVisible(false);
    this.offerTitle = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '18px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5, 1);
    this.rerollBtn = this.add.rectangle(0, 0, 120, 34, GREY.ui).setVisible(false);
    this.rerollLabel = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '14px', color: '#111111' }).setOrigin(0.5);
    for (let i = 0; i < 5; i++) {
      const dark = { fontFamily: FONT, color: '#111111' };
      this.cards.push({
        bg: this.add.rectangle(0, 0, 10, 10, GREY.uiPressed),
        name: this.add.text(0, 0, '', { ...dark, fontSize: '16px', fontStyle: 'bold' }).setOrigin(0.5, 0),
        path: this.add.text(0, 0, '', { ...dark, fontSize: '11px', color: '#333333' }).setOrigin(0.5, 0),
        desc: this.add.text(0, 0, '', { ...dark, fontSize: '13px', align: 'center' }).setOrigin(0.5, 0),
        notes: this.add.text(0, 0, '', { ...dark, fontSize: '11px', align: 'center', color: '#333333', fontStyle: 'italic' }).setOrigin(0.5, 1),
      });
    }

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
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.panel.destroy();
      this.game.events.off(Phaser.Core.Events.BLUR, this.releaseAll, this);
    });

    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('pointerupoutside', this.onUp, this);
    this.game.events.on(Phaser.Core.Events.BLUR, this.releaseAll, this);
  }

  private inRect(r: Phaser.GameObjects.Rectangle, x: number, y: number, pad = 0): boolean {
    return Math.abs(x - r.x) <= r.displayWidth / 2 + pad && Math.abs(y - r.y) <= r.displayHeight / 2 + pad;
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
    if (status.offer) {
      this.tapOffer(status.offer, p.x, p.y);
      return;
    }
    if (this.dodgeId === null && this.inRect(this.dodgeBtn, p.x, p.y, tuning.buttonHitPad)) {
      this.dodgeId = p.id;
      controls.events.push('dodge');
      return;
    }
    if (this.attackId === null && this.inRect(this.attackBtn, p.x, p.y, tuning.buttonHitPad)) {
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

  private tapOffer(offer: Offer, x: number, y: number): void {
    if (this.time.now - offer.openedAt < tuning.cardInputDelay * 1000) return;
    if (offer.rerolls > 0 && this.rerollBtn.visible && this.inRect(this.rerollBtn, x, y, 6)) {
      actions.reroll();
      return;
    }
    offer.cards.forEach((_, i) => {
      if (this.inRect(this.cards[i].bg, x, y)) actions.pick(i);
    });
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
    const offer = status.offer;
    if (offer && (this.stickId !== null || this.attackId !== null || this.dodgeId !== null)) this.releaseAll();

    this.layoutControls(width, height, !offer);

    const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    this.phaseText.setPosition(width / 2, 6).setText(`${status.phase.toUpperCase()} ${fmt(status.phaseLeft)}`);
    this.info.setText(`Lv ${status.level}   HP ${status.hp}/${status.maxHp}   Kills ${status.kills}   ${Math.round(this.game.loop.actualFps)} fps`);
    this.hpBar.width = 160 * Math.max(0, status.hp / Math.max(1, status.maxHp));
    this.xpBar.width = 160 * Math.min(1, status.xp / Math.max(1, status.xpNext));
    const combo = status.combo > 0 ? `Combo ${status.combo}/4` : '';
    const extra = status.charging ? `Charging: ${status.charging}` : status.cooldown ? 'Cooldown' : '';
    const lines = [status.build, status.shikigami && `Shikigami: ${status.shikigami}`, [combo, extra].filter(Boolean).join('  ')];
    this.sub.setText(lines.filter(Boolean).join('\n'));

    const b = status.banner;
    const showBanner = !!b && this.time.now < b.until && !offer;
    this.bannerTitle.setVisible(showBanner);
    this.bannerSub.setVisible(showBanner);
    if (b && showBanner) {
      const fade = Math.min(1, (b.until - this.time.now) / 600);
      this.bannerTitle.setText(b.title).setPosition(width / 2, height * 0.3).setAlpha(fade);
      this.bannerSub
        .setText(b.sub)
        .setPosition(width / 2, height * 0.3 + 22)
        .setAlpha(fade)
        .setWordWrapWidth(width * 0.7);
    }

    this.layoutOffer(offer, width, height);
  }

  private layoutControls(width: number, height: number, show: boolean): void {
    const a = tuning.uiAlpha;
    const size = tuning.buttonSize;
    const m = tuning.buttonMargin;
    const ax = width - m - size / 2;
    const ay = height - m - size / 2;
    this.attackBtn.setVisible(show).setPosition(ax, ay).setDisplaySize(size, size).setAlpha(a);
    this.attackBtn.setFillStyle(this.attackId !== null ? GREY.uiPressed : GREY.ui);
    this.attackLabel.setVisible(show).setPosition(ax, ay).setAlpha(Math.min(1, a + 0.3));
    const ds = size * tuning.dodgeButtonScale;
    const dx = ax - size / 2 - ds / 2 - 16;
    const dy = ay - size * 0.45;
    this.dodgeBtn.setVisible(show).setPosition(dx, dy).setDisplaySize(ds, ds).setAlpha(a);
    this.dodgeBtn.setFillStyle(this.dodgeId !== null ? GREY.uiPressed : GREY.ui);
    this.dodgeLabel.setVisible(show).setPosition(dx, dy).setAlpha(Math.min(1, a + 0.3));
    const r = tuning.stickRadius;
    const on = show && this.stickId !== null;
    this.stickBase.setVisible(on).setPosition(this.stickX, this.stickY).setDisplaySize(r * 2, r * 2).setAlpha(a * 0.5);
    this.stickKnob
      .setVisible(on)
      .setPosition(this.stickX + controls.moveX * r, this.stickY + controls.moveY * r)
      .setDisplaySize(r * 0.8, r * 0.8)
      .setAlpha(a);
  }

  /** Upgrade cards sit in the lower middle, in reach of both thumbs. */
  private layoutOffer(offer: Offer | null, width: number, height: number): void {
    const show = !!offer;
    this.dim.setVisible(show).setDisplaySize(width, height);
    this.offerTitle.setVisible(show);
    const canReroll = show && offer!.rerolls > 0;
    this.rerollBtn.setVisible(canReroll);
    this.rerollLabel.setVisible(canReroll);
    const n = offer?.cards.length ?? 0;
    const gap = 12;
    const cw = Math.min(210, (width - 32 - gap * (n - 1)) / Math.max(1, n));
    const ch = Math.min(180, height * 0.5);
    const cy = height - 14 - ch / 2;
    const totalW = n * cw + (n - 1) * gap;
    const ready = !!offer && this.time.now - offer.openedAt >= tuning.cardInputDelay * 1000;
    this.cards.forEach((c, i) => {
      const vis = show && i < n;
      for (const o of [c.bg, c.name, c.path, c.desc, c.notes]) o.setVisible(vis);
      if (!vis) return;
      const card = offer!.cards[i];
      const x = width / 2 - totalW / 2 + cw / 2 + i * (cw + gap);
      const top = cy - ch / 2;
      c.bg.setPosition(x, cy).setDisplaySize(cw, ch).setAlpha(ready ? 1 : 0.6);
      if (this.shownCards !== offer!.cards) {
        const max = card.upgrade.maxStacks ?? 1;
        c.name.setText(card.upgrade.name);
        c.path.setText(max > 1 ? `${card.pathName} · ${card.stacks}/${max}` : card.pathName);
        c.desc.setText(card.upgrade.description);
        c.notes.setText(card.notes.join('\n'));
      }
      c.name.setPosition(x, top + 10).setWordWrapWidth(cw - 12);
      c.path.setPosition(x, top + 32);
      c.desc.setPosition(x, top + 52).setWordWrapWidth(cw - 16);
      c.notes.setPosition(x, top + ch - 8).setWordWrapWidth(cw - 12);
    });
    if (offer) {
      this.shownCards = offer.cards;
      this.offerTitle.setText(offer.title).setPosition(width / 2, cy - ch / 2 - 12);
      this.rerollBtn.setPosition(width / 2 + totalW / 2 - 60, cy - ch / 2 - 30);
      this.rerollLabel.setText(`Reroll (${offer.rerolls})`).setPosition(this.rerollBtn.x, this.rerollBtn.y);
    } else this.shownCards = null;
  }
}
