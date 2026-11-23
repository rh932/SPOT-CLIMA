'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';
import { Ic } from '@/components/sp/Ic';

/*
 * Entrada cinematográfica sem e-mail nem senha: a mesma tela do login (foto
 * desfocada, luz quente, logo branco com traço âmbar, frase em 3 linhas), para
 * as entradas que pedem outra coisa, como a pesquisa de clima anônima.
 *
 * `painel` ocupa o lado direito (computador) ou a tela inteira (celular) nas
 * etapas seguintes, uma por tela, com a barra "1 / 3". Sem `painel`, vale a
 * abertura: frase, subtítulo, selo e o botão grande.
 */

type Props = {
  eyebrow: string;
  frase: { linhas: string[]; destaque: string };
  subtitulo: string;
  /** Selo fixo com cadeado, ex.: "Anônima: não pedimos seu nome". */
  selo?: string;
  rodape?: { rotulo: string; texto: string }[];
  /** Botões da abertura (mostrados sob a frase no celular e no painel no computador). */
  abertura: ReactNode;
  /** Quando existe, ocupa o painel no lugar da abertura. */
  painel?: ReactNode;
  /** Barra do painel: "numero / total". */
  numero?: number;
  total?: number;
  onVoltar?: () => void;
  /** Rótulo pequeno do painel de abertura no computador. */
  rotuloPainel?: string;
};

function Linhas({ linhas, destaque, base }: { linhas: string[]; destaque: string; base: string }) {
  return (
    <>
      {linhas.map((t, i) => {
        const pos = t.indexOf(destaque);
        return (
          <span key={i} className="line">
            <span style={{ ['--l' as string]: i, ['--base' as string]: base }}>
              {pos < 0 ? t : (<>{t.slice(0, pos)}<span className="gold">{destaque}</span>{t.slice(pos + destaque.length)}</>)}
            </span>
          </span>
        );
      })}
    </>
  );
}

export function EntradaCinematica(p: Props) {
  const emPainel = Boolean(p.painel);
  return (
    <main className={`login ${emPainel ? 'step' : ''}`}>
      <div className="cam" aria-hidden="true">
        <div className="login-bg" />
        <div className="lamp" />
      </div>
      <div className="veil w" aria-hidden="true" />
      <div className="veil s" aria-hidden="true" />
      <svg className="arcs" aria-hidden="true" viewBox="0 0 390 844" preserveAspectRatio="xMaxYMin slice">
        <circle cx="430" cy="-40" r="150" stroke="rgba(255,255,255,.22)" />
        <circle cx="430" cy="-40" r="190" stroke="rgba(255,255,255,.14)" />
        <circle cx="-60" cy="980" r="230" stroke="rgba(255,255,255,.12)" />
      </svg>
      <div className="login-in">
        <div className={`login-story ${emPainel ? 'story-hide' : ''}`}>
          <div className="brandmark fade-up" style={{ animationDelay: '.2s' }}>
            <b>{p.eyebrow}</b>
            <i />
          </div>
          <div className="logo-w" role="img" aria-label="Spot">
            <Image src="/brand/spot-logo.png" alt="" width={223} height={247} priority />
            <svg className="swash" viewBox="0 0 160 24" width="140" height="22" aria-hidden="true">
              <path d="M6 18 C 40 10, 92 6, 154 6" fill="none" stroke="var(--c-accent)" strokeWidth="5" strokeLinecap="round" />
            </svg>
          </div>
          <div className="login-hero">
            <span className="accbar" />
            <h1><Linhas linhas={p.frase.linhas} destaque={p.frase.destaque} base=".95s" /></h1>
            <p className="fade-up" style={{ animationDelay: '1.35s' }}>{p.subtitulo}</p>
            {p.selo && (
              <p className="selo-anon fade-up" style={{ animationDelay: '1.45s' }}>
                <Ic n="lock" s={18} /> {p.selo}
              </p>
            )}
            {p.rodape && (
              <div className="facts-n desk fade-up" style={{ animationDelay: '1.5s' }}>
                {p.rodape.map((f) => (
                  <div key={f.rotulo}><b>{f.rotulo}</b>{f.texto}</div>
                ))}
              </div>
            )}
          </div>
          <div className="login-panel mob fade-up" style={{ animationDelay: '1.55s' }}>{p.abertura}</div>
        </div>
        <div className="login-side">
          {emPainel ? (
            <>
              <div className="stepbar">
                <button type="button" className="gbtn-n" onClick={p.onVoltar} aria-label="Voltar para a etapa anterior">
                  <Ic n="left" s={20} />
                </button>
                <span className="brandmark mob"><b>{p.eyebrow.split(' ')[0]}</b></span>
                <span className="ln" />
                {p.numero && p.total ? (
                  <span className="num" aria-label={`Etapa ${p.numero} de ${p.total}`}><b>{p.numero}</b> / {p.total}</span>
                ) : null}
              </div>
              <div className="step-body swap-in" style={{ ['--dir' as string]: 1 }}>
                <span className="accbar" style={{ marginBottom: 18 }} />
                {p.painel}
              </div>
            </>
          ) : (
            <div className="desk fade-up" style={{ animationDelay: '.8s' }}>
              {p.rotuloPainel && <span className="kick" style={{ color: 'var(--c-accent)' }}>{p.rotuloPainel}</span>}
              <div className="login-panel" style={{ marginTop: 16 }}>{p.abertura}</div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
