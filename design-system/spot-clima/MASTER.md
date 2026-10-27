# Spot Integra — Design System (MASTER)

> Fonte de verdade global. Regras de página em `pages/<nome>.md` sobrescrevem este
> arquivo; na ausência de um arquivo de página, valem só as regras daqui.
>
> Gerado em 2026-09-25 com a skill `ui-ux-pro-max`; **a paleta NÃO veio da busca
> genérica** (ela sugeriu teal + Fira, que contrariam a marca), e sim de
> `tailwind.config.ts` e `globals.css`.
>
> Revisado em 2026-09-28: a tela de **Personalização foi removida** (cores, logo,
> raio e presets editáveis pelo RH). No lugar dela, o sistema tem **modo escuro
> automático**, que segue o aparelho — seção 3.
>
> Revisado em 2026-09-25 com o redesenho "Boletim": o painel ganhou linguagem
> própria (seções 2 e 4), separada da linguagem da capa de entrada, que ficou
> como estava. As telas de login (`LoginCover`) e a capa da pesquisa
> (`SurveyCover`) estão FORA deste redesenho, por decisão do cliente.

> **Revisado em 2026-10-15: o "Boletim" foi substituído pelo "Painel Spot".** A
> pedido do usuário, o painel passou a seguir dois modelos do Figma Make (ATS
> Resume Analyzer e Energy Management): barra lateral escura com ícones SVG e
> avatar, indicadores em cartões com ícone (um deles em destaque escuro), blocos
> `.card` arredondados com sombra rasa, gráficos dentro de blocos, tabela com
> cabeçalho tingido e status em pílula suave. **Onde as seções 2 e 10 abaixo
> falam em "nada flutua", "filete no lugar de caixa", "sem pílula pastel" e "sem
> fileira de cards", vale o texto desta nota.** Tokens de cor, tipografia
> (Fraunces/Plex), modo escuro, contraste e alvo de toque seguem como estão.
> Mudou: raio (`xl2` 0.875rem, `btn` 0.5rem), `shadow-card`, `.card`, `.stat*`,
> `.badge*`, `.tabela`, `.label`, `<Secao>` (agora é o próprio bloco) e
> `<Icone>` em `src/components/ui/Icone.tsx`. A sombra segue sem reagir ao mouse.

---

## 1. Padrão de produto

Ferramenta interna de RH, **mobile-first**, usada de pé e no telefone (gestores no
salão/cozinha) e no desktop (RH no escritório). Três áreas com pesos diferentes:

| Área | Quem usa | Contexto dominante | Prioridade |
|---|---|---|---|
| `/survey` | colaborador | celular, uma única vez, sem treino | clareza e progresso acima de tudo |
| `/gestor` | gestor de setor | celular, no meio do turno, em pé | alvo de toque, leitura rápida, poucos passos |
| `/admin` | RH | desktop, sessão longa, muitos dados | densidade, tabelas, exportação |

Consequência prática: **nada é desenhado primeiro no desktop.** O layout nasce em
375px e ganha colunas a partir de `sm:`/`lg:`.

## 2. Estilo visual — "Boletim"

O painel se lê como um **boletim interno impresso**: papel creme, filete fino,
índice em monoespaçada, número grande em serifa. Não é o estilo genérico de
dashboard (card branco arredondado + sombra + pílula pastel), que é justamente
o que fazia o sistema parecer saído de um gerador.

**A porta de entrada tem voz própria e continua como está.** `LoginCover` e
`SurveyCover` usam moldura preta, formas amarelas e carimbo em caixa-alta. O
painel NÃO copia esse vocabulário — seriam dois lugares gritando a mesma coisa.
A marca amarra os dois; a linguagem de cada um é adequada ao que ele faz:
a capa convida, o painel informa.

As três regras que sustentam o resto:

1. **Nada flutua.** Sombra só no que realmente paira sobre a página (modal,
   painel suspenso, menu). `shadow-card` não é usado em conteúdo.
