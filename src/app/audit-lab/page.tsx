'use client';

/**
 * Laboratório de auditoria assíncrona — NÃO faz parte do produto.
 *
 * Monta as telas reais (os mesmos componentes que o gestor e o RH usam) com o
 * `fetch` do navegador trocado por um mock, para reproduzir à vontade:
 *   ?rede=lenta   → a resposta demora 4s (rede ruim de restaurante)
 *   ?rede=falha   → a API responde 500
 *   ?rede=mutacao-falha → lê bem, mas recusa gravações (testa o rollback)
 *   ?rede=vazio   → a API responde 200 com lista vazia
 *   ?rede=ok      → resposta imediata
 *
 * A rota responde 404 fora de desenvolvimento (ver o guard abaixo): é uma
 * bancada de teste, não uma porta de entrada.
 */

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { notFound } from 'next/navigation';
import { FIXTURES, VAZIO } from './fixtures';
import { auditarControles } from './auditarControles';
import { ConfirmProvider, ToastProvider } from '@/components/async';

import GestorDashboardPage from '../gestor/page';
import TreinamentoPage from '../gestor/treinamento/page';
import AdminEmployeesPage from '../admin/employees/page';
import AdminUsersPage from '../admin/users/page';
import GestorLoginPage from '../gestor/login/page';
import AdminSurveysPage from '../admin/surveys/page';
import EvaluatePage from '../gestor/employees/[id]/evaluate/page';
import AdminSectorsPage from '../admin/sectors/page';
import AdminActionPlansPage from '../admin/action-plans/page';
import AdminTemplatesPage from '../admin/templates/page';
import GestorEmployeePage from '../gestor/employees/[id]/page';
import AdminOverviewPage from '../admin/page';
import AdminResultsPage from '../admin/results/page';
import AdminCommentsPage from '../admin/comments/page';
import { AdminChrome } from '../admin/AdminChrome';
import { GestorChrome } from '../gestor/GestorChrome';
import { QuestionListEditor } from '@/components/admin/QuestionListEditor';
import { QuestionField, type AnswerValue } from '@/components/survey/QuestionField';
import { PERGUNTAS_EXEMPLO, PERGUNTAS_PESQUISA } from './fixtures';

/**
 * O editor de perguntas é um componente, não uma página: montá-lo direto é o
 * jeito honesto de auditar os botões de reordenar, que só existem nele.
 */
function PerguntasBancada() {
  return (
    <QuestionListEditor
      questions={PERGUNTAS_EXEMPLO}
      canEdit
      onEdit={() => {}}
      onReorder={() => {}}
      onDelete={() => {}}
    />
  );
}

/** Os quatro tipos de resposta da pesquisa publica, para auditar os rotulos. */
function CamposPesquisaBancada() {
  const [respostas, setRespostas] = useState<Record<string, AnswerValue>>({});
  return (
    <div className="flex flex-col gap-4">
      {PERGUNTAS_PESQUISA.map((q) => (
        <QuestionField
          key={q.id}
          question={q}
          value={respostas[q.id]}
          onChange={(v) => setRespostas((p) => ({ ...p, [q.id]: v }))}
          showError={false}
        />
      ))}
    </div>
  );
}

const TELAS: Record<string, () => JSX.Element> = {
  campos: CamposPesquisaBancada,
  gestor: GestorDashboardPage as () => JSX.Element,
  treinamento: TreinamentoPage as () => JSX.Element,
  employees: AdminEmployeesPage as () => JSX.Element,
  usuarios: AdminUsersPage as () => JSX.Element,
  login: GestorLoginPage as () => JSX.Element,
  surveys: AdminSurveysPage as () => JSX.Element,
  avaliar: EvaluatePage as () => JSX.Element,
  setores: AdminSectorsPage as () => JSX.Element,
  planos: AdminActionPlansPage as () => JSX.Element,
  modelos: AdminTemplatesPage as () => JSX.Element,
  // A ficha e a unica tela do mapa que recebe params da rota; sem eles ela
  // quebrava em params.id antes de desenhar qualquer coisa.
  ficha: () => <GestorEmployeePage params={{ id: 'func-0' }} />,
  visao: AdminOverviewPage as () => JSX.Element,
  resultados: AdminResultsPage as () => JSX.Element,
  comentarios: AdminCommentsPage as () => JSX.Element,
  perguntas: PerguntasBancada,
};

