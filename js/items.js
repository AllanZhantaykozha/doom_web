// Предметы на уровне: определения, создание, подбор.
(function (G) {
  'use strict';
  const C = G.CONFIG;

  // Каждое определение: спрайт, размер в клетках, высота над полом, pickup(player) -> сообщение | null.
  // null означает «не подобрано» (например, здоровье уже полное), предмет остаётся лежать.
  const DEFS = {
    h: { sprite: 'medkitS', size: 0.4, z: 0, pickup: (p) => p.heal(10, 100) ? 'Малая аптечка (+10)' : null },
    H: { sprite: 'medkitL', size: 0.55, z: 0, pickup: (p) => p.heal(25, 100) ? 'Большая аптечка (+25)' : null },
    a: { sprite: 'armor', size: 0.5, z: 0, pickup: (p) => p.addArmor(50, 100) ? 'Бронежилет (+50)' : null },
    c: { sprite: 'clip', size: 0.4, z: 0, pickup: (p) => p.addAmmo('bullets', 10) ? 'Обойма (+10 пуль)' : null },
    s: { sprite: 'shells', size: 0.45, z: 0, pickup: (p) => p.addAmmo('shells', 4) ? 'Патроны к дробовику (+4)' : null },
    r: { sprite: 'keyR', size: 0.4, z: 0.12, pickup: (p) => { p.giveKey(1); return 'Красный ключ'; } },
    b: { sprite: 'keyB', size: 0.4, z: 0.12, pickup: (p) => { p.giveKey(2); return 'Синий ключ'; } },
    y: { sprite: 'keyY', size: 0.4, z: 0.12, pickup: (p) => { p.giveKey(3); return 'Жёлтый ключ'; } },
    X: { sprite: 'exit', size: 0.8, z: 0, exit: true }
  };

  const Items = G.Items = {
    list: [],

    has(ch) { return DEFS[ch] !== undefined; },

    reset() { this.list = []; },

    spawn(ch, x, y) {
      const def = DEFS[ch];
      this.list.push({
        x, y, def,
        tex: G.Sprites.items[def.sprite],   // поля x, y, tex, size, z, active — общий интерфейс «рисуемого» для рендера
        size: def.size,
        z: def.z,
        active: true
      });
      if (!def.exit) G.Map.itemsTotal++;
    },

    // Подбор предметов. Вызывается каждый тик. Без аллокаций.
    update(px, py) {
      const r2 = C.PICKUP_RADIUS * C.PICKUP_RADIUS;
      const list = this.list;
      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        if (!it.active) continue;
        const dx = it.x - px, dy = it.y - py;
        if (dx * dx + dy * dy > r2) continue;
        if (it.def.exit) { G.Game.pendingExit = true; continue; }
        const msg = it.def.pickup(G.Player);
        if (msg) {
          it.active = false;
          G.Map.itemsFound++;
          G.Player.dirty = true;
          G.Game.message(msg);
        }
      }
    }
  };
})(window.GAME);
