// util.js — JOB: Small shared math, random and formatting helpers.
// EXPORTS: clamp, lerp, dist, dist2, angleTo, lerpAngle, rnd, ri, pick, fmtMoney, fmtTime, TAU, aabb, segIntersect
// USES: nothing

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; };
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
export const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
export const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
export const ri = (a, b) => Math.floor(rnd(a, b + 1));
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];

export function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * t;
}

export const fmtMoney = n => '$' + Math.max(0, Math.round(n)).toLocaleString('en-US');
export const fmtTime = s => {
  s = Math.max(0, Math.ceil(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};

export const aabb = (ax, ay, bx, by, r) =>
  ax < bx + r && ax + r > bx && ay < by + r && ay + r > by;

// Segment vs circle intersection; returns closest hit t in [0,1] or -1.
export function segIntersect(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1, dy = y2 - y1;
  const fx = x1 - cx, fy = y1 - cy;
  const a = dx * dx + dy * dy;
  if (a < 1e-6) return dist2(x1, y1, cx, cy) <= r * r ? 0 : -1;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  let disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  disc = Math.sqrt(disc);
  const t1 = (-b - disc) / (2 * a);
  const t2 = (-b + disc) / (2 * a);
  if (t1 >= 0 && t1 <= 1) return t1;
  if (t2 >= 0 && t2 <= 1) return t2;
  return -1;
}

export const timeStr = mins => {
  const h = Math.floor(mins / 60) % 24, m = Math.floor(mins % 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
};
