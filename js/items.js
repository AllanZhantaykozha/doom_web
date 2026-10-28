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
    o: { sprite: 'rocketBox', size: 0.4, z: 0, pickup: (p) => p.addAmmo('rockets', 2) ? 'Ракеты (+2)' : null },
    w: { sprite: 'wShotgun', size: 0.6, z: 0, pickup: (p) => p.giveWeapon(2, 'shells', 8) ? 'Дробовик!' : null },
    W: { sprite: 'wChaingun', size: 0.6, z: 0, pickup: (p) => p.giveWeapon(3, 'bullets', 20) ? 'Автомат!' : null },
    x: { sprite: 'wRocket', size: 0.6, z: 0, pickup: (p) => p.giveWeapon(4, 'rockets', 2) ? 'Ракетница!' : null },
    i: { sprite: 'sphereI', size: 0.45, z: 0.1, pickup: (p) => { p.invuln = C.SPHERE.invuln; return 'Сфера неуязвимости!'; } },
    d: { sprite: 'sphereD', size: 0.45, z: 0.1, pickup: (p) => { p.quad = C.SPHERE.quad; return 'Сфера ярости: урон ×' + C.SPHERE.quadMul + '!'; } },
    X: { sprite: 'exit', size: 0.8, z: 0, exit: true }
  };

  const Items = G.Items = {
    list: [],

    has(ch) { return DEFS[ch] !== undefined; },

    reset() { this.list = []; },

    // dropped=true — выпавшие из врагов предметы не входят в процент «предметы»
    spawn(ch, x, y, dropped) {
      const def = DEFS[ch];
      this.list.push({
        x, y, def,
        tex: G.Sprites.items[def.sprite],   // поля x, y, tex, size, z, active — общий интерфейс «рисуемого» для рендера
        size: def.size,
        z: def.z,
        dropped: !!dropped,
        active: true
      });
      if (!def.exit && !dropped) G.Map.itemsTotal++;
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
          if (!it.dropped) G.Map.itemsFound++;
          G.Player.dirty = true;
          G.Player.pickupFlash = 0.6;
          G.Game.message(msg);
        }
      }
    }
  };
})(window.GAME);
