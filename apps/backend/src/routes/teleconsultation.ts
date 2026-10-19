import { Hono } from 'hono';
import {
  type KnockWaitingRoomDTO,
  type AdmitParticipantDTO,
  type UpdateCallQualityDTO,
  type EndTeleconsultationDTO,
  type SendWebRtcSignalDTO,
  type SyncMediaHardwareDTO,
  type IceServersResponse,
  type LiveTranscriptChunkDTO,
  type LiveTranscriptStatusResponse,
  type LiveTranscriptResponse,
  TeleconsultationParticipantRole,
  UserRole
} from '@terapiainfoco/shared';
import { TeleconsultationService } from '../services/teleconsultationService';
import { config } from '../config';
import { authMiddleware, requireRole } from '../middlewares/authMiddleware';
import { CLINICAL_ROLES, requireAppointmentAccess, requireBodyOwnership } from '../middlewares/accessPolicy';
import { LiveTranscriptionService, LiveTranscriptionError } from '../services/liveTranscriptionService';

export const teleconsultationRoutes = new Hono();

/**
 * POST /api/teleconsultation/knock
 * Paciente autenticado bate à porta da sala de espera (Knocking - CFP nº 011/2018).
 * Identidade e nome vêm da sessão e do cadastro, nunca do corpo da requisição.
 */
teleconsultationRoutes.post('/knock', authMiddleware(), requireRole([UserRole.PACIENTE]), requireBodyOwnership(), async (c) => {
  try {
    const body = await c.req.json<KnockWaitingRoomDTO>();
    if (!body.appointmentId) {
      return c.json({ success: false, message: 'Identificação da consulta (appointmentId) é obrigatória.' }, 400);
    }
    const result = TeleconsultationService.knockWaitingRoom({
      appointmentId: body.appointmentId,
      userId: c.get('userId'),
      clientFingerprint: body.clientFingerprint,
      ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
      userAgent: c.req.header('user-agent')
    });
    return c.json(result, 200);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Erro ao entrar na sala de espera.' }, 400);
  }
});

/**
 * GET /api/teleconsultation/ice-servers
 * Servidores STUN/TURN configurados para a conexão WebRTC
 */
teleconsultationRoutes.get('/ice-servers', authMiddleware(), (c) => {
  const { stunUrls, turnUrls, turnUsername, turnCredential } = config.webrtc;
  const iceServers: IceServersResponse['iceServers'] = [];
  if (stunUrls.length > 0) iceServers.push({ urls: stunUrls });
  if (turnUrls.length > 0) iceServers.push({ urls: turnUrls, username: turnUsername, credential: turnCredential });
  return c.json({ success: true, iceServers } satisfies IceServersResponse);
});

/**
 * GET /api/teleconsultation/room/:appointmentId
 * Obtém estado atual da sala de teleconsulta e fila de espera
 */
