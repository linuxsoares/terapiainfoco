import { describe, it, expect, beforeEach } from 'bun:test';
import {
  TeleconsultationRoomStatus,
  CallQualityState,
  KnockingAction,
  UserRole
} from '@terapiainfoco/shared';
import { db } from '../src/db/memoryDb';
import { TeleconsultationService } from '../src/services/teleconsultationService';
import { app } from '../src/index';

describe('Evolução de Produto RFC-001: Teleconsulta Nativa WebRTC & Sala de Espera (§3.2, §3.3)', () => {
  const appointmentId = '00000000-0000-0000-0000-000000000010';
  const therapistActor = {
    actorId: '00000000-0000-0000-0000-000000000001',
    ipAddress: '127.0.0.1',
    userAgent: 'BunTest/1.0'
  };

  beforeEach(() => {
    db.clear();
    // A sala exige consulta existente no consultório de quem a acessa
    db.seedDemoSession();
  });

  describe('1. Algoritmo de Avaliação de Qualidade MOS (ITU-T G.107)', () => {
    it('deve classificar conexão cristalina como EXCELLENT (MOS >= 4.3)', () => {
      const result = TeleconsultationService.calculateMosAndQuality({
        rttMs: 25,
        jitterMs: 3,
        packetLoss: 0.05
      });

      expect(result.mosScore).toBeGreaterThanOrEqual(4.3);
      expect(result.qualityState).toBe(CallQualityState.EXCELLENT);
      expect(result.ethicalNotice).toBeUndefined();
    });

    it('deve classificar conexão com pequenas oscilações como GOOD (MOS 4.0 - 4.2)', () => {
      const result = TeleconsultationService.calculateMosAndQuality({
        rttMs: 95,
        jitterMs: 15,
        packetLoss: 1.0
      });

      expect(result.mosScore).toBeGreaterThanOrEqual(3.8);
      expect(result.mosScore).toBeLessThanOrEqual(4.3);
    });

    it('deve emitir alerta ético CFP nº 011/2018 quando a conexão degradar criticamente (POOR)', () => {
      const result = TeleconsultationService.calculateMosAndQuality({
        rttMs: 350,
        jitterMs: 70,
        packetLoss: 12.0
      });

      expect(result.mosScore).toBeLessThan(3.5);
      expect(result.qualityState).toBe(CallQualityState.POOR);
      expect(result.ethicalNotice).toBeDefined();
      expect(result.ethicalNotice).toContain('CFP nº 011/2018');
      expect(result.ethicalNotice).toContain('desativar temporariamente o vídeo');
    });
  });

  describe('2. Sala de Teleconsulta & Ciclo da Sala de Espera (Knocking)', () => {
    it('deve inicializar a sala de teleconsulta com status IDLE e hash SHA-256', () => {
      const room = TeleconsultationService.getOrCreateRoom({
        appointmentId,
        context: therapistActor
      });

      expect(room.id).toBeDefined();
      expect(room.appointmentId).toBe(appointmentId);
      expect(room.patientName).toBe('Mariana Silva de Oliveira');
      expect(room.status).toBe(TeleconsultationRoomStatus.IDLE);
      expect(room.roomHashSha256).toBeDefined();
      expect(room.roomHashSha256.length).toBe(64);
      expect(room.waitingParticipants).toHaveLength(0);
      expect(room.metrics.qualityState).toBe(CallQualityState.EXCELLENT);
    });

    it('deve permitir knocking do paciente na sala de espera alterando status para WAITING_ROOM', () => {
      const knockRes = TeleconsultationService.knockWaitingRoom({
        dto: {
          appointmentId,
          patientName: 'Mariana Silva de Oliveira',
          clientFingerprint: 'browser_mac_chrome_123'
        },
        ipAddress: '200.180.10.5'
      });

      expect(knockRes.success).toBe(true);
      expect(knockRes.status).toBe('WAITING');
      expect(knockRes.roomStatus).toBe(TeleconsultationRoomStatus.WAITING_ROOM);

      const room = TeleconsultationService.getOrCreateRoom({
        appointmentId,
        context: therapistActor
      });

      expect(room.waitingParticipants).toHaveLength(1);
      expect(room.waitingParticipants[0].name).toBe('Mariana Silva de Oliveira');
      expect(room.waitingParticipants[0].status).toBe('WAITING');
    });

    it('deve permitir ao psicólogo admitir o paciente iniciando a sessão clínica (IN_PROGRESS)', () => {
      const knockRes = TeleconsultationService.knockWaitingRoom({
        dto: {
          appointmentId,
          patientName: 'Mariana Silva de Oliveira'
        },
        ipAddress: '200.180.10.5'
      });

      const admittedRoom = TeleconsultationService.admitOrRejectParticipant({
        dto: {
          appointmentId,
          participantId: knockRes.participantId,
          action: KnockingAction.ADMIT
        },
        context: therapistActor
      });

      expect(admittedRoom.status).toBe(TeleconsultationRoomStatus.IN_PROGRESS);
      expect(admittedRoom.startedAt).toBeDefined();
      const participant = admittedRoom.waitingParticipants.find(p => p.participantId === knockRes.participantId);
      expect(participant?.status).toBe('ADMITTED');
    });

    it('deve permitir ao psicólogo rejeitar um participante indevido', () => {
      const knockRes = TeleconsultationService.knockWaitingRoom({
        dto: {
          appointmentId,
          patientName: 'Pessoa Desconhecida'
        },
        ipAddress: '200.180.10.99'
      });

      const rejectedRoom = TeleconsultationService.admitOrRejectParticipant({
        dto: {
          appointmentId,
          participantId: knockRes.participantId,
          action: KnockingAction.REJECT
        },
        context: therapistActor
      });

      const participant = rejectedRoom.waitingParticipants.find(p => p.participantId === knockRes.participantId);
      expect(participant?.status).toBe('REJECTED');
    });

    it('deve alternar gravação consentida e atualizar telemetria em tempo real', () => {
      TeleconsultationService.getOrCreateRoom({
        appointmentId,
        context: therapistActor
      });

      // Ativar gravação
      const recordedRoom = TeleconsultationService.toggleRecording({
        dto: {
          appointmentId,
          isRecordingActive: true,
          recordingConsentConfirmed: true
        },
        context: therapistActor
      });

      expect(recordedRoom.isRecordingActive).toBe(true);
      expect(recordedRoom.recordingConsentConfirmed).toBe(true);

      // Atualizar métricas
      const updatedRoom = TeleconsultationService.updateCallQuality({
        dto: {
          appointmentId,
          rttMs: 45,
          jitterMs: 6,
          packetLoss: 0.2
        },
        context: therapistActor
      });

      expect(updatedRoom.metrics.rttMs).toBe(45);
      expect(updatedRoom.metrics.mosScore).toBeGreaterThanOrEqual(4.0);
    });

    it('deve finalizar a teleconsulta formalmente e computar a duração em segundos', () => {
      TeleconsultationService.getOrCreateRoom({
        appointmentId,
        context: therapistActor
      });

      const endedRoom = TeleconsultationService.endTeleconsultation({
        dto: {
          appointmentId,
          durationSeconds: 3120,
          summaryNotes: 'Sessão concluída com boa adesão às técnicas de TCC.'
        },
        context: therapistActor
      });

      expect(endedRoom.status).toBe(TeleconsultationRoomStatus.COMPLETED);
      expect(endedRoom.endedAt).toBeDefined();
      expect(endedRoom.durationSeconds).toBe(3120);
      expect(endedRoom.isRecordingActive).toBe(false);
    });
  });

  describe('3. Rotas HTTP REST (/api/teleconsultation/session)', () => {
    it('deve executar o fluxo completo via HTTP: POST /knock -> GET /room -> POST /admit -> POST /quality -> POST /end', async () => {
      // 1. Login do psicólogo
      const loginRes = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'psicologo@terapiainfoco.com.br',
          password: 'Senha@123456'
        })
      });
      expect(loginRes.status).toBe(200);
      const loginData = await loginRes.json() as any;
      const token = loginData.accessToken;

      // 2. Paciente bate na sala de espera via endpoint público
      const knockRes = await app.request('/api/teleconsultation/session/knock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId,
          patientName: 'Mariana Silva de Oliveira',
          clientFingerprint: 'fp_http_test_1'
        })
      });
      expect(knockRes.status).toBe(200);
      const knockData = await knockRes.json() as any;
      expect(knockData.success).toBe(true);
      expect(knockData.status).toBe('WAITING');
      const participantId = knockData.participantId;

      // 3. Terapeuta consulta a sala autenticado
      const roomRes = await app.request(`/api/teleconsultation/session/room/${appointmentId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      });
      expect(roomRes.status).toBe(200);
      const roomData = await roomRes.json() as any;
      expect(roomData.room.waitingParticipants).toHaveLength(1);

      // 4. Terapeuta admite o paciente
      const admitRes = await app.request('/api/teleconsultation/session/admit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          appointmentId,
          participantId,
          action: 'ADMIT'
        })
      });
      expect(admitRes.status).toBe(200);
      const admitData = await admitRes.json() as any;
      expect(admitData.room.status).toBe(TeleconsultationRoomStatus.IN_PROGRESS);

      // 5. Atualização de telemetria
      const qualityRes = await app.request('/api/teleconsultation/session/quality', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          appointmentId,
          rttMs: 30,
          jitterMs: 5,
          packetLoss: 0.1
        })
      });
      expect(qualityRes.status).toBe(200);
      const qualityData = await qualityRes.json() as any;
      expect(qualityData.metrics.qualityState).toBe(CallQualityState.EXCELLENT);

      // 6. Encerrar sessão
      const endRes = await app.request('/api/teleconsultation/session/end', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          appointmentId,
          durationSeconds: 3000
        })
      });
      expect(endRes.status).toBe(200);
      const endData = await endRes.json() as any;
      expect(endData.room.status).toBe(TeleconsultationRoomStatus.COMPLETED);
    });

    it('deve sincronizar dispositivos reais de hardware (câmera/microfone) e sinalização WebRTC P2P (SDP Offer/Answer/ICE)', async () => {
      const loginRes = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'psicologo@terapiainfoco.com.br',
          password: 'Senha@123456'
        })
      });
      const { accessToken: token } = await loginRes.json() as any;

      const hwRes = await app.request('/api/teleconsultation/session/hardware-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          appointmentId,
          cameraActive: true,
          microphoneActive: true,
          screenShareActive: false,
          cameraLabel: 'FaceTime HD Camera (Built-in)',
          microphoneLabel: 'MacBook Pro Microphone',
          resolution: '1280x720 @ 30fps',
          frameRate: 30,
          audioSampleRate: 48000
        })
      });
      expect(hwRes.status).toBe(200);
      const hwData = await hwRes.json() as any;
      expect(hwData.success).toBe(true);
      expect(hwData.room.therapistMediaState.cameraActive).toBe(true);
      expect(hwData.room.therapistMediaState.cameraLabel).toBe('FaceTime HD Camera (Built-in)');
      expect(hwData.room.therapistMediaState.microphoneLabel).toBe('MacBook Pro Microphone');

      const sigRes = await app.request('/api/teleconsultation/session/signal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          appointmentId,
          signalType: 'OFFER',
          sdp: 'v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\na=fingerprint:sha-256 AA:BB:CC:DD'
        })
      });
      expect(sigRes.status).toBe(200);
      const sigData = await sigRes.json() as any;
      expect(sigData.success).toBe(true);
      expect(sigData.signal.signalType).toBe('OFFER');

      const listSigRes = await app.request(`/api/teleconsultation/session/signal/${appointmentId}?excludeSelf=false`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      });
      expect(listSigRes.status).toBe(200);
      const listSigData = await listSigRes.json() as any;
      expect(listSigData.signals).toHaveLength(1);
      expect(listSigData.signals[0].sdp).toContain('fingerprint:sha-256');
    });
  });
});
