// Regras do jogo: estado, cálculos de produção, compras, prestígio, conquistas e eventos. Sem DOM aqui.
(function (AIC) {
  const C = AIC.config;
  const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
  const genById = byId(C.generators);
  const rivalById = byId(C.rivals);
  const buildingById = { ...genById, ...rivalById }; // geradores e rivais dividem `state.gens`
  const upgById = byId(C.upgrades);
  const perkById = byId(C.perks);
  const computeShopById = byId(C.compute.shop);

  function newState() {
    const now = Date.now();
    return {
      version: 2,
      tokens: 0,
      runTokens: 0, // tokens desta run (base do prestígio)
      totalTokens: 0, // tokens de todas as runs
      clicks: 0,
      clickTokens: 0,
      rateLimited: 0, // cliques barrados pelo limite de cliques/s
      tier: 0,
      gens: {},
      upgrades: {},
      buffs: [],
      goldenIn: C.golden.firstDelay,
      goldenClicks: 0,
      achievements: {},
      agi: { points: 0, spent: 0, perks: {} },
      prestiges: 0,
      // Compute do app desktop. Fica fora do reset da singularidade.
      compute: { balance: 0, total: 0, spent: 0, earned: {}, levels: {}, connectedAt: null },
      lang: null,
      buyAmount: 1,
      tab: 'shop',
      // Linhagem da run atual, a escolhida para a próxima singularidade e as já concluídas.
      lineage: 'gpt',
      nextLineage: 'gpt',
      lineages: {},
      clickRate: 0, // cliques/s (manuais + automáticos), média móvel; usado pela linhagem Claude
      pendingClicks: 0,
      playTime: 0,
      runTime: 0,
      startedAt: now,
      lastSeen: now,
    };
  }

  const owned = (s, id) => s.gens[id] || 0;

  const lineageOf = (s) => C.lineages[s.lineage] || C.lineages.gpt;
  const modelsOf = (s) => lineageOf(s).models;
  const lineageUnlocked = (s, id) => !C.lineages[id].requires || !!s.lineages[C.lineages[id].requires];

  // Soma das recompensas permanentes das linhagens já concluídas.
  function rewardSum(s, type) {
    let v = 0;
    for (const [id, L] of Object.entries(C.lineages)) if (s.lineages[id] && L.reward?.type === type) v += L.reward.value;
    return v;
  }
  // Perks únicas guardam true; perks com níveis guardam o nível (saves antigos tinham true = nível 1).
  const perkLevel = (s, id) => {
    const v = s.agi.perks[id];
    return typeof v === 'number' ? v : v ? 1 : 0;
  };
  const hasPerk = (s, id) => perkLevel(s, id) > 0;
  const perkValue = (s, id) => perkLevel(s, id) * (perkById[id].value || 0);

  // Curva do efeito de um rival em função da quantidade. Nenhuma tem teto rígido:
  // - soft: linear até `soft` unidades, depois cresce com log (desacelera, mas nunca para)
  // - max: aproxima-se de `max` sem chegar (para descontos e velocidades, que não podem passar de 100%)
  // - nenhum dos dois: linear
  function effectCurve(e, n) {
    if (e.soft) return n <= e.soft ? e.value * n : e.value * e.soft * (1 + Math.log(n / e.soft));
    if (e.max) return e.max * (1 - Math.pow(1 - e.value, n));
    return e.value * n;
  }

  // Unidades efetivas: o upgrade "flagship" do rival faz cada unidade contar mais.
  function rivalUnits(s, r) {
    let n = owned(s, r.id);
    for (const u of C.upgrades) if (u.type === 'rivalBoost' && u.target === r.id && s.upgrades[u.id]) n *= u.value;
    return n;
  }

  const rivalEffectOf = (s, r) => (r.effect ? effectCurve(r.effect, rivalUnits(s, r)) : 0);

  function rivalEffect(s, type) {
    let total = 0;
    for (const r of C.rivals) if (r.effect?.type === type) total += rivalEffectOf(s, r);
    return total;
  }

  function costMult(s, item) {
    if (!genById[item.id]) return 1;
    return (1 - rivalEffect(s, 'genDiscount')) * (1 - perkValue(s, 'efficient'));
  }

  // Soma da série geométrica: custo das próximas `n` unidades.
  function genCost(s, id, n = 1) {
    const item = buildingById[id];
    const g = item.growth || C.costGrowth;
    return item.cost * costMult(s, item) * Math.pow(g, owned(s, id)) * (Math.pow(g, n) - 1) / (g - 1);
  }

  function maxAffordable(s, id) {
    const item = buildingById[id];
    const g = item.growth || C.costGrowth;
    const first = item.cost * costMult(s, item) * Math.pow(g, owned(s, id));
    return Math.max(0, Math.floor(Math.log(s.tokens * (g - 1) / first + 1) / Math.log(g)));
  }

  function modelMult(s) {
    let m = 1;
    const models = modelsOf(s);
    for (let i = 0; i <= s.tier; i++) m *= models[i].mult;
    return m;
  }

  // Bônus permanente de um upgrade de compute (nível × valor por nível).
  const computeBonus = (s, id) => (s.compute.levels[id] || 0) * computeShopById[id].value;

  const agiMult = (s) => 1 + s.agi.points * C.prestige.bonusPerPoint;
  const achMult = (s) => 1 + Object.keys(s.achievements).length * C.achievementBonus;

  function compute(s) {
    let clickAdd = 0, clickMult = 1, clickTps = 0, tpsMult = 1, autoClicks = 0;
    const mods = lineageOf(s).mods || {};
    const synergyStrength = (mods.synergyMult || 1) * (1 + rewardSum(s, 'synergyMult'));
    const genMult = {};
    for (const u of C.upgrades) {
      if (!s.upgrades[u.id]) continue;
      if (u.type === 'clickAdd') clickAdd += u.value;
      else if (u.type === 'clickMult') clickMult *= u.value;
      else if (u.type === 'clickTps') clickTps += u.value;
      else if (u.type === 'tpsMult') tpsMult *= u.value;
      else if (u.type === 'genMult') genMult[u.target] = (genMult[u.target] || 1) * u.value;
      else if (u.type === 'synergy') genMult[u.target] = (genMult[u.target] || 1) * (1 + u.value * synergyStrength * owned(s, u.source));
      else if (u.type === 'rivalBoost') genMult[u.target] = (genMult[u.target] || 1) * u.tps;
      else if (u.type === 'autoClick') autoClicks += u.value;
    }
    let buffTps = 1, buffClick = 1;
    for (const b of s.buffs) {
      if (b.kind === 'tps') buffTps *= b.mult;
      else buffClick *= b.mult;
    }

    const mm = modelMult(s);
    const global = mm * agiMult(s) * achMult(s) * (1 + rewardSum(s, 'globalMult')) * (1 + perkValue(s, 'weights')) * (1 + computeBonus(s, 'finetune'));
    // Mecânicas da linhagem: Gemini ganha por diversidade de geradores; Claude pelo ritmo de cliques.
    const diversityMult = mods.diversity
      ? 1 + mods.diversity.per * C.generators.filter((g) => owned(s, g.id) >= mods.diversity.min).length
      : 1;
    const rateMult = mods.clickRate ? 1 + mods.clickRate.per * Math.min(s.clickRate, mods.clickRate.cap) : 1;
    const passive = tpsMult * (1 + rivalEffect(s, 'passiveBoost')) * global * buffTps
      * (mods.genMult || 1) * diversityMult;
    const genTps = {};
    let tps = 0;
    for (const item of [...C.generators, ...C.rivals]) {
      genTps[item.id] = item.tps * (genMult[item.id] || 1) * passive;
      tps += genTps[item.id] * owned(s, item.id);
    }
    const perClick = (C.clickBase + clickAdd) * clickMult * (1 + rivalEffect(s, 'clickBoost'))
      * (1 + computeBonus(s, 'context')) * (1 + rewardSum(s, 'clickMult')) * rateMult * global * buffClick
      + tps * clickTps;
    autoClicks += perkValue(s, 'autoclick') + computeBonus(s, 'background_agent');
    return {
      tps, perClick, genTps, autoClicks, income: tps + autoClicks * perClick, modelMult: mm, global, rateMult, diversityMult,
    };
  }

  const genVisible = (s, item) => s.tier >= item.tier;

  function upgradeVisible(s, u) {
    if (s.upgrades[u.id] || s.tier < u.tier) return false;
    if (u.type === 'synergy') return owned(s, u.source) >= u.req;
    if (u.type === 'rivalBoost') return owned(s, u.target) >= u.req;
    return u.type !== 'genMult' || owned(s, u.target) >= (u.req || 1);
  }

  function earn(s, n) {
    s.tokens += n;
    s.runTokens += n;
    s.totalTokens += n;
  }

  function click(s) {
    const gain = compute(s).perClick;
    s.clicks++;
    s.pendingClicks++;
    s.clickTokens += gain;
    earn(s, gain);
    return gain;
  }

  function tick(s, dt) {
    const d = compute(s);
    earn(s, d.income * dt);
    // Média móvel (~2 s) dos cliques por segundo, manuais e automáticos.
    if (dt > 0) {
      const now = s.pendingClicks / dt + d.autoClicks;
      s.clickRate += (now - s.clickRate) * Math.min(1, dt / 2);
      s.pendingClicks = 0;
    }
    s.playTime += dt;
    s.runTime += dt;
    s.goldenIn -= dt;
    if (s.buffs.length) s.buffs = s.buffs.filter((b) => (b.left -= dt) > 0);
  }

  // amount: número ou 'max'. Serve para geradores e rivais. Retorna quantas unidades foram compradas.
  function buyGen(s, id, amount) {
    const item = buildingById[id];
    if (!item || !genVisible(s, item)) return 0;
    const n = amount === 'max' ? maxAffordable(s, id) : amount;
    if (n < 1) return 0;
    const cost = genCost(s, id, n);
    if (s.tokens < cost) return 0;
    s.tokens -= cost;
    s.gens[id] = owned(s, id) + n;
    return n;
  }

  function buyUpgrade(s, id) {
    const u = upgById[id];
    if (!u || !upgradeVisible(s, u) || s.tokens < u.cost) return false;
    s.tokens -= u.cost;
    s.upgrades[id] = true;
    return true;
  }

  const nextModel = (s) => modelsOf(s)[s.tier + 1] || null;

  function buyModel(s) {
    const m = nextModel(s);
    if (!m || s.tokens < m.cost) return false;
    s.tokens -= m.cost;
    s.tier++;
    // Chegou ao último modelo da linhagem pela primeira vez: conclui e libera a recompensa.
    if (s.tier === modelsOf(s).length - 1 && !s.lineages[s.lineage]) {
      s.lineages[s.lineage] = true;
      return { completed: s.lineage };
    }
    return {};
  }

  // Linhagem da próxima singularidade (só entre as liberadas).
  function setNextLineage(s, id) {
    if (!C.lineages[id] || !lineageUnlocked(s, id)) return false;
    s.nextLineage = id;
    return true;
  }

  const offlineCapHours = (s) =>
    (C.offlineCapHours + rivalEffect(s, 'offlineHours')) * (hasPerk(s, 'long_context') ? 3 : 1);

  // ---- tokens dourados ----

  function scheduleGolden(s) {
    const { minDelay, maxDelay } = C.golden;
    const speed = (1 - rivalEffect(s, 'goldenSpeed')) * (1 - perkValue(s, 'golden_luck'))
      * (1 - computeBonus(s, 'agentic'));
    s.goldenIn = (minDelay + Math.random() * (maxDelay - minDelay)) * speed;
  }

  // Sorteia o resultado do token dourado e aplica. Retorna { id, amount?, dur? }.
  function claimGolden(s) {
    const outcomes = C.golden.outcomes;
    let roll = Math.random() * outcomes.reduce((a, o) => a + o.weight, 0);
    const o = outcomes.find((x) => (roll -= x.weight) < 0) || outcomes[0];
    s.goldenClicks++;
    if (o.kind) {
      s.buffs = s.buffs.filter((b) => b.id !== o.id);
      s.buffs.push({ id: o.id, kind: o.kind, mult: o.mult, left: o.dur, dur: o.dur });
      return { id: o.id, dur: o.dur };
    }
    const amount = Math.min(s.tokens * o.tokensPct, compute(s).income * o.incomeSeconds) + 13;
    earn(s, amount);
    return { id: o.id, amount };
  }

  // ---- prestígio ----

  // Pontos base (raiz cúbica dos tokens da run) × bônus da perk "dividendo".
  const basePoints = (runTokens) => Math.pow(runTokens / C.prestige.divisor, C.prestige.exponent);
  const prestigeGain = (s) => Math.floor(basePoints(s.runTokens) * (1 + perkValue(s, 'dividend')));
  const canPrestige = (s) => s.tier >= C.prestige.minTier && prestigeGain(s) >= 1;
  const nextPointAt = (s) => {
    const base = (prestigeGain(s) + 1) / (1 + perkValue(s, 'dividend'));
    return Math.pow(base, 1 / C.prestige.exponent) * C.prestige.divisor;
  };
  const startTier = (s) => {
    if (hasPerk(s, 'checkpoint_gpt4')) return 4;
    if (hasPerk(s, 'checkpoint')) return 3;
    return hasPerk(s, 'head_start') ? 1 : 0;
  };
  const agiAvailable = (s) => s.agi.points - s.agi.spent;

  function prestige(s) {
    const gain = prestigeGain(s);
    if (!canPrestige(s)) return 0;
    s.agi.points += gain;
    s.prestiges++;
    Object.assign(s, {
      tokens: 0, runTokens: 0, runTime: 0, tier: startTier(s), gens: {}, upgrades: {}, buffs: [],
      lineage: lineageUnlocked(s, s.nextLineage) ? s.nextLineage : 'gpt', clickRate: 0, pendingClicks: 0,
    });
    return gain;
  }

  // Perks com `levels` podem ser compradas várias vezes (custo base × growth^nível), até `max` se houver.
  const perkCost = (s, p) => (p.levels ? Math.ceil(p.base * Math.pow(p.growth, perkLevel(s, p.id))) : p.cost);
  const perkMaxed = (s, p) => (p.levels ? !!p.max && perkLevel(s, p.id) >= p.max : hasPerk(s, p.id));

  function perkBuyable(s, p) {
    return !perkMaxed(s, p) && (!p.req || hasPerk(s, p.req)) && agiAvailable(s) >= perkCost(s, p);
  }

  function buyPerk(s, id) {
    const p = perkById[id];
    if (!p || !perkBuyable(s, p)) return false;
    s.agi.spent += perkCost(s, p);
    s.agi.perks[id] = p.levels ? perkLevel(s, id) + 1 : true;
    s.tier = Math.max(s.tier, startTier(s)); // checkpoints valem já na run atual
    return true;
  }

  // ---- conquistas ----

  function achieved(s, a, d) {
    switch (a.type) {
      case 'clicks': return s.clicks >= a.n;
      case 'total': return s.totalTokens >= a.n;
      case 'tps': return d.tps >= a.n;
      case 'tier': return s.lineage === 'gpt' && s.tier >= a.n; // conquistas da escada GPT
      case 'lineage': return !!s.lineages[a.target];
      case 'gen': return owned(s, a.target) >= a.n;
      case 'rivals': return C.rivals.filter((r) => owned(s, r.id) > 0).length >= a.n;
      case 'upgrades': return Object.keys(s.upgrades).length >= a.n;
      case 'golden': return s.goldenClicks >= a.n;
      case 'prestige': return s.prestiges >= a.n;
      case 'rateLimited': return s.rateLimited >= a.n;
      default: return false;
    }
  }

  // Marca as conquistas recém-cumpridas e retorna seus ids.
  function checkAchievements(s) {
    const d = compute(s);
    const fresh = [];
    for (const a of C.achievements) {
      if (!s.achievements[a.id] && achieved(s, a, d)) {
        s.achievements[a.id] = true;
        fresh.push(a.id);
      }
    }
    return fresh;
  }

  AIC.core = {
    newState, owned, hasPerk, lineageOf, modelsOf, lineageUnlocked, setNextLineage, rewardSum, perkLevel, perkCost, perkMaxed, rivalEffectOf, genCost, maxAffordable, compute, genVisible, upgradeVisible,
    earn, click, tick, buyGen, buyUpgrade, nextModel, buyModel, offlineCapHours,
    scheduleGolden, claimGolden, prestigeGain, canPrestige, nextPointAt, agiAvailable, prestige,
    perkBuyable, buyPerk, checkAchievements, rivalEffect, agiMult, achMult,
    genById, rivalById, upgById, perkById,
  };
})(globalThis.AIC = globalThis.AIC || {});