2. **Filete no lugar de caixa.** Uma régua de 1px separa melhor que uma borda
   fechada e deixa o conteúdo respirar no papel em vez de virar caixinha.
   Lista de pessoas é lista, não pilha de cards.
3. **Hierarquia vem da tipografia, não de fundo colorido.** Por isso status é
   ponto + rótulo em mono, nunca pílula pastel.

Decorre disso:
- Amarelo é **ação e marcação** (botão primário, barra do item ativo do menu,
  sublinhado de hover). Se algo amarelo não é clicável nem marca posição, está errado.
- Preto (`spot-black`) é a tinta forte: botão secundário, chip selecionado,
  texto de ênfase. No modo escuro ele vira claro (ver seção 3).
- Raio pequeno em tudo (0.375rem / 0.25rem). Pílula de 9999px é enfeite de
  landing page; aqui tudo é trabalho.
- Ícones sempre SVG inline (`currentColor`). **Emoji nunca é ícone** — os glifos
  decorativos do menu (`◧`, `▥`, `🎓`…) foram removidos, não substituídos: já
  precisavam de `aria-hidden` e não distinguiam um item do outro.
- Entrada de página é só opacidade. O "sobe e aparece" que havia em todo card
  atrasava a leitura em ~350ms sem comunicar nada.

## 3. Arquitetura de tokens e modo escuro

Duas camadas — nunca pule para a de baixo.

```
1. Variável CSS      --spot-gray-600: 84 84 79;     <- globals.css, um valor por modo
2. Token Tailwind    text-spot-gray-600             <- rgb(var(--x) / <alpha-value>)
   Hex cru           #54544F                        <- só em Recharts/Heatmap
```

**Modo escuro segue o aparelho** (`prefers-color-scheme`) e não tem chave. Toda
cor do Tailwind é variável, inclusive a escala de cinza inteira; o bloco
`@media screen and (prefers-color-scheme: dark)` do `globals.css` redeclara os
valores. Por isso **hex cru em componente é defeito**: ele não troca de modo.

Os nomes que confundem:

| Token | Claro | Escuro | Para quê |
|---|---|---|---|
| `spot-black` | preto | creme | tinta forte / superfície invertida |
| `spot-onBlack` | branco | quase preto | texto EM CIMA de `bg-spot-black` |
| `spot-onYellow` | preto | preto | texto em cima do amarelo |
| `spot-sidebar` / `sidebarText` | preto / branco | preto / branco | barra de navegação e aviso flutuante: não invertem |
| `spot-dangerFill` | `#C93A3A` | `#C93A3A` | fundo do `.btn-danger` (texto branco) |

Regras que saem disso:
- `bg-spot-black` **sempre** com `text-spot-onBlack`. `text-white` em cima dele
  era exatamente o que deixava letra branca sobre creme no escuro antigo.
- Dentro da barra escura, texto de apoio é `text-spot-sidebarText/75` (ou `/65`),
  não `text-spot-gray-300/400` — a escala de cinza inverte, a barra não.
- `bg-white` → `bg-spot-white`. Branco literal só em cima de `dangerFill`/barra.
- Painel de modal usa `.modal-panel`: no escuro ele ganha filete, porque a
  sombra preta não aparece sobre fundo preto.
- Trecho que precisa ficar claro no escuro (prévia de impressão):
  `data-tema="claro"` no contêiner.
- Gráfico: o Recharts não lê variável em atributo SVG. `Charts.tsx` usa
  `useModoEscuro()` e uma paleta clara/escura local para eixo, grade, tinta e
  tooltip.
- `tests/darkMode.test.ts` mede os pares texto/fundo das duas paletas lendo o
  próprio `globals.css`. Trocou uma cor, o teste diz se quebrou.

Exceções de hex auditadas: `Charts.tsx`, `Heatmap.tsx` (célula tem fundo e
texto próprios, iguais nos dois modos) e `themeColor` em `layout.tsx`.

