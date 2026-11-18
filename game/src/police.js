// police.js — JOB: Wanted level 1..5, chasing cruisers, roadblocks at 4+, pursuit heat cooling by line of sight.
// EXPORTS: Police
// USES: config.js, util.js, cars.js

import { CONFIG, CAR_BY_ID } from './config.js';
import { Car } from './cars.js';
import { clamp, dist, angleTo, pick, rnd, TAU } from './util.js';

const PC = CONFIG.police;

export class Police {
  constructor(game) {
    this.game = game;
    this.wanted = 0;       // 0..5
    this.heat = 0;         // seconds since last seen by a cop
    this.cruisers = [];
    this.spawnTimer = 0;
    this.roadblockTimer = 12;
    this.roadblocks = [];
    this.witnessCool = 0;
    this.lastSeen = null;
    this.pursuitMessage = '';
  }

  setWanted(n, reason) {
    const old = this.wanted;
    this.wanted = clamp(n, 0, 5);
    if (this.wanted > old) { this.heat = 0; this.game.hud.flashStars(); }
    if (this.wanted === 0 && old > 0) this.clearCops(true);
    this.reason = reason || this.reason;
  }
  addWanted(n, reason) { this.setWanted(this.wanted + n, reason); }

  clearCops(despawn) {
    if (despawn) {
      for (const c of this.cruisers) {
        const car = c.car;
        this.game.cars = this.game.cars.filter(x => x !== car);
      }
      this.cruisers.length = 0;
      this.roadblocks.forEach(r => { r.cars.forEach(car => { this.game.cars = this.game.cars.filter(x => x !== car); }); });
      this.roadblocks.length = 0;
      this.game.audio.sirenOff();
    }
  }

  get targetCount() {
    if (this.wanted === 0) return 0;
    // want a heavy presence but keep the frame budget small
    return Math.min(5, 1 + this.wanted);
  }

  spawnCruiser(nearX, nearY, distance) {
    const g = this.game;
    const ang = rnd(0, TAU);
    let x = nearX + Math.cos(ang) * distance, y = nearY + Math.sin(ang) * distance;
    x = clamp(x, 60, g.world.w - 60); y = clamp(y, 60, g.world.beachY - 60);
    const car = new Car(x, y, angleTo(x, y, nearX, nearY), 'mako');
    car.cruiser = true; car.hp = 220; car.radio = 0;
    g.cars.push(car);
    const cop = { car, fireCool: rnd(0.8, 2), mode: 'chase', stuck: 0, roadblock: null };
    this.cruisers.push(cop);
    return cop;
  }

  spawnRoadblock(nearX, nearY) {
    const g = this.game;
    // place across a road ahead of the player: find nearest road centre
    let best = null, bd = 1e9;
    for (const rx of g.world.roadsX) { const d = Math.abs(rx - nearX); if (d < bd) { bd = d; best = { x: rx, axis: 'x' }; } }
    for (const ry of g.world.roadsY) { const d = Math.abs(ry - nearY); if (d < bd) { bd = d; best = { x: ry, axis: 'y' }; } }
    if (!best) return;
    const rb = { cars: [], timer: 26, axis: best.axis, coord: best.x };
    for (let i = -1; i <= 1; i++) {
      let x, y, ang;
      if (best.axis === 'x') { x = best.x + i * 54; y = nearY + (Math.random() < 0.5 ? 90 : -90); ang = Math.PI / 2; }
      else { x = nearX + (Math.random() < 0.5 ? 90 : -90); y = best.x + i * 54; ang = 0; }
      const car = new Car(x, y, ang, 'mako');
      car.cruiser = true; car.hp = 260;
      g.cars.push(car); rb.cars.push(car);
      this.cruisers.push({ car, fireCool: rnd(0.5, 1.5), mode: 'block', roadblock: rb });
    }
    this.roadblocks.push(rb);
    g.hud.toast('ROADBLOCK AHEAD');
  }

  report(amount, reason) {
    this.addWanted(amount, reason);
  }

