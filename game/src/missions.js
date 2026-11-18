// missions.js — JOB: The twelve-mission story across three days: definitions, objectives, fail and reward logic.
// EXPORTS: MISSIONS, Missions
// USES: config.js, util.js

import { CONFIG } from './config.js';
import { dist, angleTo, pick, rnd } from './util.js';

const SPAN = CONFIG.world.block + CONFIG.world.road;
const at = (col, row) => ({ x: col * SPAN + CONFIG.world.road / 2 + 40, y: row * SPAN + CONFIG.world.road / 2 + 40 });

// Each mission: id, day, name, giver, line (dialogue), brief (HUD objective), optional time limit,
// reward, and steps. step.kind: goto | kill | steal | survive | collect
export const MISSIONS = [
  { id: 1, day: 1, name: 'SALT RUN', giver: 'Coco', line: 'Coco: "Welcome to Raya, rookie. Deliver the case before the tide turns."',
    time: 110, reward: 300, kind: 'goto', target: at(5, 1), radius: 70,
    brief: 'Deliver the case to the Coral Marina pier.', why: 'The case never arrived.' },
  { id: 2, day: 1, name: 'PARKING TROUBLE', giver: 'Coco', line: 'Coco: "Those couriers keep parking on our corners. Take their car."',
    reward: 450, kind: 'steal', target: at(2, 2), radius: 60, model: 'gull',
    brief: 'Steal a Pescadero Gull from the Old Town lot.' },
  { id: 3, day: 1, name: 'TWO ON THE ROCKS', giver: 'Inspector Vega', line: 'Vega: "Two runners are talking. Silence them on the boardwalk."',
    time: 90, reward: 600, kind: 'kill', target: at(3, 3), radius: 260, enemies: 2, wanted: 2,
    brief: 'Take out 2 runners near the Sunny Boardwalk.', why: 'The runners got away.' },
  { id: 4, day: 1, name: 'THE STONE DEBT', giver: 'Coco', line: 'Coco: "Dario owes everybody but me. Go collect, gently."',
    reward: 700, kind: 'collect', target: at(4, 5), radius: 80,
    brief: 'Collect the debt envelope in Stonegate.' },
  { id: 5, day: 2, name: 'HARBOR HEAT', giver: 'Paloma', line: 'Paloma: "Port Vela, midnight. Someone is burning my containers."',
    time: 100, reward: 850, kind: 'kill', target: at(6, 2), radius: 300, enemies: 3, wanted: 3,
    brief: 'Stop the 3 arsonists in Port Vela.', why: 'The port burned anyway.' },
  { id: 6, day: 2, name: 'WHEELS OF CERRO ALTO', giver: 'Paloma', line: 'Paloma: "My driver quit. Drive the Ruiz Gira up the hill."',
    time: 95, reward: 900, kind: 'steal', target: at(5, 6), radius: 70, model: 'gira',
    brief: 'Steal a Ruiz Gira in Cerro Alto and keep it.', why: 'The Gira was lost.' },
  { id: 7, day: 2, name: 'LIGHTS OUT', giver: 'Coco', line: 'Coco: "Kill the streetlamps on 4th? No. Kill their runner instead."',
    time: 85, reward: 1000, kind: 'kill', target: at(1, 5), radius: 220, enemies: 2, wanted: 4,
    brief: 'Eliminate the 2 lookouts in Coral Marina.', why: 'The lookouts slipped away.' },
  { id: 8, day: 2, name: 'SIREN TEST', giver: 'Inspector Vega', line: 'Vega: "Let them see you. If you can shake four cars, we are even."',
    time: 90, reward: 1200, kind: 'survive', star: 4, wanted: 4,
    brief: 'Reach 4 stars, then survive and escape the police.', why: 'The police won.' },
  { id: 9, day: 3, name: 'THE LONG PIER', giver: 'Paloma', line: 'Paloma: "Run the length of the beach and do not stop for anyone."',
    time: 75, reward: 1400, kind: 'goto', target: { x: 260, y: 0 }, radius: 90, beachGo: true,
    brief: 'Sprint the beach strip to the far pier.', why: 'You were too slow on the sand.' },
  { id: 10, day: 3, name: 'HARBOR JUSTICE', giver: 'Coco', line: 'Coco: "Vega sold us out. His men are at the port. All of them."',
    time: 120, reward: 1800, kind: 'kill', target: at(6, 4), radius: 320, enemies: 4, wanted: 4,
    brief: 'Take down the 4 enforcers at the port.', why: 'The enforcers held the dock.' },
  { id: 11, day: 3, name: 'FOUR STARS', giver: 'Paloma', line: 'Paloma: "The whole city is looking for you. Give them a show."',
    time: 75, reward: 2200, kind: 'survive', star: 5, wanted: 4,
    brief: 'Provoke the city to 5 stars and outrun them.', why: 'The city caught up.' },
  { id: 12, day: 3, name: 'SUNDOWN RAYA', giver: 'Coco', line: 'Coco: "Last job. Meet me where the sun goes down and we leave together."',
    time: 150, reward: 5000, kind: 'kill', target: at(2, 5), radius: 340, enemies: 3, wanted: 5,
    brief: 'Break the last crew at the Old Town docks, 3 targets.', why: 'Sundown came without you.' },
];

export class Missions {
  constructor(game) {
    this.game = game;
    this.index = 0;          // next mission index (0-based)
    this.active = null;
    this.timeLeft = 0;
    this.objective = '';
    this.distance = 0;
    this.kills = 0;
    this.enemies = [];
    this.started = false;
  }
  get completedCount() { return this.index; }
  get next() { return MISSIONS[this.index] || null; }

