// Загрузка уровня из ASCII и запросы к сетке.
(function (G) {
  'use strict';

  const GameMap = G.Map = {
    w: 0,
    h: 0,
    cells: null,       // Uint8Array w*h: 0 — пусто, 1..9 — тип стены
    startX: 1.5,
    startY: 1.5,
    startAngle: 0,
    name: '',

    load(level) {
      const rows = level.rows;
      const h = rows.length;
      const w = rows[0].length;
      const cells = new Uint8Array(w * h);
      let found = false;

      for (let y = 0; y < h; y++) {
        if (rows[y].length !== w) {
          throw new Error('Уровень "' + level.name + '": строка ' + y + ' имеет длину ' +
            rows[y].length + ', ожидалось ' + w);
        }
        for (let x = 0; x < w; x++) {
          const ch = rows[y][x];
          if (ch >= '1' && ch <= '9') {
            cells[y * w + x] = ch.charCodeAt(0) - 48;
          } else if (ch === '@') {
            this.startX = x + 0.5;
            this.startY = y + 0.5;
            found = true;
          }
          // остальные символы — пустота
        }
      }
      if (!found) throw new Error('Уровень "' + level.name + '": нет стартовой точки @');

      this.w = w;
      this.h = h;
      this.cells = cells;
      this.name = level.name;
      this.startAngle = (level.startAngleDeg || 0) * Math.PI / 180;
    },

    // Клетки за пределами карты считаются сплошной стеной.
    isSolid(cx, cy) {
      if (cx < 0 || cy < 0 || cx >= this.w || cy >= this.h) return true;
      return this.cells[cy * this.w + cx] !== 0;
    },

    // Пересекается ли круг радиуса r с твёрдыми клетками (проверка углов bounding box).
    // Достаточно, пока r < 0.5 и шаг движения за тик меньше r.
    blocked(x, y, r) {
      return this.isSolid(Math.floor(x - r), Math.floor(y - r)) ||
             this.isSolid(Math.floor(x + r), Math.floor(y - r)) ||
             this.isSolid(Math.floor(x - r), Math.floor(y + r)) ||
             this.isSolid(Math.floor(x + r), Math.floor(y + r));
    }
  };
})(window.GAME);
