// Ponto de entrada: carrega o save, liga os eventos e roda o loop.
(function (AIC) {
  const { config: C, core: K, i18n: I, ui: UI, save: S, util: U, audio: A } = AIC;
  let state;

  function applyOffline() {
    state.buffs = []; // buffs não valem para o tempo fora
    const away = Math.min((Date.now() - state.lastSeen) / 1000, K.offlineCapHours(state) * 3600);
    if (away < 10) return;
    const gain = K.compute(state).income * away;
    if (gain <= 0) return;
    K.earn(state, gain);
    UI.toast(I.t('ui.offline', { time: U.fmtTime(away), n: U.fmt(gain) }), 7000);
  }

  // Janela deslizante de 1 s: o clique além do limite é barrado e não gera nada.
  const recentClicks = [];
  let lastRateWarn = -Infinity;

  function rateLimited(now) {
    while (recentClicks.length && now - recentClicks[0] >= 1000) recentClicks.shift();
    if (recentClicks.length < C.maxClicksPerSecond) {
      recentClicks.push(now);
      return false;
    }
    return true;
  }

  function blockClick(x, y, now) {
    state.rateLimited++;
    UI.floatText(x, y, '429', 'bad');
    A.play('blocked');
    if (now - lastRateWarn < C.rateLimitWarnCooldown * 1000) return;
    lastRateWarn = now;
    const lines = I.t('rate.msgs').split('|');
    const msg = lines[Math.floor(Math.random() * lines.length)].replace('{max}', C.maxClicksPerSecond);
    UI.toast(msg, 6000, 'bad');
    UI.systemLine(msg);
  }

  function doClick(x, y) {
    const now = performance.now();
    if (rateLimited(now)) return blockClick(x, y, now);
    const gain = K.click(state);
    UI.floatNumber(x, y, gain);
    A.play('click');
    UI.typeToken(state.tier);
    UI.pulse(UI.el().prompt);
  }

  function claimGolden(x, y) {
    const r = K.claimGolden(state);
    const msg = I.t(`golden.${r.id}`, { s: r.dur, n: U.fmt(r.amount || 0) });
    if (r.amount) UI.floatNumber(x, y, r.amount, 'gold');
    A.play(r.id === 'hallucination' ? 'hallucination' : 'goldenClaim');
    UI.toast(msg, 5000, r.id === 'hallucination' ? 'bad' : 'gold');
    UI.systemLine(msg);
    UI.update(state);
  }

  function checkAchievements() {
    const fresh = K.checkAchievements(state);
    if (!fresh.length) return;
    // Várias de uma vez (ex.: save antigo) viram um toast só.
    const msg = fresh.length > 2
      ? I.t('ach.many', { n: fresh.length })
      : fresh.map((id) => I.t('ach.unlocked', { name: I.t(`ach.${id}.name`) })).join(' · ');
    UI.toast(msg, 5000, 'ach');
    UI.badge('achievements', state);
    A.play('achievement');
  }

  // App desktop: o resumo de uso dos logs do Claude Code vira compute.
  function handleUsage(summary) {
    UI.setUsage(summary);
    const first = !state.compute.connectedAt;
    const gained = AIC.computeSys.sync(state, summary);
    if (gained > 0) {
      UI.toast(I.t(first ? 'compute.firstSync' : 'compute.gained', { n: U.fmt(gained) }), 7000, 'gold');
      A.play('goldenClaim');
      UI.badge('compute', state);
      S.save(state);
    }
    UI.update(state);
  }

  function connectDesktop() {
    const desktop = window.aicDesktop;
    if (!desktop) {
      if (state.tab === 'compute') state.tab = 'shop'; // save vindo do desktop aberto na web
      return;
    }
    document.getElementById('tab-compute').hidden = false;
    desktop.getUsage().then(handleUsage, (err) => console.error('uso indisponível:', err));
    desktop.onUsage(handleUsage);
  }

  // Tema exclusivo escolhido mas não liberado neste save (ex.: depois de resetar): volta ao padrão.
  function enforceThemeLock() {
    const theme = document.documentElement.dataset.theme;
    if (!C.themeUnlocks[theme] || state.lineages[C.themeUnlocks[theme]]) return;
    document.documentElement.dataset.theme = '';
    try { localStorage.setItem('ai-token-clicker.theme', ''); } catch { /* storage indisponível */ }
  }

  function lineageCompleted(id) {
    const msg = I.t('lineage.completed', { name: I.t(`lineage.${id}.name`), reward: I.t(`lineage.${id}.reward`) });
    UI.toast(msg, 9000, 'gold');
    UI.systemLine(msg);
    if (id === 'gpt') UI.toast(I.t('lineage.unlockedNew'), 9000, 'gold');
    UI.flash('singularity');
    A.play('prestige');
    UI.badge('agi', state);
    checkAchievements();
  }

  function bindEvents() {
    const el = UI.el();

    el.prompt.addEventListener('click', (e) => {
      // e.detail === 0 → clique via teclado (Enter); usa o centro do botão
      const r = el.prompt.getBoundingClientRect();
      const x = e.detail ? e.clientX : r.left + r.width / 2;
      const y = e.detail ? e.clientY : r.top + r.height / 2;
      doClick(x, y);
    });

    // Espaço sempre gera tokens, mesmo com outro botão focado. Segurar a tecla não conta.
    document.addEventListener('keydown', (e) => {
      if (e.code !== 'Space') return;
      e.preventDefault();
      if (e.repeat) return;
      const r = el.prompt.getBoundingClientRect();
      doClick(r.left + r.width / 2, r.top + r.height / 2);
    });
    document.addEventListener('keyup', (e) => { if (e.code === 'Space') e.preventDefault(); });

    el.tabs.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      state.tab = b.dataset.tab;
      A.play('ui');
      UI.update(state);
    });

    el.upgrades.addEventListener('click', (e) => {
      const b = e.target.closest('[data-upg]');
      if (b && K.buyUpgrade(state, b.dataset.upg)) {
        A.play('upgrade');
        UI.update(state);
      }
    });

    // Geradores e rivais usam o mesmo fluxo de compra.
    const buyBuilding = (e) => {
      const b = e.target.closest('[data-gen]');
      if (b && K.buyGen(state, b.dataset.gen, state.buyAmount)) {
        A.play('buy');
        UI.pulse(b);
        UI.update(state);
      }
    };
    el.gens.addEventListener('click', buyBuilding);
    el.rivals.addEventListener('click', buyBuilding);

    for (const seg of document.querySelectorAll('.buy-amount')) {
      seg.addEventListener('click', (e) => {
        const b = e.target.closest('[data-amount]');
        if (!b) return;
        state.buyAmount = b.dataset.amount === 'max' ? 'max' : Number(b.dataset.amount);
        UI.update(state);
      });
    }

    el.modelBtn.addEventListener('click', () => {
      const r = K.buyModel(state);
      if (!r) return;
      const m = K.modelsOf(state)[state.tier];
      const msg = I.t('ui.modelUp', { name: m.name, mult: m.mult });
      UI.toast(msg);
      UI.systemLine(msg);
      UI.flash('evolve');
      A.play('model');
      if (r.completed) lineageCompleted(r.completed);
      S.save(state);
      UI.update(state);
    });

    el.computeShop.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cshop]');
      const r = b && AIC.computeSys.buy(state, b.dataset.cshop);
      if (!r) return;
      A.play(r.item.type === 'boost' ? 'goldenClaim' : 'upgrade');
      if (r.amount) UI.toast(I.t('compute.injected', { n: U.fmt(r.amount) }), 4000, 'gold');
      UI.pulse(b);
      S.save(state);
      UI.update(state);
    });

    el.lineages.addEventListener('click', (e) => {
      const b = e.target.closest('[data-lineage]');
      if (b && K.setNextLineage(state, b.dataset.lineage)) {
        A.play('ui');
        S.save(state);
        UI.update(state);
      }
    });

    el.perks.addEventListener('click', (e) => {
      const b = e.target.closest('[data-perk]');
      if (b && K.buyPerk(state, b.dataset.perk)) {
        A.play('upgrade');
        UI.pulse(b);
        S.save(state);
        UI.update(state);
      }
    });

    el.prestigeBtn.addEventListener('click', () => {
      if (!K.canPrestige(state) || !confirm(I.t('agi.confirm', { n: U.fmt(K.prestigeGain(state)) }))) return;
      const gain = K.prestige(state);
      const msg = I.t('agi.done', { n: U.fmt(gain) });
      UI.clearOutput();
      UI.systemLine(msg);
      UI.systemLine(`${K.modelsOf(state)[state.tier].name} online.`);
      UI.toast(msg, 6000, 'gold');
      UI.flash('singularity');
      A.play('prestige');
      checkAchievements();
      S.save(state);
      UI.update(state);
    });

    el.theme.addEventListener('change', () => {
      const need = C.themeUnlocks[el.theme.value];
      if (need && !state.lineages[need]) {
        el.theme.value = document.documentElement.dataset.theme || C.themes[0];
        return;
      }
      const theme = el.theme.value === C.themes[0] ? '' : el.theme.value;
      document.documentElement.dataset.theme = theme;
      try { localStorage.setItem('ai-token-clicker.theme', theme); } catch { /* storage indisponível */ }
      el.theme.blur(); // senão o espaço reabre o seletor em vez de clicar
      A.setStyle(theme === 'win98' ? 'win98' : 'chip');
      A.play(theme === 'win98' ? 'startup' : 'ui');
    });

    // Áudio só pode começar depois de um gesto do usuário (regra dos navegadores).
    for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, A.unlock, { capture: true });

    for (const kind of ['sfx', 'music']) {
      const btn = document.getElementById(`${kind}-toggle`);
      const slider = document.getElementById(`${kind}-volume`);
      btn.addEventListener('click', () => {
        A.toggle(kind);
        syncAudioControls();
        A.play('ui');
      });
      slider.addEventListener('input', () => A.setVolume(kind, Number(slider.value)));
      slider.addEventListener('change', () => A.play(kind === 'sfx' ? 'buy' : 'ui'));
    }

    el.lang.addEventListener('click', () => {
      state.lang = I.lang = I.lang === 'pt' ? 'en' : 'pt';
      UI.applyStaticTexts();
      syncAudioControls();
      UI.update(state);
      S.save(state);
    });

    document.getElementById('reset-btn').addEventListener('click', () => {
      if (!confirm(I.t('ui.resetConfirm'))) return;
      S.wipe();
      const lang = state.lang;
      state = K.newState();
      state.lang = lang;
      enforceThemeLock();
      UI.clearOutput();
      UI.update(state);
    });

    window.addEventListener('beforeunload', () => S.save(state));
    document.addEventListener('visibilitychange', () => { if (document.hidden) S.save(state); });
  }

  function syncAudioControls() {
    const s = A.settings;
    for (const kind of ['sfx', 'music']) {
      const btn = document.getElementById(`${kind}-toggle`);
      btn.classList.toggle('off', !s[kind]);
      btn.title = I.t(`audio.${kind}`);
      btn.setAttribute('aria-pressed', String(s[kind]));
      document.getElementById(`${kind}-volume`).value = kind === 'sfx' ? s.sfxVol : s.musicVol;
    }
  }

  function start() {
    state = S.load();
    enforceThemeLock();
    I.lang = state.lang || I.detect();
    state.lang = I.lang;

    UI.init();
    UI.applyStaticTexts();
    A.setStyle(document.documentElement.dataset.theme === 'win98' ? 'win98' : 'chip');
    syncAudioControls();
    bindEvents();
    connectDesktop();
    applyOffline();
    UI.systemLine(`${K.modelsOf(state)[state.tier].name} online.`);
    UI.update(state);

    // Usa o tempo real decorrido: abas em segundo plano têm o setInterval desacelerado.
    let last = performance.now();
    let autoTyped = 0; // cliques automáticos acumulados para "digitar" no terminal (máx. 1 palavra por tick)
    setInterval(() => {
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, K.offlineCapHours(state) * 3600);
      K.tick(state, dt);
      autoTyped = Math.min(autoTyped + K.compute(state).autoClicks * dt, 3);
      if (autoTyped >= 1 && !document.hidden) {
        autoTyped -= 1;
        UI.typeToken(state.tier);
      }
      last = now;
      A.setMood({
        tier: state.tier,
        frenzy: state.buffs.some((b) => ['frenzy', 'clickFrenzy', 'session_boost'].includes(b.id)),
        hallucination: state.buffs.some((b) => b.id === 'hallucination'),
      });
      if (state.goldenIn <= 0) {
        if (!document.hidden) A.play('goldenSpawn');
        UI.spawnGolden(claimGolden);
        K.scheduleGolden(state);
      }
      checkAchievements();
      UI.update(state);
    }, C.tickMs);

    setInterval(() => S.save(state), C.saveEveryMs);
  }

  document.addEventListener('DOMContentLoaded', start);
})(globalThis.AIC = globalThis.AIC || {});
