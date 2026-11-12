'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/apiClient';
import { ActionButton, useConfirm, useToast } from '@/components/async';

interface Previa {
  janelaDias: number;
  avaliacoes: number;
  atrasadas: number;
  semGestor: number;
  gestores: number;
  gestoresComCelular: number;
}

interface Envio {
  avaliacoes: number;
  gestores: number;
  avisos: number;
  repetidos: number;
  push: { enviados: number; falhas: number };
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * "Lembrar gestores agora" — manda na hora o lembrete de cada avaliação
 * atrasada ou que vence em até 7 dias para os gestores da equipe, sem esperar
 * os dias fixos da rotina diária. A confirmação mostra antes o que vai sair.
 */
export function LembrarGestores() {
  const confirmar = useConfirm();
  const { mostrar } = useToast();
  const [ocupado, setOcupado] = useState(false);

  const lembrar = async () => {
    if (ocupado) return;
    setOcupado(true);
    try {
      const p = await apiFetch<Previa>('/api/admin/notifications/reminders');
      if (p.avaliacoes === 0) {
        mostrar(`Nenhuma avaliação atrasada ou vencendo nos próximos ${p.janelaDias} dias.`);
        return;
      }
      const vencendo = p.avaliacoes - p.atrasadas;
      const composicao = p.atrasadas === 0
        ? `todas vencendo em até ${p.janelaDias} dias`
        : vencendo === 0
          ? (p.avaliacoes === 1 ? 'atrasada' : 'todas atrasadas')
          : `${p.atrasadas} ${p.atrasadas === 1 ? 'atrasada' : 'atrasadas'} e ${vencendo} vencendo em até ${p.janelaDias} dias`;
      const semCelular = p.gestores - p.gestoresComCelular;
      const frases = [
        `${plural(p.avaliacoes, 'avaliação', 'avaliações')} (${composicao}) vão para ${plural(p.gestores, 'gestor', 'gestores')}, cada um só com as da própria equipe.`,
        `Chega no sino do site${p.gestoresComCelular > 0 ? ` e no celular de ${p.gestoresComCelular}` : ''}.`,
      ];
      if (semCelular > 0) {
        frases.push(semCelular === 1
          ? '1 gestor ainda não ativou o aviso no celular e só vai ver ao entrar no site.'
          : `${semCelular} gestores ainda não ativaram o aviso no celular e só vão ver ao entrar no site.`);
      }
      if (p.semGestor > 0) {
        frases.push(p.semGestor === 1
          ? '1 avaliação não tem gestor com conta no escopo e não vai para ninguém.'
          : `${p.semGestor} avaliações não têm gestor com conta no escopo e não vão para ninguém.`);
      }
      frases.push('Quem já foi lembrado hoje de uma avaliação não recebe de novo.');
      const ok = await confirmar({ titulo: 'Lembrar os gestores agora?', texto: frases.join(' '), acao: 'Enviar lembretes' });
      if (!ok) return;
      const r = await apiFetch<Envio>('/api/admin/notifications/reminders', { method: 'POST' });
      if (r.avisos === 0) {
        mostrar('Nada novo: os gestores já foram lembrados hoje dessas avaliações.');
      } else {
        mostrar(`Lembretes enviados: ${plural(r.avisos, 'aviso', 'avisos')} para ${plural(r.gestores, 'gestor', 'gestores')}`
          + (r.push.enviados > 0 ? `, ${r.push.enviados} no celular.` : '.'));
      }
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Não foi possível enviar os lembretes.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <ActionButton className="btn-ghost" pending={ocupado} pendingLabel="Conferindo..." onClick={lembrar}>
      Lembrar gestores agora
    </ActionButton>
  );
}
