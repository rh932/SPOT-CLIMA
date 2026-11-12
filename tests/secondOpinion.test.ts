import { describe, it, expect } from 'vitest';
import { secondOpinionFor, SEGUNDA_RESPOSTA_DIAS, type EvaluationForSecondOpinion } from '../src/lib/secondOpinion';
import { statusFromEvaluations } from '../src/lib/termination';

const A = 'gestor-a';
const B = 'gestor-b';
const ev = (p: Partial<EvaluationForSecondOpinion>): EvaluationForSecondOpinion => ({
  period: 'FIRST', evaluatorAdminId: A, evaluationDate: '2026-09-10T12:00:00.000Z', conclusion: 'EXTENDER', ...p,
});
const hoje = new Date('2026-09-20T15:00:00.000Z');

describe('secondOpinionFor', () => {
  it('abre o período que o outro gestor acabou de avaliar, mesmo com a situação já no 2º', () => {
    const r = secondOpinionFor({}, [ev({})], B, hoje);
    expect(r?.period).toBe('FIRST');
    expect(r?.until.toISOString().slice(0, 10)).toBe('2026-10-10');
  });

  it('fecha para quem já respondeu o período', () => {
    expect(secondOpinionFor({}, [ev({})], A, hoje)).toBeNull();
    expect(secondOpinionFor({}, [ev({}), ev({ evaluatorAdminId: B })], B, hoje)).toBeNull();
  });

  it('com o 2º período avaliado, a segunda resposta passa a ser do 2º', () => {
    const r = secondOpinionFor({}, [ev({ evaluatorAdminId: B }), ev({ period: 'SECOND', evaluationDate: '2026-09-15T12:00:00Z', conclusion: 'EFETIVAR' })], B, hoje);
    expect(r?.period).toBe('SECOND');
  });

  it(`vale até ${SEGUNDA_RESPOSTA_DIAS} dias depois da primeira resposta, contando o dia em São Paulo`, () => {
    expect(secondOpinionFor({}, [ev({})], B, new Date('2026-10-11T02:00:00.000Z'))).not.toBeNull(); // 23h de 10/10
    expect(secondOpinionFor({}, [ev({})], B, new Date('2026-10-11T12:00:00.000Z'))).toBeNull();
  });

  it('fecha com desligamento registrado pelo RH, aprendiz, feedback iniciado ou sem avaliação', () => {
    expect(secondOpinionFor({ terminationDate: '2026-09-12T12:00:00Z' }, [ev({ conclusion: 'DEMITIR' })], B, hoje)).toBeNull();
    expect(secondOpinionFor({ isApprentice: true }, [ev({})], B, hoje)).toBeNull();
    expect(secondOpinionFor({}, [ev({ period: 'SECOND' }), ev({ period: 'FEEDBACK', conclusion: null })], B, hoje)).toBeNull();
    expect(secondOpinionFor({}, [], B, hoje)).toBeNull();
  });

  it('desligado pela conclusão do gestor (sem registro do RH) ainda recebe a segunda resposta', () => {
    expect(secondOpinionFor({ terminationDate: null }, [ev({ conclusion: 'DEMITIR' })], B, hoje)?.period).toBe('FIRST');
  });
});

describe('situação depois da segunda resposta', () => {
  it('segue a avaliação com a data mais recente; no empate, a que entrou por último', () => {
    const primeira = ev({ conclusion: 'EFETIVAR' });
    expect(statusFromEvaluations([primeira, ev({ evaluatorAdminId: B, evaluationDate: '2026-09-12T12:00:00Z', conclusion: 'EXTENDER' })])).toBe('AWAITING_PERIOD_2');
    expect(statusFromEvaluations([primeira, ev({ evaluatorAdminId: B, evaluationDate: '2026-09-08T12:00:00Z', conclusion: 'DEMITIR' })])).toBe('HIRED');
    expect(statusFromEvaluations([primeira, ev({ evaluatorAdminId: B, conclusion: 'DEMITIR' })])).toBe('TERMINATED');
  });
});
