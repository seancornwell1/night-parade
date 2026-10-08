// Every tuning number for the game lives in this file.
// The hidden tuning panel (triple-tap the top-left corner) edits these live;
// edits are saved on the device and can be copied back as text.

export interface TuningDef {
  value: number;
  min: number;
  max: number;
  step: number;
  group: string;
  label: string;
}

const t = (value: number, min: number, max: number, step: number, group: string, label: string): TuningDef => ({
  value,
  min,
  max,
  step,
  group,
  label,
});

const DEFS = {
  // Movement and camera
  moveSpeed: t(220, 60, 500, 5, 'Movement', 'Move speed (units/s)'),
  attackMoveMult: t(0.35, 0, 1, 0.05, 'Movement', 'Move speed while attacking (x)'),
  chargeMoveMult: t(0.2, 0, 1, 0.05, 'Movement', 'Move speed while charging (x)'),
  cameraViewWidth: t(900, 400, 1800, 10, 'Movement', 'Camera view width (units)'),
  cameraLerp: t(0.15, 0.01, 1, 0.01, 'Movement', 'Camera follow smoothing'),

  // Four-hit string
  hitDuration: t(0.22, 0.06, 0.6, 0.01, 'Combo', 'Hit duration (s)'),
  hitActiveDelay: t(0.06, 0, 0.3, 0.01, 'Combo', 'Hit lands after (s)'),
  comboWindow: t(0.45, 0.1, 1.5, 0.05, 'Combo', 'Time to continue string (s)'),
  inputBuffer: t(0.2, 0, 0.5, 0.01, 'Combo', 'Early tap buffer (s)'),
  lungeDistance: t(40, 0, 160, 2, 'Combo', 'Lunge distance per hit'),
  lungeTime: t(0.1, 0.02, 0.3, 0.01, 'Combo', 'Lunge time (s)'),
  turnClampDeg: t(45, 0, 180, 1, 'Combo', 'Turn clamp between hits (deg)'),
  snapRange: t(160, 0, 400, 5, 'Combo', 'Auto-snap range'),
  hitRange: t(70, 20, 200, 2, 'Combo', 'Hits 1-3 reach'),
  hitArcDeg: t(110, 20, 360, 5, 'Combo', 'Hits 1-3 arc (deg)'),
  hitDamage: t(10, 1, 100, 1, 'Combo', 'Hits 1-3 damage'),
  hitKnockback: t(120, 0, 800, 10, 'Combo', 'Hits 1-3 knockback'),
  finisherRadius: t(100, 30, 300, 2, 'Combo', 'Finisher radius'),
  finisherDamage: t(20, 1, 150, 1, 'Combo', 'Finisher damage'),
  finisherKnockback: t(450, 0, 1200, 10, 'Combo', 'Finisher knockback'),
  finisherCooldown: t(0.6, 0, 2, 0.05, 'Combo', 'Finisher cooldown (s)'),

  // Charge attacks (hold attack)
  chargeHoldTime: t(0.3, 0.1, 1, 0.02, 'Charge', 'Hold to charge (s)'),
  chargeRecovery: t(0.35, 0.05, 1, 0.01, 'Charge', 'Charge attack recovery (s)'),
  launcherRange: t(110, 20, 300, 5, 'Charge', 'Launcher reach (0 hits)'),
  launcherArcDeg: t(60, 10, 360, 5, 'Charge', 'Launcher arc (deg)'),
  launcherDamage: t(15, 1, 150, 1, 'Charge', 'Launcher damage'),
  launcherStun: t(0.9, 0, 3, 0.05, 'Charge', 'Launcher stun (s)'),
  sweepRadius: t(110, 20, 300, 5, 'Charge', 'Sweep reach (1-2 hits)'),
  sweepArcDeg: t(220, 10, 360, 5, 'Charge', 'Sweep arc (deg)'),
  sweepDamage: t(15, 1, 150, 1, 'Charge', 'Sweep damage'),
  sweepKnockback: t(320, 0, 1200, 10, 'Charge', 'Sweep knockback'),
  bigRadius: t(150, 30, 400, 5, 'Charge', 'Big finisher radius (3 hits)'),
  bigDamage: t(40, 1, 300, 1, 'Charge', 'Big finisher damage'),
  bigKnockback: t(650, 0, 1500, 10, 'Charge', 'Big finisher knockback'),

  // Dodge
  dodgeDistance: t(130, 20, 400, 5, 'Dodge', 'Roll distance'),
  dodgeTime: t(0.28, 0.08, 0.8, 0.01, 'Dodge', 'Roll time (s)'),
  dodgeIFrames: t(0.22, 0, 0.8, 0.01, 'Dodge', 'Invulnerable for (s)'),
  dodgeCooldown: t(0.35, 0, 2, 0.05, 'Dodge', 'Roll cooldown (s)'),

  // Feel
  hitStop: t(0.05, 0, 0.25, 0.005, 'Feel', 'Hit-stop (s)'),
  finisherHitStop: t(0.09, 0, 0.3, 0.005, 'Feel', 'Finisher hit-stop (s)'),
  bigHitStop: t(0.13, 0, 0.4, 0.005, 'Feel', 'Big finisher hit-stop (s)'),
  shakeDuration: t(0.08, 0, 0.4, 0.01, 'Feel', 'Shake duration (s)'),
  shakeIntensity: t(0.004, 0, 0.03, 0.0005, 'Feel', 'Hit shake strength'),
  finisherShakeIntensity: t(0.01, 0, 0.05, 0.0005, 'Feel', 'Finisher shake strength'),
  hurtShakeIntensity: t(0.008, 0, 0.05, 0.0005, 'Feel', 'Hurt shake strength'),
  enemyFlashTime: t(0.08, 0, 0.3, 0.01, 'Feel', 'Enemy hit flash (s)'),

  // Player
  playerMaxHp: t(100, 10, 500, 10, 'Player', 'Player HP'),
  playerHurtIFrames: t(0.4, 0, 2, 0.05, 'Player', 'Invulnerable after hurt (s)'),
  playerSize: t(28, 10, 60, 1, 'Player', 'Player size'),

  // Test dummies
  enemyCount: t(12, 0, 40, 1, 'Dummies', 'Dummy count'),
  enemySize: t(26, 10, 60, 1, 'Dummies', 'Dummy size'),
  enemyHp: t(40, 1, 300, 1, 'Dummies', 'Dummy HP'),
  enemySpeed: t(70, 0, 300, 5, 'Dummies', 'Dummy speed'),
  attackTokens: t(2, 0, 10, 1, 'Dummies', 'Attack tokens'),
  enemyWaitRadius: t(90, 30, 300, 5, 'Dummies', 'Wait ring distance'),
  enemyAttackRange: t(40, 10, 150, 2, 'Dummies', 'Starts attack within'),
  enemyStrikeReach: t(55, 10, 200, 2, 'Dummies', 'Strike reach'),
  enemyWindup: t(0.5, 0.1, 2, 0.05, 'Dummies', 'Attack windup (s)'),
  enemyAttackCooldown: t(1.2, 0, 4, 0.1, 'Dummies', 'Attack cooldown (s)'),
  enemyDamage: t(10, 0, 100, 1, 'Dummies', 'Dummy damage'),
  enemyHitStun: t(0.25, 0, 1, 0.01, 'Dummies', 'Hit stun (s)'),
  enemyFriction: t(8, 1, 30, 0.5, 'Dummies', 'Knockback friction'),
  enemyRespawnDelay: t(1.5, 0, 10, 0.1, 'Dummies', 'Respawn delay (s)'),

  // Controls
  stickRadius: t(60, 25, 140, 1, 'Controls', 'Stick radius (px)'),
  stickDeadzone: t(0.15, 0, 0.6, 0.01, 'Controls', 'Stick deadzone'),
  buttonSize: t(96, 50, 180, 2, 'Controls', 'Attack button size (px)'),
  dodgeButtonScale: t(0.75, 0.4, 1.5, 0.05, 'Controls', 'Dodge button size (x)'),
  buttonMargin: t(40, 0, 120, 2, 'Controls', 'Button edge margin (px)'),
  buttonHitPad: t(20, 0, 80, 2, 'Controls', 'Extra touch area (px)'),
  uiAlpha: t(0.45, 0.1, 1, 0.05, 'Controls', 'Control opacity'),
};

