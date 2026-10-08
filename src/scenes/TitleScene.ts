import Phaser from 'phaser';

// Placeholder title. The background and logo are generated assets listed in ASSETS_NEEDED.md.
export class TitleScene extends Phaser.Scene {
  private title!: Phaser.GameObjects.Text;

  constructor() {
    super('Title');
  }

  create(): void {
    this.title = this.add
      .text(0, 0, 'Night Parade', {
        fontFamily: 'Georgia, serif',
        fontSize: '48px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
  }

  private layout(): void {
    const { width, height } = this.scale;
    this.title.setPosition(width / 2, height / 2);
  }
}
