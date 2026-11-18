// render.js — JOB: Camera and all world drawing (roads, blocks, props, sprites, effects, daylight).
// EXPORTS: Camera, drawWorld, drawActorSprite, drawCarSprite, drawEffects
// USES: config.js, util.js, world.js

import { CONFIG, DISTRICTS } from './config.js';
import { TAU, clamp, rnd } from './util.js';

const W = CONFIG.world;
const SPAN = W.block + W.road;

export class Camera {
  constructor() { this.x = 0; this.y = 0; this.vw = 1280; this.vh = 720; this.shake = 0; this.zoom = 1; }
  follow(x, y, vw, vh, dt) {
    this.vw = vw; this.vh = vh;
    const tx = x - vw / 2, ty = y - vh / 2;
    const k = 1 - Math.pow(0.0015, dt);
    this.x += (tx - this.x) * k; this.y += (ty - this.y) * k;
    this.shake = Math.max(0, this.shake - dt * 2.4);
  }
  apply(ctx) {
    const sx = this.shake > 0 ? rnd(-9, 9) * this.shake : 0;
    const sy = this.shake > 0 ? rnd(-9, 9) * this.shake : 0;
    ctx.setTransform(1, 0, 0, 1, -Math.round(this.x + sx), -Math.round(this.y + sy));
  }
  toWorld(sx, sy) { return { x: sx + this.x, y: sy + this.y }; }
}

function inView(x, y, w, h, cam) {
  return x + w > cam.x - 60 && x < cam.x + cam.vw + 60 && y + h > cam.y - 60 && y < cam.y + cam.vh + 60;
}

