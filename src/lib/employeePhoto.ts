import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import * as schema from '@/db/schema';

/** Trava de segurança: a foto guardada já é reduzida (poucos KB). */
export const MAX_FOTO_BYTES = 512 * 1024;

/** Só imagens que o importador grava. Qualquer outra coisa é tratada como sem foto. */
const TIPOS = new Set(['image/jpeg', 'image/png']);

/**
 * Resposta da foto de um colaborador. A autorização (admin ou gestor no
 * escopo) é feita pela rota ANTES de chamar aqui. Sem foto: 404 — a tela cai
 * nas iniciais.
 */
export async function respostaDaFoto(employeeId: string): Promise<NextResponse> {
  const foto = await db.query.employeePhotos.findFirst({
    where: eq(schema.employeePhotos.employeeId, employeeId),
  });
  if (!foto || !TIPOS.has(foto.contentType)) {
    return new NextResponse('Sem foto.', { status: 404, headers: { 'Cache-Control': 'private, max-age=60' } });
  }
  return new NextResponse(new Uint8Array(foto.data), {
    headers: {
      'Content-Type': foto.contentType,
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      // A tela pede com ?v=<carimbo>: trocar a foto muda o endereço.
      'Cache-Control': 'private, max-age=86400',
    },
  });
}
