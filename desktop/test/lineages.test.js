// Regras das linhagens (js/core.js) e a migração de saves (js/save.js).
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
for (const f of ['config.js', 'core.js', 'save.js']) require(path.join(__dirname, '..', '..', 'js', f));
const { core: K, config: C, save: S } = globalThis.AIC;

// Chega ao último modelo da linhagem atual comprando tudo de graça.
function finishLineage(s) {
  s.tokens = Infinity;
  let r = {};
  while (K.nextModel(s)) r = K.buyModel(s);
  return r;
}

test('Claude e Gemini só liberam depois de concluir o GPT', () => {
  const s = K.newState();
  assert.strictEqual(K.setNextLineage(s, 'claude'), false);
  const r = finishLineage(s);
  assert.deepStrictEqual(r, { completed: 'gpt' });
  assert.strictEqual(K.setNextLineage(s, 'claude'), true);
  assert.strictEqual(K.setNextLineage(s, 'nao-existe'), false);
});

test('a singularidade troca a escada de modelos para a linhagem escolhida', () => {
  const s = K.newState();
  finishLineage(s);
  s.runTokens = 1e18;
  K.setNextLineage(s, 'gemini');
  K.prestige(s);
  assert.strictEqual(s.lineage, 'gemini');
  assert.strictEqual(K.modelsOf(s)[s.tier].id, 'bard');
  assert.strictEqual(K.nextModel(s).id, 'gemini1');
});

test('concluir uma linhagem dá a recompensa permanente', () => {
  const s = K.newState();
  s.gens.gpu = 10;
  s.tier = 0;
  const before = K.compute(s).tps;
  s.lineages.gpt = true;
  const after = K.compute(s).tps;
  assert.ok(Math.abs(after / before - (1 + C.lineages.gpt.reward.value)) < 1e-9);
});

test('Claude: geradores rendem menos e o clique cresce com o ritmo de cliques', () => {
  const gpt = K.newState();
  const claude = K.newState();
  claude.lineage = 'claude';
  for (const s of [gpt, claude]) s.gens.intern = 10;
  assert.ok(Math.abs(K.compute(claude).tps / K.compute(gpt).tps - C.lineages.claude.mods.genMult) < 1e-9);

  const idle = K.compute(claude).perClick;
  for (let sec = 0; sec < 10; sec++) {
    for (let i = 0; i < 8; i++) K.click(claude);
    K.tick(claude, 1);
  }
  assert.ok(claude.clickRate > 6, `clickRate = ${claude.clickRate}`);
  assert.ok(K.compute(claude).perClick > idle * 2);
});

test('Gemini: bônus de diversidade por tipo de gerador com unidades suficientes', () => {
  const s = K.newState();
  s.lineage = 'gemini';
  const { per, min } = C.lineages.gemini.mods.diversity;
  s.gens = { gpu: min, intern: min, rack: min - 1 };
  assert.ok(Math.abs(K.compute(s).diversityMult - (1 + 2 * per)) < 1e-9);
});

test('conquistas de modelo GPT não liberam em outras linhagens', () => {
  const s = K.newState();
  s.lineage = 'claude';
  s.tier = 6;
  assert.ok(!K.checkAchievements(s).includes('model_gpt6sol'));
});

test('save antigo de quem chegou ao GPT-6 Sol já vem com o GPT concluído', () => {
  store['ai-token-clicker.save.v1'] = JSON.stringify({ tier: 6, achievements: { model_gpt6sol: true } });
  const s = S.load();
  assert.strictEqual(s.lineages.gpt, true);
  assert.strictEqual(s.lineage, 'gpt');
  assert.strictEqual(K.lineageUnlocked(s, 'claude'), true);
});
