/**
 * Acesso a dados das perguntas extras dos questionários — compartilhado pelas rotas
 * do portal do PJ (/api/gestor/questionnaires) e do painel do RH
 * (/api/admin/questionnaires). As regras de negócio ficam em lib/questionnaire.ts;
 * aqui só entram banco, escopo e auditoria.
 */

import type { NextRequest } from 'next/server';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { ApiError } from '@/lib/apiAuth';
import { logAudit } from '@/lib/audit';
import {
  applyAction, canEditQuestion, statusAfterEdit, liveQuestions,
  type QuestionAction, type QuestionForm, type QuestionType, type QuestionStatus,
} from '@/lib/questionnaire';

export interface Actor {
  adminId: string;
  role: string;
  /** Quem decide (RH/Super Admin). */
  isReviewer: boolean;
  /** Setores que o ator pode mexer; null = todos (RH). */
  sectorIds: string[] | null;
}

const podeNoSetor = (actor: Actor, sectorId: string) => actor.sectorIds === null || actor.sectorIds.includes(sectorId);

export async function listQuestions(actor: Actor, filter: { sectorId?: string; form?: QuestionForm; status?: QuestionStatus }) {
  if (actor.sectorIds !== null && actor.sectorIds.length === 0) return [];
  if (filter.sectorId && !podeNoSetor(actor, filter.sectorId)) throw new ApiError(403, 'Este setor não está no seu escopo.');
  const where = and(
    actor.sectorIds !== null ? inArray(schema.questionnaireQuestions.sectorId, actor.sectorIds) : undefined,
    filter.sectorId ? eq(schema.questionnaireQuestions.sectorId, filter.sectorId) : undefined,
    filter.form ? eq(schema.questionnaireQuestions.form, filter.form) : undefined,
    filter.status ? eq(schema.questionnaireQuestions.status, filter.status) : undefined,
  );
  return db.query.questionnaireQuestions.findMany({
    where,
    orderBy: [asc(schema.questionnaireQuestions.order), asc(schema.questionnaireQuestions.createdAt)],
    with: {
      sector: { columns: { id: true, name: true } },
      createdBy: { columns: { name: true } },
      reviewedBy: { columns: { name: true } },
    },
  });
}

export async function createQuestion(
  actor: Actor,
  input: { sectorId: string; form: QuestionForm; text: string; type: QuestionType; required?: boolean },
  req?: NextRequest,
) {
  if (!podeNoSetor(actor, input.sectorId)) throw new ApiError(403, 'Este setor não está no seu escopo.');
  const setor = await db.query.sectors.findFirst({ where: eq(schema.sectors.id, input.sectorId), columns: { id: true, name: true, active: true } });
  if (!setor || !setor.active) throw new ApiError(404, 'Setor não encontrado.');

  const existentes = await db.query.questionnaireQuestions.findMany({
    where: and(
      eq(schema.questionnaireQuestions.sectorId, input.sectorId),
      eq(schema.questionnaireQuestions.form, input.form),
      ne(schema.questionnaireQuestions.status, 'ARQUIVADA'),
    ),
    columns: { order: true, text: true },
  });
  if (existentes.length >= 30) throw new ApiError(409, 'Este formulário já tem 30 perguntas extras. Arquive alguma antes de criar outra.');
  const mesmoTexto = existentes.some((q) => q.text.trim().toLowerCase() === input.text.trim().toLowerCase());
  if (mesmoTexto) throw new ApiError(409, 'Já existe uma pergunta igual neste formulário.');

  // O RH escreve e já aprova (o controle é dele); a do PJ nasce como rascunho.
  const aprovada = actor.isReviewer;
  const [row] = await db.insert(schema.questionnaireQuestions).values({
    sectorId: input.sectorId,
    form: input.form,
    text: input.text.trim(),
    type: input.type,
    required: input.required ?? true,
    order: Math.max(-1, ...existentes.map((q) => q.order)) + 1,
    status: aprovada ? 'APROVADA' : 'RASCUNHO',
    createdById: actor.adminId,
    reviewedById: aprovada ? actor.adminId : null,
    reviewedAt: aprovada ? new Date() : null,
  }).returning();

  await logAudit({
    adminId: actor.adminId, action: 'questionnaire.create', entityType: 'QuestionnaireQuestion', entityId: row.id,
    metadata: { setor: setor.name, formulario: input.form, tipo: input.type, status: row.status }, req,
  });
  return row;
}

