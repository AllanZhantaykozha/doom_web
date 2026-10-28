// Враги: конечный автомат IDLE → ALERT → CHASE → ATTACK → PAIN → DEAD,
// обнаружение (луч зрения + шум выстрелов), поиск пути по общему BFS-потоку, расталкивание.
// Манекен 't' (ai:false) остаётся для проверок оружия.
(function (G) {
  'use strict';
  const CFG = G.CONFIG;
  const IDLE = 0, ALERT = 1, CHASE = 2, ATTACK = 3, PAIN = 4, DEAD = 5;
  const WALK_FRAME = 0.16;       // длительность кадра ходьбы, с
  const DEATH_FRAME = 0.13;
  const PAIN_TIME = 0.3;
  const FLOW_INTERVAL = 0.4;     // максимум раз в столько секунд пересчитываем поток при смене клетки игрока

  const Enemies = G.Enemies = {
    IDLE, ALERT, CHASE, ATTACK, PAIN, DEAD,
    list: [],

    // Буферы BFS-потока (расстояния от клетки игрока) и звуковой волны — выделяются при загрузке уровня
    flow: null, flowCell: -1, flowTimer: 0,
    queue: null, sound: null, noiseCool: 0,
    spawnAcc: 0,

    has(ch) { return CFG.ENEMIES[ch] !== undefined; },

    reset() {
      this.list = [];
      const n = G.Map.w * G.Map.h;
      if (!this.flow || this.flow.length !== n) {
        this.flow = new Int16Array(n);
        this.sound = new Int16Array(n);
        this.queue = new Int32Array(n);
      }
      this.flowCell = -1;
      this.flowTimer = 0;
      // Доля враждебных существ по сложности: накопитель распределяет пропуски равномерно
      this.spawnAcc = 1 - CFG.DIFFICULTY[CFG.difficulty].count;
    },

    spawn(ch, x, y) {
      const def = CFG.ENEMIES[ch];
      const D = CFG.DIFFICULTY[CFG.difficulty];
      if (def.ai) {
        this.spawnAcc += D.count;
        if (this.spawnAcc < 1) return;                 // этот враг пропущен сложностью
        this.spawnAcc -= 1;
      }
      const set = def.ai ? G.Sprites.enemies[def.sprite] : null;
      const hp = def.ai ? Math.round(def.hp * D.hp) : def.hp;
      this.list.push({
        x, y, def, set,
        radius: def.radius, hp, maxHp: hp,
        tex: def.ai ? set.walk[0] : G.Sprites.items.dummy, size: def.size, z: 0,
        active: true,        // рисуется и обновляется
        alive: true,         // принимает урон и мешает движению
        ai: def.ai,
        state: IDLE, stateTime: 0, think: Math.random() * 0.3, sees: false, sightTimer: Math.random() * 0.2,
        animTime: 0, moved: false, attackCool: 0, fired: false,
        hurtTimer: 0, deadTimer: 0,
        kx: 0, ky: 0         // скорость отбрасывания, клеток/с
      });
      if (def.ai) G.Map.killsTotal++;
    },

    // ---------- Урон, смерть ----------
    hurt(e, dmg) {
      if (!e.alive) return;
      e.hp -= dmg;
      if (!e.ai) {
        e.hurtTimer = 0.15;
        e.tex = G.Sprites.items.dummyHurt;
        if (e.hp <= 0) this.die(e);
        return;
      }
      if (e.hp <= 0) { this.die(e); return; }
      // Любое попадание будит врага; боль прерывает атаку с вероятностью painChance
      if (e.state === IDLE || e.state === ALERT) this.setState(e, CHASE);
      if (Math.random() < e.def.painChance && e.state !== PAIN) this.setState(e, PAIN);
    },

    die(e) {
      e.alive = false;
      G.Map.killsFound += e.ai ? 1 : 0;
      if (!e.ai) {
        e.deadTimer = 1.5;
        e.tex = G.Sprites.items.dummyDead;
        return;
      }
      this.setState(e, DEAD);
      if (e.def.drop) G.Items.spawn(e.def.drop, e.x, e.y, true);
    },

    push(e, vx, vy) {
      e.kx += vx;
      e.ky += vy;
    },

    setState(e, st) {
      e.state = st;
      e.stateTime = 0;
      e.fired = false;
    },

    // ---------- Запросы ----------
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

    // Стоит ли живой враг в клетке (cx, cy) — чтобы не закрыть дверь на нём
    occupies(cx, cy) {
      const list = this.list;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e.alive) continue;
        if (e.x > cx - e.radius && e.x < cx + 1 + e.radius && e.y > cy - e.radius && e.y < cy + 1 + e.radius) return true;
      }
      return false;
    },

    // Прямая видимость между точкой врага и игроком (луч по сетке; закрытая дверь — преграда)
    canSee(e) {
      const P = G.Player;
      const dx = P.x - e.x, dy = P.y - e.y;
      const dist = Math.hypot(dx, dy);
      if (dist > e.def.sight) return false;
      if (dist < 0.01) return true;
      return G.Map.castRay(e.x, e.y, dx / dist, dy / dist, dist) >= dist - 0.01;
    },

    // ---------- Шум ----------
    // Волна по клеткам (BFS) от источника на radius клеток; звук глушится закрытыми дверями и стенами.
    noise(x, y, radius) {
      if (this.noiseCool > 0) return;                  // не чаще ~6 раз/с: хватает, враги уже разбужены
      this.noiseCool = 0.15;
      const M = G.Map, w = M.w, dist = this.sound, q = this.queue;
      dist.fill(-1);
      const sx = Math.floor(x), sy = Math.floor(y);
      if (sx < 0 || sy < 0 || sx >= w || sy >= M.h) return;
      let head = 0, tail = 0;
      dist[sy * w + sx] = 0; q[tail++] = sy * w + sx;
      while (head < tail) {
        const i = q[head++], d = dist[i];
        if (d >= radius) continue;
        const cx = i % w, cy = (i / w) | 0;
        for (let k = 0; k < 4; k++) {
          const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
          if (!M.soundPassable(nx, ny)) continue;
          const ni = ny * w + nx;
          if (dist[ni] !== -1) continue;
          dist[ni] = d + 1; q[tail++] = ni;
        }
      }
      const list = this.list;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e.ai || !e.alive || e.state !== IDLE) continue;
        if (dist[Math.floor(e.y) * w + Math.floor(e.x)] !== -1) this.setState(e, ALERT);
      }
    },

    // ---------- Поиск пути ----------
    // Общий для всех врагов BFS-поток: расстояние (в клетках) от клетки игрока до каждой клетки.
    // Каждый враг просто идёт в соседнюю клетку с меньшим значением — путь не считается заново на каждого.
    updateFlow(dt) {
      this.flowTimer -= dt;
      const M = G.Map, P = G.Player, w = M.w;
      const cell = Math.floor(P.y) * w + Math.floor(P.x);
      if (cell === this.flowCell || this.flowTimer > 0) return;
      this.flowCell = cell;
      this.flowTimer = FLOW_INTERVAL;
      const flow = this.flow, q = this.queue;
      flow.fill(-1);
      let head = 0, tail = 0;
      flow[cell] = 0; q[tail++] = cell;
      while (head < tail) {
        const i = q[head++], d = flow[i];
        const cx = i % w, cy = (i / w) | 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx, ny = cy + dy;
            if (!M.enemyPassable(nx, ny)) continue;
            // По диагонали — только если обе соседние ортогональные клетки проходимы (нет срезания углов)
            if (dx !== 0 && dy !== 0 && (!M.enemyPassable(cx + dx, cy) || !M.enemyPassable(cx, cy + dy))) continue;
            const ni = ny * w + nx;
            if (flow[ni] !== -1) continue;
            flow[ni] = d + 1; q[tail++] = ni;
          }
        }
      }
    },

    // Следующая клетка пути для врага: сосед с наименьшим значением потока. Результат — в _nx/_ny.
    _nx: 0, _ny: 0,
    flowNext(e) {
      const M = G.Map, w = M.w;
      const cx = Math.floor(e.x), cy = Math.floor(e.y);
      const cur = this.flow[cy * w + cx];
      if (cur <= 0) return false;                      // уже в клетке игрока или вне потока
      let best = cur, bx = 0, by = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx, ny = cy + dy;
          if (!M.enemyPassable(nx, ny)) continue;
          if (dx !== 0 && dy !== 0 && (!M.enemyPassable(cx + dx, cy) || !M.enemyPassable(cx, cy + dy))) continue;
          const v = this.flow[ny * w + nx];
          if (v !== -1 && v < best) { best = v; bx = nx; by = ny; }
        }
      }
      if (best === cur) return false;
      this._nx = bx + 0.5; this._ny = by + 0.5;
      return true;
    },

    // ---------- Движение ----------
    // Шаг к точке со скольжением вдоль стен. Перед закрытой дверью просит её открыть и ждёт.
    moveToward(e, tx, ty, step) {
      const M = G.Map, P = G.Player;
      let dx = tx - e.x, dy = ty - e.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.001) return false;
      if (d < step) step = d;
      dx = dx / d * step; dy = dy / d * step;

      // Проба на шаг вперёд: если там дверь — открываем и стоим, пока не откроется
      const ux = dx / step, uy = dy / step;
      const px = e.x + ux * (e.radius + 0.25), py = e.y + uy * (e.radius + 0.25);
      if (!M.tryOpenDoor(Math.floor(px), Math.floor(py))) return false;

      let moved = false;
      const nx = e.x + dx, ny = e.y + dy, pr = CFG.PLAYER.radius;
      const nearP = (x, y) => (x - P.x) * (x - P.x) + (y - P.y) * (y - P.y) < (e.radius + pr) * (e.radius + pr);
      if (!M.blocked(nx, e.y, e.radius) && !nearP(nx, e.y)) { e.x = nx; moved = true; }
      if (!M.blocked(e.x, ny, e.radius) && !nearP(e.x, ny)) { e.y = ny; moved = true; }
      return moved;
    },

    // ---------- ИИ ----------
    updateAI(e, dt) {
      e.stateTime += dt;
      if (e.attackCool > 0) e.attackCool -= dt;
      e.moved = false;

      switch (e.state) {
        case IDLE:
          e.sightTimer -= dt;
          if (e.sightTimer <= 0) {
            e.sightTimer = 0.2 + Math.random() * 0.1;
            if (!G.Player.dead && this.canSee(e)) this.setState(e, ALERT);
          }
          break;
        case ALERT:
          if (e.stateTime >= e.def.reaction) this.setState(e, CHASE);
          break;
        case CHASE:
          this.chase(e, dt);
          break;
        case ATTACK:
          this.attack(e, dt);
          break;
        case PAIN:
          if (e.stateTime >= PAIN_TIME) this.setState(e, CHASE);
          break;
      }
      this.animate(e, dt);
    },

    chase(e, dt) {
      const P = G.Player, def = e.def, a = def.attack;
      if (P.dead) return;
      e.sightTimer -= dt;
      if (e.sightTimer <= 0) { e.sightTimer = 0.15; e.sees = this.canSee(e); }
      const dx = P.x - e.x, dy = P.y - e.y, dist = Math.hypot(dx, dy);

      // Решение об атаке: не чаще раза в think-интервал
      e.think -= dt;
      if (e.think <= 0) {
        e.think = 0.2 + Math.random() * 0.25;
        const reach = a.type === 'melee' ? e.radius + CFG.PLAYER.radius + 0.5 : a.range;
        if (e.attackCool <= 0 && dist <= reach && e.sees && Math.random() < def.attackChance) {
          this.setState(e, ATTACK);
          return;
        }
      }

      // Стрелки останавливаются на дистанции, пока видят игрока
      if (e.sees && dist < def.keepDist) return;

      const step = def.speed * dt;
      let moved;
      if (e.sees && dist < 6) moved = this.moveToward(e, P.x, P.y, step);          // прямая видимость — идём напрямую
      else if (this.flowNext(e)) moved = this.moveToward(e, this._nx, this._ny, step);
      else moved = this.moveToward(e, P.x, P.y, step);                             // вне потока — как получится
      e.moved = moved;
    },

    attack(e, dt) {
      const a = e.def.attack;
      if (!e.fired && e.stateTime >= a.windup) {
        e.fired = true;
        this.fire(e, a);
      }
      if (e.stateTime >= a.windup + a.recover) {
        e.attackCool = a.cooldown;
        this.setState(e, CHASE);
      }
    },

    fire(e, a) {
      const P = G.Player, D = CFG.DIFFICULTY[CFG.difficulty];
      if (P.dead) return;
      const dmg = (a.dmgMin + Math.floor(Math.random() * (a.dmgMax - a.dmgMin + 1))) * D.dmg;
      const dx = P.x - e.x, dy = P.y - e.y, dist = Math.hypot(dx, dy);

      if (a.type === 'melee') {
        if (dist <= e.radius + CFG.PLAYER.radius + 0.7) P.damage(dmg, e.x, e.y);
        return;
      }
      const base = Math.atan2(dy, dx);
      if (a.type === 'projectile') {
        G.Projectiles.spawnBolt(e.x, e.y, base, a.speed, dmg);
        return;
      }
      // Хитскан: луч с разбросом; попадание, если луч доходит до круга игрока раньше стены
      const ang = base + (Math.random() * 2 - 1) * a.spread;
      const ux = Math.cos(ang), uy = Math.sin(ang);
      const wallD = G.Map.castRay(e.x, e.y, ux, uy, a.range);
      const t = dx * ux + dy * uy;
      const perp = Math.abs(dx * uy - dy * ux);
      if (t > 0 && t < wallD && perp < CFG.PLAYER.radius + 0.1) P.damage(dmg, e.x, e.y);
      else if (wallD < a.range) G.Projectiles.effect(G.Projectiles.PUFF, e.x + ux * (wallD - 0.06), e.y + uy * (wallD - 0.06), 0.3);
    },

    // Выбор кадра по состоянию
    animate(e, dt) {
      const set = e.set;
      switch (e.state) {
        case ATTACK: e.tex = set.atk[e.fired ? 1 : 0]; break;
        case PAIN: e.tex = set.pain; break;
        case DEAD: {
          const f = Math.min(4, Math.floor(e.stateTime / DEATH_FRAME));
          e.tex = set.death[f];
          break;
        }
        default:
          if (e.moved) e.animTime += dt;
          e.tex = set.walk[Math.floor(e.animTime / WALK_FRAME) % 4];
      }
    },

    update(dt) {
      if (this.noiseCool > 0) this.noiseCool -= dt;
      const list = this.list;
      const fr = Math.max(0, 1 - CFG.KNOCK_FRICTION * dt);
      let anyAI = false;

      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e.active) continue;

        if (e.ai) {
          anyAI = true;
          if (e.state === DEAD) { e.stateTime += dt; this.animate(e, dt); }
          else if (e.alive) this.updateAI(e, dt);
        } else {
          // Манекен: таймеры мигания и исчезновения
          if (e.hurtTimer > 0) {
            e.hurtTimer -= dt;
            if (e.hurtTimer <= 0 && e.alive) e.tex = G.Sprites.items.dummy;
          }
          if (!e.alive) {
            e.deadTimer -= dt;
            if (e.deadTimer <= 0) e.active = false;
            continue;
          }
        }

        if (e.alive && (e.kx !== 0 || e.ky !== 0)) {
          // Отбрасывание со скольжением вдоль стен
          const nx = e.x + e.kx * dt, ny = e.y + e.ky * dt;
          if (!G.Map.blocked(nx, e.y, e.radius)) e.x = nx; else e.kx = 0;
          if (!G.Map.blocked(e.x, ny, e.radius)) e.y = ny; else e.ky = 0;
          e.kx *= fr; e.ky *= fr;
          if (Math.abs(e.kx) < 0.01) e.kx = 0;
          if (Math.abs(e.ky) < 0.01) e.ky = 0;
        }
      }

      if (anyAI) {
        this.updateFlow(dt);
        this.separate();
      }
    },

    // Расталкивание: пересекающиеся живые враги раздвигаются на половину перекрытия каждый
    separate() {
      const list = this.list, M = G.Map;
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (!a.alive || !a.ai) continue;
        for (let j = i + 1; j < list.length; j++) {
          const b = list[j];
          if (!b.alive) continue;
          const dx = b.x - a.x, dy = b.y - a.y, rr = a.radius + b.radius;
          const d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr) continue;
          let d = Math.sqrt(d2), ux, uy;
          if (d < 0.001) { d = 0.001; ux = Math.cos(i * 2.4 + j); uy = Math.sin(i * 2.4 + j); }   // совпали точно — разводим в детерминированную сторону
          else { ux = dx / d; uy = dy / d; }
          const push = (rr - d) * 0.5;
          if (!M.blocked(a.x - ux * push, a.y - uy * push, a.radius)) { a.x -= ux * push; a.y -= uy * push; }
          if (b.ai && !M.blocked(b.x + ux * push, b.y + uy * push, b.radius)) { b.x += ux * push; b.y += uy * push; }
        }
      }
    },

    // Выстрел-луч игрока: стены ограничивают дальность, ближайший враг в луче получает урон.
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
