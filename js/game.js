// Главный цикл: fixed timestep (accumulator) + requestAnimationFrame.
(function (G) {
  'use strict';
  const CFG = G.CONFIG;

  const Game = G.Game = {
    state: 'paused',     // 'running' | 'paused'
    acc: 0,
    last: 0,
    resIndex: 0,
    debug: false,
    levelIndex: 0,
    pendingExit: false,
    msgTimer: 0,
    // Статистика для отладочного оверлея
    frameMs: 0, fps: 0, fpsFrames: 0, fpsTime: 0, dbgTime: 0,

    init() {
      this.canvas = document.getElementById('screen');
      this.overlay = document.getElementById('overlay');
      this.dbgEl = document.getElementById('debug');

      G.Input.init(this.canvas);
      G.Textures.init();
      G.Sprites.init();
      this.msgEl = document.getElementById('msg');
      this.hudEl = {
        hp: document.getElementById('hp'), ar: document.getElementById('ar'),
        bu: document.getElementById('bu'), sh: document.getElementById('sh'),
        k1: document.getElementById('k1'), k2: document.getElementById('k2'), k3: document.getElementById('k3')
      };
      G.Renderer.init(this.canvas);
      G.Player.newGame();
      this.loadLevel(0);

      // Пауза при выходе из pointer lock (Esc) и при потере фокуса
      G.Input.onLockChange = (locked) => { if (!locked && this.state === 'running') this.pause(); };
      window.addEventListener('blur', () => { if (this.state === 'running') this.pause(); });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.state === 'running') this.pause();
      });
      this.overlay.addEventListener('click', () => this.resume());
      // Esc без захвата курсора (при захвате его обрабатывает браузер)
      window.addEventListener('keydown', (e) => {
        if (e.code === 'Escape' && this.state === 'running' && !G.Input.locked) this.pause();
      });

      this.showOverlay(true);
      this.last = performance.now();
      requestAnimationFrame((t) => this.frame(t));
    },

    loadLevel(i) {
      this.levelIndex = i;
      this.pendingExit = false;
      G.Map.load(G.LEVELS[i]);
      G.Player.reset(G.Map.startX, G.Map.startY, G.Map.startAngle);
      G.Player.clearKeys();
      this.message(G.Map.name);
    },

    // Переход по выходу. Последний уровень пока зацикливается (экран победы — этап 5).
    nextLevel() {
      this.loadLevel((this.levelIndex + 1) % G.LEVELS.length);
    },

    // Временное сообщение (позже заменится на HUD в canvas)
    message(text) {
      this.msgEl.textContent = text;
      this.msgTimer = 2.5;
    },

    // Минимальный HUD в DOM: обновляется только при изменении данных
    updateHud() {
      const P = G.Player, H = this.hudEl;
      H.hp.textContent = Math.ceil(P.health);
      H.ar.textContent = Math.ceil(P.armor);
      H.bu.textContent = P.ammo.bullets;
      H.sh.textContent = P.ammo.shells;
      H.k1.classList.toggle('on', P.keys[1]);
      H.k2.classList.toggle('on', P.keys[2]);
      H.k3.classList.toggle('on', P.keys[3]);
      P.dirty = false;
    },

    showOverlay(v) { this.overlay.hidden = !v; },

    resume() {
      if (this.state === 'running') return;
      this.state = 'running';
      this.acc = 0;
      this.last = performance.now();
      G.Input.down.clear();
      this.showOverlay(false);
      G.Input.requestLock();
    },

    pause() {
      this.state = 'paused';
      G.Input.exitLock();
      G.Input.down.clear();
      this.showOverlay(true);
    },

    // Временные горячие клавиши этапа 0 (в этапе 6 их заменит меню настроек)
    handleHotkeys() {
      const In = G.Input;
      if (In.wasPressed('F3')) {
        this.debug = !this.debug;
        this.dbgEl.hidden = !this.debug;
      }
      if (In.wasPressed('F4')) {
        this.resIndex = (this.resIndex + 1) % CFG.RESOLUTIONS.length;
        const r = CFG.RESOLUTIONS[this.resIndex];
        G.Renderer.setResolution(r[0], r[1]);
      }
    },

    frame(now) {
      requestAnimationFrame((t) => this.frame(t));
      const t0 = performance.now();

      let dt = (now - this.last) / 1000;
      this.last = now;
      if (dt > CFG.MAX_FRAME_TIME) dt = CFG.MAX_FRAME_TIME;

      G.Input.poll();
      this.handleHotkeys();

      if (this.state === 'running') {
        // Мышь применяется на каждом кадре (не привязана к 60 Гц) — плавный поворот
        // на мониторах 120/144 Гц. Коллизий у поворота нет, детерминизм логики не страдает.
        const dx = G.Input.consumeMouse();
        if (dx !== 0) G.Player.turn(dx * CFG.PLAYER.mouseSens);

        // «Использовать» — раз за кадр (в тике одно нажатие сработало бы на каждом из тиков кадра)
        if (G.Input.wasPressed('KeyE') || G.Input.wasPressed('Space')) {
          const msg = G.Map.use(G.Player.x, G.Player.y, G.Player.angle, G.Player);
          if (msg) this.message(msg);
        }

        this.acc += dt;
        while (this.acc >= CFG.STEP) {
          G.Player.update(CFG.STEP);
          G.Map.update(CFG.STEP, G.Player.x, G.Player.y);
          G.Items.update(G.Player.x, G.Player.y);
          this.acc -= CFG.STEP;
          if (this.pendingExit) { this.nextLevel(); this.acc = 0; break; }
        }

        if (this.msgTimer > 0) {
          this.msgTimer -= dt;
          if (this.msgTimer <= 0) this.msgEl.textContent = '';
        }
        if (G.Player.dirty) this.updateHud();
      }

      G.Renderer.render(G.Player.x, G.Player.y, G.Player.angle);
      G.Input.endFrame();

      this.updateStats(now, performance.now() - t0);
    },

    updateStats(now, ms) {
      this.frameMs += (ms - this.frameMs) * 0.1;  // сглаживание
      this.fpsFrames++;
      if (now - this.fpsTime >= 500) {
        this.fps = this.fpsFrames * 1000 / (now - this.fpsTime);
        this.fpsFrames = 0;
        this.fpsTime = now;
        if (this.debug) {
          const P = G.Player, R = G.Renderer;
          this.dbgEl.textContent =
            'FPS: ' + this.fps.toFixed(0) + '\n' +
            'Кадр (CPU): ' + this.frameMs.toFixed(2) + ' мс\n' +
            'Разрешение: ' + R.w + 'x' + R.h + '\n' +
            'Спрайты: ' + R.spritesDrawn + '\n' +
            'Уровень: ' + G.Map.name + '  предметы ' + G.Map.itemsFound + '/' + G.Map.itemsTotal +
            '  секреты ' + G.Map.secretsFound + '/' + G.Map.secretsTotal + '\n' +
            'Поз: ' + P.x.toFixed(2) + ', ' + P.y.toFixed(2) + '\n' +
            'Угол: ' + (P.angle * 180 / Math.PI).toFixed(0) + '°';
        }
      }
    }
  };

  window.addEventListener('DOMContentLoaded', () => Game.init());
})(window.GAME);
