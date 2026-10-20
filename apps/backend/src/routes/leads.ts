import { Hono, type Context } from 'hono';
import { UserRole, type ApproveLeadDTO, type ApproveLeadResponse, type CreateLeadDTO } from '@terapiainfoco/shared';
import { db } from '../db/memoryDb';
import { encryptField } from '../services/cryptoContext';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { leadRateLimiter } from '../middlewares/rateLimiter';
import { LeadService, LeadInputError } from '../services/leadService';

export const leadsRoute = new Hono();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PRACTICE_TYPES = ['autonomo', 'clinica', 'hibrido'];

const clean = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

// Pedido de acesso antecipado enviado pela landing page (público)
leadsRoute.post('/', leadRateLimiter, async (c) => {
  const body = await c.req.json<CreateLeadDTO>().catch(() => null);
  if (!body) return c.json({ success: false, error: 'Corpo da requisição inválido.' }, 400);
  // Honeypot: responde como sucesso para não ensinar o robô, mas não grava
  if (clean(body.website, 200)) return c.json({ success: true }, 201);

  const name = clean(body.name, 120);
  const email = clean(body.email, 160).toLowerCase();
  const crp = clean(body.crp, 30);
  const whatsapp = clean(body.whatsapp, 30);
  if (!name || !EMAIL_PATTERN.test(email) || !crp) {
    return c.json({ success: false, error: 'Informe nome, e-mail válido e CRP.' }, 400);
  }
  if (body.consent !== true) {
    return c.json({ success: false, error: 'É preciso autorizar o contato para enviar o pedido.' }, 400);
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  db.leads.set(id, {
    id,
    name,
    encryptedEmail: encryptField(email),
    encryptedWhatsapp: whatsapp ? encryptField(whatsapp) : undefined,
    crp,
    practiceType: PRACTICE_TYPES.includes(body.practiceType ?? '') ? body.practiceType! : 'autonomo',
    consentAt: now,
    createdAt: now
  });
  return c.json({ success: true }, 201);
});

const adminContext = (c: Context) => ({
  actorId: c.get('user').id,
  ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1'
});

// Pedidos recebidos, mais recentes primeiro (Admin)
leadsRoute.get('/', authMiddleware({ strict: true }), requireRoles([UserRole.ADMIN]), (c) => c.json({ success: true, leads: LeadService.list() }));

// Aprova o pedido: cria a conta de psicólogo com senha inicial (Admin)
leadsRoute.post('/:id/approve', authMiddleware({ strict: true }), requireRoles([UserRole.ADMIN]), async (c) => {
  const body = await c.req.json<ApproveLeadDTO>().catch(() => null);
  try {
    const { lead, temporaryPassword } = await LeadService.approve(c.req.param('id') ?? '', body?.crpRegion ?? '', adminContext(c));
    const response: ApproveLeadResponse = { success: true, lead, temporaryPassword };
    return c.json(response, 201);
  } catch (err) {
    if (err instanceof LeadInputError) return c.json({ success: false, error: err.message }, 400);
    throw err;
  }
});

// Recusa o pedido (Admin)
leadsRoute.post('/:id/reject', authMiddleware({ strict: true }), requireRoles([UserRole.ADMIN]), (c) => {
  try {
    return c.json({ success: true, lead: LeadService.reject(c.req.param('id') ?? '', adminContext(c)) });
  } catch (err) {
    if (err instanceof LeadInputError) return c.json({ success: false, error: err.message }, 400);
    throw err;
  }
});
