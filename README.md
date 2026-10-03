# AI Token Clicker

Jogo clicker de browser sobre modelos de IA. Você começa com o GPT-1, clica para gerar tokens
e investe em upgrades, geradores e novos modelos até chegar ao **GPT-6 Sol**. No caminho, contrata
laboratórios rivais (Llama, Claude, Gemini, DeepSeek, Grok, Mistral), caça tokens dourados,
coleciona conquistas e reinicia tudo na **singularidade** em troca de pontos de AGI permanentes.

## Como rodar

Abra o `index.html` no navegador. Não precisa de build, servidor ou npm.

Para publicar, sirva a pasta como site estático (ex.: GitHub Pages → *Deploy from branch*, pasta raiz).

## Estrutura

| Arquivo | O que faz |
|---|---|
| `css/themes.css` | Paletas dos 13 temas (o Windows 98 também muda bordas; Claude e Gemini são liberados por linhagem) |
| `js/config.js` | **Todo o balanceamento**: custos, multiplicadores, modelos, geradores, upgrades |
| `js/i18n.js` | Todos os textos em PT/EN, incluindo o que o "modelo" digita ao clicar |
| `js/core.js` | Regras do jogo (produção, compras, prestígio, conquistas, tokens dourados), sem DOM |
| `js/audio.js` | Efeitos sonoros e música, sintetizados com Web Audio API (sem arquivos de áudio) |
| `js/ui.js` | Renderização e efeitos visuais |
| `js/save.js` | Save em `localStorage` |
| `js/game.js` | Inicialização, eventos e loop |
| `js/compute.js` | Moeda compute (só no app desktop): converte tokens reais em compute e loja permanente |
| `desktop/` | App Electron: abre o mesmo jogo e lê o uso de tokens dos logs locais do Claude Code |
| `tools/balance-sim.js` | Simulador que mede o tempo até cada modelo, incluindo runs após a singularidade |

Os scripts são clássicos (não módulos ES) e compartilham o objeto global `AIC`. Assim o jogo
funciona aberto via `file://`, onde navegadores bloqueiam `import`.

## Ajustando o balanceamento

1. Edite os números em `js/config.js`.
2. Para adicionar um item, crie a entrada com um `id` novo em `config.js` e as chaves de texto
   nas duas línguas em `i18n.js`: `gen.<id>`, `upg.<id>`, `rival.<id>` e `perk.<id>` (`.name`/`.desc`)
   ou `ach.<id>.name`.
3. Rode o simulador para ver o efeito:

```sh
node tools/balance-sim.js 4 3   # bot clicando 4×/s, 3 runs
```

### Lógica atual

- **Geradores:** custo = `base × 1.15^quantidade`. Cada gerador novo custa cerca de 10× o anterior
  e rende cerca de 5–8× mais. Eles são liberados conforme o modelo.
- **Modelos:** multiplicam toda a produção de forma cumulativa (GPT-2 ×2 … GPT-6 Sol ×10, total ×2160).
  Como a produção cresce exponencialmente, o custo de cada modelo sobe de 300× a 2500× em relação ao anterior.
- **Laboratórios rivais:** produzem pouco; o valor deles está no efeito especial, que **não tem teto rígido**.
  Claude e Gemini sobem linearmente até 10 e 25 unidades e depois continuam crescendo em curva
  logarítmica. Llama e Grok se aproximam de 50% e 75% sem chegar. Com 25 unidades, cada rival libera
  um upgrade "flagship" (Claude Opus, Gemini Ultra…): produção ×2 e efeito 50% mais forte.
- **Upgrades (62):** os de clique mantêm o clique relevante no fim do jogo. Cada gerador tem ×2 com
  10 unidades, ×2 com 25 ("Pro"), ×2 com 50 ("Pro Max") e ×3 com 100 ("Enterprise Edition"). Os
  tiers são gerados no fim do `config.js`, com nomes vindos de modelos em `i18n.js`.
