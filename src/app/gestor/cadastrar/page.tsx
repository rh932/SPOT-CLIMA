'use client';

import { CabecalhoPagina } from '@/components/ui/CabecalhoPagina';
import { CadastroFuncionario } from '@/components/forms/CadastroFuncionario';

/** Cadastro único de colaborador, dentro do escopo (unidade, setor e turno) de quem cadastra. */
export default function CadastrarFuncionarioPage() {
  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Cadastrar Funcionário"
        subtitulo="Cada pessoa é cadastrada uma vez só e alimenta treinamento, avaliação e feedback."
      />
      <CadastroFuncionario portal="gestor" />
    </div>
  );
}
