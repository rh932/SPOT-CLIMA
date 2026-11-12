/**
 * Ícones do painel: SVG inline em traço (`currentColor`), todos na grade de
 * 24px. Decorativos por padrão (`aria-hidden`) — o rótulo ao lado é que
 * informa. Emoji e glifo Unicode nunca fazem papel de ícone.
 */
const CAMINHOS = {
  inicio: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10M10 19.5v-5h4v5',
  pesquisa: 'M9 2.5h6a1 1 0 0 1 1 1V5H8V3.5a1 1 0 0 1 1-1ZM8 5H6.5A1.5 1.5 0 0 0 5 6.5v13A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 17.5 5H16M9 12h6M9 16h4',
  modelo: 'M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5ZM4 9.5h16M9.5 9.5V20',
  resultado: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  comentario: 'M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5Z',
  comparar: 'M7 4 3 8l4 4M3 8h14M17 12l4 4-4 4M21 16H7',
  relatorio: 'M7.5 3H14l5 5v12.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-17a.5.5 0 0 1 .5-.5ZM14 3v5h5M9 13h6M9 17h6',
  pessoa: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.5a7.5 7.5 0 0 1 15 0',
  historico: 'M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5M3.5 4v4.5H8M12 7.5V12l3 2',
  indicador: 'M3 17l5.5-5.5 4 4L21 7M15 7h6v6',
  treino: 'M2.5 9.5 12 5l9.5 4.5L12 14ZM6.5 11.7V16c0 1.2 2.5 2.5 5.5 2.5s5.5-1.3 5.5-2.5v-4.3M21.5 9.5V15',
  plano: 'M9 11.5l2 2 4-4.5M5.5 3h13A1.5 1.5 0 0 1 20 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5v-15A1.5 1.5 0 0 1 5.5 3ZM8 17h8',
  setor: 'M3.5 9.5 12 4l8.5 5.5M5 9.5V20h14V9.5M9 20v-6h6v6',
  unidade: 'M4 20.5V6.5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v14M14 10.5h5a1 1 0 0 1 1 1v9M2.5 20.5h19M7.5 9.5h3M7.5 13h3M7.5 16.5h3',
  dimensao: 'M12 3 3 7.5l9 4.5 9-4.5ZM3 12l9 4.5 9-4.5M3 16.5 12 21l9-4.5',
  usuarios: 'M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20a6.5 6.5 0 0 1 13 0M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.2a6.5 6.5 0 0 1 3.5 5.8',
  config: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19.4 13.5a7.7 7.7 0 0 0 0-3l1.9-1.5-2-3.4-2.3.9a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.6 7.6 0 0 0 7 6.5l-2.3-.9-2 3.4 1.9 1.5a7.7 7.7 0 0 0 0 3l-1.9 1.5 2 3.4 2.3-.9a7.6 7.6 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 2.6-1.5l2.3.9 2-3.4Z',
  clima: 'M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z',
  participacao: 'M12 3a9 9 0 1 0 9 9M12 3v9h9',
  respostas: 'M20.5 12.5 12 21 3.5 12.5a5.5 5.5 0 0 1 8.5-7 5.5 5.5 0 0 1 8.5 7Z',
  alvo: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 12h.01',
  sair: 'M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10M15 8l4 4-4 4M19 12H9',
  menu: 'M3 6h18M3 12h18M3 18h18',
  fechar: 'M6 6l12 12M18 6 6 18',
  seta: 'M5 12h14M13 6l6 6-6 6',
  alta: 'M7 17 17 7M8 7h9v9',
  baixa: 'M7 7l10 10M17 8v9H8',
  estavel: 'M5 12h14',
} as const;

export type NomeIcone = keyof typeof CAMINHOS;

export function Icone({
  nome,
  className = 'h-5 w-5',
  rotulo,
}: {
  nome: NomeIcone;
  className?: string;
  /** Só quando o ícone sozinho carrega o sentido (botão sem texto). */
  rotulo?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={rotulo ? undefined : true}
      role={rotulo ? 'img' : undefined}
      aria-label={rotulo}
    >
      <path d={CAMINHOS[nome]} />
    </svg>
  );
}
