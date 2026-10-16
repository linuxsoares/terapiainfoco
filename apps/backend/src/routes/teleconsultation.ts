import { Hono } from 'hono';
import {
  type KnockWaitingRoomDTO,
  type AdmitParticipantDTO,
  type UpdateCallQualityDTO,
  type ToggleRecordingDTO,
  type EndTeleconsultationDTO,
  UserRole
} from '@terapiainfoco/shared';
import { TeleconsultationService } from '../services/teleconsultationService';
import { authMiddleware, requireRole } from '../middlewares/authMiddleware';

export const teleconsultationRoutes = new Hono();

/**
 * POST /api/teleconsultation/knock
 * Paciente bate à porta da sala de espera (Knocking / Waiting Room - CFP nº 011/2018)
 * Endpoint acessível pelo link de teleconsulta do paciente
 */
teleconsultationRoutes.post('/knock', async (c) => {
  try {
    const body = await c.req.json<KnockWaitingRoomDTO>();
    if (!body.appointmentId || !body.patientName) {
      return c.json({
        success: false,
        message: 'Identificação da consulta (appointmentId) e nome do paciente são obrigatórios.'
      }, 400);
    }

    const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
    const userAgent = c.req.header('user-agent');

    const result = TeleconsultationService.knockWaitingRoom({
      dto: body,
      ipAddress,
      userAgent
    });

    return c.json(result, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Erro ao entrar na sala de espera.'
    }, 400);
  }
});

/**
 * GET /api/teleconsultation/room/:appointmentId
 * Obtém estado atual da sala de teleconsulta e fila de espera
 */
teleconsultationRoutes.get('/room/:appointmentId', authMiddleware(), async (c) => {
  try {
    const appointmentId = c.req.param('appointmentId');
    const user = c.get('user');
    const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
    const userAgent = c.req.header('user-agent');

    const room = TeleconsultationService.getOrCreateRoom({
      appointmentId,
      context: {
        actorId: user.id,
        ipAddress,
        userAgent
      }
    });

    return c.json({
      success: true,
      room
    }, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Erro ao carregar sala de teleconsulta.'
    }, 400);
  }
});

/**
 * POST /api/teleconsultation/admit
 * Terapeuta admite ou rejeita participante na sala de espera
 */
teleconsultationRoutes.post('/admit', authMiddleware(), requireRole([UserRole.PSICOLOGO_TITULAR, UserRole.SUPERVISOR_CLINICO]), async (c) => {
  try {
    const body = await c.req.json<AdmitParticipantDTO>();
    if (!body.appointmentId || !body.participantId || !body.action) {
      return c.json({
        success: false,
        message: 'appointmentId, participantId e action são obrigatórios.'
      }, 400);
    }

    const user = c.get('user');
    const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
    const userAgent = c.req.header('user-agent');

    const room = TeleconsultationService.admitOrRejectParticipant({
      dto: body,
      context: {
        actorId: user.id,
        ipAddress,
        userAgent
      }
    });

    return c.json({
      success: true,
      room,
      message: body.action === 'ADMIT' ? 'Paciente admitido na sessão com sucesso.' : 'Entrada rejeitada.'
    }, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Erro ao admitir participante.'
    }, 400);
  }
});

/**
 * POST /api/teleconsultation/quality
 * Atualiza telemetria de conexão WebRTC e calcula MOS
 */
teleconsultationRoutes.post('/quality', authMiddleware(), async (c) => {
  try {
    const body = await c.req.json<UpdateCallQualityDTO>();
    if (!body.appointmentId || body.rttMs === undefined || body.jitterMs === undefined || body.packetLoss === undefined) {
      return c.json({
        success: false,
        message: 'appointmentId, rttMs, jitterMs e packetLoss são obrigatórios.'
      }, 400);
    }

    const user = c.get('user');
    const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
    const userAgent = c.req.header('user-agent');

    const room = TeleconsultationService.updateCallQuality({
      dto: body,
      context: {
        actorId: user.id,
        ipAddress,
        userAgent
      }
    });

    return c.json({
      success: true,
      room,
      metrics: room.metrics
    }, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Erro ao atualizar telemetria de qualidade.'
    }, 400);
  }
});

/**
 * POST /api/teleconsultation/recording
 * Alterna estado de gravação consentida da sessão (LGPD / CFP nº 011/2018)
 */
teleconsultationRoutes.post('/recording', authMiddleware(), requireRole([UserRole.PSICOLOGO_TITULAR, UserRole.SUPERVISOR_CLINICO]), async (c) => {
  try {
    const body = await c.req.json<ToggleRecordingDTO>();
    if (!body.appointmentId || body.isRecordingActive === undefined) {
      return c.json({
        success: false,
        message: 'appointmentId e isRecordingActive são obrigatórios.'
      }, 400);
    }

    const user = c.get('user');
    const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
    const userAgent = c.req.header('user-agent');

    const room = TeleconsultationService.toggleRecording({
      dto: body,
      context: {
        actorId: user.id,
        ipAddress,
        userAgent
      }
    });

    return c.json({
      success: true,
      room,
      message: body.isRecordingActive ? 'Gravação ativada com consentimento.' : 'Gravação pausada.'
    }, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Erro ao alternar gravação.'
    }, 400);
  }
});

/**
 * POST /api/teleconsultation/end
 * Finaliza formalmente a teleconsulta clínica
 */
teleconsultationRoutes.post('/end', authMiddleware(), requireRole([UserRole.PSICOLOGO_TITULAR, UserRole.SUPERVISOR_CLINICO]), async (c) => {
  try {
    const body = await c.req.json<EndTeleconsultationDTO>();
    if (!body.appointmentId) {
      return c.json({
        success: false,
        message: 'appointmentId é obrigatório.'
      }, 400);
    }

    const user = c.get('user');
    const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
    const userAgent = c.req.header('user-agent');

    const room = TeleconsultationService.endTeleconsultation({
      dto: body,
      context: {
        actorId: user.id,
        ipAddress,
        userAgent
      }
    });

    return c.json({
      success: true,
      room,
      message: 'Teleconsulta encerrada formalmente com registro de auditoria WORM.'
    }, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Erro ao finalizar teleconsulta.'
    }, 400);
  }
});
