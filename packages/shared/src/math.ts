export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Distance along a normalized ray (dirX, dirY) to its first intersection with
 * a circle, or null if it does not hit within maxDistance. Used for the
 * server-side hitscan weapon resolution.
 */
export function rayCircleDistance(
  originX: number,
  originY: number,
  dirX: number,
  dirY: number,
  circleX: number,
  circleY: number,
  radius: number,
  maxDistance: number,
): number | null {
  const mx = originX - circleX;
  const my = originY - circleY;
  const b = mx * dirX + my * dirY;
  const c = mx * mx + my * my - radius * radius;

  // Origin is outside the circle and the ray points away from it.
  if (c > 0 && b > 0) return null;

  const discriminant = b * b - c;
  if (discriminant < 0) return null;

  let t = -b - Math.sqrt(discriminant);
  if (t < 0) t = 0; // origin is inside the circle
  if (t > maxDistance) return null;
  return t;
}

/**
 * Distance along a normalized ray to its first intersection with an
 * axis-aligned box (minX,minY)-(maxX,maxY), or null if it does not hit within
 * maxDistance. Used for bullet/wall collision and line-of-sight blocking.
 */
export function rayAabbDistance(
  originX: number,
  originY: number,
  dirX: number,
  dirY: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  maxDistance: number,
): number | null {
  let tmin = 0;
  let tmax = maxDistance;

  if (Math.abs(dirX) < 1e-9) {
    if (originX < minX || originX > maxX) return null;
  } else {
    let t1 = (minX - originX) / dirX;
    let t2 = (maxX - originX) / dirX;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }

  if (Math.abs(dirY) < 1e-9) {
    if (originY < minY || originY > maxY) return null;
  } else {
    let t1 = (minY - originY) / dirY;
    let t2 = (maxY - originY) / dirY;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }

  if (tmin < 0) return tmax < 0 ? null : 0; // origin inside the box
  if (tmin > maxDistance) return null;
  return tmin;
}
