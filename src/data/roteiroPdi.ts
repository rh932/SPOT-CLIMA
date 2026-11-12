/**
 * Roteiro de feedback (PDI — Plano de Desenvolvimento Individual) das unidades
 * Paulista e JK. No feedback periódico dessas unidades ele substitui as 4
 * dimensões da ficha padrão (evaluationBank.ts). Conteúdo fixo em código,
 * extraído do documento "ROTEIRO FEEDBACK PAULISTA E JK".
 *
 * Cada item recebe uma nota na mesma escala da ficha padrão (Ótimo/Bom/
 * Regular/Ruim); as chaves abaixo são o que fica gravado em
 * performance_evaluations.roteiro.
 */
import type { RatingOption } from './evaluationBank';

export interface ItemRoteiro { key: string; text: string }
export interface GrupoRoteiro { nome?: string; itens: ItemRoteiro[] }
export interface PilarRoteiro { key: 'tecnica' | 'comportamental' | 'operacional'; nome: string; grupos: GrupoRoteiro[] }

export const PILARES_ROTEIRO: PilarRoteiro[] = [
  {
    key: 'tecnica',
    nome: 'Habilidade técnica',
    grupos: [{
      itens: [
        { key: 'tec_cardapio', text: 'Conhecimento do cardápio' },
        { key: 'tec_vendas', text: 'Técnicas de venda e estímulo de vendas' },
        { key: 'tec_bebidas', text: 'Domínio de bebidas (drinks e vinhos)' },
      ],
    }],
  },
  {
    key: 'comportamental',
    nome: 'Habilidade comportamental',
    grupos: [
      {
        nome: 'Interna (equipe)',
        itens: [
          { key: 'int_conflitos', text: 'Gestão de conflitos' },
          { key: 'int_emocional', text: 'Inteligência emocional' },
          { key: 'int_equilibrio', text: 'Equilíbrio comportamental' },
          { key: 'int_feedbacks', text: 'Aceitação de feedbacks e cobranças' },
        ],
      },
      {
        nome: 'Externa (cliente)',
        itens: [
          { key: 'ext_gentileza', text: 'Gentileza, educação e atenção' },
          { key: 'ext_agilidade', text: 'Agilidade no atendimento' },
          { key: 'ext_cultura', text: 'Compreensão da cultura de serviço da empresa' },
          { key: 'ext_hospitalidade', text: 'Prática de hospitalidade genuína (foco em proporcionar bem-estar ao cliente)' },
        ],
      },
    ],
  },
  {
    key: 'operacional',
    nome: 'Habilidade operacional',
    grupos: [{
      itens: [
        { key: 'op_organizacao', text: 'Organização do setor' },
        { key: 'op_erros', text: 'Redução de erros operacionais' },
        { key: 'op_limpeza', text: 'Limpeza e padronização' },
        { key: 'op_execucao', text: 'Execução correta do serviço (louças, entrega e retirada de mesas)' },
        { key: 'op_sequencia', text: 'Cumprimento da sequência de serviço' },
        { key: 'op_zelo', text: 'Zelo pelo ambiente de trabalho' },
      ],
    }],
  },
];

export const ITENS_ROTEIRO: ItemRoteiro[] = PILARES_ROTEIRO.flatMap((p) => p.grupos.flatMap((g) => g.itens));
export const CHAVES_ROTEIRO: string[] = ITENS_ROTEIRO.map((i) => i.key);

export const OBJETIVO_PROFISSIONAL =
  'Desenvolver o colaborador para atingir excelência no atendimento, com alto padrão técnico, comportamental e operacional.';

export const COMPETENCIAS_ROTEIRO: { key: string; text: string; grupo: 'Técnicas' | 'Comportamentais' }[] = [
  { key: 'cardapio', text: 'Conhecimento aprofundado do cardápio', grupo: 'Técnicas' },
  { key: 'drinks_vinhos', text: 'Domínio de drinks e vinhos (nível básico de sommelier)', grupo: 'Técnicas' },
  { key: 'lideranca', text: 'Liderança', grupo: 'Comportamentais' },
  { key: 'emocional', text: 'Inteligência emocional', grupo: 'Comportamentais' },
  { key: 'comunicacao', text: 'Comunicação assertiva', grupo: 'Comportamentais' },
];
export const CHAVES_COMPETENCIAS: string[] = COMPETENCIAS_ROTEIRO.map((c) => c.key);

/** Metodologia 70/20/10: o que o roteiro sugere em cada parte, como apoio para o gestor preencher. */
export const PLANO_70_20_10 = [
  { key: 'pratica', titulo: '70% · Prática (on the job)', dicas: 'Aplicação diária dos aprendizados; foco em melhoria contínua no atendimento.' },
  { key: 'mentoria', titulo: '20% · Mentoria', dicas: 'Acompanhamento com o gestor; desenvolvimento comportamental; apoio na resolução de conflitos.' },
  { key: 'estudo', titulo: '10% · Estudo', dicas: 'Materiais fornecidos pela empresa; aulas de vinho e bar; leitura recomendada: A Arte de Servir.' },
] as const;

/** Revisão do PDI: 3 meses depois do feedback. */
export const REVISAO_PDI_MESES = 3;

export type NotasRoteiro = Record<string, RatingOption>;

export interface PlanoRoteiro {
  competencias: string[];
  pratica: string;
  mentoria: string;
  estudo: string;
}

/** O que fica gravado em performance_evaluations.roteiro. */
export interface RoteiroGravado {
  versao: 1;
  notas: NotasRoteiro;
  plano: PlanoRoteiro;
  /** Observação opcional por pilar. */
  observacoes?: Partial<Record<PilarRoteiro['key'], string>>;
}

/** Unidades que usam o roteiro no lugar da ficha padrão do feedback. */
export function unidadeUsaRoteiroPdi(nomeDaUnidade: string | null | undefined): boolean {
  const n = (nomeDaUnidade ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
  return n === 'PAULISTA' || n === 'JK';
}

/** Dia da revisão do PDI: `meses` depois da data do feedback (AAAA-MM-DD → AAAA-MM-DD). */
export function dataRevisaoPdi(isoDia: string, meses = REVISAO_PDI_MESES): string {
  const [a, m, d] = isoDia.slice(0, 10).split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

const PONTOS: Record<RatingOption, number> = { OTIMO: 4, BOM: 3, REGULAR: 2, RUIM: 1 };
const DE_PONTOS: RatingOption[] = ['RUIM', 'RUIM', 'REGULAR', 'BOM', 'OTIMO'];

/** Nota do pilar: média arredondada das notas dos itens dele (null se nenhum item tem nota). */
export function notaDoPilar(notas: NotasRoteiro | null | undefined, pilar: PilarRoteiro): RatingOption | null {
  const valores = pilar.grupos
    .flatMap((g) => g.itens)
    .map((i) => notas?.[i.key])
    .filter((n): n is RatingOption => Boolean(n))
    .map((n) => PONTOS[n]);
  if (valores.length === 0) return null;
  return DE_PONTOS[Math.round(valores.reduce((a, b) => a + b, 0) / valores.length)];
}
