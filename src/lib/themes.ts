/**
 * Classificação temática de respostas abertas.
 *
 * Implementação atual: baseada em palavras-chave (determinística, sem custo,
 * sem enviar texto a serviços externos). A interface `ThemeClassifier` é o
 * ponto de extensão: para plugar uma classificação por IA no futuro, basta
 * implementar essa interface (ex.: chamando um modelo de linguagem) e trocar
 * `keywordThemeClassifier` por ela em `classifyComment` — nenhum outro
 * ponto do sistema precisa mudar.
 */

export const COMMENT_THEMES = [
  'Liderança',
  'Salário',
  'Benefícios',
  'Alimentação',
  'Escala',
  'Jornada',
  'Comunicação',
  'Estrutura',
  'Equipamentos',
  'Treinamento',
  'Desenvolvimento',
  'Reconhecimento',
  'Ambiente',
  'Relacionamento',
  'Segurança',
  'Inclusão',
  'Saúde e bem-estar',
  'Outros',
] as const;

export type CommentTheme = (typeof COMMENT_THEMES)[number];

const THEME_KEYWORDS: Record<Exclude<CommentTheme, 'Outros'>, string[]> = {
  'Liderança': ['lider', 'gestor', 'chefe', 'gerente', 'supervisor', 'coordenad'],
  'Salário': ['salario', 'remuneracao', 'pagamento', 'holerite', 'aumento salarial'],
  'Benefícios': ['beneficio', 'vale', 'plano de saude', 'plano de saúde', 'convenio'],
  'Alimentação': ['comida', 'alimentacao', 'refeicao', 'refeitorio', 'cardapio'],
  'Escala': ['escala', 'folga', 'turno', 'horario de trabalho', 'plantao'],
  'Jornada': ['jornada', 'hora extra', 'carga horaria', 'horas trabalhadas'],
  'Comunicação': ['comunicacao', 'informacao', 'aviso', 'comunicado', 'convenia'],
  'Estrutura': ['estrutura', 'instalacao', 'espaco fisico', 'loja', 'unidade'],
  'Equipamentos': ['equipamento', 'ferramenta', 'maquina', 'utensilio', 'material de trabalho'],
  'Treinamento': ['treinamento', 'capacitacao', 'curso', 'aprendizado'],
  'Desenvolvimento': ['desenvolvimento', 'carreira', 'crescimento', 'promocao', 'plano de carreira'],
  'Reconhecimento': ['reconhecimento', 'valorizacao', 'elogio', 'feedback positivo'],
  'Ambiente': ['ambiente', 'clima', 'clima organizacional', 'cultura'],
  'Relacionamento': ['relacionamento', 'colega', 'equipe', 'time', 'convivencia'],
  'Segurança': ['seguranca', 'acidente', 'risco', 'epi'],
  'Inclusão': ['inclusao', 'diversidade', 'discriminacao', 'preconceito', 'respeito'],
  'Saúde e bem-estar': ['saude', 'bem-estar', 'bem estar', 'estresse', 'cansaco', 'exaustao'],
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // remove acentos
}

export interface ThemeClassifier {
  classify(text: string): CommentTheme[];
}

export const keywordThemeClassifier: ThemeClassifier = {
  classify(text: string): CommentTheme[] {
    const normalized = normalize(text);
    const matches = (Object.keys(THEME_KEYWORDS) as Exclude<CommentTheme, 'Outros'>[]).filter((theme) =>
      THEME_KEYWORDS[theme].some((kw) => normalized.includes(normalize(kw)))
    );
    return matches.length > 0 ? matches : ['Outros'];
  },
};

export function classifyComment(text: string, classifier: ThemeClassifier = keywordThemeClassifier): CommentTheme[] {
  return classifier.classify(text);
}

export interface ThemeCount {
  theme: CommentTheme;
  count: number;
}

export function countByTheme(texts: string[], classifier: ThemeClassifier = keywordThemeClassifier): ThemeCount[] {
  const counts = new Map<CommentTheme, number>(COMMENT_THEMES.map((t) => [t, 0]));
  for (const text of texts) {
    const themes = classifier.classify(text);
    for (const theme of themes) {
      counts.set(theme, (counts.get(theme) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([theme, count]) => ({ theme, count }))
    .sort((a, b) => b.count - a.count);
}

/** Heurística simples de sentimento para separar elogios de reclamações/sugestões. */
const POSITIVE_HINTS = ['bom', 'boa', 'otimo', 'ótimo', 'gosto', 'adoro', 'excelente', 'satisfeit', 'feliz', 'grato', 'obrigad'];
const SUGGESTION_HINTS = ['poderia', 'sugiro', 'sugestao', 'seria bom', 'gostaria que', 'deveria', 'melhorar'];

export type CommentSentiment = 'elogio' | 'reclamacao' | 'sugestao';

export function classifySentiment(text: string): CommentSentiment {
  const normalized = normalize(text);
  if (SUGGESTION_HINTS.some((h) => normalized.includes(normalize(h)))) return 'sugestao';
  if (POSITIVE_HINTS.some((h) => normalized.includes(normalize(h)))) return 'elogio';
  return 'reclamacao';
}
