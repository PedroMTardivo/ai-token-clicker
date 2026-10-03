// Compute: segunda moeda, ganha com os tokens reais que o jogador usa no Claude Code.
// Só existe no app desktop (ver desktop/), que entrega o resumo de uso por dia. Sem DOM aqui.
(function (AIC) {
  const C = AIC.config;
  const K = AIC.core;
  const CC = C.compute;
  const shopById = Object.fromEntries(CC.shop.map((x) => [x.id, x]));

  function weighted(day) {
    const w = CC.weights;
    return day.output * w.output + day.input * w.input + day.cacheWrite * w.cacheWrite + day.cacheRead * w.cacheRead;
  }

  const dayCompute = (day) => Math.floor(CC.scale * Math.log2(1 + weighted(day) / CC.half));

  function addDays(date, n) {
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(y, m - 1, d + n);
    const pad = (v) => String(v).padStart(2, '0');
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  }

  // Converte o resumo de uso em compute. Cada dia vale no máximo dayCompute(dia) e só a diferença
  // para o que já foi creditado entra no saldo, então reler os logs nunca paga duas vezes.
  // Dias anteriores à janela de conexão (connectedAt − backfillDays) são ignorados.
  function sync(s, summary) {
    if (!summary?.found) return 0;
    const c = s.compute;
    if (!c.connectedAt) c.connectedAt = summary.today;
    const from = addDays(c.connectedAt, -(CC.backfillDays - 1));
    let gained = 0;
    for (const [date, day] of Object.entries(summary.days)) {
      if (date < from || date > summary.today) continue;
      const target = dayCompute(day);
      const prev = c.earned[date] || 0;
      if (target > prev) {
        gained += target - prev;
        c.earned[date] = target;
      }
    }
    c.balance += gained;
    c.total += gained;
    return gained;
  }

  const level = (s, id) => s.compute.levels[id] || 0;
  const itemCost = (s, item) => (item.levels ? Math.ceil(item.base * Math.pow(item.growth, level(s, item.id))) : item.cost);
  const maxed = (s, item) => !!item.max && level(s, item.id) >= item.max;
  const canBuy = (s, item) => !maxed(s, item) && s.compute.balance >= itemCost(s, item);

  // Retorna { item, amount? } ou null se não deu para comprar.
  function buy(s, id) {
    const item = shopById[id];
    if (!item || !canBuy(s, item)) return null;
    const cost = itemCost(s, item);
    s.compute.balance -= cost;
    s.compute.spent += cost;
    if (item.type === 'boost') {
      s.buffs = s.buffs.filter((b) => b.id !== item.id);
      s.buffs.push({ id: item.id, kind: 'tps', mult: item.mult, left: item.dur, dur: item.dur });
      return { item };
    }
    if (item.type === 'inject') {
      const amount = K.compute(s).income * item.seconds;
      K.earn(s, amount);
      return { item, amount };
    }
    s.compute.levels[id] = level(s, id) + 1;
    return { item };
  }

  AIC.computeSys = { weighted, dayCompute, addDays, sync, level, itemCost, maxed, canBuy, buy, shopById };
})(globalThis.AIC = globalThis.AIC || {});
