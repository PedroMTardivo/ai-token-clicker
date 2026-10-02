// Ponto de entrada: carrega o save, liga os eventos e roda o loop.
(function (AIC) {
  const { config: C, core: K, i18n: I, ui: UI, save: S, util: U } = AIC;
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
    UI.typeToken(state.tier);
    UI.pulse(UI.el().prompt);
  }

  function claimGolden(x, y) {
    const r = K.claimGolden(state);
    const msg = I.t(`golden.${r.id}`, { s: r.dur, n: U.fmt(r.amount || 0) });
    if (r.amount) UI.floatNumber(x, y, r.amount, 'gold');
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
      UI.update(state);
    });

    el.upgrades.addEventListener('click', (e) => {
      const b = e.target.closest('[data-upg]');
      if (b && K.buyUpgrade(state, b.dataset.upg)) UI.update(state);
    });

    // Geradores e rivais usam o mesmo fluxo de compra.
    const buyBuilding = (e) => {
      const b = e.target.closest('[data-gen]');
      if (b && K.buyGen(state, b.dataset.gen, state.buyAmount)) {
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
      if (!K.buyModel(state)) return;
      const m = C.models[state.tier];
      const msg = I.t('ui.modelUp', { name: m.name, mult: m.mult });
      UI.toast(msg);
      UI.systemLine(msg);
      UI.flash('evolve');
      S.save(state);
      UI.update(state);
    });

    el.perks.addEventListener('click', (e) => {
      const b = e.target.closest('[data-perk]');
      if (b && K.buyPerk(state, b.dataset.perk)) {
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
      UI.systemLine(`${C.models[state.tier].name} online.`);
      UI.toast(msg, 6000, 'gold');
      UI.flash('singularity');
      checkAchievements();
      S.save(state);
      UI.update(state);
    });

    el.lang.addEventListener('click', () => {
      state.lang = I.lang = I.lang === 'pt' ? 'en' : 'pt';
      UI.applyStaticTexts();
      UI.update(state);
      S.save(state);
    });

    document.getElementById('reset-btn').addEventListener('click', () => {
      if (!confirm(I.t('ui.resetConfirm'))) return;
      S.wipe();
      const lang = state.lang;
      state = K.newState();
      state.lang = lang;
      UI.clearOutput();
      UI.update(state);
    });

    window.addEventListener('beforeunload', () => S.save(state));
    document.addEventListener('visibilitychange', () => { if (document.hidden) S.save(state); });
  }

  function start() {
    state = S.load();
    I.lang = state.lang || I.detect();
    state.lang = I.lang;

    UI.init();
    UI.applyStaticTexts();
    bindEvents();
    applyOffline();
    UI.systemLine(`${C.models[state.tier].name} online.`);
    UI.update(state);

    // Usa o tempo real decorrido: abas em segundo plano têm o setInterval desacelerado.
    let last = performance.now();
    setInterval(() => {
      const now = performance.now();
      K.tick(state, Math.min((now - last) / 1000, K.offlineCapHours(state) * 3600));
      last = now;
      if (state.goldenIn <= 0) {
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
