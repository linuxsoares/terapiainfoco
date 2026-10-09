import { randomUUID } from 'node:crypto';

export class GoogleMeetService {
  /**
   * Orquestra a criação de uma sala real do Google Meet via Google Calendar API com ConferenceData
   * Conforme especificado na RFC-001 §3.2 (Módulo 2: Integração com Google Meet)
   * Escopos requeridos: https://www.googleapis.com/auth/calendar.events
   */
  static async createConference(params: {
    summary: string;
    startTime: Date;
    endTime: Date;
    accessToken?: string;
  }): Promise<{ meetUrl: string; accessCode: string; eventId: string } | null> {
    const token = params.accessToken || process.env.GOOGLE_CALENDAR_ACCESS_TOKEN;
    if (!token) {
      // Sem credenciais do Google Workspace configuradas no ambiente
      return null;
    }

    try {
      const requestId = randomUUID();
      const response = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            summary: params.summary,
            description: 'Teleconsulta Psicológica Segura — Plataforma TerapiaInFoco (RFC-001)',
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

      if (!response.ok) {
        console.warn('⚠️ Google Calendar API retornou status não-200:', await response.text());
        return null;
      }

      const eventData = await response.json();
      const videoEntry = eventData.conferenceData?.entryPoints?.find(
        (ep: any) => ep.entryPointType === 'video'
      );

      if (videoEntry?.uri) {
        const uri = videoEntry.uri as string;
        const code = uri.replace('https://meet.google.com/', '');
        return {
          meetUrl: uri,
          accessCode: code,
          eventId: eventData.id
        };
      }
    } catch (err) {
      console.error('Erro ao conectar com Google Calendar API:', err);
    }

    return null;
  }
}
