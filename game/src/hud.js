// hud.js — JOB: Every on-screen readout: mission line, timer, objective, stars, cash, weapon, health, minimap,
//         district banner, dialogue, speedometer, clock and radio — each drawn as DOM so it can be read back.
// EXPORTS: HUD
// USES: util.js, config.js

import { fmtMoney, fmtTime, timeStr } from './util.js';

const el = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.root = el('hud');
    this.district = el('district');
    this.districtName = el('district-name');
    this.districtTag = el('district-tag');
    this.dayClock = el('clock');
    this.stars = [1, 2, 3, 4, 5].map(i => el('star' + i));
    this.cash = el('cash');
    this.weaponName = el('weapon-name');
    this.weaponAmmo = el('weapon-ammo');
    this.healthVal = el('health-val');
    this.armourVal = el('armour-val');
    this.missionLine = el('mission-line');
    this.missionTimer = el('mission-timer');
    this.objective = el('objective');
    this.distance = el('objective-dist');
    this.speedo = el('speedo');
    this.carName = el('car-name');
    this.speedVal = el('speed-val');
    this.dialogueWho = el('dialogue-who');
    this.dialogueLine = el('dialogue-line');
    this.radio = el('radio');
    this.toastEl = el('toast');
    this.banner = el('banner');
    this.help = el('help-strip');
    this.mm = el('minimap');
    this.starFlash = 0;
    this.lastDistrict = null;
    this.bannerTime = 0;
    this.toastTime = 0;
    this.bigTime = 0;
    this.dialogT = 0;
    this.radioT = 0;
    this.beach = false;
    this.mmCtx = this.mm.getContext('2d');
  }

  setMission(m, time) {
    this.missionLine.textContent = `MISI ${m.id}/12 — ${m.name}`;
    this.missionLine.classList.add('live');
    this.missionTimer.textContent = time ? fmtTime(time) : '';
    this.missionTimer.style.display = time ? 'block' : 'none';
    this.objective.textContent = m.brief;
    this.distance.textContent = '0 m';
  }
  updateMission(m, time, objective, distance) {
    this.missionLine.textContent = `MISI ${m.id}/12 — ${m.name}`;
    this.objective.textContent = objective || m.brief;
    this.missionTimer.textContent = m.time ? fmtTime(Math.max(0, time)) : '';
    this.missionTimer.style.display = m.time ? 'block' : 'none';
    this.missionTimer.classList.toggle('urgent', !!m.time && time < 15);
    this.distance.textContent = distance + ' m';
  }
  clearMission() {
    this.missionLine.classList.remove('live');
    this.missionTimer.style.display = 'none';
  }
  missionDone(m, reward) {
    this.bigToast(`MISI COMPLETE +${fmtMoney(reward)}`);
    this.dialogue(m.giver, m.line);
    this.clearMission();
  }
  missionFail(reason) {
    this.bigToast('MISI FAILED — ' + reason);
    this.clearMission();
  }
  flashStars() { this.starFlash = 1.2; }

  dialogue(who, line) {
    this.dialogueWho.textContent = who + ':';
    // strip a leading "Name: " prefix so it is not doubled
    this.dialogueLine.textContent = line.replace(/^[A-Za-z ]+: /, '');
    this.dialogueLine.parentElement.classList.add('show');
    this.dialogT = 7;
  }
  toast(text) { this.toastEl.textContent = text; this.toastTime = 2.2; }
  bigToast(text) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('big');
    this.bigTime = 2.6;
    this.toastTime = 2.6;
  }

  update(dt, g) {
    const st = g.state, p = g.player;
    // clock + day
    this.dayClock.textContent = `DAY ${st.day} · ${timeStr(st.clockMin)}`;
    this.cash.textContent = fmtMoney(st.cash);
    const w = p.weaponDef;
    this.weaponName.textContent = w.name;
    this.weaponAmmo.textContent = String(p.ammo[p.weapon]);
    this.healthVal.textContent = Math.ceil(p.health);
    this.armourVal.textContent = Math.ceil(p.armour);
    el('health-bar').style.width = p.health + '%';
    el('armour-bar').style.width = p.armour + '%';
    // stars
    this.starFlash = Math.max(0, this.starFlash - dt);
    for (let i = 0; i < 5; i++) {
      const on = i < g.police.wanted;
      this.stars[i].classList.toggle('on', on);
      this.stars[i].classList.toggle('flash', on && this.starFlash > 0);
    }
    // free roam mission line
    if (!g.missions.active) {
      const nx = g.missions.next;
      this.missionLine.textContent = nx ? `NEXT JOB — MISI ${nx.id}/12 — ${nx.name}` : 'ALL JOBS DONE — SUNDOWN RAYA';
      this.missionLine.classList.remove('live');
      this.objective.textContent = nx ? `Meet ${nx.giver}: ${nx.brief}` : 'Free roam the coast.';
      if (nx) {
        const t = nx.beachGo ? { x: 300, y: g.world.beachY - 20 } : nx.target;
        this.distance.textContent = Math.round(Math.hypot(p.x - t.x, p.y - t.y)) + ' m';
      } else this.distance.textContent = '—';
      this.missionTimer.style.display = 'none';
    }
    // speedometer
    if (p.car) {
      const kmh = Math.round(Math.abs(p.car.speed) * 0.36);
      this.speedVal.textContent = String(kmh);
      this.carName.textContent = p.car.model.name;
      this.speedo.classList.add('show');
    } else {
      this.speedVal.textContent = '0';
      this.carName.textContent = 'ON FOOT';
      this.speedo.classList.toggle('show', false);
    }
    // district banner
    const d = g.currentDistrict;
    if (d && d.id !== this.lastDistrict) {
      this.lastDistrict = d.id;
      this.districtName.textContent = d.name.toUpperCase();
      this.districtTag.textContent = d.tagline;
      this.banner.classList.add('show');
      this.bannerTime = 4.2;
    }
    this.bannerTime -= dt;
    if (this.bannerTime <= 0) this.banner.classList.remove('show');
    // dialogue fade
    this.dialogT -= dt;
    if (this.dialogT <= 0) this.dialogueLine.parentElement.classList.remove('show');
    // radio line
    this.radioT -= dt;
    if (this.radioT <= 0) {
      this.radioT = 9;
      const s = g.radioStations[(g.radioIndex++) % g.radioStations.length];
      this.radio.textContent = s.name + ': ' + s.line;
    }
    // toast
    this.toastTime -= dt;
    if (this.bigTime <= 0) this.toastEl.classList.remove('big');
    this.bigTime -= dt;
    this.toastEl.classList.toggle('show', this.toastTime > 0);
    this.help.classList.toggle('fade', st.time > 16);
    this.drawMinimap(g);
  }

  drawMinimap(g) {
    const c = this.mmCtx, W = this.mm.width, H = this.mm.height;
    const p = g.player, world = g.world;
    const scale = 0.055;
    c.clearRect(0, 0, W, H);
    c.save();
    c.beginPath(); c.arc(W / 2, H / 2, W / 2 - 3, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#3a4a3c'; c.fillRect(0, 0, W, H);
    // districts as blocks
    c.translate(W / 2, H / 2);
    for (const row of world.blocksById) for (const b of row) {
      const sx = (b.x - p.x) * scale, sy = (b.y - p.y) * scale;
      if (Math.abs(sx) > W / 2 + 30 || Math.abs(sy) > H / 2 + 30) continue;
      c.fillStyle = b.district.color;
      c.fillRect(sx, sy, b.w * scale, b.h * scale);
      c.fillStyle = 'rgba(0,0,0,0.35)';
      for (const l of b.lots) c.fillRect((l.x - p.x) * scale, (l.y - p.y) * scale, l.w * scale, l.h * scale);
    }
    // beach + sea
    const by = (world.beachY - p.y) * scale;
    c.fillStyle = '#d8c48d'; c.fillRect(-W, by - 90 * scale, W * 2, 200 * scale);
    c.fillStyle = '#2d6b73'; c.fillRect(-W, by + 110 * scale, W * 2, H * 2);
    // police
    for (const cp of g.police.cruisers) {
      c.fillStyle = '#5aa9ff';
      c.fillRect((cp.car.x - p.x) * scale - 3, (cp.car.y - p.y) * scale - 3, 6, 6);
    }
    // objective
    const mk = g.missionMarker;
    if (mk) {
      const mx = (mk.x - p.x) * scale, my = (mk.y - p.y) * scale;
      const r = Math.hypot(mx, my), lim = W / 2 - 9;
      let dx = mx, dy = my;
      if (r > lim) { dx = mx / r * lim; dy = my / r * lim; }
      c.fillStyle = '#ffd447'; c.strokeStyle = '#241a00'; c.lineWidth = 2;
      c.beginPath(); c.arc(dx, dy, 6, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    // player arrow
    c.save(); c.rotate(p.car ? p.car.angle : p.angle);
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(7, 0); c.lineTo(-5, 5); c.lineTo(-5, -5); c.closePath(); c.fill();
    c.restore();
    c.restore();
    // north tick
    c.fillStyle = 'rgba(255,255,255,0.7)'; c.font = 'bold 10px monospace';
    c.fillText('N', W / 2 - 4, 12);
  }
}

export { el };
