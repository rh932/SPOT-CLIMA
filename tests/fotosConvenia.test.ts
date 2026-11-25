import { describe, it, expect } from 'vitest';
import { casarFotos, urlDeFotoValida } from '../src/lib/fotosConvenia';

const URL_OK = 'https://s3.amazonaws.com/storage-api.rh.live.convenia.com.br/avatars/ana silva.jpg';
const colab = (id: string, fullName: string, unitName: string) => ({ id, fullName, unitId: `u-${unitName}`, unitName });
const PESSOAS = [colab('1', 'Ana Silva', 'Paulista'), colab('2', 'Ana Silva', 'JK'), colab('3', 'JOÃO da Costa', 'Paulista')];

describe('urlDeFotoValida', () => {
  it('aceita o bucket público do Convênia (com espaço no nome do arquivo)', () => {
    expect(urlDeFotoValida(URL_OK)).not.toBeNull();
  });
  it('recusa outro host, http e lixo', () => {
    expect(urlDeFotoValida('https://evil.example.com/foto.jpg')).toBeNull();
    expect(urlDeFotoValida('http://s3.amazonaws.com/storage-api.rh.live.convenia.com.br/a.jpg')).toBeNull();
    expect(urlDeFotoValida('https://s3.amazonaws.com/outro-bucket/a.jpg')).toBeNull();
    expect(urlDeFotoValida('não é url')).toBeNull();
  });
});

describe('casarFotos', () => {
  it('casa por nome sem acento nem caixa, usando a unidade para desempatar homônimos', () => {
    const [a, b] = casarFotos([
      { nome: 'ana silva', unidade: 'JK', url: URL_OK },
      { nome: 'Joao da Costa', url: URL_OK },
    ], PESSOAS);
    expect(a).toMatchObject({ tipo: 'OK', colaborador: { id: '2' } });
    expect(b).toMatchObject({ tipo: 'OK', colaborador: { id: '3' } });
  });
  it('homônimo sem unidade é ambíguo e não grava em ninguém', () => {
    expect(casarFotos([{ nome: 'Ana Silva', url: URL_OK }], PESSOAS)[0].tipo).toBe('AMBIGUO');
  });
  it('quem não está no Spot Integra fica de fora', () => {
    expect(casarFotos([{ nome: 'Fulano', url: URL_OK }], PESSOAS)[0].tipo).toBe('SEM_COLABORADOR');
  });
  it('URL fora do Convênia é recusada', () => {
    expect(casarFotos([{ nome: 'Ana Silva', unidade: 'JK', url: 'https://evil.example.com/a.jpg' }], PESSOAS)[0].tipo).toBe('URL_INVALIDA');
  });
});
