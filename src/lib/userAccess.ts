/**
 * Aba Usuários do painel: quem já entrou no sistema, filtros e a mensagem de
 * acesso que o RH encaminha.
 *
 * "Já entrou" vem do histórico de auditoria (login.success), que existe desde
 * o começo do sistema — não precisou de coluna nova no cadastro.
 */

export type UserRole = 'SUPER_ADMIN' | 'RH' | 'GESTOR' | 'GESTOR_LIDER' | 'TREINADOR';

export const ROLE_LABEL: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super Admin', RH: 'RH', GESTOR: 'Gestor', GESTOR_LIDER: 'Gestor Líder', TREINADOR: 'Treinador',
};

/** Papéis que trabalham por recorte de unidade/setor/turno e entram pelo portal da operação. */
export const SCOPED_ROLES: UserRole[] = ['GESTOR', 'GESTOR_LIDER', 'TREINADOR'];

interface Lookup { id: string; name: string }

export interface AccessUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  scopedUnits: Lookup[];
  scopedSectors: Lookup[];
  scopedShifts: ('DIA' | 'NOITE')[];
  firstLoginAt: string | null;
  lastLoginAt: string | null;
  /** Enquanto a conta nunca entrou: o código para a pessoa criar a própria senha. */
  firstAccessCode?: string | null;
}

export type AccessFilter = '' | 'PENDENTE' | 'ENTROU' | 'INATIVO';

export interface UserFilters {
  q: string;
  role: UserRole | '';
  unit: string;
  sector: string;
  access: AccessFilter;
}

export const EMPTY_USER_FILTERS: UserFilters = { q: '', role: '', unit: '', sector: '', access: '' };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function accessOf(u: Pick<AccessUser, 'active' | 'firstLoginAt'>): Exclude<AccessFilter, ''> {
  if (!u.active) return 'INATIVO';
  return u.firstLoginAt ? 'ENTROU' : 'PENDENTE';
}

export function matchesUserFilters(u: AccessUser, f: UserFilters): boolean {
  if (f.q) {
    const q = norm(f.q);
    if (!norm(u.name).includes(q) && !norm(u.email).includes(q)) return false;
  }
  if (f.role && u.role !== f.role) return false;
  if (f.unit && !u.scopedUnits.some((x) => x.id === f.unit)) return false;
  if (f.sector && !u.scopedSectors.some((x) => x.id === f.sector)) return false;
  if (f.access && accessOf(u) !== f.access) return false;
  return true;
}

/** Pendentes primeiro (é a lista de cobrança), depois quem entrou, depois inativos; dentro, por nome. */
export function sortUsers(users: AccessUser[]): AccessUser[] {
  const ordem = { PENDENTE: 0, ENTROU: 1, INATIVO: 2 } as const;
  return [...users].sort((a, b) =>
    ordem[accessOf(a)] - ordem[accessOf(b)] || norm(a.name).localeCompare(norm(b.name)));
}

export function loginUrl(origin: string, role: UserRole): string {
  const base = origin.replace(/\/+$/, '');
  return `${base}/${SCOPED_ROLES.includes(role) ? 'gestor' : 'admin'}/login`;
}

/**
 * Link pessoal de primeiro acesso. E-mail e código vão no fragmento (#), que o
 * navegador não manda para o servidor: não aparecem em log de acesso.
 */
export function firstAccessLink(origin: string, role: UserRole, email: string, code: string): string {
  const p = new URLSearchParams({ email, codigo: code });
  return `${loginUrl(origin, role)}#primeiro-acesso?${p.toString()}`;
}