### Paleta (modo claro)

| Papel | Token | Hex padrão | Uso |
|---|---|---|---|
| Primária / ação | `spot-yellow` | `#F5C400` | botão principal, foco, destaque |
| Primária hover | `spot-yellowDark` | `#D9AE00` | hover do botão principal |
| Secundária | `spot-black` | `#0B0B0B` | sidebar, botão secundário |
| Fundo | `spot-cream` | `#FAFAF7` | `body` |
| Superfície | `spot-white` | `#FFFFFF` | card, modal, input |
| Borda | `spot-gray-200` | `#E4E4E1` | divisor, contorno de card |
| Texto forte | `spot-gray-900` | `#151512` | título, corpo — 17.5:1 sobre creme |
| Texto de apoio | `spot-gray-600` | `#54544F` | legenda, auxiliar — 7.6:1 |
| Texto mínimo | `spot-gray-500` | `#6F6F68` | menor nível permitido — 5.1:1 |

### Cores semânticas de resultado

| Papel | Hex | Contraste sobre branco | Onde pode ser usado |
|---|---|---|---|
| Favorável | `#1F9D55` | **3.49:1** | preenchimento de gráfico e badge; **não** como texto |
| Neutro | `#D9AE00` | **2.10:1** | preenchimento de gráfico; **nunca** como texto |
| Desfavorável | `#D64545` | **4.38:1** | preenchimento; como texto só em ≥18.66px bold |

Para **texto** de status use as classes `.badge-*` do `globals.css`
(ponto colorido + rótulo em mono).

### Cores de estado (texto, filete, ponto) — tokens desde 2026-09-28

Viviam como hex cru em 31 arquivos (`border-[#C93A3A]`, `text-[#0F7A3D]`…) e
misturadas com o vermelho/verde do Tailwind (`text-red-600`, `text-emerald-600`
— este último dava **3.77:1** e reprovava). Agora são tokens:

| Token | Hex | Sobre branco | Uso |
|---|---|---|---|
| `spot-danger` | `#C93A3A` | 5.06:1 | erro, ação destrutiva, filete de erro |
| `spot-dangerDark` | `#A82E2E` | 6.78:1 | hover do `.btn-danger`, título de erro |
| `spot-success` | `#0F7A3D` | 5.42:1 | "salvo", tendência de alta, filete de sucesso |
| `spot-warning` | `#E8B400` | 1.92:1 | **só filete e ponto** — nunca texto |
| `spot-warningInk` | `#8A6500` | 5.33:1 | rótulo âmbar em texto |

Nada de `red-*`/`emerald-*` do Tailwind em componente: é outra família de cor.

> Regra dura: **cor sozinha nunca carrega significado.** Favorável/neutro/
> desfavorável sempre acompanham rótulo ou ícone — quem tem daltonia vermelho-verde
> é ~8% dos homens, e este sistema é lido por todo o quadro.

## 4. Tipografia

Três famílias com papéis que não se misturam, carregadas por `next/font` em
`src/app/layout.tsx` (auto-hospedadas: sem request ao Google em runtime, o que
importa num PWA que roda no wifi do salão).

| Papel | Família | Onde |
|---|---|---|
| `font-display` | **Fraunces** | título de página, título de seção, NÚMERO grande |
| `font-sans` | **IBM Plex Sans** | corpo, formulário, tabela, botão |
| `font-mono` | **IBM Plex Mono** | rótulo micro em caixa-alta, índice de seção, número tabular |

> Até 2026-09-25 o Tailwind declarava `Inter` e **ninguém carregava a fonte**: o
> app inteiro renderizava no `system-ui` de cada aparelho. A mesma tela tinha
> três caras (San Francisco no iPhone, Segoe no Windows, Roboto no Android) e
> nenhuma delas era uma escolha. A tipografia era o maior diferencial disponível
> e estava sobrando no chão.

