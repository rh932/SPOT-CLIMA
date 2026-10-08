/**
 * Erro de API com o status e o corpo preservados — quem chama pode reagir ao
 * caso específico (ex.: 409 de avaliação já registrada por outro gestor) sem
 * ter que interpretar o texto da mensagem.
 */
export class ApiClientError extends Error {
  status: number;
  data: Record<string, unknown>;
  constructor(message: string, status: number, data: Record<string, unknown>) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.data = data;
  }
}

/** Wrapper simples de fetch para as chamadas client-side do painel administrativo/gestor. */
export async function apiFetch<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const res = await fetch(url, {
    ...init,
    // FormData (upload de arquivo) precisa que o navegador defina seu próprio
    // Content-Type com boundary — nunca forçar application/json nesse caso.
    headers: isFormData ? { ...(init?.headers ?? {}) } : { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });

  if (res.status === 401 && typeof window !== 'undefined') {
    // Sessão expirada/ausente — manda para o login do portal certo em vez de
    // deixar a página em uso quebrar com um erro genérico de "acesso negado".
    const loginPath = window.location.pathname.startsWith('/gestor') ? '/gestor/login' : '/admin/login';
    if (!window.location.pathname.startsWith(loginPath)) {
      const next = encodeURIComponent(window.location.pathname);
      window.location.href = `${loginPath}?next=${next}`;
    }
    throw new Error('Sua sessão expirou. Redirecionando para o login...');
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiClientError(body.error ?? `Erro na requisição (${res.status})`, res.status, body);
  }
  return body as T;
}
