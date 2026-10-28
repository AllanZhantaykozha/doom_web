// Процедурная генерация текстур 64x64. Ассетов нет: всё рисуется функциями с шумом.
// Каждая текстура «запекается» в LIGHT_LEVELS версий разной яркости, поэтому в
// горячем цикле рендера не нужно умножать цвет — только выбрать массив и прочитать пиксель.
(function (G) {
  'use strict';

  const SIZE = 64;
  const LIGHT_LEVELS = 32;
  const WALL_TYPES = 9;
  const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

  // Упаковка в 32 бита под порядок байт платформы (ImageData хранит RGBA побайтно).
  function pack(r, g, b) {
    return LITTLE_ENDIAN
      ? ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0
      : ((r << 24) | (g << 16) | (b << 8) | 255) >>> 0;
  }

  // Детерминированный хеш координат -> [0,1). Координаты оборачиваются по 64 — текстура тайлится.
  function hash(x, y, seed) {
    let h = (Math.imul(x & 63, 374761393) + Math.imul(y & 63, 668265263) + Math.imul(seed, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  // Билинейный value-noise с периодом SIZE/cell (тайлится). cellX/cellY — размер ячейки в пикселях,
  // разные значения дают вытянутый шум (волокна дерева, потёки).
  function vnoise(x, y, cellX, cellY, seed) {
    const gx = x / cellX, gy = y / cellY;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    let fx = gx - x0, fy = gy - y0;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const px = SIZE / cellX, py = SIZE / cellY;           // период в ячейках
    const xa = ((x0 % px) + px) % px, xb = (xa + 1) % px;
    const ya = ((y0 % py) + py) % py, yb = (ya + 1) % py;
    const a = hash(xa * 7, ya * 13, seed), b = hash(xb * 7, ya * 13, seed);
    const c = hash(xa * 7, yb * 13, seed), d = hash(xb * 7, yb * 13, seed);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  }

  // ---- Генераторы: (x, y, out) записывают в out[0..2] цвет r,g,b (0..255) ----

  function setRGB(o, r, g, b) {
    o[0] = r < 0 ? 0 : r > 255 ? 255 : r;
    o[1] = g < 0 ? 0 : g > 255 ? 255 : g;
    o[2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }

  // 1. Кирпичная кладка: 4 ряда по 16 px, кирпич 32 px, ряды смещены.
  function genBrick(x, y, o) {
    const row = y >> 4;
    const bx = (x + ((row & 1) ? 16 : 0)) & 63;
    const lx = bx & 31, ly = y & 15;
    const n = hash(x, y, 11);
    if (ly < 2 || lx < 2) {                       // раствор
      const v = 100 + n * 30;
      setRGB(o, v, v * 0.95, v * 0.88);
      return;
    }
    const id = hash(bx >> 5, row, 12);            // индивидуальный тон кирпича
    let k = (0.7 + id * 0.45) * (0.88 + n * 0.24);
    if (ly < 4 || lx < 4) k *= 1.12;              // фаска сверху/слева
    if (ly > 13 || lx > 29) k *= 0.82;            // тень снизу/справа
    setRGB(o, 165 * k, 62 * k, 48 * k);
  }

  // 2. Каменные блоки 32x32 с фаской.
  function genStone(x, y, o) {
    const lx = x & 31, ly = y & 31;
    const n = hash(x, y, 21) * 0.5 + vnoise(x, y, 8, 8, 22) * 0.5;
    let k = 0.65 + n * 0.5;
    if (lx === 0 || ly === 0) k = 0.35;           // шов
    else if (lx < 3 || ly < 3) k *= 1.18;
    else if (lx > 29 || ly > 29) k *= 0.8;
    const blk = hash(x >> 5, y >> 5, 23);
    k *= 0.9 + blk * 0.2;
    setRGB(o, 128 * k, 128 * k, 136 * k);
  }

  // 3. Замшелый камень: серо-зелёный фон, вертикальные потёки слизи.
  function genMoss(x, y, o) {
    const lx = x & 31, ly = y & 31;
    const n = hash(x, y, 31) * 0.4 + vnoise(x, y, 6, 6, 32) * 0.6;
    let k = 0.6 + n * 0.5;
    if (lx === 0 || ly === 0) k = 0.3;
    const drip = vnoise(x, y, 4, 24, 33);         // вытянутый по Y шум = потёки
    const m = Math.max(0, Math.min(1, (drip - 0.4) * 3));
    setRGB(o, (95 * k) * (1 - m) + 50 * k * m,
              (105 * k) * (1 - m) + 170 * k * m,
              (92 * k) * (1 - m) + 55 * k * m);
  }

  // 4. Металлические панели 32x32: заклёпки, шов, вентиляционная прорезь, «царапины».
  function genMetal(x, y, o) {
    const lx = x & 31, ly = y & 31;
    const scratch = hash(0, y, 41) * 0.12 + hash(x, y, 42) * 0.08;   // горизонтальная шлифовка
    let k = 0.78 + scratch;
    if (lx === 0 || ly === 0 || lx === 31 || ly === 31) k = 0.35;
    else if (lx === 1 || ly === 1) k *= 1.2;
    else if (lx === 30 || ly === 30) k *= 0.75;
    // Заклёпки в углах панели
    const rx = Math.min(lx, 31 - lx), ry = Math.min(ly, 31 - ly);
    const d2 = (rx - 4) * (rx - 4) + (ry - 4) * (ry - 4);
    if (d2 < 5) k = d2 < 2 ? 1.35 : 0.55;
    // Прорезь в панелях через одну
    if ((((x >> 5) + (y >> 5)) & 1) === 0 && lx > 8 && lx < 23 && ly > 13 && ly < 18) {
      k = (ly === 14 || ly === 17) ? 0.55 : 0.18;
    }
    setRGB(o, 95 * k, 108 * k, 125 * k);
  }

  // 5. Вертикальные доски по 16 px с волокнами.
  function genWood(x, y, o) {
    const lx = x & 15;
    const plank = x >> 4;
    const grain = vnoise(x + plank * 9, y, 3, 20, 51);
    const ring = Math.sin((x + plank * 5) * 0.9 + grain * 6) * 0.5 + 0.5;
    let k = 0.62 + grain * 0.35 + ring * 0.12;
    k *= 0.88 + hash(plank, 0, 52) * 0.25;        // тон доски
    if (lx === 0 || lx === 15) k *= 0.35;         // щель
    else if (lx === 1) k *= 1.1;
    // Сучок
    const kx = 40 - x, ky = 22 - y;
    if (kx * kx + ky * ky < 20) k *= 0.55;
    setRGB(o, 150 * k, 100 * k, 55 * k);
  }

  // 6. Бирюзовая плитка 16x16 с золотой эмблемой в центре тайла.
  function genRune(x, y, o) {
    const lx = x & 15, ly = y & 15;
    const n = hash(x, y, 61) * 0.15 + vnoise(x, y, 8, 8, 62) * 0.2;
    let k = 0.7 + n;
    if (lx === 0 || ly === 0) k = 0.3;
    else if (lx === 1 || ly === 1) k *= 1.2;
    else if (lx === 15 || ly === 15) k *= 0.75;
    let r = 40 * k, g = 120 * k, b = 130 * k;
    const dx = x - 32, dy = y - 32;
    const d = Math.sqrt(dx * dx + dy * dy);
    const diamond = Math.abs(dx) + Math.abs(dy);
    if ((d > 17 && d < 20) || (diamond > 8 && diamond < 11)) {  // кольцо и ромб
      r = 230; g = 190; b = 70;
    }
    setRGB(o, r, g, b);
  }

  // Пол: каменные плиты 32x32, слегка тёплые.
  function genFloor(x, y, o) {
    const lx = x & 31, ly = y & 31;
    const n = hash(x, y, 71) * 0.3 + vnoise(x, y, 10, 10, 72) * 0.5;
    let k = 0.6 + n * 0.6;
    if (lx === 0 || ly === 0) k = 0.3;
    else if (lx === 1 || ly === 1) k *= 1.12;
    k *= 0.88 + hash(x >> 5, y >> 5, 73) * 0.24;  // оттенок плиты
    setRGB(o, 112 * k, 98 * k, 84 * k);
  }

  // Потолок: тёмные панели 32x32 с продольной вставкой.
  function genCeil(x, y, o) {
    const lx = x & 31, ly = y & 31;
    const n = hash(x, y, 81) * 0.15 + vnoise(x, y, 12, 12, 82) * 0.2;
    let k = 0.55 + n;
    if (lx === 0 || ly === 0) k = 0.25;
    else if (lx === 1 || ly === 1) k *= 1.15;
    if (lx > 10 && lx < 21 && ly > 12 && ly < 19) k *= 0.6;
    setRGB(o, 82 * k, 84 * k, 104 * k);
  }

  // ---- Синяя гамма (уровень «Синий сектор»): ледяные блоки, техно-панели, синий мрамор ----

  // 7. Ледяные блоки 32x16 со сдвигом рядов, инеем и трещинами.
  function genIce(x, y, o) {
    const row = y >> 4;
    const bx = (x + ((row & 1) ? 16 : 0)) & 63;
    const lx = bx & 31, ly = y & 15;
    const n = hash(x, y, 101) * 0.25 + vnoise(x, y, 8, 8, 102) * 0.5;
    let k = 0.72 + n * 0.6;
    const blk = hash(bx >> 5, row, 103);
    k *= 0.9 + blk * 0.2;
    if (ly < 1 || lx < 1) { setRGB(o, 60, 100, 150); return; }       // шов
    if (ly < 3 || lx < 3) k *= 1.15;
    else if (ly > 13 || lx > 29) k *= 0.8;
    let r = 150 * k, g = 205 * k, b = 245 * k;
    if (Math.abs(vnoise(x, y, 14, 14, 104) - 0.5) < 0.025) { r *= 0.55; g *= 0.65; b *= 0.8; }   // трещина
    if (hash(x, y, 105) > 0.95) { r = g = b = 240; }                                           // иней
    setRGB(o, r, g, b);
  }

  // 8. Синие техно-панели 32x32 с цианом светящимися линиями и «схемой».
  function genTech(x, y, o) {
    const lx = x & 31, ly = y & 31;
    let k = 0.7 + hash(x, y, 111) * 0.12 + vnoise(x, y, 8, 8, 112) * 0.2;
    let r = 22 * k, g = 44 * k, b = 90 * k;
    if (lx === 0 || ly === 0) { setRGB(o, 8, 16, 40); return; }
    if (lx === 1 || ly === 1) { r *= 1.5; g *= 1.5; b *= 1.4; }
    else if (lx === 31 || ly === 31) { r *= 0.6; g *= 0.6; b *= 0.7; }
    if ((lx === 8 || lx === 23) && ly > 3 && ly < 29) { r = 40; g = 120; b = 170; }           // дорожки схемы
    if (ly >= 15 && ly <= 17 && lx > 5 && lx < 26) {                                         // светящаяся полоса
      const e = ly === 16 ? 1 : 0.55;
      r = 70 * e + 20; g = 225 * e + 20; b = 255 * e;
    }
    if (((lx === 8 || lx === 23) && (ly === 4 || ly === 28))) { r = 120; g = 240; b = 255; } // узлы
    setRGB(o, r, g, b);
  }

  // 9. Синий мрамор плитками 32x32 с жилами.
  function genMarble(x, y, o) {
    const lx = x & 31, ly = y & 31;
    const warp = vnoise(x, y, 16, 16, 121) * 40;
    const vein = Math.abs(Math.sin((x + warp) * 0.22 + y * 0.12));
    let k = 0.65 + vnoise(x, y, 12, 12, 122) * 0.5 + hash(x, y, 123) * 0.06;
    let r = 35 * k, g = 70 * k, b = 140 * k;
    if (vein < 0.1) { r = 175; g = 205; b = 255; }
    else if (vein < 0.18) { r *= 1.5; g *= 1.4; b *= 1.25; }
    if (lx === 0 || ly === 0) { setRGB(o, 8, 14, 38); return; }
    if (lx < 3 || ly < 3) { r *= 1.2; g *= 1.2; b *= 1.15; }
    else if (lx > 29 || ly > 29) { r *= 0.75; g *= 0.75; b *= 0.8; }
    setRGB(o, r, g, b);
  }

  function genFloorBlue(x, y, o) {
    const lx = x & 31, ly = y & 31;
    const n = hash(x, y, 131) * 0.25 + vnoise(x, y, 10, 10, 132) * 0.5;
    let k = 0.6 + n * 0.6;
    if (lx === 0 || ly === 0) k = 0.3;
    else if (lx === 1 || ly === 1) k *= 1.15;
    k *= 0.9 + hash(x >> 5, y >> 5, 133) * 0.2;
    setRGB(o, 62 * k, 88 * k, 140 * k);
  }

  function genCeilBlue(x, y, o) {
    const lx = x & 31, ly = y & 31;
    const n = hash(x, y, 141) * 0.12 + vnoise(x, y, 12, 12, 142) * 0.15;
    let k = 0.5 + n;
    if (lx === 0 || ly === 0) k = 0.22;
    else if (lx === 1 || ly === 1) k *= 1.15;
    let r = 26 * k, g = 38 * k, b = 78 * k;
    if (lx > 11 && lx < 21 && ly > 5 && ly < 27) { r = 70; g = 190; b = 235; }     // светильник
    if (lx > 12 && lx < 20 && ly > 7 && ly < 25) { r = 190; g = 240; b = 255; }
    setRGB(o, r, g, b);
  }

  // Двери 64x64: металл, предупредительные полосы сверху/снизу, цветная пластина по центру.
  function makeDoorGen(ar, ag, ab) {
    return function (x, y, o) {
      let k = 0.72 + hash(x, y, 91) * 0.1 + hash(0, y, 92) * 0.08;
      if (x < 2 || x > 61) k = 0.3;
      else if (x < 4) k *= 1.15;
      else if (x > 59) k *= 0.8;
      let r = 100 * k, g = 108 * k, b = 118 * k;
      if (y === 9 || y === 54) {
        r = g = b = 30;
      } else if (y < 9 || y > 54) {                       // полосы «осторожно»
        const s = (((x + y) >> 3) & 1) === 0;
        r = s ? 210 * k : 35; g = s ? 175 * k : 35; b = s ? 40 * k : 35;
      } else if (x >= 10 && x <= 53 && y >= 16 && y <= 47) {   // вставка
        if (x === 10 || x === 53 || y === 16 || y === 47) { r = ar; g = ag; b = ab; }
        else { r *= 0.7; g *= 0.7; b *= 0.72; }
      }
      const dx = x - 32, dy = y - 32, d2 = dx * dx + dy * dy;
      if (y > 9 && y < 54 && d2 <= 64) {                  // цветная пластина
        const e = d2 > 49 ? 0.55 : 0.85 + 0.15 * k;
        r = ar * e; g = ag * e; b = ab * e;
      }
      setRGB(o, r, g, b);
    };
  }

  // Запекание: из генератора получаем LIGHT_LEVELS массивов Uint32Array(64*64).
  // colMajor=true: индекс = x*64 + y (удобно для чтения вдоль столбца стены);
  // иначе y*64 + x (удобно для пола/потолка).
  function bake(gen, colMajor) {
    const base = new Uint8Array(SIZE * SIZE * 3);
    const o = [0, 0, 0];
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        gen(x, y, o);
        const i = (colMajor ? x * SIZE + y : y * SIZE + x) * 3;
        base[i] = o[0]; base[i + 1] = o[1]; base[i + 2] = o[2];
      }
    }
    const levels = new Array(LIGHT_LEVELS);
    for (let l = 0; l < LIGHT_LEVELS; l++) {
      const f = l / (LIGHT_LEVELS - 1);
      const t = new Uint32Array(SIZE * SIZE);
      for (let i = 0; i < SIZE * SIZE; i++) {
        t[i] = pack((base[i * 3] * f) | 0, (base[i * 3 + 1] * f) | 0, (base[i * 3 + 2] * f) | 0);
      }
      levels[l] = t;
    }
    return levels;
  }

  G.Textures = {
    SIZE, LIGHT_LEVELS, WALL_TYPES, pack,
    doors: null,   // doors[0 обычная, 1 красная, 2 синяя, 3 жёлтая][lightLevel] (по столбцам)
    walls: null,   // walls[type 1..9][lightLevel] -> Uint32Array (по столбцам)
    floor: null,   // floor[lightLevel] -> Uint32Array (по строкам)
    ceil: null,

    init() {
      const gens = [null, genBrick, genStone, genMoss, genMetal, genWood, genRune, genIce, genTech, genMarble];
      this.walls = new Array(WALL_TYPES + 1);
      for (let t = 1; t <= WALL_TYPES; t++) this.walls[t] = bake(gens[t], true);
      this.doors = [
        bake(makeDoorGen(165, 175, 185), true),
        bake(makeDoorGen(230, 50, 40), true),
        bake(makeDoorGen(50, 90, 235), true),
        bake(makeDoorGen(235, 200, 50), true)
      ];
      // Темы пола и потолка по уровням (level.theme)
      this.themes = {
        default: { floor: bake(genFloor, false), ceil: bake(genCeil, false) },
        blue: { floor: bake(genFloorBlue, false), ceil: bake(genCeilBlue, false) }
      };
      this.setTheme('default');
    },

    setTheme(name) {
      const t = this.themes[name] || this.themes.default;
      this.floor = t.floor;
      this.ceil = t.ceil;
    },

    // Типы вне 1..9 отображаются на существующие циклически.
    wallSet(type) {
      return this.walls[((type - 1) % WALL_TYPES) + 1];
    }
  };
})(window.GAME);
