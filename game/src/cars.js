// cars.js — JOB: Player-driven vehicles: arcade handling physics, damage, enter/exit, radio stations.
// EXPORTS: Car, RADIO_STATIONS, randomCar
// USES: config.js, util.js

import { CAR_MODELS, CAR_BY_ID } from './config.js';
import { TAU, angleTo, clamp, lerp, rnd, pick } from './util.js';

export const RADIO_STATIONS = [
  { name: 'RADIO SOLANA', line: '...cruising the coast, this is Solana 104.6...' },
  { name: 'TESORO FM', line: '...you are what you steal, Raya. Keep moving...' },
  { name: 'PUERTO FM', line: '...docks are quiet tonight. Too quiet...' },
  { name: 'VALVA 88', line: '...slower beats for a slower city...' },
];

let carSeq = 0;

export class Car {
  constructor(x, y, angle, modelId) {
    this.id = ++carSeq;
    this.x = x; this.y = y; this.angle = angle;
    this.model = CAR_BY_ID(modelId);
    this.len = 66; this.wid = 30;
    this.speed = 0;
    this.steer = 0;
    this.hp = this.model.hp;
    this.driver = null;
    this.cruiser = false;
    this.isPlayer = false;
    this.occupied = false;
    this.radio = 0;
    this.radioT = 0;
    this.warned = false;
    this.cops = null; // ai controller
  }
  get maxSpeed() { return this.model.maxSpeed; }

  // Drives with keyboard input. dt in seconds.
  update(dt, input, world, audio) {
    const accelIn = (input.held('KeyW') || input.held('ArrowUp') ? 1 : 0) - (input.held('KeyS') || input.held('ArrowDown') ? 1 : 0);
    const steerIn = (input.held('KeyD') || input.held('ArrowRight') ? 1 : 0) - (input.held('KeyA') || input.held('ArrowLeft') ? 1 : 0);
    if (input.tap('Space')) { this.speed *= 0.55; }
    this.steer = lerp(this.steer, steerIn, clamp(dt * 10, 0, 1));
    const m = this.model;
    const brake = accelIn < 0 && this.speed > 0;
    const target = accelIn > 0 ? m.maxSpeed : brake ? -m.maxSpeed * 0.45 : 0;
    if (accelIn > 0) this.speed += m.accel * (1 - Math.abs(this.speed) / (m.maxSpeed * 1.02)) * dt;
    else if (brake) this.speed -= m.accel * 1.6 * dt;
    else this.speed = lerp(this.speed, 0, clamp(dt * 1.1, 0, 1));
    if (input.held('ShiftLeft') && this.speed > 0) this.speed = Math.min(this.speed, m.maxSpeed);
    this.speed = clamp(this.speed, -m.maxSpeed * 0.5, m.maxSpeed);
    this.driveStep(dt, world);
    if (audio && this.isPlayer) audio.engineLevel(Math.abs(this.speed) / m.maxSpeed);
  }

  // Physics shared with AI cars; steer is -1..1 in this.steer.
  driveStep(dt, world) {
    const sp = this.speed;
    const grip = this.model.grip;
    const turning = clamp(Math.abs(sp) / 60, 0, 1);
    this.angle += this.steer * this.model.turn * turning * Math.sign(sp || 1) * dt;
    this.x += Math.cos(this.angle) * sp * dt;
    this.y += Math.sin(this.angle) * sp * dt;
    // lateral slide
    const side = Math.sin(this.angle) * sp * (1 - grip) * dt * 0.5;
    this.x += side * 0.4; this.y -= side * 0.4;
    // collide: sample corners
    const hw = this.len * 0.42, hh = this.wid * 0.42;
    const cs = Math.cos(this.angle), sn = Math.sin(this.angle);
    for (const [ox, oy] of [[hw, hh], [hw, -hh], [-hw, hh], [-hw, -hh]]) {
      const px = this.x + ox * cs - oy * sn, py = this.y + ox * sn + oy * cs;
      const c = world.collideCircle(px, py, 6);
      if (c.hit) {
        this.x += (c.x - px) * 1.6; this.y += (c.y - py) * 1.6;
        if (Math.abs(this.speed) > 200) { this.hp -= Math.abs(this.speed) * 0.03; }
        this.speed *= 0.55;
      }
    }
    // world bounds
    this.x = clamp(this.x, 20, world.w - 20);
    this.y = clamp(this.y, 20, world.h - 20);
    if (this.y < world.beachY - 80) this.y = world.beachY - 80;
  }

