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
import { authService } from '../src/services/authService';
import { resetDb, requireUser, seedDemoSession } from './helpers/db';

describe('Evolução de Produto RFC-001: Teleconsulta Nativa WebRTC & Sala de Espera (§3.2, §3.3)', () => {
  const appointmentId = '00000000-0000-0000-0000-000000000010';
  const PATIENT_USER_ID = '00000000-0000-0000-0000-000000000005';
  const PSICOLOGA_ID = '00000000-0000-0000-0000-000000000001';
  const therapistActor = {
    actorId: '00000000-0000-0000-0000-000000000001',
    ipAddress: '127.0.0.1',
    userAgent: 'BunTest/1.0'
  };

  beforeEach(async () => {
    await resetDb();
    // A sala exige consulta existente no consultório de quem a acessa
    await seedDemoSession();
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
    it('deve inicializar a sala de teleconsulta com status IDLE e hash SHA-256', async () => {
      const room = await TeleconsultationService.getOrCreateRoom({
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

    it('deve permitir knocking do paciente na sala de espera alterando status para WAITING_ROOM', async () => {
      const knockRes = await TeleconsultationService.knockWaitingRoom({
        appointmentId,
        userId: PATIENT_USER_ID,
        clientFingerprint: 'browser_mac_chrome_123',
        ipAddress: '200.180.10.5'
      });

      expect(knockRes.success).toBe(true);
      expect(knockRes.status).toBe('WAITING');
      expect(knockRes.roomStatus).toBe(TeleconsultationRoomStatus.WAITING_ROOM);

      const room = await TeleconsultationService.getOrCreateRoom({
        appointmentId,
        context: therapistActor
      });

      expect(room.waitingParticipants).toHaveLength(1);
      expect(room.waitingParticipants[0].name).toBe('Mariana Silva de Oliveira');
      expect(room.waitingParticipants[0].status).toBe('WAITING');
    });

    it('deve permitir ao psicólogo admitir o paciente iniciando a sessão clínica (IN_PROGRESS)', async () => {
      const knockRes = await TeleconsultationService.knockWaitingRoom({
        appointmentId,
        userId: PATIENT_USER_ID,
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

    it('deve permitir ao psicólogo rejeitar um participante indevido', async () => {
      const knockRes = await TeleconsultationService.knockWaitingRoom({
        appointmentId,
        userId: PATIENT_USER_ID,
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

    it('deve atualizar telemetria da chamada em tempo real', async () => {
      await TeleconsultationService.getOrCreateRoom({
        appointmentId,
        context: therapistActor
      });

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

    it('deve finalizar a teleconsulta formalmente e computar a duração em segundos', async () => {
      await TeleconsultationService.getOrCreateRoom({
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
    });
  });

  describe('3. Rotas HTTP REST (/api/teleconsultation/session)', () => {
    async function headersFor(userId: string) {
      const { accessToken } = await authService.issueTokens((await requireUser(userId)), '127.0.0.1');
      return { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` };
    }
    const post = (path: string, headers: Record<string, string>, body: unknown) =>
      app.request(`/api/teleconsultation/session${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
    const poll = async (headers: Record<string, string>, after = '') =>
      (await app.request(`/api/teleconsultation/session/signal/${appointmentId}?after=${after}`, { headers })).json() as Promise<any>;

    it('fluxo completo: paciente bate -> psicólogo admite -> telemetria -> encerramento', async () => {
      const therapist = await headersFor(PSICOLOGA_ID);
      const patient = await headersFor(PATIENT_USER_ID);

      const knockRes = await post('/knock', patient, { appointmentId, patientName: 'Nome forjado pelo cliente' });
      expect(knockRes.status).toBe(200);
      const knockData = await knockRes.json() as any;
      expect(knockData.status).toBe('WAITING');

      // O psicólogo vê a fila com o nome do cadastro, não o enviado pelo cliente
      const queue = await poll(therapist);
      expect(queue.waitingParticipants).toEqual([
        expect.objectContaining({ participantId: knockData.participantId, name: 'Mariana Silva de Oliveira', status: 'WAITING' })
      ]);
      expect((await poll(patient)).myStatus).toBe('WAITING');

      const admitRes = await post('/admit', therapist, { appointmentId, participantId: knockData.participantId, action: 'ADMIT' });
      expect(admitRes.status).toBe(200);
      expect((await admitRes.json() as any).room.status).toBe(TeleconsultationRoomStatus.IN_PROGRESS);
      expect((await poll(patient)).myStatus).toBe('ADMITTED');

      // Recarregar a página do paciente não o devolve à fila
      expect((await (await post('/knock', patient, { appointmentId })).json() as any).status).toBe('ADMITTED');

      const qualityRes = await post('/quality', therapist, { appointmentId, rttMs: 30, jitterMs: 5, packetLoss: 0.1 });
      expect((await qualityRes.json() as any).metrics.qualityState).toBe(CallQualityState.EXCELLENT);

      const endRes = await post('/end', therapist, { appointmentId, durationSeconds: 3000 });
      expect((await endRes.json() as any).room.status).toBe(TeleconsultationRoomStatus.COMPLETED);
      // O encerramento avisa o paciente (BYE) e a sala não aceita mais sinais
      expect((await poll(patient)).signals.map((sig: any) => sig.signalType)).toContain('BYE');
      expect((await post('/signal', patient, { appointmentId, signalType: 'JOIN' })).status).toBe(403);
    });

    it('sinalização entre as duas partes com cursor, sem eco e só após a admissão', async () => {
      const therapist = await headersFor(PSICOLOGA_ID);
      const patient = await headersFor(PATIENT_USER_ID);
      const { participantId } = await (await post('/knock', patient, { appointmentId })).json() as any;

      // Antes da admissão o paciente não sinaliza nem recebe sinais
      expect((await post('/signal', patient, { appointmentId, signalType: 'JOIN' })).status).toBe(403);
      await post('/admit', therapist, { appointmentId, participantId, action: 'ADMIT' });

      expect((await post('/signal', patient, { appointmentId, signalType: 'JOIN', senderRole: 'THERAPIST' })).status).toBe(200);
      const therapistFirst = await poll(therapist);
      expect(therapistFirst.signals).toEqual([expect.objectContaining({ signalType: 'JOIN', senderRole: 'PATIENT', senderId: PATIENT_USER_ID })]);

      await post('/signal', therapist, { appointmentId, signalType: 'OFFER', sessionId: 's1', sdp: 'v=0 offer' });
      await post('/signal', therapist, { appointmentId, signalType: 'ICE_CANDIDATE', sessionId: 's1', candidate: { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 } });
      const patientView = await poll(patient);
      expect(patientView.signals.map((sig: any) => sig.signalType)).toEqual(['OFFER', 'ICE_CANDIDATE']);
      expect(patientView.signals.every((sig: any) => sig.sessionId === 's1')).toBe(true);

      await post('/signal', patient, { appointmentId, signalType: 'ANSWER', sessionId: 's1', sdp: 'v=0 answer' });
      // Com o cursor, o psicólogo recebe só o que veio depois (e nunca os próprios sinais)
      const therapistNext = await poll(therapist, therapistFirst.cursor);
      expect(therapistNext.signals.map((sig: any) => sig.signalType)).toEqual(['ANSWER']);
      expect((await poll(therapist, therapistNext.cursor)).signals).toHaveLength(0);
      // Cursor de outra época (restart do servidor) recomeça do início
      expect((await poll(therapist, 'epoca-antiga:999')).signals.map((sig: any) => sig.signalType)).toEqual(['JOIN', 'ANSWER']);
    });

    it('knock exige paciente autenticado dono da consulta', async () => {
      expect((await post('/knock', { 'Content-Type': 'application/json' }, { appointmentId })).status).toBe(401);
      const outsider = await authService.register({
        name: 'Outro Paciente', email: `outro.${crypto.randomUUID().slice(0, 6)}@x.com`, password: 'SenhaPaciente@2026', role: UserRole.PACIENTE
      } as any);
      expect((await post('/knock', await headersFor(outsider.id), { appointmentId })).status).toBe(404);
      expect((await post('/knock', await headersFor(PSICOLOGA_ID), { appointmentId })).status).toBe(403);
    });

    it('recepção do consultório não entra na sala nem lê a sinalização WebRTC', async () => {
      const RECEPCAO_ID = '00000000-0000-0000-0000-000000000003';
      const headers = await headersFor(RECEPCAO_ID);
      const base = '/api/teleconsultation/session';
      for (const path of ['/ice-servers', `/room/${appointmentId}`, `/signal/${appointmentId}`, `/transcription/status/${appointmentId}`]) {
        expect({ path, status: (await app.request(base + path, { headers })).status }).toEqual({ path, status: 403 });
      }
      for (const path of ['/signal', '/hardware-sync', '/transcription/chunk', '/quality']) {
        expect({ path, status: (await post(path, headers, { appointmentId })).status }).toEqual({ path, status: 403 });
      }
    });

    it('servidores ICE vêm da configuração do ambiente', async () => {
      const res = await app.request('/api/teleconsultation/session/ice-servers', { headers: await headersFor(PATIENT_USER_ID) });
      const body = await res.json() as any;
      expect(body.iceServers[0].urls).toContain('stun:stun.l.google.com:19302');
    });
  });

  describe('4. Sem gravação (ADR-005)', () => {
    it('não existe rota nem estado de gravação na sala', async () => {
      const { accessToken } = await authService.issueTokens((await requireUser(PSICOLOGA_ID)), '127.0.0.1');
      const res = await app.request('/api/teleconsultation/session/recording', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ appointmentId, isRecordingActive: true })
      });
      expect(res.status).toBe(404);
      const room = await TeleconsultationService.getOrCreateRoom({ appointmentId, context: therapistActor });
      expect('isRecordingActive' in room).toBe(false);
      expect((await app.request('/api/teleconsultation/media/recordings', { headers: { Authorization: `Bearer ${accessToken}` } })).status).toBe(404);
    });
  });
});

