// main.js — JOB: Boot: canvas sizing, title/Continue menu, pause overlay wiring, debug hooks for captions.
// EXPORTS: nothing (entry point)
// USES: game.js, save.js

import { Game } from './game.js';
import { SaveGame } from './save.js';

const canvas = document.getElementById('game');
const menu = document.getElementById('menu');
const pause = document.getElementById('pause');
const game = new Game(canvas);

function resize() {
  const w = Math.min(1280, Math.max(800, window.innerWidth));
  const h = Math.round(w * 9 / 16);
  canvas.width = 1280; canvas.height = 720;
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
}
addEventListener('resize', resize);
resize();

const saveProbe = new SaveGame();
const hasSave = !!saveProbe.peek();
const contBtn = document.getElementById('btn-continue');
contBtn.style.display = hasSave ? 'inline-block' : 'none';
if (hasSave) {
  const d = saveProbe.data;
  document.getElementById('save-summary').textContent =
    `DAY ${d.day} · ${d.completed.length}/12 MISI · $${d.cash}`;
} else {
  document.getElementById('save-summary').textContent = 'no save on this machine';
}

function begin(withSave) {
  menu.classList.remove('show');
  document.getElementById('hud').classList.add('show');
  if (withSave) game.save.data = saveProbe.data;
  else { game.save.clear(); saveProbe.clear(); }
  game.start();
  game.audio.unlock();
  document.getElementById('fingerprint').classList.remove('show');
}

document.getElementById('btn-new').addEventListener('click', () => begin(false));
contBtn.addEventListener('click', () => begin(true));
document.getElementById('btn-resume').addEventListener('click', () => {
  pause.classList.remove('show'); game.state.paused = false;
});
document.getElementById('btn-quit').addEventListener('click', () => location.reload());

// click anywhere on the title unlocks audio
addEventListener('pointerdown', () => game.audio.unlock());

// ---- debug / caption helpers used by the automated playtest
window.SUNDOWN = {
  game,
  startMission: i => game.startMission(i),
  state: () => ({
    errors: window.__errors || [],
    missionCount: game.missions.index,
    wanted: game.police.wanted,
    cash: game.state.cash,
    inCar: !!game.player.car,
    car: game.player.car ? game.player.car.model.name : null,
    hud: document.getElementById('hud').innerText.replace(/\n+/g, ' | '),
  }),
  skipTitle: () => begin(false),
};
window.__errors = [];
addEventListener('error', e => window.__errors.push(String(e.message)));
addEventListener('unhandledrejection', e => window.__errors.push(String(e.reason)));
