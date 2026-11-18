// actors.js — JOB: People: the player (walk/sprint/shoot/health/armour) and pedestrians who flee and call police.
// EXPORTS: Player, Ped, PED_LOOKS
// USES: config.js, util.js

import { CONFIG, WEAPONS } from './config.js';
import { TAU, angleTo, clamp, dist, lerp, rnd, ri, pick } from './util.js';

const P = CONFIG.player;

export const PED_LOOKS = [
  { body: '#c9756b', head: '#e0b090' }, { body: '#6f8fc9', head: '#c99a76' },
  { body: '#a0b57a', head: '#e6c0a0' }, { body: '#c9b36f', head: '#b98a68' },
  { body: '#8a76b0', head: '#e3b995' }, { body: '#cf8a4a', head: '#d9a77c' },
];

export class Player {
  constructor(x, y) {
    this.x = x; this.y = y; this.angle = 0;
    this.r = P.radius;
    this.health = P.maxHealth; this.armour = 0;
    this.car = null;
    this.weapon = 'pistol';
    this.ammo = { pistol: WEAPONS.pistol.ammo, smg: 0, shotgun: 0 };
    this.cool = 0;
    this.walkPhase = 0;
    this.dead = false;
    this.deadTimer = 0;
    this.hurtFlash = 0;
    this.sprinting = false;
    this.lastShot = 0;
    this.shotsFired = 0;
  }
  get weaponDef() { return WEAPONS[this.weapon]; }
  get inCar() { return !!this.car; }

  damage(n) {
    if (this.dead) return;
    const absorbed = Math.min(this.armour, n * 0.7);
    this.armour -= absorbed;
    this.health -= (n - absorbed);
    this.hurtFlash = 0.5;
    if (this.health <= 0) { this.health = 0; this.dead = true; this.deadTimer = 2.6; }
  }

  heal(h) { this.health = Math.min(P.maxHealth, this.health + h); }
  giveArmour(a) { this.armour = Math.min(P.maxArmour, this.armour + a); }
  giveWeapon(id) { this.weapon = id; this.ammo[id] = Math.min(240, (this.ammo[id] || 0) + WEAPONS[id].ammo); }

  // Movement on foot; returns footstep intensity for noise.
  updateFoot(dt, input, world) {
    if (this.dead) { this.deadTimer -= dt; return 0; }
    const ax = input.axis();
    const sprint = input.held('ShiftLeft') && (ax.x || ax.y);
    this.sprinting = !!sprint;
    const sp = sprint ? P.sprint : P.walk;
    let vx = ax.x, vy = ax.y;
    const l = Math.hypot(vx, vy);
    if (l > 0) { vx /= l; vy /= l; }
    const c = world.collideCircle(this.x + vx * sp * dt, this.y + vy * sp * dt, this.r);
    this.x = clamp(c.x, 20, world.w - 20); this.y = clamp(c.y, 20, world.h - 20);
    if (this.y < world.beachY - 60) this.y = world.beachY - 60;
    if (l > 0) { this.walkPhase += dt * (sprint ? 15 : 9); this.angle = lerpAngleTo(this.angle, Math.atan2(vy, vx), dt * 12); }
    return l ? (sprint ? 1.6 : 1) : 0;
  }

  updateCool(dt) { this.cool = Math.max(0, this.cool - dt); this.hurtFlash = Math.max(0, this.hurtFlash - dt); }

  canShoot() { return !this.dead && this.cool <= 0 && this.ammo[this.weapon] > 0; }

  shoot(targetX, targetY, game) {
    const w = this.weaponDef;
    this.cool = w.cooldown;
    this.ammo[this.weapon]--;
    this.angle = angleTo(this.x, this.y, targetX, targetY);
    for (let i = 0; i < w.pellets; i++) {
      const a = this.angle + rnd(-w.spread, w.spread);
      game.spawnBullet(this.x + Math.cos(a) * 18, this.y + Math.sin(a) * 18, a, w.damage, w.range, false);
    }
    game.fx.push({ kind: 'spark', x: this.x + Math.cos(this.angle) * 22, y: this.y + Math.sin(this.angle) * 22, r: 9, life: 0.07, max: 0.07 });
    game.audio.shot();
    game.camera.shake = Math.min(1, game.camera.shake + 0.12);
    game.makeNoise(this.x, this.y, 520, 'gunshot');
    this.lastShot = game.state.time;
    this.shotsFired++;
  }

  aimAt(x, y) { this.angle = angleTo(this.x, this.y, x, y); }
}

function lerpAngleTo(a, b, t) {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * t;
}

export class Ped {
  constructor(x, y) {
    this.x = x; this.y = y; this.r = 9;
    this.angle = rnd(0, TAU);
    this.speed = rnd(46, 74);
    this.look = pick(PED_LOOKS);
    this.state = 'walk'; // walk | flee | down | calling
    this.timer = rnd(1, 4);
    this.walkPhase = rnd(0, 6);
    this.dead = false;
    this.calledCops = false;
    this.calling = 0;
    this.hitFlash = 0;
  }
  flee(fx, fy) {
    if (this.state === 'down') return;
    this.state = 'flee';
    this.angle = angleTo(fx, fy, this.x, this.y);
    this.timer = rnd(1.4, 2.6);
  }
  damage(n, game, px, py) {
    this.dead = true; this.state = 'down';
    this.hitFlash = 1;
    game.fx.push({ kind: 'blood', x: this.x, y: this.y, r: 12, life: 0.6, max: 0.6 });
    game.onPedKilled(this);
  }
  update(dt, game) {
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (this.state === 'down') {
      this.timer -= dt;
      return;
    }
    if (this.state === 'calling') {
      this.calling -= dt;
      if (this.calling <= 0 && !this.calledCops) {
        this.calledCops = true;
        this.state = 'flee'; this.timer = 2;
        game.onWitnessCalled(this);
      }
      return;
    }
    this.timer -= dt;
    if (this.state === 'flee') {
      const spd = this.speed * 2.3;
      const c = game.world.collideCircle(this.x + Math.cos(this.angle) * spd * dt, this.y + Math.sin(this.angle) * spd * dt, this.r);
      this.x = c.x; this.y = c.y;
      if (c.hit) this.angle += rnd(-1.6, 1.6);
      this.walkPhase += dt * 18;
      if (this.timer <= 0) { this.state = 'walk'; this.timer = rnd(1, 3); this.angle = rnd(0, TAU); }
      return;
    }
    // idle wander
    if (this.timer <= 0) { this.angle = rnd(0, TAU); this.timer = rnd(1.5, 4.5); }
    const spd = this.speed;
    const nx = this.x + Math.cos(this.angle) * spd * dt, ny = this.y + Math.sin(this.angle) * spd * dt;
    const c = game.world.collideCircle(nx, ny, this.r);
    if (c.hit) { this.angle = rnd(0, TAU); this.timer = rnd(0.5, 1.5); }
    else { this.x = c.x; this.y = c.y; }
    this.walkPhase += dt * 7;
    this.x = clamp(this.x, 24, game.world.w - 24);
    this.y = clamp(this.y, 24, game.world.beachY + 120);
  }
  startCall(game) {
    if (this.state !== 'flee' || this.calledCops || this.calling > 0) return false;
    this.state = 'calling'; this.calling = 0.9;
    return true;
  }
}

export { dist };
