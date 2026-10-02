// Balanceamento do jogo. Todo número ajustável fica aqui; a lógica fica em core.js.
// Textos (nomes/descrições) ficam em i18n.js, usando o mesmo `id`.
(function (AIC) {
  AIC.config = {
    tickMs: 100,
    saveEveryMs: 10000,
    offlineCapHours: 8,
    costGrowth: 1.15, // custo do gerador = base × 1.15^quantidade
    clickBase: 1,

    // Cada modelo multiplica TODA a produção (cumulativo: GPT-3 = 2 × 3 = ×6).
    models: [
      { id: 'gpt1', name: 'GPT-1', cost: 0, mult: 1 },
      { id: 'gpt2', name: 'GPT-2', cost: 2500, mult: 2 },
      { id: 'gpt3', name: 'GPT-3', cost: 300e3, mult: 3 },
      { id: 'gpt35', name: 'GPT-3.5', cost: 100e6, mult: 3 },
      { id: 'gpt4', name: 'GPT-4', cost: 60e9, mult: 4 },
      { id: 'gpt5', name: 'GPT-5', cost: 80e12, mult: 5 },
      { id: 'gpt6sol', name: 'GPT-6 Sol', cost: 200e15, mult: 10 },
    ],

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
    // type: clickAdd (+N por clique), clickMult (×N no clique), clickTps (clique ganha N × tokens/s),
    //       tpsMult (×N em todos os geradores), genMult (×N em um gerador; exige `req` unidades dele)
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

      { id: 'gpu_drivers', cost: 300, tier: 0, type: 'genMult', target: 'gpu', value: 2, req: 10 },
      { id: 'intern_coffee', cost: 2000, tier: 0, type: 'genMult', target: 'intern', value: 2, req: 10 },
      { id: 'rack_cooling', cost: 22e3, tier: 1, type: 'genMult', target: 'rack', value: 2, req: 10 },
      { id: 'cluster_ib', cost: 240e3, tier: 2, type: 'genMult', target: 'cluster', value: 2, req: 10 },
      { id: 'dc_arctic', cost: 28e6, tier: 3, type: 'genMult', target: 'datacenter', value: 2, req: 10 },
      { id: 'nuclear_fusion', cost: 6e9, tier: 4, type: 'genMult', target: 'nuclear', value: 2, req: 10 },
      { id: 'dyson_graphene', cost: 800e9, tier: 5, type: 'genMult', target: 'dyson', value: 2, req: 10 },
      { id: 'quantum_ecc', cost: 300e15, tier: 6, type: 'genMult', target: 'quantum', value: 2, req: 10 },
    ],

    // Laboratórios rivais: geradores com um efeito extra que cresce com a quantidade.
    // effect.type: genDiscount (geradores mais baratos), clickBoost (+% clique), passiveBoost (+% produção passiva),
    //              goldenSpeed (tokens dourados mais frequentes), offlineHours (+h de limite offline)
    // `growth` sobrescreve o costGrowth padrão.
    rivals: [
      { id: 'llama', cost: 100e3, tps: 60, tier: 2, growth: 1.2, effect: { type: 'genDiscount', value: 0.01, max: 0.25 } },
      { id: 'claude', cost: 20e6, tps: 4e3, tier: 3, growth: 1.2, effect: { type: 'clickBoost', value: 0.1, max: 1 } },
      { id: 'gemini', cost: 30e6, tps: 5e3, tier: 3, growth: 1.2, effect: { type: 'passiveBoost', value: 0.02, max: 0.5 } },
      { id: 'deepseek', cost: 5e9, tps: 3e5, tier: 4, growth: 1.1 },
      { id: 'grok', cost: 20e9, tps: 6e5, tier: 4, growth: 1.2, effect: { type: 'goldenSpeed', value: 0.05, max: 0.6 } },
      { id: 'mistral', cost: 20e12, tps: 1e8, tier: 5, growth: 1.2, effect: { type: 'offlineHours', value: 1, max: 40 } },
    ],

    // Prestígio: pontos = floor((tokens da run / divisor) ^ exponent). Cada ponto dá +bonusPerPoint de produção.
    prestige: { minTier: 4, divisor: 1e12, exponent: 1 / 3, bonusPerPoint: 0.02 },

    // Perks compradas com pontos de AGI. Gastar pontos não reduz o bônus de produção.
    perks: [
      { id: 'autoclick', cost: 1 },
      { id: 'head_start', cost: 3 },
      { id: 'long_context', cost: 5 },
      { id: 'efficient', cost: 10 },
      { id: 'golden_luck', cost: 15 },
      { id: 'checkpoint', cost: 50, req: 'head_start' },
    ],
    autoClicksPerSecond: 2,

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
    ],
  };
})(globalThis.AIC = globalThis.AIC || {});
