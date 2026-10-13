import { randomUUID } from 'node:crypto';
import { 
  MeetProvider, 
  MeetAccessType, 
  type GoogleMeetStatusResponse,
  type GoogleMeetTestResponse 
} from '@terapiainfoco/shared';
import { config } from '../config';

/**
 * Resultado da criação ou orquestração de uma sala do Google Meet
 */
export interface GoogleMeetCreationResult {
  meetUrl: string;
  accessCode: string;
  spaceName?: string;
  googleEventId?: string;
  provider: MeetProvider;
  accessType: MeetAccessType;
}

/**
 * Gera um código válido e estritamente formatado do Google Meet: xxx-yyyy-zzz (3-4-3 letras minúsculas)
 * Utilizado para contingência quando operando offline ou sem credenciais do Google Workspace
 */
export function generateGoogleMeetCode(): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const getChunk = (len: number) => {
    let chunk = '';
    for (let i = 0; i < len; i++) {
      chunk += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    return chunk;
  };
  return `${getChunk(3)}-${getChunk(4)}-${getChunk(3)}`;
}

/**
 * Serviço de Integração com Google Meet REST API v2 & Google Calendar
 * Conforme especificado na RFC-001 §3.2 (Módulo 2: Integração com Google Meet)
 * 
 * Documentação oficial: https://developers.google.com/workspace/meet/api/guides/overview
 * Endpoint primário: POST https://meet.googleapis.com/v2/spaces
 * Escopo obrigatório: https://www.googleapis.com/auth/meetings.space.created
 */
export class GoogleMeetService {
  private static readonly MEET_API_BASE = 'https://meet.googleapis.com/v2';
  private static readonly CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

  /**
   * Orquestra a criação de uma sala no Google Meet.
   * Prioridade de execução:
   * 1. URL personalizada informada pelo psicólogo (sala recorrente / fixa)
   * 2. Google Meet REST API v2 (spaces.create com política de knocking TRUSTED)
   * 3. Google Calendar API v3 (conferenceDataVersion=1 / hangoutsMeet)
   * 4. Contingência Resiliente Local (RFC §3.2 e §5.2 - gerador determinístico)
   */
  static async createMeetingSpace(params: {
    summary?: string;
    startTime?: Date;
    endTime?: Date;
    accessType?: MeetAccessType;
    customUrl?: string;
    accessToken?: string;
  } = {}): Promise<GoogleMeetCreationResult> {
    const accessType = params.accessType || config.google.defaultAccessType || MeetAccessType.TRUSTED;

    // 1. Link customizado informado explicitamente (ex: sala fixa do terapeuta)
    if (params.customUrl && params.customUrl.trim()) {
      let custom = params.customUrl.trim();
      if (!custom.startsWith('http')) {
        if (custom.startsWith('meet.google.com/')) {
          custom = `https://${custom}`;
        } else {
          custom = `https://meet.google.com/${custom}`;
        }
      }
      const match = custom.match(/meet\.google\.com\/([a-z0-9-]+)/i);
      const code = match ? match[1].toLowerCase() : 'custom';
      return {
        meetUrl: custom,
        accessCode: code,
        provider: MeetProvider.CUSTOM,
        accessType
      };
    }

    // 2. Tentar Google Meet REST API v2 (POST /v2/spaces)
    const meetToken = params.accessToken || config.google.meetAccessToken;
    if (meetToken) {
      try {
        const spaceResult = await this.callMeetApiCreateSpace(meetToken, accessType);
        if (spaceResult) {
          return spaceResult;
        }
      } catch (err: any) {
        console.warn('⚠️ Google Meet REST API v2 falhou, tentando fallback:', err?.message || err);
      }
    }

    // 3. Tentar Google Calendar API v3 como alternativa legada de Workspace
    const calendarToken = params.accessToken || config.google.calendarAccessToken;
    if (calendarToken) {
      try {
        const calResult = await this.callCalendarApiCreateConference(calendarToken, {
          summary: params.summary || 'Teleconsulta Psicológica — TerapiaInFoco (RFC-001)',
          startTime: params.startTime || new Date(),
          endTime: params.endTime || new Date(Date.now() + 50 * 60 * 1000)
        });
        if (calResult) {
          return {
            ...calResult,
            accessType
          };
        }
      } catch (err: any) {
        console.warn('⚠️ Google Calendar API falhou, acionando contingência:', err?.message || err);
      }
    }

    // 4. Fallback de Contingência Resiliente (RFC §3.2, §5.2)
    // Permite que o agendamento conclua sem indisponibilidade em ambientes dev/CI ou falha de rede externa
    const code = generateGoogleMeetCode();
    return {
      meetUrl: `https://meet.google.com/${code}`,
      accessCode: code,
      provider: MeetProvider.SIMULATED,
      accessType
    };
  }

  /**
   * Cria um espaço diretamente na Google Meet REST API v2
   * POST https://meet.googleapis.com/v2/spaces
   * Escopo: https://www.googleapis.com/auth/meetings.space.created
   */
  private static async callMeetApiCreateSpace(
    token: string,
    accessType: MeetAccessType
  ): Promise<GoogleMeetCreationResult | null> {
    const res = await fetch(`${this.MEET_API_BASE}/spaces`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        config: {
          accessType,
          entryPointAccess: 'ALL'
        }
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`⚠️ Google Meet API v2 retornou status ${res.status}:`, errText);
      return null;
    }

    const data = await res.json() as {
      name?: string;
      meetingUri?: string;
      meetingCode?: string;
      config?: { accessType?: MeetAccessType };
    };

