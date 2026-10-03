// Áudio 100% sintetizado com Web Audio API: efeitos sonoros e música procedural. Sem arquivos.
// Dois estilos: 'chip' (chiptune, temas normais) e 'win98' (recriações sintetizadas dos sons do Windows).
// O navegador só libera áudio após um gesto do usuário; game.js chama unlock() no primeiro clique/tecla.
(function (AIC) {
  const KEY = 'ai-token-clicker.audio';
  const defaults = { sfx: true, music: true, sfxVol: 0.7, musicVol: 0.5 };
  let settings = loadSettings();

  let ctx = null;
  let sfxBus, musicBus, noiseBuf;
  let style = 'chip';
  const mood = { tier: 0, frenzy: false, hallucination: false };
  const lastPlayed = {};

  function loadSettings() {
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    } catch {
      return { ...defaults };
    }
  }

  function saveSettings() {
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* storage indisponível */ }
  }

  // Monta o grafo: sfx/música → master → compressor (evita estourar) → saída.
  function buildGraph(c) {
    const comp = c.createDynamicsCompressor();
    comp.connect(c.destination);
    const master = c.createGain();
    master.gain.value = 0.9;
    master.connect(comp);
    const sfx = c.createGain();
    const music = c.createGain();
    sfx.connect(master);
    music.connect(master);
    const buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return { sfx, music, buf };
  }

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    ({ sfx: sfxBus, music: musicBus, buf: noiseBuf } = buildGraph(ctx));
    applyVolumes();
    return ctx;
  }

  function applyVolumes() {
    if (!ctx) return;
    sfxBus.gain.setTargetAtTime(settings.sfx ? settings.sfxVol : 0, ctx.currentTime, 0.02);
    musicBus.gain.setTargetAtTime(settings.music ? settings.musicVol * 0.6 : 0, ctx.currentTime, 0.15);
  }

  // ---- primitivas de síntese ----

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  // Oscilador com envelope. o: { type, f, f2 (slide), dur, vol, attack, lp (lowpass), detune }
  function tone(out, at, o) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.f, at);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, at + o.dur);
    if (o.detune) osc.detune.setValueAtTime(o.detune, at);
    const vol = o.vol ?? 0.2;
    const attack = o.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(o.dur, attack + 0.01));
    let node = osc;
    if (o.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lp;
      osc.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(out);
    osc.start(at);
    osc.stop(at + o.dur + 0.05);
  }

  // Ruído filtrado (bateria, cliques). o: { dur, vol, hp, bp }
  function noise(out, at, o) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = o.bp ? 'bandpass' : 'highpass';
    f.frequency.value = o.bp || o.hp || 1000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.vol ?? 0.1, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + o.dur);
    src.connect(f);
    f.connect(g);
    g.connect(out);
    src.start(at, Math.random() * 0.5);
    src.stop(at + o.dur + 0.02);
  }

  const seq = (out, at, notes, gap, o) => notes.forEach((n, i) => tone(out, at + i * gap, { ...o, f: midi(n) }));
  const chord = (out, at, notes, o) => notes.forEach((n) => tone(out, at, { ...o, f: midi(n) }));

  // Sino: fundamental + parcial inarmônico, ataque instantâneo e decaimento longo.
  function bell(out, at, n, vol = 0.12, dur = 0.9) {
    tone(out, at, { type: 'sine', f: midi(n), dur, vol, attack: 0.002 });
    tone(out, at, { type: 'sine', f: midi(n) * 2.76, dur: dur * 0.4, vol: vol * 0.3, attack: 0.002 });
  }

  // ---- efeitos sonoros ----
  // Cada som: (saída, instante) → agenda as notas. `gap` é o intervalo mínimo entre repetições (s).

  const SFX = {
    chip: {
      click: { gap: 0.03, play: (o, t) => { const f = midi(72 + Math.floor(Math.random() * 4)); tone(o, t, { f, f2: f * 1.3, dur: 0.055, vol: 0.24, lp: 2500 }); } },
      blocked: { gap: 0.09, play: (o, t) => { tone(o, t, { type: 'sawtooth', f: 160, f2: 70, dur: 0.16, vol: 0.22 }); tone(o, t, { f: 110, dur: 0.14, vol: 0.1, detune: 30 }); } },
      buy: { gap: 0.04, play: (o, t) => { tone(o, t, { f: midi(88), dur: 0.06, vol: 0.13 }); tone(o, t + 0.06, { f: midi(95), dur: 0.14, vol: 0.13 }); } },
      upgrade: { gap: 0.05, play: (o, t) => seq(o, t, [76, 80, 83, 88], 0.05, { dur: 0.12, vol: 0.11 }) },
      model: { gap: 0.3, play: (o, t) => {
        seq(o, t, [72, 76, 79, 84], 0.1, { dur: 0.18, vol: 0.08 });
        chord(o, t + 0.42, [84, 88, 91], { type: 'triangle', dur: 0.8, vol: 0.09 });
        tone(o, t + 0.42, { type: 'triangle', f: midi(48), dur: 0.9, vol: 0.14 });
      } },
      goldenSpawn: { gap: 0.3, play: (o, t) => seq(o, t, [96, 100, 103], 0.07, { type: 'sine', dur: 0.3, vol: 0.06 }) },
      goldenClaim: { gap: 0.1, play: (o, t) => seq(o, t, [84, 88, 91, 96, 100], 0.04, { type: 'triangle', dur: 0.35, vol: 0.08 }) },
      hallucination: { gap: 0.3, play: (o, t) => {
        tone(o, t, { f: midi(70), f2: midi(56), dur: 0.6, vol: 0.06, detune: 25 });
        tone(o, t, { type: 'triangle', f: midi(71), f2: midi(55), dur: 0.6, vol: 0.08 });
      } },
      achievement: { gap: 0.2, play: (o, t) => {
        seq(o, t, [79, 84, 88], 0.08, { type: 'triangle', dur: 0.15, vol: 0.08 });
        tone(o, t + 0.24, { type: 'triangle', f: midi(91), dur: 0.5, vol: 0.09 });
        tone(o, t + 0.24, { f: midi(79), dur: 0.4, vol: 0.03 });
      } },
      prestige: { gap: 1, play: (o, t) => {
        tone(o, t, { type: 'sawtooth', f: 110, f2: 1760, dur: 1.2, vol: 0.05, attack: 0.3, lp: 2400 });
        chord(o, t + 1.05, [60, 64, 67, 72, 76], { type: 'triangle', dur: 1.6, vol: 0.06, attack: 0.02 });
      } },
      ui: { gap: 0.03, play: (o, t) => tone(o, t, { type: 'sine', f: midi(90), dur: 0.04, vol: 0.15 }) },
      startup: { gap: 1, play: (o, t) => seq(o, t, [60, 67, 72, 76, 79, 84], 0.06, { type: 'triangle', dur: 0.25, vol: 0.06 }) },
    },

    // Aproximações sintetizadas, não os arquivos originais.
    win98: {
      click: { gap: 0.03, play: (o, t) => noise(o, t, { hp: 1800, dur: 0.025, vol: 0.35 }) },
      blocked: { gap: 0.25, play: (o, t) => chord(o, t, [57, 60, 64, 69], { type: 'triangle', dur: 0.55, vol: 0.06, attack: 0.003 }) }, // "Chord"
      buy: { gap: 0.04, play: (o, t) => bell(o, t, 88, 0.15, 0.5) }, // "Ding"
      upgrade: { gap: 0.05, play: (o, t) => bell(o, t, 91, 0.15, 0.7) },
      model: { gap: 0.3, play: (o, t) => tada(o, t) },
      goldenSpawn: { gap: 0.3, play: (o, t) => { bell(o, t, 83, 0.06, 0.4); bell(o, t + 0.12, 88, 0.06, 0.5); } }, // "Notify"
      goldenClaim: { gap: 0.1, play: (o, t) => tada(o, t, 0.7) },
      hallucination: { gap: 0.3, play: (o, t) => { // "Critical Stop"
        chord(o, t, [48, 54, 60], { type: 'square', dur: 0.5, vol: 0.04, lp: 900 });
        chord(o, t + 0.18, [47, 53, 59], { type: 'square', dur: 0.6, vol: 0.04, lp: 900 });
      } },
      achievement: { gap: 0.2, play: (o, t) => tada(o, t) },
      prestige: { gap: 1, play: (o, t) => startup98(o, t) },
      ui: { gap: 0.03, play: (o, t) => noise(o, t, { hp: 4000, dur: 0.016, vol: 0.25 }) },
      startup: { gap: 1, play: (o, t) => startup98(o, t) },
    },
  };

  // "Tada": um acorde curto de metais e um acorde maior sustentado.
  function tada(o, t, scale = 1) {
    const brass = { type: 'sawtooth', lp: 2800, attack: 0.015 };
    chord(o, t, [67, 72, 76], { ...brass, dur: 0.13, vol: 0.035 * scale });
    chord(o, t + 0.15, [72, 76, 79, 84], { ...brass, dur: 1.1 * scale, vol: 0.035 * scale, attack: 0.03 });
    tone(o, t + 0.15, { type: 'triangle', f: midi(48), dur: 1.1 * scale, vol: 0.1 * scale });
  }

  // Abertura estilo "inicializando o sistema": pads subindo. Progressão própria, não a melodia original.
  function startup98(o, t) {
    const pad = { type: 'triangle', attack: 0.25, vol: 0.045 };
    chord(o, t, [60, 67, 72], { ...pad, dur: 1.2 });
    chord(o, t + 0.8, [65, 72, 77], { ...pad, dur: 1.2 });
    chord(o, t + 1.6, [67, 74, 79], { ...pad, dur: 1.2 });
    chord(o, t + 2.4, [72, 79, 84, 88], { ...pad, dur: 2.2, vol: 0.05 });
    bell(o, t + 2.4, 96, 0.05, 1.5);
  }

  function play(name) {
    if (!ctx || !settings.sfx) return;
    const s = SFX[style][name] || SFX.chip[name];
    if (!s) return;
    const now = ctx.currentTime;
    if (now - (lastPlayed[name] ?? -1) < s.gap) return;
    lastPlayed[name] = now;
    s.play(sfxBus, now + 0.005);
  }

  // ---- música procedural ----
  // 16 passos por compasso, progressão de 4 compassos. Cada modelo (tier) liga uma camada nova.

  const PRESETS = {
    chip: {
      bpm: 108, bpmPerTier: 2.5,
      chords: [[57, 'm'], [53, 'M'], [48, 'M'], [55, 'M']], // Am F C G
      scale: [0, 3, 5, 7, 10], // pentatônica menor a partir de A
      root: 57,
      arp: 'square', lead: 'square', pad: 'sawtooth', drums: 1,
    },
    win98: {
      bpm: 92, bpmPerTier: 2,
      chords: [[48, 'M'], [57, 'm'], [53, 'M'], [55, 'M']], // C Am F G
      scale: [0, 2, 4, 7, 9], // pentatônica maior a partir de C
      root: 60,
      arp: 'sine', lead: 'triangle', pad: 'triangle', drums: 0.6,
    },
  };

  const triad = ([root, q]) => [root, root + (q === 'm' ? 3 : 4), root + 7];

  // Pseudoaleatório determinístico: a mesma entrada dá a mesma nota, então a melodia se repete como música.
  function rand(a, b, c) {
    let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function playStep(out, step, at, spb, p, m) {
    const s = step % 16;
    const bar = Math.floor(step / 16) % 4;
    const phrase = Math.floor(step / 128); // melodia muda a cada 8 compassos
    const tones = triad(p.chords[bar]);
    const tier = m.tier;
    const detune = m.hallucination ? (Math.random() - 0.5) * 120 : 0;
    const lp = m.frenzy ? 6000 : 2600;

    // baixo: sempre
    if (s % 4 === 0) tone(out, at, { type: 'triangle', f: midi(tones[0] - 12), dur: spb * 3.6, vol: 0.16, detune });
    // arpejo
    if (tier >= 1 && (tier >= 6 || s % 2 === 0)) {
      const i = (tier >= 6 ? s : s / 2) % 4;
      const n = [tones[0], tones[1], tones[2], tones[1]][i] + 12 + (tier >= 6 && s % 8 >= 4 ? 12 : 0);
      tone(out, at, { type: p.arp, f: midi(n), dur: spb * 0.9, vol: 0.03, lp, detune });
    }
    // bumbo e chimbal
    if (tier >= 2) {
      if (s % 8 === 0) tone(out, at, { type: 'sine', f: 150, f2: 45, dur: 0.2, vol: 0.32 * p.drums });
      if (s % 4 === 2 || (m.frenzy && s % 2 === 1)) noise(out, at, { hp: 7000, dur: 0.035, vol: 0.05 * p.drums });
    }
    // caixa
    if (tier >= 3 && (s === 4 || s === 12)) {
      noise(out, at, { bp: 1800, dur: 0.13, vol: 0.11 * p.drums });
      tone(out, at, { type: 'triangle', f: 190, dur: 0.06, vol: 0.05 * p.drums });
    }
    // melodia
    if (tier >= 4 && s % 2 === 0 && rand(phrase, bar * 16 + s, 1) < (s % 4 === 0 ? 0.75 : 0.35)) {
      const deg = Math.floor(rand(phrase, bar * 16 + s, 2) * p.scale.length);
      const oct = rand(phrase, bar * 16 + s, 3) < 0.25 ? 24 : 12;
      const n = p.root + p.scale[deg] + oct;
      tone(out, at, { type: p.lead, f: midi(n), dur: spb * (s % 4 === 0 ? 2.5 : 1.5), vol: 0.045, lp, detune });
    }
    // pad
    if (tier >= 5 && s === 0) {
      chord(out, at, tones.map((n) => n + 12), { type: p.pad, dur: spb * 16, vol: 0.02, attack: spb * 4, lp: 1100, detune });
    }
  }

  const music = {
    timer: null,
    step: 0,
    next: 0,
    start() {
      if (this.timer || !ctx) return;
      this.step = 0;
      this.next = ctx.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 25);
    },
    stop() {
      clearInterval(this.timer);
      this.timer = null;
    },
    // Agenda os passos que caem nos próximos 120 ms (técnica de lookahead para não atrasar).
    schedule() {
      const p = PRESETS[style];
      const spb = 60 / (p.bpm + p.bpmPerTier * mood.tier) / 4;
      if (this.next < ctx.currentTime - 0.05) this.next = ctx.currentTime + 0.05; // voltou de uma pausa: não toca o atrasado
      while (this.next < ctx.currentTime + 0.12) {
        playStep(musicBus, this.step, this.next, spb, p, mood);
        this.next += spb;
        this.step++;
      }
    },
  };

  // ---- API ----

  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended' && !document.hidden) ctx.resume();
    if (settings.music) music.start();
  }

  function toggle(kind) {
    settings[kind] = !settings[kind];
    saveSettings();
    applyVolumes();
    if (kind === 'music' && ctx) {
      if (settings.music) music.start();
      else setTimeout(() => { if (!settings.music) music.stop(); }, 400);
    }
    return settings[kind];
  }

  function setVolume(kind, v) {
    settings[kind === 'music' ? 'musicVol' : 'sfxVol'] = v;
    saveSettings();
    applyVolumes();
  }

  // Aba em segundo plano: o navegador atrasa o setInterval e a música engasgaria, então pausa tudo.
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else ctx.resume();
  });

  // Renderiza um som (ou trechos da música) offline e mede pico/RMS. Usado em testes, já que ninguém
  // consegue "ouvir" um teste automatizado.
  async function analyze(name, { seconds = 2, musicTier = null, styleName = style } = {}) {
    const off = new OfflineAudioContext(1, Math.ceil(44100 * seconds), 44100);
    const saved = { ctx, sfxBus, musicBus, noiseBuf };
    ctx = off;
    const g = buildGraph(off);
    ({ sfx: sfxBus, music: musicBus, buf: noiseBuf } = g);
    sfxBus.gain.value = 1;
    musicBus.gain.value = 0.6;
    try {
      if (musicTier !== null) {
        const p = PRESETS[styleName];
        const spb = 60 / (p.bpm + p.bpmPerTier * musicTier) / 4;
        const m = { tier: musicTier, frenzy: false, hallucination: false };
        for (let i = 0; i * spb < seconds - 0.3; i++) playStep(musicBus, i, i * spb, spb, p, m);
      } else {
        SFX[styleName][name].play(sfxBus, 0);
      }
      const data = (await off.startRendering()).getChannelData(0);
      let peak = 0, sum = 0;
      for (const v of data) {
        peak = Math.max(peak, Math.abs(v));
        sum += v * v;
      }
      return { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / data.length).toFixed(4) };
    } finally {
      ({ ctx, sfxBus, musicBus, noiseBuf } = saved);
    }
  }

  AIC.audio = {
    unlock,
    play,
    toggle,
    setVolume,
    setStyle: (s) => { style = PRESETS[s] ? s : 'chip'; },
    setMood: (m) => Object.assign(mood, m),
    get settings() { return { ...settings }; },
    analyze,
    sounds: Object.keys(SFX.chip),
  };
})(globalThis.AIC = globalThis.AIC || {});
