import type { CreateLeadDTO, ValidateDocumentResponse } from '@terapiainfoco/shared';

// Em produção a URL da API vem do build (VITE_API_URL); localhost só no desenvolvimento
const configuredApiUrl = (import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3000/api' : '')).trim().replace(/\/+$/, '');
const API_BASE = configuredApiUrl
  ? (configuredApiUrl.endsWith('/api') ? configuredApiUrl : `${configuredApiUrl}/api`)
  : null;

const UNAVAILABLE_MESSAGE = 'Serviço temporariamente indisponível. Tente novamente em alguns minutos.';

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  if (!API_BASE) throw new Error(UNAVAILABLE_MESSAGE);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers
      }
    });
  } catch {
    throw new Error(UNAVAILABLE_MESSAGE);
  }

  const data = await res.json().catch(() => ({ success: false, error: UNAVAILABLE_MESSAGE }));
  if (!res.ok || data.success === false) {
    const error = new Error(data.error || 'Erro na requisição');
    (error as any).isApiError = true;
    throw error;
  }

  return data;
}

/**
 * Sem respostas simuladas: se a API não responde, a página informa a indisponibilidade
 * (um documento "válido" de mentira engana quem valida o documento).
 */
export const landingApi = {
  /** Pedido de acesso antecipado (formulário de demonstração) */
  async createLead(dto: CreateLeadDTO): Promise<void> {
    await fetchJson('/leads', { method: 'POST', body: JSON.stringify(dto) });
  },

  /** Consulta pública de autenticidade documental via QR Code / token */
  async validateDocumentToken(token: string): Promise<ValidateDocumentResponse> {
    try {
      return await fetchJson<ValidateDocumentResponse>(`/documents/validate/${encodeURIComponent(token)}`);
    } catch (err: any) {
      return { valid: false, message: err.message };
    }
  }
};
