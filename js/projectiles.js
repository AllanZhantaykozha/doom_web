// Снаряды и эффекты (пул фиксированного размера — без аллокаций во время игры).
// Один пул для ракет, взрывов, пыли от попаданий и брызг крови; рендер читает его как список спрайтов.
(function (G) {
  'use strict';
  const CFG = G.CONFIG;
  const ROCKET = 0, EXPL = 1, PUFF = 2, BLOOD = 3, BOLT = 4;
  const POOL = 96;
  const FRAME_TIME = [0, 0.07, 0.07, 0.08];            // длительность кадра эффекта, с
  const EXPL_SIZES = [0.8, 1.1, 1.4, 1.6, 1.7, 1.6];

  const Projectiles = G.Projectiles = {
    ROCKET, EXPL, PUFF, BLOOD, BOLT,
    list: [],

    init() {
      for (let i = 0; i < POOL; i++) {
        this.list.push({ x: 0, y: 0, vx: 0, vy: 0, kind: 0, t: 0, tex: null, size: 0.3, z: 0.3, dmg: 0, active: false });
      }
    },

    reset() {
      for (let i = 0; i < this.list.length; i++) this.list[i].active = false;
    },

    alloc() {
      const l = this.list;
      for (let i = 0; i < l.length; i++) if (!l[i].active) return l[i];
      return null;                                     // пул переполнен — эффект пропускается
    },

    spawnRocket(x, y, angle, dmg) {
      const p = this.alloc();
      if (!p) return;
      p.active = true; p.kind = ROCKET; p.t = 0; p.dmg = dmg;
      p.x = x; p.y = y;
      p.vx = Math.cos(angle) * CFG.ROCKET.speed;
      p.vy = Math.sin(angle) * CFG.ROCKET.speed;
      p.tex = G.Sprites.fx.rocket; p.size = 0.3; p.z = 0.35;
    },

    // Кислотный снаряд врага: медленный, виден, от него можно уклониться
    spawnBolt(x, y, angle, speed, dmg) {
      const p = this.alloc();
      if (!p) return;
      p.active = true; p.kind = BOLT; p.t = 0; p.dmg = dmg;
      p.x = x; p.y = y;
      p.vx = Math.cos(angle) * speed; p.vy = Math.sin(angle) * speed;
      p.tex = G.Sprites.fx.bolt; p.size = 0.32; p.z = 0.3;
    },

    // Короткий эффект: пыль/кровь. z — высота центра над полом.
    effect(kind, x, y, z) {
      const p = this.alloc();
      if (!p) return;
      p.active = true; p.kind = kind; p.t = 0;
      p.x = x; p.y = y; p.vx = p.vy = 0;
      p.size = 0.3; p.z = z - 0.15;
      p.tex = kind === PUFF ? G.Sprites.fx.puff[0] : G.Sprites.fx.blood[0];
    },

    update(dt) {
      const l = this.list;
      for (let i = 0; i < l.length; i++) {
        const p = l[i];
        if (!p.active) continue;
        if (p.kind === ROCKET) this.updateRocket(p, dt);
        else if (p.kind === BOLT) this.updateBolt(p, dt);
        else this.updateEffect(p, dt);
      }
    },

    updateRocket(p, dt) {
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
      let hit = G.Map.isSolid(Math.floor(nx), Math.floor(ny));
      if (!hit) {
        const en = G.Enemies.list;
        for (let i = 0; i < en.length; i++) {
          const e = en[i];
          if (!e.alive) continue;
          const dx = e.x - nx, dy = e.y - ny, rr = e.radius + 0.1;
          if (dx * dx + dy * dy < rr * rr) { hit = true; break; }
        }
      }
      if (hit) {
        // Взрыв чуть позади точки удара: на самой плоскости стены глубина спрайта совпадает с
        // z-буфером, и из-за погрешности часть столбцов отсекалась бы (z-fighting).
        const k = 0.15 / CFG.ROCKET.speed;
        p.x -= p.vx * k; p.y -= p.vy * k;
        this.explode(p);
      } else { p.x = nx; p.y = ny; }
    },

    updateBolt(p, dt) {
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
      const P = G.Player, dx = P.x - nx, dy = P.y - ny, rr = CFG.PLAYER.radius + 0.15;
      if (!P.dead && dx * dx + dy * dy < rr * rr) {          // попадание в игрока
        P.damage(p.dmg, p.x - p.vx, p.y - p.vy);
        p.active = false;
        this.effect(PUFF, nx, ny, 0.3);
        return;
      }
      if (G.Map.isSolid(Math.floor(nx), Math.floor(ny))) {   // стена: брызги чуть перед ней
        p.active = false;
        this.effect(PUFF, p.x, p.y, 0.3);
        return;
      }
      p.x = nx; p.y = ny;
    },

    updateEffect(p, dt) {
      p.t += dt;
      const fx = G.Sprites.fx;
      const frames = p.kind === EXPL ? fx.expl : p.kind === PUFF ? fx.puff : fx.blood;
      const f = Math.floor(p.t / FRAME_TIME[p.kind]);
      if (f >= frames.length) { p.active = false; return; }
      p.tex = frames[f];
      if (p.kind === EXPL) p.size = EXPL_SIZES[f];
    },

    // Взрыв ракеты: урон по площади с линейным спадом, проверка видимости, отбрасывание.
    explode(p) {
      const R = CFG.ROCKET.radius, D = p.dmg;          // урон по врагам (с учётом сферы ярости)
      const ex = p.x, ey = p.y;
      p.kind = EXPL; p.t = 0; p.vx = p.vy = 0; p.z = 0.25;
      p.tex = G.Sprites.fx.expl[0]; p.size = EXPL_SIZES[0];

      const en = G.Enemies.list;
      for (let i = 0; i < en.length; i++) {
        const e = en[i];
        if (!e.alive) continue;
        const dx = e.x - ex, dy = e.y - ey;
        const dist = Math.hypot(dx, dy);
        const d = Math.max(0, dist - e.radius);
        if (d >= R) continue;
        if (dist > 0.01 && G.Map.castRay(ex, ey, dx / dist, dy / dist, dist) < dist - 0.05) continue;  // за стеной
        const k = 1 - d / R;
        G.Enemies.hurt(e, D * k);
        if (dist > 0.01) G.Enemies.push(e, dx / dist * CFG.ROCKET.pushEnemy * k, dy / dist * CFG.ROCKET.pushEnemy * k);
      }

      const P = G.Player;
      const dx = P.x - ex, dy = P.y - ey;
      const dist = Math.hypot(dx, dy);
      const d = Math.max(0, dist - CFG.PLAYER.radius);
      if (d < R && (dist < 0.01 || G.Map.castRay(ex, ey, dx / dist, dy / dist, dist) >= dist - 0.05)) {
        const k = 1 - d / R;
        P.damage(CFG.ROCKET.damage * k * CFG.ROCKET.selfScale, ex, ey);    // самоурон без усиления
        if (dist > 0.01) P.push(dx / dist * CFG.ROCKET.pushPlayer * k, dy / dist * CFG.ROCKET.pushPlayer * k);
      }
    }
  };
})(window.GAME);