    if (data.meetingUri && data.meetingCode) {
      return {
        meetUrl: data.meetingUri,
        accessCode: data.meetingCode,
        spaceName: data.name,
        provider: MeetProvider.GOOGLE_MEET_V2,
        accessType: (data.config?.accessType as MeetAccessType) || accessType
      };
    }

    return null;
  }

  /**
   * Cria conferência via Google Calendar API com conferenceData
   * POST https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1
   * Escopo: https://www.googleapis.com/auth/calendar.events
   */
  private static async callCalendarApiCreateConference(
    token: string,
    params: { summary: string; startTime: Date; endTime: Date }
  ): Promise<{ meetUrl: string; accessCode: string; googleEventId: string; provider: MeetProvider } | null> {
    const requestId = randomUUID();
    const res = await fetch(
      `${this.CALENDAR_API_BASE}/calendars/primary/events?conferenceDataVersion=1`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          summary: params.summary,
          description: 'Teleconsulta Psicológica Segura — Plataforma TerapiaInFoco (RFC-001 & CFP 011/2018)',
          start: { dateTime: params.startTime.toISOString() },
          end: { dateTime: params.endTime.toISOString() },
          conferenceData: {
            createRequest: {
              requestId,
              conferenceSolutionKey: { type: 'hangoutsMeet' }
            }
          }
        })
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`⚠️ Google Calendar API retornou status ${res.status}:`, errText);
      return null;
    }

    const eventData = await res.json() as any;
    const videoEntry = eventData.conferenceData?.entryPoints?.find(
      (ep: any) => ep.entryPointType === 'video'
    );

    if (videoEntry?.uri) {
      const uri = videoEntry.uri as string;
      const code = uri.replace(/^https:\/\/meet\.google\.com\//, '');
      return {
        meetUrl: uri,
        accessCode: code,
        googleEventId: eventData.id,
        provider: MeetProvider.GOOGLE_CALENDAR
      };
    }

    return null;
  }

  /**
   * Consulta os dados de um espaço existente no Google Meet REST API v2
   * GET https://meet.googleapis.com/v2/spaces/{name}
   */
  static async getSpace(spaceNameOrCode: string, token?: string): Promise<any | null> {
    const authToken = token || config.google.meetAccessToken;
    if (!authToken) return null;

    const normalizedName = spaceNameOrCode.startsWith('spaces/') 
      ? spaceNameOrCode 
      : `spaces/${spaceNameOrCode}`;

    try {
      const res = await fetch(`${this.MEET_API_BASE}/${normalizedName}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn('⚠️ Falha ao consultar espaço no Google Meet:', err);
    }
    return null;
  }

  /**
   * Encerra a conferência ativa em um espaço do Google Meet REST API v2
   * POST https://meet.googleapis.com/v2/spaces/{name}:endActiveConference
   * Escopo: https://www.googleapis.com/auth/meetings.space.created
   */
  static async endActiveConference(spaceName: string, token?: string): Promise<boolean> {
    const authToken = token || config.google.meetAccessToken;
    if (!authToken) return false;

    const normalizedName = spaceName.startsWith('spaces/') ? spaceName : `spaces/${spaceName}`;

    try {
      const res = await fetch(`${this.MEET_API_BASE}/${normalizedName}:endActiveConference`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });
      return res.ok;
    } catch (err) {
      console.warn('⚠️ Falha ao encerrar conferência no Google Meet:', err);
      return false;
    }
  }

  /**
   * Retorna telemetria e diagnóstico do status da integração com Google Workspace
   */
  static getDiagnostics(): GoogleMeetStatusResponse {
    const hasMeetToken = Boolean(config.google.meetAccessToken);
    const hasCalToken = Boolean(config.google.calendarAccessToken);

    let activeProvider = MeetProvider.SIMULATED;
    if (hasMeetToken) {
      activeProvider = MeetProvider.GOOGLE_MEET_V2;
    } else if (hasCalToken) {
      activeProvider = MeetProvider.GOOGLE_CALENDAR;
    }

    return {
      configured: hasMeetToken || hasCalToken,
      activeProvider,
      defaultAccessType: config.google.defaultAccessType,
      scopes: [
        'https://www.googleapis.com/auth/meetings.space.created',
        'https://www.googleapis.com/auth/meetings.space.readonly',
        'https://www.googleapis.com/auth/calendar.events'
      ],
      features: {
        spacesV2: true,
        calendarV3: true,
        knockingWaitingRoom: true,
        endConference: true
      }
    };
  }

  /**
   * Executa teste de geração de espaço com medição de latência
   */
  static async testCreateSpace(accessType?: MeetAccessType): Promise<GoogleMeetTestResponse> {
    const start = performance.now();
    const result = await this.createMeetingSpace({ accessType });
    const latencyMs = Math.round((performance.now() - start) * 10) / 10;

    let message = 'Espaço gerado com sucesso via contingência simulada RFC §3.2';
    if (result.provider === MeetProvider.GOOGLE_MEET_V2) {
      message = 'Sala real criada com sucesso na Google Meet REST API v2';
    } else if (result.provider === MeetProvider.GOOGLE_CALENDAR) {
      message = 'Conferência criada com sucesso via Google Calendar API v3';
    }

    return {
      success: true,
      provider: result.provider,
      spaceName: result.spaceName,
      meetingCode: result.accessCode,
      meetingUri: result.meetUrl,
      accessType: result.accessType,
      latencyMs,
      message
    };
  }
}
