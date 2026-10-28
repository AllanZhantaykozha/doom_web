// Звук и музыка на Web Audio API без файлов: все звуки синтезируются шумом и осцилляторами.
// AudioContext создаётся только после первого действия пользователя (unlock()).
// Позиционный звук: громкость падает с расстоянием, панорама — проекция направления на «вправо» от взгляда.
(function (G) {
  'use strict';

  const MAX_VOICES = 28;      // предел одновременных звуков (узлы Web Audio не бесплатны)
  const MAX_DIST = 30;        // дальше этого расстояния звук не воспроизводится

  const Audio = G.Audio = {
    ctx: null, master: null, sfx: null, musicBus: null, noiseBuf: null,
    sfxVol: 0.8, musicVol: 0.5, musicOn: true,
    voices: 0,
    // Музыка
    musicWanted: false, song: 0, step: 0, nextTime: 0, timer: null,

    // ---------- Запуск ----------
    unlock() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const c = this.ctx = new AC();
        this.master = c.createGain(); this.master.gain.value = 0.9; this.master.connect(c.destination);
        this.sfx = c.createGain(); this.sfx.connect(this.master);
        this.musicBus = c.createGain(); this.musicBus.connect(this.master);
        // Белый шум на 2 с: источник для выстрелов, взрывов, шагов и ударных
        const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.noiseBuf = buf;
        this.applyVolumes();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      if (this.musicWanted) this.startTimer();
    },

    applyVolumes() {
      if (!this.ctx) return;
      this.sfx.gain.value = this.sfxVol;
      this.musicBus.gain.value = this.musicOn ? this.musicVol * 0.55 : 0;
    },

    // ---------- Примитивы синтеза ----------
    // Шум через фильтр с огибающей. o: type, f0, f1 (развёртка частоты), q, gain, atk
    noise(out, t, dur, o) {
      const c = this.ctx, s = c.createBufferSource();
      s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter();
      f.type = o.type || 'lowpass';
      f.frequency.setValueAtTime(o.f0, t);
      if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
      f.Q.value = o.q || 0.7;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(o.gain, t + (o.atk || 0.004));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(out);
      s.start(t, Math.random() * 1.5);
      s.stop(t + dur + 0.03);
    },

    // Осциллятор с экспоненциальным слайдом частоты и огибающей. o: type, f0, f1, gain, atk, lp (срез)
    tone(out, t, dur, o) {
      const c = this.ctx, osc = c.createOscillator();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(o.f0, t);
      if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(o.gain, t + (o.atk || 0.005));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let node = osc;
      if (o.lp) {
        const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp;
        osc.connect(f); node = f;
      }
      node.connect(g); g.connect(out);
      osc.start(t); osc.stop(t + dur + 0.03);
    },

    // ---------- Воспроизведение ----------
    // name — ключ из SFX; (x, y) — позиция источника или не задана (тогда по центру); pitch — множитель высоты
    play(name, x, y, vol, pitch) {
      const c = this.ctx;
      if (!c || c.state !== 'running' || this.voices >= MAX_VOICES) return;
      const fn = SFX[name];
      if (!fn) return;
      let gain = vol || 1, pan = 0;
      if (x !== undefined) {
        const P = G.Player, dx = x - P.x, dy = y - P.y, d = Math.hypot(dx, dy);
        if (d > MAX_DIST) return;
        gain /= 1 + d * 0.45;
        if (gain < 0.03) return;
        if (d > 0.15) pan = 0.85 * (-Math.sin(P.angle) * dx + Math.cos(P.angle) * dy) / d;
      }
      const g = c.createGain();
      g.gain.value = gain;
      if (c.createStereoPanner) {
        const p = c.createStereoPanner(); p.pan.value = pan;
        g.connect(p); p.connect(this.sfx);
      } else g.connect(this.sfx);
      this.voices++;
      const dur = fn(this, g, c.currentTime + 0.004, pitch || 1) || 0.5;
      setTimeout(() => { this.voices--; }, dur * 1000 + 100);
    },

    // ---------- Музыка: секвенсор с упреждающим планированием ----------
    // Включает/выключает музыку; song — номер песни (по уровню)
    music(on, song) {
      if (song !== undefined && song !== this.song) { this.song = song; this.step = 0; }
      this.musicWanted = on;
      if (!on) { this.stopTimer(); return; }
      if (this.ctx && this.ctx.state === 'running') this.startTimer();
    },

    startTimer() {
      if (this.timer) return;
      this.nextTime = this.ctx.currentTime + 0.08;
      this.timer = setInterval(() => this.schedule(), 30);
    },
    stopTimer() {
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
    },

    schedule() {
      const c = this.ctx;
      if (!c || !this.musicOn && this.musicVol === 0) return;
      const S = SONGS[this.song % SONGS.length], dt = 60 / S.tempo / 4;       // 16-я нота
      while (this.nextTime < c.currentTime + 0.12) {
        this.playStep(S, this.step, this.nextTime);
        this.nextTime += dt;
        this.step = (this.step + 1) % 32;
      }
    },

    playStep(S, i, t) {
      const out = this.musicBus;
      const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
      const b = S.bass[i];
      if (b >= 0) {                                                   // бас: пила через ФНЧ
        this.tone(out, t, 0.2, { type: 'sawtooth', f0: hz(S.root + b), gain: 0.5, lp: 520, atk: 0.006 });
      }
      if (S.kick[i] === 'x') this.tone(out, t, 0.16, { type: 'sine', f0: 150, f1: 42, gain: 0.9, atk: 0.002 });
      if (S.snare[i] === 'x') {
        this.noise(out, t, 0.13, { type: 'highpass', f0: 1500, gain: 0.45 });
        this.tone(out, t, 0.08, { type: 'triangle', f0: 200, f1: 120, gain: 0.35 });
      }
      if (S.hat[i] === 'x') this.noise(out, t, 0.04, { type: 'highpass', f0: 7500, gain: 0.16 });
      if (S.lead && i % 4 === 0) {                                    // арпеджио на последнем уровне
        const iv = S.lead[(i >> 2) % S.lead.length];
        this.tone(out, t, 0.14, { type: 'triangle', f0: hz(S.root + 24 + iv), gain: 0.22 });
      }
    }
  };

  // Паттерны по 32 шестнадцатых (2 такта). bass: полутоны от тоники, -1 — пауза.
  const SONGS = [
    { tempo: 112, root: 40,
      bass: [0, -1, 0, 12, -1, 0, 10, -1, 0, -1, 0, 12, -1, 7, 5, 3, 0, -1, 0, 12, -1, 0, 10, -1, 0, -1, 12, 0, 8, -1, 7, 5],
      kick: 'x.....x.x.......x.....x.x.......', snare: '....x...'.repeat(4), hat: 'x.'.repeat(16) },
    { tempo: 124, root: 38,
      bass: [0, 0, -1, 0, 3, -1, 0, -1, 5, -1, 3, 0, -1, 0, -1, 12, 0, 0, -1, 0, 3, -1, 0, -1, 7, -1, 5, 3, -1, 0, -1, 1],
      kick: 'x...x...x...x...'.repeat(2), snare: '....x...'.repeat(4), hat: 'x.xxx.xx'.repeat(4) },
    { tempo: 140, root: 36,
      bass: [0, 0, 1, 0, 0, 0, 3, 0, 0, 0, 1, 0, 6, 0, 5, 0, 0, 0, 1, 0, 0, 0, 3, 0, 8, 0, 7, 0, 6, 5, 3, 1],
      kick: 'x..xx..xx.x.x..x'.repeat(2), snare: '....x...'.repeat(4), hat: 'x'.repeat(32),
      lead: [0, 3, 7, 10, 7, 3, 1, 5] }
  ];

  // ---------- Звуки ----------
  // Каждая функция (A, out, t, p) планирует узлы и возвращает длительность в секундах.
  const SFX = {
    pistol(A, o, t) {
      A.noise(o, t, 0.13, { type: 'bandpass', f0: 2200, f1: 500, q: 0.8, gain: 1.0 });
      A.tone(o, t, 0.09, { type: 'square', f0: 220, f1: 60, gain: 0.5 });
      return 0.15;
    },
    shotgun(A, o, t) {
      A.noise(o, t, 0.4, { type: 'lowpass', f0: 3000, f1: 250, gain: 1.2 });
      A.tone(o, t, 0.25, { type: 'sine', f0: 110, f1: 38, gain: 0.9 });
      return 0.45;
    },
    chaingun(A, o, t) {
      A.noise(o, t, 0.08, { type: 'bandpass', f0: 2600, f1: 700, q: 0.9, gain: 0.8 });
      A.tone(o, t, 0.06, { type: 'square', f0: 260, f1: 90, gain: 0.4 });
      return 0.1;
    },
    rocket(A, o, t) {
      A.noise(o, t, 0.5, { type: 'bandpass', f0: 300, f1: 1400, q: 1.2, gain: 0.8, atk: 0.04 });
      A.tone(o, t, 0.4, { type: 'sawtooth', f0: 110, f1: 220, gain: 0.35, lp: 700 });
      return 0.55;
    },
    explosion(A, o, t) {
      A.noise(o, t, 1.0, { type: 'lowpass', f0: 1800, f1: 70, gain: 1.5 });
      A.tone(o, t, 0.9, { type: 'sine', f0: 80, f1: 24, gain: 1.1 });
      return 1.05;
    },
    punch(A, o, t) {
      A.noise(o, t, 0.09, { type: 'lowpass', f0: 700, f1: 200, gain: 0.7 });
      A.tone(o, t, 0.13, { type: 'sine', f0: 130, f1: 55, gain: 0.8 });
      return 0.2;
    },
    click(A, o, t) { A.tone(o, t, 0.03, { type: 'square', f0: 1100, gain: 0.25 }); return 0.06; },
    step(A, o, t, p) {
      A.noise(o, t, 0.06, { type: 'lowpass', f0: 380 * p, f1: 160, gain: 0.35 });
      return 0.1;
    },
    dooropen(A, o, t) {
      A.noise(o, t, 0.55, { type: 'bandpass', f0: 260, f1: 520, q: 2, gain: 0.5, atk: 0.08 });
      A.tone(o, t, 0.5, { type: 'sawtooth', f0: 55, f1: 85, gain: 0.3, lp: 300, atk: 0.06 });
      return 0.6;
    },
    doorclose(A, o, t) {
      A.noise(o, t, 0.45, { type: 'bandpass', f0: 500, f1: 220, q: 2, gain: 0.5, atk: 0.05 });
      A.tone(o, t + 0.38, 0.12, { type: 'sine', f0: 90, f1: 40, gain: 0.8 });
      return 0.55;
    },
    pickup(A, o, t) {
      A.tone(o, t, 0.08, { type: 'sine', f0: 660, gain: 0.4 });
      A.tone(o, t + 0.07, 0.12, { type: 'sine', f0: 990, gain: 0.4 });
      return 0.25;
    },
    key(A, o, t) {
      [660, 880, 1320].forEach((f, i) => A.tone(o, t + i * 0.08, 0.14, { type: 'triangle', f0: f, gain: 0.45 }));
      return 0.4;
    },
    weapon(A, o, t) {
      [330, 440, 554, 660].forEach((f, i) => A.tone(o, t + i * 0.06, 0.12, { type: 'square', f0: f, gain: 0.25, lp: 2400 }));
      return 0.4;
    },
    sphere(A, o, t) {
      A.tone(o, t, 0.7, { type: 'sine', f0: 300, f1: 1200, gain: 0.5, atk: 0.1 });
      A.tone(o, t + 0.1, 0.6, { type: 'triangle', f0: 450, f1: 1800, gain: 0.3, atk: 0.1 });
      return 0.8;
    },
    secret(A, o, t) {
      [880, 1108, 1318, 1760].forEach((f, i) => A.tone(o, t + i * 0.07, 0.18, { type: 'triangle', f0: f, gain: 0.35 }));
      return 0.5;
    },
    exit(A, o, t) {
      [784, 659, 523, 392].forEach((f, i) => A.tone(o, t + i * 0.12, 0.25, { type: 'triangle', f0: f, gain: 0.4 }));
      return 0.7;
    },
    pain(A, o, t) {                         // боль игрока
      A.tone(o, t, 0.2, { type: 'sawtooth', f0: 240, f1: 130, gain: 0.5, lp: 900 });
      A.noise(o, t, 0.1, { type: 'bandpass', f0: 900, q: 1, gain: 0.25 });
      return 0.25;
    },
    death(A, o, t) {                        // смерть игрока
      A.tone(o, t, 1.0, { type: 'sawtooth', f0: 230, f1: 38, gain: 0.55, lp: 700 });
      A.noise(o, t, 0.5, { type: 'lowpass', f0: 900, f1: 150, gain: 0.3 });
      return 1.1;
    },
    // Враги: p — высота голоса типа (0.5 — низкий бастион/босс, 1.3 — высокий)
    alert(A, o, t, p) {                     // рычание при обнаружении
      A.tone(o, t, 0.4, { type: 'sawtooth', f0: 150 * p, f1: 260 * p, gain: 0.55, lp: 800, atk: 0.04 });
      A.tone(o, t + 0.2, 0.35, { type: 'sawtooth', f0: 260 * p, f1: 90 * p, gain: 0.5, lp: 700 });
      A.noise(o, t, 0.5, { type: 'bandpass', f0: 500 * p, q: 1.2, gain: 0.25, atk: 0.1 });
      return 0.6;
    },
    epain(A, o, t, p) {
      A.tone(o, t, 0.18, { type: 'sawtooth', f0: 280 * p, f1: 150 * p, gain: 0.5, lp: 1000 });
      return 0.22;
    },
    edeath(A, o, t, p) {
      A.tone(o, t, 0.8, { type: 'sawtooth', f0: 260 * p, f1: 40 * p, gain: 0.55, lp: 800 });
      A.noise(o, t, 0.5, { type: 'lowpass', f0: 700, f1: 120, gain: 0.3 });
      return 0.9;
    },
    eshot(A, o, t) {                        // выстрел стрелка
      A.noise(o, t, 0.15, { type: 'bandpass', f0: 1500, f1: 400, q: 0.8, gain: 0.8 });
      A.tone(o, t, 0.1, { type: 'square', f0: 170, f1: 70, gain: 0.35 });
      return 0.2;
    },
    blast(A, o, t) {                        // тяжёлый залп бастиона / босса
      A.noise(o, t, 0.5, { type: 'lowpass', f0: 2200, f1: 150, gain: 1.1 });
      A.tone(o, t, 0.35, { type: 'sine', f0: 100, f1: 35, gain: 0.9 });
      return 0.55;
    },
    swing(A, o, t) {                        // взмах когтей
      A.noise(o, t, 0.18, { type: 'bandpass', f0: 700, f1: 2000, q: 1.5, gain: 0.55, atk: 0.05 });
      return 0.22;
    },
    spit(A, o, t) {                         // плевок кислотой
      A.tone(o, t, 0.28, { type: 'sine', f0: 280, f1: 760, gain: 0.5 });
      A.noise(o, t, 0.2, { type: 'bandpass', f0: 1200, q: 2, gain: 0.3 });
      return 0.3;
    },
    bolthit(A, o, t) {
      A.noise(o, t, 0.2, { type: 'bandpass', f0: 900, f1: 300, q: 1.2, gain: 0.6 });
      A.tone(o, t, 0.15, { type: 'sine', f0: 220, f1: 90, gain: 0.4 });
      return 0.25;
    },
    roar(A, o, t) {                         // рёв босса
      A.tone(o, t, 1.1, { type: 'sawtooth', f0: 70, f1: 34, gain: 0.7, lp: 600, atk: 0.05 });
      A.tone(o, t, 1.0, { type: 'sawtooth', f0: 105, f1: 52, gain: 0.4, lp: 500 });
      A.noise(o, t, 1.0, { type: 'lowpass', f0: 700, f1: 200, gain: 0.45 });
      return 1.2;
    }
  };
})(window.GAME);
