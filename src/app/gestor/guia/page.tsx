import { CabecalhoPagina } from '@/components/ui/CabecalhoPagina';
import { Secao } from '@/components/ui/Secao';

/**
 * Treinamento do próprio painel: um passo a passo de cada aba, na ordem em
 * que a pessoa encontra as coisas. Estático de propósito — é texto de
 * referência, não depende de dados nem de permissões para carregar.
 *
 * "Quem vê" sai da matriz de permissões (src/lib/permissions.ts). A aba do
 * guia aparece para todos; cada seção diz quem tem acesso ao que descreve.
 */

interface Passo {
  titulo: string;
  texto: React.ReactNode;
}

interface Area {
  id: string;
  titulo: string;
  quemVe: string;
  resumo: string;
  passos: Passo[];
}

const AREAS: Area[] = [
  {
    id: 'entrar',
    titulo: 'Entrar, navegar e sair',
    quemVe: 'Quem vê: todos com acesso ao painel',
    resumo: 'O menu mostra só as abas liberadas para o seu acesso. Se uma aba não aparece, ela não é sua.',
    passos: [
      {
        titulo: 'Entre com seu usuário e senha',
        texto: 'A sessão dura 8 horas. Passado esse tempo, o painel pede para entrar de novo.',
      },
      {
        titulo: 'Use o menu',
        texto: 'No celular, as abas ficam numa faixa no topo, que você arrasta para o lado. No computador, o menu fica na barra da esquerda. A aba em que você está fica destacada.',
      },
      {
        titulo: 'Confira os avisos no sino',
        texto: 'O sino no topo reúne os lembretes de prazo e os feedbacks que vencem nos próximos 7 dias. Veja a seção "Avisos e lembretes".',
      },
      {
        titulo: 'Ligue os avisos no celular',
        texto: 'Quando o painel oferecer, toque para receber avisos no aparelho. Se os avisos estiverem bloqueados, libere-os pelo cadeado ao lado do endereço do navegador.',
      },
      {
        titulo: 'Saia ao fim do turno',
        texto: 'No celular, o botão Sair fica no topo. No computador, ele fica embaixo do menu.',
      },
    ],
  },
  {
    id: 'experiencia',
    titulo: 'Avaliação de experiência',
    quemVe: 'Quem vê: Gestor, Gerente, Gerente avaliador e Gestor Líder',
    resumo: 'Aba Experiência. Quem avalia é o gestor do turno. O Gestor Líder acompanha e não preenche.',
    passos: [
      {
        titulo: 'Abra a aba Experiência',
        texto: 'Aparecem quem está em contrato de experiência nos seus setores, unidades e turnos.',
      },
      {
        titulo: 'Leia os dois grupos',
        texto: '"Avaliação disponível" traz quem já pode ser avaliado. "Em experiência" traz quem ainda não chegou à janela. A avaliação abre 10 dias antes do fim do contrato.',
      },
      {
        titulo: 'Veja o aviso amarelo, se houver',
        texto: 'O número grande no topo indica avaliações que passaram do prazo de preenchimento, que é de 5 dias. Elas também aparecem em Pendências.',
      },
      {
        titulo: 'Abra a ficha da pessoa',
        texto: 'Toque no card. Ele abre a ficha do colaborador, não o formulário. É na ficha que estão a situação, a cor e o histórico.',
      },
      {
        titulo: 'Toque em "Fazer a avaliação"',
        texto: 'O botão fica no bloco "Próxima avaliação", junto com a data e o prazo. Se ele não aparecer, você acompanha, mas quem avalia é o gestor do turno.',
      },
      {
        titulo: 'Preencha a data e as duas perguntas abertas',
        texto: '"Data desta avaliação", "Quais os aspectos MAIS favoráveis do funcionário?" e "Quais os aspectos MENOS favoráveis do funcionário?".',
      },
      {
        titulo: 'Dê a nota de cada dimensão',
        texto: 'São quatro: Flexibilidade e Adaptação ao trabalho; Interesse e Compromisso; Relacionamento Interpessoal; Capacidade de Aprendizagem. Em cada uma, escolha Ótimo, Bom, Regular ou Ruim e responda as perguntas de Sim ou Não (algumas têm Talvez).',
      },
      {
        titulo: 'Escolha a classificação geral',
        texto: 'Uma das quatro frases, de "Fraco, sem possibilidades futuras" a "É uma excelente aquisição para a empresa".',
      },
      {
        titulo: 'Escolha a conclusão',
        texto: 'Efetivar, Demitir ou "+ 45 dias em caráter experimental". A opção de +45 dias só aparece na 1ª avaliação.',
      },
      {
        titulo: 'Preencha o desenvolvimento (opcional)',
        texto: 'Pontos de desenvolvimento, orientações dadas ao colaborador e necessidade de treinamento. Isso alimenta o histórico e a indicação de treinamento.',
      },
      {
        titulo: 'Toque em "Enviar avaliação"',
        texto: 'A pessoa sai da lista. Se houver uma próxima avaliação, a data dela aparece na ficha. A avaliação concluída vai para o Histórico.',
      },
      {
        titulo: 'Se o setor tem dois gestores',
        texto: 'A ficha mostra a resposta do outro gestor. Você pode avaliar o mesmo período pelo botão "Avaliar também o 1º/2º período". As duas respostas ficam na ficha.',
      },
    ],
  },
  {
    id: 'feedback',
    titulo: 'Feedback',
    quemVe: 'Quem vê: Gestor, Gerente, Gerente avaliador e Gestor Líder',
    resumo: 'Efetivados no ciclo de cores. Aparece só para quem trabalha em setor que usa o ciclo.',
    passos: [
      {
        titulo: 'Abra a aba Feedback',
        texto: 'Aparecem os efetivados no ciclo de cores. Quem dá baixa na avaliação de experiência entra aqui sozinho.',
      },
      {
        titulo: 'Leia os dois grupos',
        texto: '"Feedback para fazer" são os vencidos, com 15 dias para fazer. "Próximos feedbacks" têm a data no futuro.',
      },
      {
        titulo: 'Registre o feedback',
        texto: 'Abra a ficha e toque em "Registrar o feedback". O formulário é o mesmo da avaliação, sem a parte de conclusão.',
      },
      {
        titulo: 'Confira a próxima data',
        texto: 'Ao gravar, a próxima data é calculada pela cor da pessoa. Veja a seção "Classificação por cor".',
      },
    ],
  },
  {
    id: 'cor',
    titulo: 'Classificação por cor',
    quemVe: 'Quem muda: Gestor, Gerente, Gerente avaliador e Gestor Líder',
    resumo: 'Bloco da ficha do colaborador, em setores que usam o ciclo de cores.',
    passos: [
      {
        titulo: 'Entenda o que cada cor significa',
        texto: 'Vermelho: feedback a cada 45 dias. Amarelo: a cada 120 dias. Verde: a cada 180 dias.',
      },
      {
        titulo: 'Saiba quando a cor é liberada',
        texto: 'A cor só pode ser definida depois da 2ª avaliação de experiência, aos 90 dias. Antes disso, o bloco mostra o motivo do bloqueio.',
      },
      {
        titulo: 'Toque em "Classificar agora" ou "Mudar a classificação"',
        texto: 'Escolha a nova cor.',
      },
      {
        titulo: 'Escreva o motivo',
        texto: 'O campo "Motivo da mudança" é obrigatório. Diga o que mudou no desempenho ou na postura da pessoa.',
      },
      {
        titulo: 'Toque em "Confirmar mudança"',
        texto: 'A nova cor passa a valer para a data do próximo feedback.',
      },
    ],
  },
  {
    id: 'pendencias',
    titulo: 'Pendências',
    quemVe: 'Quem vê: Gestor, Gerente, Gerente avaliador e Gestor Líder',
    resumo: 'Tudo o que passou do prazo, montado sozinho a partir das datas. Some quando a pendência é resolvida.',
    passos: [
      {
        titulo: 'Abra a aba Pendências',
        texto: 'A lista se monta sozinha. Você não precisa lançar nada.',
      },
      {
        titulo: 'Veja as avaliações de experiência',
        texto: 'São as avaliações que não foram preenchidas em 5 dias depois de abertas.',
      },
      {
        titulo: 'Veja os feedbacks atrasados',
        texto: 'Feedbacks que venceram e já passaram dos 15 dias para fazer.',
      },
      {
        titulo: 'Veja os feedbacks dentro do prazo',
        texto: 'Feedbacks já vencidos que ainda estão no prazo de 15 dias.',
      },
      {
        titulo: 'Resolva pela ficha',
        texto: 'Toque no colaborador, faça a avaliação ou o feedback e volte. A pessoa sai da lista quando a lista carrega de novo.',
      },
      {
        titulo: 'Se você é Gestor Líder',
        texto: 'Para quem não avalia, esta aba mostra quem está devendo. Use-a para cobrar o gestor do turno.',
      },
    ],
  },
  {
    id: 'proximas',
    titulo: 'Próximas avaliações',
    quemVe: 'Quem vê: Gestor, Gerente, Gerente avaliador e Gestor Líder',
    resumo: 'Mostra o que vem aí. Útil para planejar a semana.',
    passos: [
      {
        titulo: 'Abra a aba Próximas avaliações',
        texto: 'Aparecem as pessoas com a próxima avaliação marcada, da mais próxima para a mais distante.',
      },
      {
        titulo: 'Veja o grupo de destaque',
        texto: '"Vencem em até 7 dias ou já venceram" aparece primeiro, com uma faixa amarela no topo.',
      },
      {
        titulo: 'Veja "Mais adiante"',
        texto: 'O restante da lista, para saber quem vem depois.',
      },
      {
        titulo: 'Faça a avaliação quando chegar a hora',
        texto: 'Pela ficha, você preenche a avaliação. Depois de registrada, a pessoa sai desta lista e a avaliação fica no Histórico.',
      },
    ],
  },
  {
    id: 'historico-avaliacoes',
    titulo: 'Histórico de avaliações',
    quemVe: 'Quem vê: Gestor, Gerente, Gerente avaliador e Gestor Líder',
    resumo: 'Todas as avaliações já registradas no seu escopo.',
    passos: [
      {
        titulo: 'Abra a aba Histórico de avaliações',
        texto: 'Aparecem todas as avaliações, da mais recente para a mais antiga.',
      },
      {
        titulo: 'Busque pelo nome',
        texto: 'Digite no campo "Buscar colaborador..." para filtrar a lista na hora.',
      },
      {
        titulo: 'Abra o colaborador',
        texto: 'Cada linha leva à ficha, onde fica a linha do tempo completa.',
      },
    ],
  },
  {
    id: 'ficha',
    titulo: 'Ficha do colaborador',
    quemVe: 'Quem vê: quem tem acesso aos funcionários do seu escopo',
    resumo: 'Para onde todas as abas levam. É aqui que se faz, corrige e acompanha.',
    passos: [
      {
        titulo: 'Leia a situação no topo',
        texto: 'Cargo, setor, unidade, turno, situação atual e data de admissão.',
      },
      {
        titulo: 'Veja o prazo em destaque',
        texto: 'O bloco principal mostra a próxima avaliação ou o próximo feedback, com a data, quantos dias faltam e o selo de prazo.',
      },
      {
        titulo: 'Acompanhe a linha do tempo',
        texto: 'Admissão, avaliações, mudanças de cor e treinamentos, com a data e quem registrou.',
      },
      {
        titulo: 'Corrija a classificação, se precisar',
        texto: 'O bloco "Classificação por cor" permite mudar a cor. Veja a seção correspondente.',
      },
      {
        titulo: 'Excluir colaborador (só Gestor Líder)',
        texto: 'No fim da ficha, o botão Excluir aparece apenas para quem tem essa permissão. A exclusão tem duas etapas de confirmação e apaga junto o histórico da pessoa.',
      },
      {
        titulo: 'Volte para a lista',
        texto: 'O link "← Voltar para a lista" leva de volta ao painel.',
      },
    ],
  },
  {
    id: 'treinar',
    titulo: 'Treinar colaborador',
    quemVe: 'Quem vê: Gestor, Gerente, Gestor Líder, Treinador e Gerente treinador',
    resumo: 'Aba Treinamento. É aqui que se registra o treinamento do dia e o encerramento definitivo.',
    passos: [
      {
        titulo: 'Escolha o setor',
        texto: 'Cada setor é uma aba, com a quantidade de pessoas ao lado. Toque na aba para ver a equipe dela.',
      },
      {
        titulo: 'Busque, se precisar',
        texto: 'O campo "Buscar por nome, cargo ou setor..." filtra em todas as abas.',
      },
      {
        titulo: 'Leia os selos',
        texto: '"Reforço pendente": o último treinamento pediu reforço. "Encerrado em definitivo": esse tipo já foi encerrado para a pessoa. Cada linha mostra quantos treinamentos ela tem e o último resultado.',
      },
      {
        titulo: 'Cadastre quem chegou (Treinador e Gerente treinador)',
        texto: 'Use o botão "+ Cadastrar colaborador": nome completo, cargo/função, setor, unidade e turno (Diurno ou Noturno). O botão só aparece para quem tem a permissão de cadastro.',
      },
      {
        titulo: 'Abra a ficha de treinamento',
        texto: 'Toque no nome da pessoa. O formulário abre com ela já selecionada.',
      },
      {
        titulo: 'Escolha o tipo de treinamento',
        texto: 'Se o tipo ainda não tem formulário configurado, aparece um aviso. Dá para registrar só o resultado geral, e os itens entram quando o RH configurar.',
      },
      {
        titulo: 'Leia o material de apoio',
        texto: 'Instruções e imagens do tipo de treinamento. Consulte antes de avaliar os itens.',
      },
      {
        titulo: 'Avalie cada item',
        texto: 'Marque uma opção em cada item. A escala é Ruim, Médio, Bom e Ótimo, ou Ruim, Médio, Bom e Não, conforme o tipo.',
      },
      {
        titulo: 'Preencha os campos do dia, se o tipo pedir',
        texto: 'Alguns tipos têm campos como Setor, Gerente do período, Dia de treinamento e Função de abertura.',
      },
      {
        titulo: 'Registre os pontos positivos e negativos',
        texto: 'Os rótulos desses campos mudam conforme o tipo de treinamento.',
      },
      {
        titulo: 'Escolha o resultado do dia',
        texto: 'Aprovado, Aprovado com ressalva ou Reprovado.',
      },
      {
        titulo: 'Marque o reforço, se precisar',
        texto: 'Ao marcar "Precisa de reforço", descreva o que precisa ser reforçado. Esse campo é obrigatório quando a caixa está marcada.',
      },
      {
        titulo: 'Anote as observações (opcional)',
        texto: '"Observações do treinador" e "Sugestão ou crítica do colaborador". Os dois são opcionais.',
      },
      {
        titulo: 'Cancelar',
        texto: 'Sai sem gravar nada.',
      },
      {
        titulo: 'Finalizar o treinamento do dia',
        texto: 'Grava a ficha de hoje e mantém o treinamento aberto. Dá para treinar de novo amanhã.',
      },
      {
        titulo: 'Finalizar o Treinamento Definitivo',
        texto: 'Encerra este tipo de treinamento para esta pessoa. Antes de gravar, pede confirmação e a escolha entre Apto e Não apto. Depois disso, só o RH ou o Gestor Líder conseguem reabrir.',
      },
    ],
  },
  {
    id: 'historico-treinos',
    titulo: 'Histórico de treinamentos',
    quemVe: 'Quem vê: Gestor, Gerente, Gestor Líder, Treinador e Gerente treinador',
    resumo: 'Os treinamentos registrados, do mais recente para o mais antigo.',
    passos: [
      {
        titulo: 'Abra a aba Treinos feitos',
        texto: 'Aparecem os treinamentos registrados, com o tipo, o colaborador, a data e o resultado.',
      },
      {
        titulo: 'Veja o selo de reforço',
        texto: 'O selo "Reforço" indica que o treinamento pediu reforço.',
      },
      {
        titulo: 'Abra os detalhes',
        texto: 'Em "Ver detalhes" aparecem o resultado, o reforço e as observações.',
      },
      {
        titulo: 'Reabra um encerramento definitivo (só Gestor Líder)',
        texto: 'O botão "Reabrir" aparece apenas para quem pode reabrir um treinamento encerrado em definitivo. Ele pede confirmação antes.',
      },
    ],
  },
  {
    id: 'avisos',
    titulo: 'Avisos e lembretes',
    quemVe: 'Quem recebe: Gestor, Gerente, Gerente avaliador, Gestor Líder, Treinador e Gerente treinador',
    resumo: 'O sino no topo do painel. O número mostra quantos avisos não foram lidos.',
    passos: [
      {
        titulo: 'Abra o sino',
        texto: 'Ele fica no topo, à direita.',
      },
      {
        titulo: 'Leia a aba "Avisos"',
        texto: 'Lembretes de prazo de avaliação e de feedback. Os não lidos aparecem em destaque.',
      },
      {
        titulo: 'Leia a aba "A vencer"',
        texto: 'Os feedbacks que vencem nos próximos 7 dias.',
      },
    ],
  },
];

