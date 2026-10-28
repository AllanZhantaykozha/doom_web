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

  function handBottom(g, y) {            // кисти внизу кадра, держащие оружие
    poly(g, SKIN_D, [12, y + 4, 24, y - 4, 40, y - 4, 52, y + 4, 54, 64, 10, 64]);
    poly(g, SKIN, [14, y + 6, 25, y - 2, 39, y - 2, 50, y + 6, 51, 64, 13, 64]);
    rect(g, SKIN_D, 22, y + 8, 1, 6); rect(g, SKIN_D, 28, y + 8, 1, 6); rect(g, SKIN_D, 34, y + 8, 1, 6);
  }

  function drawPistol(g, dy, flash) {
    g.save(); g.translate(0, dy);
    poly(g, '#3a2a1e', [25, 44, 39, 44, 42, 66, 22, 66]);
    poly(g, METAL_D, [26, 16, 38, 16, 39, 46, 25, 46]);
    rect(g, METAL_L, 29, 16, 6, 28);
    rect(g, '#111', 31, 12, 2, 4);
    rect(g, '#111', 28, 15, 8, 2);
    handBottom(g, 52);
    poly(g, SKIN, [37, 38, 45, 42, 43, 54, 36, 50]);
    g.restore();
    if (flash) star(g, 32, 10 + dy, 11);
  }

  function drawShotgun(g, dy, flash, pump) {
    g.save(); g.translate(0, dy);
    rect(g, METAL_D, 25, 6, 6, 40); rect(g, METAL_D, 33, 6, 6, 40);
    rect(g, METAL_L, 26, 6, 2, 40); rect(g, METAL_L, 34, 6, 2, 40);
    rect(g, METAL, 24, 20, 16, 3);
    rect(g, '#2a1a10', 22, 40 + pump, 20, 12);           // цевьё
    rect(g, '#6b3f1e', 23, 41 + pump, 18, 10);
    rect(g, METAL, 21, 50, 22, 12);                     // ствольная коробка
    rect(g, METAL_L, 21, 50, 22, 2);
    g.restore();
    poly(g, SKIN_D, [14, 48 + pump + dy, 22, 42 + pump + dy, 22, 58, 12, 64]);
    poly(g, SKIN, [42, 42 + pump + dy, 50, 48 + pump + dy, 52, 64, 42, 58]);
    rect(g, SKIN, 14, 60, 36, 4);
    if (flash) star(g, 32, 4 + dy, 13);
  }

  function drawChaingun(g, dy, flash, rot) {
    g.save(); g.translate(0, dy);
    for (let i = 0; i < 3; i++) {
      const x = 22 + i * 7 + (rot ? (i === 1 ? 0 : 0) : 0);
      rect(g, '#111', x - 1, 10, 7, 32);
      rect(g, (i + rot) % 2 === 0 ? METAL_L : METAL, x, 10, 5, 32);
    }
    rect(g, '#111', 19, 8, 26, 3);
    rect(g, METAL_D, 18, 38, 28, 22);
    rect(g, METAL, 20, 40, 24, 6);
    rect(g, '#7a1f1f', 24, 50, 16, 6);
    g.restore();
    handBottom(g, 54);
    if (flash) star(g, 32, 6 + dy, 12);
  }

  function drawRocket(g, dy, flash, smoke) {
    g.save(); g.translate(0, dy);
    rect(g, '#111', 19, 14, 26, 38);
    rect(g, '#5b6b32', 21, 14, 22, 38);
    rect(g, '#7f9145', 23, 14, 5, 38);
    rect(g, '#3a4520', 21, 22, 22, 3); rect(g, '#3a4520', 21, 40, 22, 3);
    g.fillStyle = '#0a0a0a';
    g.beginPath(); g.ellipse(32, 14, 11, 4, 0, 0, 7); g.fill();
    rect(g, METAL_D, 36, 50, 8, 14);
    g.restore();
    handBottom(g, 54);
    if (flash) {
      g.fillStyle = '#ff7a1a'; g.beginPath(); g.arc(32, 8 + dy, 12, 0, 7); g.fill();
      g.fillStyle = '#ffe08a'; g.beginPath(); g.arc(32, 8 + dy, 6, 0, 7); g.fill();
    }
    if (smoke) {
      g.fillStyle = '#9a9a9a';
      g.beginPath(); g.arc(26, 4, 6, 0, 7); g.arc(38, 2, 7, 0, 7); g.arc(32, 8, 7, 0, 7); g.fill();
    }
  }

  function drawFist(g, mode) {
    if (mode === 0) {                    // готовность: два кулака внизу
      for (let k = 0; k < 2; k++) {
        const x = k === 0 ? 6 : 34, w = 24;
        rect(g, '#111', x - 2, 38, w + 4, 28);
        rect(g, SKIN, x, 40, w, 26);
        rect(g, SKIN_D, x, 40, w, 3);
        for (let i = 1; i < 4; i++) rect(g, SKIN_D, x + i * 6, 42, 1, 8);
        rect(g, '#4a5a3a', x, 58, w, 8);
      }
    } else {                             // удар: кулак по центру
      const big = mode === 2;
      const x = big ? 16 : 22, y = big ? 6 : 16, w = big ? 32 : 20, h = big ? 34 : 26;
      rect(g, '#4a5a3a', x - 2, y + h - 2, w + 4, 64);
      rect(g, '#111', x - 2, y - 2, w + 4, h + 4);
      rect(g, SKIN, x, y, w, h);
      rect(g, SKIN_D, x, y, w, 3);
      for (let i = 1; i < 4; i++) rect(g, SKIN_D, x + i * (w / 4), y + 2, 1, 9);
      rect(g, SKIN_D, x, y + h - 3, w, 3);
    }
  }

  G.Sprites = {
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