Regras:
- **Fraunces só de 20px para cima.** É serifa de eixo variável, com desenho
  autoral; abaixo disso o desenho some e a leitura sofre.
- **Mono só em rótulo micro** (10–11px, caixa-alta, `tracking-[0.18em]`). É o
  que dá o ar de boletim. Em texto corrido, nunca.
- **Número é sempre tabular** (`.tabular` ou dentro de `table`): sem isso o "1"
  ocupa menos que o "8" e a coluna de porcentagem fica tremida.

| Papel | Classe | Tamanho | Regra |
|---|---|---|---|
| Título de página | `font-display text-3xl font-semibold` | 30px | um por tela, via `<CabecalhoPagina>` |
| Título de seção | `.secao-titulo` | 20–24px | via `<Secao>`, sempre com filete |
| Indicador | `.stat-valor` | 40–48px | dentro de `<ReguaIndicadores>` |
| Corpo | `text-sm` | 14px | padrão do sistema |
| Auxiliar | `text-xs` | 12px | **piso absoluto** — nada abaixo disso |
| Rótulo micro | `.stat-rotulo` / `.secao-indice` | 10–11px mono | caixa-alta; é rótulo, não texto |
| Campo de formulário | `text-base sm:text-sm` | 16px → 14px | obrigatório, ver abaixo |

**O `text-base` no celular não é estética.** O Safari do iPhone dá zoom automático
ao focar campo com fonte menor que 16px e deixa a página torta. A classe `.input`
já resolve — use `.input`, não recrie o campo.

`line-height` fica no default do Tailwind (1.5 no corpo). Nunca aperte abaixo disso

## 5. Espaçamento e densidade

Densidade **6/10 — padrão**. A escala em uso (já consistente no código) é:

| Token | px | Uso |
|---|---|---|
| `gap-2` | 8 | ícone + rótulo, itens de badge |
| `gap-3` | 12 | campos de formulário empilhados |
| `gap-4` | 16 | itens de lista, grid de cards no mobile |
| `gap-6` | 24 | separação entre blocos dentro de uma seção |
| `gap-8` | 32 | colunas de seções lado a lado |
| `gap-10` | 40 | separação entre seções de uma página |
| `p-5` / `p-6` | 20 / 24 | padding interno de card (`.card`) |
| `py-10` | 40 | respiro de topo/base de página |

Sem a moldura do card, o que separa uma seção da outra é o **espaço**: por
isso o salto de `gap-6` para `gap-10` entre seções. Apertar isso de volta faz
a página virar um bloco só de texto.

Não introduza valores fora dessa escala. `gap-5`, `p-7`, `mt-9` não existem aqui.

## 6. Interação e alvo de toque

- **Mínimo 44×44px** em tudo que se toca. As classes `.btn-*` já trazem `min-h-11`;
  um botão secundário de 32px de altura é defeito, não variação.
- **8px ou mais entre alvos** adjacentes — dois botões colados viram erro de mira.
- **Nada depende de hover.** Hover é reforço; a informação tem que estar visível
  sem ele, porque no celular hover não existe.
- Foco sempre visível: o `:focus-visible` global do `globals.css` já pinta anel
  amarelo. **Nunca remova `focus:outline-none` sem repor um anel.**
- Toda ação assíncrona dá retorno em menos de 100ms (spinner, `disabled`, ou
  estado otimista). Botão que não responde é clicado duas vezes.
- Botão desabilitado explica por quê — em `title` ou em texto ao lado.

## 7. Movimento

Tier **subtle (3/10)**. As animações já definidas em `tailwind.config.ts`
(`fadeIn`, `fadeInUp`, `scaleIn`, `checkPop`, `sheetUp`) cobrem o sistema inteiro;
não crie novas sem motivo.

- Duração: 200–350ms para entrada, 150–200ms para saída (sair é sempre mais rápido
  que entrar).
