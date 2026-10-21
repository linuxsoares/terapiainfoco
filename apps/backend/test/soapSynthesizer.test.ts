import { describe, it, expect, afterEach } from 'bun:test';
import { TranscriptionSpeaker } from '@terapiainfoco/shared';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { config } from '../src/config';
import {
  OpenAiSoapSynthesizer,
  TemplateSoapSynthesizer,
  setSoapSynthesizerForTests
} from '../src/services/soap/soapSynthesizer';
import { resetDb } from './helpers/db';

const shortTest = [
  { speaker: TranscriptionSpeaker.PATIENT, text: 'Estou apenas testando.' },
  { speaker: TranscriptionSpeaker.PATIENT, text: 'Poderia verificar se deu tudo certo?' }
];

describe('Síntese do rascunho SOAP (RFC-001 §3.3)', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    setSoapSynthesizerForTests(undefined);
  });

  it('modelo por regras não inventa conteúdo quando a transcrição não traz informação clínica', async () => {
    const sections = await new TemplateSoapSynthesizer().synthesize(shortTest);
    expect(sections.subjectiveText).toBe('Sem informações suficientes na transcrição.');
    expect(sections.objectiveText).toBe('Sem informações suficientes na transcrição.');
    expect(sections.assessmentText).toBe('Sem informações suficientes na transcrição.');
    expect(sections.planText).toBe('Sem informações suficientes na transcrição.');
    expect(sections.suggestedCid11Codes).toEqual([]);
  });

  it('OpenAI recebe só as falas (sem nome do paciente), sem armazenamento, e devolve as seções do JSON', async () => {
    let sentBody: any;
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      sentBody = JSON.parse(String(init.body));
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          subjectiveText: 'Paciente informa que está testando a plataforma.',
          objectiveText: 'Sem informações suficientes na transcrição.',
          assessmentText: 'Sem informações suficientes na transcrição.',
          planText: 'Sem informações suficientes na transcrição.',
          suggestedCid11Codes: [],
          keyInsightsSummary: [],
          safetyConcern: null
        }) } }]
      }), { status: 200 });
    }) as typeof fetch;

    const sections = await new OpenAiSoapSynthesizer().synthesize(shortTest);
    expect(sections.subjectiveText).toContain('testando');
    expect(sections.suggestedCid11Codes).toEqual([]);
    expect(sections.safetyConcern).toBeUndefined();
    expect(sentBody.store).toBe(false);
    expect(sentBody.response_format.json_schema.strict).toBe(true);
    expect(sentBody.messages[1].content).toContain('PACIENTE: Estou apenas testando.');
  });

  it('erro do provedor chega com a mensagem da OpenAI', async () => {
    globalThis.fetch = (async () => new Response(
      JSON.stringify({ error: { message: 'Incorrect API key provided' } }),
      { status: 401 }
    )) as unknown as typeof fetch;
    await expect(new OpenAiSoapSynthesizer().synthesize(shortTest)).rejects.toThrow('Incorrect API key provided');
  });

  it('ingestão usa o sintetizador configurado e registra o modelo; sem sintetizador, explica o motivo', async () => {
    await resetDb();
    db.seedDemoSession();
    const login = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.77.0.1' },
      body: JSON.stringify({ email: 'psicologo@terapiainfoco.com.br', password: 'Senha@123456' })
    });
    const { accessToken } = await login.json() as any;
    const ingest = () => app.request('/api/transcription/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        appointmentId: '00000000-0000-0000-0000-000000000010',
        patientId: '00000000-0000-0000-0000-000000000002',
        consentConfirmed: true,
        rawTranscriptText: 'PACIENTE: Estou apenas testando.\nPACIENTE: Poderia verificar se deu tudo certo?'
      })
    });

    setSoapSynthesizerForTests({
      modelIdentifier: 'fake-llm',
      zeroRetention: false,
      synthesize: async (utterances) => ({
        subjectiveText: utterances.map((u) => u.text).join(' '),
        objectiveText: '-', assessmentText: '-', planText: '-',
        suggestedCid11Codes: [], keyInsightsSummary: []
      })
    });
    const ok = await ingest();
    expect(ok.status).toBe(201);
    const body = await ok.json() as any;
    expect(body.soapDraft.subjectiveText).toBe('Estou apenas testando. Poderia verificar se deu tudo certo?');
    expect(body.soapDraft.modelIdentifier).toBe('fake-llm');
    expect(body.soapDraft.zeroRetentionGuaranteed).toBe(false);
    expect(body.soapDraft.suggestedCid11Codes).toEqual([]);

    setSoapSynthesizerForTests(null);
    const fail = await ingest();
    expect(fail.status).toBe(500);
    expect((await fail.json() as any).message).toContain('OPENAI_API_KEY');
  });

  it('testes usam o modelo por regras por padrão (nunca chamam a OpenAI)', () => {
    expect(config.soap.provider).toBe('template');
  });
});
