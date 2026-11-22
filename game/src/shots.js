// The screenshot scenes behind ?shot=start|play|escape|end. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by a simple autopilot, so
// the frame is what a short game really looks like and the same seed always gives the same
// frame. The careful pilot reads the cones before it moves and waits for them to sweep past;
// the reckless one walks straight at the nearest guard until it is caught.

import { CAMERA, GUARD, LOOT_TO_WIN, STEP, THIEF } from './config.js';
import { angleTo, distance } from './random.js';
import { buildLevel } from './level.js';
import { canSee, pointInRect } from './geometry.js';
import { EVENT_CAUGHT, EVENT_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 40;
const ESCAPE_LIMIT_SECONDS = 120;
const END_LIMIT_SECONDS = 120;
const SAMPLE = 1 / 30;
/**
 * The loot to go for next: not the nearest, the safest — the one whose nearest watcher is
 * farthest away, with a small penalty for the walk. A pilot that always chases the nearest
 * treasure walks straight into the patrol guarding it.
 */
function safestLoot(state) {
  let best = null;
  let bestScore = -Infinity;
  for (let index = 0; index < state.loot.length; index += 1) {
    const loot = state.loot[index];
    if (loot.taken) continue;
    const heat = nearestWatcherTo(state, loot.x, loot.y).distance;
    const walk = distance(state.thief.x, state.thief.y, loot.x, loot.y);
    // The walk matters most: a far treasure behind two patrols is worse than a near one
    // with a guard nearby. Heat only breaks the tie between close targets.
    const score = heat * 0.5 - walk;
    if (score > bestScore) {
      bestScore = score;
      best = loot;
    }
  }
  return best;
}

/** How far ahead, in seconds, the pilot checks whether a step stays out of sight. */
const LOOKAHEAD = 0.7;
/** A loot counts as guarded while a watcher is this close to it. */
const HOT_RANGE = 300;
/** Corners no patrol cone reaches: where a hot thief lies low until the alarm falls. */
const HIDE_SPOTS = [
  { x: 80, y: 640 },
  { x: 80, y: 80 },
  { x: 1200, y: 80 },
];
/** The loot the pilot committed to: it keeps one target until it is pocketed, instead of
 * flip-flopping between treasures every time a patrol shifts. Reset by stageShot. */
let committedLoot = null;

const SOLIDS = (() => {
  const level = buildLevel();
  return [...level.walls, ...level.obstacles];
})();
const BLOCKERS = (() => {
  const level = buildLevel();
  return level.blockers;
})();

function rotate(x, y, radians) {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

/**
 * Where a guard will be `ahead` seconds from now, walking its patrol: the next waypoint,
 * in a straight line at patrol speed, pausing at the waypoint. A chasing guard is not
 * predicted — the pilot never plans around a guard that is already chasing it; the
 * flee and the body check handle chasers, and predicting a chase here freezes the
 * pilot (a chaser's cone is always aimed at where the thief was).
 */
function predictGuard(guard, ahead) {
  if (guard.chasing || guard.wait > 0) {
    const still = Math.min(guard.wait, ahead);
    const moving = ahead - still;
    if (moving <= 0) return { x: guard.x, y: guard.y, angle: guard.angle };
    const target = guard.waypoints[guard.waypoint];
    const dist = distance(guard.x, guard.y, target.x, target.y);
    const step = Math.min(dist, GUARD.patrolSpeed * moving);
    const nx = dist === 0 ? 0 : (target.x - guard.x) / dist;
    const ny = dist === 0 ? 0 : (target.y - guard.y) / dist;
    return { x: guard.x + nx * step, y: guard.y + ny * step, angle: Math.atan2(ny, nx) };
  }
  const target = guard.waypoints[guard.waypoint];
  const dist = distance(guard.x, guard.y, target.x, target.y);
  const step = Math.min(dist, GUARD.patrolSpeed * ahead);
  const nx = dist === 0 ? 0 : (target.x - guard.x) / dist;
  const ny = dist === 0 ? 0 : (target.y - guard.y) / dist;
  return { x: guard.x + nx * step, y: guard.y + ny * step, angle: Math.atan2(ny, nx) };
}

/**
 * True when standing at (x, y) would put the thief inside a watcher's cone. `ahead`
 * seconds in the future: a camera's sweep is predictable, so the pilot checks where its
 * cone will be when the thief arrives, not only where it is now. Guards move too slowly
 * to predict, so their angle is taken as it is.
 */
function isWatched(state, x, y, ahead) {
  const future = ahead ?? 0;
  for (let index = 0; index < state.guards.length; index += 1) {
    const guard = state.guards[index];
    const predicted = predictGuard(guard, future);
    if (canSee(predicted.x, predicted.y, predicted.angle, GUARD.visionHalfAngle, GUARD.visionRange, x, y, BLOCKERS, state.smokes)) {
      return guard;
    }
  }
  for (let index = 0; index < state.cameras.length; index += 1) {
    const camera = state.cameras[index];
    const angle =
      camera.baseAngle + Math.sin((state.elapsed + future) * CAMERA.sweepSpeed + index * 2.1) * camera.sweep;
    if (canSee(camera.x, camera.y, angle, CAMERA.visionHalfAngle, CAMERA.visionRange, x, y, BLOCKERS, state.smokes)) {
      return camera;
    }
  }
  return null;
}

/** True when the circle at (x, y) would overlap a wall or a piece of furniture. */
function hitsWall(x, y) {
  for (let index = 0; index < SOLIDS.length; index += 1) {
    const rect = SOLIDS[index];
    // Strict inequalities: a circle resting exactly against a wall (its centre one radius
    // out) is not overlapping it, and the thief must be allowed to slide along that edge.
    if (
      x > rect.x - THIEF.radius &&
      x < rect.x + rect.width + THIEF.radius &&
      y > rect.y - THIEF.radius &&
      y < rect.y + rect.height + THIEF.radius
    ) {
      return true;
    }
  }
  return false;
}

/** The nearest watcher, if any is close enough to matter. */
function nearestWatcher(state, range) {
  let best = null;
  let bestDist = range;
  const watchers = [...state.guards, ...state.cameras];
  for (let index = 0; index < watchers.length; index += 1) {
    const dist = distance(state.thief.x, state.thief.y, watchers[index].x, watchers[index].y);
    if (dist < bestDist) {
      bestDist = dist;
      best = watchers[index];
    }
  }
  return best;
}

/**
 * The nearest patrolling guard to a point, and how far away it is. Only guards count here:
 * a wall camera never moves, so its fixed distance would call every loot permanently hot.
 * Cameras are handled separately, by the checks that ask whether a point is watched now.
 */
function nearestWatcherTo(state, x, y) {
  let best = null;
  let bestDist = Infinity;
  for (let index = 0; index < state.guards.length; index += 1) {
    const dist = distance(x, y, state.guards[index].x, state.guards[index].y);
    if (dist < bestDist) {
      bestDist = dist;
      best = state.guards[index];
    }
  }
  return { watcher: best, distance: bestDist };
}

/**
 * Flee from a watcher that has eyes on the thief: of eight directions, the one whose
 * landing spot (half a second out) is unwatched, off the walls and farthest from the
 * watcher — so the thief runs for open floor, never into a corner.
 */
function fleeDirection(state, seer) {
  const thief = state.thief;
  const away = angleTo(seer.x, seer.y, thief.x, thief.y);
  let best = null;
  let bestScore = -Infinity;
  for (let turn = 0; turn < 8; turn += 1) {
    const angle = away + (turn * Math.PI) / 4;
    const dir = { x: Math.cos(angle), y: Math.sin(angle) };
    const px = thief.x + dir.x * THIEF.speed * 0.9;
    const py = thief.y + dir.y * THIEF.speed * 0.9;
    if (hitsWall(px, py)) continue;
    const watched = isWatched(state, px, py) !== null;
    const separation = distance(px, py, seer.x, seer.y);
    // Run for the nearest hide spot — a corner no patrol reaches — not the room's middle:
    // the middle is where the patrols cross, and fleeing toward it walks the thief into
    // the next guard's cone.
    let toHide = Infinity;
    for (let index = 0; index < HIDE_SPOTS.length; index += 1) {
      const toSpot = distance(px, py, HIDE_SPOTS[index].x, HIDE_SPOTS[index].y);
      if (toSpot < toHide) toHide = toSpot;
    }
    const score = separation * 2 - toHide * 0.8 - (watched ? 150 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = dir;
    }
  }
  if (best !== null) return best;
  return { x: Math.cos(away), y: Math.sin(away) };
}

/**
 * The careful pilot: head for the nearest loot (the exit once three are pocketed), stand
 * still to grab, run from anyone who has eyes on the thief, and otherwise pick the way
 * forward that stays out of the cones — or wait, when every way is watched. A guarded
 * loot is staged first: the pilot waits at a spot toward the room's middle until the
 * patrol drifts away, instead of walking into it.
 */
function carefulPilot(state, world) {
  const thief = state.thief;
  // Once three treasures are pocketed the pilot stops running from the patrol and runs
  // FOR the exit instead: a sighting on the way out costs alarm, but fleeing back the
  // way it came costs the heist — the corridor is short and the exit is close.
  const seer = state.lootCount >= LOOT_TO_WIN ? null : isWatched(state, thief.x, thief.y);
  if (seer !== null) {
    // Run: away from the watcher, and smoke if the alarm is climbing — but keep one
    // pellet in reserve for the run to the exit, where a chaser on the thief's heels
    // is the difference between a win and a grab.
    const dir = fleeDirection(state, seer);
    return { x: dir.x, y: dir.y, sneak: false, smoke: state.alarm > 45 && state.smokeLeft > 1 };
  }
  // A guard that is already chasing is a threat even outside its cone: it is running for
  // the last place it saw the thief, and the pilot does not wait for it to arrive.
  // (Skipped on the way out, same as the flee above: the exit dash outruns a chaser.)
  let chaser = null;
  let chaserDist = 190;
  if (state.lootCount < LOOT_TO_WIN) {
    for (let index = 0; index < state.guards.length; index += 1) {
      const guard = state.guards[index];
      if (!guard.chasing) continue;
      const dist = distance(thief.x, thief.y, guard.x, guard.y);
      if (dist < chaserDist) {
        chaserDist = dist;
        chaser = guard;
      }
    }
  }
  if (chaser !== null) {
    const dir = fleeDirection(state, chaser);
    return { x: dir.x, y: dir.y, sneak: false, smoke: state.alarm > 45 && state.smokeLeft > 1 };
  }

  let targetX;
  let targetY;
  let targetLoot = null;
  if (state.lootCount >= LOOT_TO_WIN) {
    committedLoot = null;
    // Escape by the bottom corridor, not the direct line: the direct line from the vault
    // cuts across the right-hand patrol's triangle, and its cone's edge catches the thief.
    // Drop south to y=640 first — below every patrol's leg — then run east to the exit.
    if (thief.y < 600) {
      targetX = 640;
      targetY = 640;
    } else {
      targetX = state.exit.x + state.exit.width / 2;
      targetY = state.exit.y + state.exit.height / 2;
    }
  } else {
    if (committedLoot === null || committedLoot.taken) {
      committedLoot = safestLoot(state);
    }
    targetLoot = committedLoot;
    if (targetLoot === null) {
      targetX = state.exit.x + state.exit.width / 2;
      targetY = state.exit.y + state.exit.height / 2;
    } else {
      targetX = targetLoot.x;
      targetY = targetLoot.y;
    }
  }
  const dist = distance(thief.x, thief.y, targetX, targetY);
  if (targetLoot !== null && dist <= targetLoot.reach) {
    // Grabbing on tiptoe: sneaking halves how fast the alarm climbs if a cone finds us.
    return { x: 0, y: 0, sneak: true, smoke: false };
  }

  // A hot alarm means lying low: head for the nearest hide spot and wait there until the
  // meter falls — or pop smoke and wait inside the cloud, which no watcher can see through.
  // One pellet stays in reserve for the exit dash, so this only smokes while two are left.
  // The hide-spot walk still steers around the cones, like any other walk.
  let lyingLow = false;
  if (state.alarm > 55 && state.lootCount < LOOT_TO_WIN) {
    const inSmoke = state.smokes.some(
      (smoke) => smoke.timeLeft > 0 && distance(thief.x, thief.y, smoke.x, smoke.y) < smoke.radius * 0.5,
    );
    if (!inSmoke && state.smokeLeft > 1) {
      return { x: 0, y: 0, sneak: true, smoke: true };
    }
    let spotDist = Infinity;
    for (let index = 0; index < HIDE_SPOTS.length; index += 1) {
      const toSpot = distance(thief.x, thief.y, HIDE_SPOTS[index].x, HIDE_SPOTS[index].y);
      if (toSpot < spotDist) {
        spotDist = toSpot;
        spot = HIDE_SPOTS[index];
      }
    }
    if (spotDist > 30) {
      targetX = spot.x;
      targetY = spot.y;
      targetLoot = null;
      lyingLow = true;
    } else {
      return { x: 0, y: 0, sneak: true, smoke: false };
    }
  }

  // A guarded loot is staged, not rushed: wait at its staging spot — a corridor the cones
  // rarely reach, or behind the vault — until the patrol drifts away, then dash in. Hot
  // means a guard is about to walk onto the loot, or a watcher already has eyes on it:
  // mere distance lies (a guard 250 px away with its back turned is no threat at all).
  if (targetLoot !== null && !lyingLow) {
    const heat = nearestWatcherTo(state, targetLoot.x, targetLoot.y);
    const lootHot = heat.distance < 170 || isWatched(state, targetLoot.x, targetLoot.y, 0.7) !== null;
    if (lootHot) {
      const stage = targetLoot.stage;
      const stageDist = distance(thief.x, thief.y, stage.x, stage.y);
      if (stageDist > 24) {
        const dir = { x: (stage.x - thief.x) / stageDist, y: (stage.y - thief.y) / stageDist };
        return { x: dir.x, y: dir.y, sneak: nearestWatcher(state, 340) !== null, smoke: false };
      }
      return { x: 0, y: 0, sneak: false, smoke: false };
    }
  }
  // Even with the patrol far away, the grab only starts when the loot itself will be
  // unwatched when the thief gets there — a sweeping camera over the pedestal means wait.
  // Only the final approach waits: from farther off, the cone will have moved by arrival.
  if (targetLoot !== null && !lyingLow && dist <= 220 && isWatched(state, targetLoot.x, targetLoot.y, 0.7) !== null) {
    return { x: 0, y: 0, sneak: false, smoke: false };
  }

  // Once three treasures are pocketed the pilot runs for the exit at full speed: the
  // bottom corridor is the patrol's backyard and every second there is exposure, so
  // speed beats stealth — a brief sighting at a low alarm is survivable, a slow sneak
  // that lets the patrol catch up is not. And on the way out, a chaser on the thief's
  // heels gets a smoke pellet: the cloud sits between them and the patrol, the chase
  // goes blind, and the thief runs east through the gap it makes.
  const chased = state.guards.some(
    (guard) => guard.chasing && distance(thief.x, thief.y, guard.x, guard.y) < 190,
  );
  const inSmoke = state.smokes.some(
    (smoke) => smoke.timeLeft > 0 && distance(thief.x, thief.y, smoke.x, smoke.y) < smoke.radius,
  );
  const popSmoke =
    state.lootCount >= LOOT_TO_WIN &&
    state.smokeLeft > 0 &&
    !inSmoke &&
    (chased || isWatched(state, thief.x, thief.y) !== null);
  const sneak = lyingLow || (state.lootCount < LOOT_TO_WIN && nearestWatcher(state, 340) !== null);
  const speed = sneak ? THIEF.sneakSpeed : THIEF.speed;
  const steerDist = Math.max(1, distance(thief.x, thief.y, targetX, targetY));
  const desired = { x: (targetX - thief.x) / steerDist, y: (targetY - thief.y) / steerDist };
  const turns = [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, (3 * Math.PI) / 4, (-3 * Math.PI) / 4, Math.PI];
  for (let index = 0; index < turns.length; index += 1) {
    const dir = rotate(desired.x, desired.y, turns[index]);
    // First: can the thief take even one step this way? A direction into furniture is
    // no direction at all — the thief would just push against it forever.
    const stepX = thief.x + dir.x * speed * STEP;
    const stepY = thief.y + dir.y * speed * STEP;
    if (hitsWall(stepX, stepY)) continue;
    // Then sample the step at three points along the way, not only where it lands: a
    // cone can sweep across the path even when the landing spot itself stays clear. A
    // sample that runs into furniture ends the walk there — the thief stops at its edge,
    // which is exactly where a loot grab happens — so it stops the sampling instead of
    // rejecting the direction: only the reachable part of the step has to stay unwatched.
    let clear = true;
    for (let sample = 1; sample <= 3; sample += 1) {
      const ahead = (LOOKAHEAD * sample) / 3;
      const px = thief.x + dir.x * speed * ahead;
      const py = thief.y + dir.y * speed * ahead;
      if (hitsWall(px, py)) break;
      if (isWatched(state, px, py, ahead) !== null) {
        clear = false;
        break;
      }
      // A guard's body is a wall the cones do not see: walking into a patrol from
      // behind — outside its cone — still ends the heist on contact, so no step may
      // land within arm's reach of where a guard will be. A chasing guard's patrol
      // prediction is worthless (it is running at the thief, not its waypoint), so
      // for a chaser the pilot keeps clear of where it stands right now, wider.
      for (let gi = 0; gi < state.guards.length; gi += 1) {
        const guard = state.guards[gi];
        if (guard.chasing) {
          if (distance(px, py, guard.x, guard.y) < 60) {
            clear = false;
            break;
          }
          continue;
        }
        const predicted = predictGuard(guard, ahead);
        if (distance(px, py, predicted.x, predicted.y) < 45) {
          clear = false;
          break;
        }
      }
      if (!clear) break;
    }
    if (clear) {
      return { x: dir.x, y: dir.y, sneak, smoke: popSmoke };
    }
  }
  // Every way is watched: hold still and let the cones sweep past.
  return { x: 0, y: 0, sneak: false, smoke: popSmoke };
}

/** The reckless pilot: walk straight at the nearest guard until the heist ends. */
function recklessPilot(state) {  const thief = state.thief;
  let best = null;
  let bestDist = Infinity;
  for (let index = 0; index < state.guards.length; index += 1) {
    const guard = state.guards[index];
    const dist = distance(thief.x, thief.y, guard.x, guard.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = guard;
    }
  }
  if (best === null) return { x: 0, y: 0, sneak: false, smoke: false };
  const dist = Math.max(1, bestDist);
  return { x: (best.x - thief.x) / dist, y: (best.y - thief.y) / dist, sneak: false, smoke: false };
}

/**
 * Set `world` to the named scene (start, play, escape or end; any other name is start) and
 * return the screen to draw over it and the best haul to show.
 */
export function stageShot(name, world) {
  const state = world.state;
  world.reset();
  committedLoot = null;
  if (name !== 'play' && name !== 'escape' && name !== 'end') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) {
      world.step(STEP, 0, 0, false, false, true);
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }

  const limit = name === 'play' ? PLAY_SECONDS : name === 'escape' ? ESCAPE_LIMIT_SECONDS : END_LIMIT_SECONDS;
  // The end scene plays carefully first (pockets a treasure, raises the alarm), then gets
  // reckless — so the caught frame shows a heist already under way, not a thief who never
  // moved.
  const recklessAfter = name === 'end' ? 14 / STEP : Infinity;
  let events = 0;
  for (let index = 0; index < limit / STEP; index += 1) {
    const move = index >= recklessAfter ? recklessPilot(state) : carefulPilot(state, world);
    events = world.step(STEP, move.x, move.y, move.sneak, move.smoke, false);
    if (events & EVENT_WIN) return { screen: SCREEN_WIN, best: state.lootValue };
    if (events & EVENT_CAUGHT) return { screen: SCREEN_OVER, best: state.lootValue };
  }
  return { screen: SCREEN_PLAY, best: state.lootValue };
}

// Exported for the local playtest harness only; the game never imports these.
export { carefulPilot, recklessPilot, isWatched, nearestWatcherTo, safestLoot };
