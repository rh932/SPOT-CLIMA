import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AsyncSection } from '@/components/async/states';
import { ehSemAcesso } from '@/components/async/useAsyncData';
import { ApiClientError } from '@/lib/apiClient';

/**
 * Estados de tela das listas. O ponto que importa: 403 é "sem acesso", não
 * "falhou" — não pode oferecer "Tentar de novo" nem cair no vazio.
 */
const base = {
  loading: false,
  error: null as string | null,
  skeleton: null,
  emptyState: null,
  children: 'conteudo',
};

function render(props: Partial<Parameters<typeof AsyncSection>[0]>) {
  return renderToStaticMarkup(createElement(AsyncSection, { ...base, ...props } as Parameters<typeof AsyncSection>[0]));
}

describe('ehSemAcesso', () => {
  it('reconhece só o 403 do cliente de API', () => {
    expect(ehSemAcesso(new ApiClientError('negado', 403, {}))).toBe(true);
    expect(ehSemAcesso(new ApiClientError('falhou', 500, {}))).toBe(false);
    expect(ehSemAcesso(new ApiClientError('nao achado', 404, {}))).toBe(false);
    expect(ehSemAcesso(new Error('rede caiu'))).toBe(false);
    expect(ehSemAcesso(null)).toBe(false);
  });
});

describe('AsyncSection — sem permissão', () => {
  it('mostra o estado de acesso sem botão de tentar de novo', () => {
    const html = render({ error: 'Você não tem permissão para executar esta ação.', forbidden: true, onRetry: () => {} });
    expect(html).toContain('Você não tem acesso a esta área.');
    expect(html).not.toContain('Tentar de novo');
    expect(html).not.toContain('Você não tem permissão para executar esta ação.');
  });

  it('erro comum continua com tentar de novo', () => {
    const html = render({ error: 'Falha de rede', onRetry: () => {} });
    expect(html).toContain('Falha de rede');
    expect(html).toContain('Tentar de novo');
    expect(html).not.toContain('Você não tem acesso');
  });

  it('sem erro e sem permissão renderiza o conteúdo', () => {
    expect(render({})).toContain('conteudo');
  });
});
