/**
 * Passo a passo para ligar os avisos no iPhone.
 *
 * O Safari só entrega aviso para app instalado na Tela de Início, e o caminho
 * até lá tem vários toques escondidos em menus — uma frase só ("toque em
 * Compartilhar...") deixava os gestores perdidos. Os passos seguem a gravação
 * feita pelo RH em 27/11/2026 no Safari do iPhone (iOS 26).
 *
 * Um componente só, usado na trava, no convite e no sino, para a orientação
 * não divergir entre eles.
 */

const INSTALAR: { titulo: string; detalhe: string }[] = [
  {
    titulo: 'Abra o menu do Safari',
    detalhe: 'Toque no ícone de três linhas, à esquerda do endereço, na barra de baixo.',
  },
  {
    titulo: 'Toque em "Compartilhar"',
    detalhe: 'Fica no começo da lista que abrir.',
  },
  {
    titulo: 'Escolha "Adicionar à Tela de Início"',
    detalhe: 'Role a lista para baixo até achar. Se não aparecer, toque em "Ver Mais".',
  },
  {
    titulo: 'Confirme o nome e toque em "Adicionar"',
    detalhe: 'Deixe ligada a opção "Abrir como app web". O botão "Adicionar" fica no alto, à direita.',
  },
  {
    titulo: 'Feche o Safari e abra o ícone novo',
    detalhe: 'Procure o ícone do Spot na Tela de Início do iPhone. É por ele que os avisos funcionam, não pelo Safari.',
  },
  {
    titulo: 'Toque em "Ligar avisos" e depois em "Permitir"',
    detalhe: 'A pergunta do iPhone aparece uma vez só. Se tocar em "Não Permitir", veja o passo a passo de desbloqueio.',
  },
];

const DESBLOQUEAR: { titulo: string; detalhe: string }[] = [
  { titulo: 'Abra os Ajustes do iPhone', detalhe: 'O app de engrenagem cinza.' },
  { titulo: 'Toque em "Notificações"', detalhe: 'Role a lista até achar o ícone do Spot e toque nele.' },
  { titulo: 'Ligue "Permitir Notificações"', detalhe: 'Depois volte ao app do Spot e toque em "Já liberei, recarregar".' },
];

// Android (Chrome): não precisa instalar nada, só liberar a permissão do site.
// Os nomes dos menus variam um pouco conforme a marca do aparelho.
const DESBLOQUEAR_ANDROID: { titulo: string; detalhe: string }[] = [
  {
    titulo: 'Toque no ícone ao lado do endereço',
    detalhe: 'No alto da tela, no Chrome. Pode ser um cadeado ou um ícone de ajustes.',
  },
  { titulo: 'Abra "Permissões" ou "Configurações do site"', detalhe: 'O nome muda conforme o celular.' },
  { titulo: 'Em "Notificações", escolha "Permitir"', detalhe: 'Depois volte ao Spot e toque em "Já liberei, recarregar".' },
  {
    titulo: 'Ainda não chegou aviso?',
    detalhe: 'Nos Ajustes do celular, vá em Apps, Chrome e Notificações, e confira se estão ligadas.',
  },
];

const TITULO = {
  instalar: 'No iPhone, faça assim:',
  desbloquear: 'Para liberar os avisos no iPhone:',
  'desbloquear-android': 'Para liberar os avisos no Android:',
} as const;

const PASSOS = {
  instalar: INSTALAR,
  desbloquear: DESBLOQUEAR,
  'desbloquear-android': DESBLOQUEAR_ANDROID,
} as const;

export function PushPassoAPasso({ tipo, compacto = false }: { tipo: keyof typeof PASSOS; compacto?: boolean }) {
  const passos = PASSOS[tipo];
  return (
    <div className="mt-3">
      <p className="text-sm font-semibold">{TITULO[tipo]}</p>
      <ol className={`mt-2 flex flex-col ${compacto ? 'gap-2' : 'gap-3'}`}>
        {passos.map((p, i) => (
          <li key={p.titulo} className="flex gap-3">
            <span
              aria-hidden="true"
              className="shrink-0 mt-0.5 h-6 w-6 rounded-full bg-spot-yellow text-spot-onYellow text-xs font-bold inline-flex items-center justify-center"
            >
              {i + 1}
            </span>
            <span className="min-w-0 text-sm leading-snug">
              <span className="font-semibold">{p.titulo}</span>
              <span className="block text-xs text-spot-gray-600 mt-0.5">{p.detalhe}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
