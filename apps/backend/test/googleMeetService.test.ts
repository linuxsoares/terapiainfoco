import { describe, expect, it, beforeEach, afterEach, mock } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { GoogleMeetService } from '../src/services/googleMeetService';
import { AppointmentService } from '../src/services/appointmentService';
import { 
  AppointmentStatus, 
  MeetProvider, 
  MeetAccessType 
} from '@terapiainfoco/shared';
import { config } from '../src/config';

describe('Google Meet REST API v2 & Teleconsulta Integration (RFC-001 §3.2)', () => {
  const originalFetch = globalThis.fetch;
  const originalMeetToken = config.google.meetAccessToken;
  const originalCalToken = config.google.calendarAccessToken;

  beforeEach(() => {
    db.clear();
    config.google.meetAccessToken = '';
    config.google.calendarAccessToken = '';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    config.google.meetAccessToken = originalMeetToken;
    config.google.calendarAccessToken = originalCalToken;
  });

  it('deve usar link personalizado quando informado explicitamente pelo terapeuta', async () => {
    const result = await GoogleMeetService.createMeetingSpace({
      customUrl: 'meet.google.com/minha-sala-fixa'
    });

    expect(result.provider).toBe(MeetProvider.CUSTOM);
    expect(result.meetUrl).toBe('https://meet.google.com/minha-sala-fixa');
    expect(result.accessCode).toBe('minha-sala-fixa');
  });

  it('deve criar espaço via Google Meet REST API v2 (spaces.create) com token válido', async () => {
    config.google.meetAccessToken = 'mock-oauth-meet-token-123';

    let interceptedUrl = '';
    let interceptedMethod = '';
    let interceptedAuth = '';
    let interceptedBody: any = null;

    globalThis.fetch = mock(async (url: any, init: any) => {
      interceptedUrl = url.toString();
      interceptedMethod = init?.method || 'GET';
      interceptedAuth = init?.headers?.['Authorization'] || '';
      interceptedBody = JSON.parse(init?.body || '{}');

      return new Response(JSON.stringify({
        name: 'spaces/jQCFfuBOdN5z',
        meetingCode: 'abc-defg-hij',
        meetingUri: 'https://meet.google.com/abc-defg-hij',
        config: {
          accessType: 'TRUSTED',
          entryPointAccess: 'ALL'
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }) as any;

    const result = await GoogleMeetService.createMeetingSpace({
      accessType: MeetAccessType.TRUSTED
    });

    expect(interceptedUrl).toBe('https://meet.googleapis.com/v2/spaces');
    expect(interceptedMethod).toBe('POST');
    expect(interceptedAuth).toBe('Bearer mock-oauth-meet-token-123');
    expect(interceptedBody.config.accessType).toBe('TRUSTED');

    expect(result.provider).toBe(MeetProvider.GOOGLE_MEET_V2);
    expect(result.meetUrl).toBe('https://meet.google.com/abc-defg-hij');
    expect(result.accessCode).toBe('abc-defg-hij');
    expect(result.spaceName).toBe('spaces/jQCFfuBOdN5z');
    expect(result.accessType).toBe(MeetAccessType.TRUSTED);
  });

  it('deve suportar configuração de knocking OPEN quando solicitada', async () => {
    config.google.meetAccessToken = 'mock-oauth-meet-token-123';

    globalThis.fetch = mock(async (url: any, init: any) => {
      const parsedBody = JSON.parse(init?.body || '{}');
      return new Response(JSON.stringify({
        name: 'spaces/open-space-789',
        meetingCode: 'xyz-uvwx-rst',
        meetingUri: 'https://meet.google.com/xyz-uvwx-rst',
        config: {
          accessType: parsedBody.config.accessType
        }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as any;

    const result = await GoogleMeetService.createMeetingSpace({
      accessType: MeetAccessType.OPEN
    });

    expect(result.provider).toBe(MeetProvider.GOOGLE_MEET_V2);
    expect(result.accessType).toBe(MeetAccessType.OPEN);
  });

  it('deve acionar fallback para Google Calendar API v3 quando token do Meet v2 não estiver presente', async () => {
    config.google.meetAccessToken = '';
    config.google.calendarAccessToken = 'mock-oauth-calendar-token-456';

    let interceptedCalUrl = '';
    globalThis.fetch = mock(async (url: any, init: any) => {
      interceptedCalUrl = url.toString();
      return new Response(JSON.stringify({
        id: 'cal-event-999',
        conferenceData: {
          entryPoints: [
            {
              entryPointType: 'video',
              uri: 'https://meet.google.com/cal-enda-rmt'
            }
          ]
        }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as any;

    const result = await GoogleMeetService.createMeetingSpace();

    expect(interceptedCalUrl).toContain('googleapis.com/calendar/v3/calendars/primary/events');
    expect(result.provider).toBe(MeetProvider.GOOGLE_CALENDAR);
    expect(result.meetUrl).toBe('https://meet.google.com/cal-enda-rmt');
    expect(result.accessCode).toBe('cal-enda-rmt');
    expect(result.googleEventId).toBe('cal-event-999');
  });

  it('deve gerar link de contingência simulada formatado estritamente (3-4-3) quando nenhum token for configurado', async () => {
    config.google.meetAccessToken = '';
    config.google.calendarAccessToken = '';

    const result = await GoogleMeetService.createMeetingSpace();

    expect(result.provider).toBe(MeetProvider.SIMULATED);
    expect(result.meetUrl).toMatch(/^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
    expect(result.accessCode).toMatch(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
    expect(result.accessType).toBe(MeetAccessType.TRUSTED);
  });

  it('deve consultar espaço existente com getSpace', async () => {
    config.google.meetAccessToken = 'mock-token';

    globalThis.fetch = mock(async (url: any) => {
      expect(url.toString()).toBe('https://meet.googleapis.com/v2/spaces/abc-defg-hij');
      return new Response(JSON.stringify({
        name: 'spaces/space-123',
        meetingCode: 'abc-defg-hij'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as any;

    const space = await GoogleMeetService.getSpace('abc-defg-hij');
    expect(space).toBeDefined();
    expect(space.meetingCode).toBe('abc-defg-hij');
  });

  it('deve encerrar conferência ativa com endActiveConference (:endActiveConference)', async () => {
    config.google.meetAccessToken = 'mock-token';

    let calledUrl = '';
    globalThis.fetch = mock(async (url: any, init: any) => {
      calledUrl = url.toString();
      expect(init?.method).toBe('POST');
      return new Response(JSON.stringify({}), { status: 200 });
    }) as any;

    const ok = await GoogleMeetService.endActiveConference('spaces/space-active-999');
    expect(ok).toBe(true);
    expect(calledUrl).toBe('https://meet.googleapis.com/v2/spaces/space-active-999:endActiveConference');
  });

  it('deve retornar telemetria e diagnósticos de integração com getDiagnostics()', () => {
    config.google.meetAccessToken = 'mock-token';
    const diag = GoogleMeetService.getDiagnostics();

    expect(diag.configured).toBe(true);
    expect(diag.activeProvider).toBe(MeetProvider.GOOGLE_MEET_V2);
    expect(diag.defaultAccessType).toBe(MeetAccessType.TRUSTED);
    expect(diag.scopes).toContain('https://www.googleapis.com/auth/meetings.space.created');
    expect(diag.features.knockingWaitingRoom).toBe(true);
    expect(diag.features.endConference).toBe(true);
  });

  it('deve executar teste sintético de geração com testCreateSpace', async () => {
    const testResult = await GoogleMeetService.testCreateSpace();
    expect(testResult.success).toBe(true);
    expect(testResult.meetingUri).toContain('meet.google.com');
    expect(testResult.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('Integração de Agendamento: deve orquestrar criação do Meet e permitir encerramento com end-meet', async () => {
    config.google.meetAccessToken = 'mock-token';

    globalThis.fetch = mock(async (url: any, init: any) => {
      const urlStr = url.toString();
      if (urlStr.includes(':endActiveConference')) {
        return new Response('{}', { status: 200 });
      }
      return new Response(JSON.stringify({
        name: 'spaces/space-clinical-456',
        meetingCode: 'psic-cons-meet',
        meetingUri: 'https://meet.google.com/psic-cons-meet',
        config: { accessType: 'TRUSTED' }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as any;

    // 1. Cria agendamento via API
    const apptRes = await app.request('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        therapistId: 'therapist-001',
        patientId: 'patient-test-01',
        scheduledStart: new Date(Date.now() + 86400000).toISOString(),
        scheduledEnd: new Date(Date.now() + 86400000 + 50 * 60000).toISOString(),
        accessType: MeetAccessType.TRUSTED
      })
    });

    expect(apptRes.status).toBe(201);
    const apptData = await apptRes.json();
    expect(apptData.appointment.meetUrl).toBe('https://meet.google.com/psic-cons-meet');
    expect(apptData.appointment.meetProvider).toBe(MeetProvider.GOOGLE_MEET_V2);
    expect(apptData.appointment.meetSpaceName).toBe('spaces/space-clinical-456');

    // 2. Encerra a reunião via rota POST /api/appointments/:id/end-meet
    const endRes = await app.request(`/api/appointments/${apptData.appointment.id}/end-meet`, {
      method: 'POST'
    });

    expect(endRes.status).toBe(200);
    const endData = await endRes.json();
    expect(endData.success).toBe(true);
    expect(endData.conferenceEnded).toBe(true);
    expect(endData.spaceName).toBe('spaces/space-clinical-456');
  });
});
