import { describe, it, expect } from 'vitest';
import { safeNextPath } from '../src/lib/loginRedirect';

describe('safeNextPath', () => {
  it('devolve o destino padrão quando não há ?next=', () => {
    expect(safeNextPath(null, '/admin')).toBe('/admin');
    expect(safeNextPath(undefined, '/gestor')).toBe('/gestor');
    expect(safeNextPath('', '/admin')).toBe('/admin');
  });

  it('aceita caminho dentro do próprio portal', () => {
    expect(safeNextPath('/admin', '/admin')).toBe('/admin');
    expect(safeNextPath('/admin/employees', '/admin')).toBe('/admin/employees');
    expect(safeNextPath('/admin?aba=2', '/admin')).toBe('/admin?aba=2');
    expect(safeNextPath('/gestor/treinamento/historico', '/gestor')).toBe('/gestor/treinamento/historico');
  });

  it('recusa caminho de outro portal', () => {
    expect(safeNextPath('/gestor/pendencias', '/admin')).toBe('/admin');
    expect(safeNextPath('/admin/settings', '/gestor')).toBe('/gestor');
  });

  // Um prefixo igual não basta: /admins não é /admin.
  it('não confunde um caminho que só começa com o mesmo texto', () => {
    expect(safeNextPath('/administrativo', '/admin')).toBe('/admin');
    expect(safeNextPath('/gestores', '/gestor')).toBe('/gestor');
  });

  it('recusa destino externo', () => {
    expect(safeNextPath('https://exemplo.com/admin', '/admin')).toBe('/admin');
    expect(safeNextPath('//exemplo.com', '/admin')).toBe('/admin');
    expect(safeNextPath('/\\exemplo.com', '/admin')).toBe('/admin');
    expect(safeNextPath('/admin\\..\\outro', '/admin')).toBe('/admin');
    expect(safeNextPath('javascript:alert(1)', '/admin')).toBe('/admin');
  });

  it('recusa caractere de controle embutido', () => {
    expect(safeNextPath('/admin/\nhttps://exemplo.com', '/admin')).toBe('/admin');
  });
});
