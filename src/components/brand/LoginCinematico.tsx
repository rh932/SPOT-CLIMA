'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Ic } from '@/components/sp/Ic';
import { shake, sound, buzz } from '@/lib/motion';

/*
 * Tela de entrada do padrão Spot Integra ("noite no salão"): foto desfocada
 * com luz quente, logo branco com traço âmbar, frase em 3 linhas entrando
 * linha por linha e, depois do toque, e-mail e senha em etapas (um campo por
 * tela, barra "1 / 2").
 *
 * É reutilizável: gestores, admin (RH) e a entrada da pesquisa mudam só o
 * texto. Quem usa continua dono do login — este componente NÃO chama
 * a API: entrega e-mail e senha a `onSubmit` e mostra o que voltar.
 * Primeiro acesso e verificação em duas etapas entram por `painelExtra`.
 */

export type ResultadoEntrada = { erro?: string } | void;

type Props = {
  /** Texto pequeno da marca, ao lado do traço. Ex.: "INTEGRA". */
  eyebrow: string;
  /** Frase de efeito em linhas. `destaque` é a palavra pintada de âmbar. */
  frase: { linhas: string[]; destaque: string };
  subtitulo: string;
  /** Três itens do rodapé no computador. */
  rodape?: { rotulo: string; texto: string }[];
  /** Painel da direita no computador, antes de tocar em entrar. */
  area: { rotulo: string; titulo: string; texto: string };
  /** Texto do botão que abre as etapas. */
  textoBotao?: string;
  /** Linha do cadeado no fim das etapas. */
  textoSeguro: string;
  /** Exemplo mostrado no campo de e-mail. */
  exemploEmail?: string;
  /** Chamado ao confirmar a senha. Devolva `{ erro }` para mostrar a mensagem. */
  onSubmit: (d: { email: string; senha: string }) => Promise<ResultadoEntrada>;
  /** Segundo caminho abaixo do botão (ex.: criar senha no primeiro acesso). */
  acaoSecundaria?: { rotulo: string; destaque: string; onClick: (email: string) => void };
  /** Quando existe, ocupa o painel no lugar das etapas (MFA, primeiro acesso). */
  painelExtra?: ReactNode;
  /** Título curto do painel extra, lido por leitor de tela. */
  tituloExtra?: string;
  /** Voltar do painel extra. */
  onVoltarExtra?: () => void;
  /** Atalho para a outra porta do sistema (ex.: gestor que entrou na tela do RH). */
  outraArea?: { texto: string; rotulo: string; href: string };
  /** Mensagem fixa no fim da senha (ex.: como recuperar a senha). */
  dicaSenha?: string;
};

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function Linhas({ linhas, destaque, base }: { linhas: string[]; destaque?: string; base: string }) {
  return (
    <>
      {linhas.map((t, i) => {
        const pos = destaque ? t.indexOf(destaque) : -1;
        return (
          <span key={i} className="line">
            <span style={{ ['--l' as string]: i, ['--base' as string]: base }}>
              {pos < 0 ? (
                t
              ) : (
                <>
                  {t.slice(0, pos)}
                  <span className="gold">{destaque}</span>
                  {t.slice(pos + (destaque?.length ?? 0))}
                </>
              )}
            </span>
          </span>
        );
      })}
    </>
  );
}

