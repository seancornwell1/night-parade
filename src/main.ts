import Phaser from 'phaser';
import { ArenaScene } from './scenes/ArenaScene';
import { HudScene } from './scenes/HudScene';
import { TitleScene } from './scenes/TitleScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#000000',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  input: { activePointers: 4 },
  scene: [TitleScene, ArenaScene, HudScene],
});