export type TuningKey = keyof typeof DEFS;
export const TUNING_DEFS: Record<TuningKey, TuningDef> = DEFS;
export const TUNING_KEYS = Object.keys(DEFS) as TuningKey[];

// Fixed, non-tuned values for the grey-box test arena.
export const ARENA = { width: 2400, height: 1600, grid: 100 };

// Grey-box scaffolding shades. These never ship.
export const GREY = {
  floor: 0x262626,
  grid: 0x303030,
  wall: 0x555555,
  player: 0x9a9a9a,
  playerCharging: 0xd0d0d0,
  playerCooldown: 0x6a6a6a,
  playerHurt: 0xf0f0f0,
  nose: 0xdddddd,
  enemy: 0x6e6e6e,
  enemyToken: 0x888888,
  enemyWindup: 0xc4c4c4,
  enemyFlash: 0xffffff,
  swing: 0xe0e0e0,
  arc: 0xbbbbbb,
  ui: 0x9a9a9a,
  uiPressed: 0xe0e0e0,
};

const STORAGE_KEY = 'nightParade.tuning.v1';

function load(): Record<TuningKey, number> {
  const values = {} as Record<TuningKey, number>;
  for (const k of TUNING_KEYS) values[k] = DEFS[k].value;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    for (const k of TUNING_KEYS) {
      const v = saved[k];
      if (typeof v === 'number' && Number.isFinite(v)) values[k] = v;
    }
  } catch {
    // Storage unavailable or corrupt: use defaults.
  }
  return values;
}

export const tuning: Record<TuningKey, number> = load();

function save(): void {
  try {
    const changed: Partial<Record<TuningKey, number>> = {};
    for (const k of TUNING_KEYS) if (tuning[k] !== DEFS[k].value) changed[k] = tuning[k];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(changed));
  } catch {
    // Ignore: values still apply for this session.
  }
}

export function setTuning(key: TuningKey, value: number): void {
  tuning[key] = value;
  save();
}

export function resetTuning(): void {
  for (const k of TUNING_KEYS) tuning[k] = DEFS[k].value;
  save();
}

export function changedTuningText(): string {
  const lines = TUNING_KEYS.filter((k) => tuning[k] !== DEFS[k].value).map(
    (k) => `${k}: ${tuning[k]} (default ${DEFS[k].value})`,
  );
  return lines.length ? lines.join('\n') : 'All values are at their defaults.';
}
