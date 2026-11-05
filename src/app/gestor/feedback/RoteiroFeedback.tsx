const PILARES: { titulo: string; grupos: { nome?: string; itens: string[] }[] }[] = [
  {
    titulo: '1. Habilidade técnica',
    grupos: [{ itens: ['Conhecimento do cardápio', 'Técnicas de venda e estímulo de vendas', 'Domínio de bebidas (drinks e vinhos)'] }],
  },
  {
    titulo: '2. Habilidade comportamental',
    grupos: [
      { nome: 'Interna (equipe)', itens: ['Gestão de conflitos', 'Inteligência emocional', 'Equilíbrio comportamental', 'Aceitação de feedbacks e cobranças'] },
      {
        nome: 'Externa (cliente)',
        itens: [
          'Gentileza, educação e atenção',
          'Agilidade no atendimento',
          'Compreensão da cultura de serviço da empresa',
          'Prática de hospitalidade genuína (foco em proporcionar bem-estar ao cliente)',
        ],
      },
    ],
  },
  {
    titulo: '3. Habilidade operacional',
    grupos: [{
      itens: [
        'Organização do setor',
        'Redução de erros operacionais',
        'Limpeza e padronização',
        'Execução correta do serviço (louças, entrega e retirada de mesas)',
        'Cumprimento da sequência de serviço',
        'Zelo pelo ambiente de trabalho',
      ],
    }],
  },
];

function Lista({ itens }: { itens: string[] }) {
  return (
    <ul className="list-disc pl-5 space-y-1 text-sm text-spot-gray-800">
      {itens.map((i) => <li key={i}>{i}</li>)}
    </ul>
  );
}

/** Roteiro do feedback (PDI) usado nas unidades Paulista e JK. */
export function RoteiroFeedback() {
  return (
    <details className="rounded-card border border-spot-gray-300 bg-white group">
      <summary className="cursor-pointer select-none min-h-11 px-4 py-3 flex items-center justify-between gap-3">
        <span>
          <span className="block font-semibold text-sm">Roteiro do feedback · Paulista e JK</span>
          <span className="block text-xs text-spot-gray-500">Plano de Desenvolvimento Individual (PDI), com revisão a cada 3 meses</span>
        </span>
        <span aria-hidden className="text-spot-gray-500 text-xs group-open:rotate-180 transition-transform">▼</span>
      </summary>

      <div className="px-4 pb-5 pt-1 flex flex-col gap-5 border-t border-spot-gray-300">
        <section className="pt-4">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-800 mb-2">Avaliação de desempenho</h3>
          <p className="text-sm text-spot-gray-800 mb-3">A análise do colaborador é feita com base nos seguintes pilares:</p>
          <div className="grid gap-4 md:grid-cols-3">
            {PILARES.map((p) => (
              <div key={p.titulo} className="flex flex-col gap-2">
                <p className="text-sm font-semibold">{p.titulo}</p>
                {p.grupos.map((g, i) => (
                  <div key={i} className="flex flex-col gap-1">
                    {g.nome && <p className="text-xs font-semibold text-spot-gray-500">{g.nome}</p>}
                    <Lista itens={g.itens} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-spot-gray-800 mb-2">Plano de desenvolvimento</h3>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold">1. Objetivo profissional</p>
              <p className="text-sm text-spot-gray-800">
                Desenvolver o colaborador para atingir excelência no atendimento, com alto padrão técnico, comportamental e operacional.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold">2. Competências a desenvolver</p>
              <p className="text-xs font-semibold text-spot-gray-500">Técnicas</p>
              <Lista itens={['Conhecimento aprofundado do cardápio', 'Domínio de drinks e vinhos (nível básico de sommelier)']} />
              <p className="text-xs font-semibold text-spot-gray-500">Comportamentais</p>
              <Lista itens={['Liderança', 'Inteligência emocional', 'Comunicação assertiva']} />
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold">3. Plano de ação (metodologia 70/20/10)</p>
              <p className="text-xs font-semibold text-spot-gray-500">70% · Prática (on the job)</p>
              <Lista itens={['Aplicação diária dos aprendizados', 'Foco em melhoria contínua no atendimento']} />
              <p className="text-xs font-semibold text-spot-gray-500">20% · Mentoria</p>
              <Lista itens={['Acompanhamento com o gestor', 'Desenvolvimento comportamental', 'Apoio na resolução de conflitos']} />
              <p className="text-xs font-semibold text-spot-gray-500">10% · Estudo</p>
              <Lista itens={['Materiais fornecidos pela empresa', 'Aulas de vinho e bar', 'Leitura recomendada: A Arte de Servir']} />
            </div>
          </div>
        </section>
      </div>
    </details>
  );
}
