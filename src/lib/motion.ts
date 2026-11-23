'use client';

/*
 * Movimento do padrão Spot Integra. Porte de spot-integra/js/motion.js para
 * módulo (só roda no navegador: toda função começa checando `document`).
 *
 * Regras que vêm do padrão:
 *  - só anima transform, opacity e clip-path;
 *  - com "reduzir movimento" ligado no aparelho, nada se mexe (RM());
 *  - o som pode ser desligado com cfg.mute = true.
 *
 * Os elementos que as funções criam no <body> recebem a classe `sp` para
 * enxergar os tokens e as fontes do padrão (ver src/styles/spot-tokens.css).
 */

import { useEffect, type RefObject } from 'react';

/** true quando a pessoa pediu para reduzir movimento. Lido a cada chamada. */
export const RM = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const cfg = {
  mute: false,
  // Cores do confete: variáveis do padrão resolvidas em tempo de execução
  // (canvas não lê var(--x)), com a ordem do modelo.
  palette: ['--c-accent', '--c-ink', '--c-ok', '--stone-200', '--c-accent', '--c-bad'],
};

let busy = false; // trava: duas transições de tela não se atropelam
let audio: AudioContext | null = null;

const cor = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#F2B800';
const after = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));
const anim = (el: HTMLElement, kf: Keyframe[], opt: KeyframeAnimationOptions) =>
  el.animate ? el.animate(kf, opt).finished.catch(() => undefined) : Promise.resolve();

export function center(el: Element) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export const ocupado = () => busy;

/** Faixa inclinada que varre a tela. `swap` roda no meio, com a tela coberta. */
export async function sweep(swap?: () => void, o: { dir?: 1 | -1; bg?: string; fg?: string; text?: string } = {}) {
  if (typeof document === 'undefined') return;
  if (busy) return;
  if (RM()) {
    swap?.();
    return;
  }
  busy = true;
  const dir = o.dir === -1 ? -1 : 1;
  const el = document.createElement('div');
  el.className = 'sp mk-sw';
  el.setAttribute('aria-hidden', 'true');
  if (o.bg) el.style.background = o.bg;
  if (o.fg) el.style.color = o.fg;
  if (o.text) {
    const b = document.createElement('b');
    b.textContent = o.text;
    el.appendChild(b);
  }
  document.body.appendChild(el);
  const sk = ' skewX(-12deg)';
  const ease = 'cubic-bezier(.2,.9,.25,1)';
  try {
    await anim(el, [{ transform: `translateX(${-dir * 100}%)` + sk }, { transform: 'translateX(0)' + sk }], { duration: 190, easing: ease, fill: 'forwards' });
    swap?.();
    await anim(el, [{ transform: 'translateX(0)' + sk }, { transform: `translateX(${dir * 100}%)` + sk }], { duration: 190, easing: ease, fill: 'forwards' });
  } finally {
    el.remove();
    busy = false;
  }
}

/** Círculo que cresce do ponto tocado, cobre, troca o conteúdo e se fecha. */
export async function iris(swap?: () => void, o: { x?: number; y?: number; bg?: string; kicker?: string; text?: string; hold?: number } = {}) {
  if (typeof document === 'undefined') return;
  if (busy) return;
  if (RM()) {
    swap?.();
    return;
  }
  busy = true;
  const x = o.x ?? innerWidth / 2;
  const y = o.y ?? innerHeight / 2;
  const el = document.createElement('div');
  el.className = 'sp mk-iris';
  el.setAttribute('aria-hidden', 'true');
  if (o.bg) el.style.background = o.bg;
  if (o.kicker) {
    const k = document.createElement('span');
    k.className = 'mk-irs';
    k.textContent = o.kicker;
    el.appendChild(k);
  }
  if (o.text) {
    const t = document.createElement('span');
    t.className = 'mk-irt';
    t.textContent = o.text;
    el.appendChild(t);
  }
  document.body.appendChild(el);
  const ease = 'cubic-bezier(.2,.9,.25,1)';
  try {
    const R = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    await anim(el, [{ clipPath: `circle(0px at ${x}px ${y}px)` }, { clipPath: `circle(${R}px at ${x}px ${y}px)` }], { duration: 360, easing: ease, fill: 'forwards' });
    swap?.();
    await after(o.hold ?? 260);
    const cx = innerWidth / 2;
    const cy = innerHeight * 0.35;
    const R2 = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy));
    await anim(el, [{ clipPath: `circle(${R2}px at ${cx}px ${cy}px)` }, { clipPath: `circle(0px at ${cx}px ${cy}px)` }], { duration: 380, easing: ease, fill: 'forwards' });
  } finally {
    el.remove();
    busy = false;
  }
}

