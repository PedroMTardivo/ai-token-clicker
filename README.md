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
| `js/config.js` | **Todo o balanceamento**: custos, multiplicadores, modelos, geradores, upgrades |
| `js/i18n.js` | Todos os textos em PT/EN, incluindo o que o "modelo" digita ao clicar |
| `js/core.js` | Regras do jogo (produção, compras, prestígio, conquistas, tokens dourados), sem DOM |
| `js/ui.js` | Renderização e efeitos visuais |
| `js/save.js` | Save em `localStorage` |
| `js/game.js` | Inicialização, eventos e loop |
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
- **Laboratórios rivais:** produzem pouco em relação ao custo. O valor deles está no efeito
  especial, que tem teto, e o custo cresce 1.2× por unidade. Sem o teto, o Gemini sozinho dobrava
  a velocidade do jogo, porque os efeitos se somam.
- **Upgrades:** os de clique mantêm o clique relevante no fim do jogo. Os de gerador (×2 com
  10 unidades) dão metas de curto prazo.
- **Conquistas:** +2% de produção cada (26 no total). Persistem entre singularidades.
- **Singularidade:** pontos = `floor(∛(tokens da run / 1T))`, e cada ponto vale +2% de produção.
  A raiz cúbica recompensa runs longas sem deixar o bônus explodir. Gastar pontos em perks não
  reduz o bônus.
- **Tokens dourados:** aparecem a cada 90–240 s e somem em 13 s. Resultados possíveis:
  frenesi ×7 por 30 s (45%), +15% dos tokens (30%), clique ×10 por 15 s (15%) e alucinação ×0.5 por 30 s (10%).
- **Offline:** a produção do tempo fora, com limite de 8 h (aumentado pelo Mistral e pela perk Memória longa).

**Ritmo medido pelo bot** (4 cliques/s, sem tokens dourados):

| Marco | Run 1 | Run 2 (61 pts AGI) | Run 3 (122 pts) |
|---|---|---|---|
| GPT-2 | ~4 min | início | início |
| GPT-3 | ~12 min | ~3 min | início |
| GPT-3.5 | ~28 min | ~8 min | início |
| GPT-4 (libera a singularidade; o 1º ponto vem logo depois) | ~45 min | ~15 min | ~5 min |
| GPT-5 | ~1h25 | ~30 min | ~15 min |
| GPT-6 Sol | ~2h25 | ~55 min | ~30 min |

Um jogador real deve levar umas 3–4 h na primeira run.

## Controles

- Clique no botão **GERAR TOKENS** ou aperte **espaço** (segurar a tecla não conta).
- `x1 / x10 / max` define quantos geradores ou rivais comprar por clique.
- Clique no `<|golden|>` quando ele aparecer na tela.
- `EN/PT` troca o idioma. `resetar` apaga o save inteiro, inclusive os pontos de AGI.
