// save.js — JOB: localStorage persistence of day, completed missions and cash; Continue only when a save exists.
// EXPORTS: SaveGame
// USES: config.js

import { CONFIG } from './config.js';

export class SaveGame {
  constructor() { this.key = CONFIG.save.key; this.hasSave = false; this.data = null; }
  peek() {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (!d || typeof d.cash !== 'number' || !Array.isArray(d.completed)) return null;
      this.hasSave = true; this.data = d; return d;
    } catch (e) { return null; }
  }
  write(state) {
    try {
      localStorage.setItem(this.key, JSON.stringify({
        day: state.day, completed: state.completed, cash: state.cash, savedAt: Date.now(),
      }));
      this.hasSave = true;
    } catch (e) { /* storage may be disabled — game still runs */ }
  }
  clear() { try { localStorage.removeItem(this.key); } catch (e) { /* noop */ } this.hasSave = false; this.data = null; }
}
