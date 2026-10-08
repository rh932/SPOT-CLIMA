import ExcelJS from 'exceljs';
import type { QuestionType } from '@/data/surveyBank';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { eq } from 'drizzle-orm';

/** Busca uma dimensão pelo nome ou cria se não existir (mesmo padrão usado em seed-questions/route.ts). */
export async function findOrCreateDimension(name: string): Promise<typeof schema.dimensions.$inferSelect> {
  const [existing] = await db.select().from(schema.dimensions).where(eq(schema.dimensions.name, name));
  if (existing) return existing;
  const [created] = await db.insert(schema.dimensions).values({ name }).returning();
  return created;
}

export interface ParsedQuestionRow {
  row: number;
  categoria?: string;
  text: string;
  type: QuestionType;
  required: boolean;
  options?: string[];
}

export interface ImportRowError {
  row: number;
  errors: string[];
}

export interface ImportParseResult {
  rows: ParsedQuestionRow[];
  errors: ImportRowError[];
}

// Mapeia o texto em PT-BR digitado na planilha (coluna "Tipo de resposta")
// para o enum interno. Ver também src/lib/exportQuestionsTemplate.ts (aba
// "Tipos válidos" do modelo baixável, que lista exatamente estes valores).
const TYPE_MAP: Record<string, QuestionType> = {
  'escala 1 a 5': 'LIKERT',
  likert: 'LIKERT',
  'escala 1 a 10': 'SCALE',
  'sim/não': 'YES_NO',
  'sim/nao': 'YES_NO',
  objetiva: 'SINGLE_CHOICE',
  'escolha única': 'SINGLE_CHOICE',
  'escolha unica': 'SINGLE_CHOICE',
  'múltipla escolha': 'MULTIPLE_CHOICE',
  'multipla escolha': 'MULTIPLE_CHOICE',
  'dissertativa curta': 'SHORT_TEXT',
  'texto curto': 'SHORT_TEXT',
  dissertativa: 'LONG_TEXT',
  'texto longo': 'LONG_TEXT',
};

function cellText(row: ExcelJS.Row, col: number): string {
  const value = row.getCell(col).value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && 'text' in (value as object)) {
    return String((value as { text: unknown }).text ?? '').trim();
  }
  return String(value).trim();
}

// Nota sobre "Categoria": no contexto da planilha, essa coluna representa o
// agrupamento temático da pergunta (ex.: "Liderança", "Comunicação") — o mesmo
// conceito de "dimensão" já usado no sistema (ver src/db/schema.ts:dimensions),
// não a categoria da biblioteca de modelos (que classifica o modelo inteiro,
// ex.: "Engajamento", "Clima organizacional"). Por isso qualquer valor de
// categoria é aceito aqui: dimensões novas são criadas automaticamente ao
// confirmar a importação (mesmo padrão de upsert-por-nome de seed-questions).
const MAX_IMPORT_ROWS = 300;

export async function parseQuestionsWorkbook(buffer: ArrayBuffer): Promise<ImportParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];

  const rows: ParsedQuestionRow[] = [];
  const errors: ImportRowError[] = [];
  const seen = new Set<string>();

  if (!sheet) {
    return { rows, errors: [{ row: 1, errors: ['Planilha vazia ou sem abas.'] }] };
  }
  // Teto de linhas: uma pesquisa real tem dezenas de perguntas, e uma planilha
  // com centenas de milhares de linhas só serviria para travar o servidor.
  if (sheet.rowCount > MAX_IMPORT_ROWS + 1) {
    return { rows, errors: [{ row: 1, errors: [`A planilha tem mais de ${MAX_IMPORT_ROWS} linhas.`] }] };
  }

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // cabeçalho

    const categoria = cellText(row, 1);
    const text = cellText(row, 2);
    const tipoRaw = cellText(row, 3);
    const obrigatoriaRaw = cellText(row, 4).toLowerCase();
    const opcoesRaw = cellText(row, 5);

    // Linha totalmente vazia: ignora silenciosamente (planilhas costumam ter linhas em branco no fim).
    if (!categoria && !text && !tipoRaw && !obrigatoriaRaw && !opcoesRaw) return;

    const rowErrors: string[] = [];

    if (!text) rowErrors.push('Coluna "Pergunta" vazia.');
    if (text && (text.length < 3 || text.length > 600)) rowErrors.push('"Pergunta" deve ter entre 3 e 600 caracteres.');

    const type = TYPE_MAP[tipoRaw.toLowerCase()];
    if (!type) {
      rowErrors.push(`"Tipo de resposta" desconhecido: "${tipoRaw || '(vazio)'}". Use um dos valores da aba "Tipos válidos" do modelo.`);
    }

    const required = ['sim', 's', 'true', '1'].includes(obrigatoriaRaw);
    if (obrigatoriaRaw && !['sim', 'não', 'nao', 'n'].includes(obrigatoriaRaw)) {
      rowErrors.push('"Obrigatória" deve ser "Sim" ou "Não".');
    }

    const options = opcoesRaw
      ? opcoesRaw.split(';').map((o) => o.trim()).filter(Boolean)
      : undefined;
    if ((type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE') && (!options || options.length < 2)) {
      rowErrors.push('Perguntas de escolha única/múltipla precisam de ao menos 2 opções na coluna "Opções (separadas por ;)".');
    }

    if (text && type) {
      const dedupeKey = `${text.toLowerCase()}|${type}`;
      if (seen.has(dedupeKey)) rowErrors.push('Linha duplicada (mesma pergunta e tipo já aparecem em outra linha).');
      seen.add(dedupeKey);
    }

    if (rowErrors.length > 0) {
      errors.push({ row: rowNumber, errors: rowErrors });
      return;
    }

    rows.push({
      row: rowNumber,
      categoria: categoria || undefined,
      text,
      type: type as QuestionType,
      required,
      options,
    });
  });

  return { rows, errors };
}
