import { Hono } from 'hono';
import { UserRole, type AdminLead, type CreateLeadDTO } from '@terapiainfoco/shared';
import { db } from '../db/memoryDb';
import { encryptField, decryptField } from '../services/cryptoContext';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { leadRateLimiter } from '../middlewares/rateLimiter';

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

// Pedidos recebidos, mais recentes primeiro (Admin)
leadsRoute.get('/', authMiddleware({ strict: true }), requireRoles([UserRole.ADMIN]), (c) => {
  const leads: AdminLead[] = Array.from(db.leads.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((lead) => ({
      id: lead.id,
      name: lead.name,
      email: decryptField(lead.encryptedEmail),
      whatsapp: lead.encryptedWhatsapp ? decryptField(lead.encryptedWhatsapp) : undefined,
      crp: lead.crp,
      practiceType: lead.practiceType,
      createdAt: lead.createdAt
    }));
  return c.json({ success: true, leads });
});