- **Sinergias:** cada gerador ganha +8% por unidade do gerador seguinte. Sem elas, o último gerador
  disponível fazia 70–85% da produção e o penúltimo caía para menos de 2%. Com elas, o penúltimo
  fica entre 16% e 45%.
- **Conquistas:** +2% de produção cada (29 no total). Persistem entre singularidades.
- **Singularidade:** pontos = `floor(∛(tokens da run / 1T))` × bônus da perk Dividendo, e cada ponto
  vale +1,5% de produção. Gastar pontos em perks não reduz o bônus.
- **Perks de AGI:** as principais têm **níveis infinitos** (custo × 1,4–1,7 por nível): auto-clicker
  (+2 cliques/s), Pesos maiores (+5% de produção), Dividendo (+10% de pontos), além de Inferência
  eficiente e Temperatura alta (com máximo). Checkpoints (GPT-2, GPT-3.5, GPT-4) são compra única.
- **Cliques automáticos:** somam upgrades da loja (Macro no Excel → Enxame de agentes, +1 a +8/s),
  a perk de AGI e o Agente em segundo plano do compute. Cada um vale um clique completo.
- **Tokens dourados:** aparecem a cada 90–240 s e somem em 13 s. Resultados possíveis:
  frenesi ×7 por 30 s (45%), +15% dos tokens (30%), clique ×10 por 15 s (15%) e alucinação ×0.5 por 30 s (10%).
- **Offline:** a produção do tempo fora, com limite de 8 h (aumentado pelo Mistral e pela perk Memória longa).

**Ritmo medido pelo bot** (4 cliques/s, sem tokens dourados):

| Marco | Run 1 | Run 2 (77 pts AGI) | Run 3 (154 pts) |
|---|---|---|---|
| GPT-2 | ~4 min | início | início |
| GPT-3 | ~11 min | ~2 min | ~1 min |
| GPT-3.5 | ~24 min | ~5 min | ~3 min |
| GPT-4 (libera a singularidade; o 1º ponto vem logo depois) | ~1h12 | ~20 min | ~12 min |
| GPT-5 | ~1h51 | ~32 min | ~19 min |
| GPT-6 Sol | ~2h34 | ~47 min | ~28 min |

Um jogador real deve levar umas 3–4 h na primeira run.

## Linhagens (fim de jogo)

Ao concluir o GPT-6 Sol, a singularidade passa a oferecer outras escadas de modelos (escolha na aba
AGI; vale a partir da próxima singularidade). Cada linhagem tem 7 modelos, uma mecânica própria e uma
recompensa permanente ao ser concluída:

| Linhagem | Mecânica | Recompensa |
|---|---|---|
| GPT | Equilibrada | Produção +25% |
| Claude | **Ritmo:** clique +15% por clique/s (manuais e automáticos, até 40/s); produção passiva −40% | Clique +50% e tema Claude |
| Gemini | **Multimodal:** sinergias 2× e +15% por tipo de gerador com 25+ unidades; modelos multiplicam menos | Sinergias +50% e tema Gemini |

Claude e Gemini são fim de jogo: o custo dos modelos cresce 2× mais rápido que no GPT e a produção
final é ~8× maior. Partindo de 3 singularidades de GPT, cada uma leva ~1h45 com o bot do simulador:

```sh
node tools/balance-sim.js 4 gpt,gpt,gpt,claude,gemini
```

Llama, Grok e DeepSeek estão planejadas. Para criar uma linhagem: adicione a entrada em `lineages`
no `config.js` (modelos, `mods`, `reward`), os textos `lineage.<id>.*` e `model.<id>.desc` em
`i18n.js` e, se tiver mecânica nova, trate o `mod` em `compute()` no `core.js`.

## Versão desktop (tokens reais)

