// traffic.js — JOB: Population manager: lane traffic, traffic lights, pedestrians, parked cars, pickups.
// EXPORTS: Life
// USES: config.js, util.js, cars.js, actors.js

import { CONFIG, WEAPONS } from './config.js';
import { TrafficCar, randomCar, Car } from './cars.js';
import { Ped } from './actors.js';
import { dist, dist2, rnd, pick, clamp } from './util.js';

const T = CONFIG.traffic;
const SPAN = CONFIG.world.block + CONFIG.world.road;

export class Life {
  constructor(game) {
    this.game = game;
    this.cars = [];
    this.peds = [];
    this.pickups = [];
    this.lights = [];
    this.lightPhase = 0;
    this.initLights();
  }

  initLights() {
    const w = this.game.world;
    for (const rx of w.roadsX) for (const ry of w.roadsY) {
      this.lights.push({ x: rx, y: ry, axis: Math.random() < 0.5 ? 'x' : 'y', state: 'green', t: rnd(0, 6) });
    }
  }

  spawnNear(game, minD, maxD) {
    const p = game.player;
    for (let i = 0; i < 24; i++) {
      const a = rnd(0, Math.PI * 2), d = rnd(minD, maxD);
      const x = clamp(p.x + Math.cos(a) * d, 40, game.world.w - 40);
      const y = clamp(p.y + Math.sin(a) * d, 40, game.world.beachY - 40);
      if (game.world.collideCircle(x, y, 12).hit) continue;
      return { x, y };
    }
    return { x: p.x + rnd(-300, 300), y: p.y + rnd(-300, 300) };
  }

  populate() {
    const g = this.game, w = g.world;
    // parked cars along blocks
    for (let i = 0; i < 26; i++) {
      const blk = pick(pick(w.blocksById));
      const x = blk.x - 30, y = blk.y + rnd(60, blk.h - 60);
      if (w.collideCircle(x, y, 20).hit) continue;
      const car = randomCar(x, y, Math.PI / 2);
      car.parked = true; this.cars.push(car); g.cars.push(car);
    }
    // traffic
    for (let i = 0; i < T.countTarget; i++) this.addTraffic(true);
    // pedestrians
    for (let i = 0; i < T.pedCount; i++) {
      const s = this.spawnNear(g, 120, 1300);
      this.peds.push(new Ped(s.x, s.y));
    }
  }

  addTraffic(anywhere) {
    const g = this.game, w = g.world;
    const axis = Math.random() < 0.5 ? 'x' : 'y';
    const dir = Math.random() < 0.5 ? 1 : -1;
    let x, y, lane;
    if (axis === 'x') { lane = pick(w.roadsY); x = anywhere ? rnd(100, w.w - 100) : (dir > 0 ? -40 : w.w + 40); y = lane; }
    else { lane = pick(w.roadsX); y = anywhere ? rnd(100, w.beachY - 100) : (dir > 0 ? -40 : w.beachY + 40); x = lane; }
    const models = ['kiwi', 'kiwi', 'parcel', 'gull', 'mako'];
    const tc = new TrafficCar(x, y, axis, dir, pick(models));
    tc.lane = lane;
    this.cars.push(tc);
    g.cars.push(tc);
    return tc;
  }

  update(dt) {
    const g = this.game;
    // --- traffic lights ---
    this.lightPhase += dt;
    const cycle = T.greenTime + T.redTime;
    for (const L of this.lights) {
      const p = (this.lightPhase + (L.x + L.y) * 0.001) % cycle;
      L.state = p < T.greenTime ? 'green' : 'red';
    }
    // --- traffic ---
    const list = [];
    for (const c of g.cars) if (c instanceof TrafficCar) list.push(c);
    for (const c of list) {
      if (c.hp <= 0) continue;
      c.aiUpdate(dt, g.world, this.lights, g.cars);
      this.carVsPlayer(c, dt);
    }
    // keep traffic density
    const trafficCount = list.filter(c => c.hp > 0).length;
    if (trafficCount < T.countTarget && Math.random() < dt * 1.6) this.addTraffic(false);
    // --- pedestrians ---
    for (const p of this.peds) p.update(dt, g);
    this.peds = this.peds.filter(p => p.state !== 'down' || (p.downTimer = (p.downTimer || 0) + dt) < 25);
    // respawn peds out of view
    while (this.peds.length < T.pedCount) {
      const s = this.spawnNear(g, 700, 1500);
      const np = new Ped(s.x, s.y);
      this.peds.push(np);
    }
    // --- pickups: cash/health/armor spawned when idle ---
    for (const pk of this.pickups) pk.t = (pk.t || 0) + dt;
    this.pickups = this.pickups.filter(pk => {
      if (dist2(pk.x, pk.y, g.player.x, g.player.y) < 30 * 30) {
        this.collect(pk, g);
        return false;
      }
      return true;
    });
    if (Math.random() < dt * 0.09 && this.pickups.length < 9) {
      const s = this.spawnNear(g, 200, 900);
      const kinds = ['cash', 'cash', 'health', 'armour', 'smg', 'shotgun'];
      this.pickups.push({ x: s.x, y: s.y, kind: pick(kinds), t: 0 });
    }
  }

  collect(pk, g) {
    if (pk.kind === 'cash') { g.state.cash += 150; g.hud.toast('+$150'); }
    else if (pk.kind === 'health') { g.player.heal(40); g.hud.toast('HEALTH +40'); }
    else if (pk.kind === 'armour') { g.player.giveArmour(50); g.hud.toast('ARMOUR +50'); }
    else { g.player.giveWeapon(pk.kind); g.hud.toast(WEAPONS[pk.kind].name + ' PICKED UP'); }
    g.audio.pickup();
    g.fx.push({ kind: 'marker', x: pk.x, y: pk.y, r: 40, life: 0.4, max: 0.4 });
  }

  carVsPlayer(c, dt) {
    const g = this.game, p = g.player;
    if (p.car === c || p.dead) return;
    const speed = Math.abs(c.speed);
    if (speed < 110) return;
    if (dist2(c.x, c.y, p.x, p.y) < 34 * 34) {
      p.damage(clamp(speed * 0.18, 6, 45));
      g.camera.shake = 0.6;
      const a = Math.atan2(p.y - c.y, p.x - c.x);
      const nc = g.world.collideCircle(p.x + Math.cos(a) * 40, p.y + Math.sin(a) * 40, p.r);
      p.x = nc.x; p.y = nc.y;
      // driver panics and drives off
      if (c instanceof TrafficCar) c.afk = 0;
      g.onCrime('assault', 0);
    }
  }

  addPickup(x, y, kind) { this.pickups.push({ x, y, kind, t: 0 }); }
}

export { Car };
