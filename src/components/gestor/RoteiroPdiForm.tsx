'use client';

import { useId } from 'react';
import { RATING_OPTIONS, RATING_LABELS, type RatingOption } from '@/data/evaluationBank';
import {
  PILARES_ROTEIRO, COMPETENCIAS_ROTEIRO, PLANO_70_20_10, OBJETIVO_PROFISSIONAL,
  type PilarRoteiro, type PlanoRoteiro,
} from '@/data/roteiroPdi';
import { ChoiceGroup, ChoiceOption } from '@/components/forms/ChoiceGroup';

type Notas = Record<string, RatingOption | null>;
type Observacoes = Partial<Record<PilarRoteiro['key'], string>>;

/**
 * Roteiro de feedback (PDI) de Paulista e JK: uma nota por item em cada pilar
 * (técnico, comportamental e operacional), uma observação por pilar e o plano
 * de desenvolvimento 70/20/10. Ocupa o lugar das 4 dimensões da ficha padrão.
 */
export function RoteiroPdiForm({
  notas, onNota, observacoes, onObservacao, plano, onPlano, revisaoEm, mostrarErro, primeiroNome,
}: {
  notas: Notas;
  onNota: (key: string, v: RatingOption) => void;
  observacoes: Observacoes;
  onObservacao: (pilar: PilarRoteiro['key'], texto: string) => void;
  plano: PlanoRoteiro;
  onPlano: (p: PlanoRoteiro) => void;
  /** Data da revisão do PDI (3 meses depois), já formatada. */
  revisaoEm: string | null;
  mostrarErro: boolean;
  primeiroNome: string;
}) {
  const idErro = useId();
  const faltando = (p: PilarRoteiro) => p.grupos.some((g) => g.itens.some((i) => !notas[i.key]));

  return (
    <>
      <div className="card border-l-[3px] border-spot-yellow text-sm text-spot-gray-800 leading-relaxed">
        <p className="font-semibold">Roteiro de feedback · Paulista e JK</p>
        <p className="mt-1">
          Dê uma nota a cada item, escreva o plano de desenvolvimento e conduza a conversa com {primeiroNome} a partir dele.
          O plano é revisado a cada 3 meses{revisaoEm ? <> — esta revisão fica para <strong>{revisaoEm}</strong></> : null}.
        </p>
      </div>

      {PILARES_ROTEIRO.map((p, idx) => (
        <div
          key={p.key}
          data-erro={mostrarErro && faltando(p) ? 'true' : undefined}
          className={`card flex flex-col gap-4 ${mostrarErro && faltando(p) ? 'ring-2 ring-spot-danger' : ''}`}
        >
          <p className="font-sans text-lg font-extrabold tracking-tight text-spot-gray-900">{idx + 1}. {p.nome}</p>

          {p.grupos.map((g, gi) => (
            <div key={gi} className="flex flex-col gap-3">
              {g.nome && <p className="text-xs font-semibold uppercase tracking-wide text-spot-gray-500">{g.nome}</p>}
              {g.itens.map((it) => (
                <ChoiceGroup
                  key={it.key}
                  legenda={<span className="block text-sm text-spot-gray-800 mb-2">{it.text}</span>}
                  invalido={mostrarErro && !notas[it.key]}
                  idDescricao={mostrarErro ? idErro : undefined}
                >
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {RATING_OPTIONS.map((opt) => (
                      <ChoiceOption
                        key={opt}
                        name={`roteiro-${it.key}`}
                        value={opt}
                        checked={notas[it.key] === opt}
                        onChange={() => onNota(it.key, opt)}
                        className={`flex items-center justify-center min-h-11 rounded-btn border px-3 py-2 text-sm font-semibold text-center transition active:scale-[0.97] ${
                          notas[it.key] === opt ? 'bg-spot-black text-spot-onBlack border-spot-black' : 'border-spot-gray-300 hover:border-spot-black text-spot-gray-700'
                        }`}
                      >
                        {RATING_LABELS[opt]}
                      </ChoiceOption>
                    ))}
                  </div>
                </ChoiceGroup>
              ))}
            </div>
          ))}

          <label className="block pt-1 border-t border-spot-gray-100">
            <span className="label">Observação sobre {p.nome.toLowerCase()} (opcional)</span>
            <textarea
              className="input min-h-[70px] resize-y"
              maxLength={3000}
              value={observacoes[p.key] ?? ''}
              onChange={(e) => onObservacao(p.key, e.target.value)}
            />
          </label>

          {mostrarErro && faltando(p) && (
            <p id={idErro} className="text-xs text-spot-danger">Dê uma nota a todos os itens deste pilar.</p>
          )}
        </div>
      ))}

      <div className="card flex flex-col gap-4">
        <p className="font-sans text-lg font-extrabold tracking-tight text-spot-gray-900">Plano de desenvolvimento</p>

        <div className="text-sm">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-500 mb-1">Objetivo profissional</p>
          <p className="text-spot-gray-800">{OBJETIVO_PROFISSIONAL}</p>
        </div>

        <fieldset className="min-w-0 border-0 p-0 m-0">
          <legend className="label">Competências a desenvolver</legend>
          <div className="flex flex-col gap-2 mt-2">
            {COMPETENCIAS_ROTEIRO.map((c) => {
              const marcada = plano.competencias.includes(c.key);
              return (
                <label
                  key={c.key}
                  className={`flex items-center gap-2.5 min-h-11 rounded-btn border px-3.5 py-2.5 cursor-pointer transition ${marcada ? 'border-spot-black bg-spot-gray-50' : 'border-spot-gray-300 hover:border-spot-gray-500'}`}
                >
                  <input
                    type="checkbox"
                    className="accent-spot-black"
                    checked={marcada}
                    onChange={() => onPlano({
                      ...plano,
                      competencias: marcada ? plano.competencias.filter((k) => k !== c.key) : [...plano.competencias, c.key],
                    })}
                  />
                  <span className="text-sm">
                    {c.text} <span className="text-xs text-spot-gray-500">· {c.grupo.toLowerCase()}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {PLANO_70_20_10.map((parte) => (
          <label key={parte.key} className="block">
            <span className="label">{parte.titulo}</span>
            <textarea
              className="input min-h-[80px] resize-y"
              maxLength={3000}
              placeholder={parte.dicas}
              value={plano[parte.key]}
              onChange={(e) => onPlano({ ...plano, [parte.key]: e.target.value })}
            />
          </label>
        ))}
      </div>
    </>
  );
}
