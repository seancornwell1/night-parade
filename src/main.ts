import Phaser from 'phaser';
import { actions, controls, status } from './game/shared';
import { ArenaScene } from './scenes/ArenaScene';
import { HudScene } from './scenes/HudScene';
import { ResultScene } from './scenes/ResultScene';
import { TitleScene } from './scenes/TitleScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#000000',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  input: { activePointers: 4 },
  scene: [TitleScene, ArenaScene, HudScene, ResultScene],
});

// ?debug exposes game state for automated playtests.
if (new URLSearchParams(location.search).has('debug')) {
  Object.assign(window, { __np: { game, controls, status, actions } });
}
