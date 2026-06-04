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
