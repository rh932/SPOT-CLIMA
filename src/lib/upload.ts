import { NextRequest } from 'next/server';
import { ApiError } from './apiAuth';

export const MAX_SPREADSHEET_BYTES = 10 * 1024 * 1024; // 10MB

const XLSX_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // Alguns navegadores (e o Windows sem Office) mandam genérico ou vazio.
  'application/octet-stream',
  '',
]);

/**
 * Lê a planilha .xlsx enviada no campo `file` sem confiar no que o cliente diz
 * dela:
 * - o tamanho é conferido pelo Content-Length ANTES de ler o corpo (antes,
 *   `formData()` carregava tudo na memória e só depois olhava os 10MB);
 * - a extensão e o tipo informado têm que ser de .xlsx;
 * - o conteúdo tem que começar com a assinatura de ZIP (todo .xlsx é um ZIP):
 *   um executável renomeado para .xlsx para aqui.
 *
 * O arquivo nunca é gravado em disco nem servido de volta — só é lido em
 * memória pelo exceljs e descartado.
 */
export async function readSpreadsheetUpload(req: NextRequest): Promise<ArrayBuffer> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  // Folga para os cabeçalhos do multipart em volta do arquivo.
  if (declared > MAX_SPREADSHEET_BYTES + 64 * 1024) {
    throw new ApiError(413, 'Arquivo excede o limite de 10MB.');
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) throw new ApiError(400, 'Nenhum arquivo enviado.');
  if (file.size > MAX_SPREADSHEET_BYTES) throw new ApiError(413, 'Arquivo excede o limite de 10MB.');
  if (!/\.xlsx$/i.test(file.name) || !XLSX_MIME.has(file.type)) {
    throw new ApiError(415, 'Envie uma planilha do Excel (.xlsx).');
  }

  const buffer = await file.arrayBuffer();
  const head = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
  const isZip = head.length === 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
  if (!isZip) throw new ApiError(415, 'O arquivo não é uma planilha .xlsx válida.');
  return buffer;
}