// ---------------------------------------------------------------- ground
export function drawWorld(ctx, world, cam, state) {
  const { vw, vh } = cam;
  const x0 = cam.x, y0 = cam.y;
  // sea / sand base
  ctx.fillStyle = '#1d3b40'; ctx.fillRect(x0, y0, vw, vh);
  const water = ctx.createLinearGradient(0, world.beachY, 0, world.h);
  water.addColorStop(0, '#3f8a8c'); water.addColorStop(0.45, '#2d6b73'); water.addColorStop(1, '#1d4e5e');
  ctx.fillStyle = water;
  ctx.fillRect(0, world.beachY, world.w, world.h - world.beachY);
  // sparkle lines on the water
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2;
  for (let i = 0; i < 40; i++) {
    const wy = world.beachY + 60 + i * 37;
    if (wy < y0 - 20 || wy > y0 + vh + 20) continue;
    const off = Math.sin(state.time * 0.6 + i) * 26;
    ctx.beginPath(); ctx.moveTo(x0 + ((i * 173 + off) % vw), wy); ctx.lineTo(x0 + ((i * 173 + off) % vw) + 60, wy); ctx.stroke();
  }
  // beach sand strip
  ctx.fillStyle = '#d8c48d';
  ctx.fillRect(0, world.beachY - 90, world.w, 200);
  ctx.fillStyle = '#e6d6a6'; ctx.fillRect(0, world.beachY - 90, world.w, 26);

  // road grid
  ctx.fillStyle = '#2f3438';
  ctx.fillRect(0, 0, world.w, world.beachY);
  // block ground (sidewalk + lot ground)
  for (const row of world.blocksById) for (const b of row) {
    if (!inView(b.x, b.y, b.w, b.h, cam)) continue;
    ctx.fillStyle = '#8e8168'; ctx.fillRect(b.x, b.y, b.w, b.h);               // sidewalk
    ctx.fillStyle = b.district.color; ctx.fillRect(b.x + 18, b.y + 18, b.w - 36, b.h - 36); // lot ground
    // lot texture
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(b.x + 18, b.y + 18, b.w - 36, 8);
  }
  // beach front block extension (roadside promenade)
  ctx.fillStyle = '#a89a7c';
  ctx.fillRect(0, world.beachY - 20, world.w, 20);

  // lane markings on roads
  ctx.strokeStyle = 'rgba(240,230,190,0.55)'; ctx.lineWidth = 3;
  ctx.setLineDash([26, 26]);
  for (let b = 0; b <= W.cols; b++) {
    const x = b * SPAN + W.road / 2;
    if (x < x0 - 40 || x > x0 + vw + 40) continue;
    ctx.beginPath(); ctx.moveTo(x, y0 - 40); ctx.lineTo(x, y0 + vh + 40); ctx.stroke();
  }
  for (let c = 0; c <= W.rows; c++) {
    const y = c * SPAN + W.road / 2;
    if (y < y0 - 40 || y > y0 + vh + 40) continue;
    ctx.beginPath(); ctx.moveTo(x0 - 40, y); ctx.lineTo(x0 + vw + 40, y); ctx.stroke();
  }
  ctx.setLineDash([]);

  // zebra crossings at intersections
  ctx.fillStyle = 'rgba(240,236,214,0.42)';
  for (let b = 0; b <= W.cols; b++) for (let c = 0; c <= W.rows; c++) {
    const cx = b * SPAN + W.road / 2, cy = c * SPAN + W.road / 2;
    if (cx < x0 - 200 || cx > x0 + vw + 200 || cy < y0 - 200 || cy > y0 + vh + 200) continue;
    for (let i = -2; i <= 2; i++) {
      ctx.fillRect(cx + i * 14 - 3, cy - W.road / 2 + 6, 8, 30);
      ctx.fillRect(cx + i * 14 - 3, cy + W.road / 2 - 36, 8, 30);
      ctx.fillRect(cx - W.road / 2 + 6, cy + i * 14 - 3, 30, 8);
      ctx.fillRect(cx + W.road / 2 - 36, cy + i * 14 - 3, 30, 8);
    }
  }

  // buildings
  for (const row of world.blocksById) for (const b of row) {
    if (!inView(b.x, b.y, b.w, b.h, cam)) continue;
    for (const l of b.lots) {
      if (l.kind === 'container') continue;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(l.x + 7, l.y + 9, l.w, l.h);
      ctx.fillStyle = l.shade; ctx.fillRect(l.x, l.y, l.w, l.h);
      ctx.fillStyle = l.roof; ctx.fillRect(l.x + 6, l.y + 6, l.w - 12, l.h - 12);
      // windows grid
      const wz = l.kind === 'tower' ? 34 : 26;
      ctx.fillStyle = 'rgba(25,30,40,0.35)';
      for (let wx = l.x + 16; wx < l.x + l.w - 20; wx += wz) {
        for (let wy = l.y + 16; wy < l.y + l.h - 20; wy += wz) ctx.fillRect(wx, wy, 12, 9);
      }
      // roof trim / AC unit
      ctx.fillStyle = l.trim; ctx.fillRect(l.x + 6, l.y + 6, l.w - 12, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(l.x + l.w * 0.5 - 14, l.y + l.h * 0.5 - 10, 28, 20);
    }
    if (b.yard) { ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(b.yard.x, b.yard.y, b.yard.w, b.yard.h); }
  }

  // containers
  for (const c of world.containers) {
    if (!inView(c.x, c.y, c.w, c.h, cam)) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(c.x + 5, c.y + 7, c.w, c.h);
    ctx.fillStyle = c.color; ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 2;
    for (let i = 8; i < c.w; i += 10) {
      ctx.beginPath(); ctx.moveTo(c.x + i, c.y + 2); ctx.lineTo(c.x + i, c.y + c.h - 2); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(c.x, c.y, c.w, 4);
  }
  for (const p of world.props) {
    if (p.kind !== 'crane' || !inView(p.x, p.y, p.w, p.h, cam)) continue;
    ctx.fillStyle = '#4a3f36'; ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = '#c8a03c'; ctx.fillRect(p.x - 30, p.y + 20, p.w + 90, 16);
    ctx.fillStyle = '#6b5a44'; ctx.fillRect(p.x + 6, p.y + 36, p.w - 12, p.h - 36);
  }

  // piers into the sea
  ctx.fillStyle = '#6b5a44';
  for (let i = 0; i < 5; i++) ctx.fillRect(300 + i * 760, world.beachY + 20, 40, 260);

  // district name stencil on the ground at block corners (subtle)
  drawStreetLamps(ctx, world, cam, state);
}

function drawStreetLamps(ctx, world, cam, state) {
  for (const l of world.lamps) {
    if (!inView(l.x, l.y, 30, 30, cam)) continue;
    ctx.fillStyle = '#3b3b36'; ctx.beginPath(); ctx.arc(l.x, l.y, 6, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,220,150,0.10)'; ctx.beginPath(); ctx.arc(l.x, l.y, 34, 0, TAU); ctx.fill();
  }
}

// ---------------------------------------------------------------- props pass (behind actors)
export function drawPalms(ctx, world, cam) {
  for (const p of world.palms) {
    if (!inView(p.x, p.y, 60, 60, cam)) continue;
    const s = p.s;
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(p.x + 6, p.y + 10, 22 * s, 10 * s, 0.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#6b5433'; ctx.lineWidth = 5 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(p.x, p.y + 6 * s); ctx.quadraticCurveTo(p.x + 3 * s, p.y - 4 * s, p.x - 2 * s, p.y - 12 * s); ctx.stroke();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + 0.3;
      ctx.strokeStyle = i % 2 ? '#3f6b3c' : '#4f8148'; ctx.lineWidth = 4 * s;
      ctx.beginPath(); ctx.moveTo(p.x - 2 * s, p.y - 12 * s);
      ctx.quadraticCurveTo(p.x + Math.cos(a) * 16 * s, p.y - 12 * s + Math.sin(a) * 16 * s,
        p.x + Math.cos(a) * 28 * s, p.y - 12 * s + Math.sin(a) * 20 * s + 6 * s);
      ctx.stroke();
    }
  }
  ctx.lineCap = 'butt';
}

// ---------------------------------------------------------------- sprites
export function drawActorSprite(ctx, x, y, r, angle, body, head, opts = {}) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(3, 5, r, r * 0.8, 0, 0, TAU); ctx.fill();
  ctx.rotate(angle);
  // shoulders
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.95, r * 0.78, 0, 0, TAU); ctx.fill();
  // arms / gun
  ctx.fillStyle = body;
  const swing = opts.walk ? Math.sin(opts.walk) * 3 : 0;
  ctx.fillRect(r * 0.2, -r * 0.9 + swing, r * 0.75, r * 0.34);
  ctx.fillRect(r * 0.2, r * 0.56 - swing, r * 0.75, r * 0.34);
  if (opts.gun) { ctx.fillStyle = '#22262b'; ctx.fillRect(r * 0.7, -r * 0.16, r * 0.95, r * 0.32); }
  // head
  ctx.fillStyle = head; ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, TAU); ctx.fill();
  if (opts.hat) { ctx.fillStyle = opts.hat; ctx.beginPath(); ctx.arc(-1, 0, r * 0.66, 0, TAU); ctx.fill(); }
  ctx.restore();
}

