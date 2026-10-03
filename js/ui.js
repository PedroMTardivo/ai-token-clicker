// Renderização e efeitos visuais. Lê o estado; quem altera o estado é game.js via AIC.core.
(function (AIC) {
  const { config: C, core: K, i18n: I, util: U } = AIC;
  const t = I.t;
  const $ = (id) => document.getElementById(id);
  const MAX_OUTPUT_LINES = 14;
  const NEW_HIGHLIGHT_MS = 4000;
  const MAX_TOASTS = 4;

  let el = {};
  const sigs = {}; // assinatura de cada lista; reconstrói só quando muda
  const knownVisible = new Set(); // ids já vistos; itens fora dele ganham destaque de "novo"
  let firstUpdate = true;
  const badges = new Set();
  const outputState = { line: null, words: [], pos: 0 };
  let golden = null;
  let usage = null; // último resumo de uso vindo do app desktop (null na versão web)

  function init() {
    el = {
      tokens: $('tokens'), tps: $('tps'), perClick: $('per-click'), autoWrap: $('auto-wrap'), autoRate: $('auto-rate'), buffs: $('buffs'),
      modelName: $('model-name'), modelDesc: $('model-desc'),
      modelBtn: $('model-next'), modelCmd: $('model-cmd'), modelCost: $('model-cost'), modelBar: $('model-bar'),
      prompt: $('prompt-btn'), output: $('output'),
      tabs: $('tabs'), upgrades: $('upgrades'), gens: $('generators'), rivals: $('rivals'), installed: $('installed'),
      agi: $('agi'), prestigeBtn: $('prestige-btn'), prestigeGain: $('prestige-gain'), agiNote: $('agi-note'),
      agiExplain: $('agi-explain'), perks: $('perks'), lineages: $('lineages'), lineageNote: $('lineage-note'),
      modelLineage: $('model-lineage'),
      achievements: $('achievements'), achSummary: $('ach-summary'),
      computeBalance: $('compute-balance'), computeStatus: $('compute-status'),
      computeDays: $('compute-days'), computeShop: $('compute-shop'),
      stats: $('stats'), toasts: $('toasts'), lang: $('lang-toggle'), theme: $('theme-select'),
    };
  }

  function applyStaticTexts() {
    document.documentElement.lang = I.lang === 'pt' ? 'pt-BR' : 'en';
    for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
    el.lang.textContent = I.lang === 'pt' ? 'EN' : 'PT';
    el.theme.setAttribute('aria-label', t('ui.theme'));
    el.theme.title = t('ui.theme');
    el.agiExplain.textContent = t('agi.explain', { pct: U.fmt(C.prestige.bonusPerPoint * 100) });
    for (const k in sigs) delete sigs[k]; // força reconstrução das listas no próximo update
  }

  const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  function itemHtml({ attr, id, cmd, name, desc, extra = '', effect = false }) {
    return `<button class="item" ${attr}="${id}">
      <div class="item-top"><span class="item-name">${name}</span>${extra}</div>
      <div class="item-cmd"><span class="ps">$</span> ${cmd}</div>
      <div class="item-desc">${desc}</div>${effect ? '\n      <div class="item-effect"></div>' : ''}
      <div class="item-meta"><span class="item-cost"></span><span class="item-rate"></span></div>
    </button>`;
  }

  // Efeito atual de um rival, já com a curva de retorno decrescente (ex.: "clique +45%").
  function effectText(s, r) {
    if (!r?.effect) return '';
    const v = K.rivalEffectOf(s, r);
    const n = r.effect.type === 'offlineHours' ? U.fmt(v) : (v * 100).toFixed(v < 0.1 ? 1 : 0);
    return t(`effect.${r.effect.type}`, { n });
  }

  // Upgrades gerados (tiers e sinergias) montam nome/descrição a partir de modelos.
  function upgName(u) {
    return u.template ? t(`upgTier.${u.template}.name`, { name: t(`gen.${u.target}.name`) }) : t(`upg.${u.id}.name`);
  }

  function upgDesc(u) {
    if (u.template) return t(`upgTier.${u.template}.desc`, { name: t(`gen.${u.target}.name`) });
    if (u.type === 'rivalBoost') return t('upg.rivalBoost.desc', { name: t(`rival.${u.target}.name`) });
    if (u.type === 'synergy') {
      return t('upg.synergy.desc', { target: t(`gen.${u.target}.name`), source: t(`gen.${u.source}.name`), pct: Math.round(u.value * 100) });
    }
    return t(`upg.${u.id}.desc`);
  }

  const lockedHtml = (name, modelName) => `<div class="item locked"><div class="item-top"><span class="item-name">${name}</span></div>
    <div class="item-desc">${t('ui.locked', { name: modelName })}</div></div>`;

  // Abas
  function setBadge(tab, on) {
    if (on) badges.add(tab); else badges.delete(tab);
    const b = el.tabs.querySelector(`[data-tab="${tab}"]`);
    if (b) b.classList.toggle('badge', on);
  }

  function badge(tab, s) {
    if (s.tab !== tab) setBadge(tab, true);
  }

  function renderTabs(s) {
    for (const b of el.tabs.querySelectorAll('[data-tab]')) b.classList.toggle('active', b.dataset.tab === s.tab);
    for (const p of document.querySelectorAll('[data-panel]')) p.hidden = p.dataset.panel !== s.tab;
    if (badges.has(s.tab)) setBadge(s.tab, false);
  }

  // Destaca o que apareceu desde a última renderização (não no primeiro update, ao carregar o jogo).
  function highlightNew(s, ids, root, tab) {
    for (const id of ids) {
      if (knownVisible.has(id)) continue;
      knownVisible.add(id);
      const node = !firstUpdate && root.querySelector(`[data-upg="${id}"], [data-gen="${id}"]`);
      if (!node) continue;
      node.classList.add('new');
      setTimeout(() => node.classList.remove('new'), NEW_HIGHLIGHT_MS);
      badge(tab, s);
    }
  }

  function renderShop(s, upgs, gens) {
    el.upgrades.innerHTML = upgs.length
      ? upgs.map((u) => itemHtml({
          attr: 'data-upg', id: u.id,
          cmd: `install ${slug(upgName(u))}`,
          name: upgName(u), desc: upgDesc(u),
        })).join('')
      : `<p class="empty">${t('ui.noUpgrades')}</p>`;

    let html = gens.map((g) => itemHtml({
      attr: 'data-gen', id: g.id,
      cmd: `deploy ${slug(t(`gen.${g.id}.name`))}`,
      name: t(`gen.${g.id}.name`), desc: t(`gen.${g.id}.desc`),
      extra: '<span class="item-owned"></span>',
    })).join('');
    const locked = C.generators.find((g) => !K.genVisible(s, g));
    if (locked) html += lockedHtml('???', K.modelsOf(s)[locked.tier].name);
    el.gens.innerHTML = html;

    highlightNew(s, [...upgs.map((u) => u.id), ...gens.map((g) => g.id)], el.gens.parentElement, 'shop');
  }

  function renderLabs(s) {
    el.rivals.innerHTML = C.rivals.map((r) => K.genVisible(s, r)
      ? itemHtml({
          attr: 'data-gen', id: r.id,
          cmd: `hire ${r.id}`,
          name: t(`rival.${r.id}.name`), desc: t(`rival.${r.id}.desc`),
          extra: '<span class="item-owned"></span>',
          effect: !!r.effect,
        })
      : lockedHtml(t(`rival.${r.id}.name`), K.modelsOf(s)[r.tier].name)).join('');
    highlightNew(s, C.rivals.filter((r) => K.genVisible(s, r)).map((r) => r.id), el.rivals, 'labs');
  }

  function renderPerks() {
    el.perks.innerHTML = C.perks.map((p) => `<button class="item" data-perk="${p.id}">
      <div class="item-top"><span class="item-name">${t(`perk.${p.id}.name`)}</span><span class="item-owned"></span></div>
      <div class="item-desc">${t(`perk.${p.id}.desc`)}</div>
      <div class="item-meta"><span class="item-cost"></span><span class="item-rate"></span></div>
    </button>`).join('');
  }

  function achDesc(a) {
    const vars = { n: U.fmt(a.n) };
    if (a.type === 'tier') vars.name = C.models[a.n].name; // conquistas de modelo são da escada GPT
    if (a.type === 'lineage') vars.name = t(`lineage.${a.target}.name`);
    if (a.type === 'gen') vars.name = t(`gen.${a.target}.name`);
    return t(`achd.${a.type}`, vars);
  }

  function renderAchievements(s) {
    const n = Object.keys(s.achievements).length;
    el.achSummary.textContent = t('ach.summary', {
      n, total: C.achievements.length, pct: Math.round(n * C.achievementBonus * 100),
    });
    el.achievements.innerHTML = C.achievements.map((a) => {
      const done = s.achievements[a.id];
      return `<div class="ach ${done ? 'done' : ''}">
        <div class="ach-name">${done ? t(`ach.${a.id}.name`) : t('ach.hidden')}</div>
        <div class="ach-desc">${achDesc(a)}</div>
      </div>`;
    }).join('');
  }

  // Reconstrói `fn` só quando a assinatura muda.
  function sync(key, sig, fn) {
    if (sigs[key] === sig) return;
    sigs[key] = sig;
    fn();
  }

  function update(s) {
    const d = K.compute(s);
    el.tokens.textContent = U.fmt(s.tokens);
    el.tps.textContent = U.fmt(d.tps);
    el.perClick.textContent = U.fmt(d.perClick);
    el.autoWrap.hidden = d.autoClicks <= 0;
    el.autoRate.textContent = U.fmt(d.autoClicks);
    document.title = `${U.fmt(s.tokens)} tokens · AI Token Clicker`;
    el.buffs.innerHTML = mechanicChip(s, d) + s.buffs.map((b) =>
      `<span class="buff ${b.mult < 1 ? 'bad' : ''}">${t(`buff.${b.id}`)} · ${Math.ceil(b.left)}s</span>`).join('');

    renderTabs(s);

    const upgs = C.upgrades.filter((u) => K.upgradeVisible(s, u)).sort((a, b) => a.cost - b.cost);
    const gens = C.generators.filter((g) => K.genVisible(s, g));
    sync('themes', `${I.lang}|${Object.keys(s.lineages).join()}`, () => renderThemes(s));
    sync('lineages', `${I.lang}|${s.lineage}|${s.nextLineage}|${Object.keys(s.lineages).join()}`, () => renderLineages(s));
    sync('shop', [I.lang, s.lineage, s.tier, ...upgs.map((u) => u.id)].join('|'), () => renderShop(s, upgs, gens));
    sync('labs', `${I.lang}|${s.lineage}|${s.tier}`, () => renderLabs(s));
    sync('perks', I.lang, renderPerks);
    if (AIC.computeSys) sync('cshop', `${I.lang}|${JSON.stringify(s.compute.levels)}`, renderComputeShop);
    sync('ach', `${I.lang}|${Object.keys(s.achievements).length}`, () => renderAchievements(s));

    for (const node of el.upgrades.querySelectorAll('[data-upg]')) {
      const u = K.upgById[node.dataset.upg];
      node.querySelector('.item-cost').textContent = `${U.fmt(u.cost)} tk`;
      node.classList.toggle('poor', s.tokens < u.cost);
    }

    for (const node of document.querySelectorAll('[data-gen]')) {
      const id = node.dataset.gen;
      const have = K.owned(s, id);
      let n = s.buyAmount === 'max' ? K.maxAffordable(s, id) : s.buyAmount;
      const affordable = n >= 1 && s.tokens >= K.genCost(s, id, n);
      if (n < 1) n = 1;
      node.querySelector('.item-owned').textContent = have ? t('ui.owned', { n: have }) : '';
      node.querySelector('.item-cost').textContent = `${U.fmt(K.genCost(s, id, n))} tk${n > 1 ? ` (×${n})` : ''}`;
      node.querySelector('.item-rate').textContent = t('ui.each', { n: U.fmt(d.genTps[id]) });
      const effectNode = node.querySelector('.item-effect');
      if (effectNode) effectNode.textContent = effectText(s, K.rivalById[id]);
      node.classList.toggle('poor', !affordable);
    }

    el.installed.textContent = `${Object.keys(s.upgrades).length}/${C.upgrades.length} ${t('ui.installed')}`;
    for (const b of document.querySelectorAll('.buy-amount button')) {
      b.classList.toggle('active', b.dataset.amount === String(s.buyAmount));
    }

    updateModel(s);
    updateAgi(s);
    if (s.tab === 'stats') renderStats(s, d);
    if (AIC.computeSys) updateCompute(s);
    firstUpdate = false;
  }

  function updateModel(s) {
    const cur = K.modelsOf(s)[s.tier];
    el.modelLineage.textContent = s.lineage === 'gpt' ? '' : t('ui.lineageLabel', { name: t(`lineage.${s.lineage}.name`) });
    const next = K.nextModel(s);
    el.modelName.textContent = cur.name;
    el.modelDesc.textContent = t(`model.${cur.id}.desc`);
    if (next) {
      el.modelCmd.textContent = t('ui.upgradeModel', { name: next.name });
      el.modelCost.textContent = `${U.fmt(next.cost)} tk · ×${next.mult}`;
      el.modelBar.style.width = `${Math.min(100, (s.tokens / next.cost) * 100)}%`;
      el.modelBtn.classList.toggle('poor', s.tokens < next.cost);
      el.modelBtn.disabled = false;
    } else {
      el.modelCmd.textContent = t('ui.maxModel');
      el.modelCost.textContent = '';
      el.modelBar.style.width = '100%';
      el.modelBtn.disabled = true;
    }
  }

  let couldPrestige = false;

  function updateAgi(s) {
    const can = K.canPrestige(s);
    if (can && !couldPrestige) badge('agi', s);
    couldPrestige = can;

    const avail = K.agiAvailable(s);
    for (const node of el.perks.querySelectorAll('[data-perk]')) {
      const p = K.perkById[node.dataset.perk];
      const lvl = K.perkLevel(s, p.id);
      const maxed = K.perkMaxed(s, p);
      const needs = p.req && !K.hasPerk(s, p.req);
      node.classList.toggle('owned', maxed);
      node.classList.toggle('poor', !maxed && !K.perkBuyable(s, p));
      let ownedText = '';
      if (p.levels) ownedText = lvl ? t(p.max ? 'compute.level' : 'agi.level', { n: lvl, max: p.max }) : '';
      else if (maxed) ownedText = `✓ ${t('agi.owned')}`;
      node.querySelector('.item-owned').textContent = ownedText;
      node.querySelector('.item-cost').textContent = maxed ? (p.levels ? t('compute.maxed') : '') : t('agi.cost', { n: K.perkCost(s, p) });
      node.querySelector('.item-rate').textContent = needs ? t('agi.requires', { name: t(`perk.${p.req}.name`) }) : '';
    }

    if (s.tab !== 'agi') return;
    const rows = [
      ['agi.points', `${U.fmt(s.agi.points)} <span class="muted">(${U.fmt(avail)} ${t('agi.available')})</span>`],
      ['agi.bonus', `+${U.fmt(s.agi.points * C.prestige.bonusPerPoint * 100)}%`],
      ['agi.runTokens', U.fmt(s.runTokens)],
      ['agi.gain', `+${U.fmt(K.prestigeGain(s))}`],
      ['agi.next', `${U.fmt(K.nextPointAt(s))} tk`],
    ];
    el.agi.innerHTML = rows.map(([k, v]) => `<div class="stat"><span>${t(k)}</span><b>${v}</b></div>`).join('');
    el.prestigeBtn.disabled = !can;
    el.prestigeGain.textContent = can ? `+${U.fmt(K.prestigeGain(s))} pts` : '';
    el.agiNote.textContent = s.tier < C.prestige.minTier
      ? t('agi.locked', { name: K.modelsOf(s)[C.prestige.minTier].name })
      : can ? '' : t('agi.notEnough');
  }

  // ---- linhagens ----

  // Indicador da mecânica da linhagem atual, junto dos buffs.
  function mechanicChip(s, d) {
    const mods = K.lineageOf(s).mods || {};
    if (mods.clickRate) {
      return `<span class="buff mech">${t('mech.rate', { rate: U.fmt(s.clickRate), mult: d.rateMult.toFixed(1) })}</span>`;
    }
    if (mods.diversity) {
      const n = Math.round((d.diversityMult - 1) / mods.diversity.per);
      return `<span class="buff mech">${t('mech.diversity', { n, mult: d.diversityMult.toFixed(2) })}</span>`;
    }
    return '';
  }

  function renderLineages(s) {
    const anyUnlocked = Object.keys(C.lineages).some((id) => id !== 'gpt' && K.lineageUnlocked(s, id));
    el.lineageNote.textContent = anyUnlocked ? `${t('lineage.pickNote')} ${t('lineage.soon')}` : t('lineage.lockedNote');
    el.lineages.innerHTML = Object.keys(C.lineages).map((id) => {
      const unlocked = K.lineageUnlocked(s, id);
      const tags = [];
      if (s.lineage === id) tags.push(t('lineage.current'));
      if (s.nextLineage === id) tags.push(t('lineage.next'));
      if (s.lineages[id]) tags.push(`✓ ${t('lineage.done')}`);
      if (!unlocked) tags.push(t('lineage.locked'));
      return `<button class="item ${unlocked ? '' : 'locked'} ${s.nextLineage === id ? 'owned' : ''}" data-lineage="${id}" ${unlocked ? '' : 'disabled'}>
        <div class="item-top"><span class="item-name">${t(`lineage.${id}.name`)}</span><span class="item-owned">${tags.join(' · ')}</span></div>
        <div class="item-desc">${t(`lineage.${id}.desc`)}</div>
        <div class="item-effect">${t(`lineage.${id}.reward`)}</div>
      </button>`;
    }).join('');
  }

  // Temas exclusivos ficam visíveis, mas desabilitados, até a linhagem correspondente ser concluída.
  function renderThemes(s) {
    el.theme.innerHTML = C.themes.map((id) => {
      const need = C.themeUnlocks[id];
      const locked = need && !s.lineages[need];
      const label = locked ? t('theme.locked', { name: t(`theme.${id}`), lineage: t(`lineage.${need}.name`) }) : t(`theme.${id}`);
      return `<option value="${id}" ${locked ? 'disabled' : ''}>${label}</option>`;
    }).join('');
    el.theme.value = document.documentElement.dataset.theme || C.themes[0];
  }

  // ---- compute (app desktop) ----

  function renderComputeShop() {
    el.computeShop.innerHTML = C.compute.shop.map((item) => `<button class="item" data-cshop="${item.id}">
      <div class="item-top"><span class="item-name">${t(`cshop.${item.id}.name`)}</span><span class="item-owned"></span></div>
      <div class="item-desc">${t(`cshop.${item.id}.desc`)}</div>
      <div class="item-meta"><span class="item-cost"></span><span class="item-rate"></span></div>
    </button>`).join('');
  }

  function updateCompute(s) {
    const CS = AIC.computeSys;
    const c = s.compute;
    el.computeBalance.textContent = t('compute.balance', { n: U.fmt(c.balance) });
    for (const node of el.computeShop.querySelectorAll('[data-cshop]')) {
      const item = CS.shopById[node.dataset.cshop];
      const lvl = CS.level(s, item.id);
      const maxed = CS.maxed(s, item);
      node.classList.toggle('poor', !CS.canBuy(s, item));
      node.querySelector('.item-owned').textContent = item.levels && lvl ? t('compute.level', { n: lvl, max: item.max }) : '';
      node.querySelector('.item-cost').textContent = maxed ? t('compute.maxed') : `⚡ ${U.fmt(CS.itemCost(s, item))}`;
    }
    if (s.tab !== 'compute') return;

    const today = usage?.today;
    const day = today && usage.days[today];
    const rows = [
      ['compute.source', !usage ? t('compute.waiting') : usage.found ? t('compute.connected', { n: usage.files }) : t('compute.notFound')],
      ['compute.todayRaw', day ? U.fmt(day.input + day.output + day.cacheWrite + day.cacheRead) : '0'],
      ['compute.todayWeighted', day ? U.fmt(CS.weighted(day)) : '0'],
      ['compute.todayEarned', `⚡ ${U.fmt((today && c.earned[today]) || 0)}`],
      ['compute.totalEarned', `⚡ ${U.fmt(c.total)}`],
    ];
    el.computeStatus.innerHTML = rows.map(([k, v]) => `<div class="stat"><span>${t(k)}</span><b>${v}</b></div>`).join('');

    if (!today) {
      el.computeDays.innerHTML = '';
      return;
    }
    const dates = Array.from({ length: 7 }, (_, i) => CS.addDays(today, i - 6));
    const w = dates.map((dt) => (usage.days[dt] ? CS.weighted(usage.days[dt]) : 0));
    const max = Math.max(1, ...w);
    el.computeDays.innerHTML = dates.map((dt, i) => `<div class="cday ${dt === today ? 'today' : ''}">
      <span>${dt.slice(8)}/${dt.slice(5, 7)}</span>
      <span class="bar"><span style="width:${(w[i] / max) * 100}%"></span></span>
      <span class="w">${U.fmt(w[i])}</span>
      <b>${c.earned[dt] ? `+${U.fmt(c.earned[dt])}` : '—'}</b>
    </div>`).join('');
  }

  function renderStats(s, d) {
    const gens = Object.values(s.gens).reduce((a, b) => a + b, 0);
    const rows = [
      ['stats.total', U.fmt(s.totalTokens)],
      ['stats.clicks', U.fmt(s.clicks)],
      ['stats.clickTokens', U.fmt(s.clickTokens)],
      ['stats.gens', U.fmt(gens)],
      ['stats.upgrades', `${Object.keys(s.upgrades).length}/${C.upgrades.length}`],
      ['stats.multiplier', `×${U.fmt(d.global)}`],
      ['stats.golden', U.fmt(s.goldenClicks)],
      ['stats.rateLimited', U.fmt(s.rateLimited)],
      ['stats.achievements', `${Object.keys(s.achievements).length}/${C.achievements.length}`],
      ['stats.prestiges', U.fmt(s.prestiges)],
      ['stats.agi', U.fmt(s.agi.points)],
      ['stats.runTime', U.fmtTime(s.runTime)],
      ['stats.playTime', U.fmtTime(s.playTime)],
    ];
    el.stats.innerHTML = rows.map(([k, v]) => `<div class="stat"><span>${t(k)}</span><b>${v}</b></div>`).join('');
  }

  // ---- efeitos ----

  function newOutputLine(cls) {
    const line = document.createElement('div');
    line.className = `out-line ${cls || ''}`;
    el.output.appendChild(line);
    while (el.output.children.length > MAX_OUTPUT_LINES) el.output.firstChild.remove();
    return line;
  }

  // Cada clique "gera" uma palavra: o GPT-1 solta lixo aleatório, os modelos maiores escrevem frases.
  function typeToken(tier) {
    const src = I.outputFor(tier);
    if (src.gibberish) {
      if (!outputState.line || outputState.line.textContent.length > 48 || outputState.words.length) {
        outputState.line = newOutputLine();
        outputState.words = [];
      }
      outputState.line.textContent += src.gibberish[Math.floor(Math.random() * src.gibberish.length)] + ' ';
    } else {
      if (outputState.pos >= outputState.words.length) {
        outputState.words = src.lines[Math.floor(Math.random() * src.lines.length)].split(' ');
        outputState.pos = 0;
        outputState.line = newOutputLine();
      }
      outputState.line.textContent += outputState.words[outputState.pos++] + ' ';
    }
    el.output.scrollTop = el.output.scrollHeight;
  }

  function systemLine(text) {
    newOutputLine('sys').textContent = `[system] ${text}`;
    outputState.line = null;
    outputState.words = [];
    outputState.pos = 0;
    el.output.scrollTop = el.output.scrollHeight;
  }

  function clearOutput() {
    el.output.innerHTML = '';
    outputState.line = null;
    outputState.words = [];
    outputState.pos = 0;
  }

  function floatNumber(x, y, n, cls = '') {
    floatText(x, y, `+${U.fmt(n)}`, cls);
  }

  function floatText(x, y, text, cls = '') {
    const f = document.createElement('div');
    f.className = `float ${cls}`;
    f.textContent = text;
    f.style.left = `${x + (Math.random() * 30 - 15)}px`;
    f.style.top = `${y - 10}px`;
    document.body.appendChild(f);
    f.addEventListener('animationend', () => f.remove());
  }

  function pulse(node) {
    node.classList.remove('pulse');
    void node.offsetWidth; // reinicia a animação
    node.classList.add('pulse');
  }

  function flash(cls) {
    document.body.classList.remove(cls);
    void document.body.offsetWidth;
    document.body.classList.add(cls);
  }

  function toast(msg, ms = 4000, cls = '') {
    const n = document.createElement('div');
    n.className = `toast ${cls}`;
    n.textContent = msg;
    el.toasts.appendChild(n);
    while (el.toasts.children.length > MAX_TOASTS) el.toasts.firstChild.remove();
    setTimeout(() => n.classList.add('out'), ms);
    setTimeout(() => n.remove(), ms + 400);
  }

  // Token dourado num ponto aleatório da tela. `onClaim(x, y)` roda se o jogador clicar a tempo.
  function spawnGolden(onClaim) {
    if (golden) return;
    const b = document.createElement('button');
    b.className = 'golden';
    b.textContent = t('golden.label');
    b.style.left = `${8 + Math.random() * 72}vw`;
    b.style.top = `${14 + Math.random() * 66}vh`;
    const remove = () => {
      if (golden !== b) return;
      golden = null;
      b.classList.add('gone');
      setTimeout(() => b.remove(), 400);
    };
    b.addEventListener('click', (e) => {
      if (golden !== b) return;
      onClaim(e.clientX, e.clientY);
      remove();
    });
    document.body.appendChild(b);
    golden = b;
    setTimeout(remove, C.golden.lifetime * 1000);
  }

  AIC.ui = {
    init, applyStaticTexts, update, badge, setUsage: (u) => { usage = u; }, typeToken, systemLine, clearOutput,
    floatNumber, floatText, pulse, flash, toast, spawnGolden, el: () => el,
  };
})(globalThis.AIC = globalThis.AIC || {});
