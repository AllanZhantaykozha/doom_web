// Нижняя панель в стиле классического шутера. Рисуется в офскрин-canvas в «базовых» единицах 320x200
// (масштаб = высота/200) и только когда данные изменились — на кадр остаётся один drawImage.
// Цифры — собственный пиксельный шрифт (резкий при любом масштабе), лицо — примитивами.
// Примечание: отдельный файл — отступление от исходной структуры (HUD там в renderer.js), иначе рендер вышел бы > 600 строк.
(function (G) {
  'use strict';

  const BIG = {   // 5x7
    '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
    '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
    '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
    '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
    '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
    '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
    '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
    '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011']
  };
  const SMALL = { // 3x5
    '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'],
    '2': ['111', '001', '111', '100', '111'], '3': ['111', '001', '111', '001', '111'],
    '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'],
    '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '001', '010', '010'],
    '8': ['111', '101', '111', '101', '111'], '9': ['111', '101', '111', '001', '111'],
    '/': ['001', '001', '010', '100', '100']
  };
  const AMMO_ROWS = [['bullets', '#c9a227'], ['shells', '#c62828'], ['rockets', '#6b8f3a']];

  const Hud = G.Hud = {
    canvas: null, ctx: null,
    barH: 32, scale: 1, sig: NaN,

    resize(w, barH, scale) {
      if (!this.canvas) this.canvas = document.createElement('canvas');
      this.canvas.width = w;
      this.canvas.height = barH;
      this.ctx = this.canvas.getContext('2d');
      this.barH = barH;
      this.scale = scale;
      this.sig = NaN;      // принудительная перерисовка
    },

    // Числовая сигнатура состояния: меняется — перерисовываем (без строк и аллокаций)
    signature() {
      const P = G.Player, A = P.ammo;
      let s = P.health;
      s = (s * 31 + P.armor) | 0;
      s = (s * 31 + P.weapon) | 0;
      s = (s * 31 + A.bullets) | 0;
      s = (s * 31 + A.shells) | 0;
      s = (s * 31 + A.rockets) | 0;
      let mask = 0;
      for (let i = 0; i < 5; i++) if (P.weapons[i]) mask |= 1 << i;
      for (let i = 1; i < 4; i++) if (P.keys[i]) mask |= 1 << (4 + i);
      s = (s * 31 + mask) | 0;
      s = (s * 31 + this.faceState()) | 0;
      return s;
    },

    // Состояние лица одним числом: тир здоровья, настроение, направление взгляда
    faceState() {
      const P = G.Player;
      const tier = P.health > 80 ? 0 : P.health > 60 ? 1 : P.health > 40 ? 2 : P.health > 20 ? 3 : 4;
      let mood = 0;                                  // 0 обычное, 1 боль, 2 ухмылка, 3 мёртв
      if (P.dead) mood = 3;
      else if (P.painTimer > 0) mood = 1;
      else if (P.grinTimer > 0) mood = 2;
      const look = P.lookTimer > 0 ? P.faceLook : P.glance;
      return tier * 100 + mood * 10 + (look + 1);
    },

    update() {
      const sig = this.signature();
      if (sig !== this.sig) { this.sig = sig; this.redraw(); }
    },

    num(g, text, xRight, y, big, color) {
      const font = big ? BIG : SMALL, gw = big ? 5 : 3, gh = big ? 7 : 5, adv = gw + 1;
      let x = xRight - text.length * adv + 1;
      for (let pass = 0; pass < 2; pass++) {         // сначала тень, затем цвет
        g.fillStyle = pass === 0 ? '#1a0a0a' : color;
        const o = pass === 0 ? 1 : 0;
        let cx = x;
        for (let i = 0; i < text.length; i++, cx += adv) {
          const gl = font[text[i]];
          if (!gl) continue;
          for (let r = 0; r < gh; r++) for (let c = 0; c < gw; c++) {
            if (gl[r][c] === '1') g.fillRect(cx + c + o, y + r + o, 1, 1);
          }
        }
      }
    },

    panel(g, x, y, w, h) {
      g.fillStyle = '#1e1e1e'; g.fillRect(x, y, w, h);
      g.fillStyle = '#555'; g.fillRect(x, y + h - 1, w, 1); g.fillRect(x + w - 1, y, 1, h);
      g.fillStyle = '#0c0c0c'; g.fillRect(x, y, w, 1); g.fillRect(x, y, 1, h);
    },

    redraw() {
      const g = this.ctx, P = G.Player, W = G.CONFIG.WEAPONS;
      g.setTransform(this.scale, 0, 0, this.scale, 0, 0);

      // Фон: металл с заклёпками
      g.fillStyle = '#3c3c3c'; g.fillRect(0, 0, 320, 32);
      g.fillStyle = '#666'; g.fillRect(0, 0, 320, 1);
      g.fillStyle = '#222'; g.fillRect(0, 31, 320, 1);

      // Патроны текущего оружия
      this.panel(g, 2, 3, 44, 27);
      const w = W[P.weapon];
      if (w.ammo !== null) this.num(g, String(P.ammo[w.ammo]), 42, 12, true, P.ammo[w.ammo] <= 10 ? '#ff5030' : '#d63a2a');

      // Здоровье
      this.panel(g, 48, 3, 52, 27);
      g.fillStyle = '#c62828'; g.fillRect(52, 8, 3, 9); g.fillRect(50, 11, 7, 3);
      this.num(g, String(Math.ceil(P.health)) + '%', 98, 12, true, P.health <= 25 ? '#ff5030' : '#d63a2a');

      // Оружие 1..5: имеющееся — жёлтое, текущее — белая рамка
      this.panel(g, 102, 3, 33, 27);
      for (let i = 0; i < 5; i++) {
        const x = 106 + (i % 3) * 9, y = i < 3 ? 8 : 18;
        if (i === P.weapon) { g.fillStyle = '#ddd'; g.fillRect(x - 1, y - 1, 5, 7); g.fillStyle = '#1e1e1e'; g.fillRect(x, y, 3, 5); }
        this.num(g, String(i + 1), x + 2, y, false, P.weapons[i] ? '#e8c010' : '#4a4a4a');
      }

      // Лицо
      this.panel(g, 137, 2, 32, 29);
      this.face(g, 139, 3);

      // Броня
      this.panel(g, 171, 3, 52, 27);
      g.fillStyle = '#2f6db0'; g.fillRect(175, 8, 8, 8); g.fillRect(177, 16, 4, 2);
      g.fillStyle = '#5b9bd5'; g.fillRect(176, 9, 3, 5);
      this.num(g, String(Math.ceil(P.armor)) + '%', 221, 12, true, '#d63a2a');

      // Ключи
      this.panel(g, 225, 3, 16, 27);
      const kc = ['', '#e53935', '#3d6df0', '#f2c914'];
      for (let i = 1; i < 4; i++) {
        g.fillStyle = '#111'; g.fillRect(229, 4 + i * 8 - 6, 8, 6);
        g.fillStyle = P.keys[i] ? kc[i] : '#2a2a2a'; g.fillRect(230, 4 + i * 8 - 5, 6, 4);
      }

      // Таблица патронов
      this.panel(g, 243, 3, 75, 27);
      for (let i = 0; i < AMMO_ROWS.length; i++) {
        const t = AMMO_ROWS[i][0], y = 6 + i * 8;
        g.fillStyle = AMMO_ROWS[i][1]; g.fillRect(246, y, 4, 5);
        this.num(g, String(P.ammo[t]), 276, y, false, '#e8c010');
        this.num(g, '/', 281, y, false, '#888');
        this.num(g, String(P.ammoMax[t]), 302, y, false, '#e8c010');
      }
    },

    // Лицо 26x26 в точке (x, y)
    face(g, x, y) {
      const P = G.Player;
      const st = this.faceState();
      const tier = Math.floor(st / 100), mood = Math.floor(st / 10) % 10, look = (st % 10) - 1;
      const skin = mood === 3 ? '#8a8a82' : ['#e0b080', '#d6a478', '#c99a72', '#b88a68', '#9a7258'][tier];
      g.fillStyle = '#111'; g.fillRect(x, y, 28, 27);
      g.fillStyle = '#2a2a2a'; g.fillRect(x + 1, y + 1, 26, 25);
      // Голова
      g.fillStyle = skin;
      g.fillRect(x + 6, y + 4, 16, 20); g.fillRect(x + 5, y + 7, 18, 14); g.fillRect(x + 8, y + 24, 12, 2);
      // Волосы
      g.fillStyle = '#3a2412';
      g.fillRect(x + 6, y + 3, 16, 4); g.fillRect(x + 5, y + 5, 3, 4); g.fillRect(x + 20, y + 5, 3, 4);
      const lx = look;                                  // сдвиг зрачков и черт в сторону взгляда
      // Брови
      g.fillStyle = '#2a1a0c';
      const angry = mood === 1 || tier >= 3;
      g.fillRect(x + 7 + lx, y + 10 + (angry ? 1 : 0), 5, 1); g.fillRect(x + 16 + lx, y + 10 + (angry ? 1 : 0), 5, 1);
      // Глаза
      if (mood === 3) {
        g.fillStyle = '#222';
        for (let k = 0; k < 2; k++) { const ex = x + 8 + k * 9 + lx; g.fillRect(ex, y + 12, 1, 1); g.fillRect(ex + 2, y + 12, 1, 1); g.fillRect(ex + 1, y + 13, 1, 1); g.fillRect(ex, y + 14, 1, 1); g.fillRect(ex + 2, y + 14, 1, 1); }
      } else if (mood === 1) {
        g.fillStyle = '#222'; g.fillRect(x + 8 + lx, y + 13, 4, 1); g.fillRect(x + 17 + lx, y + 13, 4, 1);
      } else {
        g.fillStyle = '#f4f4f4'; g.fillRect(x + 8 + lx, y + 12, 4, 3); g.fillRect(x + 17 + lx, y + 12, 4, 3);
        g.fillStyle = '#222'; g.fillRect(x + 9 + lx + (look > 0 ? 1 : 0), y + 12, 2, 3); g.fillRect(x + 18 + lx + (look > 0 ? 1 : 0), y + 12, 2, 3);
      }
      // Нос
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 13 + lx, y + 15, 2, 3);
      // Рот
      if (mood === 2) {                                  // ухмылка
        g.fillStyle = '#222'; g.fillRect(x + 9, y + 19, 10, 4);
        g.fillStyle = '#f4f4f4'; g.fillRect(x + 10, y + 20, 8, 2);
      } else if (mood === 1) {                           // боль: открытый рот
        g.fillStyle = '#400'; g.fillRect(x + 11, y + 19, 6, 4);
      } else if (mood === 3) {
        g.fillStyle = '#222'; g.fillRect(x + 10, y + 21, 8, 1);
      } else {
        g.fillStyle = '#6a2a1a'; g.fillRect(x + 10 + lx, y + 21, 8, 1);
      }
      // Кровь и ссадины растут с уроном
      g.fillStyle = '#b01818';
      if (tier >= 1) g.fillRect(x + 7, y + 8, 1, 4);
      if (tier >= 2) { g.fillRect(x + 20, y + 14, 1, 5); g.fillRect(x + 19, y + 17, 3, 1); }
      if (tier >= 3) { g.fillRect(x + 12, y + 7, 1, 3); g.fillRect(x + 8, y + 16, 2, 1); g.fillRect(x + 22, y + 9, 1, 4); }
      if (tier >= 4 || mood === 3) { g.fillRect(x + 14, y + 4, 2, 6); g.fillRect(x + 10, y + 17, 1, 5); g.fillRect(x + 16, y + 15, 1, 6); }
    }
  };
})(window.GAME);