- Anime só `opacity` e `transform`. **Nunca `width`, `height`, `top`, `left`** —
  forçam layout a cada frame.
- `prefers-reduced-motion` já está tratado globalmente no `globals.css`. Se você
  animar via JS, repita a checagem lá.
- Armadilha registrada: `fadeInUp` não usa `both`/`forwards` de propósito. Um
  `transform` retido transforma o elemento em containing block e prende qualquer
  `position: fixed` descendente — foi o que quebrou modais dentro de
  `AdminChrome`/`GestorChrome`. **Não "conserte" isso adicionando `both`.**
- Movimento decorativo (`drift`, `breathe`) só em elemento `aria-hidden`.

## 8. Formulário e erro

- Rótulo sempre visível (`.label`). **Placeholder não é rótulo** — ele some quando
  a pessoa começa a digitar, justo quando ela mais precisa da referência.
- Erro fica **junto do campo**, não só num resumo no topo.
- Em formulário mais alto que a tela, acender o erro no campo não produz mudança
  visível nenhuma: é obrigatório **rolar até o primeiro campo inválido** —
  use `src/lib/scrollToError.ts`.
- Erro diz o que fazer ("Informe um e-mail com @"), não o que falhou
  ("Valor inválido").

## 9. Gráficos e dados

- Toda série tem legenda e tooltip; o valor também aparece em texto onde couber.
- Tabela larga rola **dentro do bloco** (`overflow-x-auto`), nunca empurra a página.
  O `min-w-0` de `.card` e de `<Bloco>` existe exatamente para isso — não remova.
- Tabela usa a classe `.tabela`: cabeçalho em mono micro, filete entre linhas,
  sem zebra e sem fundo cinza no `thead`.
- Mapa de calor precisa do número na célula, não só da cor.
- Contraste de texto sobre célula colorida tem que ser recalculado, não chutado —
  use `contrastRatio()` de `src/lib/contrast.ts`.

## 10. Anti-padrões (não faça)

- Hex cru em componente `.tsx` fora de `charts/`.
- Emoji no lugar de ícone.
- `text-spot-gray-400` (`#9C9C95`) em texto — 2.76:1, reprova.
- Cor como único portador de significado.
- Rolagem horizontal da página no celular.
- `user-scalable=no` / `maximum-scale=1` no viewport.
- Valor de espaçamento fora da escala da seção 5.
- Animar `width`/`height`.
- Botão abaixo de 44px de altura.
- Estado de carregamento sem `.catch` — a tela cai em "nenhum registro" quando a
  API falha, e o usuário lê isso como "não tem nada", não como "deu erro".
- **Sombra em conteúdo.** `shadow-card`/`hover:shadow-md` em card, lista ou
  gráfico. Sombra é só para o que paira de verdade (modal, menu suspenso).
- **Pílula pastel de status** (`bg-emerald-100 text-emerald-800` e parentes).
  Status é ponto colorido + rótulo escrito — ver `.badge-*` em `globals.css`.
- **Fileira de quatro cards iguais** para indicadores. Use `<ReguaIndicadores>`.
- **Lista de pessoas como pilha de cards.** Lista é lista: filete entre linhas.
- **Fraunces abaixo de 20px** ou monoespaçada em texto corrido.
- Copiar o vocabulário da capa (moldura preta, carimbo amarelo, caixa-alta
  pesada) para dentro do painel — são duas vozes de propósito.
- **`confirm()`/`alert()` do navegador.** Use `useConfirm()` de
  `@/components/async` (`titulo`, `texto`, `acao` com verbo, `perigo`). O
  nativo mostra o endereço do site no título e só oferece "OK".
- `btn-primary` + `bg-red-600` por cima para apagar. Use `.btn-danger`.
- Glifo Unicode como ícone (`✕`, `☰`, `✓`). Seta em link de texto
  ("← Voltar") é tipografia e pode ficar.
