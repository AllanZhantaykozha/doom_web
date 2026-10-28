// Цели на уровне. Этап 3: только манекен-мишень 't' (проверка урона, отбрасывания и взрывов).
// Интерфейс «врага» (hurt, push, radius, alive, active) — тот, на котором этап 4 построит настоящих врагов.
(function (G) {
  'use strict';
  const CFG = G.CONFIG;

  const DEFS = {
    t: { hp: 60, radius: 0.3, size: 0.9, z: 0 }
  };

  const Enemies = G.Enemies = {
    list: [],
    // Результат последнего hitscan (чтобы не создавать объект на каждый выстрел)
    hitEnemy: null,
    hitT: 0,

    has(ch) { return DEFS[ch] !== undefined; },
    reset() { this.list = []; },

    spawn(ch, x, y) {
      const def = DEFS[ch];
      const sp = G.Sprites.items;
      this.list.push({
        x, y, def,
        radius: def.radius, hp: def.hp,
        tex: sp.dummy, size: def.size, z: def.z,
        active: true,        // рисуется и обновляется
        alive: true,         // принимает урон и мешает движению
        hurtTimer: 0, deadTimer: 0,
        kx: 0, ky: 0         // скорость отбрасывания, клеток/с
      });
      G.Map.killsTotal++;
    },

    hurt(e, dmg) {
      if (!e.alive) return;
      e.hp -= dmg;
      e.hurtTimer = 0.15;
      e.tex = G.Sprites.items.dummyHurt;
      if (e.hp <= 0) {
        e.alive = false;
        e.deadTimer = 1.5;
        e.tex = G.Sprites.items.dummyDead;
        G.Map.killsFound++;
      }
    },

    push(e, vx, vy) {
      e.kx += vx;
      e.ky += vy;
    },

    // Круг (x, y, r) пересекает живого врага? Для коллизий игрока.
    blocked(x, y, r) {
      const list = this.list;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e.alive) continue;
        const dx = e.x - x, dy = e.y - y, rr = e.radius + r;
        if (dx * dx + dy * dy < rr * rr) return true;
      }
      return false;
    },

    update(dt) {
      const list = this.list;
      const fr = Math.max(0, 1 - CFG.KNOCK_FRICTION * dt);
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e.active) continue;
        if (e.hurtTimer > 0) {
          e.hurtTimer -= dt;
          if (e.hurtTimer <= 0 && e.alive) e.tex = G.Sprites.items.dummy;
        }
        if (!e.alive) {
          e.deadTimer -= dt;
          if (e.deadTimer <= 0) e.active = false;
          continue;
        }
        if (e.kx !== 0 || e.ky !== 0) {
          // Отбрасывание со скольжением вдоль стен
          const nx = e.x + e.kx * dt, ny = e.y + e.ky * dt;
          if (!G.Map.blocked(nx, e.y, e.radius)) e.x = nx; else e.kx = 0;
          if (!G.Map.blocked(e.x, ny, e.radius)) e.y = ny; else e.ky = 0;
          e.kx *= fr; e.ky *= fr;
          if (Math.abs(e.kx) < 0.01) e.kx = 0;
          if (Math.abs(e.ky) < 0.01) e.ky = 0;
        }
      }
    },

    // Выстрел-луч: стены ограничивают дальность, ближайший враг в луче получает урон.
    // Возвращает true, если попали во врага. Создаёт эффекты попадания.
    fireRay(px, py, angle, range, damage) {
      const dx = Math.cos(angle), dy = Math.sin(angle);
      const wallD = G.Map.castRay(px, py, dx, dy, range);
      let best = null, bestT = wallD;
      const list = this.list;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e.alive) continue;
        const rx = e.x - px, ry = e.y - py;
        const t = rx * dx + ry * dy;                       // проекция на луч
        if (t <= 0 || t >= bestT) continue;
        const perp = Math.abs(rx * dy - ry * dx);          // расстояние от центра до луча
        if (perp < e.radius) { best = e; bestT = t; }
      }
      if (best !== null) {
        this.hurt(best, damage);
        G.Projectiles.effect(G.Projectiles.BLOOD, px + dx * bestT, py + dy * bestT, 0.3);
        return true;
      }
      if (wallD < range) G.Projectiles.effect(G.Projectiles.PUFF, px + dx * (wallD - 0.06), py + dy * (wallD - 0.06), 0.3);
      return false;
    }
  };
})(window.GAME);
