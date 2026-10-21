import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { authService } from '../src/services/authService';
import { setSttProviderForTests, OpenAiSttProvider } from '../src/services/stt/sttProvider';
import { config } from '../src/config';
import { encode } from '../src/db/persistence';
import { resetDb, requireUser, seedDemoSession, requirePatient, updatePatient } from './helpers/db';

const APPOINTMENT_ID = '00000000-0000-0000-0000-000000000010';
const PATIENT_RECORD_ID = '00000000-0000-0000-0000-000000000002';
const PSICOLOGA_ID = '00000000-0000-0000-0000-000000000001';
const PATIENT_USER_ID = '00000000-0000-0000-0000-000000000005';
const ADMIN_ID = '00000000-0000-0000-0000-000000000004';

const receivedAudio: Uint8Array[] = [];
const fakeProvider = {
  name: 'fake',
  async transcribe(audio: Uint8Array) {
    receivedAudio.push(audio);
    const marker = Buffer.from(audio).toString();
    return marker === 'silencio' ? '' : `fala:${marker}`;
  }
};

async function headersFor(userId: string) {
  const { accessToken } = await authService.issueTokens((await requireUser(userId)), '127.0.0.1');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` };
}
const post = (path: string, headers: Record<string, string>, body: unknown) =>
  app.request(`/api/teleconsultation/session${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
const chunk = (text: string) => ({ appointmentId: APPOINTMENT_ID, audioBase64: Buffer.from(text).toString('base64'), mimeType: 'audio/webm;codecs=opus', durationMs: 8000 });

/** Sala em andamento com a paciente admitida */
async function startSession() {
  const therapist = await headersFor(PSICOLOGA_ID);
  const patient = await headersFor(PATIENT_USER_ID);
  await app.request(`/api/teleconsultation/session/room/${APPOINTMENT_ID}`, { headers: therapist });
  const { participantId } = await (await post('/knock', patient, { appointmentId: APPOINTMENT_ID })).json() as any;
  await post('/admit', therapist, { appointmentId: APPOINTMENT_ID, participantId, action: 'ADMIT' });
  return { therapist, patient };
}

describe('Transcrição da teleconsulta por STT, sem gravação (ADR-005)', () => {
  beforeEach(async () => {
    await resetDb();
    await seedDemoSession();
    receivedAudio.length = 0;
    setSttProviderForTests(fakeProvider);
  });
  afterEach(() => setSttProviderForTests(undefined));

  it('transcreve trechos de cada participante com o locutor da sessão e guarda só texto cifrado', async () => {
    const { therapist, patient } = await startSession();
    const t = await post('/transcription/chunk', therapist, chunk('como voce esta'));
    expect(t.status).toBe(200);
    expect((await t.json() as any).utterance).toMatchObject({ speaker: 'THERAPIST', text: 'fala:como voce esta' });
    const p = await post('/transcription/chunk', patient, chunk('ansiosa esta semana'));
    expect((await p.json() as any).utterance).toMatchObject({ speaker: 'PATIENT', text: 'fala:ansiosa esta semana' });

    // Áudio zerado após o STT e nada de áudio ou texto claro no que é persistido
    expect(receivedAudio.every((audio) => audio.every((byte) => byte === 0))).toBe(true);
    const stored = encode(db.liveTranscripts.get(APPOINTMENT_ID));
    expect(stored).not.toContain('ansiosa');
    expect(stored).not.toContain(Buffer.from('ansiosa esta semana').toString('base64'));

    const transcript = await (await app.request(`/api/teleconsultation/session/transcription/${APPOINTMENT_ID}`, { headers: therapist })).json() as any;
    expect(transcript.utterances.map((u: any) => [u.speaker, u.text])).toEqual([
      ['THERAPIST', 'fala:como voce esta'],
      ['PATIENT', 'fala:ansiosa esta semana']
    ]);
  });

  it('trecho sem fala não gera registro', async () => {
    const { therapist } = await startSession();
    const res = await post('/transcription/chunk', therapist, chunk('silencio'));
    expect((await res.json() as any).utterance).toBeNull();
    expect(db.liveTranscripts.get(APPOINTMENT_ID)).toBeUndefined();
  });

  it('exige consentimento vigente, sessão em andamento, participante admitido e STT configurado', async () => {
    const therapist = await headersFor(PSICOLOGA_ID);
    const patient = await headersFor(PATIENT_USER_ID);
    await app.request(`/api/teleconsultation/session/room/${APPOINTMENT_ID}`, { headers: therapist });
    expect((await post('/transcription/chunk', therapist, chunk('antes'))).status).toBe(403);

    const { participantId } = await (await post('/knock', patient, { appointmentId: APPOINTMENT_ID })).json() as any;
    expect((await post('/transcription/chunk', patient, chunk('na espera'))).status).toBe(403);
    await post('/admit', therapist, { appointmentId: APPOINTMENT_ID, participantId, action: 'ADMIT' });

    await updatePatient(PATIENT_RECORD_ID, { consentRevokedAt: new Date() });
    const status = await (await app.request(`/api/teleconsultation/session/transcription/status/${APPOINTMENT_ID}`, { headers: therapist })).json() as any;
    expect(status).toMatchObject({ enabled: false, reason: 'NO_CONSENT' });
    expect((await post('/transcription/chunk', patient, chunk('sem consentimento'))).status).toBe(403);
    expect(receivedAudio).toHaveLength(0);

    await updatePatient(PATIENT_RECORD_ID, { consentRevokedAt: undefined });
    setSttProviderForTests(null);
    expect((await post('/transcription/chunk', patient, chunk('sem stt'))).status).toBe(503);
  });

  it('transcrição só é lida pela equipe clínica do consultório', async () => {
    const { patient } = await startSession();
    await post('/transcription/chunk', patient, chunk('relato'));
    expect((await app.request(`/api/teleconsultation/session/transcription/${APPOINTMENT_ID}`, { headers: patient })).status).toBe(403);
    expect((await app.request(`/api/teleconsultation/session/transcription/${APPOINTMENT_ID}`, { headers: await headersFor(ADMIN_ID) })).status).toBe(403);
  });

  it('o rascunho SOAP usa a transcrição da sessão quando nenhum texto é colado', async () => {
    const { therapist, patient } = await startSession();
    await post('/transcription/chunk', therapist, chunk('o que trouxe voce hoje'));
    await post('/transcription/chunk', patient, chunk('tenho tido crises de panico no trabalho'));
    const res = await app.request('/api/transcription/ingest', {
      method: 'POST',
      headers: therapist,
      body: JSON.stringify({ appointmentId: APPOINTMENT_ID, patientId: PATIENT_RECORD_ID, consentConfirmed: true })
    });
    expect(res.status).toBe(201);
    const { session } = await res.json() as any;
    expect(session.utterances.map((u: any) => u.text)).toEqual(['fala:o que trouxe voce hoje', 'fala:tenho tido crises de panico no trabalho']);
  });

  it('provedor OpenAI envia multipart com modelo e idioma configurados e zera a cópia do áudio', async () => {
    const originalFetch = globalThis.fetch;
    let captured: { url: string; form: FormData; auth: string | null } | null = null;
    let sentBytes: Uint8Array | null = null;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      const form = init.body as FormData;
      sentBytes = new Uint8Array(await (form.get('file') as Blob).arrayBuffer());
      captured = { url, form, auth: new Headers(init.headers).get('Authorization') };
      return new Response(JSON.stringify({ text: 'olá, tudo bem?' }), { status: 200 });
    }) as typeof fetch;
    const originalKey = config.stt.openaiApiKey;
    config.stt.openaiApiKey = 'sk-teste';
    try {
      const text = await new OpenAiSttProvider().transcribe(new Uint8Array([1, 2, 3]), 'audio/webm;codecs=opus');
      expect(text).toBe('olá, tudo bem?');
      expect(captured!.url).toBe('https://api.openai.com/v1/audio/transcriptions');
      expect(captured!.auth).toBe('Bearer sk-teste');
      expect(captured!.form.get('model')).toBe(config.stt.model);
      expect(captured!.form.get('language')).toBe('pt');
      expect(Array.from(sentBytes!)).toEqual([1, 2, 3]);
    } finally {
      globalThis.fetch = originalFetch;
      config.stt.openaiApiKey = originalKey;
    }
  });

  it('paciente autoriza a transcrição pela sala, inclusive depois de uma revogação', async () => {
    const { therapist, patient } = await startSession();
    await updatePatient(PATIENT_RECORD_ID, { consentTranscriptionSigned: false, consentRevokedAt: new Date() });
    const statusUrl = `/api/teleconsultation/session/transcription/status/${APPOINTMENT_ID}`;
    expect((await (await app.request(statusUrl, { headers: therapist })).json() as any).reason).toBe('NO_CONSENT');

    // Psicólogo não decide pelo paciente
    expect((await post('/transcription/consent', therapist, { appointmentId: APPOINTMENT_ID, granted: true })).status).toBe(403);

    const granted = await post('/transcription/consent', patient, { appointmentId: APPOINTMENT_ID, granted: true });
    expect(granted.status).toBe(200);
    expect(await granted.json()).toMatchObject({ enabled: true });
    expect((await requirePatient(PATIENT_RECORD_ID)).consentRevokedAt).toBeUndefined();
    expect((await post('/transcription/chunk', patient, chunk('agora pode'))).status).toBe(200);

    const refused = await (await post('/transcription/consent', patient, { appointmentId: APPOINTMENT_ID, granted: false })).json() as any;
    expect(refused).toMatchObject({ enabled: false, reason: 'NO_CONSENT' });
    expect((await post('/transcription/chunk', patient, chunk('depois da recusa'))).status).toBe(403);
  });

  it('erro do SOAP sem transcrição explica o motivo', async () => {
    const { therapist } = await startSession();
    await updatePatient(PATIENT_RECORD_ID, { consentTranscriptionSigned: false });
    // Fora do modo demonstração não há diálogo de exemplo
    config.demoMode = false;
    try {
      const res = await app.request('/api/transcription/ingest', {
        method: 'POST',
        headers: therapist,
        body: JSON.stringify({ appointmentId: APPOINTMENT_ID, patientId: PATIENT_RECORD_ID, consentConfirmed: true })
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(JSON.stringify(await res.json())).toContain('não autorizou a transcrição');
    } finally {
      config.demoMode = true;
    }
  });

  it('erro do provedor OpenAI traz a mensagem do provedor', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: 'Incorrect API key provided' } }), { status: 401 })) as unknown as typeof fetch;
    const originalKey = config.stt.openaiApiKey;
    config.stt.openaiApiKey = 'sk-invalida';
    try {
      await expect(new OpenAiSttProvider().transcribe(new Uint8Array([1]), 'audio/webm')).rejects.toThrow('HTTP 401: Incorrect API key provided');
    } finally {
      globalThis.fetch = originalFetch;
      config.stt.openaiApiKey = originalKey;
    }
  });
});

