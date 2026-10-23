import { Hono } from 'hono';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';
import { WebRtcSecurityService } from '../services/webrtcSecurityService';
import type {
  InitiateWebRtcAuditSessionDTO,
  InitiateWebRtcAuditSessionResponse,
  VerifyWebRtcFingerprintDTO,
  VerifyWebRtcFingerprintResponse,
  RecordWebRtcMetricsDTO,
  RecordWebRtcMetricsResponse,
  TerminateWebRtcSessionDTO,
  TerminateWebRtcSessionResponse,
  WebRtcSessionListResponse
} from '@terapiainfoco/shared';

export const webrtcSecurityRoute = new Hono();

// Autenticação e RBAC: Psicólogos titulares e Administradores (CFP 011/2018 & LGPD Art. 46)
webrtcSecurityRoute.use('*', authMiddleware());
// Ferramenta de operação da plataforma: só o Admin/DPO (RFC-001 §4.5)
const requireAdmin = requireRoles([UserRole.ADMIN]);

const webrtcService = WebRtcSecurityService.getInstance();

/**
 * 1. Iniciar Auditoria de Sessão WebRTC com Fingerprint do Terapeuta
 */
webrtcSecurityRoute.post('/session/initiate', requireAdmin, async (c) => {
  const user = c.get('user');
  const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent') || 'Unknown';
  const body = await c.req.json<InitiateWebRtcAuditSessionDTO>().catch(() => null);

  if (!body || !body.patientId || !body.therapistFingerprint) {
    return c.json({
      success: false,
      error: 'Parâmetros obrigatórios patientId e therapistFingerprint não informados.'
    }, 400);
  }

  try {
    const session = await webrtcService.initiateSession({
      appointmentId: body.appointmentId,
      therapistId: user?.id || 'therapist-default',
      patientId: body.patientId,
      therapistFingerprint: body.therapistFingerprint,
      certificateAlgorithm: body.certificateAlgorithm,
      cipherSuite: body.cipherSuite,
      dtlsVersion: body.dtlsVersion,
      ipAddress,
      userAgent
    });

    const response: InitiateWebRtcAuditSessionResponse = {
      success: true,
      session,
      message: 'Sessão WebRTC iniciada com sucesso. Aguardando conexão e fingerprint DTLS do paciente.'
    };

    return c.json(response, 201);
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message || 'Falha ao iniciar auditoria de sessão WebRTC'
    }, 400);
  }
});

/**
 * 2. Validar Fingerprint do Paciente e Gerar Safety Numbers (Anti-MitM)
 */
webrtcSecurityRoute.post('/session/verify-fingerprint', requireAdmin, async (c) => {
  const user = c.get('user');
  const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent') || 'Unknown';
  const body = await c.req.json<VerifyWebRtcFingerprintDTO>().catch(() => null);

  if (!body || !body.sessionId || !body.patientFingerprint) {
    return c.json({
      success: false,
      error: 'Parâmetros obrigatórios sessionId e patientFingerprint não informados.'
    }, 400);
  }

  try {
    const result = await webrtcService.verifyPatientFingerprint({
      sessionId: body.sessionId,
      patientFingerprint: body.patientFingerprint,
      certificateAlgorithm: body.certificateAlgorithm,
      manuallyConfirmedByUser: body.manuallyConfirmedByUser,
      verifiedBy: user?.id || 'therapist-default',
      ipAddress,
      userAgent
    });

    const response: VerifyWebRtcFingerprintResponse = {
      success: true,
      sessionId: result.session.sessionId,
      verificationStatus: result.session.verificationStatus,
      safetyNumbers: result.session.safetyNumbers,
      match: result.match,
      securityGrade: result.session.securityGrade,
      probataryDigest: result.session.probataryDigest,
      message: result.match
        ? 'Fingerprints DTLS validados e canal fim-a-fim certificado contra interceptação (MitM).'
        : 'Aviso de segurança: Divergência detectada no fingerprint do paciente!'
    };

    return c.json(response, 200);
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message || 'Falha ao validar fingerprint DTLS da sessão'
    }, 400);
  }
});

/**
 * 3. Telemetria e Métricas de Qualidade Criptográfica (Jitter, Packet Loss, Bytes Cifrados)
 */
webrtcSecurityRoute.post('/session/metrics', requireAdmin, async (c) => {
  const body = await c.req.json<RecordWebRtcMetricsDTO>().catch(() => null);

  if (!body || !body.sessionId || typeof body.jitterMs !== 'number') {
    return c.json({
      success: false,
      error: 'Parâmetros de telemetria incompletos.'
    }, 400);
  }

  try {
    const res = await webrtcService.recordSessionMetrics({
      sessionId: body.sessionId,
      jitterMs: body.jitterMs,
      packetLoss: body.packetLoss || 0,
      rttMs: body.rttMs || 0,
      bytesSent: body.bytesSent || 0,
      bytesReceived: body.bytesReceived || 0,
      cipherSuite: body.cipherSuite
    });

    const response: RecordWebRtcMetricsResponse = {
      success: true,
      sessionId: body.sessionId,
      averageJitterMs: res.averageJitterMs,
      packetLossPercent: res.packetLossPercent,
      totalBytesEncrypted: res.totalBytesEncrypted,
      message: 'Métricas de segurança e qualidade registradas com sucesso.'
    };

    return c.json(response, 200);
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message || 'Falha ao registrar métricas da sessão'
    }, 400);
  }
});

/**
 * 4. Encerrar Sessão e Gerar Selo WORM Probatório
 */
webrtcSecurityRoute.post('/session/terminate', requireAdmin, async (c) => {
  const user = c.get('user');
  const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent') || 'Unknown';
  const body = await c.req.json<TerminateWebRtcSessionDTO>().catch(() => null);

  if (!body || !body.sessionId) {
    return c.json({
      success: false,
      error: 'Parâmetro obrigatório sessionId não informado.'
    }, 400);
  }

  try {
    const session = await webrtcService.terminateSession({
      sessionId: body.sessionId,
      terminatedBy: user?.id || 'therapist-default',
      finalNotes: body.finalNotes,
      ipAddress,
      userAgent
    });

    const response: TerminateWebRtcSessionResponse = {
      success: true,
      session,
      probataryDigest: session.probataryDigest,
      message: 'Sessão WebRTC encerrada e selada com sucesso na trilha imutável WORM.'
    };

    return c.json(response, 200);
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message || 'Falha ao encerrar sessão WebRTC'
    }, 400);
  }
});

/**
 * 5. Listar Sessões Auditadas
 */
webrtcSecurityRoute.get('/sessions', requireAdmin, (c) => {
  const sessions = webrtcService.listSessions();
  const response: WebRtcSessionListResponse = {
    success: true,
    count: sessions.length,
    sessions
  };

  return c.json(response, 200);
});

/**
 * 6. Obter Detalhes de uma Sessão Auditada
 */
webrtcSecurityRoute.get('/session/:sessionId', requireAdmin, (c) => {
  const sessionId = c.req.param('sessionId');
  const session = webrtcService.getSession(sessionId);

  if (!session) {
    return c.json({
      success: false,
      error: `Sessão WebRTC não encontrada: ${sessionId}`
    }, 404);
  }

  return c.json({
    success: true,
    session
  }, 200);
});