async function carregar(actor: Actor, id: string) {
  const q = await db.query.questionnaireQuestions.findFirst({
    where: eq(schema.questionnaireQuestions.id, id),
    with: { sector: { columns: { name: true } } },
  });
  if (!q) throw new ApiError(404, 'Pergunta não encontrada.');
  if (!podeNoSetor(actor, q.sectorId)) throw new ApiError(403, 'Este setor não está no seu escopo.');
  return q;
}

export async function updateQuestion(
  actor: Actor, id: string,
  patch: { text?: string; type?: QuestionType; required?: boolean; order?: number },
  req?: NextRequest,
) {
  const q = await carregar(actor, id);
  if (!canEditQuestion(q.status, actor)) {
    throw new ApiError(409, q.status === 'ARQUIVADA' ? 'Pergunta arquivada não pode ser editada.' : 'A pergunta está com o RH. Retire-a da análise para editar.');
  }
  const mudouConteudo = (patch.text !== undefined && patch.text.trim() !== q.text)
    || (patch.type !== undefined && patch.type !== q.type)
    || (patch.required !== undefined && patch.required !== q.required);
  const status = statusAfterEdit(q.status, mudouConteudo, actor);

  const [row] = await db.update(schema.questionnaireQuestions).set({
    ...(patch.text !== undefined ? { text: patch.text.trim() } : {}),
    ...(patch.type !== undefined ? { type: patch.type } : {}),
    ...(patch.required !== undefined ? { required: patch.required } : {}),
    ...(patch.order !== undefined ? { order: patch.order } : {}),
    status,
    ...(status !== q.status ? { reviewedById: null, reviewedAt: null, reviewNote: null } : {}),
    updatedAt: new Date(),
  }).where(eq(schema.questionnaireQuestions.id, id)).returning();

  await logAudit({
    adminId: actor.adminId, action: 'questionnaire.update', entityType: 'QuestionnaireQuestion', entityId: id,
    metadata: {
      setor: q.sector?.name, de: q.status, para: status,
      // O texto antigo fica no log: o RH precisa ver o que mudou, não só que mudou.
      ...(patch.text !== undefined && patch.text.trim() !== q.text ? { textoAnterior: q.text, textoNovo: patch.text.trim() } : {}),
    },
    req,
  });
  return row;
}

export async function actOnQuestion(actor: Actor, id: string, action: QuestionAction, note: string | undefined, req?: NextRequest) {
  const q = await carregar(actor, id);
  const res = applyAction(q.status, action, actor);
  if (!res.ok) throw new ApiError(res.error.startsWith('Só o RH') ? 403 : 409, res.error);
  if (action === 'REJECT' && !note?.trim()) throw new ApiError(400, 'Escreva o motivo: é o recado que o PJ vai ler.');

  const decisao = action === 'APPROVE' || action === 'REJECT' || (action === 'ARCHIVE' && actor.isReviewer);
  const [row] = await db.update(schema.questionnaireQuestions).set({
    status: res.to,
    ...(decisao ? { reviewedById: actor.adminId, reviewedAt: new Date(), reviewNote: note?.trim() || null } : {}),
    ...(action === 'SUBMIT' || action === 'WITHDRAW' ? { reviewedById: null, reviewedAt: null, reviewNote: null } : {}),
    updatedAt: new Date(),
  }).where(eq(schema.questionnaireQuestions.id, id)).returning();

  await logAudit({
    adminId: actor.adminId, action: `questionnaire.${action.toLowerCase()}`, entityType: 'QuestionnaireQuestion', entityId: id,
    metadata: { setor: q.sector?.name, de: q.status, para: res.to, ...(note?.trim() ? { recado: note.trim() } : {}) }, req,
  });
  return row;
}

/** Perguntas no ar de um setor, por formulário — é o que a tela de avaliar mostra e a rota confere. */
export async function liveQuestionsFor(sectorId: string) {
  const rows = await db.query.questionnaireQuestions.findMany({
    where: and(eq(schema.questionnaireQuestions.sectorId, sectorId), eq(schema.questionnaireQuestions.status, 'APROVADA')),
    columns: { id: true, form: true, text: true, type: true, required: true, order: true, status: true, createdAt: true },
  });
  const live = liveQuestions(rows);
  return {
    DESEMPENHO: live.filter((q) => q.form === 'DESEMPENHO').map(({ id, text, type, required }) => ({ id, text, type, required })),
    FEEDBACK: live.filter((q) => q.form === 'FEEDBACK').map(({ id, text, type, required }) => ({ id, text, type, required })),
  };
}
