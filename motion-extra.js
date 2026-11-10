// Isolated previews of the widget's CSS effects. Timings and frames come from production CSS.
(() => {
  const base = window.csMotion, runs = new WeakMap();
  const rules = () => [...document.styleSheets].flatMap(s => { try { return [...s.cssRules]; } catch { return []; } });
  const css = (selector, property) => rules().filter(r => r.selectorText?.split(',').some(s => s.trim() === selector)).map(r => r.style.getPropertyValue(property)).filter(Boolean).at(-1) || '';
  const ms = s => parseFloat(s) * (s.trim().endsWith('ms') ? 1 : 1000);
  const effects = {
    beep: ['.cs-fx.is-beep', 'cs-beep', 'Контур табло'],
    timer: ['.cs-status.is-beep', 'cs-status-beep', 'Чип таймера'],
    demining: ['.cs-fx.is-defusing', 'cs-defusing', 'Разминирование'],
    defused: ['.cs-fx.is-defused', 'cs-defused', 'Бомба обезврежена'],
    explode: ['.cs-fx.is-explode', 'cs-explode', 'Вспышка взрыва'],
    shake: ['.cs-widget.is-shake', 'cs-shake', 'Встряска табло'],
    live: ['.cs-mapscore__live', 'cs-live-blink', 'Индикатор текущей карты'],
    skeleton: ['.cs-embed__body span', 'cs-skeleton', 'Блик загрузки'],
  };
  const cases = {
    effects: [
      { id: 'beep', label: 'Тик бомбы', trigger: 'Бомба установлена: очередной сигнал таймера.', description: 'Одновременно вспыхивают край табло и чип времени. Здесь один сигнал; в игре интервал сокращается от 1000 до 180 мс по мере истечения таймера.', effects: ['beep', 'timer'] },
      { id: 'demining', label: 'Разминирование', trigger: 'Игрок начал обезвреживать бомбу.', description: 'Синий контур плавно пульсирует. Здесь один цикл; в игре повторяется до отмены или завершения действия.', effects: ['demining'] },
      { id: 'defused', label: 'Обезврежена', trigger: 'Получен результат успешного обезвреживания.', description: 'Одна синяя волна расходится и затухает.', effects: ['defused'] },
      { id: 'explode', label: 'Взрыв', trigger: 'Таймер установленной бомбы истёк.', description: 'Жёлтая вспышка и короткая встряска всего табло запускаются одновременно.', effects: ['explode', 'shake'] },
    ],
    map: [{ id: 'live', label: 'Текущая карта', trigger: 'Карта имеет состояние Live.', description: 'Точка текущей карты меняет прозрачность. Эффект непрерывно повторяется, пока карта идёт.', effects: ['live'] }],
    loading: [{ id: 'skeleton', label: 'Ожидание данных', trigger: 'Открыт блок статистики, содержимое ещё загружается.', description: 'Блик проходит по строкам заглушки. Это текущая заглушка прототипа; правила отсутствия HP и K/D будут определены отдельно.', effects: ['skeleton'] }],
    rosters: [
      { id: 'close', label: 'Свернуть', from: true, to: false, trigger: 'Нажатие кнопки сворачивания широкого табло.', description: 'Составы и видео исчезают, высота блока уменьшается до нуля. Шапка и история остаются.' },
      { id: 'open', label: 'Развернуть', from: false, to: true, trigger: 'Нажатие кнопки раскрытия широкого табло.', description: 'Высота блока восстанавливается, содержимое появляется с задержкой. Мобильное переключение составов не использует эту анимацию.' },
    ],
  };
  function phase(key) {
    const [selector, name, label] = effects[key], rule = rules().find(r => r.name === name && r.cssRules);
    return { label, name, duration: ms(css(selector, 'animation-duration')), delay: 0, easing: css(selector, 'animation-timing-function'), frames: [...rule.cssRules].map(f => ({ offset: f.keyText, css: f.style.cssText })) };
  }
  function describe(kind, id) {
    const item = cases[kind].find(c => c.id === id) || cases[kind][0];
    let phases = (item.effects || []).map(phase);
    if (kind === 'rosters') {
      const selector = item.to ? '.cs-rosters' : '.cs-widget.is-collapsed .cs-rosters';
      const properties = css(selector, 'transition-property').split(',');
      const durations = css(selector, 'transition-duration').split(',').map(ms);
      const delays = css(selector, 'transition-delay').split(',').map(ms);
      const easings = css(selector, 'transition-timing-function').match(/cubic-bezier\([^)]*\)|[\w-]+/g);
      phases = properties.map((p, i) => ({ label: p.trim(), name: p.trim(), duration: durations[i % durations.length], delay: delays[i % delays.length], easing: easings[i % easings.length], frames: [
        { offset: 'from', css: p.trim() === 'height' ? (item.from ? 'height: фактическая высота;' : 'height: 0;') : p.trim() === 'opacity' ? `opacity: ${+item.from};` : (item.from ? 'margin-top: 0;' : 'margin-top: -var(--hd-gap);') },
        { offset: 'to', css: p.trim() === 'height' ? (item.to ? 'height: scrollHeight;' : 'height: 0;') : p.trim() === 'opacity' ? `opacity: ${+item.to};` : (item.to ? 'margin-top: 0;' : 'margin-top: -var(--hd-gap);') },
      ] }));
    }
    return { ...item, phases, total: Math.max(...phases.map(p => p.duration + p.delay)), geometry: kind === 'rosters' ? 'Анимируется фактическая высота области составов и медиа. Ширина не меняется.' : 'Используются исходные CSS keyframes табло. Текущая карта и разминирование повторяются непрерывно.' };
  }
  function nodes(root) { return [root, ...root.querySelectorAll('*')]; }
  function reset(kind, root, value) {
    runs.get(root)?.();
    nodes(root).forEach(n => { n.style.animation = 'none'; n.getAnimations().forEach(a => a.cancel()); });
    if (kind === 'rosters') {
      const body = root.querySelector('.cs-rosters'); body.style.transition = 'none'; root.classList.toggle('is-collapsed', !value);
      body.style.height = value ? '156px' : '0px'; void body.offsetHeight;
    }
  }
  async function play(kind, id, root, options = {}) {
    const spec = describe(kind, id), scale = options.durationScale || 1;
    reset(kind, root, spec.from);
    const reduced = options.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (kind === 'rosters') {
      const body = root.querySelector('.cs-rosters');
      if (!reduced) body.style.transition = spec.phases.map(p => `${p.name} ${p.duration * scale}ms ${p.easing} ${p.delay * scale}ms`).join(',');
      void body.offsetHeight; root.classList.toggle('is-collapsed', !spec.to); body.style.height = spec.to ? '156px' : '0px';
    } else if (!reduced) {
      for (const [i, key] of spec.effects.entries()) {
        const p = spec.phases[i];
        const targets = key === 'shake' ? [root] : [...root.querySelectorAll(key === 'timer' ? '.cs-status' : key === 'live' ? '.cs-mapscore__live' : key === 'skeleton' ? '.cs-embed__body span' : '.cs-fx')];
        targets.forEach(n => { n.style.animation = `${p.name} ${p.duration * scale}ms ${p.easing} ${kind === 'map' || id === 'demining' ? 'infinite' : '1'}`; });
      }
    }
    if (reduced) return;
    await new Promise(resolve => {
      const finish = () => { clearTimeout(timer); runs.delete(root); resolve(); };
      const timer = setTimeout(finish, spec.total * scale + 40); runs.set(root, finish);
    });
  }
  window.csMotion = Object.freeze({ ...base, cases: { ...base.cases, ...cases },
    describe: (kind, id) => cases[kind] ? describe(kind, id) : base.describe(kind, id),
    reset: (kind, root, value) => cases[kind] ? reset(kind, root, value) : base.reset(kind, root, value),
    play: (kind, id, root, options) => cases[kind] ? play(kind, id, root, options) : base.play(kind, id, root, options),
  });
})();
