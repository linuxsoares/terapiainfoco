import { describe, it, expect } from 'bun:test';
import { app } from '../src/index';
import {
  PayloadCategory,
  SanitizationStrategy,
  PollutionAttackVector
} from '@terapiainfoco/shared';
import { adminRequest } from './helpers/adminRequest';

describe('Prototype Pollution & Insecure Deserialization Guard REST API (/api/prototype-pollution)', () => {
  let validSealToken: string;

  it('GET /api/prototype-pollution/overview - deve retornar telemetria, política ativa e incidentes', async () => {
    const res = await adminRequest('/api/prototype-pollution/overview');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.overview).toBeDefined();
    expect(body.overview.metrics.totalScannedPayloads).toBeGreaterThanOrEqual(4820);
    expect(body.overview.policy.defaultStrategy).toBeDefined();
    expect(body.overview.recentIncidents.length).toBeGreaterThan(0);
    expect(body.overview.supportedCategories).toContain(PayloadCategory.CLINICAL_ANAMNESIS);
  });

  it('POST /api/prototype-pollution/scan-payload - deve aprovar payload clínico íntegro com selo WORM', async () => {
    const payload = {
      patientId: 'pat_integ_001',
      anamnese: {
        queixaPrincipal: 'Episódios recorrentes de insônia.',
        historicoFamiliar: 'Depressão materna.',
        sintomas: ['cansaço', 'irritabilidade']
      }
    };

    const res = await adminRequest('/api/prototype-pollution/scan-payload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload,
        category: PayloadCategory.CLINICAL_ANAMNESIS
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.result.isClean).toBe(true);
    expect(body.result.threatsDetected.length).toBe(0);
    expect(body.result.proofSeal).toBeDefined();
    expect(body.result.proofSeal.signature.startsWith('proto_guard_v1_')).toBe(true);

    validSealToken = body.result.proofSeal.signature;
  });

  it('POST /api/prototype-pollution/scan-payload - deve interceptar injeção maliciosa de __proto__', async () => {
    // String serializada contendo injeção maliciosa de __proto__
    const malJson = '{"patientId":"pat_integ_002","__proto__":{"isAdmin":true,"role":"SUPERUSER"}}';

    const res = await adminRequest('/api/prototype-pollution/scan-payload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: JSON.parse(malJson),
        category: PayloadCategory.USER_PROFILE_EXT,
        strategy: SanitizationStrategy.NULL_PROTOTYPE_FREEZE
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.result.isClean).toBe(false);
    expect(body.result.threatsDetected.length).toBeGreaterThan(0);

    const protoThreat = body.result.threatsDetected.find(
      (t: any) => t.vector === PollutionAttackVector.PROTO_POLLUTION
    );
    expect(protoThreat).toBeDefined();
    expect(protoThreat.maliciousKey).toBe('__proto__');
  });

  it('POST /api/prototype-pollution/scan-payload - deve retornar 400 se parâmetros obrigatórios faltarem', async () => {
    const res = await adminRequest('/api/prototype-pollution/scan-payload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('POST /api/prototype-pollution/update-policy - deve atualizar parâmetros da política de segurança', async () => {
    const res = await adminRequest('/api/prototype-pollution/update-policy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        policy: {
          maxAllowedDepth: 14,
          maxKeyCount: 1500
        }
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.policy.maxAllowedDepth).toBe(14);
    expect(body.policy.maxKeyCount).toBe(1500);
  });

  it('POST /api/prototype-pollution/simulate-attack - deve simular ataque adversarial com neutralização completa', async () => {
    const res = await adminRequest('/api/prototype-pollution/simulate-attack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenario: 'PROTO_INJECTION_IS_ADMIN'
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.blocked).toBe(true);
    expect(body.scenario).toBe('PROTO_INJECTION_IS_ADMIN');
    expect(body.threatDetected).toBeDefined();
  });

  it('POST /api/prototype-pollution/verify-seal - deve atestar fé pública e autenticidade do selo WORM', async () => {
    expect(validSealToken).toBeDefined();

    const res = await adminRequest('/api/prototype-pollution/verify-seal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sealToken: validSealToken
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.isValid).toBe(true);
    expect(body.seal?.signature).toBe(validSealToken);
  });
});
