// Persistência em localStorage. Saves antigos são mesclados num estado novo,
// então campos adicionados em versões futuras ganham o valor padrão.
(function (AIC) {
  const KEY = 'ai-token-clicker.save.v1';

  function save(state) {
    state.lastSeen = Date.now();
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  }

  // Perks que viraram níveis: o valor antigo (true) vira o nível equivalente ao bônus que dava.
  function migratePerks(perks = {}) {
    const out = { ...perks };
    if (out.efficient === true) out.efficient = 2; // era −10%, agora −5% por nível
    if (out.golden_luck === true) out.golden_luck = 3; // era −30%, agora −10% por nível
    if (out.autoclick === true) out.autoclick = 1;
    return out;
  }

  function load() {
    const fresh = AIC.core.newState();
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return fresh;
      const data = JSON.parse(raw);
      return {
        ...fresh,
        ...data,
        runTokens: data.runTokens ?? data.totalTokens ?? 0, // saves v1 não tinham runTokens
        gens: { ...data.gens },
        upgrades: { ...data.upgrades },
        achievements: { ...data.achievements },
        buffs: Array.isArray(data.buffs) ? data.buffs : [],
        // Quem já tinha chegado ao GPT-6 Sol antes das linhagens existirem já concluiu o GPT.
        lineages: { ...(data.achievements?.model_gpt6sol ? { gpt: true } : {}), ...data.lineages },
        agi: { ...fresh.agi, ...data.agi, perks: migratePerks(data.agi?.perks) },
        compute: {
          ...fresh.compute,
          ...data.compute,
          earned: { ...data.compute?.earned },
          levels: { ...data.compute?.levels },
        },
      };
    } catch {
      return fresh;
    }
  }

  function wipe() {
    try { localStorage.removeItem(KEY); } catch { /* storage indisponível */ }
  }

  AIC.save = { save, load, wipe };
})(globalThis.AIC = globalThis.AIC || {});