export function drawCarSprite(ctx, car, t) {
  const m = car.model;
  ctx.save(); ctx.translate(car.x, car.y); ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(-car.len / 2 + 6, -car.wid / 2 + 7, car.len, car.wid);
  // wheels
  ctx.fillStyle = '#1a1a1c';
  ctx.fillRect(-car.len * 0.34, -car.wid / 2 - 3, car.len * 0.2, 6);
  ctx.fillRect(-car.len * 0.34, car.wid / 2 - 3, car.len * 0.2, 6);
  ctx.fillRect(car.len * 0.16, -car.wid / 2 - 3, car.len * 0.2, 6);
  ctx.fillRect(car.len * 0.16, car.wid / 2 - 3, car.len * 0.2, 6);
  // body
  const bodyCol = car.cruiser ? '#f1f1ee' : m.color;
  ctx.fillStyle = bodyCol;
  roundRect(ctx, -car.len / 2, -car.wid / 2, car.len, car.wid, 6); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  roundRect(ctx, -car.len / 2 + 4, -car.wid / 2 + 4, car.len - 8, car.wid - 8, 5); ctx.fill();
  // windshield + roof
  ctx.fillStyle = '#20252c';
  ctx.fillRect(-car.len * 0.14, -car.wid * 0.38, car.len * 0.3, car.wid * 0.76);
  ctx.fillStyle = car.cruiser ? '#1d2c4a' : 'rgba(255,255,255,0.22)';
  ctx.fillRect(-car.len * 0.1, -car.wid * 0.3, car.len * 0.2, car.wid * 0.6);
  if (car.cruiser) {
    ctx.fillStyle = '#1c3a72'; ctx.fillRect(-car.len / 2 + 2, -car.wid / 2 + 3, 16, car.wid - 6);
    // light bar
    const flip = Math.floor(t * 6) % 2 === 0;
    ctx.fillStyle = flip ? '#ff3b3b' : '#3b6bff';
    ctx.fillRect(-4, -car.wid / 2 - 2, 22, 5);
    ctx.fillRect(-4, car.wid / 2 - 3, 22, 5);
  }
  // headlights
  ctx.fillStyle = 'rgba(255,240,170,0.85)';
  ctx.fillRect(car.len / 2 - 5, -car.wid / 2 + 4, 4, 7);
  ctx.fillRect(car.len / 2 - 5, car.wid / 2 - 11, 4, 7);
  ctx.fillStyle = 'rgba(255,60,40,0.8)';
  ctx.fillRect(-car.len / 2 + 1, -car.wid / 2 + 4, 3, 7);
  ctx.fillRect(-car.len / 2 + 1, car.wid / 2 - 11, 3, 7);
  // damage smoke
  if (car.hp < 40) {
    ctx.fillStyle = `rgba(60,60,60,${0.15 + 0.1 * Math.sin(t * 8)})`;
    ctx.beginPath(); ctx.arc(car.len * 0.3, 0, 12 + Math.sin(t * 5) * 3, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

// ---------------------------------------------------------------- effects
export function drawEffects(ctx, fx) {
  for (const e of fx) {
    const a = clamp(e.life / e.max, 0, 1);
    if (e.kind === 'spark') {
      ctx.fillStyle = `rgba(255,${180 + Math.random() * 60 | 0},120,${a})`;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r * a, 0, TAU); ctx.fill();
    } else if (e.kind === 'blood') {
      ctx.fillStyle = `rgba(150,20,25,${a * 0.8})`;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (1.4 - a * 0.4), 0, TAU); ctx.fill();
    } else if (e.kind === 'marker') {
      const pr = e.r * (1.4 - a * 0.4);
      ctx.strokeStyle = `rgba(255,220,90,${a * 0.9})`; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(e.x, e.y, pr, 0, TAU); ctx.stroke();
      ctx.fillStyle = `rgba(255,220,90,${a * 0.25})`;
      ctx.beginPath(); ctx.arc(e.x, e.y, 14, 0, TAU); ctx.fill();
    } else if (e.kind === 'text') {
      ctx.fillStyle = `rgba(255,230,140,${a})`; ctx.font = 'bold 20px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center'; ctx.fillText(e.text, e.x, e.y - (1 - a) * 30);
    } else if (e.kind === 'smoke') {
      ctx.fillStyle = `rgba(200,200,200,${a * 0.35})`;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (2 - a), 0, TAU); ctx.fill();
    }
  }
}

