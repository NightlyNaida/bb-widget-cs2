(() => {
  const $ = id => document.getElementById(id);
  // One example per distinct motion; runtime edge cases remain in csMotion.
  const catalog = {
    balance: ['Баланс команды', ['win']], score: ['Счёт раундов', ['increase']],
    round: ['Результат раунда', ['elimination', 'bomb', 'defuse', 'time']],
    player: ['Карточка игрока', ['damage', 'death', 'respawn', 'weapon', 'grenade', 'plant', 'defuse', 'highlight', 'ace']],
    feed: ['Килфид', ['enter', 'sequence']], collapse: ['Кнопка сворачивания', ['close']],
    rosters: ['Сворачивание табло', ['close']],
    effects: ['Бомба и эффекты табло', ['beep', 'demining', 'defused', 'explode']],
    map: ['Текущая карта', ['live']],
  };
  const query = new URLSearchParams(location.search);
  let kind = Object.hasOwn(catalog, query.get('element')) ? query.get('element') : 'balance';
  let caseId = catalog[kind][1].includes(query.get('case')) ? query.get('case') : catalog[kind][1][0];
  let run = 0, expanded = true, timers = [];
  const noMotion = () => $('motion-reduced').checked || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const loop = () => kind === 'map' || kind === 'effects' && caseId === 'demining';
  const toggles = () => ['collapse', 'rosters'].includes(kind);
  const target = () => $({ score:'motion-score-value', balance:'motion-balance', round:'motion-round', collapse:'motion-collapse', player:'motion-player', feed:'motion-feed', effects:'motion-effects', map:'motion-map', rosters:'motion-rosters' }[kind]);
  const label = (element, id) => element === 'feed' ? (id === 'sequence' ? 'Работа всей ленты' : 'Появление одного чипа') : csMotion.cases[element].find(c => c.id === id).label;
  function current() {
    const spec = csMotion.describe(kind, caseId === 'sequence' ? 'lifecycle' : caseId);
    if (kind === 'balance') return {...spec, description:'Плашка плавно увеличивается и возвращается к исходному размеру.', trigger:'Любое пополнение значения приводит к воспроизведению анимации.'};
    if (kind === 'score') return {...spec, description:'Прежнее число уходит, новое появляется на его месте.', trigger:'Изменилось значение счётчика.'};
    if (kind === 'feed') return {...spec,
      description:caseId === 'sequence' ? 'Шесть событий с интервалом 1 с. Десктоп хранит до четырёх сообщений, мобильный — только последнее. Каждый чип живёт 6 с, затем исчезает за 900 мс.' : 'Любое событие появляется одинаково: чип проявляется со сдвигом справа.',
      trigger:'Поступило новое событие матча.', geometry:'Появление: 250 мс. Срок показа: 6000 мс с момента вставки. Уход: 600 мс затухания + 300 мс схлопывания.'};
    if (toggles()) return {...spec, description:kind === 'rosters' ? 'Одно нажатие скрывает составы и видео, следующее возвращает их. Шапка и история остаются.' : 'Нажатие поворачивает стрелку; следующее возвращает её обратно.', trigger:'Пользователь нажал кнопку сворачивания.'};
    if (kind === 'effects' && caseId === 'beep') return {...spec, description:'Сигналы учащаются по мере истечения таймера бомбы. Демо проигрывает полный отсчёт 40 с.', trigger:'Бомба установлена, до взрыва остаётся время.', geometry:'Интервал = 180 + 820 × (оставшиеся секунды / 40) мс: 40 с → 1000 мс; 20 с → 590 мс; 0 с → 180 мс. Ниже — длительности вспышек одного тика.'};
    const triggers = {
      round:'Получен новый результат завершившегося раунда.',
      damage:'HP игрока уменьшилось.', death:'HP игрока достигло нуля.', respawn:'Начался новый раунд.',
      weapon:'Игрок купил оружие.', grenade:'Игрок купил гранату.', plant:'Игрок начал установку бомбы.', defuse:'Игрок начал разминирование.',
      highlight:'В симуляции выбран игрок в фокусе события: установка, разминирование, клатч или Ace.', ace:'Игрок совершил пять убийств за раунд.',
    };
    return {...spec, trigger:spec.trigger || triggers[caseId] || triggers[kind]};
  }
  function controls() {
    const text = toggles() ? (expanded ? 'Свернуть' : 'Развернуть') : loop() ? 'Перезапустить' : 'Проиграть';
    $('motion-play').setAttribute('aria-label', text); $('motion-play').title = text;
    $('motion-play').innerHTML = toggles() ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${expanded ? 'm5 15 7-7 7 7' : 'm5 9 7 7 7-7'}" fill="none" stroke="currentColor" stroke-width="2"/></svg>` : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z" fill="currentColor"/></svg>';
    $('motion-reset').hidden = ['balance','score','rosters','collapse','map'].includes(kind);
    $('motion-reduced').closest('label').hidden = ['balance','score'].includes(kind);
  }
  function clear() {
    run++; timers.forEach(clearTimeout); timers = [];
    csMotion.reset(kind, target(), toggles() ? true : current().from);
    csMotion.feedReset($('motion-feed-desktop')); csMotion.feedReset($('motion-feed-mobile'));
    expanded = true; controls(); $('motion-play').disabled = false;
    $('motion-status').textContent = 'Готово к запуску';
  }
  function select(element, id) { clear(); kind = element; caseId = id || catalog[kind][1][0]; render(); }
  function renderNavigation() {
    $('motion-nav').replaceChildren(...Object.entries(catalog).map(([element,[title,ids]], i) => {
      const group = document.createElement('div'); group.className = 'motion-nav-group';
      const button = document.createElement('button'); button.type = 'button'; button.dataset.element = element;
      button.textContent = `${String(i+1).padStart(2,'0')}  ${title}`; button.setAttribute('aria-pressed', String(element === kind));
      button.onclick = () => select(element); group.append(button);
      if (element === kind && ids.length > 1) {
        const list = document.createElement('div'); list.className = 'motion-nav-cases';
        ids.forEach(id => { const b = document.createElement('button'); b.type = 'button'; b.dataset.case = id; b.textContent = label(element,id); b.setAttribute('aria-current',String(id === caseId)); b.onclick = () => select(element,id); list.append(b); });
        group.append(list);
      }
      return group;
    }));
  }
  function phaseCard(phase) {
    const card = document.createElement('article'); card.className = 'motion-phase';
    const title = document.createElement('h4'); title.textContent = phase.label; card.append(title);
    const dl = document.createElement('dl');
    for (const [label,value] of [['Длительность',`${phase.duration} мс`],['Задержка',`${phase.delay} мс`],['Easing',phase.easing]]) {
      const group = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = label; dd.textContent = value; group.append(dt,dd); dl.append(group);
    }
    const pre = document.createElement('pre'); pre.textContent = phase.frames.map(f => `${f.offset} { ${f.css} }`).join('\n');
    card.append(dl,pre); return card;
  }
  function details() {
    const spec = current();
    $('motion-description').textContent = spec.description; $('motion-trigger').textContent = spec.trigger;
    $('motion-duration').textContent = loop() ? `${spec.total} мс · непрерывно` : kind === 'feed' && caseId === 'sequence' ? 'Полный цикл ленты' : kind === 'effects' && caseId === 'beep' ? '40 с · учащающийся тик' : `${spec.total} мс`;
    $('motion-phases').replaceChildren(...spec.phases.map(phaseCard));
    $('motion-geometry').textContent = spec.geometry || (spec.perspective ? `Perspective: ${spec.perspective} · transform-origin: ${spec.origin}.` : 'Transform-origin: 50% 50%. Масштабирование не сдвигает соседей.');
  }
  function render() {
    $('motion-title').textContent = catalog[kind][0];
    for (const name of ['balance','score','round','collapse','effects','map','rosters']) $('motion-'+name).hidden = kind !== name;
    $('motion-player-host').hidden = kind !== 'player';
    $('motion-feed-host').hidden = kind !== 'feed' || caseId === 'sequence';
    $('motion-feed-sequence').hidden = kind !== 'feed' || caseId !== 'sequence';
    details(); renderNavigation(); clear();
    history.replaceState(null,'',`?${new URLSearchParams({element:kind,case:caseId})}`);
    if (loop()) play();
  }
  function later(fn, delay) { timers.push(setTimeout(fn,delay)); }
  function feedEntry(i) {
    const n = document.createElement('div'); n.className = 'cs-chip cs-killfeed';
    n.innerHTML = `<p class="cs-chip-text cs-killfeed__name--ct">${['b1t','jL','iM','Aleksib','w0nderful','b1t'][i]}</p><i class="cs-killfeed__weapon" style='--weapon:url("assets/weapons/ak47.png")'></i><p class="cs-chip-text cs-killfeed__name--t">${['Snappi','dycha','NertZ','Maden','SunPayus','Snappi'][i]}</p>`;
    return n;
  }
  async function play() {
    if ($('motion-play').disabled) return;
    const reducedMotion = noMotion(), options = {reducedMotion};
    if (!toggles()) clear();
    const ticket = ++run;
    $('motion-status').textContent = reducedMotion ? 'Без движения' : loop() ? 'Повторяется непрерывно' : 'Воспроизводится…';
    if (kind === 'feed' && caseId === 'sequence') {
      const add = i => {
        csMotion.feedAdd($('motion-feed-desktop'),feedEntry(i),{...options,single:false});
        csMotion.feedAdd($('motion-feed-mobile'),feedEntry(i),{...options,single:true});
        $('motion-status').textContent = `Событие ${i+1} из 6 · ожидание следующих событий`;
      };
      add(0); for(let i=1;i<6;i++) later(()=>add(i),i*1000);
      later(()=>{$('motion-status').textContent='Лента пуста · все сообщения истекли';},11950);
      return;
    }
    if (kind === 'effects' && caseId === 'beep') {
      const start = performance.now();
      const tick = () => {
        const left = Math.max(0,40-(performance.now()-start)/1000);
        $('motion-effects').querySelector('.cs-chip-text').textContent = `00:${String(Math.ceil(left)).padStart(2,'0')}`;
        if (!left) { csMotion.reset('effects',target()); $('motion-status').textContent='Отсчёт завершён'; return; }
        csMotion.play('effects','beep',target(),options);
        $('motion-status').textContent = `Интервал тика: ${Math.round(180+820*left/40)} мс`;
        later(tick,180+820*left/40);
      }; tick(); return;
    }
    if (toggles()) {
      caseId = expanded ? 'close' : 'open'; details(); $('motion-play').disabled = true;
      await csMotion.play(kind,caseId,target(),options);
      if(ticket !== run) return;
      expanded = !expanded; controls(); $('motion-play').disabled = false;
      $('motion-status').textContent = expanded ? 'Развёрнуто' : 'Свёрнуто'; return;
    }
    await csMotion.play(kind,caseId,target(),options);
    if(ticket === run && !loop()) $('motion-status').textContent = 'Готово · можно повторить';
  }
  $('motion-play').onclick = play;
  $('motion-reset').onclick = () => { clear(); if(loop()) play(); };
  $('motion-collapse').onclick = play;
  $('motion-reduced').onchange = () => { clear(); if(loop()) play(); };
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',()=>{clear();if(loop())play();});
  render();
})();
