import { Hono } from 'hono';
import { PatientService } from '../services/patientService';
import type { CreatePatientDTO } from '@terapiainfoco/shared';

export const patientsRoute = new Hono();

// Cadastrar paciente com FLE e Blind Indexing (§4.1, §4.3)
patientsRoute.post('/', async (c) => {
  const body = await c.req.json<CreatePatientDTO & { therapistId: string }>();
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');

  try {
    const patient = PatientService.createPatient(
      body.therapistId || 'therapist-001',
      body,
      { actorId: body.therapistId || 'therapist-001', ipAddress: ip, userAgent }
    );
    return c.json({ success: true, patient }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

// Buscar paciente por ID
patientsRoute.get('/:id', async (c) => {
  const id = c.req.param('id');
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');

  const patient = PatientService.getPatientById(id, {
    actorId: 'therapist-001',
    ipAddress: ip,
    userAgent
  });

  if (!patient) {
    return c.json({ success: false, error: 'Paciente não encontrado' }, 404);
  }

  return c.json({ success: true, patient });
});

// Busca cega por CPF via HMAC-SHA256 Blind Index (§4.3)
patientsRoute.get('/search/cpf', async (c) => {
  const cpf = c.req.query('cpf');
  if (!cpf) {
    return c.json({ success: false, error: 'Parâmetro cpf é obrigatório' }, 400);
  }

  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');

  const patient = PatientService.findByCpf(cpf, {
    actorId: 'therapist-001',
    ipAddress: ip,
    userAgent
  });

  if (!patient) {
    return c.json({ success: false, error: 'Nenhum paciente localizado' }, 404);
  }

  return c.json({ success: true, patient });
});

// Solicitação de Quarentena LGPD Art. 18 vs. Guarda CFP (§2.2)
patientsRoute.post('/:id/quarantine', async (c) => {
  const id = c.req.param('id');
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');

  const success = PatientService.quarantinePatient(id, {
    actorId: 'dpo-or-patient',
    ipAddress: ip,
    userAgent
  });

  if (!success) {
    return c.json({ success: false, error: 'Paciente não encontrado' }, 404);
  }

  return c.json({
    success: true,
    message: 'Paciente anonimizado e prontuário retido em quarentena legal de 5 anos (CFP nº 001/2009).'
  });
});