teleconsultationRoutes.get('/room/:appointmentId', authMiddleware(), requireAppointmentAccess('appointmentId'), async (c) => {
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
teleconsultationRoutes.post('/admit', authMiddleware(), requireRole([UserRole.PSICOLOGO_TITULAR, UserRole.SUPERVISOR_CLINICO]), requireBodyOwnership(), async (c) => {
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
 * POST /api/teleconsultation/hardware-sync
 * Sincroniza estado real dos dispositivos de hardware (Câmera, Microfone e Tela)
 */
teleconsultationRoutes.post('/hardware-sync', authMiddleware(), requireBodyOwnership(), async (c) => {
  try {
    const body = await c.req.json<SyncMediaHardwareDTO>();
    if (!body.appointmentId) {
      return c.json({
        success: false,
        message: 'appointmentId é obrigatório.'
      }, 400);
    }

    const user = c.get('user');
    const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
    const userAgent = c.req.header('user-agent');

    const role = body.role || (user.role === UserRole.PACIENTE ? TeleconsultationParticipantRole.PATIENT : TeleconsultationParticipantRole.THERAPIST);

    const room = TeleconsultationService.syncMediaHardware({
      dto: { ...body, role },
      context: {
        actorId: user.id,
        ipAddress,
        userAgent
      }
    });

    return c.json({
      success: true,
      room,
      message: 'Dispositivos de câmera e microfone sincronizados com a sessão WebRTC.'
    }, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Erro ao sincronizar hardware de mídia.'
    }, 400);
  }
});

/**
 * POST /api/teleconsultation/signal
 * Envia sinal WebRTC (JOIN, OFFER, ANSWER, ICE_CANDIDATE, BYE) para a outra parte
 */
teleconsultationRoutes.post('/signal', authMiddleware(), requireBodyOwnership(), async (c) => {
  try {
    const body = await c.req.json<SendWebRtcSignalDTO>();
    if (!body.appointmentId || !body.signalType) {
      return c.json({ success: false, message: 'appointmentId e signalType são obrigatórios.' }, 400);
    }
    const result = TeleconsultationService.sendSignal({
      dto: body,
      user: c.get('user'),
      context: {
        actorId: c.get('userId'),
        ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
        userAgent: c.req.header('user-agent')
      }
    });
    return c.json({ success: true, ...result }, 200);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Erro ao enviar sinal WebRTC.' }, 403);
  }
});

/**
 * GET /api/teleconsultation/signal/:appointmentId?after=<cursor>
 * Polling: sinais da outra parte desde o cursor e situação da sala de espera
 */
teleconsultationRoutes.get('/signal/:appointmentId', authMiddleware(), requireAppointmentAccess('appointmentId'), (c) => {
  const result = TeleconsultationService.poll({
    appointmentId: c.req.param('appointmentId') ?? '',
    user: c.get('user'),
    cursor: c.req.query('after') || undefined
  });
  return c.json(result, 200);
});

/**
 * GET /api/teleconsultation/transcription/status/:appointmentId
 * Indica se a sessão pode ser transcrita (consentimento vigente e STT configurado)
 */
teleconsultationRoutes.get('/transcription/status/:appointmentId', authMiddleware(), requireAppointmentAccess('appointmentId'), (c) => {
  return c.json(LiveTranscriptionService.status(c.req.param('appointmentId') ?? '') satisfies LiveTranscriptStatusResponse);
});

/**
 * POST /api/teleconsultation/transcription/chunk
 * Trecho do microfone do participante: transcrito pelo STT e descartado (nunca gravado)
 */
teleconsultationRoutes.post('/transcription/chunk', authMiddleware(), requireBodyOwnership(), async (c) => {
  try {
    const body = await c.req.json<LiveTranscriptChunkDTO>();
    const utterance = await LiveTranscriptionService.transcribeChunk(body, c.get('user'), {
      ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
      userAgent: c.req.header('user-agent')
    });
    return c.json({ success: true, utterance });
  } catch (err: any) {
    const status = err instanceof LiveTranscriptionError ? err.status : 502;
    return c.json({ success: false, message: err.message || 'Falha na transcrição do trecho.' }, status);
  }
});

/**
 * GET /api/teleconsultation/transcription/:appointmentId
 * Transcrição da sessão para o psicólogo/supervisor do consultório
 */
teleconsultationRoutes.get('/transcription/:appointmentId', authMiddleware(), requireRole(CLINICAL_ROLES), requireAppointmentAccess('appointmentId'), (c) => {
  const utterances = LiveTranscriptionService.getTranscript(c.req.param('appointmentId') ?? '');
  return c.json({ success: true, utterances } satisfies LiveTranscriptResponse);
});

/**
 * POST /api/teleconsultation/quality
 * Atualiza telemetria de conexão WebRTC e calcula MOS
 */
teleconsultationRoutes.post('/quality', authMiddleware(), requireBodyOwnership(), async (c) => {
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
 * POST /api/teleconsultation/end
 * Finaliza formalmente a teleconsulta clínica
 */
teleconsultationRoutes.post('/end', authMiddleware(), requireRole([UserRole.PSICOLOGO_TITULAR, UserRole.SUPERVISOR_CLINICO]), requireBodyOwnership(), async (c) => {
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
