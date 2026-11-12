'use client';

import { useEffect, useState } from 'react';

/**
 * Primeiro acesso: a pessoa cria a própria senha com o e-mail e o código que
 * o RH mandou. Pelo link da mensagem, e-mail e código já chegam preenchidos
 * e a tela só pede a senha (duas vezes).
 */

async function enviar(body: Record<string, string>) {
  const res = await fetch('/api/auth/first-access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, ...json } as {
    ok: boolean; status: number; error?: string; name?: string; home?: string; alreadyActive?: boolean;
  };
}

export function FirstAccessForm({
  initialEmail = '', initialCode = '', onBack,
}: { initialEmail?: string; initialCode?: string; onBack: () => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState(initialCode);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [nome, setNome] = useState<string | null>(null);
  const [conferindo, setConferindo] = useState(Boolean(initialEmail && initialCode));
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jaAtivo, setJaAtivo] = useState(false);

  // Veio pelo link: confere o código antes de pedir a senha, para cumprimentar
  // pelo nome — ou dizer logo que o link não vale mais.
  useEffect(() => {
    if (!initialEmail || !initialCode) return;
    let vivo = true;
    enviar({ email: initialEmail, code: initialCode })
      .then((r) => {
        if (!vivo) return;
        if (r.ok && r.name) setNome(r.name.split(/\s+/)[0]);
        else { setError(r.error ?? 'Não foi possível conferir o seu link.'); setJaAtivo(Boolean(r.alreadyActive)); }
      })
      .catch(() => vivo && setError('Sem conexão. Confira a internet e tente de novo.'))
      .finally(() => vivo && setConferindo(false));
    return () => { vivo = false; };
  }, [initialEmail, initialCode]);

  const curta = password.length > 0 && password.length < 8;
  const diferentes = confirm.length > 0 && confirm !== password;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (salvando) return;
    if (password.length < 8) { setError('A senha precisa ter ao menos 8 caracteres.'); return; }
    if (password !== confirm) { setError('As duas senhas não são iguais.'); return; }
    setSalvando(true);
    setError(null);
    try {
      const r = await enviar({ email, code, password });
      if (!r.ok) {
        setError(r.error ?? 'Não foi possível criar a senha.');
        setJaAtivo(Boolean(r.alreadyActive));
        setSalvando(false);
        return;
      }
      // Navegação de documento, como no login: descarta o cache de rotas do cliente.
      window.location.assign(r.home ?? '/gestor');
    } catch {
      setError('Sem conexão. Confira a internet e tente de novo.');
      setSalvando(false);
    }
  };

  if (conferindo) {
    return <p className="text-sm text-spot-gray-500" role="status">Conferindo o seu link de primeiro acesso...</p>;
  }

  const pelolink = Boolean(nome);

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm text-spot-gray-700 leading-relaxed">
        {pelolink
          ? <>Olá, <strong>{nome}</strong>! Crie a sua senha para entrar no Spot Integra.</>
          : 'Use o e-mail e o código de primeiro acesso que o RH mandou para você, e crie a sua senha.'}
      </p>

      {!pelolink && (
        <>
          <div>
            <label className="label" htmlFor="pa-email">E-mail</label>
            <input id="pa-email" type="email" required autoComplete="username" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="pa-codigo">Código de primeiro acesso</label>
            <input
              id="pa-codigo"
              required
              autoComplete="one-time-code"
              autoCapitalize="characters"
              placeholder="Ex.: ABCD-EFGH"
              className="input uppercase tracking-[0.15em]"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
        </>
      )}
      {pelolink && (
        // O navegador precisa do e-mail no formulário para salvar a senha junto.
        <input type="email" autoComplete="username" value={email} readOnly hidden />
      )}

      <div>
        <label className="label" htmlFor="pa-senha">Crie a sua senha</label>
        <div className="relative">
          <input
            id="pa-senha"
            type={show ? 'text' : 'password'}
            required
            minLength={8}
            autoComplete="new-password"
            className="input pr-16"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby="pa-senha-dica"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-pressed={show}
            aria-label={show ? 'Ocultar a senha' : 'Mostrar a senha em texto'}
            className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-spot-gray-500 hover:text-spot-gray-900 transition"
          >
            {show ? 'Ocultar' : 'Ver'}
          </button>
        </div>
        <p id="pa-senha-dica" className={`text-xs mt-1 ${curta ? 'text-spot-danger' : 'text-spot-gray-500'}`}>
          No mínimo 8 caracteres. É só sua: não compartilhe.
        </p>
      </div>
      <div>
        <label className="label" htmlFor="pa-confirma">Repita a senha</label>
        <input
          id="pa-confirma"
          type={show ? 'text' : 'password'}
          required
          autoComplete="new-password"
          className="input"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {diferentes && <p className="text-xs text-spot-danger mt-1">As duas senhas não são iguais.</p>}
      </div>

      {error && (
        <p role="alert" className="text-sm text-spot-danger bg-spot-white border-l-[3px] border-spot-danger px-3 py-2.5">{error}</p>
      )}

      {jaAtivo ? (
        <button type="button" className="btn-primary w-full mt-1" onClick={onBack}>Entrar com a minha senha</button>
      ) : (
        <button type="submit" disabled={salvando} className="btn-primary w-full mt-1">
          {salvando ? 'Criando a senha...' : 'Criar senha e entrar'}
        </button>
      )}
      <button type="button" className="text-sm text-spot-gray-500 hover:text-spot-gray-900 underline underline-offset-4 min-h-10" onClick={onBack}>
        Já tenho senha — voltar para entrar
      </button>
    </form>
  );
}
