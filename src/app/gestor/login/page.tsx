'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { LoginCover } from '@/components/auth/LoginCover';
import { FirstAccessForm } from '@/components/auth/FirstAccessForm';
import { MfaStepForm } from '@/components/auth/MfaStepForm';
import { goAfterLogin } from '@/lib/loginRedirect';
import { parseFirstAccessHash } from '@/lib/userAccess';

export default function GestorLoginPage() {
  return (
    <Suspense fallback={null}>
      <GestorLoginForm />
    </Suspense>
  );
}

function GestorLoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Conta com verificação em duas etapas: depois da senha, pede o código do app.
  const [segundaEtapa, setSegundaEtapa] = useState(false);
  // Primeiro acesso: a pessoa cria a própria senha com o código do RH.
  const [primeiro, setPrimeiro] = useState<{ email: string; code: string } | null>(null);

  // O link da mensagem traz "#primeiro-acesso?email=...&codigo=...". O código
  // sai da barra de endereço assim que é lido.
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
        body: JSON.stringify({ email, password, portal: 'gestor' }),
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
      goAfterLogin(params.get('next'), '/gestor');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.');
      setLoading(false);
    }
  };

  return (
    <LoginCover
      eyebrow="Avaliações e treinamentos"
      title="A sua equipe, do primeiro dia em diante"
      description="Avaliações de 45 e 90 dias, feedbacks e treinamentos dos colaboradores dos seus setores, unidades e turno — com o prazo de cada ciclo à vista."
      sheetTitle={primeiro ? 'Primeiro acesso' : segundaEtapa ? 'Verificação em duas etapas' : 'Entrar'}
      sheetSubtitle={primeiro ? 'Crie a sua senha para usar o portal.' : 'Acesso de Gestor, Gestor Líder, Treinador e Super Admin.'}
      abrir={Boolean(primeiro)}
      acaoSecundaria={{ rotulo: 'Primeiro acesso? Criar minha senha', onClick: () => setPrimeiro({ email, code: '' }) }}
    >
      {segundaEtapa ? (
        <MfaStepForm
          onSuccess={() => goAfterLogin(params.get('next'), '/gestor')}
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
              <label className="label" htmlFor="gestor-email">E-mail</label>
              <input
                id="gestor-email"
                type="email"
                required
                autoComplete="username"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="gestor-password">Senha</label>
              <div className="relative">
                <input
                  id="gestor-password"
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

          {/* O segundo caminho do painel: quem recebeu o código do RH e ainda não tem senha. */}
          <button
            type="button"
            className="mt-5 w-full rounded-btn border border-spot-gray-300 min-h-11 px-4 text-sm font-semibold text-spot-gray-900 hover:bg-spot-gray-100 transition"
            onClick={() => setPrimeiro({ email, code: '' })}
          >
            Primeiro acesso? Criar minha senha
          </button>

          <p className="text-xs text-spot-gray-500 mt-6 leading-relaxed">
            Esqueceu a senha? Peça ao RH para gerar uma nova na aba Usuários.
          </p>
        </>
      )}
    </LoginCover>
  );
}
