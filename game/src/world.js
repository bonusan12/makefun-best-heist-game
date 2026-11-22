// The game's rules and state, with no drawing and no browser in it: the thief, the guards
// and their patrols, the sweeping cameras, the loot, the smoke and the alarm meter. step()
// advances one fixed step and returns what happened as bit flags, so the caller can react
// without the world knowing about screens or sound. Nothing here allocates after createWorld
// returns, except the short-lived float texts.

import {
  ALARM,
  CAMERA,
  FIELD,
  GUARD,
  LOOT_TO_WIN,
  SMOKE,
  SPOT_GRACE,
  THIEF,
  TIME_LIMIT,
} from './config.js';
import { angleTo, clamp, distance, turnToward } from './random.js';
import { buildLevel } from './level.js';
import { canSee, resolveCircleRects } from './geometry.js';

export const EVENT_LOOT = 1;
export const EVENT_SPOTTED = 2;
export const EVENT_CAUGHT = 4;
export const EVENT_WIN = 8;
export const EVENT_SMOKE = 16;
export const EVENT_DAWN = 32;

export function createWorld(random) {
  const level = buildLevel();
  const solid = [...level.walls, ...level.obstacles];

  const thief = {
    x: level.thiefStart.x,
    y: level.thiefStart.y,
    angle: -Math.PI / 2,
    sneak: false,
    moving: false,
  };
  const guards = level.guards.map((def) => ({
    name: def.name,
    waypoints: def.waypoints,
    x: def.waypoints[0].x,
    y: def.waypoints[0].y,
    angle: 0,
    waypoint: 1,
    wait: 0,
    suspicion: 0,
    memory: 0,
    chasing: false,
    seesThief: false,
    // Where the guard last saw the thief: a chase goes there, not to the thief's
    // live position, so breaking line of sight is a real escape.
    lastSeenX: def.waypoints[0].x,
    lastSeenY: def.waypoints[0].y,
  }));
  const cameras = level.cameras.map((def) => ({
    x: def.x,
    y: def.y,
    baseAngle: def.baseAngle,
    sweep: def.sweep,
    angle: def.baseAngle,
    seesThief: false,
  }));
  const smokes = [];
  for (let index = 0; index < SMOKE.count; index += 1) {
    smokes.push({ x: 0, y: 0, radius: SMOKE.radius, timeLeft: 0 });
  }
  const floats = [];

  const state = {
    thief,
    guards,
    cameras,
    smokes,
    floats,
    loot: level.loot,
    obstacles: level.obstacles,
    exit: level.exit,
    alarm: 0,
    timeLeft: TIME_LIMIT,
    lootCount: 0,
    lootValue: 0,
    smokeLeft: SMOKE.count,
    outcome: 'playing',
    reason: '',
    elapsed: 0,
    spotted: false,
    lastLootName: '',
    lastLootValue: 0,
  };

  function reset() {
    thief.x = level.thiefStart.x;
    thief.y = level.thiefStart.y;
    thief.angle = -Math.PI / 2;
    thief.sneak = false;
    thief.moving = false;
    for (let index = 0; index < guards.length; index += 1) {
      const guard = guards[index];
      guard.x = guard.waypoints[0].x;
      guard.y = guard.waypoints[0].y;
      guard.angle = 0;
      guard.waypoint = 1;
      guard.wait = 0;
      guard.suspicion = 0;
      guard.memory = 0;
      guard.chasing = false;
      guard.seesThief = false;
    }
    for (let index = 0; index < cameras.length; index += 1) {
      cameras[index].angle = cameras[index].baseAngle;
      cameras[index].seesThief = false;
    }
    for (let index = 0; index < smokes.length; index += 1) smokes[index].timeLeft = 0;
    for (let index = 0; index < state.loot.length; index += 1) {
      state.loot[index].taken = false;
      state.loot[index].grab = 0;
    }
    floats.length = 0;
    state.alarm = 0;
    state.timeLeft = TIME_LIMIT;
    state.lootCount = 0;
    state.lootValue = 0;
    state.smokeLeft = SMOKE.count;
    state.outcome = 'playing';
    state.reason = '';
    state.elapsed = 0;
    state.spotted = false;
  }

  function addFloat(x, y, text, color) {
    floats.push({ x, y, text, color, life: 1.4 });
  }

  function moveThief(dt, moveX, moveY, sneak) {
    thief.sneak = sneak;
    const length = Math.sqrt(moveX * moveX + moveY * moveY);
    thief.moving = length > 0.01;
    if (!thief.moving) return;
    const speed = sneak ? THIEF.sneakSpeed : THIEF.speed;
    const nx = moveX / (length || 1);
    const ny = moveY / (length || 1);
    thief.x += nx * speed * dt;
    thief.y += ny * speed * dt;
    thief.angle = turnToward(thief.angle, Math.atan2(ny, nx), 10 * dt);
    const fixed = resolveCircleRects(thief.x, thief.y, THIEF.radius, solid);
    thief.x = clamp(fixed.x, FIELD.width * 0 + THIEF.radius, FIELD.width - THIEF.radius);
    thief.y = clamp(fixed.y, THIEF.radius, FIELD.height - THIEF.radius);
  }

  function moveGuard(guard, dt) {
    const target = guard.waypoints[guard.waypoint];
    const dist = distance(guard.x, guard.y, target.x, target.y);
    if (guard.wait > 0) {
      guard.wait -= dt;
      return;
    }
    if (dist < 6) {
      guard.waypoint = (guard.waypoint + 1) % guard.waypoints.length;
      guard.wait = GUARD.waitSeconds;
      return;
    }
    const nx = (target.x - guard.x) / dist;
    const ny = (target.y - guard.y) / dist;
    guard.x += nx * GUARD.patrolSpeed * dt;
    guard.y += ny * GUARD.patrolSpeed * dt;
    guard.angle = turnToward(guard.angle, Math.atan2(ny, nx), 6 * dt);
    const fixed = resolveCircleRects(guard.x, guard.y, GUARD.radius, solid);
    guard.x = fixed.x;
    guard.y = fixed.y;
  }

  function chaseGuard(guard, dt) {
    const dist = distance(guard.x, guard.y, guard.lastSeenX, guard.lastSeenY);
    if (dist < 8) return;
    const nx = (guard.lastSeenX - guard.x) / dist;
    const ny = (guard.lastSeenY - guard.y) / dist;
    guard.x += nx * GUARD.chaseSpeed * dt;
    guard.y += ny * GUARD.chaseSpeed * dt;
    guard.angle = turnToward(guard.angle, Math.atan2(ny, nx), 8 * dt);
    const fixed = resolveCircleRects(guard.x, guard.y, GUARD.radius, solid);
    guard.x = fixed.x;
    guard.y = fixed.y;
  }

  function nearestLoot() {
    let best = null;
    let bestDist = Infinity;
    for (let index = 0; index < state.loot.length; index += 1) {
      const loot = state.loot[index];
      if (loot.taken) continue;
      const dist = distance(thief.x, thief.y, loot.x, loot.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = loot;
      }
    }
    return { loot: best, distance: bestDist };
  }

  /**
   * One fixed step. moveX/moveY is the thief's wanted direction (already normalised, or
   * zero). With `harmless` set (the title screen's backdrop) the guards patrol and the
   * cameras sweep, but nothing is spotted, nothing is taken and the clock does not run.
   */
  function step(dt, moveX, moveY, sneak, smokePressed, harmless) {
    let events = 0;
    state.elapsed += dt;

    // Smoke clouds fade on their own clock, even on the title screen.
    for (let index = 0; index < smokes.length; index += 1) {
      if (smokes[index].timeLeft > 0) smokes[index].timeLeft -= dt;
    }
    for (let index = floats.length - 1; index >= 0; index -= 1) {
      floats[index].life -= dt;
      floats[index].y -= 22 * dt;
      if (floats[index].life <= 0) floats.splice(index, 1);
    }

    moveThief(dt, moveX, moveY, sneak);

    // The cameras sweep back and forth over their arcs.
    for (let index = 0; index < cameras.length; index += 1) {
      const camera = cameras[index];
      camera.angle = camera.baseAngle + Math.sin(state.elapsed * CAMERA.sweepSpeed + index * 2.1) * camera.sweep;
    }

    if (harmless) {
      for (let index = 0; index < guards.length; index += 1) moveGuard(guards[index], dt);
      return events;
    }

    state.timeLeft -= dt;
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      state.outcome = 'dawn';
      state.reason = 'Dawn breaks — the gallery opens and the crew is gone.';
      return EVENT_DAWN;
    }

    // Smoke: one press, one cloud at the thief's feet, a little noise on the alarm.
    if (smokePressed && state.smokeLeft > 0) {
      let cloud = null;
      for (let index = 0; index < smokes.length; index += 1) {
        if (smokes[index].timeLeft <= 0) {
          cloud = smokes[index];
          break;
        }
      }
      if (cloud !== null) {
        cloud.x = thief.x;
        cloud.y = thief.y;
        cloud.timeLeft = SMOKE.seconds;
        state.smokeLeft -= 1;
        state.alarm = Math.min(ALARM.max, state.alarm + ALARM.smokeCost);
        addFloat(thief.x, thief.y - 24, 'SMOKE', '#cfd2da');
        events |= EVENT_SMOKE;
      }
    }

    // Loot: stand close and the grab fills up; step away and it drains.
    const near = nearestLoot();
    for (let index = 0; index < state.loot.length; index += 1) {
      const loot = state.loot[index];
      if (loot.taken) continue;
      if (loot === near.loot && near.distance <= loot.reach) {
        loot.grab = Math.min(1, loot.grab + dt / THIEF.grabSeconds);
        if (loot.grab >= 1) {
          loot.taken = true;
          state.lootCount += 1;
          state.lootValue += loot.value;
          state.lastLootName = loot.name;
          state.lastLootValue = loot.value;
          addFloat(loot.x, loot.y - 26, `+$${loot.value.toLocaleString('en-US')}`, '#ffd94a');
          events |= EVENT_LOOT;
        }
      } else {
        loot.grab = Math.max(0, loot.grab - dt / THIEF.grabSeconds);
      }
    }

    // Sight: guards and cameras raise the alarm while they see the thief. Sneaking
    // (Shift) moves quietly and halves how fast the alarm climbs.
    let seen = false;
    const quiet = thief.sneak ? 0.5 : 1;
    for (let index = 0; index < guards.length; index += 1) {
      const guard = guards[index];
      const sees = canSee(
        guard.x,
        guard.y,
        guard.angle,
        GUARD.visionHalfAngle,
        GUARD.visionRange,
        thief.x,
        thief.y,
        level.blockers,
        smokes,
      );
      guard.seesThief = sees;
      if (sees) {
        seen = true;
        guard.suspicion = Math.min(1, guard.suspicion + dt * 0.8);
        guard.memory = GUARD.memorySeconds;
        guard.chasing = true;
        guard.lastSeenX = thief.x;
        guard.lastSeenY = thief.y;
        state.alarm = Math.min(ALARM.max, state.alarm + GUARD.alarmRate * quiet * dt);
        chaseGuard(guard, dt);
        if (distance(guard.x, guard.y, thief.x, thief.y) < GUARD.catchDistance) {
          state.outcome = 'caught';
          state.reason = `${guard.name} grabbed the thief in the gallery.`;
          return EVENT_CAUGHT;
        }
      } else {
        guard.suspicion = Math.max(0, guard.suspicion - dt * 0.25);
        if (guard.chasing) {
          guard.memory -= dt;
          // Reached the last seen spot and found nobody: give up faster.
          if (distance(guard.x, guard.y, guard.lastSeenX, guard.lastSeenY) < 12) {
            guard.memory -= dt * 2;
          }
          if (guard.memory <= 0) guard.chasing = false;
          else chaseGuard(guard, dt);
          if (distance(guard.x, guard.y, thief.x, thief.y) < GUARD.catchDistance) {
            state.outcome = 'caught';
            state.reason = `${guard.name} grabbed the thief in the gallery.`;
            return EVENT_CAUGHT;
          }
        }
        if (!guard.chasing) moveGuard(guard, dt);
      }
    }
    for (let index = 0; index < cameras.length; index += 1) {
      const camera = cameras[index];
      const sees = canSee(
        camera.x,
        camera.y,
        camera.angle,
        CAMERA.visionHalfAngle,
        CAMERA.visionRange,
        thief.x,
        thief.y,
        level.blockers,
        smokes,
      );
      camera.seesThief = sees;
      if (sees) {
        seen = true;
        state.alarm = Math.min(ALARM.max, state.alarm + CAMERA.alarmRate * quiet * dt);
      }
    }

    if (!seen) {
      state.spotted = false;
      state.alarm = Math.max(0, state.alarm - ALARM.decayPerSecond * dt);
    } else if (!state.spotted) {
      state.spotted = true;
      events |= EVENT_SPOTTED;
    }

    if (state.alarm >= ALARM.max) {
      state.outcome = 'caught';
      state.reason = 'The alarm hit the top — the doors locked and the guards closed in.';
      return EVENT_CAUGHT;
    }

    // The exit only opens for a thief carrying enough of the gallery.
    if (
      state.lootCount >= LOOT_TO_WIN &&
      thief.x > state.exit.x &&
      thief.x < state.exit.x + state.exit.width &&
      thief.y > state.exit.y &&
      thief.y < state.exit.y + state.exit.height
    ) {
      state.outcome = 'won';
      state.reason = 'Clean getaway.';
      return EVENT_WIN;
    }

    return events;
  }

  reset();
  return { state, reset, step, nearestLoot };
}
