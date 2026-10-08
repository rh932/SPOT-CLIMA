'use client';

import { Spinner } from './async';
import { usePush } from './usePush';

/**
 * Liga e desliga o aviso no celular (Web Push) para ESTE aparelho.
 *
 * Mora dentro do sino de propósito: é ali que a pessoa está quando pensa em
 * avisos, e um interruptor solto no cabeçalho seria mais um ícone sem
 * explicação numa barra já apertada.
 *
 * A inscrição é por aparelho, não por conta. Quem usa o celular e o
 * computador precisa ligar nos dois — e o texto diz isso, porque a dúvida
 * "liguei no celular, por que não chega no PC?" apareceria no primeiro dia.
 */

export function PushToggle({ portal }: { portal: 'admin' | 'gestor' }) {
  const { estado, ocupado, erro, ligar, desligar } = usePush(portal);

  if (estado === 'carregando' || estado === 'desconfigurado') return null;

  const aviso = (texto: string) => (
    <p className="text-xs text-spot-gray-500 leading-snug">{texto}</p>
  );

  return (
    <div className="px-4 py-3 border-t border-spot-gray-100 bg-spot-gray-50">
      {estado === 'instalar' && aviso(
        'Para receber aviso neste iPhone, toque em Compartilhar e escolha "Adicionar à Tela de Início". '
        + 'Depois abra o SPOT CLIMA por esse ícone e volte aqui.',
      )}

      {estado === 'indisponivel' && aviso('Este navegador não consegue receber avisos no aparelho.')}

      {estado === 'bloqueado' && aviso(
        'Os avisos estão bloqueados para este site. Libere nas configurações do navegador e volte aqui.',
      )}

      {(estado === 'ligado' || estado === 'desligado') && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Avisos neste aparelho</p>
              <p className="text-xs text-spot-gray-500">
                {estado === 'ligado' ? 'Ligados' : 'Desligados'} — vale só para este celular ou computador.
              </p>
            </div>
            <button
              type="button"
              onClick={estado === 'ligado' ? desligar : ligar}
              disabled={ocupado}
              aria-pressed={estado === 'ligado'}
              aria-busy={ocupado || undefined}
              className={`shrink-0 rounded-btn px-4 min-h-11 text-xs font-semibold transition disabled:opacity-50 inline-flex items-center justify-center gap-1.5 ${
                estado === 'ligado'
                  ? 'border border-spot-gray-300 text-spot-gray-700 hover:bg-spot-gray-100'
                  : 'bg-spot-yellow text-spot-onYellow hover:bg-spot-yellowDark'
              }`}
            >
              {/* Antes o rótulo pendente era só "...": ligar o push pede
                  permissão ao navegador e fala com o servidor, o que leva
                  segundos — e "..." não diz se algo está acontecendo. */}
              {ocupado && <Spinner className="h-3 w-3" />}
              {ocupado
                ? (estado === 'ligado' ? 'Desligando...' : 'Ligando...')
                : estado === 'ligado' ? 'Desligar' : 'Ligar'}
            </button>
          </div>
          {erro && <p role="alert" className="text-xs text-spot-danger">{erro}</p>}
        </div>
      )}
    </div>
  );
}
