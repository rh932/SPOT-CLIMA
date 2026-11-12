import { describe, it, expect } from 'vitest';
import {
  applyAction, canEditQuestion, statusAfterEdit, liveQuestions, validateCustomAnswers, answerLabel, formForPeriod,
} from '../src/lib/questionnaire';
import { hasPermission } from '../src/lib/permissions';
import { canEvaluate } from '../src/lib/scope';

const pj = { isReviewer: false };
const rh = { isReviewer: true };

describe('ciclo de vida da pergunta', () => {
  it('o PJ envia o rascunho e a reprovada; só o RH aprova e reprova', () => {
    expect(applyAction('RASCUNHO', 'SUBMIT', pj)).toEqual({ ok: true, to: 'EM_ANALISE' });
    expect(applyAction('REPROVADA', 'SUBMIT', pj)).toEqual({ ok: true, to: 'EM_ANALISE' });
    expect(applyAction('EM_ANALISE', 'APPROVE', pj)).toMatchObject({ ok: false });
    expect(applyAction('EM_ANALISE', 'REJECT', pj)).toMatchObject({ ok: false });
    expect(applyAction('EM_ANALISE', 'APPROVE', rh)).toEqual({ ok: true, to: 'APROVADA' });
    expect(applyAction('EM_ANALISE', 'REJECT', rh)).toEqual({ ok: true, to: 'REPROVADA' });
  });

  it('ninguém pula a análise: rascunho não vai direto para aprovada', () => {
    expect(applyAction('RASCUNHO', 'APPROVE', pj)).toMatchObject({ ok: false });
    expect(applyAction('RASCUNHO', 'APPROVE', rh)).toMatchObject({ ok: false });
  });

  it('o PJ retira da análise, mas não arquiva o que já foi ao RH ou ao ar', () => {
    expect(applyAction('EM_ANALISE', 'WITHDRAW', pj)).toEqual({ ok: true, to: 'RASCUNHO' });
    expect(applyAction('EM_ANALISE', 'ARCHIVE', pj)).toMatchObject({ ok: false });
    expect(applyAction('APROVADA', 'ARCHIVE', pj)).toMatchObject({ ok: false });
    expect(applyAction('APROVADA', 'ARCHIVE', rh)).toEqual({ ok: true, to: 'ARQUIVADA' });
    expect(applyAction('RASCUNHO', 'ARCHIVE', pj)).toEqual({ ok: true, to: 'ARQUIVADA' });
  });

  it('arquivada não aceita mais nada', () => {
    for (const a of ['SUBMIT', 'WITHDRAW', 'APPROVE', 'REJECT', 'ARCHIVE'] as const) {
      expect(applyAction('ARQUIVADA', a, rh)).toMatchObject({ ok: false });
    }
  });

  it('editar uma aprovada volta para o RH quando quem edita é o PJ; o RH edita sem perder a aprovação', () => {
    expect(statusAfterEdit('APROVADA', true, pj)).toBe('EM_ANALISE');
    expect(statusAfterEdit('APROVADA', true, rh)).toBe('APROVADA');
    expect(statusAfterEdit('APROVADA', false, pj)).toBe('APROVADA');
    expect(statusAfterEdit('REPROVADA', true, pj)).toBe('RASCUNHO');
  });

  it('o PJ não edita o que está na mesa do RH nem o que foi arquivado', () => {
    expect(canEditQuestion('EM_ANALISE', pj)).toBe(false);
    expect(canEditQuestion('EM_ANALISE', rh)).toBe(true);
    expect(canEditQuestion('RASCUNHO', pj)).toBe(true);
    expect(canEditQuestion('ARQUIVADA', rh)).toBe(false);
  });

  it('só as aprovadas chegam a quem avalia, na ordem', () => {
    const qs = [
      { id: 'a', status: 'APROVADA' as const, order: 2 },
      { id: 'b', status: 'EM_ANALISE' as const, order: 0 },
      { id: 'c', status: 'APROVADA' as const, order: 1 },
      { id: 'd', status: 'RASCUNHO' as const, order: 3 },
    ];
    expect(liveQuestions(qs).map((q) => q.id)).toEqual(['c', 'a']);
  });
});

