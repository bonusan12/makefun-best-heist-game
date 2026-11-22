// Every tuning number and colour for Velvet Vault in one place. The playfield is a fixed
// 1280x720 logical area; the renderer scales it to the window, so no rule below depends on
// the screen size. One room, one thief, three patrolling guards, two sweeping cameras.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The heist lasts three minutes; dawn breaks when the clock runs out. */
export const TIME_LIMIT = 180;

/** Loot worth taking before the exit door opens: at least three pieces. */
export const LOOT_TO_WIN = 3;

export const THIEF = {
  radius: 13,
  speed: 205,
  sneakSpeed: 112,
  grabRange: 52,
  grabSeconds: 0.9,
};

export const GUARD = {
  radius: 14,
  patrolSpeed: 68,
  chaseSpeed: 118,
  waitSeconds: 1.1,
  visionRange: 225,
  visionHalfAngle: 0.55,
  catchDistance: 27,
  /** Alarm gained per second while this guard has eyes on the thief. */
  alarmRate: 26,
  /** How long a guard keeps chasing after losing sight. */
  memorySeconds: 2.2,
};

export const CAMERA = {
  visionRange: 275,
  visionHalfAngle: 0.48,
  alarmRate: 20,
  sweepSpeed: 0.55,
};

export const ALARM = {
  max: 100,
  decayPerSecond: 3.5,
  /** Alarm added by the hiss of a smoke pellet going off. */
  smokeCost: 4,
  /** Above this the siren starts and the cones turn red. */
  sirenAt: 60,
};

export const SMOKE = {
  count: 2,
  radius: 95,
  seconds: 4,
};

/** Seconds of grace after the thief slips out of sight before the alarm starts to fall. */
export const SPOT_GRACE = 0.4;

export const PALETTE = {
  backdrop: '#0b0a12',
  floorA: '#2b2118',
  floorB: '#241b13',
  carpet: '#6e1423',
  carpetEdge: '#c9a227',
  wall: '#171224',
  wallTrim: '#c9a227',
  pedestal: '#3a2f4d',
  pedestalTop: '#4d3f68',
  vault: '#4a4238',
  vaultDoor: '#8f8574',
  rope: '#a31621',
  text: '#f2ead8',
  muted: '#b8a888',
  thief: '#e8c97a',
  thiefCloak: '#b08d4f',
  thiefMask: '#e8e4d8',
  guard: '#1d3a5f',
  guardTrim: '#d8c27a',
  cameraBody: '#22242c',
  coneGuard: 'rgba(255, 214, 90, 0.20)',
  coneGuardEdge: 'rgba(255, 214, 90, 0.55)',
  coneCamera: 'rgba(255, 92, 92, 0.16)',
  coneCameraEdge: 'rgba(255, 92, 92, 0.5)',
  coneAlert: 'rgba(255, 60, 60, 0.30)',
  loot: '#ffd94a',
  lootGlow: 'rgba(255, 217, 74, 0.35)',
  exit: '#37c978',
  exitGlow: 'rgba(55, 201, 120, 0.30)',
  smoke: 'rgba(200, 200, 210, 0.45)',
  alarmLow: '#37c978',
  alarmMid: '#ffb020',
  alarmHigh: '#ff3b30',
  panel: '#171224',
  panelEdge: '#c9a227',
  hud: '#14101f',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best haul is kept between visits (this browser only). */
export const BEST_KEY = 'velvet-vault.best';
