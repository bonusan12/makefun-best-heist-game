// Geometry helpers for sight and movement: segments against rectangles, rays against the
// room's walls, and the vision-cone polygons the renderer paints. Nothing here knows about
// the game rules; it only answers "can this see that" and "where does this ray stop".

/** True when the point is inside the rectangle (edges count as inside). */
export function pointInRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

/**
 * True when the segment (ax, ay)-(bx, by) touches the rectangle. Uses the slab test, so a
 * segment that only grazes a corner still counts as blocked.
 */
export function segmentHitsRect(ax, ay, bx, by, rect) {
  const dx = bx - ax;
  const dy = by - ay;
  let tMin = 0;
  let tMax = 1;
  if (dx === 0) {
    if (ax < rect.x || ax > rect.x + rect.width) return false;
  } else {
    let t1 = (rect.x - ax) / dx;
    let t2 = (rect.x + rect.width - ax) / dx;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  if (dy === 0) {
    if (ay < rect.y || ay > rect.y + rect.height) return false;
  } else {
    let t1 = (rect.y - ay) / dy;
    let t2 = (rect.y + rect.height - ay) / dy;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  return true;
}

/** True when the segment crosses a smoke cloud (a circle). */
export function segmentHitsCircle(ax, ay, bx, by, cx, cy, radius) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    const ex = cx - ax;
    const ey = cy - ay;
    return ex * ex + ey * ey <= radius * radius;
  }
  let t = ((cx - ax) * dx + (cy - ay) * dy) / lengthSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = ax + t * dx - cx;
  const py = ay + t * dy - cy;
  return px * px + py * py <= radius * radius;
}

/**
 * Distance from (ox, oy) along the ray (dx, dy) to the nearest rectangle in `rects`, or
 * Infinity when the ray hits nothing. The direction must be a unit vector.
 */
export function rayHitDistance(ox, oy, dx, dy, rects) {
  let best = Infinity;
  for (let index = 0; index < rects.length; index += 1) {
    const rect = rects[index];
    let tMin = -Infinity;
    let tMax = Infinity;
    let hit = true;
    if (dx === 0) {
      if (ox < rect.x || ox > rect.x + rect.width) hit = false;
    } else {
      const t1 = (rect.x - ox) / dx;
      const t2 = (rect.x + rect.width - ox) / dx;
      tMin = Math.max(tMin, Math.min(t1, t2));
      tMax = Math.min(tMax, Math.max(t1, t2));
    }
    if (hit) {
      if (dy === 0) {
        if (oy < rect.y || oy > rect.y + rect.height) hit = false;
      } else {
        const t1 = (rect.y - oy) / dy;
        const t2 = (rect.y + rect.height - oy) / dy;
        tMin = Math.max(tMin, Math.min(t1, t2));
        tMax = Math.min(tMax, Math.max(t1, t2));
      }
    }
    if (hit && tMax >= 0 && tMin <= tMax && tMin < best) best = tMin < 0 ? 0 : tMin;
  }
  return best;
}

/**
 * The vision cone of a watcher as a polygon: the watcher at (ox, oy) facing `angle` with
 * `halfAngle` either side and `range` far, clipped by the rectangles in `rects`. Returns the
 * points of the fan, watcher first, so the renderer can fill it as one path.
 */
export function conePolygon(ox, oy, angle, halfAngle, range, rects) {
  const steps = 26;
  const points = [{ x: ox, y: oy }];
  for (let index = 0; index <= steps; index += 1) {
    const ray = angle - halfAngle + (2 * halfAngle * index) / steps;
    const dx = Math.cos(ray);
    const dy = Math.sin(ray);
    const hit = rayHitDistance(ox, oy, dx, dy, rects);
    const length = hit === Infinity ? range : Math.min(hit, range);
    points.push({ x: ox + dx * length, y: oy + dy * length });
  }
  return points;
}

/**
 * True when a watcher at (ox, oy) facing `angle` can see the point (tx, ty): inside the
 * cone's range and half-angle, with no rectangle in `rects` and no smoke cloud in `smokes`
 * crossing the line of sight.
 */
export function canSee(ox, oy, angle, halfAngle, range, tx, ty, rects, smokes) {
  const dx = tx - ox;
  const dy = ty - oy;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance > range) return false;
  if (distance > 1) {
    let delta = Math.atan2(dy, dx) - angle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta <= -Math.PI) delta += Math.PI * 2;
    if (Math.abs(delta) > halfAngle) return false;
  }
  for (let index = 0; index < rects.length; index += 1) {
    if (segmentHitsRect(ox, oy, tx, ty, rects[index])) return false;
  }
  for (let index = 0; index < smokes.length; index += 1) {
    const smoke = smokes[index];
    if (smoke.timeLeft > 0 && segmentHitsCircle(ox, oy, tx, ty, smoke.x, smoke.y, smoke.radius)) return false;
  }
  return true;
}

/**
 * Push a circle (x, y, radius) out of every rectangle it overlaps. Returns the corrected
 * position; the caller keeps the velocity. Walls and furniture are all rectangles, so one
 * routine serves the thief and the guards.
 */
export function resolveCircleRects(x, y, radius, rects) {
  for (let index = 0; index < rects.length; index += 1) {
    const rect = rects[index];
    const nearestX = Math.max(rect.x, Math.min(x, rect.x + rect.width));
    const nearestY = Math.max(rect.y, Math.min(y, rect.y + rect.height));
    const dx = x - nearestX;
    const dy = y - nearestY;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq >= radius * radius) continue;
    if (distanceSq === 0) {
      // Centre inside the rectangle: push out along the shallowest side.
      const left = x - rect.x;
      const right = rect.x + rect.width - x;
      const top = y - rect.y;
      const bottom = rect.y + rect.height - y;
      const smallest = Math.min(left, right, top, bottom);
      if (smallest === left) x = rect.x - radius;
      else if (smallest === right) x = rect.x + rect.width + radius;
      else if (smallest === top) y = rect.y - radius;
      else y = rect.y + rect.height + radius;
      continue;
    }
    const distance = Math.sqrt(distanceSq);
    const push = (radius - distance) / distance;
    x += dx * push;
    y += dy * push;
  }
  return { x, y };
}
