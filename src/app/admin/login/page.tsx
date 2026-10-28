'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { LoginCover } from '@/components/auth/LoginCover';
import { FirstAccessForm } from '@/components/auth/FirstAccessForm';
import { MfaStepForm } from '@/components/auth/MfaStepForm';
import { goAfterLogin } from '@/lib/loginRedirect';
import { parseFirstAccessHash } from '@/lib/userAccess';

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginForm />
    </Suspense>
  );
}

function AdminLoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Conta com verificação em duas etapas: depois da senha, pede o código do app.
  const [segundaEtapa, setSegundaEtapa] = useState(false);
  // Primeiro acesso de conta do RH: mesmo fluxo do portal dos gestores.
  const [primeiro, setPrimeiro] = useState<{ email: string; code: string } | null>(null);
  useEffect(() => {
    const lido = parseFirstAccessHash(window.location.hash);
    if (!lido) return;
    setPrimeiro(lido);
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ email, password, portal: 'admin' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Falha no login.');
      if (body.mfaRequired) {
        setSegundaEtapa(true);
        setPassword('');
        setLoading(false);
        return;
      }
      // Navegação de documento, não router.push — ver goAfterLogin().
      // `loading` fica ligado de propósito: a página está saindo.
      goAfterLogin(params.get('next'), '/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.');
      setLoading(false);
    }
  };

  return (
    <LoginCover
      eyebrow="Painel administrativo"
      title="O clima e as pessoas do Spot, por dentro"
      description="Pesquisas de clima, resultados, planos de ação, relatórios e configuração do sistema. Acesso de RH e Super Admin."
      sheetTitle={primeiro ? 'Primeiro acesso' : segundaEtapa ? 'Verificação em duas etapas' : 'Entrar'}
      sheetSubtitle={primeiro ? 'Crie a sua senha para usar o painel.' : 'Área administrativa — RH e Super Admin.'}
      abrir={Boolean(primeiro)}
    >
      {segundaEtapa ? (
        <MfaStepForm
          onSuccess={() => goAfterLogin(params.get('next'), '/admin')}
          onBack={() => setSegundaEtapa(false)}
        />
      ) : primeiro ? (
        <FirstAccessForm
          key={`${primeiro.email}|${primeiro.code}`}
          initialEmail={primeiro.email}
          initialCode={primeiro.code}
          onBack={() => setPrimeiro(null)}
        />
      ) : (
      <>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <label className="label" htmlFor="admin-email">E-mail</label>
          <input
            id="admin-email"
            type="email"
            required
            autoComplete="username"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="rh@restaurantespot.com.br"
          />
        </div>
        <div>
          <label className="label" htmlFor="admin-password">Senha</label>
          <div className="relative">
            <input
              id="admin-password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              className="input pr-16"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-spot-gray-500 hover:text-spot-gray-900 transition"
            >
              {showPassword ? 'Ocultar' : 'Ver'}
            </button>
          </div>
        </div>

        {error && (
          <p className="text-sm text-spot-danger bg-spot-white border-l-[3px] border-spot-danger px-3 py-2.5">{error}</p>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full mt-1">
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>

      <p className="text-xs text-spot-gray-500 mt-7 leading-relaxed">
        É gestor ou treinador? Seu acesso fica em{' '}
        <a href="/gestor/login" className="font-medium text-spot-gray-600 hover:text-spot-gray-900 underline underline-offset-2">
          Avaliações e Treinamentos
        </a>
        .
      </p>
      <button
        type="button"
        className="mt-3 text-xs text-spot-gray-600 hover:text-spot-gray-900 underline underline-offset-2 min-h-10"
        onClick={() => setPrimeiro({ email, code: '' })}
      >
        Primeiro acesso? Criar minha senha
      </button>
      </>
      )}
    </LoginCover>
  );
}
