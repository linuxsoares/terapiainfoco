import { TranscriptionSpeaker } from '@terapiainfoco/shared';
import { config } from '../../config';

/**
 * Síntese do rascunho SOAP a partir da transcrição diarizada (RFC-001 §3.3).
 * O rascunho é sempre revisado e assinado pelo psicólogo (Human-in-the-Loop). O provedor externo
 * é operador de dados de saúde (LGPD Art. 39): recebe só as falas, sem nome nem identificadores.
 */
export interface SoapUtterance {
  speaker: TranscriptionSpeaker;
  text: string;
}

export interface SoapSections {
  subjectiveText: string;
  objectiveText: string;
  assessmentText: string;
  planText: string;
  suggestedCid11Codes: string[];
  keyInsightsSummary: string[];
  safetyConcern?: string;
}

export interface SoapSynthesizer {
  readonly modelIdentifier: string;
  readonly zeroRetention: boolean;
  synthesize(utterances: SoapUtterance[]): Promise<SoapSections>;
}

const INSUFFICIENT = 'Sem informações suficientes na transcrição.';

const SYSTEM_PROMPT = `Você auxilia psicólogos clínicos brasileiros a redigir o rascunho de evolução no formato SOAP a partir da transcrição de uma sessão.
Regras obrigatórias:
- Use EXCLUSIVAMENTE o que está na transcrição. Nunca invente queixas, sintomas, comportamentos, hipóteses, diagnósticos ou condutas.
- Quando uma seção não tiver base na transcrição, escreva exatamente: "${INSUFFICIENT}"
- S (Subjetivo): o que o paciente relatou, com suas palavras resumidas.
- O (Objetivo): apenas o que é observável no texto (ex.: coerência e organização do discurso). Não descreva afeto, contato visual ou postura, pois a transcrição não os registra.
- A (Avaliação): hipóteses clínicas só se sustentadas pelas falas, sempre como hipóteses a confirmar pelo psicólogo.
- P (Plano): somente encaminhamentos, tarefas ou combinados que aparecem na conversa.
- suggestedCid11Codes: códigos CID-11 apenas quando a transcrição dá base clara; caso contrário, lista vazia.
- keyInsightsSummary: até 3 pontos objetivos da sessão; lista vazia se não houver.
- safetyConcern: descreva qualquer indício de risco (ideação suicida, autolesão, violência); caso não haja, null.
- Escreva em português do Brasil, linguagem técnica e concisa. Não use o nome do paciente.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['subjectiveText', 'objectiveText', 'assessmentText', 'planText', 'suggestedCid11Codes', 'keyInsightsSummary', 'safetyConcern'],
  properties: {
    subjectiveText: { type: 'string' },
    objectiveText: { type: 'string' },
    assessmentText: { type: 'string' },
    planText: { type: 'string' },
    suggestedCid11Codes: { type: 'array', items: { type: 'string' } },
    keyInsightsSummary: { type: 'array', items: { type: 'string' } },
    safetyConcern: { type: ['string', 'null'] }
  }
} as const;

export class OpenAiSoapSynthesizer implements SoapSynthesizer {
  readonly modelIdentifier = `openai:${config.soap.model}`;
  readonly zeroRetention = config.soap.zeroRetention;

  async synthesize(utterances: SoapUtterance[]): Promise<SoapSections> {
    const transcript = utterances
      .map((u) => `${u.speaker === TranscriptionSpeaker.THERAPIST ? 'PSICÓLOGO' : 'PACIENTE'}: ${u.text}`)
      .join('\n');
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.stt.openaiApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.soap.model,
        temperature: 0.2,
        store: false,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Transcrição da sessão:\n${transcript}` }
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'soap_draft', strict: true, schema: RESPONSE_SCHEMA } }
      })
    });
    if (!res.ok) {
      const detail = await res.json().then((b: any) => b?.error?.message as string | undefined).catch(() => undefined);
      console.warn(`⚠️ SOAP OpenAI respondeu HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
      throw new Error(`O provedor de IA recusou a síntese do SOAP (HTTP ${res.status}${detail ? `: ${detail}` : ''}).`);
    }
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string; refusal?: string } }> };
    const message = body.choices?.[0]?.message;
    if (!message?.content) {
      throw new Error(`O provedor de IA não devolveu o rascunho SOAP${message?.refusal ? `: ${message.refusal}` : '.'}`);
    }
    const parsed = JSON.parse(message.content) as Omit<SoapSections, 'safetyConcern'> & { safetyConcern: string | null };
    return { ...parsed, safetyConcern: parsed.safetyConcern || undefined };
  }
}

/**
 * Demonstração e testes: rascunho por regras, sem enviar dados a terceiros. Bloqueado em produção.
 * Só reflete temas que aparecem nas falas; o restante fica explicitamente sem informação.
 */
export class TemplateSoapSynthesizer implements SoapSynthesizer {
  readonly modelIdentifier = 'template-demo';
  readonly zeroRetention = true;

  async synthesize(utterances: SoapUtterance[]): Promise<SoapSections> {
    const patientText = utterances.filter((u) => u.speaker === TranscriptionSpeaker.PATIENT).map((u) => u.text).join(' ').toLowerCase();
    const therapistText = utterances.filter((u) => u.speaker === TranscriptionSpeaker.THERAPIST).map((u) => u.text).join(' ').toLowerCase();
    const anxiety = /ansiedade|ansios|nervos|angústia/.test(patientText);
    const sleep = /sono|dormir|insônia/.test(patientText);
    const mood = /triste|desânimo|vazio/.test(patientText);

    const subjective: string[] = [];
    if (anxiety) subjective.push('Paciente relata ansiedade associada a pressões do cotidiano.');
    if (sleep) subjective.push('Queixa de dificuldade para dormir.');
    if (mood) subjective.push('Expressa sentimentos de desânimo.');

    const plan: string[] = [];
    if (/registro|diário/.test(therapistText)) plan.push('Registro diário de pensamentos combinado em sessão.');
    if (/respira/.test(therapistText)) plan.push('Prática de respiração diafragmática.');
    if (plan.length) plan.push('Continuidade do acompanhamento semanal.');

    const cid: string[] = [];
    if (anxiety) cid.push('6B00');
    if (mood) cid.push('6A70');

    return {
      subjectiveText: subjective.join(' ') || INSUFFICIENT,
      objectiveText: utterances.length >= 4 ? 'Paciente comunicativo; discurso coeso e organizado ao longo da sessão.' : INSUFFICIENT,
      assessmentText: cid.length
        ? `Hipótese preliminar a confirmar pelo psicólogo: quadro ${anxiety ? 'ansioso (CID-11: 6B00)' : 'depressivo (CID-11: 6A70)'}.`
        : INSUFFICIENT,
      planText: plan.join(' ') || INSUFFICIENT,
      suggestedCid11Codes: cid,
      keyInsightsSummary: []
    };
  }
}

function createSynthesizer(): SoapSynthesizer | null {
  switch (config.soap.provider) {
    case 'openai':
      return config.stt.openaiApiKey ? new OpenAiSoapSynthesizer() : null;
    case 'template':
      return config.isProduction ? null : new TemplateSoapSynthesizer();
    default:
      return null;
  }
}

let synthesizer: SoapSynthesizer | null | undefined;

export function getSoapSynthesizer(): SoapSynthesizer | null {
  if (synthesizer === undefined) synthesizer = createSynthesizer();
  return synthesizer;
}

/** Testes: injeta um sintetizador falso (ou null para desligar) */
export function setSoapSynthesizerForTests(next: SoapSynthesizer | null | undefined): void {
  synthesizer = next;
}
