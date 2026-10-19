import { Hono } from 'hono';
import { PatientService } from '../services/patientService';
import { PortabilityService } from '../services/portabilityService';
import { AnamnesisService } from '../services/anamnesisService';
import { webhookService } from '../services/webhookService';
import { searchRateLimiter } from '../middlewares/rateLimiter';
import { authMiddleware, requireRoles, PRACTICE_STAFF_ROLES } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';
import type { CreatePatientDTO, SaveAnamnesisDTO } from '@terapiainfoco/shared';


export const patientsRoute = new Hono();

// Middleware de autenticação padrão para pacientes
patientsRoute.use('*', authMiddleware());


// Cadastrar paciente com FLE e Blind Indexing (§4.1, §4.3)
patientsRoute.post('/', requireRoles(PRACTICE_STAFF_ROLES), async (c) => {
  const body = await c.req.json<CreatePatientDTO>();
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');
  const therapistId = c.get('user').therapistId;
  if (!therapistId) {
    return c.json({ success: false, error: 'Usuário sem consultório vinculado.' }, 403);
  }

  try {
    // O paciente pertence sempre ao consultório de quem o cadastra
    const patient = PatientService.createPatient(
      therapistId,
      body,
      { actorId: c.get('userId'), ipAddress: ip, userAgent }
    );
    return c.json({ success: true, patient }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

// Buscar paciente por ID
patientsRoute.get('/:id', requireRoles(PRACTICE_STAFF_ROLES), async (c) => {
  const id = c.req.param('id');
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');

  const patient = PatientService.getPatientById(id, {
    actorId: c.get('userId'),
    ipAddress: ip,
    userAgent
  });

  if (!patient) {
    return c.json({ success: false, error: 'Paciente não encontrado' }, 404);
  }

  return c.json({ success: true, patient });
});

// Busca cega por CPF via HMAC-SHA256 Blind Index (§4.3) com proteção contra ataques de enumeração
patientsRoute.get('/search/cpf', searchRateLimiter, requireRoles(PRACTICE_STAFF_ROLES), async (c) => {
  const cpf = c.req.query('cpf');
  if (!cpf) {
    return c.json({ success: false, error: 'Parâmetro cpf é obrigatório' }, 400);
  }

  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');

  const patient = PatientService.findByCpf(cpf, {
    actorId: c.get('userId'),
    ipAddress: ip,
    userAgent
  });

  if (!patient) {
    return c.json({ success: false, error: 'Nenhum paciente localizado' }, 404);
  }

  return c.json({ success: true, patient });
});

// Solicitação de Quarentena LGPD Art. 18 vs. Guarda CFP (§2.2) - restrito a Psicólogo Titular ou Admin
patientsRoute.post('/:id/quarantine', requireRoles([UserRole.PSICOLOGO_TITULAR, UserRole.ADMIN]), async (c) => {

  const id = c.req.param('id');
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');

  const success = PatientService.quarantinePatient(id, {
    actorId: c.get('userId'),
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

// Exportação de Prontuário Completo e Portabilidade de Dados (LGPD Art. 18, V & CFP nº 001/2009)
patientsRoute.post('/:id/export', requireRoles([UserRole.PSICOLOGO_TITULAR, UserRole.ADMIN]), async (c) => {
  const id = c.req.param('id');
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');
  const user = c.get('user');

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    // Body vazio ou JSON opcional
  }

  try {
    const response = PortabilityService.exportPatientData({
      patientId: id,
      dto: body,
      context: {
        actorId: user.id,
        ipAddress: ip,
        userAgent
      }
    });

    webhookService.notifyEvent('DATA_EXPORT_LGPD', {
      patientId: id,
      actorId: user.id,
      format: response.format,
      checksumSha256: response.checksumSha256
    }).catch(() => {});

    return c.json(response, 200);
  } catch (err: any) {
    const status = err.message.includes('não encontrado') ? 404 : 400;
    return c.json({ success: false, error: err.message }, status);
  }
});

// Revogação Formal de Consentimento (LGPD Art. 18, IX & Resolução CFP nº 001/2009)
patientsRoute.post('/:id/revoke-consent', requireRoles([UserRole.PSICOLOGO_TITULAR, UserRole.ADMIN]), async (c) => {
  const id = c.req.param('id');
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');
  const user = c.get('user');

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Corpo da requisição inválido.' }, 400);
  }

  try {
    const response = PortabilityService.revokeConsent({
      patientId: id,
      dto: body,
      context: {
        actorId: user.id,
        ipAddress: ip,
        userAgent
      }
    });

    webhookService.notifyEvent('CONSENT_REVOKED', {
      patientId: id,
      actorId: user.id,
      reason: body.reason,
      quarantined: response.quarantined
    }).catch(() => {});

    return c.json(response, 200);
  } catch (err: any) {
    const status = err.message.includes('não encontrado') ? 404 : 400;
    return c.json({ success: false, error: err.message }, status);
  }
});

// 5. Ficha de Admissão & Anamnese Biopsicossocial (RFC §3.4, CFP nº 001/2009)
patientsRoute.get('/:id/anamnesis', requireRoles([UserRole.PSICOLOGO_TITULAR, UserRole.SUPERVISOR_CLINICO, UserRole.ADMIN]), async (c) => {
  const id = c.req.param('id');
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');
  const user = c.get('user');

  const anamnesis = AnamnesisService.getAnamnesisByPatientId(id, {
    actorId: user.id,
    ipAddress: ip,
    userAgent
  });

  if (!anamnesis) {
    return c.json({ success: false, message: 'Ficha de anamnese não cadastrada para este paciente.' }, 404);
  }

  return c.json({ success: true, anamnesis }, 200);
});

patientsRoute.post('/:id/anamnesis', requireRoles([UserRole.PSICOLOGO_TITULAR, UserRole.ADMIN]), async (c) => {
  const id = c.req.param('id');
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');
  const user = c.get('user');

  let body: SaveAnamnesisDTO;
  try {
    body = await c.req.json<SaveAnamnesisDTO>();
  } catch {
    return c.json({ success: false, error: 'Corpo da requisição inválido.' }, 400);
  }

  try {
    const anamnesis = AnamnesisService.saveAnamnesis({
      patientId: id,
      therapistId: user?.therapistId || user.id,
      dto: body,
      context: {
        actorId: user.id,
        ipAddress: ip,
        userAgent
      }
    });

    return c.json({ success: true, anamnesis }, 200);
  } catch (err: any) {
    const status = err.message.includes('não encontrado') ? 404 : 400;
    return c.json({ success: false, error: err.message }, status);
  }
});

// Linha do Tempo Clínica Longitudinal do Paciente (RFC-001 §3.4)
patientsRoute.get('/:id/timeline', requireRoles([UserRole.PSICOLOGO_TITULAR, UserRole.SUPERVISOR_CLINICO, UserRole.ADMIN]), async (c) => {
  const id = c.req.param('id');
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent');
  const user = c.get('user');

  try {
    const timeline = PatientService.getPatientTimeline(id, {
      actorId: user.id,
      ipAddress: ip,
      userAgent
    });
    return c.json({ success: true, timeline });
  } catch (err: any) {
    const status = err.message.includes('não encontrado') ? 404 : 400;
    return c.json({ success: false, error: err.message }, status);
  }
});


