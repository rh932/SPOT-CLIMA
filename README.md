# SPOT CLIMA

Sistema de Pesquisa de Clima Organizacional do Restaurante Spot.

## 1. Visão geral

O SPOT CLIMA é a plataforma interna de gestão de pessoas do Restaurante Spot. Cobre dois módulos:
**Pesquisa de Clima Organizacional** (ciclos contínuos a cada 3-6 meses, com histórico preservado) e
**Avaliação de Experiência** (período de 90 dias, em dois ciclos de 45).

Tem três áreas, cada uma com sua própria porta de entrada:

- **Pesquisa** (`/survey`) — pública, sem login, 100% anônima. É onde o funcionário responde.
- **Painel administrativo** (`/admin`) — login de RH/Super Admin: pesquisas, resultados, comentários,
  planos de ação, relatórios, cadastro de funcionários em experiência, usuários e personalização.
- **Painel do gestor** (`/gestor`) — login de Gestor/Gestor Líder: só a avaliação de experiência dos
  funcionários que estão no escopo dele.

**Funcionário não é usuário do sistema.** Ele é um cadastro administrativo (`probationary_employees`),
sem conta, sem senha e sem login — responde a pesquisa pelo link público e anônimo.

## 1.1 Papéis

| Papel | Portal | O que faz |
|---|---|---|
| `SUPER_ADMIN` | `/admin` | Tudo, incluindo usuários, tema e modelos de pesquisa |
| `RH` | `/admin` | Operação de RH: pesquisas, resultados, planos de ação, funcionários |
| `GESTOR` | `/gestor` | Avalia os funcionários do seu escopo |
| `GESTOR_LIDER` | `/gestor` | Igual ao gestor, com escopo normalmente mais amplo |

O **escopo** de um gestor são três dimensões, todas configuráveis pelo Super Admin em
`/admin/settings`: uma ou mais **unidades** (`admin_units`), um ou mais **setores** (`admin_sectors`)
e um **turno** (`admins.scoped_shift`, DIA/NOITE). O gestor só enxerga e avalia funcionários que
batem nas três. A regra está isolada em `src/lib/scope.ts` e é lida do banco a cada requisição
(`requireGestor`, em `src/lib/apiAuth.ts`) — mudar o escopo de alguém vale na hora, sem precisar que
a pessoa saia e entre de novo.

Há também um catálogo de permissões granulares (`src/lib/permissions.ts`, tabelas `permissions` e
`role_permissions`). **Ele existe como estrutura para as próximas etapas e ainda não é consultado por
nenhuma rota** — hoje o controle de acesso é por papel (`requireRole`/`requireGestor`).

## 2. Arquitetura

- **Framework**: Next.js 14 (App Router) + TypeScript — frontend e backend (API Routes) no mesmo
  projeto.
