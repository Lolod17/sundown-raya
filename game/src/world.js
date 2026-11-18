// world.js — JOB: Generate the city layout: blocks, roads, beach, port, palms, districts, collision.
// EXPORTS: World, buildWorld
// USES: config.js, util.js

import { CONFIG, DISTRICT_AT, DISTRICTS } from './config.js';
import { ri, rnd, pick, clamp } from './util.js';

const W = CONFIG.world;

export class World {
  constructor() {
    this.blocks = [];      // walkable/quads: {x,y,w,h,district,building,type}
    this.solids = [];      // rects {x,y,w,h,kind}
    this.blocksById = [];  // grid indexed blocks (not beach/port)
    this.palms = [];
    this.containers = [];
    this.lamps = [];
    this.props = [];
    this.roadsX = [];      // vertical roads x positions (centrelines)
    this.roadsY = [];
    this.cells = [];       // full city footprint per row/col
    this.w = 0; this.h = 0;
    this.beachY = 0;
    this.portRect = { x: 0, y: 0, w: 0, h: 0 };
    this.safehouse = { x: 0, y: 0 };
    this.parking = [];
    this.lights = [];
  }

  isRoad(x, y) {
    return this.roadRectsX.some(b => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h);
  }

  blockAt(x, y) {
    const b = Math.floor((x - W.road) / (W.block + W.road));
    const c = Math.floor((y - W.road) / (W.block + W.road));
    if (c < 0 || b < 0 || c >= this.blocksById.length) return null;
    const row = this.blocksById[c];
    return row && row[b] ? row[b] : null;
  }

  // Push a moving circle out of solid rects. Returns {x,y,hit}
  collideCircle(x, y, r) {
    let hit = null;
    const near = this.solidsNear(x, y, r + 4);
    for (const s of near) {
      const cx = clamp(x, s.x, s.x + s.w), cy = clamp(y, s.y, s.y + s.h);
      const dx = x - cx, dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < r * r) {
        const d = Math.sqrt(d2) || 0.001;
        const push = (r - d) / d;
        x += dx * push; y += dy * push;
        hit = s;
      }
    }
    return { x, y, hit };
  }

  solidsNear(x, y, r) {
    if (!this.grid) return this.solids;
    const gs = 200;
    const out = [];
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    const x0 = Math.floor((x - r) / gs), x1 = Math.floor((x + r) / gs);
    const y0 = Math.floor((y - r) / gs), y1 = Math.floor((y + r) / gs);
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
      const cell = this.grid.get(gx + ',' + gy);
      if (!cell) continue;
      for (const s of cell) { if (!seen.has(s)) { seen.add(s); out.push(s); } }
    }
    return out;
  }

  blockCollides(x1, y1, x2, y2, r) {
    // line-of-sight style test: sample for solids
    const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 40);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (this.solidsNear(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, r).length) return true;
    }
    return false;
  }

  indexSolids() {
    const gs = 200;
    this.grid = new Map();
    for (const s of this.solids) {
      const x0 = Math.floor(s.x / gs), x1 = Math.floor((s.x + s.w) / gs);
      const y0 = Math.floor(s.y / gs), y1 = Math.floor((s.y + s.h) / gs);
      for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
        const k = gx + ',' + gy;
        let cell = this.grid.get(k);
        if (!cell) this.grid.set(k, cell = []);
        cell.push(s);
      }
    }
  }
}

