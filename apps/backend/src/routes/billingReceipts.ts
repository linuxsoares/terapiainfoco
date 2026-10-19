import { Hono } from 'hono';
import {
  UserRole,
  type CreateClinicalReceiptDTO,
  type CancelReceiptDTO,
  type CreateFeeContractDTO
} from '@terapiainfoco/shared';
import { BillingReceiptService } from '../services/billingReceiptService';
import { authMiddleware, requireRole } from '../middlewares/authMiddleware';
import { canAccessEntity, canAccessPatient, requireBodyOwnership } from '../middlewares/accessPolicy';
import { PRACTICE_STAFF_ROLES } from '../middlewares/authMiddleware';
import { db } from '../db/memoryDb';
import { validationRateLimiter } from '../middlewares/rateLimiter';

export const billingReceiptsRouter = new Hono();

/**
 * GET /api/billing/receipts/validate/:token
 * Endpoint PÚBLICO de validação do recibo (para convênios e operadoras de saúde)
 * Protegido contra enumeração e brute-force com validationRateLimiter
 */
billingReceiptsRouter.get('/receipts/validate/:token', validationRateLimiter, async (c) => {
  try {
    const token = c.req.param('token');
    const result = BillingReceiptService.validatePublicReceipt(token);

    if (!result.valid) {
      return c.json(result, 404);
    }

    return c.json(result, 200);
  } catch (err: any) {
    return c.json({ success: false, valid: false, message: err.message }, 400);
  }
});

/**
 * Rotas autenticadas de faturamento e gestão de honorários
 */
billingReceiptsRouter.use('*', authMiddleware(), requireRole(PRACTICE_STAFF_ROLES), requireBodyOwnership());

/**
 * POST /api/billing/receipts
 * Emite novo Recibo de Honorários Clínicos (reembolso convênio / IRPF DMED)
 */
billingReceiptsRouter.post('/receipts', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json<CreateClinicalReceiptDTO>();

    if (!body.patientId || !body.purpose || !body.modality || !body.amountCents || !body.paymentMethod) {
      return c.json({
        success: false,
        error: 'Campos obrigatórios: patientId, purpose, modality, amountCents e paymentMethod'
      }, 400);
    }

    const therapistId = user.therapistId!;
    const receipt = BillingReceiptService.generateReceipt({
      therapistId,
      dto: body,
      context: {
        actorId: user.id,
        ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
        userAgent: c.req.header('user-agent')
      }
    });

    return c.json({ success: true, receipt, message: 'Recibo de honorários emitido com sucesso.' }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

/**
 * POST /api/billing/receipts/cancel
 * Cancela recibo emitido com registro de motivo
 */
billingReceiptsRouter.post('/receipts/cancel', requireRole([UserRole.PSICOLOGO_TITULAR]), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json<CancelReceiptDTO>();

    if (!body.receiptId || !body.cancelReason) {
      return c.json({ success: false, error: 'receiptId e cancelReason são obrigatórios' }, 400);
    }
    if (!canAccessEntity(c.get('user'), db.receipts.get(body.receiptId))) {
      return c.json({ success: false, error: 'Recibo não encontrado.' }, 404);
    }

    const receipt = BillingReceiptService.cancelReceipt({
      receiptId: body.receiptId,
      cancelReason: body.cancelReason,
      context: {
        actorId: user.id,
        ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
        userAgent: c.req.header('user-agent')
      }
    });

    return c.json({ success: true, receipt, message: 'Recibo cancelado com sucesso.' });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

/**
 * GET /api/billing/receipts
 * Lista recibos emitidos (opcionalmente filtrados por ?patientId=...)
 */
billingReceiptsRouter.get('/receipts', async (c) => {
  try {
    const user = c.get('user');
    const patientId = c.req.query('patientId');
    if (patientId && !canAccessPatient(user, patientId)) {
      return c.json({ success: false, error: 'Paciente não encontrado.' }, 404);
    }

    const result = BillingReceiptService.listReceipts({
      patientId,
      therapistId: user.therapistId,
      context: {
        actorId: user.id,
        ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
        userAgent: c.req.header('user-agent')
      }
    });

    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

/**
 * POST /api/billing/fee-contracts
 * Cria Termo / Contrato de Prestação de Serviços Psicológicos e Honorários
 */
billingReceiptsRouter.post('/fee-contracts', requireRole([UserRole.PSICOLOGO_TITULAR]), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json<CreateFeeContractDTO>();

    if (!body.patientId || !body.sessionPriceCents) {
      return c.json({ success: false, error: 'patientId e sessionPriceCents são obrigatórios' }, 400);
    }

    const therapistId = user.therapistId!;
    const contract = BillingReceiptService.createFeeContract({
      therapistId,
      dto: body,
      context: {
        actorId: user.id,
        ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
        userAgent: c.req.header('user-agent')
      }
    });

    return c.json({ success: true, contract, message: 'Contrato de honorários gerado com sucesso.' }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});
