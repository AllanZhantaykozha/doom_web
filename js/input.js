// Ввод: клавиатура, мышь (Pointer Lock), геймпад.
(function (G) {
  'use strict';

  // Коды клавиш, для которых отменяем действие браузера по умолчанию.
  const PREVENT = new Set(['Home', 'Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'F3', 'F4', 'F5', 'F9', 'ControlLeft', 'ControlRight']);

  const Input = G.Input = {
    down: new Set(),        // удерживаемые коды (KeyboardEvent.code)
    pressed: new Set(),     // нажатые с прошлого сброса (одиночные нажатия)
    mouseDX: 0,
    mouseDY: 0,
    mouseDown: false,
    wheel: 0,
    locked: false,
    // Состояние геймпада (обновляется poll() раз за кадр рендера)
    padMoveX: 0, padMoveY: 0, padTurn: 0, padLook: 0, padRun: false, padFire: false,
    // Сенсорное управление: джойстик (-1..1), накопленный поворот свайпом (px), огонь, бег
    touch: false, touchX: 0, touchY: 0, touchDX: 0, touchDY: 0, touchRun: false, touchFire: false,

    init(canvas) {
      window.addEventListener('keydown', (e) => {
        if (PREVENT.has(e.code)) e.preventDefault();
        if (!e.repeat) this.pressed.add(e.code);
        this.down.add(e.code);
      });
      window.addEventListener('keyup', (e) => this.down.delete(e.code));
      window.addEventListener('blur', () => { this.down.clear(); this.mouseDown = false; });

      document.addEventListener('mousemove', (e) => {
        if (this.locked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
      });
      document.addEventListener('mousedown', (e) => { if (this.locked && e.button === 0) this.mouseDown = true; });
      document.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });
      document.addEventListener('wheel', (e) => {
        if (this.locked) this.wheel += Math.sign(e.deltaY);
      }, { passive: true });
      document.addEventListener('pointerlockchange', () => {
        this.locked = document.pointerLockElement === canvas;
        if (!this.locked) { this.mouseDX = 0; this.mouseDY = 0; this.mouseDown = false; }
        if (this.onLockChange) this.onLockChange(this.locked);
      });
      this.canvas = canvas;
      this.initTouch();
    },

    // Запрос захвата курсора. Ошибки (например, повторный запрос сразу после Esc)
    // не фатальны: игра продолжает работать с клавиатуры.
    requestLock() {
      // При сенсорном управлении захват курсора не нужен и вредит: пока он активен, браузер замораживает
      // координаты pointer-событий (clientX/Y), и джойстик со свайпом перестают получать движение.
      if (this.touch) return;
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

    // Вертикальный наклон за кадр (в «пикселях мыши»): мышь + вертикальный свайп
    consumePitch() {
      const d = this.mouseDY + this.touchDY * G.CONFIG.TOUCH_LOOK;
      this.mouseDY = 0;
      this.touchDY = 0;
      return d;
    },

    // Горизонтальный поворот за кадр в «пикселях мыши»: мышь + свайп пальцем
    consumeMouse() {
      const d = this.mouseDX + this.touchDX * G.CONFIG.TOUCH_LOOK;
      this.mouseDX = 0;
      this.touchDX = 0;
      return d;
    },

    // ---------- Сенсорное управление ----------
    // Левая часть экрана — плавающий джойстик (до упора — бег), правая — поворот свайпом.
    // Кнопки: огонь (удержание), открыть, оружие ◀ ▶, карта, пауза. Pointer Events с pointerId:
    // джойстик, поворот и огонь работают одновременно разными пальцами.
    initTouch() {
      const root = document.getElementById('touch');
      if (!root) return;
      const enable = () => { this.touch = true; document.body.classList.add('touch'); };
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) enable();
      // Настоящее касание на устройстве с мышью (например, ноутбук с сенсорным экраном) тоже включает панель
      // Мышь возвращает обычное управление (на гибридных устройствах касание и мышь чередуются)
      window.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch') enable();
        else if (e.pointerType === 'mouse' && this.touch) { this.touch = false; document.body.classList.remove('touch'); }
      }, true);
      document.addEventListener('contextmenu', (e) => { if (this.touch) e.preventDefault(); });

      // Касания и так неявно захватываются элементом, где начались; явный захват нужен мыши/перу
      // и в части браузеров бросает InvalidStateError — не даём ему оборвать обработчик.
      const capture = (el, id) => { try { el.setPointerCapture(id); } catch (err) { /* уже захвачен */ } };
      const R = 58;                                   // радиус хода джойстика, px
      const base = document.getElementById('t-base'), knob = document.getElementById('t-knob');
      const mz = document.getElementById('tz-move'), lz = document.getElementById('tz-look');
      let mid = null, ox = 0, oy = 0, lid = null, lx = 0, ly = 0;

      const place = (el, x, y) => { el.style.left = x + 'px'; el.style.top = y + 'px'; };
      mz.addEventListener('pointerdown', (e) => {
        if (mid !== null) return;
        mid = e.pointerId; capture(mz, mid);
        ox = e.clientX; oy = e.clientY;
        place(base, ox, oy); place(knob, ox, oy);
        base.hidden = knob.hidden = false;
      });
      mz.addEventListener('pointermove', (e) => {
        if (e.pointerId !== mid) return;
        let dx = e.clientX - ox, dy = e.clientY - oy;
        const len = Math.hypot(dx, dy), k = len > R ? R / len : 1;
        dx *= k; dy *= k;
        place(knob, ox + dx, oy + dy);
        let nx = dx / R, ny = -dy / R;                // вверх на экране = вперёд
        const m = Math.hypot(nx, ny);
        if (m < 0.15) { nx = 0; ny = 0; }
        this.touchX = nx; this.touchY = ny;
        this.touchRun = m > 0.92;
      });
      const endMove = (e) => {
        if (e.pointerId !== mid) return;
        mid = null; this.touchX = this.touchY = 0; this.touchRun = false;
        base.hidden = knob.hidden = true;
      };
      mz.addEventListener('pointerup', endMove);
      mz.addEventListener('pointercancel', endMove);

      lz.addEventListener('pointerdown', (e) => {
        if (lid !== null) return;
        lid = e.pointerId; capture(lz, lid); lx = e.clientX; ly = e.clientY;
      });
      lz.addEventListener('pointermove', (e) => {
        if (e.pointerId !== lid) return;
        this.touchDX += e.clientX - lx;
        this.touchDY += e.clientY - ly;
        lx = e.clientX; ly = e.clientY;
      });
      const endLook = (e) => { if (e.pointerId === lid) lid = null; };
      lz.addEventListener('pointerup', endLook);
      lz.addEventListener('pointercancel', endLook);

      // Кнопки: down — действие; для огня ещё up
      const btn = (id, down, up) => {
        const el = document.getElementById(id);
        let pid = null;
        el.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          if (pid !== null) return;
          pid = e.pointerId; capture(el, pid); el.classList.add('on');
          down();
        });
        const end = (e) => {
          if (e.pointerId !== pid) return;
          pid = null; el.classList.remove('on');
          if (up) up();
        };
        el.addEventListener('pointerup', end);
        el.addEventListener('pointercancel', end);
      };
      btn('t-fire', () => { this.touchFire = true; }, () => { this.touchFire = false; });
      btn('t-use', () => { this.pressed.add('KeyE'); });
      btn('t-prev', () => { this.wheel -= 1; });
      btn('t-next', () => { this.wheel += 1; });
      btn('t-map', () => { this.pressed.add('Tab'); });
      btn('t-pause', () => { G.Game.pause(); });

      // Сброс при скрытии панели (меню, пауза): иначе палец «залипнет»
      this.touchReset = () => {
        mid = null; lid = null;
        this.touchX = this.touchY = this.touchDX = this.touchDY = 0;
        this.touchRun = this.touchFire = false;
        base.hidden = knob.hidden = true;
        root.querySelectorAll('.btn.on').forEach((b) => b.classList.remove('on'));
      };
    },
    touchReset() {},

    // Полноэкранный режим и альбомная ориентация на телефоне (где браузер позволяет; нужен жест пользователя)
    enterFullscreen() {
      try {
        const de = document.documentElement;
        if (!document.fullscreenElement && de.requestFullscreen) {
          const p = de.requestFullscreen();
          if (p && p.then) p.then(() => {
            if (screen.orientation && screen.orientation.lock) return screen.orientation.lock('landscape');
          }).catch(() => {});
        }
      } catch (err) { /* не поддерживается (например, iPhone Safari) */ }
    },

    // Опрос геймпада. getGamepads() создаёт небольшой массив — вызываем раз за кадр, не за тик.
    poll() {
      this.padMoveX = this.padMoveY = this.padTurn = this.padLook = 0;
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
        this.padLook = dead(p.axes[3]);                  // правый стик по вертикали
        this.padRun = !!(p.buttons[10] && p.buttons[10].pressed); // нажатие левого стика
        this.padFire = !!(p.buttons[7] && p.buttons[7].pressed);  // правый курок
        break;
      }
    }
  };
})(window.GAME);
