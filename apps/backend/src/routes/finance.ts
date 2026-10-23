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

// Relatório mensal com os campos do recibo do Receita Saúde (CPFs decifrados; auditado)
financeRouter.get('/receita-saude', async (c) => {
  const therapistId = c.get('user').therapistId;
  if (!therapistId) return c.json({ success: false, error: 'Conta sem consultório vinculado.' }, 403);
  const month = c.req.query('month') || clinicToday().slice(0, 7);
  try {
    const report = await SessionPaymentService.receitaSaudeReport(therapistId, month, {
      actorId: c.get('userId'),
      ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
      userAgent: c.req.header('user-agent')
    });
    return c.json({ success: true, ...report });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});
