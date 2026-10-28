// Raycasting-рендер напрямую в Uint32Array (ImageData).
// Стены (DDA, текстуры, затенение), пол и потолок (floor casting), z-буфер.
(function (G) {
  'use strict';
  const C = G.CONFIG.RENDER;

  const Renderer = G.Renderer = {
    canvas: null, ctx: null,
    w: 0, h: 0,
    image: null, buf: null,
    zbuf: null,          // перпендикулярное расстояние до стены по столбцам (для спрайтов)
    camX: null,          // координата столбца в [-1, 1], предрасчёт
    rowDist: null,       // расстояние до пола на строке y (только y >= h/2)
    rowLevel: null,      // уровень яркости пола/потолка на строке y
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

      // Расстояние до пола на строке y. Камера на высоте 0.5, стена высотой 1 занимает
      // h/dist пикселей, поэтому точка пола на смещении p от горизонта лежит на
      // перпендикулярном расстоянии dist = 0.5*h / p.
      const half = h / 2, L = G.Textures.LIGHT_LEVELS - 1;
      this.rowDist = new Float32Array(h);
      this.rowLevel = new Uint8Array(h);
      for (let y = Math.ceil(half); y < h; y++) {
        const d = (0.5 * h) / (y + 0.5 - half);
        this.rowDist[y] = d;
        const f = Math.max(C.minLight, 1 - d / C.maxDist);
        this.rowLevel[y] = (f * L) | 0;
      }
    },

    render(px, py, angle) {
      const w = this.w, h = this.h, buf = this.buf, zbuf = this.zbuf, camX = this.camX;
      const M = G.Map, cells = M.cells, mw = M.w, mh = M.h;
      const T = G.Textures, L = T.LIGHT_LEVELS - 1;

      // Камера: dir — взгляд, plane — вектор «вправо» длиной tan(FOV/2).
      // Луч столбца = dir + plane*camX. Перпендикулярное расстояние до стены
      // (sideDist - delta) уже свободно от fish-eye, отдельная коррекция не нужна.
      const dirX = Math.cos(angle), dirY = Math.sin(angle);
      const planeX = -dirY * this.tanHalfFov, planeY = dirX * this.tanHalfFov;

      // 1. Пол и потолок. Для строки пола y мировая точка столбца x:
      //    P = pos + rowDist * (dir + plane*camX[x]) — линейна по x, идём с постоянным шагом.
      //    Потолок — зеркало: строка h-1-y использует те же текселы.
      const half = h >> 1;
      const floorSets = T.floor, ceilSets = T.ceil;
      for (let y = half; y < h; y++) {
        const rd = this.rowDist[y];
        const lvl = this.rowLevel[y];
        const ft = floorSets[lvl], ct = ceilSets[lvl];
        let fx = (px + rd * (dirX + planeX * camX[0])) * 64;
        let fy = (py + rd * (dirY + planeY * camX[0])) * 64;
        const sx = rd * planeX * (2 / w) * 64, sy = rd * planeY * (2 / w) * 64;
        let iF = y * w, iC = (h - 1 - y) * w;
        for (let x = 0; x < w; x++) {
          const ti = ((fy & 63) << 6) | (fx & 63);
          buf[iF++] = ft[ti];
          buf[iC++] = ct[ti];
          fx += sx; fy += sy;
        }
      }

      // 2. Стены (поверх пола/потолка)
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

        // Координата попадания вдоль грани стены -> столбец текстуры.
        // Отражаем так, чтобы текстура не была зеркальной с обратных сторон.
        let wallX = side === 0 ? py + dist * rayY : px + dist * rayX;
        wallX -= Math.floor(wallX);
        let texX = (wallX * 64) | 0;
        if ((side === 0 && rayX > 0) || (side === 1 && rayY < 0)) texX = 63 - texX;

        // Освещение: по расстоянию, стены вдоль Y темнее
        let f = 1 - dist / maxDist;
        if (f < minLight) f = minLight;
        if (side === 1) f *= sideShade;
        const tex = T.wallSet(type)[(f * L) | 0];

        const lineH = Math.floor(h / dist);
        const yTop = (h - lineH) * 0.5;               // экранная Y верха стены (может быть < 0)
        let y0 = Math.floor(yTop), y1 = y0 + lineH;
        if (y0 < 0) y0 = 0;
        if (y1 > h) y1 = h;

        const step = 64 / lineH;                       // шаг по текстуре на пиксель экрана
        let texPos = (y0 - yTop) * step;
        const base = texX << 6;
        for (let y = y0, i = y0 * w + x; y < y1; y++, i += w) {
          buf[i] = tex[base + ((texPos | 0) & 63)];
          texPos += step;
        }
      }

      this.ctx.putImageData(this.image, 0, 0);
    }
  };
})(window.GAME);