export function buildWorld() {
  const w = new World();
  const span = W.block + W.road;
  const cols = W.cols, rows = W.rows;
  const cityW = cols * span + W.beach;
  const cityH = rows * span;
  w.j0 = 0; w.i0 = 0;
  w.w = cityW; w.h = cityH + 260;
  w.beachY = cityH;
  w.portRect = { x: cityW - W.beach + 30, y: 60, w: W.beach - 60, h: 1500 };

  // block iteration in world coords: block b starts at b*span + W.road (road on left/top edge)
  for (let c = 0; c < rows; c++) {
    const row = [];
    for (let b = 0; b < cols; b++) {
      const bx = b * span + W.road, by = c * span + W.road;
      row.push({ x: bx, y: by, w: W.block, h: W.block, col: b, row: c, district: DISTRICT_AT(b, c) });
    }
    w.blocksById.push(row);
  }

  // primary roads every 2 blocks, secondary every 1
  for (let b = 0; b <= cols; b++) w.roadsX.push(b * span + W.road / 2);
  for (let c = 0; c <= rows; c++) w.roadsY.push(c * span + W.road / 2);
  w.roadRectsX = [];
  for (let b = 0; b <= cols; b++) {
    const cx = b * span + W.road / 2;
    w.roadRectsX.push({ x: cx - W.road / 2, y: 0, w: W.road, h: cityH });
  }
  for (let c = 0; c <= rows; c++) {
    const cy = c * span + W.road / 2;
    w.roadRectsX.push({ x: 0, y: cy - W.road / 2, w: cityW, h: W.road });
  }

  // --- build block contents ---
  for (const row of w.blocksById) for (const blk of row) {
    const d = blk.district;
    blk.lots = [];
    const inset = 26;
    const area = { x: blk.x + inset, y: blk.y + inset, w: blk.w - inset * 2, h: blk.h - inset * 2 };

    if (d.id === 'harbor') {
      // port: big warehouses + container yard (containers added below)
      const wh = { x: area.x, y: area.y, w: area.w, h: 190 };
      blk.lots.push({ ...wh, kind: 'warehouse', shade: '#3f4a3c', roof: '#55614c' });
      w.solids.push({ x: wh.x, y: wh.y, w: wh.w, h: wh.h, kind: 'building' });
      const yard = { x: area.x, y: area.y + 210, w: area.w, h: area.h - 210 };
      blk.yard = yard;
      for (let i = 0; i < 9; i++) {
        const cw = 74, ch = 30;
        const rowsN = 3, colsN = 3;
        const px = yard.x + 12 + (i % colsN) * (cw + 26);
        const py = yard.y + 14 + Math.floor(i / colsN) * (ch * 2 + 22);
        const col = pick(['#c0553f', '#3f7f9c', '#c9a13c', '#5f8f5a', '#9c6a3f']);
        const c1 = { x: px, y: py, w: cw, h: ch * 2, color: col };
        w.containers.push(c1);
        w.solids.push({ x: px, y: py, w: cw, h: ch * 2, kind: 'container' });
        blk.lots.push({ ...c1, kind: 'container' });
      }
      // gaps so player can walk between
      continue;
    }
    if (d.id === 'marina' && Math.random() < 0.5) {
      // warehouse/awning lot with an open courtyard
      const b1 = { x: area.x, y: area.y, w: area.w * 0.56, h: area.h * 0.62, kind: 'lowrise' };
      blk.lots.push(b1); w.solids.push({ ...b1, kind: 'building' });
      continue;
    }
    const split = Math.random() < 0.55;
    const lots = split
      ? [
        { x: area.x, y: area.y, w: area.w, h: area.h * (0.36 + rnd(0, 0.12)) },
        { x: area.x, y: area.y + area.h * 0.58, w: area.w * (0.52 + rnd(0, 0.2)), h: area.h * 0.36 },
      ]
      : [{ x: area.x, y: area.y, w: area.w * (0.66 + rnd(0, 0.14)), h: area.h * (0.6 + rnd(0, 0.2)) }];
    for (const l of lots) {
      const kind = d.id === 'stonegate' ? 'tower' : d.id === 'hills' ? 'villa' : d.id === 'oldtown' ? 'shophouse' : 'lowrise';
      const shade = pick(['#8a7b6a', '#9c8a74', '#7f756c', '#93866f', '#a08f7a', '#6f6a66']);
      const lot = { ...l, kind, shade, roof: shade, trim: d.accent };
      blk.lots.push(lot);
      w.solids.push({ x: l.x, y: l.y, w: l.w, h: l.h, kind: 'building' });
    }
    blk.plaza = { x: area.x + area.w * 0.7, y: area.y + area.h * 0.62, w: area.w * 0.3, h: area.h * 0.38 };
  }

  // --- palms along roads and beach ---
  for (let b = 0; b <= cols; b++) {
    const cx = b * span + W.road / 2;
    for (let y = 60; y < cityH - 40; y += 130) {
      w.palms.push({ x: cx + (W.road / 2 - 18) * (Math.random() < 0.5 ? -1 : 1), y: y + rnd(-20, 20), s: rnd(0.8, 1.25) });
    }
  }
  for (let y = 30; y < w.h; y += 90) w.palms.push({ x: cityW - rnd(30, 90), y, s: rnd(0.9, 1.4) });
  for (let x = 30; x < cityW; x += 110) w.palms.push({ x, y: w.beachY - 60 + rnd(-12, 12), s: rnd(0.9, 1.3) });

  // --- port props (cranes as simple solids) ---
  for (let i = 0; i < 3; i++) {
    const cx = cityW - W.beach + 70 + i * 120;
    w.props.push({ kind: 'crane', x: cx, y: 80 + i * 420, w: 34, h: 260 });
    w.solids.push({ x: cx, y: 80 + i * 420, w: 26, h: 200, kind: 'crane' });
  }

  // --- street lamps at intersections ---
  for (let b = 0; b <= cols; b++) for (let c = 0; c <= rows; c++) {
    w.lamps.push({ x: b * span + W.road / 2 + 62, y: c * span + W.road / 2 + 62 });
  }

  // --- parking spots beside the road for car spawns ---
  w.parking = [];
  for (let c = 0; c < rows; c++) for (let b = 0; b < cols; b++) {
    const x = b * span + W.road / 2 + 22, y = c * span + W.road / 2 + 40;
    w.parking.push({ x, y, angle: 0 });
  }

  w.safehouse = { x: 2 * span + W.road / 2 + 40, y: 1 * span + W.road / 2 + 40 };
  w.indexSolids();
  w.districts = DISTRICTS;
  return w;
}
