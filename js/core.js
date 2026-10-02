// Regras do jogo: estado, cálculos de produção, compras, prestígio, conquistas e eventos. Sem DOM aqui.
(function (AIC) {
  const C = AIC.config;
  const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
  const genById = byId(C.generators);
  const rivalById = byId(C.rivals);
  const buildingById = { ...genById, ...rivalById }; // geradores e rivais dividem `state.gens`
  const upgById = byId(C.upgrades);
  const perkById = byId(C.perks);

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
      lang: null,
      buyAmount: 1,
      tab: 'shop',
      playTime: 0,
      runTime: 0,
      startedAt: now,
      lastSeen: now,
    };
  }

  const owned = (s, id) => s.gens[id] || 0;
  const hasPerk = (s, id) => !!s.agi.perks[id];

  // Soma dos efeitos de um tipo entre os rivais possuídos, respeitando o teto de cada um.
  function rivalEffect(s, type) {
    let total = 0;
    for (const r of C.rivals) {
      if (r.effect?.type !== type) continue;
      const v = r.effect.value * owned(s, r.id);
      total += r.effect.max ? Math.min(r.effect.max, v) : v;
    }
    return total;
  }

  function costMult(s, item) {
    if (!genById[item.id]) return 1;
    return (1 - rivalEffect(s, 'genDiscount')) * (hasPerk(s, 'efficient') ? 0.9 : 1);
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
    for (let i = 0; i <= s.tier; i++) m *= C.models[i].mult;
    return m;
  }

  const agiMult = (s) => 1 + s.agi.points * C.prestige.bonusPerPoint;
  const achMult = (s) => 1 + Object.keys(s.achievements).length * C.achievementBonus;

  function compute(s) {
    let clickAdd = 0, clickMult = 1, clickTps = 0, tpsMult = 1;
    const genMult = {};
    for (const u of C.upgrades) {
      if (!s.upgrades[u.id]) continue;
      if (u.type === 'clickAdd') clickAdd += u.value;
      else if (u.type === 'clickMult') clickMult *= u.value;
      else if (u.type === 'clickTps') clickTps += u.value;
      else if (u.type === 'tpsMult') tpsMult *= u.value;
      else if (u.type === 'genMult') genMult[u.target] = (genMult[u.target] || 1) * u.value;
    }
    let buffTps = 1, buffClick = 1;
    for (const b of s.buffs) {
      if (b.kind === 'tps') buffTps *= b.mult;
      else buffClick *= b.mult;
    }

    const mm = modelMult(s);
    const global = mm * agiMult(s) * achMult(s);
    const passive = tpsMult * (1 + rivalEffect(s, 'passiveBoost')) * global * buffTps;
    const genTps = {};
    let tps = 0;
    for (const item of [...C.generators, ...C.rivals]) {
      genTps[item.id] = item.tps * (genMult[item.id] || 1) * passive;
      tps += genTps[item.id] * owned(s, item.id);
    }
    const perClick = (C.clickBase + clickAdd) * clickMult * (1 + rivalEffect(s, 'clickBoost')) * global * buffClick
      + tps * clickTps;
    const autoClicks = hasPerk(s, 'autoclick') ? C.autoClicksPerSecond : 0;
    return { tps, perClick, genTps, autoClicks, income: tps + autoClicks * perClick, modelMult: mm, global };
  }

  const genVisible = (s, item) => s.tier >= item.tier;

  function upgradeVisible(s, u) {
    if (s.upgrades[u.id] || s.tier < u.tier) return false;
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
    s.clickTokens += gain;
    earn(s, gain);
    return gain;
  }

  function tick(s, dt) {
    earn(s, compute(s).income * dt);
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

  const nextModel = (s) => C.models[s.tier + 1] || null;

  function buyModel(s) {
    const m = nextModel(s);
    if (!m || s.tokens < m.cost) return false;
    s.tokens -= m.cost;
    s.tier++;
    return true;
  }

  const offlineCapHours = (s) =>
    (C.offlineCapHours + rivalEffect(s, 'offlineHours')) * (hasPerk(s, 'long_context') ? 3 : 1);

  // ---- tokens dourados ----

  function scheduleGolden(s) {
    const { minDelay, maxDelay } = C.golden;
    const speed = (1 - rivalEffect(s, 'goldenSpeed')) * (hasPerk(s, 'golden_luck') ? 0.7 : 1);
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

  const prestigeGain = (s) => Math.floor(Math.pow(s.runTokens / C.prestige.divisor, C.prestige.exponent));
  const canPrestige = (s) => s.tier >= C.prestige.minTier && prestigeGain(s) >= 1;
  const nextPointAt = (s) => Math.pow(prestigeGain(s) + 1, 1 / C.prestige.exponent) * C.prestige.divisor;
  const startTier = (s) => (hasPerk(s, 'checkpoint') ? 3 : hasPerk(s, 'head_start') ? 1 : 0);
  const agiAvailable = (s) => s.agi.points - s.agi.spent;

  function prestige(s) {
    const gain = prestigeGain(s);
    if (!canPrestige(s)) return 0;
    s.agi.points += gain;
    s.prestiges++;
    Object.assign(s, {
      tokens: 0, runTokens: 0, runTime: 0, tier: startTier(s), gens: {}, upgrades: {}, buffs: [],
    });
    return gain;
  }

  function perkBuyable(s, p) {
    return !hasPerk(s, p.id) && (!p.req || hasPerk(s, p.req)) && agiAvailable(s) >= p.cost;
  }

  function buyPerk(s, id) {
    const p = perkById[id];
    if (!p || !perkBuyable(s, p)) return false;
    s.agi.spent += p.cost;
    s.agi.perks[id] = true;
    s.tier = Math.max(s.tier, startTier(s)); // checkpoints valem já na run atual
    return true;
  }

  // ---- conquistas ----

  function achieved(s, a, d) {
    switch (a.type) {
      case 'clicks': return s.clicks >= a.n;
      case 'total': return s.totalTokens >= a.n;
      case 'tps': return d.tps >= a.n;
      case 'tier': return s.tier >= a.n;
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
    newState, owned, hasPerk, genCost, maxAffordable, compute, genVisible, upgradeVisible,
    earn, click, tick, buyGen, buyUpgrade, nextModel, buyModel, offlineCapHours,
    scheduleGolden, claimGolden, prestigeGain, canPrestige, nextPointAt, agiAvailable, prestige,
    perkBuyable, buyPerk, checkAchievements, rivalEffect, agiMult, achMult,
    genById, rivalById, upgById, perkById,
  };
})(globalThis.AIC = globalThis.AIC || {});
