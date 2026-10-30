// CS Widget / Desktop — live demo behaviour.
// Plays a fake match on top of the static markup: kills go to the killfeed and update the rosters
// (HP, K/D, dead state), rounds end by elimination / time / bomb / defuse, then Buy time → next round.
// Score, round strip, money, map chips and series capsules follow. Left team = NAVI (CT colour),
// right team = ENCE (T colour); sides do not swap in this demo.
(() => {
  const ROUND_TIME = 115, BUY_TIME = 9, BOMB_TIME = 40, PLANT_TIME = 3, DEFUSE_TIME = 7, BUY_STEP = 220, BUY_PAUSE = 1200;
  const POST_ROUND = 3; // seconds between the round end and the buy phase
  const KILL_LIFE = 6000, KILL_MAX = 4, SERIES_WIN = 2;

  const TEAM = { ct: { name: 'NAVI', logo: 'assets/logo-navi.png' }, t: { name: 'ENCE', logo: 'assets/logo-ence.png' } };
  // Weapon icons live in assets/weapons/<id>.png (white, used as CSS masks)
  const WEAPON = {
    ak47: 'AK-47', m4a4: 'M4A4', m4a1s: 'M4A1-S', awp: 'AWP', famas: 'FAMAS', galil: 'Galil AR',
    p90: 'P90', mac10: 'MAC-10', deagle: 'Desert Eagle', usps: 'USP-S', glock: 'Glock-18', knife: 'Нож',
  };
  // What each side buys, by economy: full buy / force (SMG) / eco (pistols)
  const LOADOUT = {
    ct: { rifle: ['m4a4', 'm4a1s', 'famas'], smg: ['p90', 'mac10'], pistol: ['usps', 'deagle'] },
    t:  { rifle: ['ak47', 'galil'],          smg: ['mac10', 'p90'], pistol: ['glock', 'deagle'] },
  };
  // Utility (grenades) live in assets/utility/<id>.png. CT throw incendiaries, T throw molotovs
  const UTILITY = { he: 'HE', flash: 'Флешка', smoke: 'Смок', molotov: 'Молотов', incendiary: 'Инцендиари', decoy: 'Декой' };
  const weaponUrl = id => `url("assets/${id in UTILITY ? 'utility' : 'weapons'}/${id}.png")`;
  // CS2 prices, $
  const PRICE = {
    ak47: 2700, m4a4: 3100, m4a1s: 2900, awp: 4750, famas: 2050, galil: 1800, p90: 2350, mac10: 1050,
    deagle: 700, usps: 200, glock: 200, he: 300, flash: 200, smoke: 300, molotov: 400, incendiary: 500, decoy: 50,
  };
  const DEFAULT_PISTOL = { ct: 'usps', t: 'glock' };
  // Economy (CS2): money cap, round rewards per player, kill rewards by weapon (default $300)
  const MONEY_MAX = 16000, WIN_REWARD = 3250, LOSS_REWARD = 1900;
  const KILL_REWARD = { awp: 100, knife: 1500, mac10: 600 };
  const NADE_ORDER = ['he', 'flash', 'smoke', 'molotov', 'incendiary', 'decoy'];
  // Icon proportions (width / height of the trimmed PNGs) so the weapon box hugs the gun
  const WEAPON_RATIO = {
    ak47: 93 / 28, m4a4: 95 / 29, m4a1s: 96 / 24, awp: 94 / 18, famas: 96 / 35, galil: 95 / 28,
    p90: 90 / 36, mac10: 86 / 60, deagle: 91 / 52, usps: 91 / 34, glock: 77 / 48, knife: 91 / 22,
  };
  const WEAPON_BOX = { w: 36, h: 14 };
  const weaponWidth = id => Math.min(WEAPON_BOX.w, Math.round(WEAPON_BOX.h * WEAPON_RATIO[id])) + 'px';
  const itemName = id => WEAPON[id] || UTILITY[id];

  // CS rules: max 4 grenades — 1 HE, 2 flashes, 1 smoke, 1 fire grenade, 1 decoy
  function buyUtility(side, eco) {
    const fire = side === 'ct' ? 'incendiary' : 'molotov';
    const want = eco === 'rifle' ? rnd(2, 4) : eco === 'smg' ? rnd(1, 2) : rnd(0, 1);
    const pool = ['smoke', 'flash', 'flash', fire, 'he', 'decoy'].sort(() => Math.random() - 0.5);
    const order = ['he', 'flash', 'smoke', 'molotov', 'incendiary', 'decoy'];
    return pool.slice(0, want).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }
  const ROUND_ICON = { elim: 'round-elimination', bomb: 'round-bomb', defuse: 'round-defuse', time: 'round-clock' };
  const STATUS = {
    'Timer':    { icon: 'status-timer',    label: s => fmt(s.timer) },
    'Buy time': { icon: 'status-buytime',  label: () => 'Buy time' },
    'Bomb':     { icon: 'status-bomb',     label: () => 'Bomb' },
    'Demining': { icon: 'status-demining', label: s => fmt(s.defuse) },
    'Defuse':   { icon: 'status-defuse',   label: () => 'Defuse' },
    'Live':     { icon: 'status-live',     label: () => 'Live' },
    'Timeout':  { icon: 'status-timeout',  label: () => 'Timeout' },
  };

  // Initial state = what the static markup shows
  const S = {
    status: 'Timer', timer: 33, buy: 0, bomb: 0, defuse: 0, timeout: 0, planted: false, over: false,
    running: true, speed: 1,
    roundOver: false, postRound: 0, // after-round pause before the buy phase
    collapsed: false,                // minimized: rosters and stream hidden
    highlight: null,  // { side, i } — the player in focus: ace, clutch, planter, defuser
    view: 'stream',   // stream | live | center (| players on mobile) — what the center slot shows
    action: null,     // { kind: 'plant' | 'defuse', side, i, total, left } — see startAction
    scenario: null,   // the game situation being played on demand, null when it is just the simulation
    lastResult: '',   // how the last round ended, shown in the demo panel during Buy time
    rounds: { ct: 3, t: 4 },
    history: [
      { w: 't', type: 'elim' }, { w: 'ct', type: 'bomb' }, { w: 't', type: 'defuse' }, { w: 't', type: 'elim' },
      { w: 'ct', type: 'bomb' }, { w: 'ct', type: 'elim' }, { w: 't', type: 'time' },
    ],
    series: { ct: 1, t: 0 },
    maps: [
      { name: 'Nuke', state: 'played', ct: 13, t: 9 },
      { name: 'Anubis', state: 'live' },
      { name: 'Ancient', state: 'upcoming' },
    ],
    // name, hp, kills, deaths, money, weapon, utility, awper (keeps the AWP when they can afford it)
    players: {
      ct: [['b1t', 100, 14, 12, 4750, 'm4a1s', ['flash', 'smoke']], ['iM', 64, 17, 13, 6200, 'm4a4', ['he', 'flash', 'incendiary']],
           ['jL', 100, 19, 11, 3100, 'famas', ['flash', 'flash', 'smoke', 'incendiary']], ['Aleksib', 0, 9, 15, 8350, 'usps', []],
           ['w0nderful', 32, 21, 10, 1900, 'awp', ['smoke'], true]],
      t:  [['Snappi', 88, 11, 16, 5400, 'galil', ['flash', 'molotov']], ['dycha', 0, 15, 14, 7800, 'ak47', []],
           ['hades', 100, 16, 15, 2650, 'awp', ['flash'], true], ['sdy', 45, 13, 17, 4100, 'ak47', ['he', 'smoke']],
           ['Spinx', 100, 18, 16, 9950, 'deagle', ['he', 'flash', 'flash', 'molotov']]],
    },
  };
  for (const side of ['ct', 't']) {
    S.players[side] = S.players[side].map(([name, hp, k, d, money, weapon, utility, awper = false]) => ({ name, hp, k, d, money, weapon, utility, awper }));
  }

  // ---------- helpers ----------
  const $ = sel => document.querySelector(sel);
  const fmt = s => `${String(Math.floor(Math.max(0, s) / 60)).padStart(2, '0')}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  // Team money = sum of its players' money
  const teamMoney = side => S.players[side].reduce((sum, p) => sum + p.money, 0);
  const earn = (p, amount) => { p.money = Math.min(MONEY_MAX, p.money + amount); };
  const fmtK = n => (Math.round(n / 100) / 10) + 'K';
  const other = side => (side === 'ct' ? 't' : 'ct');
  const alive = side => S.players[side].filter(p => p.hp > 0);
  const bump = el => { el.classList.remove('is-bump'); void el.offsetWidth; el.classList.add('is-bump'); setTimeout(() => el.classList.remove('is-bump'), 300); };

  const el = {
    rosters: { ct: document.querySelectorAll('.cs-roster')[0], t: document.querySelectorAll('.cs-roster')[1] },
    money: { ct: $('.cs-money--ct'), t: $('.cs-money--t') },
    score: $('.cs-score'),
    scoreValues: document.querySelectorAll('.cs-score__value'),
    series: { ct: $('.cs-series--left'), t: $('.cs-series--right') },
    status: $('.cs-status'),
    maps: $('.cs-maps__scores'),
    rounds: $('.cs-rounds'),
    killfeed: $('#cs-killfeed'),
  };

  // ---------- render ----------
  function renderPlayers() {
    for (const side of ['ct', 't']) {
      el.rosters[side].querySelectorAll('.cs-player').forEach((row, i) => {
        const p = S.players[side][i];
        row.style.setProperty('--hp', p.hp + '%');
        row.classList.toggle('cs-player--killed', p.hp <= 0);
        const focus = !!S.highlight && S.highlight.side === side && S.highlight.i === i;
        row.classList.toggle('is-highlight', focus);
        // ACE mark in the HP band, right after the nickname: spade + "Ace"
        const kind = focus ? S.highlight.badge : null;
        const band = row.querySelector('.cs-player__hp');
        let badge = band.querySelector('.cs-player__badge');
        if (badge && badge.dataset.kind !== kind) { badge.remove(); badge = null; }
        if (kind && !badge) {
          badge = document.createElement('span');
          badge.className = 'cs-player__badge';
          badge.dataset.kind = kind;
          badge.textContent = 'Ace';
          row.querySelector('.cs-player__name').after(badge);
        }
        // Planting / defusing: a stamp replaces K/D + weapon (the player can't shoot meanwhile)
        const act = S.action && S.action.side === side && S.action.i === i ? S.action : null;
        row.classList.toggle('is-acting', !!act);
        let stamp = row.querySelector('.cs-player__action');
        if (stamp && (!act || stamp.dataset.kind !== act.kind)) { stamp.remove(); stamp = null; }
        if (act && !stamp) {
          stamp = document.createElement('div');
          stamp.className = `cs-player__action cs-player__action--${act.kind}`;
          stamp.dataset.kind = act.kind;
          stamp.innerHTML = `<i class="cs-player__action-icon"></i><p class="cs-player__action-label">${ACTION_LABEL[act.kind]}</p><p class="cs-player__action-time"></p><span class="cs-player__action-bar"></span>`;
          row.querySelector('.cs-player__main').append(stamp);
        }
        let money = row.querySelector('.cs-player__money');
        if (!money) {
          money = document.createElement('p');
          money.className = 'cs-player__money';
          money.innerHTML = '<span class="cs-player__money-full"></span><span class="cs-player__money-short"></span>';
          row.querySelector('.cs-player__hp-value').before(money);
        }
        money.setAttribute('aria-label', `Деньги $${p.money}`);
        money.firstChild.textContent = '$' + p.money;
        money.lastChild.textContent = '$' + fmtK(p.money);
        row.querySelector('.cs-player__hp').setAttribute('aria-label', `HP ${p.hp}`);
        row.querySelector('.cs-player__hp-value').textContent = p.hp;
        const kd = row.querySelector('.cs-player__kd');
        kd.setAttribute('aria-label', `Убийства ${p.k}, смерти ${p.d}`);
        kd.innerHTML = `<i class="cs-player__kd-icon cs-player__kd-icon--kills"></i>${p.k}<i class="cs-player__kd-icon cs-player__kd-icon--deaths"></i>${p.d}`;
        const weapon = row.querySelector('.cs-player__weapon');
        weapon.classList.toggle('is-empty', !p.weapon); // empty hands at the start of the buy phase
        if (p.weapon) {
          weapon.style.setProperty('--weapon', weaponUrl(p.weapon));
          weapon.style.width = weaponWidth(p.weapon);
          weapon.title = WEAPON[p.weapon];
        }
        if (p.freshWeapon) { restart(weapon, 'is-bought'); p.freshWeapon = false; }
        let util = row.querySelector('.cs-player__utility');
        if (!util) {
          util = document.createElement('div');
          util.className = 'cs-player__utility';
          weapon.before(util);
        }
        util.setAttribute('aria-label', p.utility.length ? 'Гранаты: ' + p.utility.map(u => UTILITY[u]).join(', ') : 'Нет гранат');
        util.innerHTML = p.utility.map((u, n) =>
          `<img class="cs-player__nade cs-player__nade--${u}${n === p.freshNade ? ' is-new' : ''}" src="assets/utility/${u}.png" alt="" title="${UTILITY[u]}">`).join('');
        p.freshNade = null;
      });
      el.money[side].querySelector('.cs-chip-text').textContent = fmtK(teamMoney(side));
    }
    paintAction();
  }

  // Odometer: the old number rolls down and fades, the new one rolls in from the top.
  // When the number goes down, the drum turns the other way.
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function odometer(node, value) {
    const next = String(value);
    const current = node.querySelector('.cs-odo__digit:not(.is-out)');
    if (current && current.textContent === next) return;
    if (!current || reducedMotion.matches) {
      node.innerHTML = `<span class="cs-odo__digit">${next}</span>`;
      return;
    }
    const reverse = Number(next) < Number(current.textContent);
    current.classList.remove('is-in', 'is-rev');
    current.classList.add('is-out');
    if (reverse) current.classList.add('is-rev');
    current.addEventListener('animationend', () => current.remove(), { once: true });
    setTimeout(() => current.remove(), 450); // safety net if animationend never fires (background tab)
    const digit = document.createElement('span');
    digit.className = 'cs-odo__digit is-in' + (reverse ? ' is-rev' : '');
    digit.textContent = next;
    node.appendChild(digit);
    const settle = () => digit.classList.remove('is-in', 'is-rev');
    digit.addEventListener('animationend', settle, { once: true });
    setTimeout(settle, 450);
  }

  function renderScore() {
    odometer(el.scoreValues[0], S.rounds.ct);
    odometer(el.scoreValues[1], S.rounds.t);
    el.score.setAttribute('aria-label', `Счёт текущей карты ${S.rounds.ct}:${S.rounds.t}, по картам ${S.series.ct}:${S.series.t}`);
    for (const side of ['ct', 't']) {
      el.series[side].querySelectorAll('.cs-series__pip').forEach((pip, i) => pip.classList.toggle('cs-series__pip--won', i < S.series[side]));
    }
  }

  function renderStatus() {
    const st = STATUS[S.status];
    el.status.querySelector('.cs-status__icon').src = `assets/${st.icon}.svg`;
    el.status.querySelector('.cs-chip-text').textContent = st.label(S);
  }

  function renderMaps() {
    el.maps.innerHTML = S.maps.map(m => {
      if (m.state === 'played') {
        const win = m.ct > m.t ? 'ct' : 't';
        return `<div class="cs-chip cs-mapscore cs-mapscore--played" aria-label="${m.name}: победа ${TEAM[win].name} ${m.ct}:${m.t}">` +
          `<span class="cs-mapscore__winner"><img src="${TEAM[win].logo}" alt=""></span>` +
          `<p class="cs-chip-text cs-mapscore__name">${m.name}</p>` +
          `<p class="cs-chip-text${win === 'ct' ? '' : ' cs-mapscore__lose'}">${m.ct}</p><span class="cs-mapscore__separator"></span>` +
          `<p class="cs-chip-text${win === 't' ? '' : ' cs-mapscore__lose'}">${m.t}</p></div>`;
      }
      if (m.state === 'live') {
        return `<div class="cs-chip cs-mapscore cs-mapscore--live" aria-current="true" aria-label="${m.name}: идёт сейчас, ${S.rounds.ct}:${S.rounds.t}">` +
          `<span class="cs-mapscore__live"></span><p class="cs-chip-text cs-mapscore__name">${m.name}</p>` +
          `<p class="cs-chip-text">${S.rounds.ct}</p><span class="cs-mapscore__separator"></span><p class="cs-chip-text">${S.rounds.t}</p></div>`;
      }
      return `<div class="cs-chip cs-mapscore cs-mapscore--upcoming" aria-label="${m.name}: впереди"><p class="cs-chip-text cs-mapscore__name">${m.name}</p></div>`;
    }).join('');
  }

  // Round strip. Regulation: 24 cells, the collapse button between the halves.
  // Overtime (MR3, 6 rounds each): only the current OT's 6 cells; above the collapse button
  // (between the OT halves) a caption with the score before this OT.
  const REG = 24, OT = 6;

  function renderRounds(fresh) {
    const played = S.history.length;
    const slots = Math.max(REG, played + (S.over ? 0 : 1)); // rounds to show incl. the ongoing one
    const otIndex = slots > REG ? Math.floor((slots - 1 - REG) / OT) : -1; // current overtime, 0-based
    let button = `<button type="button" class="cs-collapse" aria-expanded="${!S.collapsed}" aria-label="${S.collapsed ? 'Развернуть' : 'Свернуть'} виджет"><span class="cs-collapse__icon"></span></button>`;
    // In overtime a caption above the button: the score before this OT (NAVI:ENCE)
    if (otIndex >= 0) {
      const part = S.history.slice(0, REG + OT * otIndex);
      const ct = part.filter(r => r.w === 'ct').length;
      button = `<div class="cs-collapse-wrap"><p class="cs-collapse__caption">До ОТ${otIndex + 1} <b>${ct}:${part.length - ct}</b></p>${button}</div>`;
    }

    const cell = (i, extra = '') => {
      const r = S.history[i];
      if (r) return `<div class="cs-round cs-round--${r.w}${i === fresh ? ' is-new' : ''}${extra}" title="Раунд ${i + 1}"><img class="cs-round__icon" src="assets/${ROUND_ICON[r.type]}.svg" alt=""></div>`;
      return `<div class="cs-round${i === played ? ' cs-round--ongoing' : ''}${extra}"><p class="cs-round__number">${i + 1}</p></div>`;
    };

    // Mobile: every round in one scrollable ribbon (no button), sides switch at 13 and every 3 rounds in OT
    if (isMobile()) {
      let cells = '';
      for (let i = 0; i < slots; i++) {
        const sideSwitch = i === REG / 2 || (i >= REG && (i - REG) % (OT / 2) === 0);
        cells += cell(i, sideSwitch ? ' is-switch' : '');
      }
      el.rounds.innerHTML = cells;
      el.rounds.classList.toggle('is-overtime', slots > REG);
      const current = el.rounds.querySelector('.cs-round--ongoing') || el.rounds.lastElementChild;
      el.rounds.scrollLeft = current.offsetLeft - (el.rounds.clientWidth - current.offsetWidth) / 2;
      return;
    }

    // Two equal halves with the button between them, so it always sits in the middle of the widget
    let left = '', right = '';
    if (slots <= REG) {
      for (let i = 0; i < REG / 2; i++) left += cell(i);
      for (let i = REG / 2; i < REG; i++) right += cell(i);
    } else {
      // current OT only: 3 cells | button with the score before this OT | 3 cells
      const start = REG + OT * otIndex;
      for (let i = start; i < start + OT / 2; i++) left += cell(i);
      for (let i = start + OT / 2; i < start + OT; i++) right += cell(i);
    }
    el.rounds.innerHTML = `<div class="cs-rounds__half">${left}</div>${button}<div class="cs-rounds__half">${right}</div>`;
    el.rounds.classList.toggle('is-overtime', slots > REG);
  }

  // Rounds needed to win the map: 13 in regulation; at 12:12 overtime starts (first to 16),
  // at 15:15 the next one (first to 19), and so on
  function mapTarget(ct, t) {
    let target = 13, tie = 12;
    while (ct >= tie && t >= tie) { target = tie + 4; tie += 3; }
    return target;
  }

  function hit(side, i) {
    const row = el.rosters[side].querySelectorAll('.cs-player')[i];
    row.classList.remove('is-hit'); void row.offsetWidth; row.classList.add('is-hit');
  }

  // ---------- killfeed ----------
  function retire(entry) {
    if (!entry.isConnected || entry.classList.contains('is-out')) return;
    entry.classList.add('is-out');
    setTimeout(() => entry.remove(), 1000);
  }

  function pushKill(ks, killer, victim, weapon, headshot) {
    const vs = other(ks);
    const entry = document.createElement('div');
    entry.className = 'cs-chip cs-killfeed';
    entry.innerHTML =
      `<p class="cs-chip-text cs-killfeed__name--${ks}"></p>` +
      `<i class="cs-killfeed__weapon${weapon in UTILITY ? ' cs-killfeed__weapon--nade' : ''}" style='--weapon: ${weaponUrl(weapon)}' role="img" aria-label="${itemName(weapon)}"></i>` +
      (headshot ? '<img class="cs-killfeed__headshot" src="assets/kf-headshot.svg" alt="Хедшот">' : '') +
      `<p class="cs-chip-text cs-killfeed__name--${vs}"></p>`;
    const names = entry.querySelectorAll('p');
    names[0].textContent = killer;
    names[1].textContent = victim;
    addToFeed(entry);
  }

  // Game events (plant, defuse, ace…) go to the same feed as an icon + text chip
  function pushEvent(icon, text, tone) {
    const entry = document.createElement('div');
    entry.className = `cs-chip cs-killfeed cs-killfeed--event${tone ? ' cs-killfeed--' + tone : ''}`;
    entry.innerHTML = `<img class="cs-killfeed__event-icon" src="assets/${icon}.svg" alt=""><p class="cs-chip-text"></p>`;
    entry.querySelector('p').textContent = text;
    addToFeed(entry);
  }

  // Fade out everything in the feed (a new situation starts from a clean feed)
  function clearFeed() {
    el.killfeed.querySelectorAll('.cs-killfeed:not(.is-out)').forEach(retire);
  }

  function addToFeed(entry) {
    el.killfeed.appendChild(entry);
    const visible = el.killfeed.querySelectorAll('.cs-killfeed:not(.is-out)');
    if (visible.length > KILL_MAX) retire(visible[0]);
    setTimeout(() => retire(entry), KILL_LIFE / Math.min(S.speed, 2));
  }

  // ---------- effects: bomb beeps, defuse, explosion ----------
  const widget = $('.cs-widget');
  const fx = document.createElement('div');
  fx.className = 'cs-fx';
  fx.setAttribute('aria-hidden', 'true');
  widget.appendChild(fx);

  const restart = (node, cls) => { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); };
  // One-shot flashes replace each other, otherwise a leftover class would override the next animation
  function flash(cls) {
    fx.classList.remove('is-beep', 'is-defused', 'is-explode');
    void fx.offsetWidth;
    fx.classList.add(cls);
  }
  let beepTimer = null;

  // Beeps speed up as the bomb timer runs out (like in CS): ~1s apart at plant, ~0.2s at the end
  function beepLoop() {
    beepTimer = null;
    if (!S.planted || !S.running || S.over) return;
    flash('is-beep');
    restart(el.status, 'is-beep');
    const left = Math.max(0, S.bomb) / BOMB_TIME;
    beepTimer = setTimeout(beepLoop, (180 + 820 * left) / S.speed);
  }
  function startBeeps() { if (!beepTimer) beepLoop(); }
  function stopBeeps() { clearTimeout(beepTimer); beepTimer = null; }

  function fxDefusing(on) { fx.classList.toggle('is-defusing', on); }

  function fxExplode() {
    stopBeeps(); fxDefusing(false);
    flash('is-explode');
    restart(widget, 'is-shake');
  }

  function fxDefused() {
    stopBeeps(); fxDefusing(false);
    flash('is-defused');
  }

  // ---------- video follows the simulation: pause, speed, stream on/off ----------
  function syncVideo() {
    const video = $('.cs-stream__video');
    if (!video) return;
    video.loop = true;
    video.playbackRate = S.speed;
    if (S.running && !S.collapsed && S.view === 'stream' && !widget.classList.contains('is-no-stream')) video.play().catch(() => {});
    else video.pause();
  }

  // Minimize / expand: the button lives in the round strip (re-rendered), so the click is delegated
  // Animate the real height of the rosters block (px → px), then hand it back to auto when expanded
  const rostersBox = $('.cs-rosters');
  rostersBox.addEventListener('transitionend', e => {
    if (e.target === rostersBox && e.propertyName === 'height' && !S.collapsed) rostersBox.style.height = '';
  });

  function setCollapsed(on) {
    const from = rostersBox.offsetHeight;
    S.collapsed = on;
    widget.classList.toggle('is-collapsed', on);
    if (reducedMotion.matches) {
      rostersBox.style.height = on ? '0px' : '';
    } else {
      rostersBox.style.height = from + 'px';
      void rostersBox.offsetHeight;
      rostersBox.style.height = on ? '0px' : rostersBox.scrollHeight + 'px';
    }
    const btn = el.rounds.querySelector('.cs-collapse');
    if (btn) {
      btn.setAttribute('aria-expanded', String(!on));
      btn.setAttribute('aria-label', `${on ? 'Развернуть' : 'Свернуть'} виджет`);
    }
    syncVideo();
  }

  el.rounds.addEventListener('click', e => {
    if (e.target.closest('.cs-collapse')) setCollapsed(!S.collapsed);
  });

  // Mobile (widget < 560px, same as the container query in the CSS): the round strip becomes a ribbon
  // and the view tabs get "Составы". Crossing that width re-renders the strip; leaving mobile while
  // the rosters are on brings the stream back (desktop shows the rosters anyway)
  const MOBILE_MAX = 559;
  const isMobile = () => widget.clientWidth <= MOBILE_MAX;
  let wasMobile = isMobile();
  new ResizeObserver(() => {
    if (isMobile() === wasMobile) return;
    wasMobile = isMobile();
    if (!wasMobile && S.view === 'players') setView('stream');
    renderRounds();
  }).observe(widget);

  // ---------- view tabs: the stream or a third-party stats widget in the center slot ----------
  const viewTabs = [...document.querySelectorAll('.cs-views__tab')];
  function setView(view) {
    S.view = view;
    widget.classList.toggle('is-m-players', view === 'players');
    viewTabs.forEach(t => {
      const on = t.dataset.view === view;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    document.querySelectorAll('.cs-embed').forEach(p => { p.hidden = p.dataset.view !== view; });
    syncVideo();
  }
  viewTabs.forEach(t => {
    t.addEventListener('click', () => setView(t.dataset.view));
    // arrows move between the visible tabs, as in any tablist ("Составы" is hidden on desktop)
    t.addEventListener('keydown', e => {
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      const shown = viewTabs.filter(x => x.offsetParent);
      const next = shown[(shown.indexOf(t) + step + shown.length) % shown.length];
      next.focus();
      setView(next.dataset.view);
    });
  });

  // ---------- match logic ----------
  // A kill. Without arguments: random killer and victim. Scenarios pass specific players
  function kill(ks, killer, victim) {
    const vs = other(ks);
    const killers = alive(ks), victims = alive(vs);
    if (!killers.length || !victims.length) return;
    killer = killer && killer.hp > 0 ? killer : pick(killers);
    victim = victim && victim.hp > 0 ? victim : pick(victims);
    victim.hp = 0; victim.d++; killer.k++;
    const a = S.action;
    if (a && a.side === vs && S.players[vs][a.i] === victim) {
      stopAction(false);
      // the defuser is down: the bomb ticks on
      if (a.kind === 'defuse' && S.status === 'Demining') { S.status = 'Bomb'; fxDefusing(false); renderStatus(); }
    }
    victim.utility = []; // dropped on death
    if (Math.random() < 0.5) killer.hp = Math.max(1, killer.hp - rnd(5, 45));
    // usually the gun; sometimes a grenade the killer still holds (it is spent), rarely the knife
    const nade = killer.utility.find(u => u === 'he' || u === 'molotov' || u === 'incendiary');
    let weapon = killer.weapon || DEFAULT_PISTOL[ks];
    if (nade && Math.random() < 0.12) { weapon = nade; killer.utility.splice(killer.utility.indexOf(nade), 1); }
    else if (Math.random() < 0.04) weapon = 'knife';
    pushKill(ks, killer.name, victim.name, weapon, weapon === killer.weapon && Math.random() < 0.45);
    earn(killer, KILL_REWARD[weapon] ?? 300);
    hit(vs, S.players[vs].indexOf(victim));
    renderPlayers();
    checkRoundEnd();
  }

  function damage() {
    const side = Math.random() < 0.5 ? 'ct' : 't';
    const targets = alive(side);
    if (!targets.length) return;
    const p = pick(targets), d = rnd(8, 40);
    if (p.hp - d <= 0) return kill(other(side));
    p.hp -= d;
    hit(side, S.players[side].indexOf(p));
    renderPlayers();
  }

  // ---------- actions: planting / defusing ----------
  // A timed action of one player, shown as a stamp with a countdown and a progress bar in the plate.
  // It runs on its own frame loop in game time (follows pause and speed); the promise resolves
  // true when it completes, false when it is cut short (player killed, round over, manual status)
  const ACTION_LABEL = { plant: 'Закладывает', defuse: 'Разминирует' };
  function startAction(kind, side, player, total) {
    stopAction(false);
    return new Promise(resolve => {
      S.action = { kind, side, i: S.players[side].indexOf(player), total, left: total, resolve };
      renderPlayers();
    });
  }
  function stopAction(done) {
    const a = S.action;
    if (!a) return;
    S.action = null;
    renderPlayers();
    a.resolve(done);
  }
  function paintAction() {
    const a = S.action;
    if (!a) return;
    const row = el.rosters[a.side].querySelectorAll('.cs-player')[a.i];
    row.style.setProperty('--progress', (1 - a.left / a.total).toFixed(4));
    row.querySelector('.cs-player__action-time').textContent = a.left.toFixed(1);
  }
  // Advanced by frames for a smooth bar, and by a timer so it keeps going where frames stop
  // (background tab): both share one clock, so time is never counted twice
  let lastFrame = performance.now();
  function advanceAction() {
    const now = performance.now();
    const dt = Math.min(now - lastFrame, 1000) / 1000;
    lastFrame = now;
    const a = S.action;
    if (!a || !S.running || S.status === 'Timeout') return;
    a.left = Math.max(0, a.left - dt * S.speed);
    if (a.kind === 'defuse') S.defuse = Math.ceil(a.left);
    paintAction();
    if (a.left <= 0) stopAction(true);
  }
  (function frame() { advanceAction(); requestAnimationFrame(frame); })();
  setInterval(advanceAction, 100);

  // A T player plants: PLANT_TIME seconds in their plate, then the bomb is down and ticking
  async function plant() {
    const planter = pick(alive('t'));
    if (!planter) return false;
    setHighlight('t', planter);
    if (!(await startAction('plant', 't', planter, PLANT_TIME))) return false;
    S.highlight = null;
    S.planted = true; S.status = 'Bomb'; S.bomb = BOMB_TIME;
    pushEvent('status-bomb', `${planter.name} заложил бомбу`, 't');
    renderPlayers(); renderStatus();
    startBeeps();
    return true;
  }

  // badge: null | 'ace'
  function setHighlight(side, player, badge = null) {
    S.highlight = player ? { side, i: S.players[side].indexOf(player), badge } : null;
    renderPlayers();
  }

  async function startDefuse() {
    const defuser = pick(alive('ct'));
    if (!defuser) return;
    S.status = 'Demining'; S.defuse = DEFUSE_TIME;
    setHighlight('ct', defuser);
    pushEvent('status-demining', `${defuser.name} разминирует`, 'ct');
    fxDefusing(true);
    renderStatus();
    if (await startAction('defuse', 'ct', defuser, DEFUSE_TIME)) endRound('ct', 'defuse');
  }

  function checkRoundEnd() {
    const ct = alive('ct').length, t = alive('t').length;
    if (S.planted) {
      if (ct === 0) return endRound('t', 'elim');
      if (t === 0 && S.status === 'Bomb') startDefuse();
      return;
    }
    if (t === 0) return endRound('ct', 'elim');
    if (ct === 0) return endRound('t', 'elim');
  }

  const REASON = { elim: 'все убиты', bomb: 'взрыв бомбы', defuse: 'бомба обезврежена', time: 'вышло время' };

  // The explosion takes out CTs who were still around: at least one, sometimes all of them
  function bombVictims() {
    const cts = alive('ct').sort(() => Math.random() - 0.5);
    const count = cts.length ? rnd(1, cts.length) : 0;
    cts.slice(0, count).forEach(p => {
      p.hp = 0; p.d++; p.utility = [];
      hit('ct', S.players.ct.indexOf(p));
    });
    renderPlayers();
  }

  function endRound(win, type) {
    if (S.status === 'Buy time' || S.over || S.roundOver) return;
    const lose = other(win);
    stopAction(false);
    S.lastResult = `${TEAM[win].name} взяли раунд: ${REASON[type]}`;
    if (S.scenario !== 'buy') S.scenario = null;
    if (type === 'bomb') { fxExplode(); bombVictims(); pushEvent('status-bomb', 'Бомба взорвалась', 't'); }
    else if (type === 'defuse') { fxDefused(); pushEvent('status-defuse', 'Бомба обезврежена', 'ct'); }
    else { stopBeeps(); fxDefusing(false); }

    S.rounds[win]++;
    S.history.push({ w: win, type });
    // team rewards (5 players): the whole team rebuys every round, so it needs a full buy's worth
    S.players[win].forEach(p => earn(p, WIN_REWARD));
    S.players[lose].forEach(p => earn(p, LOSS_REWARD));
    S.planted = false;

    if (S.rounds[win] >= mapTarget(S.rounds.ct, S.rounds.t)) {
      const live = S.maps.find(m => m.state === 'live');
      Object.assign(live, { state: 'played', ct: S.rounds.ct, t: S.rounds.t });
      S.series[win]++;
      const next = S.maps.find(m => m.state === 'upcoming');
      if (S.series[win] >= SERIES_WIN || !next) {
        S.over = true;
        S.status = 'Live';
      } else {
        next.state = 'live';
        S.rounds = { ct: 0, t: 0 };
        S.history = [];
      }
    }
    renderScore(); renderRounds(S.history.length - 1); renderMaps();
    // A short after-round pause before the buy phase: the result stays on screen
    if (!S.over) {
      S.roundOver = true;
      S.postRound = POST_ROUND;
      S.status = type === 'bomb' ? 'Bomb' : type === 'defuse' ? 'Defuse' : 'Live';
    }
    renderStatus();
    bump(el.scoreValues[win === 'ct' ? 0 : 1]);
    bump(el.money[win]);
    emit();
  }

  // ---------- buy phase ----------
  // Everyone respawns with 100 HP and empty hands: guns and grenades are cleared.
  // After a short pause each team picks an economy and players buy one item at a time (see buyStep),
  // each player's money going down with every purchase.
  let buyQueue = [];
  let buyWait = 0; // buy steps to skip before the first purchase

  function startBuyPhase(ecoSide) {
    stopBeeps(); fxDefusing(false);
    S.planted = false; S.status = 'Buy time'; S.buy = BUY_TIME;
    stopAction(false);
    S.highlight = null;
    buyQueue = [];
    buyWait = Math.round(BUY_PAUSE / BUY_STEP);
    for (const side of ['ct', 't']) {
      const r = Math.random();
      const eco = ecoSide === side ? 'pistol' : r < 0.7 ? 'rifle' : r < 0.85 ? 'smg' : 'pistol';
      S.players[side].forEach((p, i) => {
        p.hp = 100;
        p.weapon = null;
        p.utility = [];
        buyQueue.push({ side, i, item: eco === 'rifle' && p.awper ? 'awp' : pick(LOADOUT[side][eco]) });
        for (const n of buyUtility(side, eco)) buyQueue.push({ side, i, item: n });
      });
    }
    // players buy in parallel: shuffle so purchases jump between players, guns first, grenades after
    buyQueue.sort(() => Math.random() - 0.5);
    buyQueue.sort((a, b) => (a.item in UTILITY) - (b.item in UTILITY));
    renderPlayers(); renderStatus();
  }

  function applyPurchase({ side, i, item }) {
    const p = S.players[side][i];
    const cost = PRICE[item] || 0;
    if (p.money < cost) {
      // can't afford the gun: the free default pistol; can't afford a grenade: skip it
      if (!(item in UTILITY)) { p.weapon = DEFAULT_PISTOL[side]; p.freshWeapon = true; }
      return;
    }
    p.money -= cost;
    if (item in UTILITY) {
      p.utility.push(item);
      p.utility.sort((a, b) => NADE_ORDER.indexOf(a) - NADE_ORDER.indexOf(b));
      p.freshNade = p.utility.lastIndexOf(item);
    } else {
      p.weapon = item;
      p.freshWeapon = true;
    }
  }

  // One purchase per beat while Buy time is running
  function buyStep() {
    if (!S.running || S.status !== 'Buy time' || !buyQueue.length) return;
    if (buyWait > 0) { buyWait--; return; }
    applyPurchase(buyQueue.shift());
    renderPlayers(); renderScore();
  }

  // Round starts: whatever was not bought yet is bought instantly
  function flushBuys() {
    while (buyQueue.length) applyPurchase(buyQueue.shift());
  }

  // Someone alive throws one of their grenades (removes it from the stack)
  function throwUtility() {
    const holders = [...alive('ct'), ...alive('t')].filter(p => p.utility.length);
    if (!holders.length) return;
    const p = pick(holders);
    p.utility.splice(rnd(0, p.utility.length - 1), 1);
    renderPlayers();
  }

  function newRound() {
    stopBeeps(); fxDefusing(false);
    if (S.scenario === 'buy') S.scenario = null;
    S.lastResult = '';
    scripted = false;
    flushBuys();
    for (const side of ['ct', 't']) S.players[side].forEach(p => { p.hp = 100; });
    S.status = 'Timer'; S.timer = ROUND_TIME; S.planted = false;
    renderPlayers(); renderScore(); renderRounds(); renderStatus();
    emit();
  }

  function tick() {
    step();
    emit();
  }

  function step() {
    if (S.over || !S.running) return;
    if (S.roundOver) {
      if (--S.postRound <= 0) { S.roundOver = false; startBuyPhase(); }
      return;
    }
    if (S.status === 'Buy time') { if (--S.buy <= 0) newRound(); return; }
    if (S.status === 'Timeout') {
      if (--S.timeout <= 0) {
        if (S.scenario === 'timeout') S.scenario = null;
        S.status = S.planted ? 'Bomb' : 'Timer'; renderStatus();
        if (S.planted) startBeeps();
      }
      return;
    }

    if (S.status === 'Timer') {
      if (--S.timer <= 0) return endRound('ct', 'time');
      if (S.timer < 70 && !scripted && !S.action && alive('t').length && Math.random() < 0.05) plant();
    } else if (S.status === 'Bomb') {
      if (--S.bomb <= 0) { scripted = false; return endRound('t', 'bomb'); }
      if (!scripted && !S.action && alive('ct').length && Math.random() < 0.08) startDefuse();
    } else if (S.status === 'Demining') {
      S.bomb--;
      // a manually set Demining has no defuser: count it down here
      if (!S.action && --S.defuse <= 0) return endRound('ct', 'defuse');
      if (S.bomb <= 0) return endRound('t', 'bomb');
    } else {
      return; // Defuse / Live: wait
    }

    if (scripted) return renderStatus(); // a scenario drives the kills right now
    renderStatus();
    const r = Math.random();
    if (r < 0.28) kill(Math.random() < 0.5 ? 'ct' : 't');
    else if (r < 0.5) damage();
    else if (r < 0.7) throwUtility();
  }

  renderPlayers(); renderScore(); renderStatus(); renderMaps(); renderRounds();
  let clock = setInterval(tick, 1000);
  let buyClock = setInterval(buyStep, BUY_STEP);

  // ---------- scenarios: play a game situation on demand ----------
  let scripted = false;
  const wait = ms => new Promise(r => setTimeout(r, ms / S.speed));

  // Make sure a live round is going (skip Buy time / end states) before a scenario
  function ensureRound() {
    if (S.over) return false;
    if (S.roundOver) { S.roundOver = false; startBuyPhase(); }
    if (S.status === 'Buy time' || S.status === 'Defuse') newRound();
    if (S.status === 'Timeout' || S.status === 'Live') { S.status = S.planted ? 'Bomb' : 'Timer'; renderStatus(); }
    return true;
  }

  const roundIsOver = () => S.roundOver || S.status === 'Buy time' || S.over;

  async function killSequence(ks, killer, count) {
    for (let i = 0; i < count; i++) {
      if (!alive(other(ks)).length || killer.hp <= 0 || roundIsOver()) return;
      kill(ks, killer, pick(alive(other(ks))));
      if (!alive(other(ks)).length) return; // last one down: no pause, the caller reacts right away
      await wait(rnd(1800, 2600)); // readable at 1×: one frag every ~2 s
    }
  }

  const SCENARIOS = {
    // Next buy phase right now; optionally an eco round for one side
    buy() {
      if (S.over) return;
      scripted = false;
      S.roundOver = false;
      startBuyPhase();
    },
    // One team saves: it only gets pistols this buy phase.
    // An eco can't be detected from the data, so nothing is announced.
    // The buy phase itself isn't put in the feed either: the status chip already shows it
    eco() {
      if (S.over) return;
      scripted = false;
      S.roundOver = false;
      startBuyPhase(Math.random() < 0.5 ? 'ct' : 't');
    },
    // Plant and let the bomb run its full timer to the explosion: no defuse, no kills meanwhile
    async plant() {
      if (!ensureRound()) return;
      scripted = true; // nobody shoots while the bomb goes down and ticks
      if (!S.planted && !(await plant())) return;
      fxDefusing(false);
      S.status = 'Bomb';
      renderStatus();
      startBeeps();
    },
    // Plant (if needed) and let the bomb tick down the last seconds, beeps speeding up, then boom
    async explode() {
      if (!ensureRound()) return;
      scripted = true; // nobody shoots or defuses while it ticks
      if (!S.planted && !(await plant())) return;
      fxDefusing(false);
      S.status = 'Bomb';
      S.bomb = Math.min(S.bomb, 5);
      renderStatus();
      startBeeps();
    },
    async defuse() {
      if (!ensureRound()) return;
      scripted = true;
      if (!S.planted && !(await plant())) return;
      // T side falls, CT defuses
      for (const t of alive('t')) { if (roundIsOver()) break; kill('ct', null, t); await wait(rnd(900, 1200)); }
      scripted = false;
      if (S.status === 'Bomb') startDefuse();
    },
    async ace() {
      if (!ensureRound()) return;
      const side = Math.random() < 0.5 ? 'ct' : 't';
      const star = pick(alive(side));
      if (!star) return;
      scripted = true;
      setHighlight(side, star);
      pushEvent('status-live', `${star.name}: ACE!`, side);
      await killSequence(side, star, 5);
      // the whole enemy team is down and the star is still standing: that's the ace
      if (star.hp > 0 && !alive(other(side)).length) setHighlight(side, star, 'ace');
      scripted = false;
    },
    async clutch() {
      if (!ensureRound()) return;
      const side = Math.random() < 0.5 ? 'ct' : 't';
      scripted = true;
      // the side loses everyone but one, then the last player wins the round
      while (alive(side).length > 1 && !roundIsOver()) { kill(other(side), null, pick(alive(side))); await wait(rnd(1000, 1400)); }
      const hero = alive(side)[0];
      if (hero && !roundIsOver()) {
        setHighlight(side, hero);
        pushEvent('status-live', `${hero.name}: клатч 1v${alive(other(side)).length}`, side);
        await wait(1500);
        await killSequence(side, hero, 5);
      }
      scripted = false;
    },
    timeout() {
      if (!ensureRound()) return;
      stopBeeps();
      S.status = 'Timeout'; S.timeout = 8;
      renderStatus();
    },
    // Jump to 12:12 at the end of regulation: overtime starts after the buy phase
    overtime() {
      if (S.over) return;
      scripted = false;
      const wins = [...Array(12).fill('ct'), ...Array(12).fill('t')].sort(() => Math.random() - 0.5);
      S.history = wins.map(w => ({ w, type: pick(w === 'ct' ? ['elim', 'elim', 'defuse', 'time'] : ['elim', 'elim', 'bomb']) }));
      S.rounds = { ct: 12, t: 12 };
      S.roundOver = false;
      renderScore(); renderRounds(); renderMaps();
      startBuyPhase();
      pushEvent('status-live', 'Овертайм', null);
    },
  };

  // ---------- control API (used by the demo controls in index.html) ----------
  const listeners = [];
  // What is happening right now, in words, for the demo panel
  function phase() {
    if (S.roundOver) return `${S.lastResult} · закупка через ${S.postRound} с`;
    switch (S.status) {
      case 'Timer':    return `раунд, ${fmt(S.timer)}${S.action ? ' · закладка бомбы' : ''}`;
      case 'Bomb':     return `бомба тикает, ${fmt(S.bomb)}`;
      case 'Demining': return `разминирование, ${fmt(S.defuse)}`;
      case 'Defuse':   return 'бомба обезврежена';
      case 'Buy time': return `${S.lastResult ? S.lastResult + ' · ' : ''}закупка, ${S.buy} с`;
      case 'Timeout':  return `тактическая пауза, ${S.timeout} с`;
      case 'Live':     return S.over ? 'матч окончен' : 'live';
      default:         return S.status;
    }
  }
  function emit() {
    const snapshot = { running: S.running, status: S.status, scenario: S.scenario, phase: phase() };
    listeners.forEach(fn => fn(snapshot));
  }
  const SIM_STATUSES = ['Timer', 'Buy time', 'Bomb', 'Demining', 'Timeout'];

  window.csWidget = {
    statuses: Object.keys(STATUS),
    scenarios: Object.keys(SCENARIOS),
    onChange(fn) { listeners.push(fn); emit(); },
    syncVideo,
    setRunning(on) {
      S.running = on;
      if (on && !S.roundOver && !SIM_STATUSES.includes(S.status)) { S.status = 'Timer'; renderStatus(); }
      if (on && S.planted) startBeeps(); else if (!on) stopBeeps();
      syncVideo();
      emit();
    },
    setSpeed(x) {
      S.speed = x;
      clearInterval(clock); clearInterval(buyClock);
      clock = setInterval(tick, 1000 / x);
      buyClock = setInterval(buyStep, BUY_STEP / x);
      syncVideo();
    },
    setStatus(status) {
      stopAction(false);
      S.status = status;
      if (status === 'Demining' && !S.defuse) S.defuse = DEFUSE_TIME;
      if (status === 'Bomb' || status === 'Demining') { S.planted = true; if (!S.bomb) S.bomb = BOMB_TIME; }
      fxDefusing(status === 'Demining');
      S.running = false;
      stopBeeps();
      renderStatus();
      syncVideo();
      emit();
    },
    scenario(name) {
      if (!SCENARIOS[name] || S.over) return;
      if (!S.running) { S.running = true; syncVideo(); }
      S.scenario = name;
      clearFeed();
      // a new situation starts clean: no one is still planting or defusing
      stopAction(false);
      if (S.status === 'Demining') { S.status = 'Bomb'; fxDefusing(false); renderStatus(); }
      SCENARIOS[name]();
      emit();
    },
    addKill() {
      if (roundIsOver() || !alive('ct').length || !alive('t').length) return;
      kill(Math.random() < 0.5 ? 'ct' : 't');
    },
    // Manual score: +1 adds a won round to the strip, -1 removes that team's last won round
    changeScore(side, delta) {
      if (delta > 0) {
        S.rounds[side]++;
        S.history.push({ w: side, type: 'elim' });
        renderRounds(S.history.length - 1);
      } else {
        const i = S.history.map(r => r.w).lastIndexOf(side);
        if (i < 0 || S.rounds[side] <= 0) return;
        S.rounds[side]--;
        S.history.splice(i, 1);
        renderRounds();
      }
      renderScore(); renderMaps();
    },
  };
})();

