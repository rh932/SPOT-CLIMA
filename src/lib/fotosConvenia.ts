import { normalizeName } from './employeeCreate';

/**
 * Casamento das fotos tiradas do Convênia com os colaboradores do Spot
 * Integra. Lógica pura (sem banco, sem rede) para o script de importação e os
 * testes usarem a MESMA regra.
 */

export interface FotoConvenia {
  nome: string;
  /** Unidade do Convênia (Paulista ou JK). Opcional: sem ela, o nome tem que ser único. */
  unidade?: string;
  url: string;
}

export interface ColaboradorParaFoto {
  id: string;
  fullName: string;
  unitId: string;
  unitName: string;
}

/** As fotos do Convênia ficam neste bucket público do S3; nada fora dele é baixado. */
const HOST_S3 = 's3.amazonaws.com';
const CAMINHO_S3 = '/storage-api.rh.live.convenia.com.br/';
const HOST_S3_VIRTUAL = 'storage-api.rh.live.convenia.com.br.s3.amazonaws.com';

/** Só https e só o bucket do Convênia: o manifesto é dado externo, não vira SSRF. */
export function urlDeFotoValida(raw: string): URL | null {
  let u: URL;
  try { u = new URL(raw.replace(/ /g, '%20')); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const noBucket = (u.hostname === HOST_S3 && u.pathname.startsWith(CAMINHO_S3)) || u.hostname === HOST_S3_VIRTUAL;
  return noBucket ? u : null;
}

export type ResultadoCasamento =
  | { tipo: 'OK'; foto: FotoConvenia; colaborador: ColaboradorParaFoto }
  | { tipo: 'SEM_COLABORADOR' | 'AMBIGUO' | 'URL_INVALIDA'; foto: FotoConvenia };

const mesmaUnidade = (c: ColaboradorParaFoto, unidade?: string) => {
  if (!unidade) return true;
  const k = normalizeName(unidade);
  const n = normalizeName(c.unitName);
  return n.includes(k) || k.includes(n);
};

export function casarFotos(fotos: FotoConvenia[], colaboradores: ColaboradorParaFoto[]): ResultadoCasamento[] {
  return fotos.map((foto) => {
    if (!urlDeFotoValida(foto.url)) return { tipo: 'URL_INVALIDA', foto };
    const chave = normalizeName(foto.nome);
    const candidatos = colaboradores.filter((c) => normalizeName(c.fullName) === chave && mesmaUnidade(c, foto.unidade));
    if (candidatos.length === 0) return { tipo: 'SEM_COLABORADOR', foto };
    if (candidatos.length > 1) return { tipo: 'AMBIGUO', foto };
    return { tipo: 'OK', foto, colaborador: candidatos[0] };
  });
}
