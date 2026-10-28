// Процедурные спрайты 64x64, нарисованные примитивами Canvas в offscreen-canvas.
// Результат — Uint32Array по столбцам (индекс x*64+y), 0 = прозрачный пиксель
// (непрозрачные пиксели всегда имеют alpha=255, поэтому 0 не встречается среди цветов).
(function (G) {
  'use strict';

  const S = 64;

  function make(draw) {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d', { willReadFrequently: true });
    draw(g);
    const d = g.getImageData(0, 0, S, S).data;
    const out = new Uint32Array(S * S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        // Порог по альфе убирает полупрозрачную кайму от сглаживания дуг
        if (d[i + 3] >= 128) out[x * S + y] = G.Textures.pack(d[i], d[i + 1], d[i + 2]);
      }
    }
    return out;
  }

  const rect = (g, col, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  function poly(g, col, pts) {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
    g.fill();
  }
  // Прямоугольник с тёмной обводкой
  function box(g, col, x, y, w, h) {
    rect(g, '#1a1a1a', x - 2, y - 2, w + 4, h + 4);
    rect(g, col, x, y, w, h);
  }

  function drawKey(g, col, grow) {
    g.strokeStyle = col;
    g.fillStyle = col;
    g.lineWidth = 6 + grow * 2;
    g.beginPath();
    g.arc(32, 16, 10, 0, Math.PI * 2);
    g.stroke();
    g.fillRect(29 - grow, 26 - grow, 6 + 2 * grow, 32 + 2 * grow);
    g.fillRect(35 - grow, 42 - grow, 10 + 2 * grow, 5 + 2 * grow);
    g.fillRect(35 - grow, 51 - grow, 8 + 2 * grow, 5 + 2 * grow);
  }
  const keyArt = (col) => (g) => { drawKey(g, '#111', 2); drawKey(g, col, 0); };


  // ---- Оружие от первого лица: канвасы 64x64, выводятся с целочисленным масштабом (drawImage без сглаживания) ----
  function canvas64(draw) {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    draw(g);
    return c;
  }
  const SKIN = '#d9a066', SKIN_D = '#a8723f', METAL = '#4a4f58', METAL_D = '#23262b', METAL_L = '#7d8590';

  function star(g, cx, cy, r) {
    g.fillStyle = '#ffb02e';
    g.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8, rr = i % 2 === 0 ? r : r * 0.45;
      g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.closePath(); g.fill();
    g.fillStyle = '#fff3b0';
    g.beginPath(); g.arc(cx, cy, r * 0.38, 0, 7); g.fill();
  }

  // Оружие нарисовано «из-за плеча»: ствол уходит от игрока к точке схода (центр, верх), поэтому
  // спереди оно узкое и короткое, сзади — широкое. Руки снизу. Канвас 64x64, низ кадра = низ вида.
  function barrelPoly(g, outline, fill, hi, xt1, xt2, yt, xb1, xb2, yb) {
    poly(g, outline, [xt1 - 1, yt - 1, xt2 + 1, yt - 1, xb2 + 2, yb, xb1 - 2, yb]);
    poly(g, fill, [xt1, yt, xt2, yt, xb2, yb, xb1, yb]);
    const m1 = (xt1 + xt2) / 2 - 1, m2 = (xt1 + xt2) / 2 + 1, n1 = (xb1 + xb2) / 2 - 2, n2 = (xb1 + xb2) / 2 + 2;
    poly(g, hi, [m1, yt, m2, yt, n2, yb, n1, yb]);
  }
  function hand(g, y, wide) {            // кисть снизу, обхватывает оружие
    const w = wide || 0;
    poly(g, '#111', [16 - w, 67, 21 - w, y - 1, 43 + w, y - 1, 48 + w, 67]);
    poly(g, SKIN_D, [18 - w, 67, 22 - w, y + 1, 42 + w, y + 1, 46 + w, 67]);
    poly(g, SKIN, [21 - w, 67, 25 - w, y + 3, 39 + w, y + 3, 43 + w, 67]);
    rect(g, SKIN_D, 26, y + 6, 1, 5); rect(g, SKIN_D, 31, y + 6, 1, 5); rect(g, SKIN_D, 36, y + 6, 1, 5);
  }

  function drawPistol(g, dy, flash) {
    g.save(); g.translate(0, dy);
    poly(g, '#111', [18, 56, 46, 56, 51, 67, 13, 67]);                           // рамка и спуск
    poly(g, '#2a2d33', [19, 57, 45, 57, 49, 67, 15, 67]);
    barrelPoly(g, '#111', '#3b4048', '#7a828c', 28, 36, 39, 21, 43, 58);         // затвор: короткий и широкий
    rect(g, '#111', 31, 36, 2, 4);                                              // мушка
    rect(g, '#111', 24, 54, 5, 4); rect(g, '#111', 35, 54, 5, 4);               // целик
    hand(g, 60, 5);
    poly(g, SKIN_D, [42, 58, 48, 54, 52, 67, 44, 67]);                          // большой палец
    g.restore();
    if (flash) star(g, 32, 34 + dy, 8);
  }

  function drawShotgun(g, dy, flash, pump) {
    g.save(); g.translate(0, dy);
    poly(g, '#111', [17, 51, 47, 51, 51, 67, 13, 67]);                           // ствольная коробка
    poly(g, '#2a2d33', [18, 52, 46, 52, 49, 67, 15, 67]);
    barrelPoly(g, '#111', '#3b4048', '#7a828c', 29, 35, 27, 23, 41, 52);         // ствол
    rect(g, '#111', 31, 24, 2, 4);
    poly(g, '#111', [20, 42 + pump, 44, 42 + pump, 49, 54 + pump, 15, 54 + pump]); // цевьё (двигается при перезарядке)
    poly(g, '#6b3f1e', [21, 43 + pump, 43, 43 + pump, 47, 53 + pump, 17, 53 + pump]);
    poly(g, '#8a5428', [24, 44 + pump, 31, 44 + pump, 30, 52 + pump, 21, 52 + pump]);
    g.restore();
    hand(g, 60, 6);
    poly(g, SKIN, [13, 52 + pump + dy, 20, 46 + pump + dy, 23, 60, 14, 60]);      // пальцы на цевье
    poly(g, SKIN, [51, 52 + pump + dy, 44, 46 + pump + dy, 41, 60, 50, 60]);
    if (flash) star(g, 32, 23 + dy, 10);
  }

  function drawChaingun(g, dy, flash, rot) {
    g.save(); g.translate(0, dy);
    const cA = rot ? '#7d8590' : '#4a4f58', cB = rot ? '#4a4f58' : '#7d8590';
    limb(g, 26, 48, 28, 31, 6, cA);
    limb(g, 38, 48, 36, 31, 6, cB);
    limb(g, 32, 48, 32, 28, 6, rot ? '#5f6670' : '#6a717b');
    disc(g, '#111', 28, 30, 3); disc(g, '#111', 36, 30, 3); disc(g, '#111', 32, 27, 3);
    poly(g, '#111', [17, 42, 47, 42, 53, 67, 11, 67]);                           // казённик
    poly(g, '#3b4048', [19, 44, 45, 44, 50, 67, 14, 67]);
    poly(g, '#555d68', [22, 45, 42, 45, 43, 51, 21, 51]);
    rect(g, '#7a1f1f', 24, 55, 16, 5);                                           // лента
    g.restore();
    hand(g, 61, 7);
    if (flash) star(g, 32, 25 + dy, 9);
  }

  function drawRocket(g, dy, flash, smoke) {
    g.save(); g.translate(0, dy);
    poly(g, '#111', [19, 35, 45, 35, 54, 63, 10, 63]);                           // труба в перспективе, короткая и толстая
    poly(g, '#5b6b32', [20, 36, 44, 36, 52, 62, 12, 62]);
    poly(g, '#7f9145', [23, 36, 29, 36, 27, 62, 17, 62]);
    poly(g, '#3a4520', [21, 44, 43, 44, 44, 47, 20, 47]);
    poly(g, '#3a4520', [17, 54, 47, 54, 48, 57, 16, 57]);
    g.fillStyle = '#111'; g.beginPath(); g.ellipse(32, 35, 12.5, 4.5, 0, 0, 7); g.fill();   // дульный срез
    g.fillStyle = '#05050a'; g.beginPath(); g.ellipse(32, 35, 9.5, 3.2, 0, 0, 7); g.fill();
    rect(g, '#111', 31, 30, 2, 5);                                               // мушка
    g.fillStyle = '#222'; g.beginPath(); g.ellipse(32, 62, 21, 4.5, 0, 0, 7); g.fill();
    g.restore();
    hand(g, 61, 6);
    if (flash) { disc(g, '#ff7a1a', 32, 29 + dy, 10); disc(g, '#ffe08a', 32, 29 + dy, 5.5); }
    if (smoke) { disc(g, '#9a9a9a', 27, 26, 6); disc(g, '#b0b0b0', 37, 23, 7); disc(g, '#888', 32, 30, 6); }
  }

  // Кулак: вид сзади. 0 — готовность (два кулака), 1 — замах/выпад, 2 — кулак вытянут вперёд (меньше и выше)
  function fist(g, x, y, w, h) {
    rect(g, '#111', x - 1, y - 1, w + 2, h + 2);
    rect(g, SKIN, x, y, w, h);
    rect(g, SKIN_D, x, y + h - 3, w, 3);
    for (let i = 0; i < 4; i++) disc(g, SKIN, x + w * (i + 0.5) / 4, y + 1, w / 8 + 1);
    for (let i = 1; i < 4; i++) rect(g, SKIN_D, x + w * i / 4, y + 2, 1, Math.max(2, h * 0.4));
  }
  function drawFist(g, mode) {
    if (mode === 0) {
      poly(g, '#111', [8, 67, 12, 54, 26, 54, 30, 67]); poly(g, '#4a5a3a', [9, 67, 13, 55, 25, 55, 29, 67]);
      fist(g, 11, 44, 16, 12);
      poly(g, '#111', [34, 67, 38, 52, 54, 52, 58, 67]); poly(g, '#4a5a3a', [35, 67, 39, 53, 53, 53, 57, 67]);
      fist(g, 37, 41, 18, 13);
    } else if (mode === 1) {
      poly(g, '#111', [24, 67, 29, 44, 41, 44, 46, 67]); poly(g, '#4a5a3a', [25, 67, 30, 45, 40, 45, 45, 67]);
      fist(g, 28, 33, 14, 12);
    } else {
      poly(g, '#111', [25, 67, 30, 36, 40, 36, 45, 67]); poly(g, '#4a5a3a', [26, 67, 31, 37, 39, 37, 44, 67]);
      fist(g, 29, 26, 12, 10);
    }
  }

  // ---- Враги: 4 типа, одно направление взгляда (в камеру) ----
  function limb(g, x1, y1, x2, y2, w, col) {
    g.lineCap = 'butt';
    g.strokeStyle = '#111'; g.lineWidth = w + 2;
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    g.strokeStyle = col; g.lineWidth = w;
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  }
  function disc(g, col, x, y, r) { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }

  // Гуманоид. o.atk: 0 нет, 1 замах, 2 удар/выстрел; o.kind: rifle | claws | cannon
  function drawHumanoid(g, o) {
    const b = o.bulk || 1, cx = 32 + (o.lean || 0), ph = o.phase || 0;
    const hy = o.headY || 13, hr = o.headR || 7;
    // ноги
    limb(g, cx - 5 * b, 40, cx - 5 * b + ph * 6, 61 - Math.max(0, -ph) * 4, 7 * b, o.leg);
    limb(g, cx + 5 * b, 40, cx + 5 * b - ph * 6, 61 - Math.max(0, ph) * 4, 7 * b, o.leg);
    rect(g, o.boot, cx - 5 * b + ph * 6 - 4.5 * b, 59 - Math.max(0, -ph) * 4, 9 * b, 4);
    rect(g, o.boot, cx + 5 * b - ph * 6 - 4.5 * b, 59 - Math.max(0, ph) * 4, 9 * b, 4);
    // торс
    rect(g, '#111', cx - 9 * b - 1, 20, 18 * b + 2, 23);
    rect(g, o.cloth, cx - 9 * b, 21, 18 * b, 21);
    rect(g, o.clothL || o.cloth, cx - 9 * b, 21, 4 * b, 18);
    rect(g, o.clothD, cx - 9 * b, 38, 18 * b, 3);
    if (o.plate) { rect(g, o.plate, cx - 6 * b, 24, 12 * b, 8); rect(g, '#111', cx - 6 * b, 32, 12 * b, 1); }
    // руки: down — вдоль тела, aim — вперёд, up — занесены
    const lx = cx - 9 * b - 1, rx = cx + 9 * b + 1, aw = 5 * b;
    if (o.kind === 'claws') {
      const up = o.atk === 1 ? -8 : 0, fwd = o.atk === 2 ? 14 : 0;
      limb(g, lx, 24, lx - 3 + (o.atk === 2 ? 8 : 0), 38 + up - fwd * 0.3, aw, o.skin);
      limb(g, rx, 24, rx + 3 - (o.atk === 2 ? 8 : 0), 38 + up - fwd * 0.3, aw, o.skin);
      const hy2 = 38 + up - fwd * 0.3;
      for (let k = 0; k < 3; k++) {                          // когти
        rect(g, '#eee', lx - 6 + (o.atk === 2 ? 8 : 0) + k * 2, hy2 + 1, 1, 5);
        rect(g, '#eee', rx + 1 - (o.atk === 2 ? 8 : 0) + k * 2, hy2 + 1, 1, 5);
      }
    } else if (o.kind === 'cannon') {
      limb(g, lx, 24, lx - 2, 40, aw, o.cloth);
      limb(g, rx, 25, rx + 1, o.atk ? 33 : 38, aw + 1, o.cloth);
      rect(g, '#111', rx - 5, o.atk ? 26 : 30, 12, 14);                 // орудие
      rect(g, o.plate || '#667', rx - 4, o.atk ? 27 : 31, 10, 12);
      rect(g, '#111', rx - 2, o.atk ? 23 : 27, 6, 5);
      if (o.atk === 1) { disc(g, '#ff8a30', rx + 1, 25, 4); }         // заряд
      if (o.atk === 2) star(g, rx + 1, 22, 11);
    } else {                                              // rifle
      if (o.atk) {
        limb(g, rx, 24, cx + 5, 31, aw, o.skin);
        limb(g, lx, 24, cx + 1, 33, aw, o.skin);
        rect(g, '#111', cx + 1, 26, 8, 6); rect(g, '#555', cx + 2, 27, 6, 4);      // ствол в камеру
        rect(g, '#111', cx + 3, 30, 4, 3);
        if (o.atk === 2) star(g, cx + 5, 26, 10);
      } else {
        limb(g, lx, 24, lx - 2, 39, aw, o.skin);
        limb(g, rx, 24, rx + 1, 38, aw, o.skin);
        rect(g, '#111', rx - 1, 30, 5, 17); rect(g, '#555', rx, 31, 3, 15);        // винтовка опущена
      }
    }
    // голова
    const hx = cx + (o.hx || 0);
    disc(g, '#111', hx, hy, hr + 1);
    disc(g, o.skin, hx, hy, hr);
    if (o.helm) {
      g.fillStyle = o.helm; g.beginPath(); g.arc(hx, hy - 1, hr + 1, Math.PI, 0); g.fill();
      rect(g, '#111', hx - hr - 1, hy - 1, 2 * hr + 2, 1);
    }
    if (o.jaw) { rect(g, '#111', hx - 5, hy + 2, 10, 6); rect(g, o.skinD, hx - 4, hy + 3, 8, 4); }
    // лицо
    if (o.visor) {
      rect(g, '#111', hx - 5, hy - 2, 10, 4); rect(g, o.pain ? '#ffa090' : o.visor, hx - 4, hy - 1, 8, 2);
    } else if (o.pain) {
      rect(g, '#222', hx - 4, hy - 1, 3, 1); rect(g, '#222', hx + 1, hy - 1, 3, 1);
    } else {
      rect(g, o.eye || '#fff', hx - 4, hy - 2, 3, 3); rect(g, o.eye || '#fff', hx + 1, hy - 2, 3, 3);
      rect(g, '#111', hx - 3, hy - 1, 1, 2); rect(g, '#111', hx + 2, hy - 1, 1, 2);
    }
    if (o.kind === 'claws') {                              // клыки
      const open = o.atk || o.pain;
      rect(g, '#300', hx - 4, hy + 3, 8, open ? 4 : 2);
      rect(g, '#fff', hx - 4, hy + 3, 1, 2); rect(g, '#fff', hx + 3, hy + 3, 1, 2);
      rect(g, '#fff', hx - 2, hy + 3, 1, 1); rect(g, '#fff', hx + 1, hy + 3, 1, 1);
    } else if (!o.visor) {
      rect(g, '#411', hx - 2, hy + 4, 4, o.pain || o.atk ? 2 : 1);
    }
    if (o.horns) {                                          // рога
      poly(g, '#111', [hx - 8, hy - 3, hx - 13, hy - 14, hx - 4, hy - 6]); poly(g, '#d8d0b8', [hx - 7, hy - 4, hx - 12, hy - 13, hx - 5, hy - 6]);
      poly(g, '#111', [hx + 8, hy - 3, hx + 13, hy - 14, hx + 4, hy - 6]); poly(g, '#d8d0b8', [hx + 7, hy - 4, hx + 12, hy - 13, hx + 5, hy - 6]);
    }
    if (o.pads) {                                           // наплечники
      rect(g, '#111', cx - 9 * b - 6, 19, 11, 8); rect(g, o.pads, cx - 9 * b - 5, 20, 9, 6);
      rect(g, '#111', cx + 9 * b - 4, 19, 11, 8); rect(g, o.pads, cx + 9 * b - 3, 20, 9, 6);
    }
  }

  // Кислотник: студенистое существо с кислотным мешком; phase — «дыхание» шага
  function drawSpitter(g, o) {
    const ph = o.phase || 0, sq = ph * 2, lean = o.lean || 0;
    // ножки-наросты
    rect(g, '#111', 16 + lean, 56, 10, 7); rect(g, '#2f6a1c', 17 + lean, 57 + Math.max(0, -ph) * -1, 8, 5);
    rect(g, '#111', 38 + lean, 56, 10, 7); rect(g, '#2f6a1c', 39 + lean, 57 + Math.max(0, ph) * -1, 8, 5);
    // тело
    g.fillStyle = '#111'; g.beginPath(); g.ellipse(32 + lean, 40, 21 + sq * 0.5, 19 - sq, 0, 0, 7); g.fill();
    g.fillStyle = o.pain ? '#9ad070' : '#58a832'; g.beginPath(); g.ellipse(32 + lean, 40, 19 + sq * 0.5, 17 - sq, 0, 0, 7); g.fill();
    g.fillStyle = '#7ccc4a'; g.beginPath(); g.ellipse(26 + lean, 33, 7, 5, -0.5, 0, 7); g.fill();
    // кислотный мешок
    const glow = o.atk === 1 ? '#e0ff70' : o.atk === 2 ? '#f6ffb0' : '#a6e02f';
    disc(g, '#111', 32 + lean, 46, 8); disc(g, glow, 32 + lean, 46, 7);
    disc(g, '#fff', 30 + lean, 44, 2);
    // щупальца-руки
    limb(g, 14 + lean, 36, 6 + lean, o.atk === 1 ? 22 : 46, 5, '#58a832');
    limb(g, 50 + lean, 36, 58 + lean, o.atk === 1 ? 22 : 46, 5, '#58a832');
    // глаза на стебельках
    limb(g, 24 + lean, 26, 22 + lean, 17, 3, '#2f6a1c'); limb(g, 40 + lean, 26, 42 + lean, 17, 3, '#2f6a1c');
    disc(g, '#111', 22 + lean, 15, 5); disc(g, o.pain ? '#444' : '#fff', 22 + lean, 15, 4); disc(g, '#c00', 22 + lean, 15, 2);
    disc(g, '#111', 42 + lean, 15, 5); disc(g, o.pain ? '#444' : '#fff', 42 + lean, 15, 4); disc(g, '#c00', 42 + lean, 15, 2);
    // пасть
    const open = o.atk ? 6 : 2;
    g.fillStyle = '#111'; g.beginPath(); g.ellipse(32 + lean, 33, 8, open, 0, 0, 7); g.fill();
    if (o.atk === 2) disc(g, '#b8ff40', 32 + lean, 33, 4);
  }

  function drawCorpseHumanoid(g, o, pool) {
    const b = o.bulk || 1;
    g.fillStyle = pool > 1 ? '#5a0d0d' : '#7a1212';
    g.beginPath(); g.ellipse(32, 60, 20 + pool * 5, 4 + pool, 0, 0, 7); g.fill();
    limb(g, 38, 55, 58, 58, 6 * b, o.leg);
    rect(g, o.boot, 56, 56, 5, 5);
    limb(g, 12, 55, 40, 55, 11 * b, o.cloth);
    rect(g, o.clothD, 36, 50, 3, 11 * b);
    limb(g, 16, 51, 28, 49, 4 * b, o.skin);
    disc(g, '#111', 8, 53, 7); disc(g, o.skin, 8, 53, 6);
    if (o.helm) { g.fillStyle = o.helm; g.beginPath(); g.arc(8, 52, 6, Math.PI * 0.6, Math.PI * 1.7); g.fill(); }
  }
  function drawCorpseSpitter(g, pool) {
    g.fillStyle = '#111'; g.beginPath(); g.ellipse(32, 57, 26 + pool * 3, 7, 0, 0, 7); g.fill();
    g.fillStyle = '#58a832'; g.beginPath(); g.ellipse(32, 57, 24 + pool * 3, 5.5, 0, 0, 7); g.fill();
    g.fillStyle = '#a6e02f'; g.beginPath(); g.ellipse(36, 56, 6, 2.5, 0, 0, 7); g.fill();
    disc(g, '#222', 14, 56, 2); disc(g, '#222', 50, 57, 2);
  }

  // Собирает набор кадров типа врага: walk×4, atk×2, pain, death×5 (Uint32Array по столбцам)
  function buildEnemySet(draw, corpse, style) {
    const phases = [-0.9, 0, 0.9, 0];
    const set = { walk: [], atk: [], pain: null, death: [] };
    for (let i = 0; i < 4; i++) set.walk.push(make((g) => draw(g, Object.assign({}, style, { phase: phases[i] }))));
    set.atk.push(make((g) => draw(g, Object.assign({}, style, { atk: 1 }))));
    set.atk.push(make((g) => draw(g, Object.assign({}, style, { atk: 2 }))));
    set.pain = make((g) => draw(g, Object.assign({}, style, { pain: true, lean: -2, hx: -1 })));
    // Падение: поворот вокруг ступней, затем лежащее тело с растущей лужей
    for (const ang of [0.2, 0.65, 1.2]) {
      set.death.push(make((g) => {
        g.save();
        g.translate(20, 62); g.rotate(ang); g.scale(0.92, 0.92); g.translate(-32, -62);
        draw(g, Object.assign({}, style, { pain: true }));
        g.restore();
      }));
    }
    set.death.push(make((g) => corpse(g, style, 1)));
    set.death.push(make((g) => corpse(g, style, 2)));
    return set;
  }

  G.Sprites = {
    enemies: {},       // enemies[тип] = { walk[4], atk[2], pain, death[5] }
    weapons: [],       // weapons[оружие][кадр] -> canvas 64x64
    fx: {},
    items: {},

    init() {
      const it = this.items;

      it.medkitS = make((g) => {
        box(g, '#e8e8e8', 10, 28, 44, 30);
        rect(g, '#bbb', 10, 50, 44, 8);
        rect(g, '#c62828', 29, 33, 6, 18);
        rect(g, '#c62828', 23, 39, 18, 6);
      });

      it.medkitL = make((g) => {
        box(g, '#f0f0f0', 4, 16, 56, 42);
        box(g, '#999', 22, 6, 20, 10);
        rect(g, '#bbb', 4, 50, 56, 8);
        rect(g, '#d32f2f', 27, 22, 10, 30);
        rect(g, '#d32f2f', 16, 32, 32, 10);
      });

      it.armor = make((g) => {
        poly(g, '#111', [10, 6, 26, 2, 38, 2, 54, 6, 60, 26, 50, 62, 14, 62, 4, 26]);
        poly(g, '#2f6db0', [12, 8, 26, 4, 38, 4, 52, 8, 57, 25, 48, 60, 16, 60, 7, 25]);
        poly(g, '#5b9bd5', [16, 12, 28, 8, 36, 8, 48, 12, 51, 24, 44, 52, 20, 52, 13, 24]);
        rect(g, '#1c4a7d', 30, 8, 4, 50);
        rect(g, '#e0c040', 22, 30, 20, 4);
      });

      it.clip = make((g) => {
        for (let i = 0; i < 6; i++) {
          rect(g, '#111', 10 + i * 8, 14, 8, 26);
          rect(g, '#d4a017', 11 + i * 8, 22, 6, 18);
          rect(g, '#b87333', 11 + i * 8, 16, 6, 7);
        }
        box(g, '#5d4e2a', 6, 38, 52, 22);
        rect(g, '#7a6838', 6, 38, 52, 5);
      });

      it.shells = make((g) => {
        for (let i = 0; i < 3; i++) {
          const x = 6 + i * 19;
          rect(g, '#111', x - 2, 12, 19, 48);
          rect(g, '#b71c1c', x, 14, 15, 32);
          rect(g, '#e57373', x + 2, 14, 3, 32);
          rect(g, '#c9a227', x, 46, 15, 12);
        }
      });

      it.keyR = make(keyArt('#e53935'));
      it.keyB = make(keyArt('#3d6df0'));
      it.keyY = make(keyArt('#f2c914'));


      // Подбираемые модели оружия и ящик ракет
      it.wShotgun = make((g) => {
        box(g, '#6b3f1e', 4, 40, 56, 8);
        box(g, METAL, 4, 30, 38, 8);
        rect(g, METAL_L, 6, 31, 34, 2);
        box(g, '#6b3f1e', 40, 36, 20, 12);
      });
      it.wChaingun = make((g) => {
        for (let i = 0; i < 3; i++) box(g, METAL_L, 6 + i * 0, 24 + i * 7, 34, 5);
        box(g, METAL, 36, 22, 22, 24);
        rect(g, '#7a1f1f', 40, 38, 14, 5);
        box(g, '#3a2a1e', 46, 44, 8, 12);
      });
      it.wRocket = make((g) => {
        box(g, '#5b6b32', 4, 28, 54, 16);
        rect(g, '#7f9145', 6, 30, 50, 3);
        rect(g, '#3a4520', 18, 28, 3, 16); rect(g, '#3a4520', 38, 28, 3, 16);
        box(g, '#222', 28, 46, 8, 12);
      });
      it.rocketBox = make((g) => {
        box(g, '#44522a', 6, 34, 52, 24);
        for (let i = 0; i < 3; i++) { rect(g, '#aa3322', 12 + i * 14, 22, 8, 14); rect(g, '#ddd', 12 + i * 14, 18, 8, 5); }
      });

      // Манекен-мишень (на этапе 4 заменят настоящие враги): целый / попадание / сломан
      const dummy = (state) => make((g) => {
        if (state === 2) {                                   // упавшая мишень
          rect(g, '#1a1a1a', 8, 52, 48, 8);
          rect(g, '#6b4423', 10, 54, 44, 5);
          g.fillStyle = '#eee'; g.beginPath(); g.ellipse(32, 46, 14, 6, 0, 0, 7); g.fill();
          g.fillStyle = '#c62828'; g.beginPath(); g.ellipse(32, 46, 8, 3, 0, 0, 7); g.fill();
          return;
        }
        rect(g, '#1a1a1a', 28, 22, 8, 40);
        rect(g, '#6b4423', 30, 24, 4, 36);
        rect(g, '#1a1a1a', 14, 56, 36, 8);
        rect(g, '#555', 16, 58, 32, 4);
        const wh = state === 1 ? '#fff' : '#e8e8e8';
        g.fillStyle = '#111'; g.beginPath(); g.arc(32, 22, 17, 0, 7); g.fill();
        g.fillStyle = wh; g.beginPath(); g.arc(32, 22, 15, 0, 7); g.fill();
        g.fillStyle = state === 1 ? '#ff6a5a' : '#c62828'; g.beginPath(); g.arc(32, 22, 11, 0, 7); g.fill();
        g.fillStyle = wh; g.beginPath(); g.arc(32, 22, 7, 0, 7); g.fill();
        g.fillStyle = state === 1 ? '#ff6a5a' : '#c62828'; g.beginPath(); g.arc(32, 22, 3, 0, 7); g.fill();
      });
      it.dummy = dummy(0); it.dummyHurt = dummy(1); it.dummyDead = dummy(2);

      // Снаряд и эффекты
      const fx = this.fx;
      fx.rocket = make((g) => {
        g.fillStyle = '#ff6a00'; g.beginPath(); g.arc(32, 32, 14, 0, 7); g.fill();
        g.fillStyle = '#ffd24a'; g.beginPath(); g.arc(32, 32, 9, 0, 7); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 4, 0, 7); g.fill();
      });
      fx.expl = [];
      for (let k = 0; k < 6; k++) {
        fx.expl.push(make((g) => {
          const r = 10 + k * 4.5, t = k / 5;
          const outer = ['#ffb02e', '#ff7a1a', '#d84a10', '#8a3010', '#4a3a33', '#3a3a3a'][k];
          g.fillStyle = outer; g.beginPath(); g.arc(32, 32, r, 0, 7); g.fill();
          g.fillStyle = k < 4 ? '#ffd24a' : '#666'; g.beginPath(); g.arc(30, 30, r * (0.7 - t * 0.2), 0, 7); g.fill();
          if (k < 3) { g.fillStyle = '#fff6c0'; g.beginPath(); g.arc(30, 30, r * 0.35, 0, 7); g.fill(); }
        }));
      }
      fx.puff = [];
      for (let k = 0; k < 3; k++) {
        fx.puff.push(make((g) => {
          g.fillStyle = ['#cfcfcf', '#a8a8a8', '#7e7e7e'][k];
          g.beginPath(); g.arc(32, 32, 7 + k * 5, 0, 7); g.fill();
          if (k === 0) { g.fillStyle = '#ffe9a0'; g.beginPath(); g.arc(32, 32, 4, 0, 7); g.fill(); }
        }));
      }
      fx.blood = [];
      for (let k = 0; k < 3; k++) {
        fx.blood.push(make((g) => {
          g.fillStyle = ['#c01818', '#a01010', '#701010'][k];
          const sp = 5 + k * 5;
          for (const [dx, dy] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            g.beginPath(); g.arc(32 + dx * sp, 32 + dy * sp, 6 - k * 1.5, 0, 7); g.fill();
          }
        }));
      }


      // Враги
      const EN = this.enemies;
      EN.guard = buildEnemySet(drawHumanoid, drawCorpseHumanoid, {
        kind: 'rifle', skin: '#c9966b', skinD: '#8a6240', cloth: '#5b6b3a', clothL: '#6f8148', clothD: '#3a4524',
        leg: '#46532c', boot: '#222', helm: '#6b7078' });
      EN.fang = buildEnemySet(drawHumanoid, (g, st, pool) => drawCorpseHumanoid(g, st, pool), {
        kind: 'claws', skin: '#a8432f', skinD: '#6e2a1c', cloth: '#a8432f', clothL: '#c2573f', clothD: '#6e2a1c',
        leg: '#2a2230', boot: '#111', eye: '#ffe04a', jaw: true, headY: 17, hx: 0, bulk: 0.95 });
      EN.spitter = buildEnemySet(drawSpitter, (g, st, pool) => drawCorpseSpitter(g, pool), {});
      EN.bulwark = buildEnemySet(drawHumanoid, drawCorpseHumanoid, {
        kind: 'cannon', skin: '#7a828f', skinD: '#3a4050', cloth: '#5a6678', clothL: '#7a889c', clothD: '#2d3440',
        leg: '#3d4757', boot: '#1c2028', helm: '#4a5568', visor: '#ff3a2a', plate: '#b08a2a', pads: '#6a7a90',
        bulk: 1.45, headY: 12, headR: 6 });

      // Босс: обычный и «разъярённый» наборы (на третьей фазе меняется спрайт)
      const wardenStyle = {
        kind: 'cannon', skin: '#7a6a8a', skinD: '#4a3a5a', cloth: '#4a3a58', clothL: '#6a5478', clothD: '#2a1f35',
        leg: '#3a2d48', boot: '#150f1c', helm: '#3a3048', visor: '#9aff40', plate: '#8a2a2a', pads: '#6a5a8a',
        bulk: 1.8, headY: 11, headR: 6, horns: true };
      EN.warden = buildEnemySet(drawHumanoid, drawCorpseHumanoid, wardenStyle);
      EN.warden2 = buildEnemySet(drawHumanoid, drawCorpseHumanoid, Object.assign({}, wardenStyle, {
        cloth: '#7a2a38', clothL: '#a03a48', clothD: '#3a1018', visor: '#ffe030', plate: '#ffb030', pads: '#aa3030', skin: '#8a5a6a' }));

      // Сферы бонусов
      const sphere = (c1, c2, c3) => make((g) => {
        disc(g, '#111', 32, 34, 20); disc(g, c1, 32, 34, 18); disc(g, c2, 32, 34, 13); disc(g, c3, 28, 29, 6); disc(g, '#fff', 25, 26, 2);
      });
      it.sphereI = sphere('#1a6aa0', '#4ac8f0', '#d8f8ff');
      it.sphereD = sphere('#a01a10', '#f05a2a', '#ffd0a0');

      // Снаряд кислотника
      this.fx.bolt = make((g) => {
        disc(g, '#2a6a10', 32, 32, 14); disc(g, '#7cd62f', 32, 32, 11); disc(g, '#d8ff7a', 30, 30, 6); disc(g, '#fff', 28, 28, 2);
      });

      // Оружие: кадры по индексам из CONFIG.WEAPONS[].seq
      const W = this.weapons;
      W[0] = [canvas64((g) => drawFist(g, 0)), canvas64((g) => drawFist(g, 1)), canvas64((g) => drawFist(g, 2))];
      W[1] = [canvas64((g) => drawPistol(g, 0, false)), canvas64((g) => drawPistol(g, 2, true)), canvas64((g) => drawPistol(g, 5, false))];
      W[2] = [canvas64((g) => drawShotgun(g, 0, false, 0)), canvas64((g) => drawShotgun(g, 4, true, 0)),
              canvas64((g) => drawShotgun(g, 3, false, 0)), canvas64((g) => drawShotgun(g, 1, false, 8)),
              canvas64((g) => drawShotgun(g, 1, false, 14))];
      W[3] = [canvas64((g) => drawChaingun(g, 0, false, 0)), canvas64((g) => drawChaingun(g, 2, true, 0)),
              canvas64((g) => drawChaingun(g, 2, true, 1))];
      W[4] = [canvas64((g) => drawRocket(g, 0, false, false)), canvas64((g) => drawRocket(g, 5, true, false)),
              canvas64((g) => drawRocket(g, 4, false, true)), canvas64((g) => drawRocket(g, 2, false, false))];

      // Маркер выхода: светящаяся площадка со стрелкой
      it.exit = make((g) => {
        g.fillStyle = '#063';
        g.beginPath(); g.ellipse(32, 52, 30, 10, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#3d9';
        g.beginPath(); g.ellipse(32, 52, 24, 7, 0, 0, Math.PI * 2); g.fill();
        poly(g, '#111', [32, 8, 52, 34, 40, 34, 40, 48, 24, 48, 24, 34, 12, 34]);
        poly(g, '#9fffc8', [32, 12, 47, 32, 38, 32, 38, 45, 26, 45, 26, 32, 17, 32]);
      });
    }
  };
})(window.GAME);