// ---------------------------------------------------------------- lighting / time of day
export function drawLighting(ctx, cam, state, player) {
  const hour = (state.clockMin % 1440) / 60;
  // dusk factor: 1 = night
  let n = 0;
  if (hour >= 19 || hour < 5.5) n = 1;
  else if (hour >= 18) n = (hour - 18) / 1;
  else if (hour < 6.5) n = 1 - (hour - 5.5);
  n = clamp(n, 0, 1);
  if (n <= 0.01) return;
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgba(${80 - n * 20},${70 - n * 30},${120 - n * 30},1)`;
  ctx.fillRect(cam.x - 40, cam.y - 40, cam.vw + 80, cam.vh + 80);
  ctx.globalCompositeOperation = 'lighter';
  const glow = (x, y, r, col) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  };
  for (const l of state.world.lamps) {
    if (l.x < cam.x - 200 || l.x > cam.x + cam.vw + 200 || l.y < cam.y - 200 || l.y > cam.y + cam.vh + 200) continue;
    glow(l.x, l.y, 110, `rgba(255,200,120,${0.22 * n})`);
  }
  glow(player.x, player.y, 150, `rgba(255,235,200,${0.10 * n})`);
  ctx.globalCompositeOperation = 'source-over';
  // warm dusk tint over everything
  ctx.fillStyle = `rgba(255,140,60,${0.06 * (1 - n)})`;
  ctx.fillRect(cam.x - 40, cam.y - 40, cam.vw + 80, cam.vh + 80);
}

export function districtBannerData(world, x, y) {
  const b = world.blockAt(x, y);
  if (y > world.beachY - 90) return DISTRICTS[2];
  if (b) return b.district;
  return DISTRICTS[0];
}

export { SPAN };
