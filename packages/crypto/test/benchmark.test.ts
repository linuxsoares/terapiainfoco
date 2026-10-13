import { describe, it, expect } from 'bun:test';
import { calculatePercentiles, runConcurrentCryptoStress } from '../src/benchmark';

describe('Engine de Benchmarking & Percentis RED (RFC-001 §5.1, §5.2)', () => {
  it('deve retornar zeros para array de latências vazio', () => {
    const res = calculatePercentiles([]);
    expect(res.p50).toBe(0);
    expect(res.p95).toBe(0);
    expect(res.p99).toBe(0);
    expect(res.avg).toBe(0);
  });

  it('deve calcular percentis P50, P90, P95 e P99 com precisão matemática', () => {
    // Array com 100 números de 1 a 100
    const latencies = Array.from({ length: 100 }, (_, i) => i + 1);
    const res = calculatePercentiles(latencies);

    expect(res.min).toBe(1);
    expect(res.max).toBe(100);
    expect(res.avg).toBe(50.5);
    expect(res.p50).toBe(50);
    expect(res.p90).toBe(90);
    expect(res.p95).toBe(95);
    expect(res.p99).toBe(99);
  });

  it('deve lidar corretamente com latências fracionárias em ponto flutuante', () => {
    const latencies = [1.25, 2.50, 4.75, 10.00, 15.50];
    const res = calculatePercentiles(latencies);

    expect(res.min).toBe(1.25);
    expect(res.max).toBe(15.5);
    expect(res.p50).toBe(4.75);
    expect(res.avg).toBeCloseTo(6.8, 1);
  });

  it('deve executar estresse criptográfico concorrente com Envelope Encryption sem falhas', async () => {
    const stressResult = await runConcurrentCryptoStress(50, 10);

    expect(stressResult.successful).toBe(50);
    expect(stressResult.failed).toBe(0);
    expect(stressResult.latencies.length).toBe(50);

    const stats = calculatePercentiles(stressResult.latencies);
    expect(stats.min).toBeGreaterThan(0);
    expect(stats.p99).toBeGreaterThan(0);
    // Cada operação criptográfica local com AES-GCM e KMS deve ser extremamente rápida (< 100ms)
    expect(stats.p99).toBeLessThan(100);
  });
});
