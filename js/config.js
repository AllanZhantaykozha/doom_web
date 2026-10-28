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
      { name: 'Кулак', ammo: null, cost: 0, kind: 'melee', range: 1.1, dmgMin: 8, dmgMax: 20, pellets: 1, spread: 0,
        seq: [[1, 0.07], [2, 0.09], [1, 0.07], [0, 0.09]], fireAt: 1 },
      { name: 'Пистолет', ammo: 'bullets', cost: 1, kind: 'hitscan', range: 30, dmgMin: 5, dmgMax: 15, pellets: 1, spread: 0.006,
        seq: [[1, 0.06], [2, 0.10], [0, 0.22]], fireAt: 0 },
      { name: 'Дробовик', ammo: 'shells', cost: 1, kind: 'hitscan', range: 20, dmgMin: 5, dmgMax: 15, pellets: 7, spread: 0.075,
        seq: [[1, 0.08], [2, 0.12], [3, 0.16], [4, 0.2], [3, 0.16], [2, 0.12]], fireAt: 0 },
      { name: 'Автомат', ammo: 'bullets', cost: 1, kind: 'hitscan', range: 30, dmgMin: 5, dmgMax: 15, pellets: 1, spread: 0.012,
        heatSpread: 0.11, heatPerShot: 0.09, heatDecay: 1.4, alt: true,
        seq: [[1, 0.055], [0, 0.045]], fireAt: 0 },
      { name: 'Ракетница', ammo: 'rockets', cost: 1, kind: 'rocket',
        seq: [[1, 0.1], [2, 0.14], [3, 0.2], [2, 0.2]], fireAt: 0 }
    ],
    WEAPON_SWITCH_SPEED: 6,     // доля опускания в секунду
    ROCKET: { speed: 11, radius: 2.2, damage: 100, selfScale: 0.5, pushPlayer: 9, pushEnemy: 7 },
    KNOCK_FRICTION: 6,          // затухание отбрасывания, 1/с
    ARMOR_ABSORB: 0.5,          // доля урона, поглощаемая бронёй

    PICKUP_RADIUS: 0.5,
    USE_REACH: 1.5,

    GAMEPAD_DEADZONE: 0.2
  };
})();
