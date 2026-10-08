// State shared between the arena and the HUD scenes.

export type InputEvent = 'attackDown' | 'attackUp' | 'dodge' | 'reset';

export const controls = {
  moveX: 0,
  moveY: 0,
  events: [] as InputEvent[],
};

export function clearControls(): void {
  controls.moveX = 0;
  controls.moveY = 0;
  controls.events.length = 0;
  controls.events.push('reset');
}

export const status = {
  hp: 0,
  maxHp: 0,
  combo: 0,
  cooldown: false,
  charging: '',
  downs: 0,
  kills: 0,
};
