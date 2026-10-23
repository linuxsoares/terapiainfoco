import { Hono } from 'hono';
import { FINANCE_ROLES } from '@terapiainfoco/shared';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { SessionPaymentService, clinicToday } from '../services/sessionPaymentService';

/** Financeiro do consultório: contas a receber e pagamentos do mês (sem conteúdo clínico) */
export const financeRouter = new Hono();

financeRouter.use('*', authMiddleware(), requireRoles(FINANCE_ROLES));

financeRouter.get('/summary', async (c) => {
  const therapistId = c.get('user').therapistId;
  if (!therapistId) return c.json({ success: false, error: 'Conta sem consultório vinculado.' }, 403);
  const month = c.req.query('month') || clinicToday().slice(0, 7);
  try {
    return c.json({ success: true, ...(await SessionPaymentService.summary(therapistId, month)) });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});