describe('respostas das perguntas extras', () => {
  const qs = [
    { id: 'n', text: 'Postura na praça', type: 'NOTA' as const, required: true },
    { id: 's', text: 'Usa o crachá?', type: 'SIM_NAO' as const, required: true },
    { id: 't', text: 'Observação', type: 'TEXTO' as const, required: false },
  ];

  it('grava o texto da pergunta junto com a resposta', () => {
    const r = validateCustomAnswers(qs, { n: 'BOM', s: 'SIM', t: ' ok ' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.answered).toEqual([
        { id: 'n', text: 'Postura na praça', type: 'NOTA', required: true, value: 'BOM' },
        { id: 's', text: 'Usa o crachá?', type: 'SIM_NAO', required: true, value: 'SIM' },
        { id: 't', text: 'Observação', type: 'TEXTO', required: false, value: 'ok' },
      ]);
    }
  });

  it('exige as obrigatórias e deixa passar a opcional em branco', () => {
    expect(validateCustomAnswers(qs, { n: 'BOM' })).toMatchObject({ ok: false, missingIds: ['s'] });
    expect(validateCustomAnswers(qs, { n: 'RUIM', s: 'NAO' }).ok).toBe(true);
  });

  it('recusa valor fora das opções e resposta de pergunta que não está no ar', () => {
    expect(validateCustomAnswers(qs, { n: 'MARAVILHA', s: 'SIM' })).toMatchObject({ ok: false, missingIds: ['n'] });
    expect(validateCustomAnswers(qs, { n: 'BOM', s: 'SIM', x: 'intruso' })).toMatchObject({ ok: false });
  });

  it('sem perguntas extras, nada a responder', () => {
    expect(validateCustomAnswers([], undefined)).toEqual({ ok: true, answered: [] });
  });

  it('rótulos legíveis para a ficha', () => {
    expect(answerLabel({ type: 'NOTA', value: 'OTIMO' })).toBe('Ótimo');
    expect(answerLabel({ type: 'SIM_NAO', value: 'NAO' })).toBe('Não');
    expect(answerLabel({ type: 'TEXTO', value: 'livre' })).toBe('livre');
    expect(answerLabel({ type: 'TEXTO', value: '' })).toBe('—');
  });

  it('experiência é o formulário de desempenho; o ciclo permanente é feedback', () => {
    expect(formForPeriod('FIRST')).toBe('DESEMPENHO');
    expect(formForPeriod('SECOND')).toBe('DESEMPENHO');
    expect(formForPeriod('FEEDBACK')).toBe('FEEDBACK');
  });
});

describe('perfil PJ', () => {
  it('cria perguntas, mas só o RH revisa', () => {
    expect(hasPermission('PJ', 'questionnaires.manage')).toBe(true);
    expect(hasPermission('PJ', 'questionnaires.review')).toBe(false);
    expect(hasPermission('RH', 'questionnaires.review')).toBe(true);
    expect(hasPermission('SUPER_ADMIN', 'questionnaires.review')).toBe(true);
  });

  it('os demais perfis da operação não criam perguntas', () => {
    for (const role of ['GESTOR', 'GESTOR_LIDER', 'GERENTE', 'GERENTE_AVALIADOR', 'TREINADOR', 'GERENTE_TREINADOR']) {
      expect(hasPermission(role, 'questionnaires.manage')).toBe(false);
      expect(hasPermission(role, 'questionnaires.review')).toBe(false);
    }
  });

  it('o PJ avalia e acompanha a área, sem mexer em usuários e configurações', () => {
    expect(canEvaluate('PJ')).toBe(true);
    expect(hasPermission('PJ', 'evaluations.create')).toBe(true);
    expect(hasPermission('PJ', 'reports.view')).toBe(true);
    expect(hasPermission('PJ', 'settings.manage')).toBe(false);
    expect(hasPermission('PJ', 'users.manage')).toBe(false);
  });
});
