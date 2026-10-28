// Интерфейс поверх игры (DOM): главное меню, пауза, выбор сложности, настройки и экраны
// смерти / итогов уровня / победы со статистикой.
(function (G) {
  'use strict';

  const pct = (found, total) => (total > 0 ? Math.round(100 * found / total) : 100);

  function fmtTime(sec) {
    const s = Math.floor(sec), m = Math.floor(s / 60);
    return m + ':' + String(s % 60).padStart(2, '0');
  }

  function row(label, found, total) {
    return '<tr><td>' + label + '</td><td>' + found + ' / ' + total + '</td><td>' + pct(found, total) + '%</td></tr>';
  }

  const KEYS_HELP =
    'WASD — движение · Shift — бег · Мышь / стрелки — поворот<br>' +
    'Ctrl / ЛКМ — огонь · 1–5 / колесо — оружие · E / Пробел — открыть<br>' +
    'Tab — карта · Esc — пауза · F5 / F9 — быстрое сохранение / загрузка · F3 — отладка';

  const TOUCH_HELP =
    'Левая половина экрана — джойстик (до упора — бег) · правая — поворот свайпом<br>' +
    'Кнопки: огонь, «E» — открыть, ◀ ▶ — оружие, карта, пауза';

  G.UI = {
    menuEl: null, endEl: null,
    view: 'main', prev: 'main',

    init(onConfirm, onAction) {
      this.menuEl = document.getElementById('overlay');
      this.endEl = document.getElementById('endscreen');
      this.endEl.addEventListener('click', onConfirm);

      // Делегирование: все кнопки меню помечены data-act
      this.menuEl.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (b && !b.disabled) onAction(b.dataset.act);
      });
      // Настройки применяются и сохраняются сразу при изменении
      const onSetting = (e) => {
        const key = e.target.dataset && e.target.dataset.set;
        if (key) this.onSetting(e.target, key);
      };
      this.menuEl.addEventListener('input', onSetting);
      this.menuEl.addEventListener('change', onSetting);
    },

    onSetting(el, key) {
      const S = G.Settings;
      let v;
      if (el.type === 'checkbox') v = el.checked;
      else v = Number(el.value);
      S.data[key] = v;
      const out = el.parentNode.querySelector('output');
      if (out) out.textContent = v;
      S.apply();
      S.save();
    },

    // ---------- Меню ----------
    showMenu(view, note) {
      this.view = view;
      document.getElementById('msg').textContent = '';     // сообщения игры не должны просвечивать сквозь меню
      this.menuEl.innerHTML = this.menuHtml(view) + '<p class="note" id="note">' + (note || '') + '</p>';
      this.menuEl.hidden = false;
    },
    hideMenu() { this.menuEl.hidden = true; },
    note(text) {
      const n = document.getElementById('note');
      if (n) n.textContent = text;
    },

    menuHtml(view) {
      const hasSave = G.Game.hasSave();
      const btn = (act, label, dis) => '<button data-act="' + act + '"' + (dis ? ' disabled' : '') + '>' + label + '</button>';
      switch (view) {
        case 'pause':
          return '<h1>ПАУЗА</h1>' + btn('resume', 'Продолжить') + btn('save', 'Сохранить игру') +
            btn('load', 'Загрузить игру', !hasSave) + btn('settings', 'Настройки') + btn('quit', 'В главное меню');
        case 'difficulty': {
          let h = '<h1>СЛОЖНОСТЬ</h1>';
          G.CONFIG.DIFFICULTY.forEach((d, i) => {
            h += '<button data-act="diff:' + i + '">' + d.name + '<small>урон врагов ×' + d.dmg + ' · здоровье ×' + d.hp +
              ' · врагов ' + Math.round(d.count * 100) + '%</small></button>';
          });
          return h + btn('back', 'Назад');
        }
        case 'settings': return this.settingsHtml();
        default:
          return '<h1>IRONHOLLOW</h1><p class="sub">Три уровня · пять видов оружия · один босс</p>' +
            btn('new', 'Новая игра') + btn('load', 'Загрузить игру', !hasSave) + btn('settings', 'Настройки') +
            '<p class="keys">' + (document.body.classList.contains('touch') ? TOUCH_HELP : KEYS_HELP) + '</p>';
      }
    },

    settingsHtml() {
      const d = G.Settings.data;
      const range = (key, label, min, max) =>
        '<label class="row"><span>' + label + '</span><input type="range" min="' + min + '" max="' + max + '" value="' + d[key] +
        '" data-set="' + key + '"><output>' + d[key] + '</output></label>';
      const check = (key, label) =>
        '<label class="row"><span>' + label + '</span><input type="checkbox" data-set="' + key + '"' + (d[key] ? ' checked' : '') + '></label>';
      let res = '';
      G.CONFIG.RESOLUTIONS.forEach((r, i) => {
        res += '<option value="' + i + '"' + (d.res === i ? ' selected' : '') + '>' + r[0] + '×' + r[1] + '</option>';
      });
      return '<h1>НАСТРОЙКИ</h1><div class="settings">' +
        range('mouse', 'Чувствительность мыши', 1, 20) +
        range('sfx', 'Громкость звука', 0, 100) +
        range('music', 'Громкость музыки', 0, 100) +
        check('musicOn', 'Музыка') +
        range('fov', 'Угол обзора (FOV)', 50, 110) +
        '<label class="row"><span>Разрешение рендера</span><select data-set="res">' + res + '</select></label>' +
        check('fps', 'Показывать FPS') +
        '</div><button data-act="back">Назад</button>';
    },

    // ---------- Экраны ----------
    // st — {kills, killsTotal, items, itemsTotal, secrets, secretsTotal, time}
    show(kind, st, info) {
      const titles = { death: 'ВЫ ПОГИБЛИ', intermission: 'УРОВЕНЬ ПРОЙДЕН', victory: 'ПОБЕДА' };
      const hints = {
        death: 'Enter или клик — начать уровень заново',
        intermission: info.next ? 'Enter или клик — «' + info.next + '»' : 'Enter или клик — продолжить',
        victory: 'Enter или клик — новая игра'
      };
      const sub = kind === 'victory' ? 'Гнилой страж повержен. Цитадель пала.' : info.name;
      this.endEl.className = kind;
      this.endEl.innerHTML =
        '<h1>' + titles[kind] + '</h1>' +
        '<h2>' + sub + '</h2>' +
        '<table>' +
          row('Враги', st.kills, st.killsTotal) +
          row('Предметы', st.items, st.itemsTotal) +
          row('Секреты', st.secrets, st.secretsTotal) +
          '<tr><td>Время</td><td colspan="2">' + fmtTime(st.time) + '</td></tr>' +
        '</table>' +
        '<p class="hint">' + hints[kind] + '</p>';
      this.endEl.hidden = false;
    },

    hide() { this.endEl.hidden = true; }
  };
})(window.GAME);
