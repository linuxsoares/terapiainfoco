import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';

/**
 * Transcrição da fala do próprio participante durante a teleconsulta (ADR-005).
 *
 * A cada ~8 s, o áudio do microfone é codificado em memória (MediaRecorder apenas como
 * codificador) e enviado ao backend, que o transcreve e descarta. Nada é salvo no navegador
 * nem no servidor além do texto. Trechos sem voz não são enviados.
 */

const CHUNK_MS = 8000;
const AUDIO_BITS_PER_SECOND = 32_000;
const LEVEL_SAMPLE_MS = 200;
/** Nível RMS (0–1) acima do qual consideramos que há fala no trecho */
const VOICE_RMS_THRESHOLD = 0.02;
const MIN_VOICED_SAMPLES = 3;

function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  return candidates.find((type) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) ?? '';
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  bytes.fill(0);
  return btoa(binary);
}

export function useLiveTranscription({ appointmentId, stream, enabled }: {
  appointmentId: string;
  stream: MediaStream | null;
  enabled: boolean;
}) {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentChunks, setSentChunks] = useState(0);
  const audioTrack = stream?.getAudioTracks()[0] ?? null;
  const stoppedRef = useRef(true);

  useEffect(() => {
    const mimeType = pickMimeType();
    if (!enabled || !audioTrack || !mimeType || typeof MediaRecorder === 'undefined') {
      setActive(false);
      return;
    }
    stoppedRef.current = false;
    const audioStream = new MediaStream([audioTrack]);

    // Detector simples de voz para não enviar silêncio
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx: AudioContext | null = AudioCtx ? new AudioCtx() : null;
    const analyser = ctx?.createAnalyser() ?? null;
    if (ctx && analyser) {
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(audioStream).connect(analyser);
    }
    const samples = new Float32Array(analyser?.fftSize ?? 0);
    let voicedSamples = 0;
    const levelTimer = setInterval(() => {
      if (!analyser || !audioTrack.enabled) return;
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const value of samples) sum += value * value;
      if (Math.sqrt(sum / samples.length) > VOICE_RMS_THRESHOLD) voicedSamples++;
    }, LEVEL_SAMPLE_MS);

    let recorder: MediaRecorder | null = null;
    let cycleTimer: ReturnType<typeof setTimeout>;

    const startCycle = () => {
      if (stoppedRef.current) return;
      const startedAt = Date.now();
      voicedSamples = 0;
      // 32 kbps de Opus bastam para fala e reduzem ~4x o tráfego em relação ao padrão do navegador
      recorder = new MediaRecorder(audioStream, { mimeType, audioBitsPerSecond: AUDIO_BITS_PER_SECOND });
      recorder.ondataavailable = async (event) => {
        const hasVoice = voicedSamples >= MIN_VOICED_SAMPLES || !analyser;
        if (!hasVoice || event.data.size === 0) return;
        try {
          await api.sendLiveTranscriptChunk({
            appointmentId,
            audioBase64: await toBase64(event.data),
            mimeType: event.data.type || mimeType,
            durationMs: Date.now() - startedAt
          });
          setSentChunks((count) => count + 1);
          setError(null);
        } catch (err: any) {
          setError(err.message || 'Falha ao transcrever o trecho.');
        }
      };
      recorder.onstop = () => startCycle();
      recorder.start();
      cycleTimer = setTimeout(() => recorder?.state === 'recording' && recorder.stop(), CHUNK_MS);
    };

    startCycle();
    setActive(true);

    return () => {
      stoppedRef.current = true;
      clearTimeout(cycleTimer);
      clearInterval(levelTimer);
      if (recorder?.state === 'recording') recorder.stop();
      ctx?.close().catch(() => undefined);
      setActive(false);
    };
  }, [enabled, audioTrack, appointmentId]);

  return { active, error, sentChunks };
}
