# Avaliação do prompt revisar-mudancas

Não faz parte do prompt. Serve para medir de novo quando o SKILL.md mudar.

## Como rodar
Um subagente por versão, com a instrução: "leia o SKILL.md e execute-o com $ARGUMENTS = <lista>; não grave nenhum arquivo (descreva o AGENTS.md que gravaria), não rode `registrar` do Cérebro, não use subagentes". Depois compare as datas de modificação de `src/` e `tests/` com as de antes.

Os casos abaixo valem enquanto os bugs não forem corrigidos. Corrigido um bug, troque o caso por outro achado confirmado que não esteja no Cérebro.

## Treino
Args: `src/app/api/admin/questions/[id]/route.ts src/lib/trainingReport.ts src/app/api/admin/trainings/report/route.ts src/app/admin/reports/[id]/print/page.tsx src/app/api/admin/surveys/[id]/duplicate/route.ts src/app/api/gestor/employees/route.ts src/app/api/cron/feedback-reminders/route.ts`

| id | Esperado | Pontos |
|---|---|---|
| T1 | PATCH/DELETE de pergunta sem checar status da pesquisa | 1 |
| T2 | PATCH com `.partial()` pula a regra da escala | 0,5 |
| T3 | CSV sem neutralizar fórmula, ligado ao Treinador que cadastra o nome | 1 |
| T4 | página de impressão lê o banco sem `requireAdmin()` | 1 |
| T5 | duplicar pesquisa não copia `scaleMin`/`scaleMax` | 1 |

Armadilhas (−1 se Média ou acima): SQL injection no `ilike`; timing attack no `CRON_SECRET` como Alta; "rota sem autenticação" onde há `requireAdmin`/`requireGestor`.

## Reserva (holdout)
Args: `src/lib/push.ts src/lib/pushRoute.ts src/app/api/admin/audit-logs/route.ts src/lib/notificationInbox.ts src/app/api/auth/first-access/route.ts`

| id | Esperado | Pontos |
|---|---|---|
| H1 | dono da inscrição de push trocado pelo endpoint (ou o efeito: aparelho compartilhado recebendo avisos de outro) | 1 |
| H2 | `limit` NaN/negativo na auditoria (o Drizzle 0.33 omite o LIMIT) | 1 |
| H3 | `markInboxRead` sem Zod: `ids: []` marca todos como lidos | 1 |

Armadilhas (−1 se Média ou acima): SSRF no push (há allowlist); força bruta do código de primeiro acesso como Alta.

## Contrato (0–3)
`arquivo:linha` e cenário em todo achado · seções Precisa verificar / Verificado e limpo / Auditoria · PT-BR ordenado por severidade.

## Resultado em 2026-09-30/10-01

| Versão | Treino | Armadilhas | Contrato | Reserva | Tokens (treino) |
|---|---|---|---|---|---|
| A — só aponta para as 4 skills do plugin | 4,5/4,5 | 0 | 1,5/3 | não rodada | ~248 mil |
| B — prompt do projeto (vencedora) | 4,5/4,5 | 0 | 3/3 | 3/3 | ~227 mil (reserva ~165 mil) |
| C — B sem contexto do projeto e sem ameaças | 4,5/4,5 | 0 | 3/3 | 2,5/3 | ~245 mil (reserva ~171 mil) |

- A não tinha formato: relatório longo, achados repetidos em seções, sem ordem de severidade, AGENTS.md em inglês. Não viu o vazamento de anonimato do relatório impresso.
- B e C acharam esse vazamento pela nota do Cérebro: o passo de busca no Cérebro foi causal.
- B classificou o anonimato como Alta (C deu Média) e achou o efeito real do push compartilhado; a vantagem do contexto do projeto é pequena, mas positiva.
- Todas acharam bugs reais fora da lista (admissão do Treinador depois das 21h cai no dia seguinte; e-mail sem `.max()` no primeiro acesso; push sem `timeout`).
- Ajustes depois da avaliação, não medidos de novo: `--incremental false` no `tsc`, limite de 3 regras novas no AGENTS.md, `src/lib/disclosure.ts` no contexto.
