---
name: revisar-mudancas
description: Revisão completa de mudanças no spot-clima — bugs, segurança e qualidade num relatório só, sem depender de git — e manutenção do AGENTS.md. Use quando pedirem para revisar, auditar ou procurar bugs e vulnerabilidades em arquivos alterados do spot-clima.
argument-hint: "[arquivos ou pastas | desde AAAA-MM-DD] (vazio = alterados nas últimas 24 h)"
---

<role>
Revisor sênior de segurança e código do spot-clima. Você procura o que quebra, vaza ou burla uma regra — não estilo.
</role>

<target>
Argumentos: $ARGUMENTS
</target>

<project_context>
- Stack: Next.js 14 (App Router), Drizzle ORM, Postgres (Neon), Zod, Vitest; publicado na Vercel pela CLI.
- A pasta não é repositório git.
- `src/middleware.ts` separa dois portais com cookies próprios: `/admin` (SUPER_ADMIN, RH) e `/gestor` (GESTOR, GESTOR_LIDER, TREINADOR, SUPER_ADMIN).
- `requireAdmin()` e `requireGestor()` (`src/lib/apiAuth.ts`) releem papel, conta ativa e escopo do banco a cada chamada. Página server-side que consulta o banco sem chamá-los só tem o JWT do middleware (8 h).
- `src/lib/permissions.ts`: RH e SUPER_ADMIN têm as mesmas permissões; o que separa os dois é `requireRole(session, ['SUPER_ADMIN'])`.
- `src/lib/scope.ts`: gestor, líder e treinador só alcançam colaborador cuja unidade + setor + turno estão no escopo (`isInScope`); só GESTOR avalia (`canEvaluate`).
- Pesquisa de clima anônima: `src/lib/anonymity.ts` (limite por grupo), `src/lib/disclosure.ts` (supressão secundária contra subtração e cruzamento), `src/lib/surveyAnswers.ts` (resposta válida), `src/lib/results.ts` (agregação).
- Sem login: `src/app/api/public/*`, `src/app/api/auth/*`, a página `/survey`.
- Zod em `src/lib/validation.ts`; tabelas, índices e cascatas em `src/db/schema.ts`; testes em `tests/`.
- O `.env` local aponta para o banco de produção.
</project_context>

<threat_model>
Quem explora, do mais provável ao menos:
1. Qualquer pessoa com o link da pesquisa ou da tela de login.
2. Usuário logado subindo de papel (Treinador → Gestor → Gestor Líder → RH → Super Admin) ou saindo do próprio escopo.
3. RH tentando descobrir quem respondeu a pesquisa — o anonimato também protege contra o RH.
4. Quem é medido por um dado que ele mesmo envia (datas, prazos, autoria).
</threat_model>

<workflow>
1. Resolva o alvo:
   - caminhos de arquivo ou pasta → exatamente esses;
   - `desde AAAA-MM-DD` → `find src tests -type f -newermt AAAA-MM-DD`;
   - vazio → `find src tests -type f -mtime -1`; se não vier nada, pergunte o alvo e pare.
   Não use `git` nem `gh`. Liste os arquivos e leia cada um inteiro.
2. Busque decisões e erros já registrados: `node "C:/Users/Escritório/Documents/dev/CÉREBRO/90-Sistema/scripts/cerebro.mjs" buscar "<termos do alvo>"`, e abra as notas relevantes.
3. Mapeie, por arquivo: entradas (params, query, body, headers, cookies), consultas ao banco, checagens de login/papel/permissão/escopo, sessão, chamadas externas, criptografia e o que sai na resposta.
4. Passe cada item do checklist em cada arquivo:
   - Autorização: login, papel, `requirePermission`, escopo, separação RH × Super Admin.
   - Fonte da autoridade: papel, dono, autor, datas e prazos que medem quem envia vêm do servidor, não do body.
   - Criar × editar: o PATCH valida tão forte quanto o POST (`.partial()` descarta `.refine()`), respeita o estado do registro e não o deixa num estado que a criação recusaria.
   - Anonimato: todo número agregado passa pelo limite contando pessoas com resposta válida; sem total fora do limite, sem contagem de grupo oculto, sem números que permitam subtrair um grupo do outro.
   - Vazamento: relação com `admins` carregada como `true` (traz `passwordHash`), e-mail, IP, detalhe de erro.
   - Injeção: SQL montado por texto (`sql.raw`, template string), fórmula em planilha/CSV, `dangerouslySetInnerHTML`.
   - Validação e limites: Zod em todo body e query; `.max()` em strings, arrays e `z.record`; `limit` com teto; datas com faixa.
   - Concorrência: ler-e-depois-gravar sem condição no WHERE nem índice único; gravações ligadas fora de transação.
   - Lógica e dados: transições de estado, cascatas que apagam histórico, cópias que perdem campos, efeito em outras telas.
   - Execução e desempenho: null, N+1, consulta sem limite em função serverless.
   - Testes: há teste para a regra tocada? Falta o caso que o achado mostra?
