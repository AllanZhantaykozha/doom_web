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

  G.Sprites = {
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
