'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { LoginCinematico } from '@/components/brand/LoginCinematico';
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

  // O fetch e o redirecionamento são os mesmos de antes: a tela nova só
  // entrega e-mail e senha e mostra o que voltar.
  const submit = async ({ email, senha }: { email: string; senha: string }) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ email, password: senha, portal: 'gestor' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Falha no login.');
      if (body.mfaRequired) {
        setSegundaEtapa(true);
        return;
      }
      // Navegação de documento, não router.push — ver goAfterLogin().
      goAfterLogin(params.get('next'), '/gestor');
      // Fica em "Entrando…" até a página trocar.
      return await new Promise<never>(() => undefined);
    } catch (err) {
      return { erro: err instanceof Error ? err.message : 'Erro inesperado.' };
    }
  };

  const extra = segundaEtapa ? (
    <MfaStepForm
      noite
      onSuccess={() => goAfterLogin(params.get('next'), '/gestor')}
      onBack={() => setSegundaEtapa(false)}
    />
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
      eyebrow="INTEGRA"
      frase={{ linhas: ['Sua equipe,', 'do primeiro', 'dia em diante.'], destaque: 'primeiro' }}
      subtitulo="Avaliações de 45 e 90 dias, feedbacks e treinamentos, no seu bolso."
      rodape={[
        { rotulo: '01 · PRAZOS', texto: 'Cada ciclo de 45 e 90 dias com o prazo à vista.' },
        { rotulo: '02 · UMA PERGUNTA POR VEZ', texto: 'Avaliação rápida, salva enquanto você responde.' },
        { rotulo: '03 · HISTÓRICO', texto: 'Tudo registrado para o RH na hora.' },
      ]}
      area={{ rotulo: 'Área do gestor', titulo: 'Acesse sua conta', texto: 'Use o e-mail corporativo cadastrado pelo RH.' }}
      textoSeguro="Ambiente exclusivo para gestores Spot"
      dicaSenha="Esqueceu a senha? Peça ao RH para gerar uma nova na aba Usuários."
      onSubmit={submit}
      acaoSecundaria={{ rotulo: 'Primeiro acesso?', destaque: 'Criar senha', onClick: (em) => setPrimeiro({ email: em, code: '' }) }}
      painelExtra={extra}
      tituloExtra={primeiro ? 'Primeiro acesso' : 'Verificação em duas etapas'}
      onVoltarExtra={() => (segundaEtapa ? setSegundaEtapa(false) : setPrimeiro(null))}
    />
  );
}
