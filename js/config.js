// Balanceamento do jogo. Todo número ajustável fica aqui; a lógica fica em core.js.
// Textos (nomes/descrições) ficam em i18n.js, usando o mesmo `id`.
(function (AIC) {
  AIC.config = {
    tickMs: 100,
    // Ids dos temas em css/themes.css (o primeiro é o padrão). Nomes em i18n.js: theme.<id>.
    themes: ['terminal', 'dark', 'light', 'catppuccin', 'dracula', 'github-dark', 'tokyo-night', 'nord', 'gruvbox', 'amber', 'win98', 'claude', 'gemini'],
    // Temas exclusivos: liberados ao concluir a linhagem indicada.
    themeUnlocks: { claude: 'claude', gemini: 'gemini' },
    saveEveryMs: 10000,
    offlineCapHours: 8,
    costGrowth: 1.15, // custo do gerador = base × 1.15^quantidade
    clickBase: 1,

    // Cada modelo multiplica TODA a produção (cumulativo: GPT-3 = 2 × 3 = ×6).
    models: [
      { id: 'gpt1', name: 'GPT-1', cost: 0, mult: 1 },
      { id: 'gpt2', name: 'GPT-2', cost: 2500, mult: 2 },
      { id: 'gpt3', name: 'GPT-3', cost: 450e3, mult: 3 },
      { id: 'gpt35', name: 'GPT-3.5', cost: 450e6, mult: 3 },
      { id: 'gpt4', name: 'GPT-4', cost: 900e9, mult: 4 },
      { id: 'gpt5', name: 'GPT-5', cost: 200e12, mult: 5 },
      { id: 'gpt6sol', name: 'GPT-6 Sol', cost: 400e15, mult: 10 },
    ],

    // Linhagens: depois de concluir o GPT, cada singularidade pode escolher outra escada de modelos.
    // Todas têm 7 modelos (os checkpoints de AGI usam o índice). `gpt.models` é a lista `models` acima.
    // mods: genMult (×produção dos geradores), clickRate (clique ×(1 + per × cliques/s, até cap)),
    //       synergyMult (×força das sinergias), diversity (+per de produção por tipo de gerador com ≥ min)
    // reward: bônus permanente ao concluir (vale em todas as linhagens)
    // Claude e Gemini são fim de jogo: custos crescem 2× mais rápido que no GPT por modelo e terminam
    // com produção ~8× maior. Balanceados para ~1h45 partindo de 3 singularidades de GPT.
    lineages: {
      gpt: { reward: { type: 'globalMult', value: 0.25 } },
      claude: {
        requires: 'gpt',
        mods: { genMult: 0.6, clickRate: { per: 0.15, cap: 40 } },
        reward: { type: 'clickMult', value: 0.5 },
        models: [
          { id: 'claude1', name: 'Claude 1', cost: 0, mult: 1 },
          { id: 'claude2', name: 'Claude 2', cost: 2500, mult: 2 },
          { id: 'claude3h', name: 'Claude 3 Haiku', cost: 900e3, mult: 3 },
          { id: 'claude35s', name: 'Claude 3.5 Sonnet', cost: 1.8e9, mult: 4 },
          { id: 'claudeopus', name: 'Claude Opus', cost: 7.2e12, mult: 5 },
          { id: 'claude5', name: 'Claude 5', cost: 3.2e15, mult: 6 },
          { id: 'claudemagnum', name: 'Claude Magnum Opus', cost: 12.8e18, mult: 20 },
        ],
      },
      gemini: {
        requires: 'gpt',
        mods: { synergyMult: 2, diversity: { per: 0.15, min: 25 } },
        reward: { type: 'synergyMult', value: 0.5 },
        models: [
          { id: 'bard', name: 'Bard', cost: 0, mult: 1 },
          { id: 'gemini1', name: 'Gemini 1.0', cost: 2500, mult: 2 },
          { id: 'gemini15', name: 'Gemini 1.5 Pro', cost: 900e3, mult: 2 },
          { id: 'gemini2f', name: 'Gemini 2.0 Flash', cost: 1.8e9, mult: 3 },
          { id: 'gemini25', name: 'Gemini 2.5 Pro', cost: 7.2e12, mult: 3 },
          { id: 'geminiultra', name: 'Gemini Ultra', cost: 3.2e15, mult: 4 },
          { id: 'geminiconst', name: 'Gemini Constelação', cost: 12.8e18, mult: 12 },
        ],
      },
    },

    // tier = índice do modelo necessário para desbloquear.
    generators: [
      { id: 'gpu', cost: 15, tps: 0.2, tier: 0 },
      { id: 'intern', cost: 100, tps: 1, tier: 0 },
      { id: 'rack', cost: 1100, tps: 8, tier: 1 },
      { id: 'cluster', cost: 12e3, tps: 47, tier: 2 },
      { id: 'datacenter', cost: 1.4e6, tps: 1400, tier: 3 },
      { id: 'nuclear', cost: 200e6, tps: 50e3, tier: 4 },
      { id: 'dyson', cost: 40e9, tps: 2e6, tier: 5 },
      { id: 'quantum', cost: 15e12, tps: 1e8, tier: 6 },
    ],

    // Upgrades de compra única.
    // type: autoClick (+N cliques automáticos/s), clickAdd (+N por clique), clickMult (×N no clique), clickTps (clique ganha N × tokens/s),
    //       tpsMult (×N em todos os geradores), genMult (×N em um gerador; exige `req` unidades dele),
    //       synergy (`target` ganha +value por unidade de `source`; exige `req` unidades de `source`)
    upgrades: [
      { id: 'prompt_eng', cost: 50, tier: 0, type: 'clickAdd', value: 1 },
      { id: 'few_shot', cost: 400, tier: 0, type: 'clickMult', value: 2 },
      { id: 'cot', cost: 6000, tier: 1, type: 'clickMult', value: 2 },
      { id: 'attention', cost: 4000, tier: 1, type: 'tpsMult', value: 2 },
      { id: 'ctx_window', cost: 60e3, tier: 2, type: 'clickTps', value: 0.01 },
      { id: 'scaling', cost: 250e3, tier: 2, type: 'tpsMult', value: 2 },
      { id: 'rlhf', cost: 2e6, tier: 3, type: 'clickMult', value: 3 },
      { id: 'moe', cost: 12e6, tier: 3, type: 'tpsMult', value: 2 },
      { id: 'tool_use', cost: 20e9, tier: 4, type: 'clickTps', value: 0.02 },
      { id: 'reasoning', cost: 10e12, tier: 5, type: 'clickMult', value: 5 },
      { id: 'distill', cost: 30e12, tier: 5, type: 'tpsMult', value: 3 },
      { id: 'agents', cost: 50e15, tier: 6, type: 'clickTps', value: 0.05 },

      // Cliques automáticos (por segundo), somados aos da perk de AGI e do compute.
      { id: 'excel_macro', cost: 8000, tier: 1, type: 'autoClick', value: 1 },
      { id: 'selenium', cost: 800e3, tier: 2, type: 'autoClick', value: 2 },
      { id: 'rpa_bot', cost: 80e6, tier: 3, type: 'autoClick', value: 3 },
      { id: 'computer_use', cost: 80e9, tier: 4, type: 'autoClick', value: 5 },
      { id: 'agent_swarm', cost: 80e12, tier: 5, type: 'autoClick', value: 8 },

      { id: 'gpu_drivers', cost: 300, tier: 0, type: 'genMult', target: 'gpu', value: 2, req: 10 },
      { id: 'intern_coffee', cost: 2000, tier: 0, type: 'genMult', target: 'intern', value: 2, req: 10 },
      { id: 'rack_cooling', cost: 22e3, tier: 1, type: 'genMult', target: 'rack', value: 2, req: 10 },
      { id: 'cluster_ib', cost: 240e3, tier: 2, type: 'genMult', target: 'cluster', value: 2, req: 10 },
      { id: 'dc_arctic', cost: 28e6, tier: 3, type: 'genMult', target: 'datacenter', value: 2, req: 10 },
      { id: 'nuclear_fusion', cost: 6e9, tier: 4, type: 'genMult', target: 'nuclear', value: 2, req: 10 },
      { id: 'dyson_graphene', cost: 800e9, tier: 5, type: 'genMult', target: 'dyson', value: 2, req: 10 },
      { id: 'quantum_ecc', cost: 300e15, tier: 6, type: 'genMult', target: 'quantum', value: 2, req: 10 },
    ],

    // Rivais produzem pouco de propósito: o papel deles é o efeito especial, não a produção principal.
    // Laboratórios rivais: geradores com um efeito extra que cresce com a quantidade.
    // Curva do efeito (ver effectCurve em core.js): `soft` = linear até N unidades e depois log;
    // `max` = aproxima-se do máximo sem chegar; sem nenhum = linear. Nenhum rival tem teto rígido.
    // effect.type: genDiscount (geradores mais baratos), clickBoost (+% clique), passiveBoost (+% produção passiva),
    //              goldenSpeed (tokens dourados mais frequentes), offlineHours (+h de limite offline)
    // `growth` sobrescreve o costGrowth padrão.
    rivals: [
      { id: 'llama', cost: 100e3, tps: 15, tier: 2, growth: 1.2, effect: { type: 'genDiscount', value: 0.02, max: 0.5 } },
      { id: 'claude', cost: 20e6, tps: 1e3, tier: 3, growth: 1.2, effect: { type: 'clickBoost', value: 0.1, soft: 10 } },
      { id: 'gemini', cost: 30e6, tps: 1250, tier: 3, growth: 1.2, effect: { type: 'passiveBoost', value: 0.02, soft: 25 } },
      { id: 'deepseek', cost: 5e9, tps: 75e3, tier: 4, growth: 1.13 },
      { id: 'grok', cost: 20e9, tps: 150e3, tier: 4, growth: 1.2, effect: { type: 'goldenSpeed', value: 0.07, max: 0.75 } },
      { id: 'mistral', cost: 20e12, tps: 25e6, tier: 5, growth: 1.2, effect: { type: 'offlineHours', value: 1 } },
    ],

    // Prestígio: pontos = floor((tokens da run / divisor) ^ exponent). Cada ponto dá +bonusPerPoint de produção.
    prestige: { minTier: 4, divisor: 1e12, exponent: 1 / 3, bonusPerPoint: 0.015 },

    // Perks compradas com pontos de AGI. Gastar pontos não reduz o bônus de produção.
    // `levels`: compra infinita (ou até `max`), custo = base × growth^nível, efeito = value × nível.
    // Sem `levels`: compra única por `cost`.
    perks: [
      { id: 'autoclick', levels: true, base: 2, growth: 1.45, value: 2 }, // +2 cliques automáticos/s
      { id: 'weights', levels: true, base: 5, growth: 1.4, value: 0.05 }, // produção +5%
      { id: 'dividend', levels: true, base: 15, growth: 1.7, value: 0.1 }, // +10% de pontos por singularidade
      { id: 'efficient', levels: true, base: 8, growth: 1.5, value: 0.05, max: 10 }, // geradores −5%
      { id: 'golden_luck', levels: true, base: 12, growth: 1.6, value: 0.1, max: 5 }, // dourados 10% mais rápidos
      { id: 'head_start', cost: 3 },
      { id: 'long_context', cost: 5 },
      { id: 'checkpoint', cost: 50, req: 'head_start' },
      { id: 'checkpoint_gpt4', cost: 250, req: 'checkpoint' },
    ],

    // Anti-autoclicker: cliques acima disso dentro de 1 s são ignorados ("HTTP 429").
    maxClicksPerSecond: 12,
    rateLimitWarnCooldown: 10, // segundos entre avisos

    // Tokens dourados: aparecem a cada [minDelay, maxDelay] segundos e somem após `lifetime`.
    golden: {
      firstDelay: 60,
      minDelay: 90,
      maxDelay: 240,
      lifetime: 13,
      outcomes: [
        { id: 'frenzy', weight: 45, kind: 'tps', mult: 7, dur: 30 },
        { id: 'lucky', weight: 30, tokensPct: 0.15, incomeSeconds: 900 },
        { id: 'clickFrenzy', weight: 15, kind: 'click', mult: 10, dur: 15 },
        { id: 'hallucination', weight: 10, kind: 'tps', mult: 0.5, dur: 30 },
      ],
    },

    // Cada conquista dá +achievementBonus de produção. Persistem entre singularidades.
    achievementBonus: 0.02,
    achievements: [
      { id: 'click_100', type: 'clicks', n: 100 },
      { id: 'click_1k', type: 'clicks', n: 1000 },
      { id: 'click_10k', type: 'clicks', n: 10000 },
      { id: 'tok_1k', type: 'total', n: 1e3 },
      { id: 'tok_1m', type: 'total', n: 1e6 },
      { id: 'tok_1b', type: 'total', n: 1e9 },
      { id: 'tok_1t', type: 'total', n: 1e12 },
      { id: 'tok_1qa', type: 'total', n: 1e15 },
      { id: 'tok_1qi', type: 'total', n: 1e18 },
      { id: 'tps_1m', type: 'tps', n: 1e6 },
      { id: 'model_gpt2', type: 'tier', n: 1 },
      { id: 'model_gpt3', type: 'tier', n: 2 },
      { id: 'model_gpt35', type: 'tier', n: 3 },
      { id: 'model_gpt4', type: 'tier', n: 4 },
      { id: 'model_gpt5', type: 'tier', n: 5 },
      { id: 'model_gpt6sol', type: 'tier', n: 6 },
      { id: 'gen_gpu100', type: 'gen', target: 'gpu', n: 100 },
      { id: 'gen_cluster50', type: 'gen', target: 'cluster', n: 50 },
      { id: 'gen_dyson25', type: 'gen', target: 'dyson', n: 25 },
      { id: 'rival_first', type: 'rivals', n: 1 },
      { id: 'rival_all', type: 'rivals', n: 6 },
      { id: 'upg_all', type: 'upgrades', n: 20 },
      { id: 'golden_1', type: 'golden', n: 1 },
      { id: 'golden_25', type: 'golden', n: 25 },
      { id: 'agi_1', type: 'prestige', n: 1 },
      { id: 'agi_5', type: 'prestige', n: 5 },
      { id: 'rate_limited', type: 'rateLimited', n: 1 },
      { id: 'lineage_claude', type: 'lineage', target: 'claude' },
      { id: 'lineage_gemini', type: 'lineage', target: 'gemini' },
    ],
  };

  const C = AIC.config;
  C.lineages.gpt.models = C.models;

  // Compute (só no app desktop): moeda ganha com os tokens reais usados no Claude Code.
  // Pesos refletem "trabalho": leitura de cache é ~97% do volume bruto e quase não é trabalho novo.
  // Cada dia rende floor(scale × log2(1 + ponderado / half)): 10× mais uso rende só um pouco mais,
  // para o jogo não premiar queimar tokens. Ex.: 7k ponderados → 65; 750k → 257.
  C.compute = {
    weights: { output: 1, input: 0.2, cacheWrite: 0.1, cacheRead: 0.01 },
    scale: 30,
    half: 2000,
    backfillDays: 7, // ao conectar, os últimos 7 dias contam
    // Upgrades de compute sobrevivem à singularidade. `levels`: compra repetida com custo base × growth^nível.
    shop: [
      { id: 'finetune', type: 'globalMult', value: 0.1, levels: true, base: 50, growth: 1.4, max: 50 },
      { id: 'context', type: 'clickMult', value: 0.25, levels: true, base: 40, growth: 1.4, max: 50 },
      { id: 'agentic', type: 'goldenSpeed', value: 0.08, levels: true, base: 120, growth: 1.8, max: 5 },
      { id: 'session_boost', type: 'boost', mult: 5, dur: 300, cost: 30 },
      { id: 'inject', type: 'inject', seconds: 1800, cost: 20 },
      { id: 'background_agent', type: 'autoClick', value: 1, levels: true, base: 60, growth: 1.5, max: 30 },
    ],
  };

  // Upgrades gerados para cada gerador: ×2 com 25 unidades, ×2 com 50 e ×3 com 100.
  // Nomes vêm de modelos em i18n.js (upgTier.<tier>), ex.: "GPU usada Pro Max".
  const GEN_TIERS = [
    { tier: 'pro', req: 25, value: 2, costX: 100 },
    { tier: 'max', req: 50, value: 2, costX: 3000 },
    { tier: 'ent', req: 100, value: 3, costX: 3e6 },
  ];
  for (const t of GEN_TIERS) {
    for (const g of C.generators) {
      C.upgrades.push({
        id: `${g.id}_${t.tier}`, cost: g.cost * t.costX, tier: g.tier,
        type: 'genMult', target: g.id, value: t.value, req: t.req, template: t.tier,
      });
    }
  }

  // Sinergias: cada gerador ganha +8% por unidade do gerador seguinte. Mantém o penúltimo gerador
  // relevante em vez de só o último disponível importar.
  C.generators.slice(0, -1).forEach((g, i) => {
    const next = C.generators[i + 1];
    C.upgrades.push({
      id: `syn_${g.id}`, cost: next.cost * 30, tier: next.tier,
      type: 'synergy', target: g.id, source: next.id, value: 0.08, req: 15,
    });
  });

  // "Flagship" de cada rival: com 25 unidades, produção ×2 e cada unidade conta como 1,5 no efeito.
  for (const r of C.rivals) {
    C.upgrades.push({
      id: `${r.id}_flagship`, cost: r.cost * 50, tier: r.tier,
      type: 'rivalBoost', target: r.id, value: 1.5, tps: 2, req: 25,
    });
  }

  C.achievements.find((a) => a.id === 'upg_all').n = C.upgrades.length;
})(globalThis.AIC = globalThis.AIC || {});
