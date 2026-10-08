import { describe, it, expect } from 'vitest';
import { buildTrainingReport, buildTrainingsCsv, type TrainingRecordInput } from '../src/lib/trainingReport';

const rec = (over: Partial<TrainingRecordInput> = {}): TrainingRecordInput => ({
  id: 't1',
  trainingDate: '2026-09-20T00:00:00.000Z',
  result: 'APROVADO',
  needsReinforcement: false,
  employee: { id: 'e1', fullName: 'Ana' },
  trainingType: { id: 'ty1', name: 'Avaliações do Bar' },
  trainer: { id: 'tr1', name: 'André' },
  answers: [],
  ...over,
});

describe('buildTrainingReport', () => {
  it('conta resultados e reforços', () => {
    const r = buildTrainingReport([
      rec({ result: 'APROVADO' }),
      rec({ result: 'REPROVADO', needsReinforcement: true }),
      rec({ result: 'APROVADO_COM_RESSALVA', needsReinforcement: true }),
    ]);
    expect(r.total).toBe(3);
    expect(r.approved).toBe(1);
    expect(r.rejected).toBe(1);
    expect(r.approvedWithNote).toBe(1);
    expect(r.reinforcement).toBe(2);
  });

  it('a média do critério ignora "Não" — não é uma nota melhor que Bom', () => {
    const r = buildTrainingReport([
      rec({
        answers: [
          { rating: 'RUIM', criterion: { id: 'c1', label: 'Higiene' } },
          { rating: 'NAO', criterion: { id: 'c1', label: 'Higiene' } },
        ],
      }),
    ]);
    const higiene = r.weakestCriteria.find((c) => c.criterionId === 'c1')!;
    // Só a nota RUIM entra na média (1), o "Não" é contado à parte.
    expect(higiene.average).toBe(1);
    expect(higiene.naoCount).toBe(1);
    expect(higiene.answered).toBe(2);
  });

  it('critério só com "Não" fica sem média e vai para o fim da lista', () => {
    const r = buildTrainingReport([
      rec({
        answers: [
          { rating: 'NAO', criterion: { id: 'so-nao', label: 'Nunca observado' } },
          { rating: 'RUIM', criterion: { id: 'ruim', label: 'Fraco' } },
        ],
      }),
    ]);
    expect(r.weakestCriteria[0].criterionId).toBe('ruim');
    expect(r.weakestCriteria[1].average).toBeNull();
  });

  it('ordena os critérios do pior para o melhor', () => {
    const r = buildTrainingReport([
      rec({
        answers: [
          { rating: 'OTIMO', criterion: { id: 'bom', label: 'Simpatia' } },
          { rating: 'RUIM', criterion: { id: 'pior', label: 'Receitas' } },
          { rating: 'MEDIO', criterion: { id: 'meio', label: 'Organização' } },
        ],
      }),
    ]);
    expect(r.weakestCriteria.map((c) => c.criterionId)).toEqual(['pior', 'meio', 'bom']);
  });

  it('agrupa por tipo e por treinador', () => {
    const r = buildTrainingReport([
      rec({ trainingType: { id: 'bar', name: 'Bar' } }),
      rec({ trainingType: { id: 'bar', name: 'Bar' }, needsReinforcement: true }),
      rec({ trainingType: { id: 'novos', name: 'Novos' }, trainer: { id: 'tr2', name: 'Bia' } }),
    ]);
    expect(r.byType[0]).toMatchObject({ typeId: 'bar', total: 2, reinforcement: 1 });
    expect(r.byTrainer.find((t) => t.trainerId === 'tr1')?.total).toBe(2);
    expect(r.byTrainer.find((t) => t.trainerId === 'tr2')?.total).toBe(1);
  });

  it('lista quem acumula reforços, do maior para o menor', () => {
    const r = buildTrainingReport([
      rec({ employee: { id: 'e1', fullName: 'Ana' }, needsReinforcement: true }),
      rec({ employee: { id: 'e1', fullName: 'Ana' }, needsReinforcement: true }),
      rec({ employee: { id: 'e2', fullName: 'Bruno' }, needsReinforcement: true }),
      rec({ employee: { id: 'e3', fullName: 'Caio' }, needsReinforcement: false }),
    ]);
    expect(r.employeesNeedingReinforcement).toEqual([
      { employeeId: 'e1', fullName: 'Ana', count: 2 },
      { employeeId: 'e2', fullName: 'Bruno', count: 1 },
    ]);
  });

  it('não quebra com lista vazia', () => {
    const r = buildTrainingReport([]);
    expect(r.total).toBe(0);
    expect(r.weakestCriteria).toEqual([]);
  });
});

describe('buildTrainingsCsv', () => {
  it('gera cabeçalho e uma linha por treinamento', () => {
    const csv = buildTrainingsCsv([
      rec({ answers: [{ rating: 'BOM', criterion: { id: 'c1', label: 'Higiene' } }] }),
    ]);
    const linhas = csv.split('\n');
    expect(linhas[0]).toContain('Colaborador');
    expect(linhas[1]).toContain('Ana');
    expect(linhas[1]).toContain('Higiene: Bom');
  });

  it('escapa ponto e vírgula do texto para não quebrar a coluna', () => {
    const csv = buildTrainingsCsv([rec({ employee: { id: 'e1', fullName: 'Ana; Maria' } })]);
    expect(csv).toContain('"Ana; Maria"');
  });
});
