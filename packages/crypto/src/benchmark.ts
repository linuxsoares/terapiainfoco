import type { StressPercentiles } from '@terapiainfoco/shared';
import { EnvelopeEncryptionService } from './envelope';
import { LocalKmsProvider } from './kms';
import { computeBlindIndex, normalizeCpf } from './blindIndex';

/**
 * Calcula os percentis estatísticos (P50, P90, P95, P99, Min, Max, Média)
 * com alta precisão a partir de um array de latências (ms).
 */
export function calculatePercentiles(latencies: number[]): StressPercentiles {
  if (latencies.length === 0) {
    return { p50: 0, p90: 0, p95: 0, p99: 0, min: 0, max: 0, avg: 0 };
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const total = sorted.length;

  const getPercentile = (p: number) => {
    const index = Math.ceil((p / 100) * total) - 1;
    return Number(sorted[Math.max(0, Math.min(index, total - 1))].toFixed(2));
  };

  const sum = sorted.reduce((acc, val) => acc + val, 0);

  return {
    min: Number(sorted[0].toFixed(2)),
    max: Number(sorted[total - 1].toFixed(2)),
    avg: Number((sum / total).toFixed(2)),
    p50: getPercentile(50),
    p90: getPercentile(90),
    p95: getPercentile(95),
    p99: getPercentile(99)
  };
}

/**
 * Executa estresse criptográfico concorrente com Envelope Encryption (KMS) e Blind Indexing
 * simulando carga extrema em repouso conforme RFC-001 §4.2 e §4.3.
 */
export async function runConcurrentCryptoStress(
  iterations: number = 100,
  concurrency: number = 10
): Promise<{ latencies: number[]; successful: number; failed: number }> {
  const kms = new LocalKmsProvider();
  const envelope = new EnvelopeEncryptionService(kms);
  const salt = 'benchmark-salt-secret-32-bytes-ok!';
  const latencies: number[] = [];
  let successful = 0;
  let failed = 0;

  const executeBatch = async (batchSize: number) => {
    const promises = Array.from({ length: batchSize }).map(async (_, idx) => {
      const start = performance.now();
      try {
        const text = `Nota clínica confidencial #${idx} - Paciente em acompanhamento psicológico sob sigilo estrito.`;
        const encryptedEnvelope = await envelope.encrypt(text);
        const blindIndex = computeBlindIndex(normalizeCpf('123.456.789-00'), salt);
        const decrypted = await envelope.decrypt(encryptedEnvelope);
        if (decrypted !== text || !blindIndex) throw new Error('Inconsistência criptográfica');
        successful++;
      } catch {
        failed++;
      } finally {
        latencies.push(performance.now() - start);
      }
    });
    await Promise.all(promises);
  };

  const batchCount = Math.ceil(iterations / concurrency);
  for (let b = 0; b < batchCount; b++) {
    const currentBatchSize = Math.min(concurrency, iterations - b * concurrency);
    await executeBatch(currentBatchSize);
  }

  return { latencies, successful, failed };
}
