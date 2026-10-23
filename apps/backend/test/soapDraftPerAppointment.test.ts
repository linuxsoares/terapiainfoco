import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { authService } from '../src/services/authService';
import { ClinicalRecordRepository } from '../src/repositories/clinicalRecordRepository';
import { resetDb, requireUser, seedDemoSession } from './helpers/db';

const PSICOLOGA_ID = '00000000-0000-0000-0000-000000000001';
const DEMO_PATIENT_ID = '00000000-0000-0000-0000-000000000002';
const DEMO_APPOINTMENT_ID = '00000000-0000-0000-0000-000000000010';
const soap = (subjective: string) => ({ subjective, objective: 'O', assessment: 'A', plan: 'P' });

describe('Evolução SOAP vinculada à consulta', () => {
  let headers: Record<string, string>;

  beforeEach(async () => {
    await resetDb();
    await seedDemoSession();
    const { accessToken } = await authService.issueTokens(await requireUser(PSICOLOGA_ID), '127.0.0.1');
    headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` };
  });

  const saveDraft = (body: Record<string, unknown>) =>
    app.request('/api/clinical-records/draft', { method: 'POST', headers, body: JSON.stringify(body) });

  it('consulta sem evolução devolve record nulo', async () => {
    const res = await app.request(`/api/clinical-records/appointment/${DEMO_APPOINTMENT_ID}`, { headers });
    expect(res.status).toBe(200);
    expect((await res.json() as any).record).toBeNull();
  });

  it('salvar de novo atualiza o mesmo rascunho, sem duplicar o prontuário', async () => {
    const first = await (await saveDraft({ appointmentId: DEMO_APPOINTMENT_ID, soap: soap('primeira versão') })).json() as any;
    const second = await (await saveDraft({ appointmentId: DEMO_APPOINTMENT_ID, soap: soap('versão revisada') })).json() as any;

    expect(second.record.id).toBe(first.record.id);
    expect(second.record.sessionNumber).toBe(first.record.sessionNumber);
    expect(await ClinicalRecordRepository.count({ appointmentId: DEMO_APPOINTMENT_ID })).toBe(1);

    const loaded = await (await app.request(`/api/clinical-records/appointment/${DEMO_APPOINTMENT_ID}`, { headers })).json() as any;
    expect(loaded.record.id).toBe(first.record.id);
    expect(loaded.record.soap.subjective).toBe('versão revisada');
  });

  it('paciente e número da sessão vêm da consulta, não do corpo', async () => {
    const res = await saveDraft({
      appointmentId: DEMO_APPOINTMENT_ID,
      patientId: 'paciente-de-outra-consulta',
      sessionNumber: 99,
      soap: soap('relato')
    });
    expect(res.status).toBe(201);
    const { record } = await res.json() as any;
    expect(record.patientId).toBe(DEMO_PATIENT_ID);
    expect(record.sessionNumber).toBe(1);
  });

  it('consulta inexistente ou ausente responde 404', async () => {
    expect((await saveDraft({ soap: soap('x') })).status).toBe(404);
    expect((await saveDraft({ appointmentId: 'nao-existe', soap: soap('x') })).status).toBe(404);
  });
});
