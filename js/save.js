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
        agi: { ...fresh.agi, ...data.agi, perks: { ...data.agi?.perks } },
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
