import { describe, it, expect } from 'vitest';
import {
  CHAVES_ROTEIRO, PILARES_ROTEIRO, unidadeUsaRoteiroPdi, dataRevisaoPdi, notaDoPilar,
} from '../src/data/roteiroPdi';
import { evaluationSubmissionSchema } from '../src/lib/validation';

const base = {
  evaluationDate: '2026-11-05T12:00:00.000Z',
  dueDateAtEvaluation: '2026-11-05T12:00:00.000Z',
  favorableAspects: 'Bom atendimento',
  unfavorableAspects: 'Chega atrasado',
  classification: 'OTIMAS_PERSPECTIVAS',
};
const notas = () => Object.fromEntries(CHAVES_ROTEIRO.map((k) => [k, 'BOM']));
const roteiro = () => ({ versao: 1, notas: notas(), plano: { competencias: ['cardapio'], pratica: 'a', mentoria: 'b', estudo: 'c' } });
const dims = {
  flexibilityRating: 'BOM', flexibilitySubAnswers: { q1: 'SIM', q2: 'SIM', q3: 'SIM', q4: 'SIM' },
  interestRating: 'BOM', interestSubAnswers: { q1: 'SIM', q2: 'SIM', q3: 'SIM' },
  relationshipRating: 'BOM', relationshipSubAnswers: { q1: 'SIM', q2: 'SIM' },
  learningRating: 'BOM', learningSubAnswers: { q1: 'SIM', q2: 'SIM' },
};

describe('unidadeUsaRoteiroPdi', () => {
  it('vale para Paulista e JK, sem depender de caixa ou acento', () => {
    expect(unidadeUsaRoteiroPdi('PAULISTA')).toBe(true);
    expect(unidadeUsaRoteiroPdi(' jk ')).toBe(true);
    expect(unidadeUsaRoteiroPdi('Paulísta')).toBe(true);
  });
  it('não vale para outras unidades nem para vazio', () => {
    expect(unidadeUsaRoteiroPdi('Moema')).toBe(false);
    expect(unidadeUsaRoteiroPdi(null)).toBe(false);
  });
});

describe('dataRevisaoPdi', () => {
  it('soma 3 meses', () => expect(dataRevisaoPdi('2026-04-01')).toBe('2026-07-01'));
  it('não passa do fim do mês', () => expect(dataRevisaoPdi('2026-11-30')).toBe('2027-02-28'));
  it('vira o ano', () => expect(dataRevisaoPdi('2026-12-15')).toBe('2027-03-15'));
});

describe('notaDoPilar', () => {
  it('é a média arredondada dos itens', () => {
    const p = PILARES_ROTEIRO[0];
    const n = { tec_cardapio: 'OTIMO', tec_vendas: 'OTIMO', tec_bebidas: 'REGULAR' } as const;
    expect(notaDoPilar(n, p)).toBe('BOM');
  });
  it('é nula sem nenhuma nota', () => expect(notaDoPilar({}, PILARES_ROTEIRO[0])).toBeNull());
});

describe('evaluationSubmissionSchema com roteiro', () => {
  it('aceita o roteiro completo, sem as 4 dimensões', () => {
    expect(evaluationSubmissionSchema.safeParse({ ...base, roteiro: roteiro() }).success).toBe(true);
  });
  it('recusa roteiro com item sem nota', () => {
    const r = roteiro(); delete (r.notas as Record<string, string>).tec_cardapio;
    expect(evaluationSubmissionSchema.safeParse({ ...base, roteiro: r }).success).toBe(false);
  });
  it('recusa roteiro com chave que não existe', () => {
    const r = roteiro(); (r.notas as Record<string, string>).inventado = 'BOM';
    expect(evaluationSubmissionSchema.safeParse({ ...base, roteiro: r }).success).toBe(false);
  });
  it('recusa competência desconhecida', () => {
    const r = roteiro(); r.plano.competencias = ['xyz'];
    expect(evaluationSubmissionSchema.safeParse({ ...base, roteiro: r }).success).toBe(false);
  });
  it('recusa misturar roteiro com dimensões', () => {
    expect(evaluationSubmissionSchema.safeParse({ ...base, ...dims, roteiro: roteiro() }).success).toBe(false);
  });
  it('sem roteiro continua exigindo as 4 dimensões completas', () => {
    expect(evaluationSubmissionSchema.safeParse({ ...base, ...dims }).success).toBe(true);
    expect(evaluationSubmissionSchema.safeParse(base).success).toBe(false);
    expect(evaluationSubmissionSchema.safeParse({ ...base, ...dims, interestSubAnswers: { q1: 'SIM' } }).success).toBe(false);
  });
});