export function LoginCinematico(p: Props) {
  const [etapa, setEtapa] = useState(0); // 0 abertura · 1 e-mail · 2 senha
  const [dir, setDir] = useState<1 | -1>(1);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [tentou, setTentou] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erroServidor, setErroServidor] = useState<string | null>(null);
  const campoRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const senhaRef = useRef<HTMLInputElement>(null);

  const comExtra = Boolean(p.painelExtra);
  const emEtapa = etapa > 0 || comExtra;
  const emailValido = EMAIL_OK.test(email.trim());

  const ir = (n: number) => {
    setDir(n >= etapa ? 1 : -1);
    setEtapa(n);
    setTentou(false);
    setErroServidor(null);
  };

  // Ao entrar no painel extra (MFA), a senha digitada sai da memória da tela.
  useEffect(() => {
    if (comExtra) setSenha('');
  }, [comExtra]);

  // Foco no campo da etapa, depois da animação de entrada.
  useEffect(() => {
    if (comExtra) return;
    const alvo = etapa === 1 ? emailRef.current : etapa === 2 ? senhaRef.current : null;
    if (!alvo) return;
    const t = setTimeout(() => alvo.focus({ preventScroll: true }), 350);
    return () => clearTimeout(t);
  }, [etapa, comExtra]);

  const erro = (msg: string) => {
    setErroServidor(msg);
    shake(campoRef.current);
    sound('bad');
    buzz([30, 40, 30]);
  };

  const seguirEmail = (e?: FormEvent) => {
    e?.preventDefault();
    setTentou(true);
    if (!emailValido) {
      shake(campoRef.current);
      sound('bad');
      return;
    }
    sound('tick');
    ir(2);
  };

  const entrar = async (e?: FormEvent) => {
    e?.preventDefault();
    if (carregando) return;
    setTentou(true);
    if (!senha) {
      shake(campoRef.current);
      sound('bad');
      return;
    }
    setCarregando(true);
    setErroServidor(null);
    try {
      const r = await p.onSubmit({ email: email.trim(), senha });
      if (r && r.erro) erro(r.erro);
    } catch {
      erro('Não foi possível entrar agora. Confira a conexão e tente de novo.');
    } finally {
      setCarregando(false);
    }
  };

  const eErr = tentou && etapa === 1 ? (!email.trim() ? 'Informe seu e-mail corporativo.' : !emailValido ? `E-mail incompleto. Exemplo: ${p.exemploEmail ?? 'nome@spot.com.br'}` : '') : '';
  const pErr = erroServidor ?? (tentou && etapa === 2 && !senha ? 'Digite sua senha.' : '');

  const botoesAbertura = (
    <>
      <button type="button" className="btn btn-gold btn-mail press" onClick={() => ir(1)}>
        <Ic n="mail" s={22} />
        <span className="div" />
        <span className="lbl">{p.textoBotao ?? 'Entrar com e-mail corporativo'}</span>
        <Ic n="arrow" s={20} w={2.2} className="arr" />
      </button>
      {p.outraArea && (
        <a className="link-n" href={p.outraArea.href}>
          {p.outraArea.texto} <u>{p.outraArea.rotulo}</u>
        </a>
      )}
      {p.acaoSecundaria && (
        <button type="button" className="link-n" onClick={() => p.acaoSecundaria?.onClick(email)}>
          {p.acaoSecundaria.rotulo} <u>{p.acaoSecundaria.destaque}</u>
        </button>
      )}
    </>
  );

  const cabecalho = (onVoltar: () => void, numero?: number) => (
    <div className="stepbar">
      <button type="button" className="gbtn-n" onClick={onVoltar} aria-label="Voltar para a etapa anterior">
        <Ic n="left" s={20} />
      </button>
      <span className="brandmark mob">
        <b>{p.eyebrow}</b>
      </span>
      <span className="ln" />
      {numero ? (
        <span className="num" aria-label={`Etapa ${numero} de 2`}>
          <b>{numero}</b> / 2
        </span>
      ) : null}
    </div>
  );

  let lado: ReactNode;
  if (comExtra) {
    lado = (
      <>
        {cabecalho(() => p.onVoltarExtra?.())}
        <div className="step-body swap-in" style={{ ['--dir' as string]: 1 }}>
          <span className="accbar" style={{ marginBottom: 18 }} />
          <h2 className="sr">{p.tituloExtra}</h2>
          {p.painelExtra}
        </div>
      </>
    );
  } else if (etapa === 0) {
    lado = (
      <div className="desk fade-up" style={{ animationDelay: '.8s' }}>
        <span className="kick" style={{ color: 'var(--c-accent)' }}>{p.area.rotulo}</span>
        <h2 className="wtitle">{p.area.titulo}</h2>
        <p className="wsub">{p.area.texto}</p>
        <div className="login-panel">{botoesAbertura}</div>
      </div>
    );
  } else if (etapa === 1) {
    lado = (
      <>
        {cabecalho(() => ir(0), 1)}
        <form className="step-body swap-in" style={{ ['--dir' as string]: dir }} onSubmit={seguirEmail} noValidate>
          <span className="accbar" style={{ marginBottom: 18 }} />
          <h2>
            <Linhas linhas={['Qual é o seu', 'e-mail corporativo?']} destaque="e-mail" base=".08s" />
          </h2>
          <p className="sub fade-up" style={{ animationDelay: '.3s' }}>O mesmo que o RH cadastrou para você.</p>
          <label htmlFor="sp-email" className="sr">E-mail corporativo</label>
          <div ref={campoRef} className={`nfield ${eErr ? 'bad' : emailValido ? 'ok' : ''}`}>
            <Ic n="mail" s={20} w={1.8} />
            <input
              ref={emailRef}
              id="sp-email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={p.exemploEmail ?? 'nome@spot.com.br'}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={eErr ? true : undefined}
              aria-describedby={eErr ? 'sp-email-erro' : undefined}
            />
            {emailValido && (
              <span className="chk">
                <Ic n="check" s={14} w={3.2} />
              </span>
            )}
          </div>
          {eErr && <p id="sp-email-erro" className="nerr" role="alert">{eErr}</p>}
          <div className="step-foot">
            <button type="submit" className={`btn ${emailValido ? 'btn-gold' : 'btn-off'} btn-block press`} aria-disabled={!emailValido}>
              Continuar <Ic n="arrow" s={20} w={2.2} className="arr" />
            </button>
            <p className="secure"><Ic n="lock" s={14} /> {p.textoSeguro}</p>
          </div>
        </form>
      </>
    );
  } else {
    lado = (
      <>
        {cabecalho(() => ir(1), 2)}
        <form className="step-body swap-in" style={{ ['--dir' as string]: dir }} onSubmit={entrar} noValidate>
          <span className="accbar" style={{ marginBottom: 18 }} />
          <h2>
            <Linhas linhas={['Agora, a sua', 'senha.']} destaque="senha" base=".08s" />
          </h2>
          <button type="button" className="who-chip fade-up" style={{ animationDelay: '.3s' }} onClick={() => ir(1)} aria-label={`Trocar o e-mail ${email}`}>
            <span className="i">{(email.trim()[0] || 'S').toUpperCase()}</span>
            {email} <u>trocar</u>
          </button>
          {/* Campo de usuário escondido: o gerenciador de senhas do aparelho precisa dele
              para salvar o par e-mail + senha, já que o e-mail saiu da tela. */}
          <input type="email" autoComplete="username" value={email} readOnly tabIndex={-1} aria-hidden="true" className="sr" />
          <label htmlFor="sp-senha" className="sr">Senha</label>
          <div ref={campoRef} className={`nfield ${pErr ? 'bad' : senha ? 'ok' : ''}`}>
            <Ic n="lock" s={20} w={1.8} />
            <input
              ref={senhaRef}
              id="sp-senha"
              type={mostrar ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Sua senha"
              value={senha}
              onChange={(e) => {
                setSenha(e.target.value);
                setErroServidor(null);
              }}
              aria-invalid={pErr ? true : undefined}
              aria-describedby={pErr ? 'sp-senha-erro' : undefined}
            />
            <button
              type="button"
              className="gbtn-n"
              style={{ width: 'auto', padding: '0 14px', borderRadius: 14, height: 46 }}
              onClick={() => setMostrar((v) => !v)}
              aria-pressed={mostrar}
              aria-label={mostrar ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {mostrar ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
          {pErr && <p id="sp-senha-erro" className="nerr" role="alert">{pErr}</p>}
          {p.dicaSenha && <p className="secure" style={{ marginTop: 14 }}>{p.dicaSenha}</p>}
          <div className="step-foot">
            <button type="submit" className={`btn ${senha ? 'btn-gold' : 'btn-off'} btn-block press`} disabled={carregando} aria-disabled={!senha}>
              {carregando ? 'Entrando…' : <>Entrar <Ic n="arrow" s={20} w={2.2} className="arr" /></>}
            </button>
          </div>
        </form>
      </>
    );
  }

  return (
    <main className={`login ${emEtapa ? 'step' : ''}`}>
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
        <div className={`login-story ${emEtapa ? 'story-hide' : ''}`}>
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
            <h1>
              <Linhas linhas={p.frase.linhas} destaque={p.frase.destaque} base=".95s" />
            </h1>
            <p className="fade-up" style={{ animationDelay: '1.35s' }}>{p.subtitulo}</p>
            {p.rodape && (
              <div className="facts-n desk fade-up" style={{ animationDelay: '1.5s' }}>
                {p.rodape.map((f) => (
                  <div key={f.rotulo}>
                    <b>{f.rotulo}</b>
                    {f.texto}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="login-panel mob fade-up" style={{ animationDelay: '1.55s' }}>{botoesAbertura}</div>
        </div>
        <div className="login-side">{lado}</div>
      </div>
    </main>
  );
}
