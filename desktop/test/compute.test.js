// Regras da moeda compute (js/compute.js), carregadas como no navegador via globalThis.AIC.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

for (const f of ['config.js', 'core.js', 'compute.js']) require(path.join(__dirname, '..', '..', 'js', f));
const { core: K, computeSys: CS, config: C } = globalThis.AIC;

const day = (output, cacheRead = 0) => ({ input: 0, output, cacheWrite: 0, cacheRead, messages: 1 });
const summary = (today, days) => ({ source: 'claude-code', found: true, files: 1, today, days });

test('escala logarítmica: 100× mais uso rende bem menos que 100× mais compute', () => {
  const small = CS.dayCompute(day(7000));
  const big = CS.dayCompute(day(700000));
  assert.ok(small > 0);
  assert.ok(big / small < 5, `big/small = ${big / small}`);
});

test('leitura de cache pesa pouco', () => {
  assert.ok(CS.weighted(day(0, 1e6)) < CS.weighted(day(20000)));
});

test('sync não credita o mesmo dia duas vezes e paga só a diferença quando o dia cresce', () => {
  const s = K.newState();
  const g1 = CS.sync(s, summary('2026-10-03', { '2026-10-03': day(10000) }));
  const g2 = CS.sync(s, summary('2026-10-03', { '2026-10-03': day(10000) }));
  const g3 = CS.sync(s, summary('2026-10-03', { '2026-10-03': day(50000) }));
  assert.ok(g1 > 0);
  assert.strictEqual(g2, 0);
  assert.strictEqual(s.compute.balance, g1 + g3);
  assert.strictEqual(s.compute.earned['2026-10-03'], CS.dayCompute(day(50000)));
});

test('ao conectar, só os últimos 7 dias contam', () => {
  const s = K.newState();
  CS.sync(s, summary('2026-10-10', {
    '2026-10-03': day(10000), // 8 dias atrás: fora
    '2026-10-04': day(10000), // 7º dia da janela: dentro
    '2026-10-10': day(10000),
  }));
  assert.deepStrictEqual(Object.keys(s.compute.earned).sort(), ['2026-10-04', '2026-10-10']);
});

test('logs não encontrados não conectam nem creditam', () => {
  const s = K.newState();
  assert.strictEqual(CS.sync(s, { found: false, today: '2026-10-03', days: {} }), 0);
  assert.strictEqual(s.compute.connectedAt, null);
});

test('upgrade de nível aumenta a produção e sobrevive à singularidade', () => {
  const s = K.newState();
  s.compute.balance = 1000;
  s.gens.gpu = 10;
  const before = K.compute(s).tps;
  assert.ok(CS.buy(s, 'finetune'));
  assert.ok(Math.abs(K.compute(s).tps / before - 1.1) < 1e-9);
  s.tier = C.prestige.minTier;
  s.runTokens = 1e15;
  K.prestige(s);
  assert.strictEqual(CS.level(s, 'finetune'), 1);
});

test('não compra sem saldo nem além do nível máximo', () => {
  const s = K.newState();
  assert.strictEqual(CS.buy(s, 'agentic'), null);
  s.compute.balance = 1e9;
  for (let i = 0; i < 10; i++) CS.buy(s, 'agentic');
  assert.strictEqual(CS.level(s, 'agentic'), CS.shopById.agentic.max);
});

test('boost de sessão vira buff e injeção dá tokens na hora', () => {
  const s = K.newState();
  s.compute.balance = 100;
  s.gens.intern = 5;
  CS.buy(s, 'session_boost');
  assert.ok(s.buffs.some((b) => b.id === 'session_boost' && b.mult === 5));
  const before = s.tokens;
  const r = CS.buy(s, 'inject');
  assert.ok(r.amount > 0 && s.tokens > before);
});
