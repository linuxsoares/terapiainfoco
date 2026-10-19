import { config } from '../../config';

/**
 * Provedor de Speech-to-Text (ADR-005). Recebe um trecho curto de áudio em memória e devolve
 * texto; quem chama descarta o áudio em seguida. O provedor externo é operador de dados de saúde
 * (LGPD Art. 39) e deve ser contratado com política de não retenção.
 */
export interface SttProvider {
  readonly name: string;
  transcribe(audio: Uint8Array, mimeType: string): Promise<string>;
}

export class OpenAiSttProvider implements SttProvider {
  readonly name = 'openai';

  async transcribe(audio: Uint8Array, mimeType: string): Promise<string> {
    const extension = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm';
    // Cópia com ArrayBuffer próprio para o Blob; também é zerada depois do envio
    const payload = audio.slice();
    const form = new FormData();
    form.append('file', new Blob([payload], { type: mimeType }), `trecho.${extension}`);
    form.append('model', config.stt.model);
    form.append('language', config.stt.language);
    form.append('response_format', 'json');
    let res: Response;
    try {
      res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.stt.openaiApiKey}` },
        body: form
      });
    } finally {
      payload.fill(0);
    }
    if (!res.ok) {
      // Mensagem do provedor (ex.: chave inválida, sem crédito, modelo inexistente); não contém dados do paciente
      const detail = await res.json().then((b: any) => b?.error?.message as string | undefined).catch(() => undefined);
      console.warn(`⚠️ STT OpenAI respondeu HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
      throw new Error(`Provedor de transcrição recusou o trecho (HTTP ${res.status}${detail ? `: ${detail}` : ''}).`);
    }
    const body = (await res.json()) as { text?: string };
    return body.text ?? '';
  }
}

/** Demonstração/E2E: texto fixo, sem enviar áudio a terceiros. Bloqueado em produção. */
class SimulatedSttProvider implements SttProvider {
  readonly name = 'simulated';

  async transcribe(audio: Uint8Array): Promise<string> {
    return `[transcrição simulada de ${Math.round(audio.byteLength / 1024)} KB de áudio]`;
  }
}

function createProvider(): SttProvider | null {
  switch (config.stt.provider) {
    case 'openai':
      return config.stt.openaiApiKey ? new OpenAiSttProvider() : null;
    case 'simulated':
      return config.isProduction ? null : new SimulatedSttProvider();
    default:
      return null;
  }
}

let provider: SttProvider | null | undefined;

export function getSttProvider(): SttProvider | null {
  if (provider === undefined) provider = createProvider();
  return provider;
}

/** Testes: injeta um provedor falso (ou null para desligar) */
export function setSttProviderForTests(next: SttProvider | null | undefined): void {
  provider = next;
}