/** `?chrome=admin|gestor` monta a tela dentro do menu real do portal. */
const CHROMES: Record<string, (p: { children: React.ReactNode }) => JSX.Element> = {
  admin: AdminChrome,
  gestor: GestorChrome,
};

const ATRASO_LENTO = 4000;

function instalarMock() {
  const w = window as unknown as { __auditOriginalFetch?: typeof fetch };
  w.__auditOriginalFetch ??= window.fetch.bind(window);
  const original = w.__auditOriginalFetch!;

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    // Só intercepta as chamadas de API da aplicação; o resto (RSC, assets) passa.
    if (!url.includes('/api/')) return original(input as RequestInfo, init);

    // Lido a CADA chamada: o parâmetro da URL é a fonte da verdade, e assim
    // trocar ?rede= não exige reinstalar o mock.
    const rede = new URLSearchParams(window.location.search).get('rede') ?? 'ok';
    const caminho = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const responder = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

    // `atraso` vale em qualquer cenário: dá para combinar rede lenta COM falha
    // de gravação, que é onde o otimismo aparece — a tela muda na hora e só
    // volta atrás quando a recusa chega, segundos depois.
    const atrasoPedido = Number(new URLSearchParams(window.location.search).get('atraso'));
    const ms = atrasoPedido || (rede === 'lenta' ? ATRASO_LENTO : 0);
    if (ms > 0) await new Promise((r) => setTimeout(r, ms));
    if (rede === 'falha') {
      return responder({ error: 'Não foi possível falar com o servidor. Tente de novo.' }, 500);
    }

    const tabela = rede === 'vazio' ? VAZIO : FIXTURES;
    if (init?.method && init.method !== 'GET') {
      // `mutacao-falha`: a LEITURA funciona e só a GRAVAÇÃO quebra. É o único
      // jeito de exercitar o rollback do otimismo — a lista precisa existir
      // antes de a alteração ser recusada.
      if (rede === 'mutacao-falha') return responder({ error: 'O servidor recusou a alteração.' }, 500);
      return responder({ ok: true, count: 3 });
    }
    const fixture = tabela[caminho];
    if (fixture === undefined) return responder({ error: `Sem fixture para ${caminho}` }, 404);
    return responder(fixture);
  }) as typeof fetch;
}

export default function AuditPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <Suspense fallback={null}>
      <Bancada />
    </Suspense>
  );
}

function Bancada() {
  const params = useSearchParams();
  const rede = params.get('rede') ?? 'ok';
  const tela = params.get('tela') ?? 'gestor';

  // Instalado durante a RENDERIZAÇÃO do pai, antes de qualquer efeito do filho
  // — é o único momento em que dá para garantir que o primeiro fetch da tela
  // já cai no mock.
  useState(() => {
    if (typeof window === 'undefined') return null;
    instalarMock();
    // Auditor de rótulos disponível no console da bancada.
    (window as unknown as { auditarControles?: typeof auditarControles }).auditarControles = auditarControles;
    return null;
  });

  const Tela = TELAS[tela] ?? TELAS.gestor;
  const chrome = params.get('chrome');
  const Chrome = chrome ? CHROMES[chrome] : null;

  const conteudo = (
    <ToastProvider>
      <ConfirmProvider>
        <Tela />
      </ConfirmProvider>
    </ToastProvider>
  );

  return (
    <div className="min-h-dvh bg-spot-gray-50">
      <div data-bancada className="bg-spot-black text-spot-onBlack text-xs px-4 py-2 flex flex-wrap gap-x-4 gap-y-1">
        <span className="font-bold">BANCADA</span>
        <span>tela: <strong>{tela}</strong></span>
        <span>rede: <strong>{rede}</strong>{rede === 'lenta' ? ` (${ATRASO_LENTO}ms)` : ''}</span>
        {chrome && <span>menu: <strong>{chrome}</strong></span>}
      </div>
      {Chrome ? <Chrome>{conteudo}</Chrome> : <div className="max-w-3xl mx-auto px-4 py-6">{conteudo}</div>}
    </div>
  );
}