export default function GuiaPage() {
  return (
    <div className="flex flex-col gap-8">
      <CabecalhoPagina
        rotulo="Treinamento do painel"
        titulo="Passo a passo"
        subtitulo="Cada aba, do primeiro toque ao último, e quem tem acesso a cada uma."
      />

      <nav aria-label="Índice do passo a passo" className="card">
        <p className="rotulo-mono mb-3">Neste treinamento</p>
        <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          {AREAS.map((area, i) => (
            <li key={area.id}>
              <a href={`#${area.id}`} className="inline-flex items-center gap-2 min-h-11 hover:underline underline-offset-4">
                <span className="font-mono text-[11px] text-spot-gray-500 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                {area.titulo}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {AREAS.map((area, i) => (
        <div key={area.id} id={area.id} className="scroll-mt-20">
          <Secao
            indice={String(i + 1).padStart(2, '0')}
            titulo={area.titulo}
            apoio={area.quemVe}
            nota={area.resumo}
          >
            <ol className="flex flex-col gap-4">
              {area.passos.map((passo, j) => (
                <li key={passo.titulo} className="flex gap-4">
                  <span className="font-mono text-xs text-spot-gray-500 tabular-nums shrink-0 pt-0.5 w-5">{j + 1}.</span>
                  <div className="min-w-0">
                    <p className="font-semibold leading-snug">{passo.titulo}</p>
                    <p className="text-sm text-spot-gray-700 leading-relaxed mt-0.5">{passo.texto}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Secao>
        </div>
      ))}

      <p className="text-xs text-spot-gray-500">
        O acesso a cada aba é definido pelo RH. Se algo descrito aqui não aparece para você, confirme com o RH antes de
        procurar outro caminho.
      </p>
    </div>
  );
}