  damage(n) { this.hp -= n; this.warned = false; }

  // nearest free door position
  exitPoint() {
    return { x: this.x - Math.cos(this.angle) * 20, y: this.y - Math.sin(this.angle) * 20 };
  }
}

export function randomCar(x, y, angle) {
  const r = Math.random();
  let acc = 0;
  for (const m of CAR_MODELS) {
    acc += m.weight;
    if (r <= acc) return new Car(x, y, angle, m.id);
  }
  return new Car(x, y, angle, 'kiwi');
}

// Traffic car with a simple lane-follow controller.
export class TrafficCar extends Car {
  constructor(x, y, axis, dir, modelId) {
    super(x, y, axis === 'x' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2), modelId);
    this.axis = axis; // 'x' travels along X, 'y' travels along Y
    this.dir = dir;
    this.lane = 0; this.roadCoord = 0;
    this.cruise = rnd(120, 190);
    this.waiting = false;
    this.tx = 0; this.ty = 0;
    this.turnCooldown = 0;
    this.afk = 0;
  }
  aiUpdate(dt, world, lights, cars) {
    if (this.afk > 0) { this.afk -= dt; this.speed = lerp(this.speed, 0, clamp(dt * 4, 0, 1)); this.driveStep(dt, world); return; }
    // lane target line
    const LANE = 34;
    let distToLight = 1e9;
    const px = this.axis === 'x' ? this.x + this.dir * 60 : this.x;
    const py = this.axis === 'y' ? this.y + this.dir * 60 : this.y;
    // red light check: find nearest intersection ahead on our road
    for (const L of lights) {
      if (L.state !== 'red') continue;
      if (L.axis !== this.axis) continue;
      let d;
      if (this.axis === 'x') {
        if (Math.abs(py - L.y) > 30) continue;
        d = (L.x - this.x) * this.dir;
      } else {
        if (Math.abs(px - L.x) > 30) continue;
        d = (L.y - this.y) * this.dir;
      }
      if (d > 0 && d < 130) distToLight = Math.min(distToLight, d);
    }
    // car ahead check
    let carAhead = 1e9;
    for (const c of cars) {
      if (c === this) continue;
      const dx = c.x - this.x, dy = c.y - this.y;
      if (this.axis === 'x') {
        if (Math.abs(dy) > 26) continue;
        const d = dx * this.dir;
        if (d > 0 && d < 110) carAhead = Math.min(carAhead, d);
      } else {
        if (Math.abs(dx) > 26) continue;
        const d = dy * this.dir;
        if (d > 0 && d < 110) carAhead = Math.min(carAhead, d);
      }
    }
    const blocked = distToLight < 90 || carAhead < 70;
    this.waiting = blocked;
    const targetSpeed = blocked ? 0 : this.cruise;
    this.speed = lerp(this.speed, targetSpeed, clamp(dt * 2.2, 0, 1));
    // steering: stay in lane
    const LANE_OFF = 34 * this.dir;
    let desired;
    if (this.axis === 'x') desired = Math.atan2((this.lane - LANE_OFF) - this.y, this.dir * 100);
    else desired = Math.atan2(this.dir * 100, (this.lane + LANE_OFF) - this.x);
    let diff = ((desired - this.angle + Math.PI * 3) % TAU) - Math.PI;
    this.steer = clamp(diff * 2.2, -1, 1);
    this.driveStep(Math.min(dt, 0.05), world);
    // reached end of the map -> recycle onto another road
    if ((this.axis === 'x' && (this.x < 20 || this.x > world.w - 40)) ||
      (this.axis === 'y' && (this.y < 20 || this.y > world.beachY - 40))) {
      this.respawnLane(world);
    }
  }
  respawnLane(world) {
    if (Math.random() < 0.5) {
      this.axis = 'x'; this.dir = Math.random() < 0.5 ? 1 : -1;
      this.lane = pick(world.roadsY); this.x = this.dir > 0 ? -30 : world.w + 30;
      this.angle = this.dir > 0 ? 0 : Math.PI;
    } else {
      this.axis = 'y'; this.dir = Math.random() < 0.5 ? 1 : -1;
      this.lane = pick(world.roadsX); this.y = this.dir > 0 ? -30 : world.beachY - 30;
      this.angle = this.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    this.speed = 0;
  }
}
