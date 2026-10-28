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
    rowF: null,          // базовая яркость пола/потолка на строке y
    vh: 0,               // высота 3D-вида (без нижней панели)
    scale: 1,            // h / 200 — масштаб относительно базового разрешения
    tanHalfFov: 0,
    spritesDrawn: 0,     // для отладочного оверлея
    // Предвыделенные буферы списка спрайтов кадра (без аллокаций в горячем цикле)
    SPRITE_CAP: 512,
    // Источники спрайтов: геттеры (списки пересоздаются при загрузке уровня)
    sources: [() => G.Items.list, () => G.Enemies.list, () => G.Projectiles.list],
    sRef: new Array(512).fill(null),
    sDepth: new Float32Array(512),
    sTx: new Float32Array(512),

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
      this.scale = h / 200;
      const barH = Math.round(32 * this.scale);
      this.vh = h - barH;                              // 3D-вид занимает всё над панелью
      this.canvas.width = w;
      this.canvas.height = h;
      this.ctx.imageSmoothingEnabled = false;          // смена размера canvas сбрасывает состояние контекста
      this.image = this.ctx.createImageData(w, h);
      this.buf = new Uint32Array(this.image.data.buffer);
      this.zbuf = new Float32Array(w);
      this.camX = new Float32Array(w);
      for (let x = 0; x < w; x++) this.camX[x] = 2 * (x + 0.5) / w - 1;

      // Расстояние до пола на строке y. Камера на высоте 0.5, стена высотой 1 занимает
      // vh/dist пикселей, поэтому точка пола на смещении p от горизонта лежит на
      // перпендикулярном расстоянии dist = 0.5*vh / p.
      const vh = this.vh, half = vh / 2;
      this.rowDist = new Float32Array(vh);
      this.rowF = new Float32Array(vh);
      for (let y = Math.ceil(half); y < vh; y++) {
        const d = (0.5 * vh) / (y + 0.5 - half);
        this.rowDist[y] = d;
        this.rowF[y] = Math.max(C.minLight, 1 - d / C.maxDist);
      }
      G.Hud.resize(w, barH, this.scale);
    },

    render(px, py, angle) {
      const w = this.w, h = this.vh, buf = this.buf, zbuf = this.zbuf, camX = this.camX;
      const boost = G.Player.flash;                    // вспышка выстрела подсвечивает ближние поверхности
      const M = G.Map, cells = M.cells, mw = M.w, mh = M.h, doors = M.doors, doorAt = M.doorAt;
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
        let ff = this.rowF[y];
        if (boost > 0 && rd < 12) { ff += boost * 0.6 * (1 - rd / 12); if (ff > 1) ff = 1; }
        const lvl = (ff * L) | 0;
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
        let door = null, doorDist = 0, doorU = 0;
        for (;;) {
          if (sideX < sideY) { sideX += deltaX; mapX += stepX; side = 0; }
          else { sideY += deltaY; mapY += stepY; side = 1; }
          if (mapX < 0 || mapY < 0 || mapX >= mw || mapY >= mh) { type = 1; break; }
          const ci = mapY * mw + mapX;
          const t = cells[ci];
          if (t === 0) continue;
          if (t !== 10) { type = t; break; }

          // Клетка двери или секретной стены
          const d = doors[doorAt[ci]];
          if (d.secret) {
            // Полноклеточный блок, съезжающий вбок вдоль d.alongX. Грань, перпендикулярная
            // направлению съезда, видна со сдвигом d.open; торцевая грань не рисуется (упрощение).
            const e = side === 0 ? sideX - deltaX : sideY - deltaY;   // расстояние до входа в клетку
            const slideFace = d.alongX ? side === 1 : side === 0;
            if (slideFace) {
              const u = d.alongX ? px + e * rayX - mapX : py + e * rayY - mapY;
              if (u < d.open) continue;                               // луч идёт в образовавшийся зазор
              doorU = u - d.open;
            } else {
              if (d.open > 0.001) continue;
              doorU = d.alongX ? py + e * rayY - mapY : px + e * rayX - mapX;
            }
            doorDist = e;
          } else if (d.alongX) {
            // Тонкая панель на линии y = mapY+0.5, сдвигается вдоль +X
            if (rayY === 0) continue;
            const tt = (mapY + 0.5 - py) / rayY;
            if (tt <= 0) continue;
            const u = px + tt * rayX - mapX;
            if (u < 0 || u >= 1 || u < d.open) continue;
            doorDist = tt; doorU = u - d.open; side = 1;
          } else {
            // Тонкая панель на линии x = mapX+0.5, сдвигается вдоль +Y
            if (rayX === 0) continue;
            const tt = (mapX + 0.5 - px) / rayX;
            if (tt <= 0) continue;
            const u = py + tt * rayY - mapY;
            if (u < 0 || u >= 1 || u < d.open) continue;
            doorDist = tt; doorU = u - d.open; side = 0;
          }
          door = d;
          break;
        }

        let dist, texX, texSet;
        if (door !== null) {
          dist = doorDist;
          texX = (doorU * 64) | 0;
          if (texX > 63) texX = 63; else if (texX < 0) texX = 0;
          texSet = door.secret ? T.wallSet(door.tex) : T.doors[door.key];
        } else {
          dist = side === 0 ? sideX - deltaX : sideY - deltaY;
          // Координата попадания вдоль грани стены -> столбец текстуры.
          // Отражаем так, чтобы текстура не была зеркальной с обратных сторон.
          let wallX = side === 0 ? py + dist * rayY : px + dist * rayX;
          wallX -= Math.floor(wallX);
          texX = (wallX * 64) | 0;
          if ((side === 0 && rayX > 0) || (side === 1 && rayY < 0)) texX = 63 - texX;
          texSet = T.wallSet(type);
        }
        if (dist < 0.0001) dist = 0.0001;
        zbuf[x] = dist;

        // Освещение: по расстоянию, стены вдоль Y темнее
        let f = 1 - dist / maxDist;
        if (f < minLight) f = minLight;
        if (boost > 0 && dist < 12) f += boost * 0.6 * (1 - dist / 12);
        if (side === 1) f *= sideShade;
        if (f > 1) f = 1;
        const tex = texSet[(f * L) | 0];

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

      this.drawSprites(px, py, dirX, dirY, planeX, planeY);
      const ctx = this.ctx;
      ctx.putImageData(this.image, 0, 0, 0, 0, w, h);   // только область 3D-вида
      this.drawWeapon();
      this.drawOverlays();
      G.Hud.update();
      ctx.drawImage(G.Hud.canvas, 0, h);
    },

    // Оружие внизу вида: целочисленный масштаб, покачивание при ходьбе, опускание при смене
    drawWeapon() {
      const P = G.Player;
      if (P.dead) return;
      const spr = G.Sprites.weapons[P.weapon][P.wFrame];
      const sc = this.scale, size = 64 * G.CONFIG.WEAPON_SCALE * sc;
      const bx = Math.sin(P.bobPhase) * 6 * P.bobAmp * sc;
      const by = Math.abs(Math.cos(P.bobPhase)) * 5 * P.bobAmp * sc;
      const x = Math.round(this.w / 2 - size / 2 + bx);
      const y = Math.round(this.vh - size + 4 * sc + by + P.wLower * size);
      this.ctx.drawImage(spr, x, y, size, size);
    },

    // Экранные эффекты: красная вспышка при уроне, жёлтая при подборе, затемнение при смерти
    drawOverlays() {
      const P = G.Player, ctx = this.ctx, w = this.w, vh = this.vh;
      if (P.hurtFlash > 0) {
        ctx.globalAlpha = Math.min(0.6, P.hurtFlash * 0.6);
        ctx.fillStyle = '#d01010'; ctx.fillRect(0, 0, w, vh);
      }
      if (P.pickupFlash > 0) {
        ctx.globalAlpha = Math.min(0.35, P.pickupFlash * 0.5);
        ctx.fillStyle = '#f0d040'; ctx.fillRect(0, 0, w, vh);
      }
      if (P.dead) {
        ctx.globalAlpha = Math.min(0.85, P.deathTime * 0.5);
        ctx.fillStyle = '#300000'; ctx.fillRect(0, 0, w, vh);
      }
      ctx.globalAlpha = 1;
    },

    // Спрайты: проекция в пространство камеры, сортировка от дальних к ближним,
    // построчная отрисовка столбцами с обрезкой по z-буферу стен.
    // Источник — любой объект с полями x, y, tex (Uint32Array 64x64 по столбцам), size, z, active.
    drawSprites(px, py, dirX, dirY, planeX, planeY) {
      const w = this.w, h = this.vh, buf = this.buf, zbuf = this.zbuf;
      const ref = this.sRef, depth = this.sDepth, tx = this.sTx;
      const tanHalf = this.tanHalfFov;
      let n = 0;

      // Преобразование в координаты камеры: invDet обращает матрицу [plane dir].
      // depth — расстояние вдоль взгляда, tx — смещение вправо (в тех же единицах).
      const invDet = 1 / (planeX * dirY - dirX * planeY);
      const lists = this.sources;
      for (let li = 0; li < lists.length; li++) {
        const items = lists[li]();
        for (let i = 0; i < items.length && n < this.SPRITE_CAP; i++) {
        const it = items[i];
        if (!it.active) continue;
        const rx = it.x - px, ry = it.y - py;
        const ty = invDet * (-planeY * rx + planeX * ry);
        if (ty < 0.1) continue;                          // за спиной или вплотную
        const tX = invDet * (dirY * rx - dirX * ry);
        if (Math.abs(tX) > ty * tanHalf + it.size) continue;   // вне поля зрения
        ref[n] = it; depth[n] = ty; tx[n] = tX; n++;
        }
      }

      // Сортировка вставками по убыванию глубины (n мал; без аллокаций)
      for (let i = 1; i < n; i++) {
        const r = ref[i], d = depth[i], t = tx[i];
        let j = i - 1;
        while (j >= 0 && depth[j] < d) { ref[j + 1] = ref[j]; depth[j + 1] = depth[j]; tx[j + 1] = tx[j]; j--; }
        ref[j + 1] = r; depth[j + 1] = d; tx[j + 1] = t;
      }

      const maxDist = C.maxDist;
      for (let i = 0; i < n; i++) {
        const it = ref[i], ty = depth[i];
        const cx = (w * 0.5) * (1 + tx[i] / ty);          // экранная X центра
        const sh = it.size * h / ty;                      // высота на экране
        const sw = it.size * w / (2 * tanHalf * ty);      // ширина (масштаб по X согласован с FOV)
        const bottom = h * 0.5 + (0.5 - it.z) * h / ty;   // основание на полу (камера на высоте 0.5)
        const top = bottom - sh;
        const left = cx - sw * 0.5;

        let f = 1 - ty / maxDist;
        if (f < 0.3) f = 0.3;
        const fi = (f * 256) | 0;

        let x0 = Math.floor(left), x1 = Math.ceil(left + sw);
        if (x0 < 0) x0 = 0;
        if (x1 > w) x1 = w;
        let y0 = Math.floor(top), y1 = Math.ceil(bottom);
        if (y0 < 0) y0 = 0;
        if (y1 > h) y1 = h;

        const stepX = 64 / sw, stepY = 64 / sh;
        const tex = it.tex;
        for (let x = x0; x < x1; x++) {
          if (ty >= zbuf[x]) continue;                    // закрыт стеной
          let col = ((x - left) * stepX) | 0;
          if (col > 63) col = 63;
          col <<= 6;
          let tp = (y0 - top) * stepY;
          for (let y = y0, o = y0 * w + x; y < y1; y++, o += w) {
            let r = tp | 0;
            if (r > 63) r = 63;
            tp += stepY;
            const c = tex[col + r];
            if (c === 0) continue;
            // Умножение двух каналов за раз (R|B и G) на fi/256; байтовый порядок неважен
            buf[o] = (0xFF000000 |
              (((((c & 0x00FF00FF) * fi) >>> 8) & 0x00FF00FF)) |
              (((((c & 0x0000FF00) * fi) >>> 8) & 0x0000FF00))) >>> 0;
          }
        }
      }
      this.spritesDrawn = n;
    }
  };
})(window.GAME);