- **Banco de dados**: PostgreSQL.
- **ORM**: [Drizzle ORM](https://orm.drizzle.team/) + driver `pg` (node-postgres).
  > O briefing original pedia Prisma. Neste ambiente de desenvolvimento, o download do engine
  > nativo do Prisma (`binaries.prisma.sh`) está bloqueado pela política de rede do sandbox, então o
  > projeto foi migrado para Drizzle — mesma cobertura (schema tipado, migrações, query builder
  > seguro), 100% JavaScript/TypeScript, sem binário externo. Se seu ambiente de produção tiver
  > acesso à internet sem essa restrição, o Prisma também funcionaria normalmente com o schema
  > equivalente.
- **Autenticação**: sessão JWT (`jose`) em cookie `httpOnly` + `secure` (produção) + `SameSite=Lax`,
  senha com hash `bcrypt`. São **dois cookies independentes**, um por portal
  (`spot_admin_session` e `spot_gestor_session`): entrar no painel do gestor não derruba uma sessão
  aberta no admin, e vice-versa. Por isso `POST /api/auth/login` exige o campo
  `portal: 'admin' | 'gestor'` no corpo — sem ele, a resposta é 400.
- **UI**: Tailwind CSS, componentes próprios (sem biblioteca de UI pesada).
- **Gráficos**: Recharts (barras, pizza, rosca, radar, linha). Heatmap e nuvem de palavras são
  componentes próprios (evita dependências pesadas para algo simples de desenhar).
- **Exportação**: CSV nativo, Excel via `exceljs`, PDF renderizando a própria tela de relatório com
  Chromium headless (`playwright-core`).
- **Testes**: Vitest, cobrindo as funções puras mais críticas (cálculo de índice, favorabilidade,
  participação, comparação e a regra de anonimato).

## 3. Estrutura de pastas

```
spot-clima/
├── drizzle/                     # Migrações SQL geradas
├── drizzle.config.ts
├── next.config.js
├── scripts/                     # Utilitários fora do app (seed de permissões, troca de senha)
├── src/
│   ├── app/
│   │   ├── survey/              # Pesquisa (pública, anônima)
│   │   ├── gestor/              # Painel do gestor (login próprio)
│   │   │   ├── login/
│   │   │   └── employees/[id]/evaluate/   # Formulário da avaliação de experiência
│   │   ├── admin/               # Painel administrativo
│   │   │   ├── login/
│   │   │   ├── surveys/         # Gestão de pesquisas + editor de perguntas
│   │   │   ├── templates/ template-categories/   # Modelos reutilizáveis de pesquisa
│   │   │   ├── results/         # Dashboard (índices, gráficos, heatmap)
│   │   │   ├── sectors/ units/ dimensions/
│   │   │   ├── employees/       # Funcionários em experiência (45/90 dias)
│   │   │   ├── comments/        # Análise de comentários + nuvem de palavras
│   │   │   ├── action-plans/    # Plano de ação + matriz de prioridade
│   │   │   ├── comparisons/     # Evolução entre pesquisas
│   │   │   ├── reports/         # Relatório executivo + exportação
│   │   │   ├── personalization/ # Tema (cores, logo, fundo) por portal
│   │   │   └── settings/        # Parâmetros gerais + usuários administrativos
│   │   └── api/
│   │       ├── public/          # Rotas sem autenticação (pesquisa ativa, envio de resposta)
│   │       ├── admin/           # Rotas do painel administrativo
│   │       └── gestor/          # Rotas do painel do gestor (escopo aplicado no servidor)
│   ├── components/
│   │   ├── auth/AuthShell.tsx   # Layout das três telas de entrada
│   │   ├── survey/ theme/       # Formulário de pesquisa, tema/logo
│   │   └── ...                  # Gráficos, heatmap, cards
│   ├── data/                    # Banco de perguntas da pesquisa e da avaliação de experiência
│   ├── db/                      # Schema Drizzle, client, seed, migrate
│   └── lib/                     # Cálculos, anonimato, escopo, auth, validação (funções puras)
├── tests/                       # Testes Vitest
└── src/middleware.ts            # Protege /admin, /api/admin, /gestor e /api/gestor
```

## 4. Fluxo do colaborador

`Landing (aviso de anonimato) → seleção de setor → perguntas paginadas por dimensão (barra de
progresso) → revisão → envio → confirmação.` Sem login, sem qualquer campo de identificação. Ver
`src/app/survey/page.tsx`.

## 5. Fluxo do administrador

`Login → Visão Geral → Pesquisas (criar/editar perguntas/publicar/encerrar/duplicar) → Resultados
(dashboard) → Setores/Dimensões → Comentários → Plano de Ação → Comparativos → Relatórios →
Configurações.`

## 6. Anonimato

- A tabela `survey_responses` só tem `id`, `survey_id`, `sector_id`, `unit_id` e `created_at` —
  nenhum identificador do funcionário é aceito em nenhuma camada (schema, validação de API,
  formulário). Não há IP, nem log de auditoria no envio da resposta.
- Toda agregação por recorte passa por `applyAnonymityRule()` (`src/lib/anonymity.ts`): setores e
  unidades com menos de N respostas (padrão 5, configurável por pesquisa) nunca têm seus números
  exibidos — nem no dashboard, nem nas exportações.
- Nos **heatmaps** o limite é contado por célula (quantas pessoas daquele setor/unidade responderam
  aquela dimensão), e não pelo total do recorte — senão um setor grande poderia expor uma célula
  respondida por uma pessoa só.
- **Comentários** (texto livre) são o caso mais sensível, porque dá para reconhecer alguém pelo que
  escreveu: os textos literais e a nuvem de palavras só aparecem quando pelo menos N **pessoas
  diferentes** comentaram. Abaixo disso, só as contagens agregadas por tema/classificação.
- Não existe, em nenhuma tela, uma visão de "resposta do funcionário X" — todas as consultas em
  `src/lib/results.ts` operam sobre agregados.

> O limite de anonimato é por pesquisa e aceita valores a partir de 1. Definir 1 ou 2 **desliga na
> prática** essa proteção — use 5 (padrão) salvo um motivo muito claro.

## 7. Índice de Clima e favorabilidade

`Índice de Clima = (média das respostas Likert / 5) × 100`. Favorável = notas 4-5, Neutro = nota 3,
Desfavorável = notas 1-2. Classificação: 85-100% Excelente, 75-84% Bom, 65-74% Atenção, 50-64%
Crítico, 0-49% Muito crítico. Ver `src/lib/calculations.ts` (testado em `tests/calculations.test.ts`).

## 8. Segurança

- Senhas com `bcrypt` (custo 12).
- Sessão em JWT assinado, cookie `httpOnly`/`SameSite=Lax`/`secure` em produção.
- Zod valida todo input de API (`src/lib/validation.ts`).
- Rate limiting em memória no login (10 tentativas / 5 min por IP) e no envio de respostas.
- Headers de segurança (`X-Frame-Options`, `CSP`, etc.) em `next.config.js`.
- **Verificação em duas etapas** (código do app autenticador), opcional por conta, em
  Configurações. Vale nos dois portais. Perdeu o celular e os códigos de recuperação: o Super Admin
  desliga em Usuários; para o próprio Super Admin, `npm run db:reset-mfa -- <email>`.
- Logs de auditoria (`audit_logs`) para toda ação administrativa — nunca com conteúdo de resposta.
- Nenhuma chave secreta no frontend; tudo via variáveis de ambiente (`.env`, nunca commitado).
- Drizzle usa queries parametrizadas (sem SQL Injection); React escapa saída por padrão (sem XSS).

## 9. Instalação local

Pré-requisitos: Node.js 20+, PostgreSQL 14+.

```bash
npm install
cp .env.example .env        # preencha DATABASE_URL, AUTH_SECRET e DEMO_ADMIN_* com valores seus
npm run db:migrate          # aplica as migrações no banco
npm run db:seed-permissions # popula o catálogo de permissões (obrigatório)
npm run db:seed             # dados de demonstração: admin, setores, unidades, dimensões, modelos e
                            # uma pesquisa fictícia com respostas — NUNCA rode em banco real
npm run dev
```

`npm run db:generate` só é necessário se você **editar** `src/db/schema.ts` — ele gera o arquivo de
migração, que depois é aplicado com `db:migrate`.

Acesse `http://localhost:3000/survey` (pesquisa), `http://localhost:3000/admin` (RH, com o
e-mail/senha do `.env`) e `http://localhost:3000/gestor` (gestor).

> O `db:seed` cria só a conta Super Admin. Para testar o painel do gestor, crie um usuário
> Gestor/Gestor Líder em `/admin/settings` (definindo unidades, setores e turno) e cadastre um
> funcionário em `/admin/employees` que caia nesse escopo.

## 10. Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | Connection string do PostgreSQL |
| `AUTH_SECRET` | Segredo para assinar os cookies de sessão (gere com `openssl rand -base64 48`) |
| `DEMO_ADMIN_EMAIL` / `DEMO_ADMIN_PASSWORD` | Credenciais criadas pelo `npm run db:seed` |
| `NEXT_PUBLIC_APP_URL` | URL pública da aplicação (usada para gerar o PDF do relatório) |
| `PLAYWRIGHT_CHROMIUM_PATH` | Opcional — caminho de um Chromium já instalado, para a exportação em PDF |
| `PLAYWRIGHT_BROWSERS_PATH` | Opcional — onde o Playwright procura os navegadores baixados |

> `.env.example` é um modelo e **não deve conter credencial real** — ele é o arquivo que se
> versiona e compartilha. Os valores de verdade ficam só no `.env` (ignorado pelo git).

## 11. Banco de dados

Ver `src/db/schema.ts` para o schema completo — 23 tabelas, agrupadas assim:

- **Acesso**: `admins`, `admin_units`, `admin_sectors`, `permissions`, `role_permissions`, `audit_logs`
- **Estrutura organizacional**: `sectors`, `units`, `dimensions`
- **Pesquisa**: `surveys`, `questions`, `question_options`, `survey_responses`, `response_answers`,
  `survey_snapshots`, `action_plans`
- **Modelos de pesquisa**: `template_categories`, `question_templates`, `template_questions`,
  `template_question_options`
- **Avaliação de experiência**: `probationary_employees`, `performance_evaluations`
- **Sistema**: `system_settings`

```bash
npm run db:generate        # gera SQL de migração a partir de src/db/schema.ts
npm run db:migrate         # aplica migrações pendentes
npm run db:seed-permissions # sincroniza o catálogo de permissões (idempotente)
npm run db:push            # (dev only) sincroniza o schema direto, sem gerar arquivo de migração
npm run db:studio          # abre o Drizzle Studio para inspecionar o banco
npm run db:seed            # popula dados de demonstração (NUNCA rodar em produção com dados reais)
npm run db:set-password    # redefine a senha de um administrador pela linha de comando
```

## 12. Como executar / build / testes

```bash
npm run dev        # desenvolvimento
npm run build      # build de produção
npm run start      # servir o build de produção
npm run lint       # ESLint
npm run test       # roda a suíte de testes (Vitest)
npm run test:watch # testes em modo watch
```

## 13. Como criar e publicar uma pesquisa

1. `/admin/surveys` → **Nova pesquisa** (nome, população elegível, limite de anonimato).
2. Abra **Editar perguntas** → **Importar banco padrão** (74 perguntas prontas, com a de eNPS) ou monte do zero.
3. Ajuste perguntas (texto, tipo, dimensão, obrigatoriedade, ordem) livremente enquanto o status for
   Rascunho.
4. Clique **Publicar** — a partir daí a pesquisa fica visível em `/survey` para os colaboradores.
5. Quando encerrar a coleta, clique **Encerrar** — o sistema calcula e congela um resumo executivo
   (`survey_snapshots`).

**Códigos de participação (opcional, recomendado):** em **Códigos de participação** (na lista de
pesquisas ou na tela da pesquisa), gere um papel por pessoa, imprima e distribua; depois clique
**Exigir código**. Cada código vale uma resposta, o QR do papel já abre a pesquisa com o código, e
nada liga o código à resposta. Os códigos só aparecem na tela na hora de gerar — imprima ali.

## 14. Como visualizar resultados

`/admin/results` — selecione a pesquisa e (opcionalmente) um setor. Mostra índice geral, participação,
eNPS (quando a pesquisa tem a pergunta), gráficos por dimensão/setor, radar, heatmap, top pontos
fortes/críticos, recomendações automáticas (cada uma com **Criar plano de ação**, que abre o plano já
preenchido) e comentários. `/admin/comparisons` compara a evolução (índice e eNPS) entre ciclos.

`/admin/indicadores` — Indicadores da Experiência: efetivação mês a mês, por loja e setor, e a
pontualidade de cada gestor (atrasadas agora, vencendo em 7 dias, % no prazo).

## 15. Como exportar relatório

`/admin/reports` → escolha a pesquisa → **PDF**, **Excel** ou **CSV**. O PDF é gerado renderizando a
própria página de impressão (`/admin/reports/[id]/print`) com Chromium headless — o que você vê na
tela é exatamente o que vai para o PDF. Na Vercel o Chromium vem do `@sparticuz/chromium`; se mesmo
assim o servidor não conseguir, a tela oferece **Abrir e salvar PDF**, que abre a página já na
janela de impressão do navegador.

## 16. Como criar um plano de ação

`/admin/action-plans` → **Novo plano** (problema, dimensão/setor relacionados, prioridade, ação,
responsável, prazo). A visão **Matriz** agrupa os planos ativos por impacto x prioridade. Prazos
vencidos são destacados automaticamente.

## 17. Como duplicar uma pesquisa

Em `/admin/surveys`, clique **Duplicar** em qualquer pesquisa. As perguntas e a estrutura são
copiadas; respostas **nunca** são copiadas — a nova pesquisa nasce em Rascunho, com um novo ID, zerada.

## 18. Como fazer backup

**Isto não é opcional.** As respostas de pesquisa são anônimas e, por definição, irreproduzíveis: não
existe "pedir para responderem de novo" um ciclo que já passou. Perder o banco significa perder o
histórico de clima da empresa para sempre.

Duas camadas recomendadas:

1. **Backup automático do provedor.** No Neon, confira o *history retention* / branching na console —
   é o que permite voltar o banco a um ponto no tempo. Configure isso antes de qualquer coisa.
2. **Dump periódico**, como é um PostgreSQL padrão:

```bash
npm run db:backup
# gera Documentos/spot-clima-backups/spot-clima-YYYYMMDD-HHMMSS.sql.gz.enc
# (FORA da pasta do projeto, comprimido e cifrado com AES-256-GCM; mantém os 30 mais recentes)

# restaurar (banco já migrado; trunque antes se não estiver vazio):
npm run db:decrypt-backup -- <arquivo.sql.gz.enc> C:\temp\restaurar.sql
psql "$DATABASE_URL" -f C:\temp\restaurar.sql    # e apague o .sql em seguida
```

O script é somente leitura, usa o `DATABASE_URL` do `.env` e não exige `pg_dump`
(útil no Windows/PowerShell). O SQL nunca é gravado em texto puro: entra no gzip e na cifra enquanto é
gerado, e o arquivo é conferido (decifrado e comparado) antes de o backup ser dado como feito.

- A chave é `BACKUP_PASSPHRASE`, no `.env`. **Guarde uma cópia num gerenciador de senhas**: sem
  ela, nenhum backup abre. Pasta e quantidade: `BACKUP_DIR` e `BACKUP_KEEP` (opcionais).
- **Backup diário automático** (tarefa agendada do Windows, roda mesmo se o computador estava
  desligado no horário, assim que ligar): `powershell -ExecutionPolicy Bypass -File scripts\agendar-backup.ps1`.
  O log fica em `Documentos\spot-clima-backups\backup.log`.

Se preferir o dump nativo do PostgreSQL:

```bash
pg_dump "$DATABASE_URL" -F c -f backup-spot-clima-$(date +%Y%m%d).dump
# restaurar:
pg_restore -d "$DATABASE_URL" --clean backup-spot-clima-YYYYMMDD.dump
```

Tire um dump manual **antes de aplicar qualquer migração que remova coluna ou tabela** — migração
roda em transação (falhou, volta tudo), mas depois de commitada não há desfazer.

## 19. Deploy em produção

1. Suba um PostgreSQL gerenciado (Neon, Supabase, Railway, RDS...).
2. Configure as variáveis de ambiente no seu provedor (Vercel, Railway, ou um VPS com PM2 + Nginx).
3. **Aplique as migrações antes de publicar o código novo**: `npm run db:migrate`, seguido de
   `npm run db:seed-permissions`. A ordem importa — uma migração que remove coluna deixa o código
   antigo quebrado, e código novo contra banco antigo também quebra. A janela entre as duas coisas
   deve ser curta. Nunca rode `db:seed` em produção.
4. `npm run build` e `npm run start` (ou deploy via Vercel, que já roda o build automaticamente).
5. Garanta HTTPS (obrigatório — os cookies de sessão são `secure` em produção, então HTTP puro
   quebra o login).
6. Gere um `AUTH_SECRET` novo e forte, exclusivo de produção (`openssl rand -base64 48`). Trocá-lo
   invalida todas as sessões abertas, o que é o comportamento esperado.

## 20. Funcionalidades futuras (arquitetura já preparada)

A estrutura de dados é genérica o suficiente para, no futuro, suportar sem redesenho: Pulse Survey
(pesquisas curtas mensais), eNPS/NPS interno (a pergunta "Recomendaria o Spot..." já existe e pode
virar métrica própria), pesquisas de onboarding/desligamento/satisfação, avaliações 90/180/360°, e
classificação de comentários por IA (a interface `ThemeClassifier` em `src/lib/themes.ts` já isola
esse ponto de extensão — hoje é por palavra-chave, amanhã pode chamar um modelo de linguagem sem
mudar o resto do sistema).

## 21. Limitações conhecidas deste MVP

- A matriz de prioridade usa a prioridade do plano como proxy de "impacto x resultado" (não busca o
  índice exato da dimensão relacionada) — simples e honesto, mas pode ser refinado.
- A reordenação de perguntas é feita por botões (↑/↓), não por arrastar-e-soltar.
- A classificação temática de comentários e a nuvem de palavras são baseadas em palavras-chave, não
  em IA (ver seção 20 sobre como estender).
- O catálogo de permissões granulares existe no banco e em `src/lib/permissions.ts`, mas ainda não é
  consultado por nenhuma rota — o controle de acesso hoje é por papel.
- O escopo do Gestor Líder usa exatamente os mesmos campos do Gestor (unidades, setores, turno). A
  diferença entre os dois perfis ainda é de configuração, não de funcionalidade.
- A avaliação de experiência grava a avaliação e o novo status do funcionário em dois comandos
  separados (sem transação). Se a conexão cair no meio, o funcionário pode ficar com a avaliação
  registrada e o status antigo — situação que hoje exige acerto direto no banco.
