// Simula um jogador "ótimo" para medir o tempo até cada modelo.
// Uso: node tools/balance-sim.js [cliques_por_segundo] [runs]   (padrão: 4 cliques/s, 2 runs)
//
// A cada segundo o bot clica, recebe a produção passiva e compra a opção com o melhor
// "tempo de retorno + tempo de espera". Ao chegar no último modelo, faz a singularidade e compra
// as perks mais baratas. Tokens dourados não são simulados (são bônus para quem joga ativo).
// Humanos jogam pior, então conte com ~1.5× o tempo.
const path = require('path');
require(path.join(__dirname, '../js/config.js'));
require(path.join(__dirname, '../js/core.js'));
const { core: K, config: C } = globalThis.AIC;

const CPS = Number(process.argv[2]) || 4;
const RUNS = Number(process.argv[3]) || 2;
const MAX_SECONDS = 20 * 3600;
const s = K.newState();

const income = (st) => {
  const d = K.compute(st);
  return d.income + CPS * d.perClick;
};

function apply(st, opt) {
  if (opt.kind === 'model') return K.buyModel(st);
  if (opt.kind === 'upg') return K.buyUpgrade(st, opt.id);
  return K.buyGen(st, opt.id, 1);
}

function bestOption() {
  const opts = [];
  const m = K.nextModel(s);
  if (m) opts.push({ kind: 'model', cost: m.cost });
  for (const u of C.upgrades) if (K.upgradeVisible(s, u)) opts.push({ kind: 'upg', id: u.id, cost: u.cost });
  for (const g of [...C.generators, ...C.rivals]) {
    if (K.genVisible(s, g)) opts.push({ kind: 'gen', id: g.id, cost: K.genCost(s, g.id, 1) });
  }
  const base = income(s);
  for (const o of opts) {
    const test = JSON.parse(JSON.stringify(s));
    test.tokens = Infinity;
    apply(test, o);
    const gain = income(test) - base;
    o.score = o.cost / gain + Math.max(0, (o.cost - s.tokens) / base);
  }
  return opts.sort((a, b) => a.score - b.score)[0];
}

for (let run = 1; run <= RUNS; run++) {
  console.log(`== run ${run} (AGI ${s.agi.points}, perks: ${Object.keys(s.agi.perks).join(', ') || '-'})`);
  let t = 0;
  while (s.tier < C.models.length - 1 && t < MAX_SECONDS) {
    K.tick(s, 1);
    for (let i = 0; i < CPS; i++) K.click(s);
    K.checkAchievements(s);
    t++;
    for (let guard = 0; guard < 50; guard++) {
      const o = bestOption();
      if (!o || s.tokens < o.cost) break;
      apply(s, o);
      if (o.kind === 'model') {
        const d = K.compute(s);
        console.log(`${(t / 60).toFixed(1).padStart(6)} min  ${C.models[s.tier].name.padEnd(10)} tps=${d.tps.toExponential(2)}  clique=${d.perClick.toExponential(2)}`);
      }
    }
  }
  console.log(`  unidades: ${JSON.stringify(s.gens)}`);
  console.log(`total: ${(t / 3600).toFixed(2)} h · conquistas ${Object.keys(s.achievements).length} · singularidade daria ${K.prestigeGain(s)} pts`);
  if (run < RUNS) {
    K.prestige(s);
    for (const p of [...C.perks].sort((a, b) => a.cost - b.cost)) K.buyPerk(s, p.id);
  }
}
