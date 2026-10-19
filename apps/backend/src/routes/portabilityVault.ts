import { Hono } from 'hono';
import { UserRole } from '@terapiainfoco/shared';
import type {
  DecryptPortabilityEncVaultDTO,
  GeneratePortabilityEncVaultDTO,
  VerifyPortabilityEncVaultDTO
} from '@terapiainfoco/shared';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { requireBodyOwnership, requirePatientAccess } from '../middlewares/accessPolicy';
import { PortabilityVaultService } from '../services/portabilityVaultService';

export const portabilityVaultRouter = new Hono();

portabilityVaultRouter.use('*', authMiddleware(), requireBodyOwnership());

/**
 * POST /api/portability-vault/generate
 * Gera o pacote .enc protegido por Argon2id + AES-256-GCM consolidando todas as 11 seções clínicas
 */
portabilityVaultRouter.post(
  '/generate',
  requireRoles([UserRole.PSICOLOGO_TITULAR, UserRole.PACIENTE]),
  async (c) => {
    try {
      const body = await c.req.json<GeneratePortabilityEncVaultDTO>();
      if (!body?.patientId || !body?.holderPassphrase) {
        return c.json(
          {
            success: false,
            error: 'Os parâmetros patientId e holderPassphrase são obrigatórios.'
          },
          400
        );
      }

      const user = c.get('user');
      const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
      const userAgent = c.req.header('user-agent');

      const result = PortabilityVaultService.generateEncryptedVault({
        dto: body,
        context: {
          actorId: user.id,
          ipAddress: ip,
          userAgent
        }
      });

      return c.json(result, 201);
    } catch (err: any) {
      const status = err.message?.includes('não encontrado') ? 404 : 400;
      return c.json({ success: false, error: err.message }, status);
    }
  }
);

/**
 * POST /api/portability-vault/verify
 * Verifica a integridade criptográfica do arquivo .enc (Merkle Root, SHA-256, Selo Notarial WORM e opcionalmente senha)
 */
portabilityVaultRouter.post(
  '/verify',
  requireRoles([UserRole.PSICOLOGO_TITULAR, UserRole.SUPERVISOR_CLINICO, UserRole.PACIENTE]),
  async (c) => {
    try {
      const body = await c.req.json<VerifyPortabilityEncVaultDTO>();
      if (!body?.vaultFile) {
        return c.json(
          {
            success: false,
            error: 'O objeto vaultFile (.enc) é obrigatório para verificação de integridade.'
          },
          400
        );
      }

      const user = c.get('user');
      const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
      const userAgent = c.req.header('user-agent');

      const result = PortabilityVaultService.verifyVault({
        dto: body,
        context: {
          actorId: user.id,
          ipAddress: ip,
          userAgent
        }
      });

      return c.json(result, 200);
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 400);
    }
  }
);

/**
 * POST /api/portability-vault/decrypt
 * Decifra e inspeciona um arquivo .enc mediante a senha do titular
 */
portabilityVaultRouter.post(
  '/decrypt',
  requireRoles([UserRole.PSICOLOGO_TITULAR, UserRole.PACIENTE]),
  async (c) => {
    try {
      const body = await c.req.json<DecryptPortabilityEncVaultDTO>();
      if (!body?.vaultFile || !body?.holderPassphrase) {
        return c.json(
          {
            success: false,
            error: 'Os parâmetros vaultFile e holderPassphrase são obrigatórios.'
          },
          400
        );
      }

      const user = c.get('user');
      const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
      const userAgent = c.req.header('user-agent');

      const result = PortabilityVaultService.decryptVault({
        dto: body,
        context: {
          actorId: user.id,
          ipAddress: ip,
          userAgent
        }
      });

      return c.json(result, 200);
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 400);
    }
  }
);

/**
 * GET /api/portability-vault/patients/:patientId/history
 * Lista o histórico de cofres .enc emitidos para o paciente
 */
portabilityVaultRouter.get(
  '/patients/:patientId/history',
  requireRoles([UserRole.PSICOLOGO_TITULAR, UserRole.SUPERVISOR_CLINICO, UserRole.PACIENTE]),
  requirePatientAccess('patientId'),
  async (c) => {
    const patientId = c.req.param('patientId');
    const result = PortabilityVaultService.getPatientVaultHistory(patientId);
    return c.json(result, 200);
  }
);
