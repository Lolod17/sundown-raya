// input.js — JOB: Keyboard and mouse state: movement axes, held keys, edge-triggered presses.
// EXPORTS: Input
// USES: nothing

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();
    this.mx = 640; this.my = 360;
    this.down = false;
    this.clicked = false;
    this.canvas = canvas;
    addEventListener('keydown', e => {
      if (['Tab', 'Space', 'KeyE', 'KeyR', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.down = false; });
    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      this.mx = (e.clientX - r.left) * (canvas.width / r.width);
      this.my = (e.clientY - r.top) * (canvas.height / r.height);
    });
    canvas.addEventListener('mousedown', e => {
      if (e.button === 0) { this.down = true; this.clicked = true; }
      if (e.button === 2) this.pressed.add('MouseRight');
    });
    addEventListener('mouseup', e => { if (e.button === 0) this.down = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }
  held(code) { return this.keys.has(code); }
  tap(code) { return this.pressed.has(code); }
  axis() {
    const x = (this.held('KeyD') || this.held('ArrowRight') ? 1 : 0) - (this.held('KeyA') || this.held('ArrowLeft') ? 1 : 0);
    const y = (this.held('KeyS') || this.held('ArrowDown') ? 1 : 0) - (this.held('KeyW') || this.held('ArrowUp') ? 1 : 0);
    return { x, y };
  }
  endFrame() { this.pressed.clear(); this.clicked = false; }
}
