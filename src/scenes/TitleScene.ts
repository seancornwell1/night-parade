import Phaser from 'phaser';
import { IMAGES, SOUNDS } from '../art';

// Placeholder title. The background and logo are generated assets listed in ASSETS_NEEDED.md.
// A tap is required to start (iOS also needs it to unlock audio later).
export class TitleScene extends Phaser.Scene {
  private title!: Phaser.GameObjects.Text;
  private prompt!: Phaser.GameObjects.Text;

  constructor() {
    super('Title');
  }

  preload(): void {
    for (const [key, url] of Object.entries(IMAGES)) this.load.image(key, url);
    for (const [key, url] of Object.entries(SOUNDS)) this.load.audio(key, url);
  }

  create(): void {
    this.title = this.add
      .text(0, 0, 'Night Parade', { fontFamily: 'Georgia, serif', fontSize: '48px', color: '#ffffff' })
      .setOrigin(0.5);
    this.prompt = this.add
      .text(0, 0, 'Tap to start', { fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#999999' })
      .setOrigin(0.5);

    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this));
    this.input.once('pointerdown', () => this.scene.start('Arena'));
    this.input.keyboard?.once('keydown', () => this.scene.start('Arena'));
  }

  private layout(): void {
    const { width, height } = this.scale;
    this.title.setPosition(width / 2, height / 2 - 20);
    this.prompt.setPosition(width / 2, height / 2 + 36);
  }
}
