// Lê o uso de tokens dos logs locais do Claude Code (~/.claude/projects/**/*.jsonl).
// Só números saem deste módulo: tokens por dia e quantidade de mensagens. O conteúdo das
// mensagens (prompts, código, respostas) é descartado logo após o parse de cada linha.
const fs = require('fs');
const path = require('path');
const os = require('os');

function defaultRoots() {
  const roots = [];
  if (process.env.CLAUDE_CONFIG_DIR) {
    for (const dir of process.env.CLAUDE_CONFIG_DIR.split(',')) roots.push(path.join(dir.trim(), 'projects'));
  }
  roots.push(path.join(os.homedir(), '.config', 'claude', 'projects'));
  roots.push(path.join(os.homedir(), '.claude', 'projects'));
  return [...new Set(roots)];
}

// Data local no formato AAAA-MM-DD (o "dia" do jogador, não o UTC).
function localDay(timestamp) {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

class ClaudeCodeReader {
  constructor(roots = defaultRoots()) {
    this.roots = roots;
    this.files = new Map(); // caminho → { offset, partial }
    // Cada resposta aparece em várias linhas do log (uma por bloco de conteúdo), então
    // deduplicamos por message.id + requestId e ficamos com a maior contagem vista.
    this.messages = new Map();
  }

  listFiles() {
    const out = [];
    const walk = (dir) => {
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p);
      }
    };
    for (const root of this.roots) walk(root);
    return out;
  }

  // Lê só o que foi acrescentado a cada arquivo desde a última varredura.
  scan() {
    for (const file of this.listFiles()) {
      let size;
      try {
        size = fs.statSync(file).size;
      } catch {
        continue;
      }
      let st = this.files.get(file);
      if (!st || size < st.offset) st = { offset: 0, partial: '' }; // arquivo novo ou reescrito
      if (size > st.offset) {
        const fd = fs.openSync(file, 'r');
        try {
          const buf = Buffer.alloc(size - st.offset);
          fs.readSync(fd, buf, 0, buf.length, st.offset);
          const lines = (st.partial + buf.toString('utf8')).split('\n');
          st.partial = lines.pop(); // última linha pode estar pela metade
          for (const line of lines) this.parseLine(line);
        } finally {
          fs.closeSync(fd);
        }
        st.offset = size;
      }
      this.files.set(file, st);
    }
  }

  parseLine(line) {
    if (!line.includes('"usage"')) return; // filtro barato antes do JSON.parse
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      return;
    }
    const usage = entry.message?.usage;
    const day = entry.timestamp && localDay(entry.timestamp);
    if (!usage || !day) return;
    const key = `${entry.message.id}:${entry.requestId}`;
    const rec = {
      day,
      input: usage.input_tokens || 0,
      output: usage.output_tokens || 0,
      cacheWrite: usage.cache_creation_input_tokens || 0,
      cacheRead: usage.cache_read_input_tokens || 0,
    };
    const prev = this.messages.get(key);
    if (!prev || rec.output >= prev.output) this.messages.set(key, rec);
  }

  // Totais por dia. Formato estável: é o que o jogo recebe pela ponte do preload.
  summary() {
    const days = {};
    for (const m of this.messages.values()) {
      const d = days[m.day] || (days[m.day] = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, messages: 0 });
      d.input += m.input;
      d.output += m.output;
      d.cacheWrite += m.cacheWrite;
      d.cacheRead += m.cacheRead;
      d.messages++;
    }
    return {
      source: 'claude-code',
      found: this.files.size > 0,
      files: this.files.size,
      today: localDay(Date.now()),
      days,
    };
  }
}

module.exports = { ClaudeCodeReader, localDay, defaultRoots };
