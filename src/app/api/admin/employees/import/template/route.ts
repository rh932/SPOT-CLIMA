export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import { requireAdmin, requirePermission, requireRole, handleApiError } from '@/lib/apiAuth';
import { ADMIN_ROLES } from '@/lib/permissions';
import { exemploData } from '@/lib/importFuncionarios';

/** Modelo da planilha, com as unidades e os setores reais do cadastro na aba de instruções. */
export async function GET() {
  try {
    const session = await requireAdmin();
    requireRole(session, ADMIN_ROLES);
    requirePermission(session, 'employees.create');

    const [units, sectors] = await Promise.all([
      db.query.units.findMany({ where: eq(schema.units.active, true), orderBy: asc(schema.units.order), columns: { name: true } }),
      db.query.sectors.findMany({
        where: and(eq(schema.sectors.active, true), eq(schema.sectors.inEvaluation, true)),
        orderBy: asc(schema.sectors.order),
        columns: { name: true },
      }),
    ]);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Spot Integra';
    wb.created = new Date();

    const sheet = wb.addWorksheet('Colaboradores');
    sheet.columns = [
      { header: 'Nome completo', key: 'nome', width: 36 },
      { header: 'Unidade', key: 'unidade', width: 16 },
      { header: 'Setor', key: 'setor', width: 24 },
      { header: 'Cargo', key: 'cargo', width: 24 },
      { header: 'Turno', key: 'turno', width: 12 },
      { header: 'Data de admissão', key: 'admissao', width: 18 },
      { header: 'Tipo', key: 'tipo', width: 12 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.getColumn('admissao').numFmt = '@';
    sheet.addRow({
      nome: 'Maria da Silva', unidade: units[0]?.name ?? 'Paulista', setor: sectors[0]?.name ?? 'Salão',
      cargo: 'Garçom', turno: 'Diurno', admissao: exemploData(), tipo: 'Ativo',
    });

    const guia = wb.addWorksheet('Instruções');
    guia.columns = [{ header: 'Como preencher', key: 'a', width: 90 }];
    guia.getRow(1).font = { bold: true };
    [
      'Obrigatórias: Nome completo, Unidade e Setor. As demais colunas são opcionais.',
      'Turno: Diurno ou Noturno (vazio = Diurno).',
      'Data de admissão: dd/mm/aaaa. Se ficar vazia, o colaborador ativo recebe a data da importação.',
      'Tipo: Ativo (já está na operação: só participa do feedback) ou Novo (treinamento, experiência e feedback). Vazio = Ativo.',
      'Quem já está cadastrado na mesma unidade (mesmo nome) é ignorado — nada é alterado.',
      '',
      'Unidades aceitas:',
      ...units.map((u) => `  • ${u.name}`),
      '',
      'Setores aceitos:',
      ...sectors.map((s) => `  • ${s.name}`),
    ].forEach((a) => guia.addRow({ a }));

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="modelo-importacao-colaboradores.xlsx"',
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