  update(dt, player) {
    const g = this.game;
    if (this.wanted > 0) {
      // heat decays only while no cop can see the player
      let seen = false;
      for (const c of this.cruisers) {
        if (c.car.hp <= 0) continue;
        const d = dist(c.car.x, c.car.y, player.x, player.y);
        const clear = !g.world.blockCollides(c.car.x, c.car.y, player.x, player.y, 6);
        if (d < (c.mode === 'block' ? 700 : PC.sight) && clear) { seen = true; break; }
      }
      const visible = seen;
      if (visible) { this.heat = 0; this.lastSeen = { x: player.x, y: player.y }; }
      else this.heat += dt;
      if (this.heat > PC.loseTime) {
        const before = this.wanted;
        this.wanted = Math.max(0, this.wanted - 1);
        this.heat = 0;
        if (this.wanted === 0) { this.clearCops(true); g.hud.bigToast('HEAT LOST'); }
        else g.hud.bigToast(`HEAT FADING — ${'★'.repeat(this.wanted)}`);
        if (this.wanted < before) this.heat = -1.5;
      }
      // spawn more cruisers to match wanted
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.cruisers.filter(c => c.car.hp > 0).length < this.targetCount) {
        this.spawnTimer = 1.6;
        const anchor = this.lastSeen || { x: player.x, y: player.y };
        this.spawnCruiser(anchor.x, anchor.y, rnd(700, 1100));
      }
      if (this.wanted >= 4) {
        this.roadblockTimer -= dt;
        if (this.roadblockTimer <= 0) { this.roadblockTimer = 24; this.spawnRoadblock(player.x, player.y); }
      }
    }
    for (const rb of this.roadblocks) rb.timer -= dt;
    // clean up empty blocks / dead cruisers
    this.cruisers = this.cruisers.filter(c => {
      if (c.car.hp <= 0) {
        if (Math.random() < 0.5) g.explodeCar(c.car);
        g.cars = g.cars.filter(x => x !== c.car);
        return false;
      }
      return true;
    });
    this.roadblocks = this.roadblocks.filter(r => {
      if (r.timer <= 0 || r.cars.every(c => c.hp <= 0)) {
        for (const c of r.cars) {
          g.cars = g.cars.filter(x => x !== c);
          this.cruisers = this.cruisers.filter(cp => cp.car !== c);
        }
        return false;
      }
      return true;
    });
    if (this.wanted > 0) {
      g.audio.sirenOn();
      let nearest = 9999;
      for (const c of this.cruisers) nearest = Math.min(nearest, dist(c.car.x, c.car.y, player.x, player.y));
      g.audio.sirenLevel(clamp(1 - nearest / 1400, 0, 1) * 0.14);
    }
    for (const c of this.cruisers) this.driveCop(c, dt, player);
  }

  driveCop(cop, dt, player) {
    const g = this.game;
    const car = cop.car;
    const d = dist(car.x, car.y, player.x, player.y);
    cop.fireCool -= dt;
    if (cop.mode === 'block') {
      car.speed *= 0.9;
      car.driveStep(dt, g.world);
      if (d < PC.shootRange && cop.fireCool <= 0 && !g.world.blockCollides(car.x, car.y, player.x, player.y, 4)) {
        cop.fireCool = rnd(0.7, 1.3);
        this.copShoot(car, player);
      }
      return;
    }
    // chase: aim ahead of player, reverse if very close
    const lead = 0.18;
    const px = player.x + (player.car ? Math.cos(player.car.angle) * player.car.speed * lead : 0);
    const py = player.y + (player.car ? Math.sin(player.car.angle) * player.car.speed * lead : 0);
    const desired = angleTo(car.x, car.y, px, py);
    let diff = ((desired - car.angle + Math.PI * 3) % TAU) - Math.PI;
    car.steer = clamp(diff * 1.8, -1, 1);
    const tgt = d > 700 ? car.model.maxSpeed * 0.72 : d > 260 ? car.model.maxSpeed * 0.62 : car.model.maxSpeed * 0.5;
    if (Math.abs(diff) > 1.9 && d < 160) car.speed = -car.model.maxSpeed * 0.3;
    else car.speed += clamp(tgt - car.speed, -400 * dt, 300 * dt);
    car.driveStep(dt, g.world);
    if (Math.abs(car.speed) < 30) cop.stuck += dt; else cop.stuck = 0;
    if (cop.stuck > 2.5) { cop.stuck = 0; car.x += rnd(-80, 80); car.y += rnd(-80, 80); }
    // ram damage
    if (player.car && d < 60 && Math.abs(car.speed) > 120) {
      player.car.damage(Math.abs(car.speed) * 0.02);
      g.camera.shake = 0.5;
    }
    if (!player.car && d < 34) player.damage(24 * dt * 4);
    if (d < PC.shootRange && cop.fireCool <= 0 && !player.car) {
      cop.fireCool = rnd(0.8, 1.5);
      if (!g.world.blockCollides(car.x, car.y, player.x, player.y, 4)) this.copShoot(car, player);
    }
  }

  copShoot(car, player) {
    const g = this.game;
    const a = angleTo(car.x, car.y, player.x, player.y) + rnd(-0.09, 0.09);
    const sx = car.x + Math.cos(a) * 34, sy = car.y + Math.sin(a) * 34;
    g.spawnBullet(sx, sy, a, 9, 620, true);
    g.audio.shot();
  }

  // line-of-sight query used by HUD + heat logic
  anyCopSees(player) {
    for (const c of this.cruisers) {
      if (c.car.hp <= 0) continue;
      if (dist(c.car.x, c.car.y, player.x, player.y) < PC.sight && !this.game.world.blockCollides(c.car.x, c.car.y, player.x, player.y, 6)) return true;
    }
    return false;
  }
}

export { CAR_BY_ID, pick };
