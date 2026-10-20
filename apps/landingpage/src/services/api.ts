import type {
  AvailableSlotsResponse,
  PublicBookingDTO,
  PublicBookingResponse,
  ValidateDocumentResponse
} from '@terapiainfoco/shared';

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
 * (um agendamento ou documento "válido" de mentira engana o paciente e quem valida o documento).
 */
export const landingApi = {
  /** Horários disponíveis para o agendamento público */
  async getAvailableSlots(date?: string): Promise<AvailableSlotsResponse> {
    return await fetchJson<AvailableSlotsResponse>(
      `/appointments/available-slots${date ? `?date=${encodeURIComponent(date)}` : ''}`
    );
  },

  /** Agendamento público de teleconsulta pela landing page */
  async bookPublicAppointment(dto: PublicBookingDTO): Promise<PublicBookingResponse> {
    const res = await fetchJson<{ success: boolean; booking: PublicBookingResponse }>('/appointments/public/book', {
      method: 'POST',
      body: JSON.stringify(dto)
    });
    return res.booking;
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