  start(i) {
    const g = this.game;
    const m = MISSIONS[i];
    if (!m) return false;
    this.index = i;
    this.active = m;
    this.kills = 0;
    this.timeLeft = m.time || 0;
    this.objective = m.brief;
    this.started = true;
    g.hud.setMission(m, this.timeLeft);
    g.hud.dialogue(m.giver, m.line);
    g.hud.bigToast('MISI ' + m.id + ' — ' + m.name);
    this.spawnMissionActors(m);
    if (m.wanted) g.police.setWanted(m.wanted, 'job');
    if (m.kind === 'steal') this.stealTarget = null;
    if (m.kind === 'goto' || m.kind === 'collect') this.marker = { ...this.targetPos(m) };
    g.missionMarker = this.targetPos(m);
    return true;
  }

  targetPos(m) {
    if (m.beachGo) return { x: 300, y: this.game.world.beachY - 20 };
    return { ...m.target };
  }

  spawnMissionActors(m) {
    const g = this.game;
    this.enemies.forEach(e => { e.dead = true; });
    this.enemies = [];
    const n = m.enemies || 0;
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2), r = rnd(30, Math.min(160, (m.radius || 120) - 20));
      const e = g.spawnEnemy(m.target.x + Math.cos(a) * r, m.target.y + Math.sin(a) * r, m.wanted || 2);
      this.enemies.push(e);
    }
    if (m.kind === 'collect') g.life.addPickup(m.target.x, m.target.y, 'cash');
  }

  // choose a street car of the requested model near the target for steal missions
  findStealTarget() {
    const m = this.active;
    if (!m || m.kind !== 'steal') return;
    if (this.stealTarget && this.stealTarget.hp > 0) return;
    const g = this.game;
    let best = null, bd = 1e9;
    for (const c of g.cars) {
      if (c.cruiser || c.isPlayer || c === g.player.car) continue;
      const d = dist(c.x, c.y, m.target.x, m.target.y);
      if (d < 420 && d < bd) { bd = d; best = c; }
    }
    if (!best) {
      for (const c of g.cars) {
        if (c.cruiser || c === g.player.car) continue;
        const d = dist(c.x, c.y, m.target.x, m.target.y);
        if (d < bd) { bd = d; best = c; }
      }
    }
    if (best) { this.stealTarget = best; this.marker = { x: best.x, y: best.y }; }
  }

  update(dt) {
    const g = this.game;
    const m = this.active;
    if (!m) {
      // free roam: show next mission marker
      if (this.next) g.missionMarker = this.targetPos(this.next);
      return;
    }
    if (m.time) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) return this.fail('Out of time — ' + (m.why || 'the clock beat you.'));
    }
    this.enemies = this.enemies.filter(e => !e.dead);
    // progress objectives
    switch (m.kind) {
      case 'goto': {
        const p = this.targetPos(m);
        if (g.player.inCar && dist(g.player.car.x, g.player.car.y, p.x, p.y) < m.radius + 40) return this.complete();
        if (!g.player.inCar && dist(g.player.x, g.player.y, p.x, p.y) < m.radius) return this.complete();
        if (m.beachGo && g.player.x < 400 && g.player.y > g.world.beachY - 120) return this.complete();
        break;
      }
      case 'collect': {
        if (dist(g.player.x, g.player.y, m.target.x, m.target.y) < m.radius) {
          g.state.cash += 500; g.audio.pickup();
          g.hud.toast('ENVELOPE +$500');
          return this.complete();
        }
        break;
      }
      case 'steal': {
        if (this.stealTarget && this.stealTarget.hp <= 0) return this.fail('The car was wrecked.');
        if (this.stealTarget && g.player.car === this.stealTarget) return this.complete();
        break;
      }
      case 'kill': {
        if (this.kills >= (m.enemies || 0)) return this.complete();
        this.objective = `Eliminate the crew — ${m.enemies - this.enemies.length}/${m.enemies} down.`;
        break;
      }
      case 'survive': {
        if (g.police.wanted >= m.star) this.escaped = true;
        this.objective = this.escaped ? 'Lose the police. Break line of sight.' : `Get to ${m.star} wanted stars.`;
        if (this.escaped && g.police.wanted === 0) return this.complete();
        break;
      }
    }
    this.findStealTarget();
    const mp = m.kind === 'steal' && this.stealTarget ? { x: this.stealTarget.x, y: this.stealTarget.y } : this.targetPos(m);
    this.marker = mp; g.missionMarker = mp;
    this.distance = Math.round(dist(g.player.x, g.player.y, mp.x, mp.y));
    g.hud.updateMission(m, this.timeLeft, this.objective, this.distance);
  }

  onEnemyKilled(e) {
    this.kills++;
    if (this.kills % 2 === 0) this.game.hud.dialogue('Coco', pick(['Coco: "Clean. Too clean."', 'Coco: "Keep moving, rookie."']));
  }

  complete() {
    const g = this.game;
    const m = this.active;
    if (!m) return;
    g.state.cash += m.reward;
    g.state.completed.push(m.id);
    g.hud.missionDone(m, m.reward);
    g.audio.pickup();
    this.enemies.forEach(e => { e.dead = true; });
    this.enemies = [];
    this.active = null;
    this.index++;
    this.stealTarget = null;
    g.missionMarker = null;
    g.save.write();
    if (this.index < MISSIONS.length) {
      const nx = MISSIONS[this.index];
      setTimeout(() => { if (!g.missions.active) g.hud.dialogue(nx.giver, nx.line); }, 2600);
    }
  }

  fail(reason) {
    const g = this.game;
    const m = this.active;
    if (!m) return;
    this.enemies.forEach(e => { e.dead = true; });
    this.enemies = [];
    this.active = null;
    this.stealTarget = null;
    g.hud.missionFail(reason);
    g.missionMarker = null;
  }
}
