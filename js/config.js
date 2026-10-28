// Константы и настройки. Создаёт общий namespace GAME.
(function () {
  'use strict';
  const G = window.GAME = window.GAME || {};

  G.CONFIG = {
    TICK_RATE: 60,
    STEP: 1 / 60,            // фиксированный шаг логики, с
    MAX_FRAME_TIME: 0.1,     // ограничение накопленного времени за кадр, с

    RENDER: {
      width: 320,
      height: 200,
      fovDeg: 66,
      maxDist: 20,           // расстояние, на котором затенение достигает минимума
      minLight: 0.12,
      sideShadeY: 0.7        // множитель яркости для стен, повёрнутых вдоль оси Y
    },
    RESOLUTIONS: [[320, 200], [640, 400]],

    PLAYER: {
      radius: 0.25,
      walkSpeed: 3.0,        // клеток/с
      runSpeed: 5.0,
      turnSpeed: 2.4,        // рад/с (стрелки)
      mouseSens: 0.0025      // рад/пиксель
    },

    DOOR: {
      speed: 2.0,            // доля открытия в секунду
      stay: 4.0,             // сколько дверь стоит открытой до автозакрытия, с
      passable: 0.8          // при какой степени открытия через дверь можно пройти
    },
    // Оружие: seq — анимация [кадр, длительность, с], fireAt — индекс записи seq, в начале которой происходит выстрел
    WEAPONS: [
      { name: 'Кулак', sound: 'punch', ammo: null, cost: 0, kind: 'melee', range: 1.1, dmgMin: 8, dmgMax: 20, pellets: 1, spread: 0,
        seq: [[1, 0.07], [2, 0.09], [1, 0.07], [0, 0.09]], fireAt: 1 },
      { name: 'Пистолет', sound: 'pistol', ammo: 'bullets', cost: 1, kind: 'hitscan', range: 30, dmgMin: 5, dmgMax: 15, pellets: 1, spread: 0.006, noise: 22,
        seq: [[1, 0.06], [2, 0.10], [0, 0.22]], fireAt: 0 },
      { name: 'Дробовик', sound: 'shotgun', ammo: 'shells', cost: 1, kind: 'hitscan', range: 20, dmgMin: 5, dmgMax: 15, pellets: 7, spread: 0.075, noise: 28,
        seq: [[1, 0.08], [2, 0.12], [3, 0.16], [4, 0.2], [3, 0.16], [2, 0.12]], fireAt: 0 },
      { name: 'Автомат', sound: 'chaingun', ammo: 'bullets', cost: 1, kind: 'hitscan', range: 30, dmgMin: 5, dmgMax: 15, pellets: 1, spread: 0.012, noise: 26,
        heatSpread: 0.11, heatPerShot: 0.09, heatDecay: 1.4, alt: true,
        seq: [[1, 0.055], [0, 0.045]], fireAt: 0 },
      { name: 'Ракетница', sound: 'rocket', ammo: 'rockets', cost: 1, kind: 'rocket', noise: 30,
        seq: [[1, 0.1], [2, 0.14], [3, 0.2], [2, 0.2]], fireAt: 0 }
    ],
    WEAPON_SCALE: 1.5,          // масштаб спрайта оружия (канвас 64x64 × масштаб, на базовом 320x200)
    WEAPON_SWITCH_SPEED: 6,     // доля опускания в секунду
    ROCKET: { speed: 11, radius: 2.2, damage: 100, selfScale: 0.5, pushPlayer: 9, pushEnemy: 7 },
    KNOCK_FRICTION: 6,          // затухание отбрасывания, 1/с
    ARMOR_ABSORB: 0.5,          // доля урона, поглощаемая бронёй

    // Сложность: множители урона врагов, здоровья врагов и доли спавнящихся врагов
    DIFFICULTY: [
      { name: 'Лёгкая', dmg: 0.5, hp: 0.75, count: 0.6 },
      { name: 'Нормальная', dmg: 1.0, hp: 1.0, count: 0.85 },
      { name: 'Сложная', dmg: 1.25, hp: 1.25, count: 1.0 },
      { name: 'Кошмар', dmg: 1.6, hp: 1.6, count: 1.0 }
    ],
    difficulty: 1,

    // Враги. ai:false — неподвижная мишень. attack.type: hitscan | melee | projectile
    // speed — клеток/с, keepDist — на каком расстоянии останавливается стрелок, пока видит игрока.
    ENEMIES: {
      e: { name: 'Караульный', voice: 1.0, sprite: 'guard', ai: true, hp: 20, radius: 0.28, size: 0.9, speed: 1.7, painChance: 0.8,
           reaction: 0.4, sight: 20, keepDist: 4.5, attackChance: 0.7, drop: 'c',
           attack: { type: 'hitscan', range: 16, windup: 0.35, recover: 0.3, cooldown: 0.9, dmgMin: 3, dmgMax: 12, spread: 0.09 } },
      f: { name: 'Клыкастый', voice: 0.7, sprite: 'fang', ai: true, hp: 30, radius: 0.3, size: 0.85, speed: 3.6, painChance: 0.6,
           reaction: 0.25, sight: 20, keepDist: 0, attackChance: 1.0, drop: null,
           attack: { type: 'melee', windup: 0.25, recover: 0.35, cooldown: 0.5, dmgMin: 8, dmgMax: 18 } },
      p: { name: 'Кислотник', voice: 1.25, sprite: 'spitter', ai: true, hp: 40, radius: 0.32, size: 0.9, speed: 1.2, painChance: 0.5,
           reaction: 0.5, sight: 20, keepDist: 5.5, attackChance: 0.8, drop: 's',
           attack: { type: 'projectile', range: 16, windup: 0.55, recover: 0.4, cooldown: 1.2, dmgMin: 10, dmgMax: 20, speed: 4.5 } },
      k: { name: 'Бастион', voice: 0.55, sprite: 'bulwark', ai: true, hp: 160, radius: 0.38, size: 1.15, speed: 0.95, painChance: 0.15,
           reaction: 0.6, sight: 22, keepDist: 3.5, attackChance: 0.8, drop: 'a',
           attack: { type: 'hitscan', range: 14, windup: 0.7, recover: 0.5, cooldown: 1.9, dmgMin: 15, dmgMax: 30, spread: 0.07 } },
      Z: { name: 'Гнилой страж', voice: 0.4, sprite: 'warden', ai: true, boss: true, hp: 700, radius: 0.5, size: 1.0, speed: 1.1,
           painChance: 0.04, reaction: 0.8, sight: 40, keepDist: 5, attackChance: 1.0, drop: null,
           // Фазы по доле оставшегося здоровья; в каждой — свой набор атак. summon — подкрепление при входе в фазу.
           phases: [
             { hpFrac: 1.0, speedMul: 1.0, attacks: [
               { type: 'hitscan', range: 22, windup: 0.6, recover: 0.5, cooldown: 1.1, dmgMin: 10, dmgMax: 18, spread: 0.1, pellets: 3 },
               { type: 'fan', range: 22, count: 5, arc: 0.8, speed: 5, windup: 0.7, recover: 0.6, cooldown: 1.3, dmgMin: 10, dmgMax: 16 } ] },
             { hpFrac: 0.66, speedMul: 1.35, summon: ['f', 'f'], attacks: [
               { type: 'hitscan', range: 22, windup: 0.5, recover: 0.4, cooldown: 0.9, dmgMin: 10, dmgMax: 18, spread: 0.1, pellets: 3 },
               { type: 'fan', range: 22, count: 7, arc: 1.1, speed: 5.5, windup: 0.6, recover: 0.5, cooldown: 1.1, dmgMin: 10, dmgMax: 16 },
               { type: 'charge', range: 9, windup: 0.6, duration: 0.8, speed: 7, recover: 0.7, cooldown: 1.8, dmgMin: 25, dmgMax: 40 } ] },
             { hpFrac: 0.33, speedMul: 1.9, summon: ['e', 'p'], sprite: 'warden2', attacks: [
               { type: 'hitscan', range: 22, windup: 0.4, recover: 0.35, cooldown: 0.7, dmgMin: 10, dmgMax: 18, spread: 0.12, pellets: 4 },
               { type: 'fan', range: 22, count: 9, arc: 1.4, speed: 6, windup: 0.5, recover: 0.45, cooldown: 0.9, dmgMin: 10, dmgMax: 16 },
               { type: 'charge', range: 10, windup: 0.45, duration: 0.9, speed: 8.5, recover: 0.5, cooldown: 1.3, dmgMin: 25, dmgMax: 40 } ] }
           ] },
      t: { name: 'Манекен', sprite: 'dummy', ai: false, hp: 60, radius: 0.3, size: 0.9 }
    },

    SPHERE: { invuln: 12, quad: 25, quadMul: 3 },   // длительность сфер, с; множитель урона
    PICKUP_RADIUS: 0.5,
    USE_REACH: 1.5,

    GAMEPAD_DEADZONE: 0.2
  };

  // ---------- Настройки пользователя (localStorage) ----------
  const KEY = 'ironhollow.settings';
  G.Settings = {
    data: { mouse: 10, sfx: 80, music: 50, musicOn: true, fov: 66, res: 0, fps: false },

    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
          const d = JSON.parse(raw);
          for (const k in this.data) if (typeof d[k] === typeof this.data[k]) this.data[k] = d[k];
        }
      } catch (e) { /* localStorage недоступен или повреждён — остаются значения по умолчанию */ }
    },

    save() {
      try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* игнорируем */ }
    },

    // Применяет настройки к модулям (вызывается после инициализации рендера и звука)
    apply() {
      const d = this.data, R = G.Renderer, A = G.Audio;
      G.CONFIG.PLAYER.mouseSens = d.mouse * 0.00025;
      R.setFov(d.fov);
      const r = G.CONFIG.RESOLUTIONS[d.res] || G.CONFIG.RESOLUTIONS[0];
      if (R.w !== r[0] || R.h !== r[1]) R.setResolution(r[0], r[1]);
      A.sfxVol = d.sfx / 100;
      A.musicVol = d.music / 100;
      A.musicOn = d.musicOn;
      A.applyVolumes();
      const f = document.getElementById('fps');
      if (f) f.hidden = !d.fps;
    }
  };
})();
