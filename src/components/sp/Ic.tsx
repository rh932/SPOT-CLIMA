import type { CSSProperties, ReactElement } from 'react';

/*
 * Ícones do padrão Spot Integra (traço de 2 px, cantos redondos), tirados de
 * spot-integra/js/app.js. Todo ícone é decorativo (aria-hidden): o rótulo em
 * texto fica sempre ao lado, ou em aria-label no botão.
 */
const P: Record<string, ReactElement> = {
  home: <><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></>,
  eval: <><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="8" y="2" rx="1"/><path d="m9 14 2 2 4-4"/></>,
  team: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  hist: <><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></>,
  help: <><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/></>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></>,
  right: <><path d="m9 18 6-6-6-6"/></>,
  left: <><path d="m15 18-6-6 6-6"/></>,
  arrow: <><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></>,
  x: <><path d="M18 6 6 18M6 6l12 12"/></>,
  check: <><path d="M20 6 9 17l-5-5"/></>,
  down: <><path d="m6 9 6 6 6-6"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
  out: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></>,
  mail: <><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></>,
  lock: <><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
  clock: <><circle cx="12" cy="12" r="10"/><path d="M12 7v5l3 2"/></>,
  pin: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></>,
  moon: <><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></>,
  cal: <><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></>,
  info: <><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></>,
  redo: <><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></>,
  send: <><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  star: <><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></>,
  smile: <><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></>,
  meh: <><circle cx="12" cy="12" r="10"/><path d="M8 15h8M9 9h.01M15 9h.01"/></>,
  frown: <><circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2M9 9h.01M15 9h.01"/></>,
  more: <><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></>,
  chat: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>,
  cap: <><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/></>,
  user: <><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></>,
  trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></>,
};

export type NomeIcone = "home" | "eval" | "team" | "hist" | "help" | "bell" | "right" | "left" | "arrow" | "x" | "check" | "down" | "search" | "out" | "mail" | "lock" | "clock" | "pin" | "moon" | "cal" | "info" | "redo" | "send" | "plus" | "star" | "smile" | "meh" | "frown" | "more" | "chat" | "cap" | "user" | "list" | "trash";

export function Ic({
  n,
  s = 20,
  w = 2,
  className,
  style,
}: {
  n: NomeIcone;
  s?: number;
  w?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 24 24"
      width={s}
      height={s}
      fill="none"
      stroke="currentColor"
      strokeWidth={w}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {P[n]}
    </svg>
  );
}