/** Cascata de adesivos: cada elemento cai com inclinação alternada. Máximo de 9 atrasos. */
export function stick(sel: string | Iterable<Element>, base = 0) {
  if (typeof document === 'undefined') return;
  const els = typeof sel === 'string' ? document.querySelectorAll(sel) : sel;
  Array.from(els).forEach((el, i) => {
    const h = el as HTMLElement;
    h.classList.remove('mk-rs');
    void h.offsetWidth;
    h.style.setProperty('--n', String(Math.min(i, 9) + base));
    h.style.setProperty('--r', (i % 2 ? 1.5 : -2) + 'deg');
    h.classList.add('mk-rs');
  });
}

/** Letras de um título, uma a uma. O texto inteiro fica só para leitores de tela. */
export function chars(text: string): { leitor: string; letras: { ch: string; i: number }[] } {
  return { leitor: text, letras: Array.from(text).map((ch, i) => ({ ch: ch === ' ' ? ' ' : ch, i })) };
}

/** Número contando de `from` até `to`. */
export function countUp(el: HTMLElement, to: number, dur = 900, suffix = '', from = 0, delay = 0): Promise<void> {
  if (RM()) {
    el.textContent = to + suffix;
    return Promise.resolve();
  }
  return new Promise((done) => {
    const t0 = performance.now() + delay;
    const tick = (now: number) => {
      const p = Math.min(Math.max((now - t0) / dur, 0), 1);
      el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))) + suffix;
      if (p < 1) requestAnimationFrame(tick);
      else done();
    };
    requestAnimationFrame(tick);
  });
}

const restart = (el: Element | null | undefined, cls: string) => {
  if (!el) return;
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
};
export const bump = (el: Element | null | undefined) => restart(el, 'mk-bump');
export const shake = (el: Element | null | undefined) => restart(el, 'mk-shake');
export const pick = (el: Element | null | undefined) => restart(el, 'mk-pick');

/** "+10" (ou "Salvo") subindo a partir de um elemento. */
export function floatText(text: string, el: Element | null | undefined) {
  if (typeof document === 'undefined' || RM() || !el) return;
  const c = center(el);
  const f = document.createElement('div');
  f.className = 'sp mk-float';
  f.textContent = text;
  f.setAttribute('aria-hidden', 'true');
  f.style.left = c.x + 'px';
  f.style.top = c.y - 24 + 'px';
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 1000);
}

/** Confete em canvas. */
export function burst(x: number, y: number, n = 30) {
  if (typeof document === 'undefined' || RM()) return;
  const cv = document.createElement('canvas');
  cv.className = 'sp mk-cv';
  cv.setAttribute('aria-hidden', 'true');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = innerWidth * dpr;
  cv.height = innerHeight * dpr;
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  if (!ctx) {
    cv.remove();
    return;
  }
  ctx.scale(dpr, dpr);
  const cores = cfg.palette.map(cor);
  const P = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const v = 5 + Math.random() * 6;
    return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 5, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, w: 6 + Math.random() * 5, h: 9 + Math.random() * 6, c: cores[i % cores.length] };
  });
  const t0 = performance.now();
  const frame = (now: number) => {
    const t = now - t0;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    P.forEach((p) => {
      p.vy += 0.32;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t / 1400);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    if (t < 1400) requestAnimationFrame(frame);
    else cv.remove();
  };
  requestAnimationFrame(frame);
}

/** Sons curtos sintetizados (só tocam depois de um toque da pessoa). */
export function sound(kind: 'ok' | 'bad' | 'tick' | 'combo' | 'end') {
  if (typeof window === 'undefined' || cfg.mute) return;
  try {
    const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const C = W.AudioContext || W.webkitAudioContext;
    if (!C) return;
    audio = audio || new C();
    if (audio.state === 'suspended') void audio.resume();
    const ac = audio;
    const notes = { ok: [660, 880], bad: [220, 160], tick: [540], combo: [660, 880, 1047], end: [523, 659, 784, 1047] }[kind] || [];
    notes.forEach((f, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      const t = ac.currentTime + i * 0.09;
      o.type = kind === 'bad' ? 'triangle' : 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.11, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g);
      g.connect(ac.destination);
      o.start(t);
      o.stop(t + 0.2);
    });
  } catch {
    /* sem som, sem problema */
  }
}

export const buzz = (p: number | number[]) => {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(p);
  } catch {
    /* aparelho sem vibração */
  }
};

/** Cascata de adesivos no que está dentro de `ref`, uma vez, quando `ativo`. */
export function useStick(ref: RefObject<HTMLElement | null>, seletor = '[data-stick]', ativo = true) {
  useEffect(() => {
    if (!ativo || !ref.current || RM()) return;
    stick(ref.current.querySelectorAll(seletor));
  }, [ref, seletor, ativo]);
}
