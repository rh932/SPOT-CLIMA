'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Segunda etapa do login: a senha já foi conferida e o servidor guardou um
 * desafio de 5 minutos. Aqui vai o código de 6 dígitos do app autenticador —
 * ou, sem o celular, um código de recuperação.
 */
export function MfaStepForm({ onSuccess, onBack }: { onSuccess: () => void; onBack: () => void }) {
  const [code, setCode] = useState('');
  const [recuperacao, setRecuperacao] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [recuperacao]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ code }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Desafio vencido ou excesso de tentativas: volta para a senha.
        if (res.status === 401 && /expirou/i.test(body.error ?? '')) {
          onBack();
          return;
        }
        throw new Error(body.error ?? 'Não foi possível confirmar o código.');
      }
      if (typeof body.recoveryLeft === 'number') {
        setAviso(
          body.recoveryLeft > 0
            ? `Você usou um código de recuperação. Restam ${body.recoveryLeft}. Gere novos em Configurações quando puder.`
            : 'Você usou o último código de recuperação. Gere novos em Configurações agora.',
        );
        setTimeout(onSuccess, 2500);
        return;
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.');
      setCode('');
      setEnviando(false);
      inputRef.current?.focus();
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm text-spot-gray-600 leading-relaxed">
        {recuperacao
          ? 'Digite um dos códigos de recuperação que você guardou quando ligou a verificação. Cada um vale uma vez.'
          : 'Abra o app autenticador no celular e digite o código de 6 dígitos do SPOT CLIMA.'}
      </p>
      <div>
        <label className="label" htmlFor="mfa-codigo">{recuperacao ? 'Código de recuperação' : 'Código do app'}</label>
        <input
          ref={inputRef}
          id="mfa-codigo"
          required
          autoComplete="one-time-code"
          inputMode={recuperacao ? 'text' : 'numeric'}
          pattern={recuperacao ? undefined : '\\d{6}'}
          maxLength={recuperacao ? 9 : 6}
          autoCapitalize={recuperacao ? 'characters' : 'off'}
          placeholder={recuperacao ? 'Ex.: ABCD-EFGH' : '000000'}
          className="input text-center text-lg tracking-[0.3em] uppercase"
          value={code}
          onChange={(e) => setCode(recuperacao ? e.target.value : e.target.value.replace(/\D/g, ''))}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-spot-danger bg-spot-white border-l-[3px] border-spot-danger px-3 py-2.5">{error}</p>
      )}
      {aviso && (
        <p role="status" className="text-sm text-spot-gray-900 bg-spot-white border-l-[3px] border-spot-warning px-3 py-2.5">{aviso}</p>
      )}

      <button type="submit" disabled={enviando} className="btn-primary w-full mt-1">
        {enviando ? 'Conferindo...' : 'Confirmar e entrar'}
      </button>
      <button
        type="button"
        className="text-sm text-spot-gray-500 hover:text-spot-gray-900 underline underline-offset-4 min-h-10"
        onClick={() => { setRecuperacao((v) => !v); setCode(''); setError(null); }}
      >
        {recuperacao ? 'Usar o código do app' : 'Estou sem o celular — usar código de recuperação'}
      </button>
      <button
        type="button"
        className="text-sm text-spot-gray-500 hover:text-spot-gray-900 underline underline-offset-4 min-h-10"
        onClick={onBack}
      >
        Voltar para o e-mail e a senha
      </button>
    </form>
  );
}
