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
    dead: false, deathTime: 0,
    invuln: 0, quad: 0,                   // сферы: оставшееся время, с

    // Оружие
    weapon: 1,                            // индекс текущего оружия
    weapons: [true, true, false, false, false],
    wantWeapon: 1,
    switching: 0,                         // 0 нет, 1 опускание, 2 подъём
    wLower: 0,                            // 0 — поднято, 1 — полностью опущено
    animating: false, wTime: 0, wShot: false, wFrame: 0, flip: 0,
    heat: 0,                              // нагрев автомата (рост разброса)
    flash: 0,                             // вспышка выстрела, освещающая сцену

    // Кинематика и эффекты
    kx: 0, ky: 0,                         // скорость отбрасывания
    bobPhase: 0, bobAmp: 0,
    hurtFlash: 0, pickupFlash: 0,
    painTimer: 0, grinTimer: 0, lookTimer: 0, faceLook: 0,
    glance: 0, glanceTimer: 1,
    stepTimer: 0, painCool: 0,
    pitch: 0,                             // наклон камеры, рад (+ вверх), сдвиг горизонта; прицеливание остаётся горизонтальным

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
      this.weapons[0] = this.weapons[1] = true;
      this.weapons[2] = this.weapons[3] = this.weapons[4] = false;
      this.weapon = this.wantWeapon = 1;
      this.switching = 0; this.wLower = 0; this.animating = false; this.wFrame = 0;
      this.heat = 0; this.flash = 0;
      this.dead = false; this.deathTime = 0;
      this.invuln = 0; this.quad = 0;
      this.stepTimer = 0;
      this.pitch = 0;
      this.kx = this.ky = 0;
      this.hurtFlash = this.pickupFlash = 0;
      this.painTimer = this.grinTimer = this.lookTimer = 0;
      this.dirty = true;
    },

    // Начало уровня: ключи и временные сферы действуют только в пределах уровня
    startLevel() {
      this.keys.fill(false);
      this.invuln = 0; this.quad = 0;
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

    // Подбор оружия: новое оружие забирается сразу и берётся в руки; для имеющегося — только патроны
    giveWeapon(idx, ammoType, amount) {
      const had = this.weapons[idx];
      this.weapons[idx] = true;
      const gotAmmo = this.addAmmo(ammoType, amount);
      if (!had) {
        this.grinTimer = 1.5;
        this.selectWeapon(idx);
        return true;
      }
      return gotAmmo;
    },

    // Получение урона: броня поглощает долю, затем здоровье
    damage(amount, srcX, srcY) {
      if (this.dead || amount <= 0 || this.invuln > 0) return;
      amount = Math.max(1, Math.round(amount));
      const absorb = Math.min(this.armor, Math.floor(amount * G.CONFIG.ARMOR_ABSORB));
      this.armor -= absorb;
      this.health -= amount - absorb;
      this.hurtFlash = Math.min(1, this.hurtFlash + amount / 40);
      if (this.painCool <= 0) { G.Audio.play('pain'); this.painCool = 0.3; }
      this.painTimer = amount >= 20 ? 0.6 : 0.3;
      if (G.Input.touch && navigator.vibrate) navigator.vibrate(Math.min(80, 20 + amount));   // отклик на телефоне
      // Лицо смотрит на источник: знак угла между взглядом и направлением на источник
      let rel = Math.atan2(srcY - this.y, srcX - this.x) - this.angle;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      this.faceLook = Math.abs(rel) < 0.5 ? 0 : (rel > 0 ? 1 : -1);
      this.lookTimer = 1.0;
      this.dirty = true;
      if (this.health <= 0) {
        this.health = 0;
        this.dead = true;
        this.deathTime = 0;
        G.Audio.play('death');
        G.Game.message('Вы погибли');
      }
    },

    push(vx, vy) { this.kx += vx; this.ky += vy; },

    // ---- Оружие ----
    selectWeapon(i) {
      if (i < 0 || i >= this.weapons.length || !this.weapons[i]) return;
      if (i === this.weapon && this.switching === 0) return;
      if (i === this.wantWeapon && this.switching !== 0) return;
      this.wantWeapon = i;
      if (this.switching !== 1) { this.switching = 1; G.Audio.play('click'); }
      this.dirty = true;
    },

    cycleWeapon(dir) {
      const n = this.weapons.length;
      let i = this.wantWeapon;
      for (let k = 0; k < n; k++) {
        i = (i + dir + n) % n;
        if (this.weapons[i]) { this.selectWeapon(i); return; }
      }
    },

    hasAmmo(w) {
      return w.ammo === null || this.ammo[w.ammo] >= w.cost;
    },

    // При пустом магазине берём лучшее оружие, на которое хватает патронов
    autoSwitch() {
      const W = G.CONFIG.WEAPONS;
      for (let i = W.length - 1; i >= 0; i--) {
        if (this.weapons[i] && this.hasAmmo(W[i])) { this.selectWeapon(i); return; }
      }
    },

    // Выстрел — вызывается в момент fireAt анимации
    executeFire(w) {
      const C = G.CONFIG;
      if (w.ammo !== null) { this.ammo[w.ammo] -= w.cost; this.dirty = true; }
      const mul = this.quad > 0 ? C.SPHERE.quadMul : 1;     // сфера ярости
      G.Audio.play(w.sound);
      if (w.noise) G.Enemies.noise(this.x, this.y, w.noise);   // выстрел будит врагов поблизости
      if (w.kind === 'rocket') {
        G.Projectiles.spawnRocket(this.x + Math.cos(this.angle) * 0.3, this.y + Math.sin(this.angle) * 0.3, this.angle,
          C.ROCKET.damage * mul);
        this.flash = 1;
        return;
      }
      let spread = w.spread;
      if (w.heatSpread) {
        spread += this.heat * w.heatSpread;
        this.heat = Math.min(1, this.heat + w.heatPerShot);
      }
      for (let i = 0; i < w.pellets; i++) {
        const a = this.angle + (Math.random() * 2 - 1) * spread;
        const dmg = (w.dmgMin + Math.floor(Math.random() * (w.dmgMax - w.dmgMin + 1))) * mul;
        G.Enemies.fireRay(this.x, this.y, a, w.range, dmg);
      }
      if (w.kind === 'hitscan') this.flash = 1;
    },

    updateWeapon(dt, trigger) {
      const C = G.CONFIG, W = C.WEAPONS[this.weapon];

      if (this.switching === 1) {
        this.wLower += dt * C.WEAPON_SWITCH_SPEED;
        if (this.wLower >= 1) {
          this.wLower = 1;
          this.weapon = this.wantWeapon;
          this.animating = false; this.wFrame = 0;
          this.switching = 2;
          this.dirty = true;
        }
        return;
      }
      if (this.switching === 2) {
        this.wLower -= dt * C.WEAPON_SWITCH_SPEED;
        if (this.wLower <= 0) { this.wLower = 0; this.switching = 0; }
        return;
      }

      // Нагрев автомата остывает, когда не стреляем
      if (!this.animating && W.heatDecay) this.heat = Math.max(0, this.heat - W.heatDecay * dt);

      if (!this.animating) {
        if (trigger) {
          if (this.hasAmmo(W)) { this.animating = true; this.wTime = 0; this.wShot = false; }
          else this.autoSwitch();
        }
        return;
      }

      this.wTime += dt;
      // Момент выстрела: начало записи fireAt
      if (!this.wShot) {
        let start = 0;
        for (let i = 0; i < W.fireAt; i++) start += W.seq[i][1];
        if (this.wTime >= start) {
          this.wShot = true;
          this.executeFire(W);
          if (W.alt) this.flip ^= 1;
        }
      }
      // Текущий кадр
      let t = this.wTime, frame = 0, done = true;
      for (let i = 0; i < W.seq.length; i++) {
        if (t < W.seq[i][1]) { frame = W.seq[i][0]; done = false; break; }
        t -= W.seq[i][1];
      }
      if (done) {
        this.animating = false;
        this.wFrame = 0;
        if (!this.hasAmmo(W)) this.autoSwitch();
      } else {
        this.wFrame = (W.alt && frame === 1) ? 1 + this.flip : frame;
      }
    },

    // Наклон камеры вверх/вниз. dy — движение мыши/пальца вниз в «пикселях мыши» (вниз = взгляд вниз).
    look(dy) {
      const C = G.CONFIG.PLAYER;
      this.pitch += (C.invertY ? dy : -dy) * C.mouseSens;
      this.clampPitch();
    },
    clampPitch() {
      const m = G.CONFIG.PLAYER.maxPitch;
      if (this.pitch > m) this.pitch = m; else if (this.pitch < -m) this.pitch = -m;
    },

    // Поворот вызывается

    // Поворот вызывается каждый кадр рендера (мышь) и каждый тик (стрелки/геймпад).
    turn(delta) {
      this.angle += delta;
      if (this.angle >= TAU) this.angle -= TAU;
      else if (this.angle < 0) this.angle += TAU;
    },

    // Один тик логики (dt = G.CONFIG.STEP).
    update(dt) {
      const In = G.Input, C = G.CONFIG;

      // Таймеры эффектов
      if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);
      if (this.quad > 0) this.quad = Math.max(0, this.quad - dt);
      if (this.flash > 0) this.flash = Math.max(0, this.flash - dt / 0.1);
      if (this.hurtFlash > 0) this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.5);
      if (this.pickupFlash > 0) this.pickupFlash = Math.max(0, this.pickupFlash - dt * 1.5);
      if (this.painTimer > 0) this.painTimer -= dt;
      if (this.painCool > 0) this.painCool -= dt;
      if (this.grinTimer > 0) this.grinTimer -= dt;
      if (this.lookTimer > 0) this.lookTimer -= dt;
      this.glanceTimer -= dt;
      if (this.glanceTimer <= 0) {                       // случайные взгляды лица
        this.glance = Math.floor(Math.random() * 3) - 1;
        this.glanceTimer = 0.6 + Math.random() * 1.4;
      }

      if (this.dead) {
        this.deathTime += dt;
        this.kx = this.ky = 0;
        return;
      }

      // Выбор оружия 1–5
      for (let i = 0; i < 5; i++) if (In.wasPressed('Digit' + (i + 1))) this.selectWeapon(i);
      const trigger = In.isDown('ControlLeft') || In.isDown('ControlRight') || In.mouseDown || In.padFire || In.touchFire;
      this.updateWeapon(dt, trigger);

      // Поворот стрелками / правым стиком
      let turn = 0;
      if (In.isDown('ArrowLeft')) turn -= 1;
      if (In.isDown('ArrowRight')) turn += 1;
      turn += In.padTurn;
      if (turn !== 0) this.turn(turn * P.turnSpeed * dt);

      // Наклон камеры: стрелки вверх/вниз, правый стик; Home — вернуть горизонт
      let tilt = 0;
      if (In.isDown('ArrowUp')) tilt += 1;
      if (In.isDown('ArrowDown')) tilt -= 1;
      tilt += In.padLook * (P.invertY ? 1 : -1);
      if (tilt !== 0) { this.pitch += tilt * P.turnSpeed * 0.7 * dt; this.clampPitch(); }
      if (In.wasPressed('Home')) this.pitch = 0;

      // Намерение движения в локальных осях: forward (вперёд), strafe (вправо)
      let fwd = 0, str = 0;
      if (In.isDown('KeyW')) fwd += 1;
      if (In.isDown('KeyS')) fwd -= 1;
      if (In.isDown('KeyD')) str += 1;
      if (In.isDown('KeyA')) str -= 1;
      fwd += In.padMoveY + In.touchY;
      str += In.padMoveX + In.touchX;

      const len = Math.hypot(fwd, str);
      const run = In.isDown('ShiftLeft') || In.isDown('ShiftRight') || In.padRun || In.touchRun;
      const M = G.Map, E = G.Enemies, r = P.radius;

      let dx = 0, dy = 0;
      if (len > 0) {
        if (len > 1) { fwd /= len; str /= len; }         // диагональ не быстрее прямой
        const speed = (run ? P.runSpeed : P.walkSpeed) * dt;
        // Вектор взгляда (cos, sin); «вправо» в системе с осью Y вниз — (-sin, cos).
        const c = Math.cos(this.angle), s = Math.sin(this.angle);
        dx = (c * fwd - s * str) * speed;
        dy = (s * fwd + c * str) * speed;
      }

      // Отбрасывание (взрывы): затухающая скорость, складывается с намерением
      if (this.kx !== 0 || this.ky !== 0) {
        dx += this.kx * dt; dy += this.ky * dt;
        const fr = Math.max(0, 1 - C.KNOCK_FRICTION * dt);
        this.kx *= fr; this.ky *= fr;
        if (Math.abs(this.kx) < 0.01) this.kx = 0;
        if (Math.abs(this.ky) < 0.01) this.ky = 0;
      }

      // Скольжение: оси проверяются раздельно; враги тоже блокируют движение
      if (dx !== 0 && !M.blocked(this.x + dx, this.y, r) && !E.blocked(this.x + dx, this.y, r)) this.x += dx;
      if (dy !== 0 && !M.blocked(this.x, this.y + dy, r) && !E.blocked(this.x, this.y + dy, r)) this.y += dy;

      // Шаги: чаще при беге; высота слегка меняется, чтобы не было «пулемёта» одинаковых звуков
      if (len > 0) {
        this.stepTimer -= dt;
        if (this.stepTimer <= 0) {
          this.stepTimer = run ? 0.3 : 0.44;
          G.Audio.play('step', undefined, undefined, 0.8, 0.85 + Math.random() * 0.3);
        }
      } else this.stepTimer = 0;

      // Покачивание оружия: амплитуда плавно растёт при ходьбе
      const target = len > 0 ? (run ? 1.3 : 1) : 0;
      this.bobAmp += (target - this.bobAmp) * Math.min(1, dt * 8);
      this.bobPhase += dt * (run ? 12 : 9) * this.bobAmp;
    }
  };
})(window.GAME);
