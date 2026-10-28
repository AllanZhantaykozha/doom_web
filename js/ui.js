// Экраны поверх игры: смерть, итоги уровня, победа. DOM-слой (кириллица и таблица без своего шрифта).
// Меню, настройки и мини-карта появятся на этапе 6.
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

  G.UI = {
    el: null,

    init(onConfirm) {
      this.el = document.getElementById('endscreen');
      this.el.addEventListener('click', onConfirm);
    },

    // st — {kills, killsTotal, items, itemsTotal, secrets, secretsTotal, time}
    show(kind, st, info) {
      const titles = { death: 'ВЫ ПОГИБЛИ', intermission: 'УРОВЕНЬ ПРОЙДЕН', victory: 'ПОБЕДА' };
      const hints = {
        death: 'Enter или клик — начать уровень заново',
        intermission: info.next ? 'Enter или клик — «' + info.next + '»' : 'Enter или клик — продолжить',
        victory: 'Enter или клик — новая игра'
      };
      const sub = kind === 'victory' ? 'Гнилой страж повержен. Цитадель пала.' : info.name;
      this.el.className = kind;
      this.el.innerHTML =
        '<h1>' + titles[kind] + '</h1>' +
        '<h2>' + sub + '</h2>' +
        '<table>' +
          row('Враги', st.kills, st.killsTotal) +
          row('Предметы', st.items, st.itemsTotal) +
          row('Секреты', st.secrets, st.secretsTotal) +
          '<tr><td>Время</td><td colspan="2">' + fmtTime(st.time) + '</td></tr>' +
        '</table>' +
        '<p class="hint">' + hints[kind] + '</p>';
      this.el.hidden = false;
    },

    hide() { this.el.hidden = true; }
  };
})(window.GAME);
