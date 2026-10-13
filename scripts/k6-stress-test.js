import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * Script Oficial k6 para Testes de Carga & Estresse — TerapiaInFoco (RFC-001 §5.1, §5.2)
 * Executar via CLI do k6:
 *   k6 run scripts/k6-stress-test.js
 * Ou apontando para URL de staging/produção:
 *   k6 run -e BASE_URL=https://api.terapiainfoco.com.br scripts/k6-stress-test.js
 */

export const options = {
  stages: [
    { duration: '10s', target: 20 },  // Ramp-up para 20 VUs
    { duration: '30s', target: 50 },  // Carga contínua em 50 VUs concorrentes
    { duration: '10s', target: 100 }, // Pico rápido de 100 VUs
    { duration: '10s', target: 0 },   // Ramp-down
  ],
  thresholds: {
    // SLO 1: P99 de latência < 250ms
    http_req_duration: ['p(95)<200', 'p(99)<250'],
    // SLO 2: Taxa de falhas < 1.0%
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  // 1. Consulta Pública de Horários Livres (Operação de Alta Frequência)
  const slotsRes = http.get(`${BASE_URL}/api/appointments/available-slots?therapistId=therapist-001&date=2026-10-20`);
  check(slotsRes, {
    'slots status is 200': (r) => r.status === 200,
    'slots returns valid json': (r) => r.json().slots !== undefined,
  });

  // 2. Health & Readiness Probe
  const healthRes = http.get(`${BASE_URL}/health/liveness`);
  check(healthRes, {
    'health status is 200': (r) => r.status === 200,
  });

  sleep(0.5);
}
