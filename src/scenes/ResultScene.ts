import Phaser from 'phaser';
import type { RunResult } from '../game/shared';

// Death and victory screens with run stats. Background and title art are generated assets
// listed in ASSETS_NEEDED.md.

const FONT = 'system-ui, -apple-system, sans-serif';

export class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  create(r: RunResult): void {
    const { width, height } = this.scale;
    const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const title = r.victory ? 'Dawn' : 'Fallen';
    const sub = r.victory ? `You survived the Night Parade of ${r.rift}.` : `Fell during the ${r.phase} · ${r.rift}`;
    this.add.text(width / 2, 22, title, { fontFamily: 'Georgia, serif', fontSize: '36px', color: '#ffffff' }).setOrigin(0.5, 0);
    this.add.text(width / 2, 66, sub, { fontFamily: FONT, fontSize: '14px', color: '#bbbbbb' }).setOrigin(0.5, 0);

    const left = [
      `Time survived   ${fmt(r.time)}`,
      `Level           ${r.level}`,
      `Kills           ${r.kills}`,
      `Bosses          ${r.bosses}`,
      `Damage dealt    ${Math.round(r.damageDealt)}`,
      `Damage taken    ${Math.round(r.damageTaken)}`,
      `Healed          ${Math.round(r.healed)}`,
      `Shrines used    ${r.shrines}`,
      `XP collected    ${Math.round(r.xp)}`,
    ];
    const kills = Object.entries(r.killsBy)
      .sort((a, b) => b[1] - a[1])
      .map(([n, k]) => `${n}: ${k}`);
    const counts = new Map<string, number>();
    for (const u of r.upgrades) counts.set(u, (counts.get(u) ?? 0) + 1);
    const upgrades = [...counts].map(([n, c]) => (c > 1 ? `${n} x${c}` : n)).join(', ') || 'none';

    const mono = { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '12px', color: '#dddddd', lineSpacing: 3 };
    const body = { fontFamily: FONT, fontSize: '12px', color: '#dddddd', lineSpacing: 3, wordWrap: { width: width * 0.44 } };
    this.add.text(width * 0.06, 96, left.join('\n'), mono);
    this.add.text(width * 0.06 + 210, 96, ['Kills by enemy', ...kills].join('\n'), { ...body, wordWrap: { width: width * 0.5 - 220 } });
    this.add.text(width * 0.52, 96, `Paths: ${r.build || 'none'}\n\nUpgrades: ${upgrades}`, body);

    const prompt = this.add
      .text(width / 2, height - 14, 'Tap to play again', { fontFamily: FONT, fontSize: '16px', color: '#999999' })
      .setOrigin(0.5, 1)
      .setAlpha(0);
    // Short delay so a thumb still mashing attack doesn't skip the screen.
    this.time.delayedCall(1200, () => {
      prompt.setAlpha(1);
      this.input.once('pointerdown', () => this.scene.start('Arena'));
      this.input.keyboard?.once('keydown', () => this.scene.start('Arena'));
    });
  }
}
