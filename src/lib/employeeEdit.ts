/** Edição de um colaborador já cadastrado — lógica pura, sem I/O. */

export interface DadosDoColaborador {
  fullName: string;
  /** Dia de calendário, no formato yyyy-mm-dd (o campo de data do navegador). */
  admissionDate: string;
  roleDescription: string;
  sectorId: string;
  unitId: string;
  shift: 'DIA' | 'NOITE';
}

/** Dia de calendário de uma admissão gravada pela API (meio-dia UTC). */
export const diaDaAdmissao = (iso: string): string => iso.slice(0, 10);

/** Admissão no formato que a API grava: meio-dia, para o fuso não virar o dia. */
export const admissaoParaApi = (dia: string): string => new Date(`${dia}T12:00:00`).toISOString();

/**
 * Só o que mudou vai no PATCH.
 *
 * Mandar o setor de volta mesmo sem mudança quebra a edição: a rota confere se
 * o setor vale para avaliação (assertEvaluationSector), e a Administração geral
 * não vale — um colaborador que já está nela não poderia ser salvo nem com
 * outro nome.
 */
export function alteracoesDoColaborador(atual: DadosDoColaborador, novo: DadosDoColaborador): Partial<CorpoDaEdicao> {
  const mudanca: Partial<CorpoDaEdicao> = {};
  if (novo.fullName.trim() !== atual.fullName) mudanca.fullName = novo.fullName.trim();
  if (novo.admissionDate !== atual.admissionDate) mudanca.admissionDate = admissaoParaApi(novo.admissionDate);
  if (novo.roleDescription.trim() !== atual.roleDescription) mudanca.roleDescription = novo.roleDescription.trim();
  if (novo.sectorId !== atual.sectorId) mudanca.sectorId = novo.sectorId;
  if (novo.unitId !== atual.unitId) mudanca.unitId = novo.unitId;
  if (novo.shift !== atual.shift) mudanca.shift = novo.shift;
  return mudanca;
}

/** O corpo que a rota PATCH /api/admin/employees/[id] aceita. */
export interface CorpoDaEdicao {
  fullName: string;
  admissionDate: string;
  roleDescription: string;
  sectorId: string;
  unitId: string;
  shift: DadosDoColaborador['shift'];
}
