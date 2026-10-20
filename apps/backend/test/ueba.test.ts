import { describe, it, expect, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { uebaRouter } from '../src/routes/ueba';
import { UebaRiskLevel, UebaAnomalyType, UebaContainmentAction, UebaContainmentStatus } from '@terapiainfoco/shared';
import { adminRequest } from './helpers/adminRequest';

describe('Backend API — Rotas de Análise Comportamental UEBA (RFC-001 §4.4 & LGPD Art. 46)', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/api/ueba', uebaRouter);
  });

  it('GET /api/ueba/overview — deve retornar métricas do motor UEBA e distribuição de risco', async () => {
    const res = await adminRequest('/api/ueba/overview');
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.overview).toBeDefined();
    expect(json.overview.avgRiskScore).toBeGreaterThanOrEqual(0);
    expect(json.overview.riskDistribution).toBeDefined();
    expect(Array.isArray(json.overview.recentIncidents)).toBe(true);
  });

  it('GET /api/ueba/profile/:userId — deve retornar baseline comportamental do usuário', async () => {
    const res = await adminRequest('/api/ueba/profile/usr-therapist-1');
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.baseline).toBeDefined();
    expect(json.baseline.userId).toBe('usr-therapist-1');
    expect(json.baseline.usualHoursStart).toBe(8);
    expect(json.baseline.usualHoursEnd).toBe(19);
    expect(typeof json.contained).toBe('boolean');
  });

  it('POST /api/ueba/evaluate — deve validar acesso normal e retornar score baixo', async () => {
    const res = await adminRequest('/api/ueba/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'usr-therapist-1',
        resourceType: 'CLINICAL_RECORD',
        actionType: 'READ',
        patientId: 'patient-demo-uuid-1',
        recordsAccessedCount: 1,
        timestamp: '2026-10-14T14:00:00.000Z'
      })
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.assessment).toBeDefined();
    expect(json.assessment.riskLevel).toBe(UebaRiskLevel.NORMAL);
    expect(json.incidentCreated).toBe(false);
  });

  it('POST /api/ueba/evaluate — deve rejeitar payload incompleto com status 400', async () => {
    const res = await adminRequest('/api/ueba/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'usr-therapist-1'
        // resourceType e actionType ausentes
      })
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('POST /api/ueba/evaluate — deve detectar anomalia fora de horário na madrugada e criar incidente', async () => {
    const res = await adminRequest('/api/ueba/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'usr-therapist-1',
        resourceType: 'CLINICAL_RECORD',
        actionType: 'READ',
        patientId: 'patient-demo-uuid-1',
        recordsAccessedCount: 1,
        timestamp: '2026-10-14T03:30:00.000Z' // 03:30h da manhã
      })
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.assessment.detectedAnomalies.some((a: any) => a.type === UebaAnomalyType.OFF_HOURS_ACCESS)).toBe(true);
    expect(json.incidentCreated).toBe(true);
    expect(json.incident).toBeDefined();
    expect(json.incident.proofSeal.startsWith('ueba_v1_')).toBe(true);
    expect(json.incident.wormAuditLogId).toBeDefined();
  });

  it('POST /api/ueba/simulate — deve simular cenários anômalos de forma interativa', async () => {
    // 1. Simulação de raspagem massiva (Bulk Scraping)
    const resBulk = await adminRequest('/api/ueba/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenario: 'BULK_SCRAPING',
        userId: 'usr-therapist-1'
      })
    });

    expect(resBulk.status).toBe(200);
    const jsonBulk = await resBulk.json();
    expect(jsonBulk.success).toBe(true);
    expect(jsonBulk.scenario).toBe('BULK_SCRAPING');
    expect(jsonBulk.assessment.detectedAnomalies.some((a: any) => a.type === UebaAnomalyType.BULK_RECORD_SCRAPING)).toBe(true);

    // 2. Simulação de salto de IP impossível
    const resGeo = await adminRequest('/api/ueba/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenario: 'IMPOSSIBLE_GEO_JUMP',
        userId: 'usr-therapist-1'
      })
    });

    expect(resGeo.status).toBe(200);
    const jsonGeo = await resGeo.json();
    expect(jsonGeo.success).toBe(true);
    expect(jsonGeo.assessment.detectedAnomalies.some((a: any) => a.type === UebaAnomalyType.UNUSUAL_GEO_IP_JUMP)).toBe(true);
  });

  it('POST /api/ueba/contain — deve aplicar e liberar contenção administrativa com registro WORM', async () => {
    // 1. Aplicar contenção
    const resContain = await adminRequest('/api/ueba/contain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'usr-therapist-1',
        action: UebaContainmentAction.STEP_UP_2FA_CHALLENGE,
        reason: 'Desafio preventivo de reautenticação solicitado pelo DPO',
        adminNotes: 'Averiguação ética em andamento'
      })
    });

    expect(resContain.status).toBe(200);
    const jsonContain = await resContain.json();
    expect(jsonContain.success).toBe(true);
    expect(jsonContain.action).toBe(UebaContainmentAction.STEP_UP_2FA_CHALLENGE);
    expect(jsonContain.status).toBe(UebaContainmentStatus.ACTIVE_CONTAINMENT);

    // 2. Liberar contenção
    const resRelease = await adminRequest('/api/ueba/contain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'usr-therapist-1',
        action: UebaContainmentAction.NONE,
        reason: 'Justificativa do terapeuta acolhida pelo DPO',
        adminNotes: 'Incidente arquivado como falso positivo operacional'
      })
    });

    expect(resRelease.status).toBe(200);
    const jsonRelease = await resRelease.json();
    expect(jsonRelease.success).toBe(true);
    expect(jsonRelease.action).toBe(UebaContainmentAction.NONE);
    expect(jsonRelease.status).toBe(UebaContainmentStatus.RELEASED);
  });

  it('GET /api/ueba/incidents — deve listar os incidentes anômalos detectados', async () => {
    const res = await adminRequest('/api/ueba/incidents');
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.incidents)).toBe(true);
    expect(json.total).toBeGreaterThanOrEqual(1);
    expect(json.incidents[0].proofSeal.startsWith('ueba_v1_')).toBe(true);
  });
});
