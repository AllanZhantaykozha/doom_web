// Ввод: клавиатура, мышь (Pointer Lock), геймпад.
(function (G) {
  'use strict';

  // Коды клавиш, для которых отменяем действие браузера по умолчанию.
  const PREVENT = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'F3', 'F4', 'F5', 'F9', 'ControlLeft', 'ControlRight']);

  const Input = G.Input = {
    down: new Set(),        // удерживаемые коды (KeyboardEvent.code)
    pressed: new Set(),     // нажатые с прошлого сброса (одиночные нажатия)
    mouseDX: 0,
    mouseDown: false,
    wheel: 0,
    locked: false,
    // Состояние геймпада (обновляется poll() раз за кадр рендера)
    padMoveX: 0, padMoveY: 0, padTurn: 0, padRun: false, padFire: false,

    init(canvas) {
      window.addEventListener('keydown', (e) => {
        if (PREVENT.has(e.code)) e.preventDefault();
        if (!e.repeat) this.pressed.add(e.code);
        this.down.add(e.code);
      });
      window.addEventListener('keyup', (e) => this.down.delete(e.code));
      window.addEventListener('blur', () => { this.down.clear(); this.mouseDown = false; });

      document.addEventListener('mousemove', (e) => {
        if (this.locked) this.mouseDX += e.movementX;
      });
      document.addEventListener('mousedown', (e) => { if (this.locked && e.button === 0) this.mouseDown = true; });
      document.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });
      document.addEventListener('wheel', (e) => {
        if (this.locked) this.wheel += Math.sign(e.deltaY);
      }, { passive: true });
      document.addEventListener('pointerlockchange', () => {
        this.locked = document.pointerLockElement === canvas;
        if (!this.locked) { this.mouseDX = 0; this.mouseDown = false; }
        if (this.onLockChange) this.onLockChange(this.locked);
      });
      this.canvas = canvas;
    },

    // Запрос захвата курсора. Ошибки (например, повторный запрос сразу после Esc)
    // не фатальны: игра продолжает работать с клавиатуры.
    requestLock() {
      try {
        const p = this.canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      } catch (err) { /* без захвата */ }
    },
    exitLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },

    isDown(code) { return this.down.has(code); },
    wasPressed(code) { return this.pressed.has(code); },
    endFrame() { this.pressed.clear(); },

    consumeWheel() {
      const w = this.wheel;
      this.wheel = 0;
      return w;
    },

    consumeMouse() {
      const d = this.mouseDX;
      this.mouseDX = 0;
      return d;
    },

    // Опрос геймпада. getGamepads() создаёт небольшой массив — вызываем раз за кадр, не за тик.
    poll() {
      this.padMoveX = this.padMoveY = this.padTurn = 0;
      this.padRun = false;
      this.padFire = false;
      if (!navigator.getGamepads) return;
      const pads = navigator.getGamepads();
      const dz = G.CONFIG.GAMEPAD_DEADZONE;
      for (let i = 0; i < pads.length; i++) {
        const p = pads[i];
        if (!p || !p.connected || p.axes.length < 4) continue;
        const dead = (v) => (Math.abs(v) < dz ? 0 : v);
        this.padMoveX = dead(p.axes[0]);
        this.padMoveY = -dead(p.axes[1]);   // вверх на стике = вперёд
        this.padTurn = dead(p.axes[2]);
        this.padRun = !!(p.buttons[10] && p.buttons[10].pressed); // нажатие левого стика
        this.padFire = !!(p.buttons[7] && p.buttons[7].pressed);  // правый курок
        break;
      }
    }
  };
})(window.GAME);
