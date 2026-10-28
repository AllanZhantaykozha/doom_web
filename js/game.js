// Главный цикл (fixed timestep + requestAnimationFrame) и состояния игры.
// state: 'running' — идёт игра · 'paused' — пауза · 'screen' — экран (смерть / итоги уровня / победа)
(function (G) {
  'use strict';
  const CFG = G.CONFIG;

  const emptyStats = () => ({ kills: 0, killsTotal: 0, items: 0, itemsTotal: 0, secrets: 0, secretsTotal: 0, time: 0 });

  const Game = G.Game = {
    state: 'paused',
    screen: null,
    acc: 0,
    last: 0,
    resIndex: 0,
    debug: false,
    levelIndex: 0,
    levelTime: 0,
    run: emptyStats(),       // накопленная статистика забега (для экрана победы)
    pendingExit: false,
    bossTimer: 0,            // обратный отсчёт до победы после гибели босса
    msgTimer: 0,
    statusKey: -1,
    // Статистика для отладочного оверлея
    frameMs: 0, fps: 0, fpsFrames: 0, fpsTime: 0,

    init() {
      this.canvas = document.getElementById('screen');
      this.overlay = document.getElementById('overlay');
      this.dbgEl = document.getElementById('debug');
      this.msgEl = document.getElementById('msg');
      this.statusEl = document.getElementById('status');

      G.Input.init(this.canvas);
      G.Textures.init();
      G.Sprites.init();
      G.Projectiles.init();
      G.Renderer.init(this.canvas);
      G.UI.init(() => this.confirmScreen());
      this.newGame();

      // Пауза при выходе из pointer lock (Esc) и при потере фокуса — только во время игры
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

    // ---------- Уровни и забег ----------
    newGame() {
      this.run = emptyStats();
      G.Player.newGame();
      this.loadLevel(0);
    },

    loadLevel(i) {
      this.levelIndex = i;
      this.pendingExit = false;
      this.bossTimer = 0;
      this.levelTime = 0;
      G.Map.load(G.LEVELS[i]);
      G.Player.reset(G.Map.startX, G.Map.startY, G.Map.startAngle);
      G.Player.startLevel();
      this.message(G.Map.name);
      G.Player.dirty = true;
    },

    // Статистика текущего уровня
    levelStats() {
      const M = G.Map;
      return { kills: M.killsFound, killsTotal: M.killsTotal, items: M.itemsFound, itemsTotal: M.itemsTotal,
               secrets: M.secretsFound, secretsTotal: M.secretsTotal, time: this.levelTime };
    },

    addToRun(st) {
      const r = this.run;
      r.kills += st.kills; r.killsTotal += st.killsTotal;
      r.items += st.items; r.itemsTotal += st.itemsTotal;
      r.secrets += st.secrets; r.secretsTotal += st.secretsTotal;
      r.time += st.time;
    },

    onBossDefeated() {
      this.bossTimer = 3;
      this.message('Страж повержен!');
    },

    // Показ экрана: логика замирает, курсор освобождается (клик по экрану работает)
    showScreen(kind) {
      this.state = 'screen';
      this.screen = kind;
      G.Input.down.clear();
      G.Input.exitLock();
      this.msgEl.textContent = '';
      const st = this.levelStats();
      if (kind === 'death') {
        G.UI.show('death', st, { name: G.Map.name });
      } else if (kind === 'intermission') {
        this.addToRun(st);
        const next = G.LEVELS[this.levelIndex + 1];
        G.UI.show('intermission', st, { name: G.Map.name, next: next ? next.name : null });
      } else {
        this.addToRun(st);
        G.UI.show('victory', this.run, { name: '' });
      }
    },

    // Подтверждение экрана (Enter / клик): следующий шаг по виду экрана
    confirmScreen() {
      if (this.state !== 'screen') return;
      const kind = this.screen;
      G.UI.hide();
      this.screen = null;
      if (kind === 'death') {
        G.Player.newGame();
        this.loadLevel(this.levelIndex);
      } else if (kind === 'intermission') {
        if (this.levelIndex + 1 < G.LEVELS.length) this.loadLevel(this.levelIndex + 1);
        else { this.newGame(); }
      } else {
        this.newGame();
      }
      this.state = 'running';
      this.acc = 0;
      this.last = performance.now();
      G.Input.requestLock();
    },

    // Временное сообщение (позже заменится на HUD в canvas)
    message(text) {
      this.msgEl.textContent = text;
      this.msgTimer = 2.5;
    },

    showOverlay(v) { this.overlay.hidden = !v; },

    resume() {
      if (this.state !== 'paused') return;
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

    // Временные горячие клавиши (в этапе 6 их заменит меню настроек)
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

    // Строка статуса: оставшееся время сфер (обновляется только при смене секунды)
    updateStatus() {
      const P = G.Player;
      const inv = Math.ceil(P.invuln), q = Math.ceil(P.quad);
      const key = inv * 1000 + q;
      if (key === this.statusKey) return;
      this.statusKey = key;
      let t = '';
      if (inv > 0) t += 'Неуязвимость ' + inv + ' с  ';
      if (q > 0) t += 'Ярость ×' + CFG.SPHERE.quadMul + ' ' + q + ' с';
      this.statusEl.textContent = t;
    },

    frame(now) {
      requestAnimationFrame((t) => this.frame(t));
      const t0 = performance.now();

      let dt = (now - this.last) / 1000;
      this.last = now;
      if (dt > CFG.MAX_FRAME_TIME) dt = CFG.MAX_FRAME_TIME;

      G.Input.poll();
      this.handleHotkeys();

      if (this.state === 'screen') {
        if (G.Input.wasPressed('Enter') || G.Input.wasPressed('Space')) this.confirmScreen();
      } else if (this.state === 'running') {
        // Мышь применяется на каждом кадре (не привязана к 60 Гц) — плавный поворот
        // на мониторах 120/144 Гц. Коллизий у поворота нет, детерминизм логики не страдает.
        const dx = G.Input.consumeMouse();
        if (dx !== 0 && !G.Player.dead) G.Player.turn(dx * CFG.PLAYER.mouseSens);

        // «Использовать» — раз за кадр (в тике одно нажатие сработало бы на каждом из тиков кадра)
        if (!G.Player.dead && (G.Input.wasPressed('KeyE') || G.Input.wasPressed('Space'))) {
          const msg = G.Map.use(G.Player.x, G.Player.y, G.Player.angle, G.Player);
          if (msg) this.message(msg);
        }

        const wheel = G.Input.consumeWheel();
        if (wheel !== 0 && !G.Player.dead) G.Player.cycleWeapon(wheel);

        this.acc += dt;
        while (this.acc >= CFG.STEP) {
          G.Player.update(CFG.STEP);
          G.Map.update(CFG.STEP, G.Player.x, G.Player.y);
          G.Items.update(G.Player.x, G.Player.y);
          G.Enemies.update(CFG.STEP);
          G.Projectiles.update(CFG.STEP);
          if (!G.Player.dead) this.levelTime += CFG.STEP;
          this.acc -= CFG.STEP;
          if (this.pendingExit) break;
        }

        if (this.msgTimer > 0) {
          this.msgTimer -= dt;
          if (this.msgTimer <= 0) this.msgEl.textContent = '';
        }
        this.updateStatus();

        // Переходы между состояниями
        if (this.pendingExit) { this.pendingExit = false; this.showScreen('intermission'); }
        else if (G.Player.dead && G.Player.deathTime >= 1.5) this.showScreen('death');
        else if (this.bossTimer > 0) {
          this.bossTimer -= dt;
          if (this.bossTimer <= 0) this.showScreen('victory');
        }
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
            '  секреты ' + G.Map.secretsFound + '/' + G.Map.secretsTotal +
            '  враги ' + G.Map.killsFound + '/' + G.Map.killsTotal + '\n' +
            'Поз: ' + P.x.toFixed(2) + ', ' + P.y.toFixed(2) + '\n' +
            'Угол: ' + (P.angle * 180 / Math.PI).toFixed(0) + '°';
        }
      }
    }
  };

  window.addEventListener('DOMContentLoaded', () => Game.init());
})(window.GAME);
