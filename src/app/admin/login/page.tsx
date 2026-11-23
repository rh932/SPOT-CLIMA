'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { LoginCinematico } from '@/components/brand/LoginCinematico';
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

  // O fetch e o redirecionamento são os mesmos de antes: a tela nova só
  // entrega e-mail e senha e mostra o que voltar.
  const submit = async ({ email, senha }: { email: string; senha: string }) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ email, password: senha, portal: 'admin' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Falha no login.');
      if (body.mfaRequired) {
        setSegundaEtapa(true);
        return;
      }
      // Navegação de documento, não router.push — ver goAfterLogin().
      goAfterLogin(params.get('next'), '/admin');
      // Fica em "Entrando…" até a página trocar.
      return await new Promise<never>(() => undefined);
    } catch (err) {
      return { erro: err instanceof Error ? err.message : 'Erro inesperado.' };
    }
  };

  const extra = segundaEtapa ? (
    <MfaStepForm noite onSuccess={() => goAfterLogin(params.get('next'), '/admin')} onBack={() => setSegundaEtapa(false)} />
  ) : primeiro ? (
    <FirstAccessForm
      noite
      key={`${primeiro.email}|${primeiro.code}`}
      initialEmail={primeiro.email}
      initialCode={primeiro.code}
      onBack={() => setPrimeiro(null)}
    />
  ) : null;

  return (
    <LoginCinematico
      eyebrow="PAINEL DO RH"
      frase={{ linhas: ['A casa inteira,', 'num só', 'lugar.'], destaque: 'só' }}
      subtitulo="Pesquisa de clima, avaliações e equipes das duas casas, JK e Consolação."
      rodape={[
        { rotulo: '01 · CLIMA', texto: 'Resultados anônimos por unidade e setor.' },
        { rotulo: '02 · EXPERIÊNCIA', texto: 'Avaliações de 45 e 90 dias em dia.' },
        { rotulo: '03 · AÇÃO', texto: 'Planos de ação e relatórios para exportar.' },
      ]}
      area={{ rotulo: 'Painel do RH', titulo: 'Acesse sua conta', texto: 'Acesso de RH e Super Admin.' }}
      exemploEmail="rh@restaurantespot.com.br"
      textoSeguro="Ambiente exclusivo para o RH do Spot"
      onSubmit={submit}
      acaoSecundaria={{ rotulo: 'Primeiro acesso?', destaque: 'Criar senha', onClick: (em) => setPrimeiro({ email: em, code: '' }) }}
      outraArea={{ texto: 'É gestor ou treinador?', rotulo: 'Avaliações e Treinamentos', href: '/gestor/login' }}
      painelExtra={extra}
      tituloExtra={primeiro ? 'Primeiro acesso' : 'Verificação em duas etapas'}
      onVoltarExtra={() => (segundaEtapa ? setSegundaEtapa(false) : setPrimeiro(null))}
    />
  );
}
