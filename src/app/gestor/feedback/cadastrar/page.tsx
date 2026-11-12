'use client';

import Link from 'next/link';
import { CabecalhoPagina } from '@/components/ui/CabecalhoPagina';
import { CadastroFuncionario } from '@/components/forms/CadastroFuncionario';

/**
 * Cadastro de colaborador antigo, feito pelo responsável do setor dentro da aba
 * Feedback: quem já trabalha no Spot e nunca foi cadastrado entra direto no
 * feedback, sem passar por treinamento nem experiência.
 */
export default function CadastrarAntigoPage() {
  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Cadastrar colaborador antigo"
        subtitulo="Para quem já trabalha no Spot e ainda não está no sistema. Entra direto no Feedback."
        acao={<Link href="/gestor/feedback" className="btn-ghost">Voltar para o Feedback</Link>}
      />
      <CadastroFuncionario portal="gestor" soAntigo />
    </div>
  );
}
