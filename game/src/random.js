// A small seeded random number generator (xorshift32): the same seed gives the same game,
// which is what makes the screenshot scenes repeatable. No state leaves the closure.

export function createRandom(seed) {
  let state = (seed | 0) || 0x9e3779b9;
  return function random() {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state |= 0;
    return ((state >>> 0) + 0.5) / 4294967296;
  };
}

/** A random pick from an array, using the seeded generator above. */
export function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

/** Clamp a number into a range. */
export function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

/** Distance between two points. */
export function distance(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Angle from (ax, ay) toward (bx, by), in radians. */
export function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

/** Smallest signed difference between two angles, in (-PI, PI]. */
export function angleDelta(from, to) {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  return delta;
}

/** Move `angle` toward `target` by at most `step` radians. */
export function turnToward(angle, target, step) {
  const delta = angleDelta(angle, target);
  if (Math.abs(delta) <= step) return target;
  return angle + (delta > 0 ? step : -step);
}