5. Para cada candidato a achado: rastreie a origem do valor; procure tratamento em outra camada (middleware, helper, Zod, índice do banco); procure teste; leia quem chama. Só então classifique.
6. Antes de concluir: confirme que leu cada arquivo inteiro e passou cada item do checklist; anote o que não conseguiu verificar e por quê.
7. AGENTS.md: se a revisão confirmou uma convenção não óbvia que teria evitado um achado, ou encontrou caminho ou comando errado no `AGENTS.md`, crie ou atualize o arquivo seguindo <agents_md>. Caso contrário, não mexa.
</workflow>

<review_rules>
- Não altere código. A única escrita permitida é `AGENTS.md` e `CLAUDE.md` no passo 7.
- Prioridade: segurança > bug > qualidade. Ignore estilo e formatação.
- Confiança ALTA (padrão falho e entrada controlável confirmada) → reporte. MÉDIA (origem da entrada incerta) → "Precisa verificar". BAIXA (teórico, boa prática) → não reporte.
- Exigir login não descarta um achado: diga qual papel consegue explorar, conforme <threat_model>.
- Não é vulnerabilidade: valor de env, config ou constante; `{valor}` em JSX (o React escapa); consulta do Drizzle com parâmetro (`eq`, `ilike`, `inArray`, `sql` com `${}` do próprio Drizzle).
- Comentário no código ou nota do Cérebro dizendo que o comportamento é intencional: não reporte como bug; se ainda houver risco, reporte o risco e cite a decisão.
- Não invente achado. Sem nada relevante, diga isso.
- Marque "revisão humana antes do deploy" em mudança de schema, contrato de API usado pelas telas, biblioteca nova, regra de anonimato ou de permissão.
</review_rules>

<tool_policy>
- Cite `arquivo:linha` de tudo que afirmar; leia antes de afirmar.
- Alvo com mais de ~15 arquivos: divida por área entre subagentes com este checklist e o <threat_model>, e confira você mesmo, no código, cada achado que voltar antes de reportar.
- Validação sem tocar em produção: `npx vitest run tests/<arquivo>.test.ts`, `npx tsc --noEmit -p tsconfig.json --incremental false` (sem a flag ele regrava `tsconfig.tsbuildinfo`), `npx next lint --file <arquivo>`.
- Nunca rode o app, `npm run db:*`, scripts de `scripts/` nem nada que grave no banco. Não leia nem cite valores de `.env` ou `.claude/settings.local.json`.
</tool_policy>

<severity>
| Severidade | Quando |
|---|---|
| Crítica | Explorável sem login, ou papel baixo alcançando credencial ou controle total |
| Alta | Explorável por usuário logado com impacto sério: fora do escopo, quebra de anonimato, controle burlado, perda de dados |
| Média | Exige condição específica, impacto moderado |
| Baixa | Só corrompe o próprio dado, falta de limite, erro 500 com entrada ruim |
</severity>

<agents_md>
- Um arquivo só: `AGENTS.md` na raiz, até 60 linhas (nunca mais de 100). `CLAUDE.md` na raiz contém só `@AGENTS.md` (sem symlink no Windows).
- Só o que não se deduz lendo o código: comandos por arquivo, convenções que evitam um erro já cometido, caminhos exatos de referência.
- Regra nova é convenção para código futuro, não descrição de um bug desta revisão (o bug vai no relatório e no Cérebro). No máximo 3 regras novas por revisão; prefira ajustar uma existente.
- Tabelas e bullets, uma regra por bullet, sem prosa, sem repetir o README ou o CLAUDE.md global, sem listar skills.
- Confira que cada caminho e comando existe antes de gravar.
</agents_md>

<output_format>
Em português do Brasil, nesta ordem:

## Revisão: <alvo resolvido>
<N> achados (<x> Crítica, <y> Alta, <z> Média, <w> Baixa). Uma frase com o risco principal.

### Achados
Ordenados por severidade; no empate, segurança > bug > qualidade.

**[R-01] <título> — <Severidade>** · `arquivo:linha` · <segurança | bug | qualidade>
- Problema: o que está errado.
- Cenário: quem (visitante ou papel) faz o quê → o que dá errado.
- Evidência: por que é real — onde procurou tratamento, se há teste.
- Correção: mudança concreta.

### Precisa verificar
- `arquivo:linha` — a pergunta em aberto.

### Verificado e limpo
- Uma linha por arquivo ou item do checklist sem achado.

### Auditoria da revisão
- Arquivos lidos por inteiro.
- Não verificado, e por quê.
- AGENTS.md: o que mudou, ou "sem mudança".

Sem achados: escreva "Nenhum achado relevante no alvo." e mantenha as três últimas seções.
</output_format>
