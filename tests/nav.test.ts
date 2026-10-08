import { describe, it, expect } from 'vitest';
import { activeNavHref } from '../src/lib/nav';

const GESTOR = [
  '/gestor',
  '/gestor/pendencias',
  '/gestor/proximas',
  '/gestor/historico',
  '/gestor/treinamento',
  '/gestor/treinamento/historico',
];

describe('activeNavHref', () => {
  it('acende o item exato', () => {
    expect(activeNavHref('/gestor', GESTOR)).toBe('/gestor');
    expect(activeNavHref('/gestor/pendencias', GESTOR)).toBe('/gestor/pendencias');
  });

  // O bug que motivou este helper: os dois itens de treinamento acendiam juntos.
  it('acende só o item mais específico', () => {
    expect(activeNavHref('/gestor/treinamento/historico', GESTOR)).toBe('/gestor/treinamento/historico');
    expect(activeNavHref('/gestor/treinamento', GESTOR)).toBe('/gestor/treinamento');
  });

  it('acende o item pai numa subrota que não tem item próprio', () => {
    expect(activeNavHref('/gestor/treinamento/nova', GESTOR)).toBe('/gestor/treinamento');
  });

  it('não acende um item cujo caminho é só um prefixo de texto', () => {
    expect(activeNavHref('/gestor/historicos-antigos', GESTOR)).toBe('/gestor');
    expect(activeNavHref('/admin/unidades', ['/admin/unidade'])).toBeNull();
  });

  it('devolve null sem caminho ou sem itens', () => {
    expect(activeNavHref(null, GESTOR)).toBeNull();
    expect(activeNavHref('/gestor', [])).toBeNull();
  });
});
