# Overrides por página

Um arquivo aqui só existe quando uma tela precisa **contrariar** o MASTER — não
para repetir o que já está lá.

- Nome do arquivo = nome da página (`gestor-home.md`, `survey.md`, `resultados.md`).
- Ao construir uma tela: leia `../MASTER.md`; se existir o arquivo desta página,
  as regras dele vencem no que conflitar. Sem arquivo, vale só o MASTER.
- Toda exceção precisa de justificativa escrita. "Ficou melhor assim" não é
  justificativa; "a tabela de comparação não cabe em 375px com `p-5`, então usa
  `p-3` e rola horizontalmente dentro do card" é.

Exceções previsíveis que provavelmente vão morar aqui:

| Página | Provável desvio |
|---|---|
| `/admin/results` | densidade maior que 6/10 — muitos dados por tela |
| `/survey` | tipografia maior e passos mais espaçados — leitura única, sem treino |
| `/admin/personalization` | precisa mostrar hex cru, já que é a tela que os edita |