- `min-h-screen`/`100vh`: no Safari do iPhone ignora a barra de endereço.
  Use `min-h-dvh`/`100dvh`.

## 11. Dívidas conhecidas (medidas, não estimadas)

Verificado com `contrastRatio()` do próprio projeto em 2026-09-25.

### Corrigidas em 2026-09-25

| Onde | Antes | Depois | Ratio |
|---|---|---|---|
| Texto de apoio sobre fundo claro (**87 ocorrências**) | `text-spot-gray-400` — 2.76:1 | `text-spot-gray-500` | 5.06:1 |
| Heatmap, faixa 50–64 | `#FFF` sobre `#E27A2E` — 2.98:1 | `#1A1A1A` | 5.85:1 |
| Heatmap, faixa <50 | `#FFF` sobre `#D64545` — 4.38:1 | `#000000` | 4.80:1 |
| Heatmap, célula oculta | `#9C9C95` sobre `#F2F2F0` — 2.46:1 | `#54544F` | 6.79:1 |

Exceção deliberada: as **4 ocorrências de `text-spot-gray-400` na barra escura**
(`AdminChrome`, `GestorChrome`) ficaram como estavam — sobre `#0B0B0B` o gray-400
dá 7.13:1 e o gray-500 cairia para 3.89:1. Contraste se mede contra o fundo real,
não contra a classe; um `sed` global nesses arquivos teria criado o defeito que
pretendia corrigir. Está comentado no código.

### Em aberto

| Onde | Combinação | Ratio | Status |
|---|---|---|---|
| Série extra azul | `#3B82F6` / `#FFF` | 3.68:1 | ok como preenchimento, reprova como texto |
| `Desfavorável` como fundo de texto | `#D64545` / `#FFF` | 4.38:1 | exige texto preto puro; escurecer para `#C93A3A` (5.06:1 com branco) devolveria a faixa <50 ao padrão branco — decisão de marca, também mexe em `Charts.tsx` |

Passa com folga: botão principal (amarelo sobre preto, 11.98:1), texto padrão
(17.49:1) e o heatmap nas faixas ≥85 (branco, 5.42:1), 75–84 (`#1A1A1A`, 5.83:1)
e 65–74 (`#1A1A1A`, 9.08:1).

## 12. Checklist antes de entregar tela

- [ ] Testado em 375px, 768px, 1024px e 1440px — sem rolagem horizontal
- [ ] Todo alvo de toque ≥ 44×44px, com ≥8px entre alvos
- [ ] Texto ≥ 12px; corpo em 14px; campo em 16px no celular
- [ ] Contraste ≥ 4.5:1 em todo texto (medir, não estimar)
- [ ] Nenhuma informação transmitida só por cor
- [ ] Foco de teclado visível em todos os controles
- [ ] Ícones em SVG, com `aria-hidden` se decorativos e rótulo se clicáveis
- [ ] Estados de vazio, carregando **e erro** desenhados (os três)
- [ ] `prefers-reduced-motion` respeitado
- [ ] Zero hex cru no componente
- [ ] Nenhuma sombra em conteúdo (só modal e menu suspenso)
- [ ] Nenhuma pílula pastel de status — ponto colorido + rótulo escrito
- [ ] Lista de registros separada por filete, não empilhada em cards
- [ ] Título de página em `font-display`; rótulo micro em `font-mono`
- [ ] Número em coluna com `.tabular`
- [ ] Ação destrutiva passa por `useConfirm({ perigo: true })`, não por `confirm()`
- [ ] Cor de estado por token (`spot-danger`/`success`/`warning`), sem hex

Estrutura que já vem pronta e não deve ser refeita por tela: link "Pular para
o conteúdo" e `<main id="conteudo">` nos dois `*Chrome`, `app/not-found.tsx`,
`app/error.tsx`, e `text-wrap: balance` em `h1–h3` no `globals.css`.
