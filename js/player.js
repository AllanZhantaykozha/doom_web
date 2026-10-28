// Состояние игрока и движение.
(function (G) {
  'use strict';
  const P = G.CONFIG.PLAYER;
  const TAU = Math.PI * 2;

  const Player = G.Player = {
    x: 0, y: 0,
    angle: 0,
    health: 100,
    armor: 0,
    keys: [false, false, false, false],   // [_, красный, синий, жёлтый]
    ammo: { bullets: 50, shells: 0, rockets: 0, cells: 0 },
    ammoMax: { bullets: 200, shells: 50, rockets: 50, cells: 300 },
    dirty: true,                          // HUD нужно перерисовать

    reset(x, y, angle) {
      this.x = x;
      this.y = y;
      this.angle = angle;
    },

    // Начало новой игры: стартовые показатели
    newGame() {
      this.health = 100;
      this.armor = 0;
      this.ammo.bullets = 50; this.ammo.shells = 0; this.ammo.rockets = 0; this.ammo.cells = 0;
      this.dirty = true;
    },

    // Ключи действуют в пределах уровня
    clearKeys() {
      this.keys.fill(false);
      this.dirty = true;
    },

    // Методы подбора возвращают true, если что-то реально изменилось
    heal(n, cap) {
      if (this.health >= cap) return false;
      this.health = Math.min(cap, this.health + n);
      return true;
    },
    addArmor(n, cap) {
      if (this.armor >= cap) return false;
      this.armor = Math.min(cap, this.armor + n);
      return true;
    },
    addAmmo(type, n) {
      if (this.ammo[type] >= this.ammoMax[type]) return false;
      this.ammo[type] = Math.min(this.ammoMax[type], this.ammo[type] + n);
      return true;
    },
    giveKey(k) { this.keys[k] = true; },

    // Поворот вызывается каждый кадр рендера (мышь) и каждый тик (стрелки/геймпад).
    turn(delta) {
      this.angle += delta;
      if (this.angle >= TAU) this.angle -= TAU;
      else if (this.angle < 0) this.angle += TAU;
    },

    // Один тик логики (dt = G.CONFIG.STEP).
    update(dt) {
      const In = G.Input;

      // Поворот стрелками / правым стиком
      let turn = 0;
      if (In.isDown('ArrowLeft')) turn -= 1;
      if (In.isDown('ArrowRight')) turn += 1;
      turn += In.padTurn;
      if (turn !== 0) this.turn(turn * P.turnSpeed * dt);

      // Намерение движения в локальных осях: forward (вперёд), strafe (вправо)
      let fwd = 0, str = 0;
      if (In.isDown('KeyW')) fwd += 1;
      if (In.isDown('KeyS')) fwd -= 1;
      if (In.isDown('KeyD')) str += 1;
      if (In.isDown('KeyA')) str -= 1;
      fwd += In.padMoveY;
      str += In.padMoveX;

      const len = Math.hypot(fwd, str);
      if (len === 0) return;
      if (len > 1) { fwd /= len; str /= len; }  // диагональ не быстрее прямой

      const run = In.isDown('ShiftLeft') || In.isDown('ShiftRight') || In.padRun;
      const speed = (run ? P.runSpeed : P.walkSpeed) * dt;

      // Вектор взгляда (cos, sin); «вправо» в системе с осью Y вниз — (-sin, cos).
      const c = Math.cos(this.angle), s = Math.sin(this.angle);
      const dx = (c * fwd - s * str) * speed;
      const dy = (s * fwd + c * str) * speed;

      // Скольжение: оси проверяются раздельно, заблокированная ось просто не двигается.
      const M = G.Map;
      if (!M.blocked(this.x + dx, this.y, P.radius)) this.x += dx;
      if (!M.blocked(this.x, this.y + dy, P.radius)) this.y += dy;
    }
  };
})(window.GAME);
