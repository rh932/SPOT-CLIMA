'use client';

import Link from 'next/link';
import { CabecalhoPagina } from '@/components/ui/CabecalhoPagina';
import { CadastroFuncionario } from '@/components/forms/CadastroFuncionario';

/** Cadastro único de colaborador (novos e ativos) pelo painel administrativo. */
export default function CadastrarFuncionarioPage() {
  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Cadastrar Funcionário"
        subtitulo="Cada pessoa é cadastrada uma vez só e alimenta treinamento, avaliação e feedback."
        acao={<Link href="/admin/employees/importar" className="btn-ghost">Importar planilha</Link>}
      />
      <CadastroFuncionario portal="admin" />
    </div>
  );
}
