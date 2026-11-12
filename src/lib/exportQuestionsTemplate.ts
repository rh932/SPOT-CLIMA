import ExcelJS from 'exceljs';

export async function buildQuestionsImportTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Spot Integra';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Perguntas');
  sheet.columns = [
    { header: 'Categoria', key: 'categoria', width: 28 },
    { header: 'Pergunta', key: 'pergunta', width: 60 },
    { header: 'Tipo de resposta', key: 'tipo', width: 22 },
    { header: 'Obrigatória', key: 'obrigatoria', width: 14 },
    { header: 'Opções (separadas por ;)', key: 'opcoes', width: 45 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.addRow({
    categoria: 'Clima organizacional',
    pergunta: 'Sinto-me seguro no meu ambiente de trabalho.',
    tipo: 'Escala 1 a 5',
    obrigatoria: 'Sim',
    opcoes: '',
  });
  sheet.addRow({
    categoria: 'Satisfação geral',
    pergunta: 'Você recomendaria a empresa como um bom lugar para trabalhar?',
    tipo: 'Sim/Não',
    obrigatoria: 'Sim',
    opcoes: '',
  });
  sheet.addRow({
    categoria: 'Reconhecimento',
    pergunta: 'Qual destes benefícios você mais valoriza?',
    tipo: 'Múltipla escolha',
    obrigatoria: 'Não',
    opcoes: 'Plano de saúde;Vale-alimentação;Day off no aniversário;Bônus por performance',
  });
  sheet.addRow({
    categoria: 'Personalizado',
    pergunta: 'Qual sua principal sugestão de melhoria?',
    tipo: 'Dissertativa',
    obrigatoria: 'Não',
    opcoes: '',
  });

  const guide = workbook.addWorksheet('Tipos válidos');
  guide.columns = [{ header: 'Valor aceito na coluna "Tipo de resposta"', key: 'v', width: 45 }];
  guide.getRow(1).font = { bold: true };
  ['Escala 1 a 5', 'Escala 1 a 10', 'Sim/Não', 'Objetiva', 'Múltipla escolha', 'Dissertativa curta', 'Dissertativa'].forEach((v) =>
    guide.addRow({ v })
  );

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
