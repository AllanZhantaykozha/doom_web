// Raycasting-рендер напрямую в Uint32Array (ImageData).
// Этап 0: стены без текстур (плоский цвет), пол/потолок — градиент по строкам.
(function (G) {
  'use strict';
  const C = G.CONFIG.RENDER;

  // Базовые цвета стен по типу 1..9 (r, g, b)
  const WALL_RGB = [
    null,
    [150, 60, 55],   // 1
    [70, 110, 160],  // 2
    [80, 140, 80],   // 3
    [160, 140, 70],  // 4
    [130, 80, 150],  // 5
    [60, 140, 140],  // 6
    [150, 150, 150], // 7
    [140, 100, 60],  // 8
    [100, 100, 120]  // 9
  ];
  const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

  // Упаковка в 32 бита под порядок байт платформы (ImageData хранит RGBA побайтно).
  function pack(r, g, b) {
    return LITTLE_ENDIAN
      ? ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0
      : ((r << 24) | (g << 16) | (b << 8) | 255) >>> 0;
  }

  const Renderer = G.Renderer = {
    canvas: null, ctx: null,
    w: 0, h: 0,
    image: null, buf: null,
    zbuf: null,          // перпендикулярное расстояние до стены по столбцам (для спрайтов)
    camX: null,          // координата столбца в [-1, 1], предрасчёт
    rowColor: null,      // цвет пола/потолка для каждой строки
    tanHalfFov: 0,
    spritesDrawn: 0,     // для отладочного оверлея

    init(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.setFov(C.fovDeg);
      this.setResolution(C.width, C.height);
    },

    setFov(deg) {
      this.tanHalfFov = Math.tan(deg * Math.PI / 360);
    },

    setResolution(w, h) {
      this.w = w;
      this.h = h;
      this.canvas.width = w;
      this.canvas.height = h;
      this.image = this.ctx.createImageData(w, h);
      this.buf = new Uint32Array(this.image.data.buffer);
      this.zbuf = new Float32Array(w);
      this.camX = new Float32Array(w);
      for (let x = 0; x < w; x++) this.camX[x] = 2 * (x + 0.5) / w - 1;

      // Цвет строки: расстояние до точки пола на строке y (камера на высоте 0.5,
      // стена высотой 1 занимает h/dist пикселей):  dist = 0.5*h / |y - h/2|.
      // Яркость падает с расстоянием, так что у горизонта темнее.
      this.rowColor = new Uint32Array(h);
      const half = h / 2;
      for (let y = 0; y < h; y++) {
        const p = Math.abs(y + 0.5 - half);
        const dist = (0.5 * h) / p;
        const f = Math.max(C.minLight, 1 - dist / C.maxDist);
        const base = y < half ? [70, 70, 90] : [75, 62, 50];  // потолок / пол
        this.rowColor[y] = pack((base[0] * f) | 0, (base[1] * f) | 0, (base[2] * f) | 0);
      }
    },

    render(px, py, angle) {
      const w = this.w, h = this.h, buf = this.buf, zbuf = this.zbuf, camX = this.camX;
      const M = G.Map, cells = M.cells, mw = M.w, mh = M.h;

      // 1. Фон: пол и потолок построчно (нативный fill быстрее цикла)
      for (let y = 0; y < h; y++) buf.fill(this.rowColor[y], y * w, (y + 1) * w);

      // Камера: dir — взгляд, plane — вектор «вправо» длиной tan(FOV/2).
      // Луч столбца = dir + plane*camX. Перпендикулярное расстояние до стены
      // (sideDist - delta) уже свободно от fish-eye, отдельная коррекция не нужна.
      const dirX = Math.cos(angle), dirY = Math.sin(angle);
      const planeX = -dirY * this.tanHalfFov, planeY = dirX * this.tanHalfFov;

      const maxDist = C.maxDist, minLight = C.minLight, sideShade = C.sideShadeY;

      for (let x = 0; x < w; x++) {
        const rayX = dirX + planeX * camX[x];
        const rayY = dirY + planeY * camX[x];

        let mapX = Math.floor(px), mapY = Math.floor(py);
        // Расстояние вдоль луча между соседними вертикальными/горизонтальными линиями сетки
        const deltaX = rayX === 0 ? 1e30 : Math.abs(1 / rayX);
        const deltaY = rayY === 0 ? 1e30 : Math.abs(1 / rayY);
        let stepX, stepY, sideX, sideY;
        if (rayX < 0) { stepX = -1; sideX = (px - mapX) * deltaX; }
        else { stepX = 1; sideX = (mapX + 1 - px) * deltaX; }
        if (rayY < 0) { stepY = -1; sideY = (py - mapY) * deltaY; }
        else { stepY = 1; sideY = (mapY + 1 - py) * deltaY; }

        let side = 0, type = 1;
        for (;;) {
          if (sideX < sideY) { sideX += deltaX; mapX += stepX; side = 0; }
          else { sideY += deltaY; mapY += stepY; side = 1; }
          if (mapX < 0 || mapY < 0 || mapX >= mw || mapY >= mh) { type = 1; break; }
          const t = cells[mapY * mw + mapX];
          if (t !== 0) { type = t; break; }
        }

        let dist = side === 0 ? sideX - deltaX : sideY - deltaY;
        if (dist < 0.0001) dist = 0.0001;
        zbuf[x] = dist;

        const lineH = Math.floor(h / dist);
        let y0 = (h - lineH) >> 1;
        let y1 = y0 + lineH;
        if (y0 < 0) y0 = 0;
        if (y1 > h) y1 = h;

        let f = 1 - dist / maxDist;
        if (f < minLight) f = minLight;
        if (side === 1) f *= sideShade;
        const rgb = WALL_RGB[type] || WALL_RGB[1];
        const col = pack((rgb[0] * f) | 0, (rgb[1] * f) | 0, (rgb[2] * f) | 0);

        for (let y = y0, i = y0 * w + x; y < y1; y++, i += w) buf[i] = col;
      }

      this.ctx.putImageData(this.image, 0, 0);
    }
  };
})(window.GAME);
