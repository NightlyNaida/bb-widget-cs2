// Shared killfeed lifecycle: scoreboard and isolated demo use the same timers and CSS.
(() => {
  const base = window.csMotion, entries = new WeakMap(), demos = new WeakMap();
  const lifetime = 6000, desktopLimit = 4;
  const reduced = options => options.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ms = value => parseFloat(value) * (value.trim().endsWith('ms') ? 1 : 1000);
  function timing() {
    const rules = [...document.styleSheets].flatMap(sheet => { try { return [...sheet.cssRules]; } catch { return []; } });
    const rule = rules.find(r => r.selectorText === '.cs-killfeed').style;
    const frames = rules.find(r => r.name === 'cs-kf-in');
    const durations = rule.transitionDuration.split(',').map(ms), delays = rule.transitionDelay.split(',').map(ms);
    return { enter: ms(rule.animationDuration), easing: rule.animationTimingFunction,
      exit: Math.max(...durations.map((d,i) => d + delays[i % delays.length])), durations, delays,
      transitionEasing: rule.transitionTimingFunction.split(',').map(s=>s.trim()),
      frames: [...frames.cssRules].map(f => ({ offset: f.keyText, css: f.style.cssText })) };
  }
  function remove(entry) {
    const state = entries.get(entry);
    if (state) { clearTimeout(state.life); clearTimeout(state.exit); state.resolve?.(); entries.delete(entry); }
    entry.remove();
  }
  function feedRetire(entry, options = {}) {
    const state = entries.get(entry) || {};
    if (!entry.isConnected) return Promise.resolve();
    if (state.retiring) return state.retiring;
    clearTimeout(state.life);
    if (reduced(options)) { remove(entry); return Promise.resolve(); }
    entry.classList.add('is-out');
    const scale = options.durationScale || state.scale || 1;
    state.retiring = new Promise(resolve => { state.resolve = resolve; state.exit = setTimeout(() => remove(entry), timing().exit * scale); });
    entries.set(entry, state); return state.retiring;
  }
  function feedReset(list) { [...list.children].forEach(remove); }
  function feedClear(list, options = {}) { return Promise.all([...list.children].map(n => feedRetire(n, options))); }
  function feedAdd(list, entry, options = {}) {
    const single = options.single ?? ((list.closest('.cs-shell')?.clientWidth ?? innerWidth) <= 559);
    // A mobile replacement discards the previous entry, so it cannot reappear later.
    if (single) feedReset(list);
    entry.classList.remove('is-out'); list.append(entry);
    const scale = options.durationScale || 1, spec = timing();
    if (reduced(options)) { entry.style.animation = 'none'; entry.style.transition = 'none'; }
    else if (scale !== 1) {
      entry.style.animationDuration = `${spec.enter * scale}ms`;
      entry.style.transitionDuration = spec.durations.map(v => `${v * scale}ms`).join(',');
      entry.style.transitionDelay = spec.delays.map(v => `${v * scale}ms`).join(',');
    }
    const state = { scale }; entries.set(entry, state);
    const active = [...list.children].filter(n => !n.classList.contains('is-out'));
    while (active.length > (single ? 1 : desktopLimit)) feedRetire(active.shift(), options);
    if (options.autoRetire !== false) state.life = setTimeout(() => feedRetire(entry, options), lifetime * scale / Math.min(options.speed || 1, 2));
    return entry;
  }
  function example(event = false, next = false) {
    const n = document.createElement('div');
    n.className = 'cs-chip cs-killfeed' + (event ? ' cs-killfeed--event cs-killfeed--t' : '');
    n.innerHTML = event ? '<img class="cs-killfeed__event-icon" src="assets/status-bomb.svg" alt=""><p class="cs-chip-text">Бомба взорвалась</p>'
      : `<p class="cs-chip-text cs-killfeed__name--ct">${next ? 'jL' : 'b1t'}</p><i class="cs-killfeed__weapon" style='--weapon:url("assets/weapons/ak47.png")'></i><img class="cs-killfeed__headshot" src="assets/kf-headshot.svg" alt="Хедшот"><p class="cs-chip-text cs-killfeed__name--t">Snappi</p>`;
    return n;
  }
  function resetFeed(list, value = {}) {
    demos.get(list)?.(); feedReset(list);
    if (value.present) feedAdd(list, example(), {single:true,autoRetire:false,reducedMotion:true});
  }
  const cases = [
    {id:'enter',label:'Новое убийство',from:{},description:'Последний чип появляется за 250 мс: opacity 0 → 1, смещение справа 8 px → 0.'},
    {id:'replace',label:'Следующее убийство',from:{present:true},description:'Новое сообщение сразу заменяет предыдущее. В мобильном килфиде всегда не больше одного чипа; старое не возвращается.'},
    {id:'event',label:'Событие раунда',from:{},description:'Событие занимает тот же чип и появляется с тем же эффектом. Текст, иконка и рамка передают тип события.'},
    {id:'expire',label:'Исчезновение',from:{present:true},description:'Чип гаснет за 600 мс, затем за 300 мс схлопываются ширина и отступы. После завершения он удаляется.'},
    {id:'lifecycle',label:'Полный цикл',from:{},description:'Сообщение живёт 6 с с момента вставки, включая появление. Затем исчезает за 900 мс. Ускорение симуляции сокращает время показа максимум вдвое.'},
    {id:'empty',label:'Нет сообщений',from:{},description:'Пустая область не показывает заглушку и не запускает анимацию.'},
  ];
  function describeFeed(id) {
    const item = cases.find(c=>c.id===id) || cases[0], t = timing(), phases=[];
    if (['enter','replace','event','lifecycle'].includes(item.id)) phases.push({label:'Появление чипа',duration:t.enter,delay:0,easing:t.easing,frames:[...t.frames,{offset:'100%',css:'opacity: 1; transform: translateX(0);'}]});
    if (['expire','lifecycle'].includes(item.id)) {
      const start = item.id==='lifecycle' ? lifetime : 0;
      phases.push({label:'Исчезновение',duration:t.durations[0],delay:start+t.delays[0],easing:t.transitionEasing[0],frames:[{offset:'0%',css:'opacity: 1;'},{offset:'100%',css:'opacity: 0;'}]});
      phases.push({label:'Схлопывание и удаление',duration:t.durations[1],delay:start+t.delays[1],easing:t.transitionEasing[1]||t.transitionEasing[0],frames:[{offset:'0%',css:'max-width: исходное ограничение; padding: исходные отступы;'},{offset:'100%',css:'max-width: 0; padding: 0;'}]});
    }
    return {...item,phases,total:Math.max(0,...phases.map(p=>p.delay+p.duration)),geometry:'Мобильный килфид: только последнее сообщение. Ширина по содержимому, длинные имена сокращаются; оружие и хедшот сохраняют размер. Появление не меняет высоту строки.'};
  }
  async function playFeed(id,list,options={}) {
    const item=describeFeed(id);resetFeed(list,item.from);
    if(id==='empty')return;
    const scale=options.durationScale||1;
    if(id==='expire') { const n=list.firstElementChild; n.style.removeProperty('transition');n.style.transitionDuration=timing().durations.map(v=>`${v*scale}ms`).join(',');n.style.transitionDelay=timing().delays.map(v=>`${v*scale}ms`).join(',');void n.offsetWidth; await feedRetire(n,options);return; }
    const n=feedAdd(list,example(id==='event',id==='replace'),{...options,single:true,autoRetire:false});
    if(reduced(options)){if(id==='lifecycle')feedReset(list);return;}
    await new Promise(resolve=>{let timer;const done=()=>{clearTimeout(timer);if(demos.get(list)===done)demos.delete(list);resolve();};demos.set(list,done);timer=setTimeout(async()=>{if(id==='lifecycle')await feedRetire(n,options);done();},(id==='lifecycle'?lifetime:timing().enter)*scale);});
  }
  window.csMotion=Object.freeze({...base,feedAdd,feedRetire,feedClear,feedReset,feedLifetime:lifetime,
    cases:{...base.cases,feed:cases},
    reset:(kind,node,value)=>kind==='feed'?resetFeed(node,value):base.reset(kind,node,value),
    play:(kind,id,node,options={})=>kind==='feed'?playFeed(id,node,options):base.play(kind,id,node,options),
    describe:(kind,id)=>kind==='feed'?describeFeed(id):base.describe(kind,id)});
})();
