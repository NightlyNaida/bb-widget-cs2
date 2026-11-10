// Shared motion runtime: the scoreboard and its isolated demos use the same functions and CSS.
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const pulses = new WeakMap(), rolls = new WeakMap(), balances = new WeakMap(), roundEntries = new WeakMap(), collapses = new WeakMap();
  const BUMP_HOLD_MS = 300;
  const ms = value => parseFloat(value) * (value.trim().endsWith('ms') ? 1 : 1000);
  const still = options => reduced.matches || options.reducedMotion;
  const scale = options => options.durationScale || 1;
  function rules() {
    return [...document.styleSheets].flatMap(sheet => {
      try { return [...sheet.cssRules]; } catch { return []; }
    });
  }
  function declaration(selector, property) {
    return rules().filter(rule => rule.selectorText?.split(',').map(s => s.trim()).includes(selector))
      .map(rule => rule.style.getPropertyValue(property)).filter(Boolean).at(-1) || '';
  }
  function frames(name) {
    const rule = rules().find(rule => rule.name === name && rule.cssRules);
    return rule ? [...rule.cssRules].map(frame => ({ offset: frame.keyText, css: frame.style.cssText })) : [];
  }
  function pulseTiming() {
    const duration = ms(declaration('.cs-money', 'transition-duration') || '.3s');
    return { duration, hold: BUMP_HOLD_MS, total: BUMP_HOLD_MS + duration,
      easing: declaration('.cs-money', 'transition-timing-function') || 'ease',
      transform: declaration('.cs-money.is-bump', 'transform') || 'scale(1.15)' };
  }
  function rollTiming(incoming) {
    const selector = `.cs-odo__digit.is-${incoming ? 'in' : 'out'}`;
    return { duration: ms(declaration(selector, 'animation-duration')),
      delay: ms(declaration(selector, 'animation-delay') || '0s'),
      easing: declaration(selector, 'animation-timing-function') };
  }
  function bump(node, options = {}) {
    pulses.get(node)?.();
    if (still(options)) return Promise.resolve();
    const timing = pulseTiming(), factor = scale(options);
    return new Promise(resolve => {
      const timers = [];
      const cancel = () => {
        timers.forEach(clearTimeout); node.classList.remove('is-bump');
        node.style.removeProperty('transition-duration'); pulses.delete(node); resolve();
      };
      pulses.set(node, cancel);
      if (factor !== 1) node.style.transitionDuration = `${timing.duration * factor}ms`;
      node.classList.remove('is-bump'); void node.offsetWidth; node.classList.add('is-bump');
      timers.push(setTimeout(() => node.classList.remove('is-bump'), timing.hold * factor));
      timers.push(setTimeout(cancel, timing.total * factor));
    });
  }
  const formatBalance = value => (Math.round(value / 100) / 10) + 'K';
  function balance(node, value, options = {}) {
    const previous = balances.get(node);
    balances.set(node, value);
    node.querySelector('.cs-chip-text').textContent = formatBalance(value);
    // Compare raw amounts: even a top-up hidden by K-rounding must animate.
    return previous !== undefined && value > previous ? bump(node, options) : Promise.resolve();
  }
  function digit(value) { const span = document.createElement('span'); span.className = 'cs-odo__digit'; span.textContent = String(value); return span; }
  function odometer(node, value, options = {}) {
    rolls.get(node)?.();
    const current = node.querySelector('.cs-odo__digit:not(.is-out)'), next = String(value);
    if (current?.textContent === next) return Promise.resolve();
    if (!current || still(options)) { node.replaceChildren(digit(next)); return Promise.resolve(); }
    const reverse = Number(next) < Number(current.textContent), incoming = digit(next), factor = scale(options);
    const out = rollTiming(false), into = rollTiming(true);
    current.className = `cs-odo__digit is-out${reverse ? ' is-rev' : ''}`;
    incoming.className = `cs-odo__digit is-in${reverse ? ' is-rev' : ''}`;
    if (factor !== 1) {
      current.style.animationDuration = `${out.duration * factor}ms`;
      incoming.style.animationDuration = `${into.duration * factor}ms`;
      incoming.style.animationDelay = `${into.delay * factor}ms`;
    }
    node.append(incoming);
    return new Promise(resolve => {
      let timer;
      const settle = () => {
        clearTimeout(timer); current.remove(); incoming.className = 'cs-odo__digit';
        incoming.style.removeProperty('animation-duration'); incoming.style.removeProperty('animation-delay');
        incoming.removeEventListener('animationend', settle); rolls.delete(node); resolve();
      };
      rolls.set(node, settle); incoming.addEventListener('animationend', settle, { once: true });
      timer = setTimeout(settle, Math.max(out.duration, into.duration + into.delay) * factor + 110);
    });
  }
  function roundTiming() {
    return { duration: ms(declaration('.cs-round.is-new', 'animation-duration')),
      delay: 0, easing: declaration('.cs-round.is-new', 'animation-timing-function') };
  }
  function roundResult(node, options = {}) {
    roundEntries.get(node)?.();
    if (!node || still(options)) return Promise.resolve();
    const timing = roundTiming();
    return new Promise(resolve => {
      let timer;
      const settle = () => {
        clearTimeout(timer); node.classList.remove('is-new');
        node.style.removeProperty('animation-duration');
        node.removeEventListener('animationend', settle); roundEntries.delete(node); resolve();
      };
      roundEntries.set(node, settle);
      node.style.animationDuration = `${timing.duration * scale(options)}ms`;
      void node.offsetWidth; node.classList.add('is-new');
      node.addEventListener('animationend', settle, { once: true });
      timer = setTimeout(settle, timing.duration * scale(options) + 110);
    });
  }
  function roundContent(node, value) {
    node.classList.remove('cs-round--ongoing', 'cs-round--ct', 'cs-round--t');
    if (value.side) {
      node.classList.add(`cs-round--${value.side}`);
      const icon = document.createElement('img'); icon.className = 'cs-round__icon';
      icon.src = `assets/round-${value.icon}.svg`; icon.alt = ''; node.replaceChildren(icon);
    } else {
      node.classList.add('cs-round--ongoing');
      const number = document.createElement('p'); number.className = 'cs-round__number'; number.textContent = '8'; node.replaceChildren(number);
    }
  }
  function collapseTiming() {
    return { duration: ms(declaration('.cs-collapse__icon', 'transition-duration')),
      delay: 0, easing: declaration('.cs-collapse__icon', 'transition-timing-function') };
  }
  function collapse(node, expanded, options = {}) {
    collapses.get(node)?.();
    const icon = node.querySelector('.cs-collapse__icon');
    const same = node.getAttribute('aria-expanded') === String(expanded);
    const update = () => {
      node.setAttribute('aria-expanded', String(expanded));
      node.setAttribute('aria-label', `${expanded ? 'Свернуть' : 'Развернуть'} виджет`);
    };
    if (still(options) || options.instant) {
      icon.style.transitionDuration = '0s'; update(); void icon.offsetWidth;
      icon.style.removeProperty('transition-duration'); return Promise.resolve();
    }
    if (same) return Promise.resolve();
    const timing = collapseTiming();
    icon.style.transitionDuration = `${timing.duration * scale(options)}ms`;
    void icon.offsetWidth; update();
    return new Promise(resolve => {
      let timer;
      const finish = () => {
        clearTimeout(timer); icon.style.removeProperty('transition-duration');
        icon.removeEventListener('transitionend', finish); collapses.delete(node); resolve();
      };
      collapses.set(node, finish); icon.addEventListener('transitionend', finish, { once: true });
      timer = setTimeout(finish, timing.duration * scale(options) + 110);
    });
  }
  const cases = {
    collapse: [
      { id: 'close', label: 'Свернуть', from: true, to: false,
        description: 'Стрелка поворачивается на 180°: вверх → вниз. Кнопка остаётся в центре ленты. Здесь показано движение кнопки; высота табло меняется отдельно.' },
      { id: 'open', label: 'Развернуть', from: false, to: true,
        description: 'Обратный поворот стрелки: вниз → вверх. Размер и положение кнопки не меняются.' },
      { id: 'same', label: 'Состояние не изменилось', from: true, to: true,
        description: 'Повторное присвоение того же состояния не запускает поворот.' },
    ],
    round: [
      { id: 'elimination', label: 'Устранение · CT', from: {}, to: { side: 'ct', icon: 'elimination' }, fresh: true,
        description: 'Текущий номер заменяется результатом. Ячейка проявляется и расправляется по вертикали от 40% до полного размера; соседние ячейки неподвижны.' },
      { id: 'bomb', label: 'Взрыв · T', from: {}, to: { side: 't', icon: 'bomb' }, fresh: true,
        description: 'Победа взрывом использует тот же эффект появления результата: меняются цвет и иконка.' },
      { id: 'defuse', label: 'Обезвреживание · CT', from: {}, to: { side: 'ct', icon: 'defuse' }, fresh: true,
        description: 'При обезвреживании появляется результат CT с иконкой defuse. Тайминг общий для всех причин завершения.' },
      { id: 'time', label: 'Время истекло · CT', from: {}, to: { side: 'ct', icon: 'clock' }, fresh: true,
        description: 'Истечение времени показывает результат CT с часами и тем же эффектом появления.' },
      { id: 'existing', label: 'Повторная отрисовка', from: { side: 'ct', icon: 'elimination' }, to: { side: 'ct', icon: 'elimination' }, fresh: false,
        description: 'Уже сыгранные раунды при перерисовке ленты остаются неподвижными. Анимируется только новый результат.' },
    ],
    balance: [
      { id: 'win', label: 'Любое пополнение', from: 24300, to: 25800,
        description: 'Любое увеличение баланса сразу обновляет сумму и запускает импульс всей плашки: +15% и возврат к обычному размеру.' },
      { id: 'kill', label: 'Награда за фраг', from: 24300, to: 24600,
        description: 'Пополнение за убийство запускает тот же импульс, не дожидаясь конца раунда.' },
      { id: 'loss', label: 'Компенсация поражения', from: 24300, to: 33800,
        description: 'Пополнение проигравшей команды тоже анимируется. Причина начисления не влияет на эффект.' },
      { id: 'small', label: 'Даже +1', from: 24300, to: 24301,
        description: 'Импульс запускается по точной сумме: даже если округлённая подпись 24.3K ещё не изменилась.' },
      { id: 'purchase', label: 'Закупка', from: 25800, to: 24300,
        description: 'Уменьшение баланса обновляет сумму сразу и не запускает новый импульс.' },
      { id: 'same', label: 'Без изменения', from: 24300, to: 24300,
        description: 'Повторная отрисовка той же суммы не запускает анимацию.' },
    ],
    score: [
      { id: 'round', label: 'Победа в раунде', from: '3', to: '4', pulse: true,
        description: 'Прежнее число уходит вниз, новое приходит сверху. Одновременно цифра получает короткий импульс; фон ячейки неподвижен.' },
      { id: 'increase', label: '9 → 10', from: '9', to: '10', pulse: false,
        description: 'Увеличение при ручной корректировке: число прокручивается вниз без импульса.' },
      { id: 'decrease', label: '10 → 9', from: '10', to: '9', pulse: false,
        description: 'При уменьшении направление обратное: прежнее число уходит вверх, новое приходит снизу.' },
      { id: 'reset', label: 'Новая карта · 13 → 0', from: '13', to: '0', pulse: false,
        description: 'Сброс счёта использует то же обратное движение; отдельного эффекта для новой карты нет.' },
      { id: 'same', label: 'Без изменения · 4 → 4', from: '4', to: '4', pulse: false,
        description: 'Повторное значение не запускает анимацию.' },
    ],
  };
  function getCase(kind, id) { return cases[kind].find(item => item.id === id) || cases[kind][0]; }
  function reset(kind, target, value) {
    pulses.get(target)?.(); rolls.get(target)?.(); roundEntries.get(target)?.(); collapses.get(target)?.();
    target.getAnimations().forEach(animation => animation.cancel());
    if (kind === 'collapse') collapse(target, value, { instant: true });
    else if (kind === 'round') roundContent(target, value);
    else if (kind === 'score') target.replaceChildren(digit(value));
    else { balances.delete(target); balance(target, value); }
  }
  async function play(kind, id, target, options = {}) {
    const item = getCase(kind, id); reset(kind, target, item.from); void target.offsetWidth;
    const actions = [];
    if (kind === 'collapse') actions.push(collapse(target, item.to, options));
    else if (kind === 'round') { roundContent(target, item.to); if (item.fresh) actions.push(roundResult(target, options)); }
    else if (kind === 'score') actions.push(odometer(target, item.to, options));
    else actions.push(balance(target, item.to, options));
    if (kind === 'score' && item.pulse) actions.push(bump(target, options));
    await Promise.all(actions);
  }
  function describe(kind, id) {
    const item = getCase(kind, id), phases = [];
    if (kind === 'collapse' && item.from !== item.to) phases.push({ label: 'Поворот стрелки', name: 'transform', ...collapseTiming(),
      frames: [{ offset: '0%', css: `transform: rotate(${item.from ? 0 : 180}deg);` },
        { offset: '100%', css: `transform: rotate(${item.to ? 0 : 180}deg);` }] });
    if (kind === 'round' && item.fresh) phases.push({ label: 'Новый результат', name: 'cs-round-in', ...roundTiming(), frames: frames('cs-round-in') });
    if (kind === 'score' && item.from !== item.to) {
      const reverse = Number(item.to) < Number(item.from);
      for (const incoming of [false, true]) {
        const timing = rollTiming(incoming), name = `cs-odo-${incoming ? 'in' : 'out'}${reverse ? '-rev' : ''}`;
        phases.push({ label: incoming ? 'Новое число' : 'Прежнее число', ...timing, name, frames: frames(name) });
      }
    }
    if (kind === 'balance' ? item.to > item.from : item.pulse) {
      const timing = pulseTiming();
      phases.push({ label: kind === 'balance' ? 'Вся плашка' : 'Импульс цифры', name: 'transform',
        duration: timing.total, delay: 0, easing: timing.easing,
        frames: [{ offset: '0 мс', css: 'transform: scale(1);' },
          { offset: `${timing.hold} мс`, css: `transform: ${timing.transform};` },
          { offset: `${timing.total} мс`, css: 'transform: scale(1);' }] });
    }
    return { ...item, phases, total: Math.max(0, ...phases.map(p => p.delay + p.duration)),
      perspective: kind === 'score' ? declaration('.cs-score__value', 'perspective') : null,
      origin: kind === 'score' ? declaration('.cs-odo__digit', 'transform-origin') : '50% 50%' };
  }
  window.csMotion = Object.freeze({ bump, balance, formatBalance, odometer, roundResult, collapse, cases, reset, play, describe });
})();
