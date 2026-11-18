// game.js — JOB: The game loop and rules glue: spawning, bullets, crimes, death, carjacking, day rollover.
// EXPORTS: Game
// USES: config.js, util.js, world.js, render.js, input.js, audio.js, actors.js, cars.js, police.js,
//       traffic.js, missions.js, hud.js, save.js

import { CONFIG, WEAPONS, CAR_BY_ID } from './config.js';
import { clamp, dist, dist2, angleTo, rnd, pick } from './util.js';
import { buildWorld } from './world.js';
import { Camera, drawWorld, drawPalms, drawEffects, drawActorSprite, drawCarSprite, drawLighting, districtBannerData } from './render.js';
import { Input } from './input.js';
import { Audio2 } from './audio.js';
import { Player, Ped } from './actors.js';
import { Car, TrafficCar, RADIO_STATIONS } from './cars.js';
import { Police } from './police.js';
import { Life } from './traffic.js';
import { Missions, MISSIONS } from './missions.js';
import { HUD } from './hud.js';
import { SaveGame } from './save.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = new Input(canvas);
    this.audio = new Audio2();
    this.camera = new Camera();
    this.save = new SaveGame();
    this.state = { day: 1, cash: 600, completed: [], clockMin: CONFIG.clock.startMinutes, time: 0, running: false, paused: false };
    this.world = buildWorld();
    this.cars = [];
    this.bullets = [];
    this.fx = [];
    this.enemies = [];
    this.radioStations = RADIO_STATIONS;
    this.radioIndex = 0;
    this.missionMarker = null;
    this.currentDistrict = null;
    this.clockAccum = 0;
    this.lastCrime = 0;
    this.witnessShown = false;
    this.hud = new HUD();
    this.police = new Police(this);
    this.missions = new Missions(this);
    this.life = new Life(this);
  }

  reset(saveData) {
    const s = this.state;
    s.day = saveData && saveData.day ? saveData.day : 1;
    s.cash = saveData && typeof saveData.cash === 'number' ? saveData.cash : 600;
    s.completed = saveData && saveData.completed ? saveData.completed.slice() : [];
    s.clockMin = CONFIG.clock.startMinutes;
    s.time = 0;
    this.cars.length = 0; this.bullets.length = 0; this.fx.length = 0; this.enemies.length = 0;
    this.life.cars.length = 0; this.life.peds.length = 0; this.life.pickups.length = 0;
    const sp = this.world.safehouse;
    this.player = new Player(sp.x, sp.y);
    this.police.wanted = 0; this.police.cruisers.length = 0;
    this.police.lastSeen = null;
    this.missions.index = Math.min(MISSIONS.length, s.completed.length);
    this.missions.active = null; this.missions.enemies = [];
    // personal car at the safehouse
    const starter = new Car(sp.x + 60, sp.y - 120, 0, 'kiwi');
    starter.isPlayer = false;
    this.cars.push(starter);
    this.life.populate();
    this.camera.x = this.player.x - 640; this.camera.y = this.player.y - 360;
    const nx = this.missions.next;
    if (nx) { this.hud.dialogue(nx.giver, nx.line); this.hud.setMission(nx, 0); this.hud.clearMission(); }
    else { this.hud.dialogue('Coco', 'Coco: "You did it, rookie. Sun is down and we are gone."'); this.hud.clearMission(); }
    this.hud.lastDistrict = null;
  }

  // ---------------------------------------------------------------- lifecycle
  start() {
    const sv = this.save.peek();
    this.reset(sv);
    this.state.running = true;
    this.state.paused = false;
    this.hud.toast('WASD move · E enter/exit · CLICK shoot · SHIFT sprint');
    if (!this.loopStarted) { this.loopStarted = true; this.lastT = performance.now(); requestAnimationFrame(t => this.frame(t)); }
  }

  frame(now) {
    const dtRaw = (now - this.lastT) / 1000;
    this.lastT = now;
    const dt = Math.min(0.05, Math.max(0.0001, dtRaw));
    if (this.state.running && !this.state.paused) this.update(dt);
    else if (this.state.paused) this.hud.update(dt, this);
    this.render();
    this.input.endFrame();
    requestAnimationFrame(t => this.frame(t));
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    const g = this;
    g.state.time += dt;
    // clock
    g.clockAccum += dt;
    while (g.clockAccum > 1) { g.clockAccum -= 1; g.state.clockMin += CONFIG.clock.minutesPerSecond; if (g.state.clockMin >= 1440) g.state.clockMin -= 1440; }
    // audio + pause
    if (g.input.tap('KeyM')) g.hud.toast(g.audio.toggle() ? 'AUDIO MUTED' : 'AUDIO ON');
    if (g.input.tap('Escape')) { g.state.paused = true; showPause(true, g); }
    g.player.updateCool(dt);
    if (g.player.dead) {
      g.player.deadTimer -= dt;
      if (g.player.deadTimer <= 0) g.respawn();
    }
    if (!g.player.dead) this.control(dt);
    // mission start / free roam trigger
    this.missionTrigger();
    g.missions.update(dt);
    g.life.update(dt);
    g.police.update(dt, g.player);
    this.updateBullets(dt);
    this.updateFx(dt);
    this.updateEnemies(dt);
    // car destruction
    for (const c of g.cars) {
      if (c.hp <= 0 && !c.exploded) { c.exploded = true; this.explodeCar(c); }
    }
    g.cars = g.cars.filter(c => !(c.exploded && c.boomT <= 0));
    // camera + district
    const px = g.player.car ? g.player.car.x : g.player.x;
    const py = g.player.car ? g.player.car.y : g.player.y;
    g.camera.follow(px, py, g.canvas.width, g.canvas.height, dt);
    g.currentDistrict = districtBannerData(g.world, px, py);
    // day rollover at 6am
    if (g.state.clockMin < 360 && g.state.clockMin + CONFIG.clock.minutesPerSecond >= 360) {
      g.state.day++; g.hud.bigToast('DAY ' + g.state.day); g.save.write(g.state);
    }
    g.hud.update(dt, g);
  }

  control(dt) {
    const g = this, p = g.player, input = g.input;
    const aim = g.camera.toWorld(input.mx, input.my);
    if (p.inCar) {
      p.car.update(dt, input, g.world, g.audio);
      if (input.tap('KeyE')) this.exitCar();
      if (input.tap('KeyQ') || input.tap('KeyF')) this.nextRadio();
      return;
    }
    p.updateFoot(dt, input, g.world);
    p.aimAt(aim.x, aim.y);
    if (input.tap('KeyE')) this.tryEnterCar();
    if (input.down && p.canShoot()) p.shoot(aim.x, aim.y, g);
    if (input.tap('Digit1')) { p.weapon = 'pistol'; }
    if (input.tap('Digit2') && p.ammo.smg > 0) p.weapon = 'smg';
    if (input.tap('Digit3') && p.ammo.shotgun > 0) p.weapon = 'shotgun';
    if (input.tap('KeyR')) this.startMission();
  }

  missionTrigger() {
    const g = this;
    if (g.missions.active || g.missions.index >= MISSIONS.length || g.player.dead) return;
    const nx = g.missions.next;
    const t = nx.beachGo ? { x: 300, y: g.world.beachY - 20 } : nx.target;
    const pos = g.player.car ? g.player.car : g.player;
    if (dist(pos.x, pos.y, t.x, t.y) < 90) this.startMission();
  }

  startMission(i) {
    const g = this;
    const idx = i !== undefined ? i : g.missions.index;
    if (g.missions.active) return false;
    if (idx >= MISSIONS.length) { g.hud.toast('NO MORE JOBS'); return false; }
    if (g.missions.index < idx) return false; // must complete in order
    const ok = g.missions.start(idx);
    if (ok) { g.save.write(g.state); g.audio.unlock(); }
    return ok;
  }

  nextRadio() {
    const p = this.player;
    if (!p.car) return;
    p.car.radio = (p.car.radio + 1) % this.radioStations.length;
    this.hud.radioT = 0;
    const s = this.radioStations[p.car.radio];
    this.hud.radio.textContent = s.name + ': ' + s.line;
  }

  // ---------------------------------------------------------------- vehicles
  tryEnterCar() {
    const g = this, p = g.player;
    let best = null, bd = 1e9;
    for (const c of g.cars) {
      if (c.cruiser || c.exploded) continue;
      const d = dist(c.x, c.y, p.x, p.y);
      if (d < 70 && d < bd) { bd = d; best = c; }
    }
    if (!best) { g.hud.toast('NO CAR NEARBY'); return; }
    p.car = best; best.occupied = true; best.isPlayer = true;
    p.x = best.x; p.y = best.y;
    g.audio.engineOn();
    // stealing a moving/occupied car is a crime
    if (best instanceof TrafficCar) { g.onCrime('carjack', 1); g.hud.toast('CARJACKED — ' + best.model.name); }
    else g.hud.toast('GOT IN — ' + best.model.name + ' · Q changes radio');
  }

  exitCar() {
    const g = this, p = g.player;
    const c = p.car;
    if (!c) return;
    const e = c.exitPoint();
    const cc = g.world.collideCircle(e.x, e.y, p.r);
    p.x = cc.x; p.y = cc.y;
    c.isPlayer = false; c.occupied = false;
    c.speed = 0;
    p.car = null;
    g.audio.engineOff();
  }

  explodeCar(c) {
    const g = this;
    c.boomT = 1.6;
    c.hp = 0;
    g.fx.push({ kind: 'spark', x: c.x, y: c.y, r: 70, life: 0.5, max: 0.5 });
    g.fx.push({ kind: 'smoke', x: c.x, y: c.y, r: 30, life: 2.0, max: 2.0 });
    g.camera.shake = Math.min(1.4, g.camera.shake + 0.8);
    g.makeNoise(c.x, c.y, 420, 'explosion');
    if (g.player.car === c) { g.player.car = null; g.player.damage(45); g.audio.engineOff(); }
    for (const ped of g.life.peds) if (dist(ped.x, ped.y, c.x, c.y) < 90) ped.flee(c.x, c.y);
    for (const e of g.enemies) if (dist(e.x, e.y, c.x, c.y) < 90) this.killEnemy(e);
    // chain damage
    for (const o of g.cars) if (o !== c && dist(o.x, o.y, c.x, c.y) < 90) o.damage(40);
    if (c.cruiser) this.onCrime('copkill', 1);
  }

  // ---------------------------------------------------------------- bullets
  spawnBullet(x, y, angle, dmg, range, fromCop) {
    this.bullets.push({ x, y, angle, dmg, range, travelled: 0, fromCop, speed: CONFIG.player.bulletSpeed });
  }

  updateBullets(dt) {
    const g = this;
    const keep = [];
    for (const b of g.bullets) {
      const step = b.speed * dt;
      const nx = b.x + Math.cos(b.angle) * step, ny = b.y + Math.sin(b.angle) * step;
      b.travelled += step;
      let dead = b.travelled > b.range;
      if (!dead && g.world.collideCircle(nx, ny, 2).hit) {
        dead = true;
        g.fx.push({ kind: 'spark', x: nx, y: ny, r: 8, life: 0.12, max: 0.12 });
      }
      if (!dead) {
        for (const c of g.cars) {
          if (c === g.player.car || c.exploded) continue;
          if (dist2(nx, ny, c.x, c.y) < 30 * 30) {
            c.damage(b.fromCop ? 4 : 14);
            g.fx.push({ kind: 'spark', x: nx, y: ny, r: 10, life: 0.14, max: 0.14 });
            if (!b.fromCop && c instanceof TrafficCar) { c.afk = 4; }
            dead = true; break;
          }
        }
      }
      if (!dead) {
        if (b.fromCop) {
          const p = g.player;
          const tgt = p.car ? p.car : p;
          const rr = p.car ? 30 : p.r + 4;
          if (dist2(nx, ny, tgt.x, tgt.y) < rr * rr) {
            if (p.car) p.car.damage(7); else p.damage(b.dmg);
            dead = true;
          }
        } else {
          for (const e of g.enemies) {
            if (e.dead) continue;
            if (dist2(nx, ny, e.x, e.y) < 20 * 20) { this.hurtEnemy(e, b.dmg); dead = true; break; }
          }
          if (!dead) for (const ped of g.life.peds) {
            if (ped.state === 'down') continue;
            if (dist2(nx, ny, ped.x, ped.y) < 17 * 17) {
              ped.damage(b.dmg, g);
              dead = true; break;
            }
          }
        }
      }
      b.x = nx; b.y = ny;
      if (!dead) keep.push(b);
    }
    g.bullets = keep;
  }

  // ---------------------------------------------------------------- crime & witnesses
  onCrime(kind, amount) {
    const g = this;
    const now = g.state.time;
    if (now - g.lastCrime < 0.4) return;
    g.lastCrime = now;
    const add = kind === 'copkill' ? 2 : kind === 'pedkill' ? 2 : kind === 'gunfire' ? 1 : 1;
    g.police.addWanted(amount || add, kind);
    if (kind === 'pedkill') g.hud.toast('MURDER WITNESSED — CALLING POLICE');
  }

  makeNoise(x, y, radius, kind) {
    const g = this;
    for (const ped of g.life.peds) {
      if (ped.state === 'down') continue;
      const d = dist(ped.x, ped.y, x, y);
      if (d < radius) {
        ped.flee(x, y);
        if (kind === 'gunshot' && d < 420 && ped.startCall(g)) {
          if (!g.witnessShown) {
            g.witnessShown = true;
            g.hud.dialogue('Witness', 'A witness is on the phone to the police — break line of sight.');
          }
        }
      }
    }
  }

  onPedKilled(ped) {
    this.onCrime('pedkill', 2);
    this.hud.toast('PEDESTRIAN DOWN');
    this.makeNoise(ped.x, ped.y, 500, 'gunshot');
  }

  onWitnessCalled(ped) {
    const g = this;
    g.police.addWanted(1, 'witness');
    g.hud.dialogue('Witness', 'Witness called it in — the police want you.');
    g.fx.push({ kind: 'text', x: ped.x, y: ped.y - 20, text: 'CALLING POLICE', life: 1.8, max: 1.8 });
    if (g.police.cruisers.length === 0) g.police.spawnCruiser(ped.x, ped.y, 780);
  }

  // ---------------------------------------------------------------- enemies
  spawnEnemy(x, y, stars) {
    const c = this.world.collideCircle(x, y, 12);
    const e = {
      x: c.x, y: c.y, r: 11, angle: 0, hp: 100, dead: false, fireCool: rnd(0.6, 1.6),
      look: pick([{ body: '#5a4b6b', head: '#c99a76' }, { body: '#6b4b4b', head: '#e0b090' }, { body: '#4b5a6b', head: '#c9a07c' }]),
      walkPhase: 0, mission: true,
    };
    this.enemies.push(e);
    return e;
  }
  hurtEnemy(e, dmg) {
    e.hp -= dmg;
    e.flash = 0.15;
    if (e.hp <= 0) this.killEnemy(e);
    else {
      this.fx.push({ kind: 'blood', x: e.x, y: e.y, r: 8, life: 0.35, max: 0.35 });
      this.audio.hit();
    }
  }
  killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    this.fx.push({ kind: 'blood', x: e.x, y: e.y, r: 14, life: 0.6, max: 0.6 });
    this.missions.onEnemyKilled(e);
    this.onCrime('gunfire', 1);
  }
  updateEnemies(dt) {
    const g = this, p = g.player;
    const tgt = p.car ? p.car : p;
    for (const e of g.enemies) {
      if (e.dead) continue;
      const d = dist(e.x, e.y, tgt.x, tgt.y);
      e.angle = angleTo(e.x, e.y, tgt.x, tgt.y);
      if (d > 210 && d < 900) {
        const c = g.world.collideCircle(e.x + Math.cos(e.angle) * 70 * dt, e.y + Math.sin(e.angle) * 70 * dt, e.r);
        e.x = c.x; e.y = c.y; e.walkPhase += dt * 10;
      }
      e.fireCool -= dt;
      if (e.fireCool <= 0 && d < 420 && !p.dead) {
        e.fireCool = rnd(0.9, 1.8);
        const a = e.angle + rnd(-0.1, 0.1);
        g.spawnBullet(e.x + Math.cos(a) * 16, e.y + Math.sin(a) * 16, a, 11, 460, true);
        g.audio.shot();
      }
    }
    g.enemies = g.enemies.filter(e => !e.dead);
  }

  // ---------------------------------------------------------------- fx
  updateFx(dt) {
    for (const f of this.fx) f.life -= dt;
    this.fx = this.fx.filter(f => f.life > 0);
    for (const c of this.cars) if (c.exploded) c.boomT -= dt;
  }

  // ---------------------------------------------------------------- death
  respawn() {
    const g = this;
    const p = g.player;
    p.dead = false; p.health = 100; p.armour = 0; p.ammo.pistol = Math.max(p.ammo.pistol, 12);
    const sp = g.world.safehouse;
    const c = g.world.collideCircle(sp.x, sp.y, p.r);
    p.x = c.x; p.y = c.y; p.car = null;
    g.audio.engineOff();
    g.police.setWanted(0);
    g.state.cash = Math.max(0, g.state.cash - 150);
    g.hud.bigToast('WASTED — SAFEHOUSE IN OLD TOWN −$150');
    if (g.missions.active) g.missions.fail('You were wasted.');
  }

  // ---------------------------------------------------------------- render
  render() {
    const g = this, ctx = g.canvas.getContext('2d');
    const cam = g.camera;
    cam.vw = g.canvas.width; cam.vh = g.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cam.vw, cam.vh);
    cam.apply(ctx);
    drawWorld(ctx, g.world, cam, g.state);
    drawPalms(ctx, g.world, cam);
    // pickups
    for (const pk of g.life.pickups) {
      const bob = Math.sin((pk.t || 0) * 3) * 3;
      ctx.fillStyle = pk.kind === 'cash' ? '#4dbf6a' : pk.kind === 'health' ? '#e05656' : pk.kind === 'armour' ? '#4d8ee0' : '#d8c24d';
      ctx.fillRect(pk.x - 9, pk.y - 9 + bob, 18, 18);
      ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2; ctx.strokeRect(pk.x - 9, pk.y - 9 + bob, 18, 18);
      ctx.fillStyle = '#12181c'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
      ctx.fillText(pk.kind === 'cash' ? '$' : pk.kind[0].toUpperCase(), pk.x, pk.y + 4 + bob);
    }
    // dead peds under cars
    for (const ped of g.life.peds) {
      if (ped.state === 'down') {
        ctx.save(); ctx.translate(ped.x, ped.y); ctx.rotate(ped.angle);
        ctx.fillStyle = 'rgba(90,20,20,0.5)'; ctx.beginPath(); ctx.ellipse(0, 0, 16, 10, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = ped.look.body; ctx.fillRect(-10, -4, 20, 8); ctx.restore();
      }
    }
    // mission marker
    const mk = g.missionMarker;
    if (mk) {
      const pulse = 0.5 + 0.5 * Math.sin(g.state.time * 3);
      ctx.strokeStyle = `rgba(255,214,64,${0.55 + pulse * 0.4})`; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(mk.x, mk.y, 34 + pulse * 8, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,214,64,0.14)'; ctx.fill();
    }
    // cars
    for (const c of g.cars) {
      if (c.exploded) {
        ctx.fillStyle = 'rgba(30,20,20,0.6)'; ctx.beginPath(); ctx.arc(c.x, c.y, 26, 0, Math.PI * 2); ctx.fill();
        continue;
      }
      drawCarSprite(ctx, c, g.state.time);
      if (c.isPlayer) {
        ctx.strokeStyle = 'rgba(120,255,190,0.7)'; ctx.lineWidth = 2;
        ctx.strokeRect(c.x - 36, c.y - 20, 72, 40);
      }
    }
    // peds
    for (const ped of g.life.peds) {
      if (ped.state === 'down') continue;
      drawActorSprite(ctx, ped.x, ped.y, ped.r, ped.angle, ped.state === 'flee' ? '#e9e0d0' : ped.look.body, ped.look.head, { walk: ped.walkPhase });
      if (ped.state === 'calling') {
        ctx.fillStyle = '#ff6b6b'; ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center';
        ctx.fillText('📞', ped.x, ped.y - 18);
      }
    }
    // enemies
    for (const e of g.enemies) {
      if (e.dead) continue;
      drawActorSprite(ctx, e.x, e.y, e.r, e.angle, e.look.body, e.look.head, { walk: e.walkPhase, gun: true, hat: '#2a2a2a' });
    }
    // player
    const p = g.player;
    if (!p.inCar && !p.dead) {
      drawActorSprite(ctx, p.x, p.y, p.r, p.angle, '#2f5d8a', '#e6b48e', { walk: p.walkPhase, gun: true, hat: '#243a52' });
    } else if (p.inCar) {
      drawActorSprite(ctx, p.car.x, p.car.y, 10, p.car.angle, '#2f5d8a', '#e6b48e', { hat: '#243a52' });
    }
    // bullets
    ctx.lineWidth = 3; ctx.strokeStyle = '#ffe58a';
    for (const b of g.bullets) {
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - Math.cos(b.angle) * 16, b.y - Math.sin(b.angle) * 16); ctx.stroke();
    }
    drawEffects(ctx, g.fx);
    drawLighting(ctx, cam, g.state, p);
    // vignette
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (p.hurtFlash > 0 || p.dead) {
      ctx.fillStyle = `rgba(160,20,20,${p.dead ? 0.45 : p.hurtFlash * 0.6})`;
      ctx.fillRect(0, 0, cam.vw, cam.vh);
    }
  }
}

function showPause(on, g) {
  const m = document.getElementById('pause');
  m.classList.toggle('show', on);
  if (on) {
    m.querySelector('#pause-cash').textContent = '$' + g.state.cash;
    m.querySelector('#pause-done').textContent = g.missions.index + '/12';
  }
}
