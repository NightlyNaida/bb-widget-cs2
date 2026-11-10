// Player animation adapter. Both the match simulation and lab use these functions.
(() => {
  const base = window.csMotion;
  const health = new WeakMap(), effects = new WeakMap(), demos = new WeakMap();
  const reduced = options => options.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const factor = options => options.durationScale || 1;
  const rules = () => [...document.styleSheets].flatMap(s => { try { return [...s.cssRules]; } catch { return []; } });
  const css = (selector, property) => rules().filter(r => r.selectorText?.split(',').some(s => s.trim() === selector))
    .map(r => r.style.getPropertyValue(property)).filter(Boolean).at(-1) || '';
  const ms = value => parseFloat(value) * (value.trim().endsWith('ms') ? 1 : 1000);
  const configs = {
    hit: ['.cs-player.is-hit', 'is-hit', 'cs-hit', 'Вспышка урона'],
    weapon: ['.cs-player__weapon.is-bought', 'is-bought', 'cs-bought', 'Покупка оружия'],
    grenade: ['.cs-player__nade.is-new', 'is-new', 'cs-nade-in', 'Покупка гранаты'],
    action: ['.cs-player__action', null, 'cs-action-in', 'Появление действия'],
    highlight: ['.cs-player.is-highlight', 'is-highlight', 'cs-highlight', 'Один цикл выделения'],
    ace: ['.cs-player__badge', null, 'cs-badge-in', 'Появление Ace'],
  };
  function effectSpec(kind) {
    const [selector,, name, label] = configs[kind];
    const frames = rules().find(r => r.name === name && r.cssRules);
    return { name, label, duration: ms(css(selector, 'animation-duration')), delay: 0,
      easing: css(selector, 'animation-timing-function'),
      frames: [...frames.cssRules].map(f => ({ offset: f.keyText, css: f.style.cssText })) };
  }
  function playerEffect(node, kind, options = {}) {
    effects.get(node)?.();
    const [, className] = configs[kind], spec = effectSpec(kind);
    node.style.animation = 'none'; if (className) node.classList.remove(className);
    void node.offsetWidth;
    if (className) node.classList.add(className);
    if (reduced(options)) return Promise.resolve();
    node.style.removeProperty('animation');
    node.style.animationDuration = `${spec.duration * factor(options)}ms`;
    if (options.singleCycle) node.style.animationIterationCount = '1';
    return new Promise(resolve => {
      let timer;
      const finish = () => {
        clearTimeout(timer); node.removeEventListener('animationend', ended);
        node.style.removeProperty('animation-duration');
        if (options.singleCycle) { node.style.animation = 'none'; node.style.removeProperty('animation-iteration-count'); }
        if (['hit', 'weapon', 'grenade'].includes(kind)) node.classList.remove(className);
        effects.delete(node); resolve();
      };
      const ended = event => { if (event.target === node) finish(); };
      effects.set(node, finish); node.addEventListener('animationend', ended);
      timer = setTimeout(finish, spec.duration * factor(options) + 40);
    });
  }
  function playerHealth(row, value, options = {}) {
    const previous = health.get(row); previous?.cancel?.();
    const fill = row.querySelector('.cs-player__hp-fill');
    const duration = ms(css('.cs-player__hp-fill', 'transition-duration'));
    const immediate = options.instant || reduced(options) || previous === undefined;
    fill.style.transitionDuration = immediate ? '0s' : `${duration * factor(options)}ms`;
    row.style.setProperty('--hp', value + '%');
    row.classList.toggle('cs-player--killed', value <= 0);
    row.querySelector('.cs-player__hp-value').textContent = value;
    row.querySelector('.cs-player__hp').setAttribute('aria-label', `HP ${value}`);
    void fill.offsetWidth;
    if (immediate || previous?.value === value) {
      fill.style.removeProperty('transition-duration'); health.set(row, { value }); return Promise.resolve();
    }
    return new Promise(resolve => {
      const cancel = () => { clearTimeout(timer); fill.style.removeProperty('transition-duration'); health.set(row, { value }); resolve(); };
      const timer = setTimeout(cancel, duration * factor(options) + 40);
      health.set(row, { value, cancel });
    });
  }
  function playerActionProgress(row, progress, seconds) {
    row.style.setProperty('--progress', Math.max(0, Math.min(1, progress)));
    row.querySelector('.cs-player__action-time').textContent = Math.max(0, seconds).toFixed(1);
  }
  const actionDurations = Object.freeze({ plant: 3, defuse: 7 });
  const initial = { hp: 100 };
  const playerCases = [
    { id: 'damage', label: 'Урон · 100 → 64', from: initial, to: { hp: 64 }, effect: 'hit', description: 'Полоса HP сокращается за 400 мс. Одновременно карточка вспыхивает красным на 450 мс; число меняется сразу.' },
    { id: 'death', label: 'Смерть · 32 → 0', from: { hp: 32 }, to: { hp: 0 }, effect: 'hit', description: 'HP уходит в ноль. Содержимое сразу приглушается до 40%; отдельного fade смерти нет. Вспышка урона остаётся той же.' },
    { id: 'respawn', label: 'Новый раунд', from: { hp: 0 }, to: initial, description: 'HP возвращается к 100 с тем же переходом ширины. Яркость содержимого восстанавливается сразу.' },
    { id: 'same', label: 'Без изменения', from: initial, to: initial, description: 'Повторная отрисовка того же HP не запускает движение.' },
    { id: 'weapon', label: 'Покупка оружия', from: { hp: 100, weapon: false }, to: initial, effect: 'weapon', description: 'Купленное оружие опускается на место: −8 px → 0, scale 1.4 → 1, brightness 2 → 1, opacity 0 → 1.' },
    { id: 'grenade', label: 'Покупка гранаты', from: { hp: 100, grenade: false }, to: initial, effect: 'grenade', description: 'Новая граната появляется из масштаба 0.4 со смещением −8 px. Исходный наклон 30° сохраняется.' },
    { id: 'plant', label: 'Установка', from: initial, to: { hp: 100, action: 'plant' }, effect: 'action', description: 'Действие заменяет статистику и экипировку: появляется за 300 мс со сдвигом 4 px. Прогресс заполняется линейно за 3 с; это время установки из симуляции.' },
    { id: 'defuse', label: 'Разминирование', from: initial, to: { hp: 100, action: 'defuse' }, effect: 'action', description: 'Та же плашка действия с другим значком. В текущей симуляции разминирование занимает 7 с; прогресс и отсчёт используют общий runtime.' },
    { id: 'highlight', label: 'Выделение', from: initial, to: { hp: 100, highlight: true }, effect: 'highlight', description: 'Контур и свечение пульсируют с периодом 1.6 с. Здесь проигрывается один цикл; в игре эффект повторяется, пока игрок выделен.' },
    { id: 'ace', label: 'Ace', from: initial, to: { hp: 100, highlight: true, ace: true }, effect: 'ace', description: 'Символ и подпись Ace вырастают из scale 0 за 500 мс. Одновременно продолжается пульсация выделенного игрока.' },
  ];
  function playerContent(row, value) {
    row.className = 'cs-player cs-player--left';
    row.innerHTML = `<div class="cs-player__main"><div class="cs-player__hp"><span class="cs-player__hp-fill"></span><p class="cs-player__name">b1t</p>${value.ace ? '<span class="cs-player__badge">Ace</span>' : ''}<p class="cs-player__money">$4.8K</p><p class="cs-player__hp-value"></p></div><div class="cs-player__stats"><p class="cs-player__kd"><i class="cs-player__kd-icon cs-player__kd-icon--kills"></i>14<i class="cs-player__kd-icon cs-player__kd-icon--deaths"></i>12</p><i class="cs-player__weapon${value.weapon === false ? ' is-empty' : ''}" style='--weapon:url("assets/weapons/ak47.png")'></i><div class="cs-player__utility">${value.grenade === false ? '' : '<img class="cs-player__nade" src="assets/utility/he.png" alt="HE">'}</div></div></div>`;
    if (value.highlight) row.classList.add('is-highlight');
    if (value.action) {
      row.classList.add('is-acting');
      row.firstChild.insertAdjacentHTML('beforeend', `<div class="cs-player__action cs-player__action--${value.action}"><i class="cs-player__action-icon"></i><p class="cs-player__action-label">${value.action === 'plant' ? 'Закладывает' : 'Разминирует'}</p><p class="cs-player__action-time"></p><span class="cs-player__action-bar"></span></div>`);
      playerActionProgress(row, 0, actionDurations[value.action]);
    }
  }
  function resetPlayer(row, value) {
    demos.get(row)?.(); health.get(row)?.cancel?.();
    for (const node of [row, ...row.querySelectorAll('*')]) effects.get(node)?.();
    row.style.removeProperty('animation'); row.style.removeProperty('--progress');
    playerContent(row, value); health.delete(row); playerHealth(row, value.hp, { instant: true });
  }
  async function playPlayer(id, row, options) {
    const item = playerCases.find(c => c.id === id) || playerCases[0];
    resetPlayer(row, item.from); void row.offsetWidth;
    if (item.effect && !['hit'].includes(item.effect)) {
      playerContent(row, item.to); playerHealth(row, item.to.hp, { instant: true });
    }
    const pending = [playerHealth(row, item.to.hp, options)];
    if (item.effect) {
      const selector = { hit: null, highlight: null, weapon: '.cs-player__weapon', grenade: '.cs-player__nade', action: '.cs-player__action', ace: '.cs-player__badge' }[item.effect];
      pending.push(playerEffect(selector ? row.querySelector(selector) : row, item.effect, { ...options, singleCycle: true }));
      if (item.effect === 'ace') pending.push(playerEffect(row, 'highlight', { ...options, singleCycle: true }));
    }
    if (item.to.action) {
      const seconds = actionDurations[item.to.action];
      if (reduced(options)) playerActionProgress(row, 1, 0);
      else pending.push(new Promise(resolve => {
        const start = performance.now(), duration = seconds * 1000 * factor(options); let raf;
        const cancel = () => { cancelAnimationFrame(raf); demos.delete(row); resolve(); };
        const tick = now => { const p = Math.min(1, (now - start) / duration); playerActionProgress(row, p, seconds * (1 - p)); if (p < 1) raf = requestAnimationFrame(tick); else cancel(); };
        demos.set(row, cancel); raf = requestAnimationFrame(tick);
      }));
    }
    await Promise.all(pending);
  }
  function describePlayer(id) {
    const item = playerCases.find(c => c.id === id) || playerCases[0], phases = [];
    if (item.from.hp !== item.to.hp) phases.push({ label: 'Ширина полосы HP', duration: ms(css('.cs-player__hp-fill', 'transition-duration')), delay: 0, easing: css('.cs-player__hp-fill', 'transition-timing-function'), frames: [{ offset: '0%', css: `width: ${item.from.hp}%;` }, { offset: '100%', css: `width: ${item.to.hp}%;` }] });
    if (item.effect) phases.push(effectSpec(item.effect));
    if (item.effect === 'ace') phases.push(effectSpec('highlight'));
    if (item.to.action) phases.push({ label: 'Прогресс игрового действия', duration: actionDurations[item.to.action] * 1000, delay: 0, easing: 'linear', frames: [{ offset: '0%', css: 'transform: scaleX(0);' }, { offset: '100%', css: 'transform: scaleX(1);' }] });
    return { ...item, phases, total: Math.max(0, ...phases.map(p => p.duration)), geometry: 'HP: ширина от края своей команды. Урон меняет фон. Оружие и гранаты сохраняют исходное направление; соседние элементы не сдвигаются. Отсутствующий в keyframes конечный кадр берётся из обычного CSS элемента.' };
  }
  window.csMotion = Object.freeze({ ...base, playerHealth, playerEffect, playerActionProgress, actionDurations,
    cases: { ...base.cases, player: playerCases },
    reset: (kind, row, value) => kind === 'player' ? resetPlayer(row, value) : base.reset(kind, row, value),
    play: (kind, id, row, options = {}) => kind === 'player' ? playPlayer(id, row, options) : base.play(kind, id, row, options),
    describe: (kind, id) => kind === 'player' ? describePlayer(id) : base.describe(kind, id),
  });
})();
