'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/apiClient';
import { ActionButton, ErrorState, SkeletonText, useToast } from '@/components/async';

interface MfaStatus {
  enabled: boolean;
  enabledAt: string | null;
  recoveryLeft: number;
}

type Etapa =
  | { tipo: 'parado' }
  | { tipo: 'qr'; qrDataUrl: string; secret: string }
  | { tipo: 'codigos'; codes: string[] }
  | { tipo: 'desligar' }
  | { tipo: 'novos-codigos' };

/**
 * "Minha conta → verificação em duas etapas". Cada pessoa liga na própria
 * conta; o Super Admin só consegue zerar a de outra pessoa (aba Usuários),
 * nunca ligar por ela — o celular é de quem entra.
 */
export function MfaSettingsCard() {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [etapa, setEtapa] = useState<Etapa>({ tipo: 'parado' });
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, setPendente] = useState(false);
  const { mostrar } = useToast();

  const carregar = useCallback(() => {
    setErroCarga(null);
    apiFetch<MfaStatus>('/api/admin/account/mfa')
      .then(setStatus)
      .catch((e) => setErroCarga(e instanceof Error ? e.message : 'Erro ao carregar.'));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const chamar = async <T,>(body: Record<string, unknown>): Promise<T | null> => {
    setPendente(true);
    setErro(null);
    try {
      return await apiFetch<T>('/api/admin/account/mfa', { method: 'POST', body: JSON.stringify(body) });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível concluir.');
      return null;
    } finally {
      setPendente(false);
    }
  };

  const iniciar = async () => {
    const r = await chamar<{ qrDataUrl: string; secret: string }>({ action: 'setup' });
    if (r) { setCode(''); setEtapa({ tipo: 'qr', ...r }); }
  };

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await chamar<{ recoveryCodes: string[] }>({ action: 'enable', code });
    if (r) { setCode(''); setEtapa({ tipo: 'codigos', codes: r.recoveryCodes }); carregar(); mostrar('Verificação em duas etapas ligada.'); }
  };

  const gerarNovos = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await chamar<{ recoveryCodes: string[] }>({ action: 'recovery', code });
    if (r) { setCode(''); setEtapa({ tipo: 'codigos', codes: r.recoveryCodes }); carregar(); }
  };

  const desligar = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await chamar({ action: 'disable', password, code });
    if (r) { setCode(''); setPassword(''); setEtapa({ tipo: 'parado' }); carregar(); mostrar('Verificação em duas etapas desligada.'); }
  };

  const cancelar = () => { setEtapa({ tipo: 'parado' }); setCode(''); setPassword(''); setErro(null); };

  const campoCodigo = (id: string, permitirRecuperacao = false) => (
    <div>
      <label className="label" htmlFor={id}>{permitirRecuperacao ? 'Código do app (ou de recuperação)' : 'Código de 6 dígitos do app'}</label>
      <input
        id={id}
        required
        autoComplete="one-time-code"
        inputMode={permitirRecuperacao ? 'text' : 'numeric'}
        maxLength={permitirRecuperacao ? 9 : 6}
        className="input max-w-[12rem] text-center tracking-[0.3em] uppercase"
        value={code}
        onChange={(e) => setCode(permitirRecuperacao ? e.target.value : e.target.value.replace(/\D/g, ''))}
      />
    </div>
  );

  const mensagemErro = erro && <p role="alert" className="text-sm text-spot-danger">{erro}</p>;

  return (
    <div className="card flex flex-col gap-4" id="duas-etapas">
      <div>
        <p className="font-semibold">Verificação em duas etapas</p>
        <p className="text-sm text-spot-gray-500">
          Além da senha, o login pede um código do celular. Quem descobrir a sua senha não entra sem o seu aparelho.
        </p>
      </div>

      {erroCarga ? (
        <ErrorState message={erroCarga} onRetry={carregar} />
      ) : !status ? (
        <SkeletonText lines={2} />
      ) : etapa.tipo === 'qr' ? (
        <form onSubmit={confirmar} className="flex flex-col gap-4">
          <ol className="text-sm text-spot-gray-600 list-decimal pl-5 flex flex-col gap-1">
            <li>Instale um app autenticador no celular (Google Authenticator, Microsoft Authenticator ou Authy).</li>
            <li>No app, toque em adicionar e leia o QR code abaixo.</li>
            <li>Digite o código de 6 dígitos que aparecer.</li>
          </ol>
          {/* eslint-disable-next-line @next/next/no-img-element -- data: URI gerada no servidor, não passa pelo otimizador */}
          <img
            src={etapa.qrDataUrl}
            alt="QR code para o app autenticador"
            width={192}
            height={192}
            className="w-48 h-48 bg-white p-2 border border-spot-gray-200"
          />
          <p className="text-xs text-spot-gray-500">
            Sem câmera? Digite esta chave no app: <code className="font-mono text-spot-gray-900 select-all">{etapa.secret}</code>
          </p>
          {campoCodigo('mfa-ativar')}
          {mensagemErro}
          <div className="flex gap-2 flex-wrap">
            <ActionButton type="submit" className="btn-primary" pending={pendente} pendingLabel="Conferindo...">Ligar</ActionButton>
            <button type="button" className="btn-ghost" onClick={cancelar}>Cancelar</button>
          </div>
        </form>
      ) : etapa.tipo === 'codigos' ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-spot-gray-900">
            <strong>Guarde estes códigos de recuperação</strong> (imprima ou anote num lugar seguro). Cada um entra uma vez,
            se você ficar sem o celular. Eles não aparecem de novo.
          </p>
          <ul className="grid grid-cols-2 gap-2 font-mono text-sm bg-spot-gray-50 p-3 border border-spot-gray-200">
            {etapa.codes.map((c) => <li key={c} className="select-all">{c}</li>)}
          </ul>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => navigator.clipboard?.writeText(etapa.codes.join('\n')).then(() => mostrar('Códigos copiados.'))}
            >
              Copiar códigos
            </button>
            <button type="button" className="btn-primary" onClick={cancelar}>Já guardei</button>
          </div>
        </div>
      ) : etapa.tipo === 'desligar' ? (
        <form onSubmit={desligar} className="flex flex-col gap-4">
          <p className="text-sm text-spot-gray-600">Para desligar, confirme a senha e um código.</p>
          <div>
            <label className="label" htmlFor="mfa-senha">Senha</label>
            <input id="mfa-senha" type="password" required autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {campoCodigo('mfa-desligar', true)}
          {mensagemErro}
          <div className="flex gap-2 flex-wrap">
            <ActionButton type="submit" className="btn-danger" pending={pendente} pendingLabel="Desligando...">Desligar</ActionButton>
            <button type="button" className="btn-ghost" onClick={cancelar}>Cancelar</button>
          </div>
        </form>
      ) : etapa.tipo === 'novos-codigos' ? (
        <form onSubmit={gerarNovos} className="flex flex-col gap-4">
          <p className="text-sm text-spot-gray-600">Os códigos de recuperação antigos deixam de valer.</p>
          {campoCodigo('mfa-novos')}
          {mensagemErro}
          <div className="flex gap-2 flex-wrap">
            <ActionButton type="submit" className="btn-primary" pending={pendente} pendingLabel="Gerando...">Gerar novos códigos</ActionButton>
            <button type="button" className="btn-ghost" onClick={cancelar}>Cancelar</button>
          </div>
        </form>
      ) : status.enabled ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            <span className="badge badge-excellent mr-2">Ligada</span>
            {status.recoveryLeft > 0
              ? `${status.recoveryLeft} código(s) de recuperação disponível(is).`
              : 'Nenhum código de recuperação sobrando — gere novos.'}
          </p>
          <div className="flex gap-2 flex-wrap">
            <button type="button" className="btn-ghost" onClick={() => { setErro(null); setEtapa({ tipo: 'novos-codigos' }); }}>
              Gerar novos códigos de recuperação
            </button>
            <button type="button" className="btn-ghost text-spot-danger" onClick={() => { setErro(null); setEtapa({ tipo: 'desligar' }); }}>
              Desligar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-spot-gray-600">Desligada. Recomendado para quem é RH ou Super Admin: essas contas veem todas as avaliações.</p>
          {mensagemErro}
          <div>
            <ActionButton className="btn-primary" pending={pendente} pendingLabel="Gerando QR code..." onClick={iniciar}>
              Ligar verificação em duas etapas
            </ActionButton>
          </div>
        </div>
      )}
    </div>
  );
}
