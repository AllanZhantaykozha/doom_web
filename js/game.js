// Главный цикл (fixed timestep + requestAnimationFrame), состояния игры, меню и сохранения.
// state: 'menu' — главное меню · 'running' — игра · 'paused' — пауза · 'screen' — смерть / итоги / победа
(function (G) {
  'use strict';
  const CFG = G.CONFIG;
  const SAVE_KEY = 'ironhollow.save';
  const SAVE_VERSION = 1;

  const emptyStats = () => ({ kills: 0, killsTotal: 0, items: 0, itemsTotal: 0, secrets: 0, secretsTotal: 0, time: 0 });

  const Game = G.Game = {
    state: 'menu',
    screen: null,
    inGame: false,
    mapOpen: false,
    acc: 0,
    last: 0,
    debug: false,
    levelIndex: 0,
    levelTime: 0,
    run: emptyStats(),       // накопленная статистика забега (для экрана победы)
    pendingExit: false,
    bossTimer: 0,            // обратный отсчёт до победы после гибели босса
    msgTimer: 0,
    statusKey: -1,
    pausedAt: 0,
    // Статистика для оверлея отладки и счётчика FPS
    frameMs: 0, fps: 0, fpsFrames: 0, fpsTime: 0,

    init() {
      this.canvas = document.getElementById('screen');
      this.dbgEl = document.getElementById('debug');
      this.fpsEl = document.getElementById('fps');
      this.msgEl = document.getElementById('msg');
      this.statusEl = document.getElementById('status');

      G.Settings.load();
      G.Input.init(this.canvas);
      G.Textures.init();
      G.Sprites.init();
      G.Projectiles.init();
      G.Renderer.init(this.canvas);
      G.UI.init(() => this.confirmScreen(), (act) => this.menuAction(act));
      G.Settings.apply();
      this.newGame();                    // фон главного меню: стартовая точка первого уровня

      // Звук можно запускать только после действия пользователя
      const unlock = () => G.Audio.unlock();
      window.addEventListener('pointerdown', unlock);
      window.addEventListener('keydown', unlock);

      // Пауза при выходе из pointer lock (Esc) и при потере фокуса — только во время игры
      G.Input.onLockChange = (locked) => { if (!locked && this.state === 'running') this.pause(); };
      window.addEventListener('blur', () => { if (this.state === 'running') this.pause(); });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.state === 'running') this.pause();
      });
      window.addEventListener('keydown', (e) => {
        if (e.code !== 'Escape') return;
        // Esc без захвата курсора (при захвате его перехватывает браузер)
        if (this.state === 'running' && !G.Input.locked) this.pause();
        // Игнорируем Esc сразу после паузы: в части браузеров за выходом из pointer lock приходит и keydown
        else if (this.state === 'paused' && performance.now() - this.pausedAt > 300) {
          if (G.UI.view === 'settings') this.menuAction('back'); else this.resume();
        }
      });

      G.UI.showMenu('main');
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
      this.mapOpen = false;
      G.Map.load(G.LEVELS[i]);
      G.Player.reset(G.Map.startX, G.Map.startY, G.Map.startAngle);
      G.Player.startLevel();
      this.message(G.Map.name);
      G.Player.dirty = true;
      this.syncMusic();
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

    syncMusic() { G.Audio.music(this.state === 'running', this.levelIndex); },

    // ---------- Состояния ----------
    // Показ экрана: логика замирает, курсор освобождается (клик по экрану работает)
    showScreen(kind) {
      this.state = 'screen';
      this.screen = kind;
      G.Input.down.clear();
      G.Input.exitLock();
      this.msgEl.textContent = '';
      this.syncMusic();
      const st = this.levelStats();
      if (kind === 'death') {
        G.UI.show('death', st, { name: G.Map.name });
      } else if (kind === 'intermission') {
        G.Audio.play('exit');
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
      } else if (kind === 'intermission' && this.levelIndex + 1 < G.LEVELS.length) {
        this.loadLevel(this.levelIndex + 1);
      } else {
        this.newGame();
      }
      this.begin();
    },

    // Запуск игрового цикла (после кнопки меню, загрузки или подтверждения экрана)
    begin() {
      this.state = 'running';
      this.inGame = true;
      this.acc = 0;
      this.last = performance.now();
      G.Input.down.clear();
      G.UI.hideMenu();
      G.Input.requestLock();
      this.syncMusic();
    },

    resume() {
      if (this.state !== 'paused') return;
      this.begin();
    },

    pause() {
      if (this.state !== 'running') return;
      this.state = 'paused';
      this.pausedAt = performance.now();
      G.Input.exitLock();
      G.Input.down.clear();
      this.mapOpen = false;
      G.UI.showMenu('pause');
      this.syncMusic();
    },

    quitToMenu() {
      this.state = 'menu';
      this.inGame = false;
      this.mapOpen = false;
      G.Input.exitLock();
      G.UI.showMenu('main');
      this.syncMusic();
    },

    // Действия кнопок меню
    menuAction(act) {
      G.Audio.play('click');
      if (act.startsWith('diff:')) {
        CFG.difficulty = Number(act.slice(5));
        this.newGame();
        this.begin();
        return;
      }
      switch (act) {
        case 'new': G.UI.showMenu('difficulty'); break;
        case 'resume': this.resume(); break;
        case 'save': G.UI.note(this.saveGame() ? 'Игра сохранена' : 'Не удалось сохранить'); break;
        case 'load': if (!this.loadGame()) G.UI.note('Нет сохранения'); break;
        case 'settings': G.UI.prev = G.UI.view; G.UI.showMenu('settings'); break;
        case 'back': G.UI.showMenu(G.UI.prev || 'main'); break;
        case 'quit': this.quitToMenu(); break;
      }
    },

    // ---------- Сохранение и загрузка (localStorage, один слот) ----------
    hasSave() {
      try { return localStorage.getItem(SAVE_KEY) !== null; } catch (e) { return false; }
    },

    serialize() {
      const P = G.Player, M = G.Map;
      let seen = '';
      for (let i = 0; i < M.seen.length; i++) seen += M.seen[i] ? '1' : '0';
      return {
        v: SAVE_VERSION, level: this.levelIndex, diff: CFG.difficulty, time: this.levelTime, run: this.run, bossTimer: this.bossTimer,
        p: { x: P.x, y: P.y, angle: P.angle, health: P.health, armor: P.armor, ammo: Object.assign({}, P.ammo),
             weapons: P.weapons.slice(), weapon: P.weapon, keys: P.keys.slice(), invuln: P.invuln, quad: P.quad },
        doors: M.doors.map((d) => [d.open, d.state, d.timer]),
        seen,
        items: G.Items.list.map((i) => [i.ch, i.x, i.y, i.active ? 1 : 0, i.dropped ? 1 : 0]),
        enemies: G.Enemies.list.map((e) => [e.ch, e.x, e.y, e.hp, e.maxHp, e.state, e.phase, e.alive ? 1 : 0, e.active ? 1 : 0]),
        counters: [M.itemsTotal, M.itemsFound, M.secretsTotal, M.secretsFound, M.killsTotal, M.killsFound]
      };
    },

    saveGame() {
      if (!this.inGame || G.Player.dead) return false;
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(this.serialize()));
        return true;
      } catch (e) { return false; }
    },

    // Применение сохранения: уровень загружается заново (карта, двери), затем поверх накладывается состояние.
    // Снаряды в полёте не сохраняются (упрощение).
    deserialize(d) {
      if (!d || d.v !== SAVE_VERSION || !G.LEVELS[d.level] || !d.p || !Array.isArray(d.doors)) throw new Error('bad save');
      CFG.difficulty = d.diff;
      this.run = d.run;
      G.Player.newGame();
      this.loadLevel(d.level);

      const M = G.Map, P = G.Player, E = G.Enemies;
      if (d.doors.length !== M.doors.length || d.seen.length !== M.seen.length) throw new Error('save does not match level');
      d.doors.forEach((s, i) => {
        const dr = M.doors[i];
        dr.open = s[0]; dr.state = s[1]; dr.timer = s[2];
        if (dr.secret && dr.open >= 1) M.cells[dr.y * M.w + dr.x] = 0;
      });
      for (let i = 0; i < d.seen.length; i++) M.seen[i] = d.seen[i] === '1' ? 1 : 0;

      G.Items.list = [];
      d.items.forEach((s) => { G.Items.spawn(s[0], s[1], s[2], !!s[4]); G.Items.list[G.Items.list.length - 1].active = !!s[3]; });

      E.list = [];
      E.boss = null;
      d.enemies.forEach((s) => {
        const e = E.spawn(s[0], s[1], s[2], true);
        e.hp = s[3]; e.maxHp = s[4]; e.phase = s[6]; e.alive = !!s[7]; e.active = !!s[8];
        e.state = (s[5] === E.ATTACK || s[5] === E.PAIN) ? E.CHASE : s[5];
        if (e.def.phases) {
          e.speedMul = e.def.phases[e.phase].speedMul;
          for (let i = 0; i <= e.phase; i++) if (e.def.phases[i].sprite) e.set = G.Sprites.enemies[e.def.phases[i].sprite];
        }
        if (!e.alive && e.ai) { e.state = E.DEAD; e.stateTime = 10; }      // труп сразу в последнем кадре
        if (!e.alive && !e.ai) e.tex = G.Sprites.items.dummyDead;
      });
      E.flowCell = -1;

      [M.itemsTotal, M.itemsFound, M.secretsTotal, M.secretsFound, M.killsTotal, M.killsFound] = d.counters;
      const p = d.p;
      P.x = p.x; P.y = p.y; P.angle = p.angle; P.health = p.health; P.armor = p.armor;
      Object.assign(P.ammo, p.ammo);
      P.weapons = p.weapons.slice(); P.weapon = P.wantWeapon = p.weapon;
      P.keys = p.keys.slice(); P.invuln = p.invuln; P.quad = p.quad;
      P.dirty = true;
      this.levelTime = d.time;
      this.bossTimer = d.bossTimer || 0;
    },

    loadGame() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (raw === null) return false;
        this.deserialize(JSON.parse(raw));
      } catch (e) {
        return false;
      }
      G.UI.hide();
      this.screen = null;
      this.begin();
      this.message('Игра загружена');
      return true;
    },

    // Временное сообщение (позже заменится на HUD в canvas)
    message(text) {
      this.msgEl.textContent = text;
      this.msgTimer = 2.5;
    },

    handleHotkeys() {
      const In = G.Input;
      if (In.wasPressed('F3')) {
        this.debug = !this.debug;
        this.dbgEl.hidden = !this.debug;
      }
      if (In.wasPressed('F5') && (this.state === 'running' || this.state === 'paused')) {
        this.message(this.saveGame() ? 'Игра сохранена' : 'Не удалось сохранить');
      }
      if (In.wasPressed('F9') && (this.state === 'running' || this.state === 'paused') && this.hasSave()) this.loadGame();
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
      } else if (this.state === 'menu') {
        G.Player.angle += dt * 0.12;                // медленный поворот камеры на фоне главного меню
      } else if (this.state === 'running') {
        // Мышь применяется на каждом кадре (не привязана к 60 Гц) — плавный поворот
        // на мониторах 120/144 Гц. Коллизий у поворота нет, детерминизм логики не страдает.
        const dx = G.Input.consumeMouse();
        if (dx !== 0 && !G.Player.dead) G.Player.turn(dx * CFG.PLAYER.mouseSens);

        if (G.Input.wasPressed('Tab')) this.mapOpen = !this.mapOpen;

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
        if (!this.fpsEl.hidden) this.fpsEl.textContent = this.fps.toFixed(0) + ' FPS';
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
            'Звуки: ' + G.Audio.voices + '\n' +
            'Поз: ' + P.x.toFixed(2) + ', ' + P.y.toFixed(2) + '\n' +
            'Угол: ' + (P.angle * 180 / Math.PI).toFixed(0) + '°';
        }
      }
    }
  };

  window.addEventListener('DOMContentLoaded', () => Game.init());
})(window.GAME);
