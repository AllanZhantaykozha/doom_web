// Загрузка уровня из ASCII, запросы к сетке, двери и секретные стены.
//
// Значения Map.cells: 0 — пусто, 1..9 — стена (тип), 10 — дверь/секретная стена (данные в Map.doors).
//
// Легенда ASCII:
//   1..9 стены · . пусто · @ старт · X выход
//   D дверь · R/B/Y красная/синяя/жёлтая дверь · S секретная стена
//   r/b/y ключи · h/H аптечки · a броня · c обойма · s патроны к дробовику · o ракета
//   w дробовик · W автомат · x ракетница · t манекен-мишень
(function (G) {
  'use strict';
  const DOOR = G.CONFIG.DOOR;
  const DOOR_CELL = 10;
  const DOOR_KEY = { D: 0, R: 1, B: 2, Y: 3 };
  const KEY_NAMES = ['', 'красный', 'синий', 'жёлтый'];

  // Состояния двери
  const CLOSED = 0, OPENING = 1, OPEN = 2, CLOSING = 3;

  const GameMap = G.Map = {
    w: 0, h: 0,
    cells: null,
    doorAt: null,        // Int16Array w*h: индекс в doors для клеток-дверей
    doors: [],
    startX: 1.5, startY: 1.5, startAngle: 0,
    name: '',
    itemsTotal: 0, itemsFound: 0,
    killsTotal: 0, killsFound: 0,
    seen: null,          // Uint8Array w*h: клетки, которые игрок уже видел (для мини-карты)
    secretsTotal: 0, secretsFound: 0,

    load(level) {
      const rows = level.rows;
      const h = rows.length, w = rows[0].length;
      const cells = new Uint8Array(w * h);
      const doorAt = new Int16Array(w * h).fill(-1);
      const specials = [];
      let found = false;

      this.doors = [];
      this.itemsTotal = this.itemsFound = this.secretsTotal = this.secretsFound = 0;
      this.killsTotal = this.killsFound = 0;
      G.Items.reset();
      G.Projectiles.reset();

      for (let y = 0; y < h; y++) {
        if (rows[y].length !== w) {
          throw new Error('Уровень "' + level.name + '": строка ' + y + ' имеет длину ' +
            rows[y].length + ', ожидалось ' + w);
        }
        for (let x = 0; x < w; x++) {
          const ch = rows[y][x];
          if (ch >= '1' && ch <= '9') cells[y * w + x] = ch.charCodeAt(0) - 48;
          else if (ch === '@') { this.startX = x + 0.5; this.startY = y + 0.5; found = true; }
          else if (DOOR_KEY[ch] !== undefined || ch === 'S') { cells[y * w + x] = DOOR_CELL; specials.push(x, y, ch); }
          else if (G.Items.has(ch) || G.Enemies.has(ch)) specials.push(x, y, ch);
          // прочие символы — пустота
        }
      }
      if (!found) throw new Error('Уровень "' + level.name + '": нет стартовой точки @');

      this.w = w; this.h = h; this.cells = cells; this.doorAt = doorAt;
      this.seen = new Uint8Array(w * h);
      G.Textures.setTheme(level.theme);          // цветовая гамма пола и потолка уровня
      this.name = level.name;
      this.startAngle = (level.startAngleDeg || 0) * Math.PI / 180;
      G.Enemies.reset();        // после установки размеров: буферы потока зависят от w*h

      // Вторым проходом, когда сетка стен уже известна, создаём двери и предметы.
      for (let i = 0; i < specials.length; i += 3) {
        const x = specials[i], y = specials[i + 1], ch = specials[i + 2];
        if (cells[y * w + x] === DOOR_CELL) this.addDoor(x, y, ch);
        else if (G.Enemies.has(ch)) G.Enemies.spawn(ch, x + 0.5, y + 0.5);
        else G.Items.spawn(ch, x + 0.5, y + 0.5);
      }
    },

    isWall(x, y) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
      const t = this.cells[y * this.w + x];
      return t >= 1 && t <= 9;
    },

    addDoor(x, y, ch) {
      const secret = ch === 'S';
      // Стены слева и справа -> панель вдоль X (проход с севера на юг), иначе вдоль Y.
      const alongX = this.isWall(x - 1, y) && this.isWall(x + 1, y);
      let tex = 1;
      if (secret) {   // секретная стена копирует вид соседней стены
        const n = [this.cellType(x - 1, y), this.cellType(x + 1, y), this.cellType(x, y - 1), this.cellType(x, y + 1)];
        for (let i = 0; i < 4; i++) if (n[i] >= 1 && n[i] <= 9) { tex = n[i]; break; }
        this.secretsTotal++;
      }
      const d = { x, y, alongX, secret, key: secret ? 0 : DOOR_KEY[ch], tex, open: 0, state: CLOSED, timer: 0 };
      this.doorAt[y * this.w + x] = this.doors.length;
      this.doors.push(d);
    },

    cellType(x, y) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
      return this.cells[y * this.w + x];
    },

    // Клетки за пределами карты — сплошная стена. Дверь проходима, когда достаточно открыта.
    isSolid(cx, cy) {
      if (cx < 0 || cy < 0 || cx >= this.w || cy >= this.h) return true;
      const i = cy * this.w + cx;
      const t = this.cells[i];
      if (t === 0) return false;
      if (t === DOOR_CELL) return this.doors[this.doorAt[i]].open < DOOR.passable;
      return true;
    },

    // Пересекается ли круг радиуса r с твёрдыми клетками (проверка углов bounding box).
    blocked(x, y, r) {
      return this.isSolid(Math.floor(x - r), Math.floor(y - r)) ||
             this.isSolid(Math.floor(x + r), Math.floor(y - r)) ||
             this.isSolid(Math.floor(x - r), Math.floor(y + r)) ||
             this.isSolid(Math.floor(x + r), Math.floor(y + r));
    },

    // Луч (dx, dy — единичный вектор) от точки до ближайшей твёрдой клетки.
    // Возвращает расстояние или maxDist, если препятствий нет. Без аллокаций.
    castRay(px, py, dx, dy, maxDist) {
      let mx = Math.floor(px), my = Math.floor(py);
      const ddx = dx === 0 ? 1e30 : Math.abs(1 / dx);
      const ddy = dy === 0 ? 1e30 : Math.abs(1 / dy);
      const stx = dx < 0 ? -1 : 1, sty = dy < 0 ? -1 : 1;
      let sx = dx < 0 ? (px - mx) * ddx : (mx + 1 - px) * ddx;
      let sy = dy < 0 ? (py - my) * ddy : (my + 1 - py) * ddy;
      for (;;) {
        let d;
        if (sx < sy) { d = sx; sx += ddx; mx += stx; }
        else { d = sy; sy += ddy; my += sty; }
        if (d >= maxDist) return maxDist;
        if (this.isSolid(mx, my)) return d;
      }
    },

    // Стоит ли в клетке двери игрок или враг (тогда её нельзя закрывать)
    occupied(d, px, py) {
      const r = G.CONFIG.PLAYER.radius + 0.05;
      if (px > d.x - r && px < d.x + 1 + r && py > d.y - r && py < d.y + 1 + r) return true;
      return G.Enemies.occupies(d.x, d.y);
    },

    // Проходима ли клетка для врагов при построении пути: пусто или дверь без ключа
    // (враги открывают обычные двери, но не цветные и не секретные).
    enemyPassable(cx, cy) {
      if (cx < 0 || cy < 0 || cx >= this.w || cy >= this.h) return false;
      const i = cy * this.w + cx, t = this.cells[i];
      if (t === 0) return true;
      if (t !== DOOR_CELL) return false;
      const d = this.doors[this.doorAt[i]];
      return d.key === 0 && !d.secret;
    },

    // Звук проходит через открытые клетки и приоткрытые двери; закрытая дверь его глушит
    soundPassable(cx, cy) {
      if (cx < 0 || cy < 0 || cx >= this.w || cy >= this.h) return false;
      const i = cy * this.w + cx, t = this.cells[i];
      if (t === 0) return true;
      return t === DOOR_CELL && this.doors[this.doorAt[i]].open >= 0.3;
    },

    // Враг просит открыть дверь в клетке. Возвращает true, если проход уже свободен.
    tryOpenDoor(cx, cy) {
      const i = cy * this.w + cx;
      if (this.cells[i] !== DOOR_CELL) return true;
      const d = this.doors[this.doorAt[i]];
      if (d.key !== 0 || d.secret) return false;
      if (d.state === CLOSED || d.state === CLOSING) { d.state = OPENING; G.Audio.play('dooropen', d.x + 0.5, d.y + 0.5); }
      return d.open >= DOOR.passable;
    },

    // Один тик анимации дверей
    update(dt, px, py) {
      const doors = this.doors;
      for (let i = 0; i < doors.length; i++) {
        const d = doors[i];
        switch (d.state) {
          case OPENING:
            d.open += dt * DOOR.speed;
            if (d.open >= 1) {
              d.open = 1;
              d.state = OPEN;
              d.timer = DOOR.stay;
              // Секретная стена освободила клетку насовсем
              if (d.secret) this.cells[d.y * this.w + d.x] = 0;
            }
            break;
          case OPEN:
            if (d.secret) break;
            d.timer -= dt;
            if (d.timer <= 0) {
              if (this.occupied(d, px, py)) d.timer = 0.5;   // не закрываемся на игроке
              else { d.state = CLOSING; G.Audio.play('doorclose', d.x + 0.5, d.y + 0.5); }
            }
            break;
          case CLOSING:
            d.open -= dt * DOOR.speed;
            if (this.occupied(d, px, py) && d.open < 0.95) { d.state = OPENING; break; }
            if (d.open <= 0) { d.open = 0; d.state = CLOSED; }
            break;
        }
      }
    },

    // Действие «использовать»: луч от игрока вперёд, до первой стены или двери.
    // Возвращает текст сообщения или null.
    use(px, py, angle, player) {
      const c = Math.cos(angle), s = Math.sin(angle);
      const steps = Math.round(G.CONFIG.USE_REACH / 0.1);   // целочисленный счётчик: без накопления погрешности
      for (let i = 2; i <= steps; i++) {
        const t = i * 0.1;
        const cx = Math.floor(px + c * t), cy = Math.floor(py + s * t);
        if (cx < 0 || cy < 0 || cx >= this.w || cy >= this.h) return null;
        const v = this.cells[cy * this.w + cx];
        if (v === 0) continue;
        if (v !== DOOR_CELL) return null;                  // обычная стена закрывает обзор

        const d = this.doors[this.doorAt[cy * this.w + cx]];
        if (d.key > 0 && !player.keys[d.key]) return 'Нужен ' + KEY_NAMES[d.key] + ' ключ';
        if (d.state === CLOSED || d.state === CLOSING) {
          if (d.state === CLOSED && d.secret) { this.secretsFound++; G.Audio.play('secret'); }
          d.state = OPENING;
          G.Audio.play('dooropen', d.x + 0.5, d.y + 0.5);
        } else if (d.state === OPEN && !d.secret && !this.occupied(d, px, py)) {
          d.state = CLOSING;
          G.Audio.play('doorclose', d.x + 0.5, d.y + 0.5);
        }
        return null;
      }
      return null;
    }
  };
})(window.GAME);
