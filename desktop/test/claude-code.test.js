const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ClaudeCodeReader, localDay } = require('../usage/claude-code');

function tmpProjects() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aic-usage-'));
  fs.mkdirSync(path.join(root, 'proj-a'));
  return root;
}

const line = (id, req, ts, usage, content = 'segredo do usuário') =>
  JSON.stringify({ type: 'assistant', requestId: req, timestamp: ts, message: { id, content, usage } }) + '\n';

const U = (output, extra = {}) => ({ input_tokens: 10, output_tokens: output, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000, ...extra });

test('deduplica linhas da mesma resposta e fica com a maior contagem', () => {
  const root = tmpProjects();
  const ts = '2026-10-03T12:00:00Z';
  fs.writeFileSync(path.join(root, 'proj-a', 's1.jsonl'),
    line('m1', 'r1', ts, U(5)) + line('m1', 'r1', ts, U(40)) + line('m2', 'r2', ts, U(7)));
  const r = new ClaudeCodeReader([root]);
  r.scan();
  const day = r.summary().days[localDay(ts)];
  assert.strictEqual(day.messages, 2);
  assert.strictEqual(day.output, 47);
  assert.strictEqual(day.cacheRead, 2000);
});

test('leitura incremental: só processa o que foi acrescentado, inclusive linha pela metade', () => {
  const root = tmpProjects();
  const file = path.join(root, 'proj-a', 's1.jsonl');
  const ts = '2026-10-03T12:00:00Z';
  const full = line('m2', 'r2', ts, U(20));
  fs.writeFileSync(file, line('m1', 'r1', ts, U(10)) + full.slice(0, 30));
  const r = new ClaudeCodeReader([root]);
  r.scan();
  assert.strictEqual(r.summary().days[localDay(ts)].output, 10);
  fs.appendFileSync(file, full.slice(30));
  r.scan();
  assert.strictEqual(r.summary().days[localDay(ts)].output, 30);
  r.scan(); // nada novo: não pode contar de novo
  assert.strictEqual(r.summary().days[localDay(ts)].output, 30);
});

test('separa por dia local e ignora linhas sem uso ou inválidas', () => {
  const root = tmpProjects();
  fs.writeFileSync(path.join(root, 'proj-a', 's1.jsonl'),
    line('m1', 'r1', '2026-10-01T12:00:00Z', U(1)) +
    line('m2', 'r2', '2026-10-02T12:00:00Z', U(2)) +
    '{"type":"user","message":{"content":"oi"}}\n' +
    'isto não é json "usage"\n');
  const r = new ClaudeCodeReader([root]);
  r.scan();
  const days = r.summary().days;
  assert.deepStrictEqual(Object.keys(days).sort(), [localDay('2026-10-01T12:00:00Z'), localDay('2026-10-02T12:00:00Z')].sort());
});

test('o resumo não carrega conteúdo das mensagens', () => {
  const root = tmpProjects();
  fs.writeFileSync(path.join(root, 'proj-a', 's1.jsonl'), line('m1', 'r1', '2026-10-03T12:00:00Z', U(3), 'SENHA-SUPER-SECRETA'));
  const r = new ClaudeCodeReader([root]);
  r.scan();
  assert.ok(!JSON.stringify(r.summary()).includes('SENHA-SUPER-SECRETA'));
});

test('pasta inexistente: found=false, sem erro', () => {
  const r = new ClaudeCodeReader([path.join(os.tmpdir(), 'nao-existe-aic')]);
  r.scan();
  assert.strictEqual(r.summary().found, false);
});