O app em `desktop/` abre o mesmo jogo e adiciona a aba **compute**: os tokens que você usa no
Claude Code (lidos de `~/.claude/projects`) viram uma segunda moeda, que compra upgrades permanentes.

```sh
cd desktop
npm install
npm start      # abre o jogo
npm test       # testes do leitor de logs e das regras do compute
```

- **Pesos:** output 1×, input 0,2×, escrita de cache 0,1×, leitura de cache 0,01× (a leitura de cache é
  ~97% do volume bruto e quase não é trabalho novo).
- **Escala por dia:** `floor(30 × log2(1 + ponderado / 2000))`. Usar 10× mais rende só um pouco mais, para
  não premiar queimar tokens. Ao conectar, os últimos 7 dias contam.
- **Loja:** Fine-tuning (+10% de produção por nível), Contexto do projeto (+25% de clique por nível),
  Modo agente (tokens dourados mais frequentes), Agente em segundo plano (+1 clique automático/s por
  nível), Boost de sessão (×5 por 5 min) e Injeção de compute (30 min de produção na hora). Os níveis
  sobrevivem à singularidade.
- **Privacidade:** o leitor (`desktop/usage/claude-code.js`) descarta o conteúdo de cada linha logo após
  o parse e entrega à página só totais por dia. A página roda com `contextIsolation`, sem Node, e com
  uma Content-Security-Policy que bloqueia qualquer conexão externa.
- O save do app é separado do save do navegador (ver "Migrando o save" abaixo para levar o progresso).

## Criando um tema

Copie um bloco `:root[data-theme="..."]` em `css/themes.css`, troque as cores, adicione o id em
`themes` no `config.js` e o nome `theme.<id>` nas duas línguas em `i18n.js`.

## Áudio

Todo o som é gerado por código em `js/audio.js`:

- **Efeitos:** clique, compra, upgrade, evolução de modelo, token dourado, alucinação, `429`,
  conquista e singularidade. No tema Windows 98 eles trocam por recriações sintetizadas do
  "ding", do "chord" e do "tada" (não são os arquivos originais).
- **Música procedural** em loop (Am–F–C–G; C–Am–F–G no Win98) que ganha uma camada a cada modelo:
  baixo → arpejo → bumbo e chimbal → caixa → melodia → pad, e acelera no GPT-6. O frenesi
  acelera o chimbal e a alucinação desafina tudo.
- O áudio começa no primeiro clique ou tecla (regra dos navegadores) e pausa quando a aba fica em
  segundo plano. Os botões `sfx` e `♪` no topo ligam e desligam, e os volumes ficam na aba stats.
- Para testar sem ouvir, `AIC.audio.analyze('model')` renderiza um som offline e retorna pico e RMS.

## Migrando o save

No console do DevTools do jogo antigo: `copy(localStorage.getItem('ai-token-clicker.save.v1'))`.
No destino (no app desktop, abra o DevTools com Ctrl+Shift+I):

```js
AIC.save.save = () => true; // evita que o save atual sobrescreva o colado ao recarregar
localStorage.setItem('ai-token-clicker.save.v1', `COLE_AQUI`);
location.reload();
```

## Controles

- Clique no botão **GERAR TOKENS** ou aperte **espaço** (segurar a tecla não conta).
- `x1 / x10 / max` define quantos geradores ou rivais comprar por clique.
- Clique no `<|golden|>` quando ele aparecer na tela.
- Limite de 12 cliques/s: acima disso os cliques não contam (anti-autoclicker, ajustável em `maxClicksPerSecond`).
- O seletor no topo troca o tema: Terminal, Escuro, Claro, Catppuccin Mocha, Dracula, GitHub Dark,
  Tokyo Night, Nord, Gruvbox, Âmbar CRT e Windows 98, mais Claude e Gemini ao concluir essas linhagens. A escolha fica salva no navegador e não é apagada pelo reset.
- `EN/PT` troca o idioma. `resetar` apaga o save inteiro, inclusive os pontos de AGI.
