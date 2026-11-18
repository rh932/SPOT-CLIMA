-- Feedback vermelho: o intervalo certo é 30 dias, e não 45 (os 45 dias são da
-- avaliação de experiência). Corrige só as DATAS PREVISTAS que o prazo errado
-- gerou: nenhuma resposta, observação, classificação ou data de realização é
-- alterada, e nenhum registro é criado ou apagado.
--
-- Só mexe no que bate exatamente com a regra antiga (45 dias contados da
-- avaliação ou da mudança de cor que gerou a data). Quem já foi agendado com
-- 30 dias, ou teve a data ajustada à mão, fica como está — por isso rodar de
-- novo depois do deploy não desloca ninguém duas vezes.

-- 1) Próxima data de cada colaborador hoje classificado como vermelho.
UPDATE "probationary_employees" AS e
SET "next_feedback_due_date" = e."next_feedback_due_date" - INTERVAL '15 days',
    "updated_at" = now()
WHERE e."current_color" = 'VERMELHO'
  AND e."status" <> 'TERMINATED'
  AND e."next_feedback_due_date" IS NOT NULL
  AND (
    EXISTS (
      SELECT 1 FROM "performance_evaluations" pe
      WHERE pe."employee_id" = e."id"
        AND pe."color" = 'VERMELHO'
        AND pe."next_due_date" IS NOT NULL
        AND pe."evaluation_date" = (
          SELECT max(p2."evaluation_date") FROM "performance_evaluations" p2 WHERE p2."employee_id" = e."id"
        )
        AND (e."next_feedback_due_date"::date - pe."evaluation_date"::date) = 45
    )
    OR EXISTS (
      SELECT 1 FROM "employee_color_changes" cc
      WHERE cc."employee_id" = e."id"
        AND cc."new_color" = 'VERMELHO'
        AND cc."created_at" = (
          SELECT max(c2."created_at") FROM "employee_color_changes" c2 WHERE c2."employee_id" = e."id"
        )
        AND (e."next_feedback_due_date"::date - cc."created_at"::date) = 45
    )
  );
--> statement-breakpoint

-- 2) A "próxima data" gravada na avaliação vermelha mais recente de cada
--    colaborador ativo (é a previsão daquele dia, não uma resposta).
UPDATE "performance_evaluations" AS pe
SET "next_due_date" = pe."next_due_date" - INTERVAL '15 days'
WHERE pe."color" = 'VERMELHO'
  AND pe."next_due_date" IS NOT NULL
  AND (pe."next_due_date"::date - pe."evaluation_date"::date) = 45
  AND pe."evaluation_date" = (
    SELECT max(p2."evaluation_date") FROM "performance_evaluations" p2
    WHERE p2."employee_id" = pe."employee_id" AND p2."color" IS NOT NULL
  )
  AND EXISTS (
    SELECT 1 FROM "probationary_employees" e
    WHERE e."id" = pe."employee_id" AND e."status" <> 'TERMINATED' AND e."current_color" = 'VERMELHO'
  );
--> statement-breakpoint

-- 3) A previsão guardada na troca de cor mais recente (mesma regra).
UPDATE "employee_color_changes" AS cc
SET "next_due_date" = cc."next_due_date" - INTERVAL '15 days'
WHERE cc."new_color" = 'VERMELHO'
  AND (cc."next_due_date"::date - cc."created_at"::date) = 45
  AND cc."created_at" = (
    SELECT max(c2."created_at") FROM "employee_color_changes" c2 WHERE c2."employee_id" = cc."employee_id"
  )
  AND EXISTS (
    SELECT 1 FROM "probationary_employees" e
    WHERE e."id" = cc."employee_id" AND e."status" <> 'TERMINATED' AND e."current_color" = 'VERMELHO'
  );
