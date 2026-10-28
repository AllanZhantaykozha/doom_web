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
    PICKUP_RADIUS: 0.5,
    USE_REACH: 1.5,

    GAMEPAD_DEADZONE: 0.2
  };
})();