/** Lê o fragmento "#primeiro-acesso?email=...&codigo=..." (ou só "#primeiro-acesso"). */
export function parseFirstAccessHash(hash: string): { email: string; code: string } | null {
  const h = hash.replace(/^#/, '');
  if (!h.startsWith('primeiro-acesso')) return null;
  const p = new URLSearchParams(h.slice('primeiro-acesso'.length).replace(/^\?/, ''));
  return { email: p.get('email') ?? '', code: p.get('codigo') ?? '' };
}

const primeiroNome = (nome: string) => {
  const p = nome.trim().split(/\s+/)[0] ?? '';
  return p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : '';
};

/** Passo a passo do aviso no celular, igual na mensagem individual e na do grupo. */
const COMO_ATIVAR_NO_CELULAR = [
  '• Android: depois de entrar, toque em "Ativar" no quadro "Receba os avisos no celular" e depois em "Permitir".',
  '• iPhone: abra o site no Safari (se o link abrir dentro do WhatsApp, toque no ícone da bússola), toque em Compartilhar e em "Adicionar à Tela de Início". Abra o SPOT CLIMA pelo ícone novo, entre com o seu e-mail e senha e toque em "Ativar" e depois em "Permitir".',
];

/**
 * Mensagem de acesso para WhatsApp ou e-mail. Conta que nunca entrou recebe o
 * link de primeiro acesso (a pessoa cria a própria senha); quem já entrou
 * recebe só o endereço e o e-mail. Senha nunca entra aqui.
 */
export function accessMessage(u: Pick<AccessUser, 'name' | 'email' | 'role' | 'firstAccessCode'>, origin: string): string {
  const gestor = SCOPED_ROLES.includes(u.role);
  const oQueFaz = u.role === 'TREINADOR'
    ? 'Nele você registra os treinamentos da equipe.'
    : u.role === 'GESTOR_LIDER'
      ? 'Nele você acompanha as avaliações de experiência das equipes e os prazos de cada gestor.'
      : gestor
        ? 'Nele você faz as avaliações de experiência (45 e 90 dias) da sua equipe, acompanha os prazos e registra os feedbacks.'
        : 'Nele você acompanha as pesquisas de clima, as avaliações de experiência e os treinamentos.';
  const abertura = [`Olá, ${primeiroNome(u.name)}! Seu acesso ao Spot Clima está liberado.`, oQueFaz, ''];
  // O aviso no celular é o que faz o lembrete de prazo chegar; sem ele, fica
  // só no sino e a pessoa só vê quando abre o site. No iPhone a Apple exige o
  // site na Tela de Início, aberto pelo ícone — o passo que mais se pula.
  // O que cada perfil recebe (src/lib/notificationEvents.ts e a rotina de
  // lembretes): dizer isso antes é o que convence a pessoa a permitir — o
  // medo é de um celular apitando o dia inteiro. Os dias vêm de
  // REMINDER_OFFSETS; o teste trava os dois juntos.
  const sobreAvisos = u.role === 'TREINADOR'
    ? 'Sobre os avisos: são poucos. Chegam quando um novo formulário de treinamento é criado. Deixe sempre permitido para não perder nenhum.'
    : gestor
      ? 'Sobre os avisos: eles não são repetitivos. Cada avaliação da sua equipe gera só 6 lembretes automáticos: 7, 3 e 1 dia antes do prazo, no próprio dia e, se atrasar, 1 e 7 dias depois (o RH pode mandar um lembrete extra, se precisar). Você também é avisado quando alguém da sua equipe é cadastrado ou avaliado. Deixe os avisos sempre permitidos para não perder nenhuma data de avaliação.'
      : 'Sobre os avisos: são poucos. Chegam quando há movimentação nas equipes (avaliação registrada, cadastro ou treinamento). Deixe sempre permitido para acompanhar sem precisar abrir o site.';
  const fim = [
    '',
    sobreAvisos,
    '',
    'Para ativar os avisos no celular:',
    ...COMO_ATIVAR_NO_CELULAR,
    '',
    'Qualquer dúvida, fale com o RH.',
  ];
  if (u.firstAccessCode) {
    return [
      ...abertura,
      '1. Abra o seu link de primeiro acesso:',
      firstAccessLink(origin, u.role, u.email, u.firstAccessCode),
      '2. Crie a sua senha (no mínimo 8 caracteres). Pronto, você já entra.',
      '',
      `Nas próximas vezes, entre em ${loginUrl(origin, u.role)} com o e-mail ${u.email} e a senha que você criou.`,
      `Se o link não abrir, toque em "Primeiro acesso" na tela de entrada e use o código ${u.firstAccessCode}.`,
      'O link e o código são só seus: não repasse.',
      ...fim,
    ].join('\n');
  }
  return [
    ...abertura,
    `Acesse: ${loginUrl(origin, u.role)}`,
    `E-mail: ${u.email}`,
    'Entre com a sua senha.',
    ...fim,
  ].join('\n');
}

/**
 * Mensagem única para o grupo dos gestores no WhatsApp (asterisco = negrito).
 *
 * Não leva link nem código de ninguém: o código de primeiro acesso é pessoal,
 * e no grupo todos veriam o de todos. Ela apresenta o sistema, explica os
 * avisos e anuncia que o link de cada um vai no privado (accessMessage).
 */
export function groupMessage(origin: string): string {
  return [
    '*SPOT CLIMA — acesso dos gestores*',
    '',
    'Pessoal, a partir de agora as avaliações de experiência (45 e 90 dias) e os feedbacks da equipe passam a ser feitos pelo Spot Clima.',
    '',
    `Site: ${loginUrl(origin, 'GESTOR')}`,
    '',
    '*1. Primeiro acesso*',
    'Cada um vai receber do RH, no privado, um link pessoal. É só abrir o link e criar a sua senha (no mínimo 8 caracteres). O link e o código são só seus: não repassem.',
    '',
    '*2. O que tem lá*',
    '• As avaliações da sua equipe, com o prazo de cada uma',
    '• A ficha de cada colaborador, com o histórico',
    '• Nos setores com dois gestores, os dois podem avaliar o mesmo período',
    '',
    '*3. Avisos no celular (importante!)*',
    'Os avisos não são repetitivos. Cada avaliação gera só 6 lembretes automáticos: 7, 3 e 1 dia antes do prazo, no próprio dia e, se atrasar, 1 e 7 dias depois. Vocês também são avisados quando alguém da equipe é cadastrado ou avaliado. Deixem sempre permitido para não perder nenhuma data.',
    '',
    'Como ativar:',
    ...COMO_ATIVAR_NO_CELULAR,
    '',
    'Qualquer dúvida, falem com o RH!',
  ].join('\n');
}
