// The one room of the heist: the Gilded Gallery after closing time. Walls, display
// pedestals, the central vault and velvet ropes are all rectangles, so the same list blocks
// movement and blocks sight. Loot sits on the pedestals and the vault; the guards walk their
// loops; the cameras watch from the walls; the exit door waits at the bottom right.

import { FIELD } from './config.js';

const WALL = 24;

/** The four outer walls, as rectangles. */
export function roomWalls() {
  return [
    { x: 0, y: 0, width: FIELD.width, height: WALL },
    { x: 0, y: FIELD.height - WALL, width: FIELD.width, height: WALL },
    { x: 0, y: 0, width: WALL, height: FIELD.height },
    { x: FIELD.width - WALL, y: 0, width: WALL, height: FIELD.height },
  ];
}

/** Furniture and the vault: solid, and tall enough to block a guard's line of sight. */
export function roomObstacles() {
  return [
    // The central vault, the room's heart and the Star Sapphire's home.
    { x: 560, y: 250, width: 160, height: 140, kind: 'vault' },
    // Four display pedestals, one loot piece each.
    { x: 200, y: 150, width: 90, height: 60, kind: 'pedestal' },
    { x: 990, y: 150, width: 90, height: 60, kind: 'pedestal' },
    { x: 200, y: 510, width: 90, height: 60, kind: 'pedestal' },
    { x: 990, y: 510, width: 90, height: 60, kind: 'pedestal' },
    // Velvet ropes: low barriers that block feet but not eyes (handled by their kind).
    { x: 420, y: 118, width: 220, height: 14, kind: 'rope' },
    { x: 640, y: 588, width: 220, height: 14, kind: 'rope' },
    // Stone pillars flanking the vault.
    { x: 470, y: 330, width: 34, height: 34, kind: 'pillar' },
    { x: 776, y: 330, width: 34, height: 34, kind: 'pillar' },
  ];
}

/** Only the tall obstacles block sight; ropes are low and a guard sees over them. */
export function sightBlockers(obstacles) {
  return obstacles.filter((rect) => rect.kind !== 'rope');
}

/** The five treasures, each with its place, name, payout, how close the thief must get —
 * and the staging spot to wait at while its patrol is near (a corridor the cones rarely
 * reach, or, for the Star Sapphire, behind the vault from the right-hand patrol). */
export function roomLoot() {
  return [
    { x: 245, y: 180, name: 'Emerald Scarab', value: 1200, taken: false, reach: 54, grab: 0, stage: { x: 80, y: 80 } },
    { x: 1035, y: 180, name: 'Golden Idol', value: 1500, taken: false, reach: 54, grab: 0, stage: { x: 1200, y: 80 } },
    { x: 245, y: 540, name: 'Pearl Tiara', value: 900, taken: false, reach: 54, grab: 0, stage: { x: 80, y: 640 } },
    { x: 1035, y: 540, name: 'Sunset Canvas', value: 1800, taken: false, reach: 54, grab: 0, stage: { x: 1200, y: 650 } },
    // The Star Sapphire sits in the middle of the vault: reach over the edge to take it.
    // A generous reach (the thief grabs from the vault's edge, not its middle) keeps the
    // grab from demanding a step into the next patrol's cone.
    { x: 640, y: 320, name: 'Star Sapphire', value: 3000, taken: false, reach: 130, grab: 0, stage: { x: 80, y: 640 } },
  ];
}

/** The three guards and the loops they walk, waypoint by waypoint. */
export function roomGuards() {
  return [
    {
      name: 'Bram',
      waypoints: [
        { x: 350, y: 110 },
        { x: 900, y: 110 },
        { x: 900, y: 240 },
        { x: 350, y: 240 },
      ],
    },
    {
      name: 'Celia',
      waypoints: [
        { x: 350, y: 615 },
        { x: 900, y: 615 },
        { x: 900, y: 480 },
        { x: 350, y: 480 },
      ],
    },
    {
      name: 'Doss',
      waypoints: [
        { x: 880, y: 120 },
        { x: 880, y: 600 },
        { x: 760, y: 360 },
      ],
    },
  ];
}

/** The two wall cameras and the arcs they sweep. */
export function roomCameras() {
  return [
    // Top wall, centre: sweeps the upper half of the room.
    { x: 640, y: 30, baseAngle: Math.PI / 2, sweep: 0.9 },
    // Left wall, middle: sweeps the left half of the room.
    { x: 30, y: 360, baseAngle: 0, sweep: 0.85 },
  ];
}

/** Where the thief slips in, and the door they must reach to get out. */
export const THIEF_START = { x: 80, y: 640 };
export const EXIT_ZONE = { x: 1130, y: 590, width: 110, height: 100 };

/** The whole level in one call, fresh objects every time so a reset is cheap. */
export function buildLevel() {
  const obstacles = roomObstacles();
  return {
    walls: roomWalls(),
    obstacles,
    blockers: [...roomWalls(), ...sightBlockers(obstacles)],
    loot: roomLoot(),
    guards: roomGuards(),
    cameras: roomCameras(),
    exit: EXIT_ZONE,
    thiefStart: THIEF_START,
  };
}
