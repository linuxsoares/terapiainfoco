import { useCallback, useEffect, useRef, useState } from 'react';
import type { TeleconsultationPollResponse, WebRtcSignalEnvelope, WebRtcSignalType } from '@terapiainfoco/shared';
import { api } from '../services/api';

/**
 * Chamada WebRTC P2P entre psicólogo e paciente com sinalização por polling no backend.
 *
 * Protocolo (RFC-001 §3.2):
 * - JOIN: quem entra na sala se anuncia. O psicólogo responde a um JOIN do paciente com uma
 *   nova OFFER; o paciente responde a um JOIN do psicólogo com outro JOIN (cobre o recarregamento
 *   de qualquer lado sem laço).
 * - OFFER/ANSWER/ICE_CANDIDATE levam um sessionId; sinais de negociações antigas são ignorados.
 * - BYE: a outra parte saiu (ou o psicólogo encerrou a sessão).
 * A mídia trafega direto entre os navegadores; o backend só repassa os sinais.
 */

export type CallRole = 'THERAPIST' | 'PATIENT';

export interface CallStats {
  rttMs: number;
  jitterMs: number;
  packetLoss: number;
}

interface UseWebRtcCallOptions {
  appointmentId: string;
  role: CallRole;
  localStream: MediaStream | null;
  /** Polling ativo: o psicólogo desde a abertura; o paciente depois de bater à porta */
  active: boolean;
}

const POLL_INTERVAL_MS = 1000;
const STATS_INTERVAL_MS = 5000;

export function useWebRtcCall({ appointmentId, role, localStream, active }: UseWebRtcCallOptions) {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState | 'idle'>('idle');
  const [poll, setPoll] = useState<TeleconsultationPollResponse | null>(null);
  const [remoteLeft, setRemoteLeft] = useState(false);
  const [stats, setStats] = useState<CallStats | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const iceServersRef = useRef<RTCIceServer[] | null>(null);
  const localStreamRef = useRef<MediaStream | null>(localStream);
  const cursorRef = useRef('');
  const joinedRef = useRef(false);

  const send = useCallback(
    (signalType: WebRtcSignalType, extra: { sdp?: string; candidate?: RTCIceCandidateInit } = {}) =>
      api.sendTeleconsultationSignal({
        appointmentId,
        signalType,
        sessionId: sessionIdRef.current ?? undefined,
        sdp: extra.sdp,
        candidate: extra.candidate
          ? { candidate: extra.candidate.candidate ?? '', sdpMid: extra.candidate.sdpMid, sdpMLineIndex: extra.candidate.sdpMLineIndex }
          : undefined
      }).catch(() => undefined),
    [appointmentId]
  );

  const closePeer = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    pendingCandidatesRef.current = [];
    setRemoteStream(null);
    setConnectionState('idle');
  }, []);

  const createPeer = useCallback(async (onFailed?: () => void) => {
    closePeer();
    if (!iceServersRef.current) {
      iceServersRef.current = await api.getTeleconsultationIceServers().catch(() => []);
    }
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
    pcRef.current = pc;

    localStreamRef.current?.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current!));
    pc.onicecandidate = (event) => {
      if (event.candidate) send('ICE_CANDIDATE', { candidate: event.candidate.toJSON() });
    };
    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0] ?? new MediaStream([event.track]));
      setRemoteLeft(false);
    };
    pc.onconnectionstatechange = () => {
      if (pcRef.current !== pc) return;
      setConnectionState(pc.connectionState);
      if (pc.connectionState === 'failed') onFailed?.();
    };
    return pc;
  }, [closePeer, send]);

  /** Psicólogo: (re)inicia a negociação com uma nova oferta */
  const startOffer = useCallback(async () => {
    sessionIdRef.current = crypto.randomUUID();
    const pc = await createPeer(() => setTimeout(() => startOfferRef.current?.(), 1500));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await send('OFFER', { sdp: offer.sdp });
  }, [createPeer, send]);
  const startOfferRef = useRef<(() => Promise<void>) | null>(null);
  startOfferRef.current = startOffer;

  const flushPendingCandidates = async (pc: RTCPeerConnection) => {
    for (const candidate of pendingCandidatesRef.current) {
      await pc.addIceCandidate(candidate).catch(() => undefined);
    }
    pendingCandidatesRef.current = [];
  };

  const handleSignal = useCallback(async (signal: WebRtcSignalEnvelope) => {
    switch (signal.signalType) {
      case 'JOIN':
        if (role === 'THERAPIST') await startOffer();
        else await send('JOIN');
        break;
      case 'OFFER': {
        if (role !== 'PATIENT' || !signal.sdp) break;
        sessionIdRef.current = signal.sessionId ?? null;
        const pc = await createPeer();
        await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
        await flushPendingCandidates(pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await send('ANSWER', { sdp: answer.sdp });
        break;
      }
      case 'ANSWER': {
        const pc = pcRef.current;
        if (role !== 'THERAPIST' || !pc || !signal.sdp || signal.sessionId !== sessionIdRef.current) break;
        if (pc.signalingState !== 'have-local-offer') break;
        await pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
        await flushPendingCandidates(pc);
        break;
      }
      case 'ICE_CANDIDATE': {
        const pc = pcRef.current;
        if (!signal.candidate || signal.sessionId !== sessionIdRef.current) break;
        if (pc?.remoteDescription) await pc.addIceCandidate(signal.candidate).catch(() => undefined);
        else pendingCandidatesRef.current.push(signal.candidate);
        break;
      }
      case 'BYE':
        closePeer();
        setRemoteLeft(true);
        break;
    }
  }, [role, startOffer, createPeer, send, closePeer]);

  // Polling de sinais e da sala de espera
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const res = await api.pollTeleconsultation(appointmentId, cursorRef.current);
        if (stopped) return;
        cursorRef.current = res.cursor;
        setPoll(res);
        const canSignal = role === 'THERAPIST' || res.myStatus === 'ADMITTED';
        if (canSignal && !joinedRef.current) {
          joinedRef.current = true;
          await send('JOIN');
        }
        for (const signal of res.signals) await handleSignal(signal);
      } catch {
        // Falhas transitórias de rede: tenta no próximo ciclo
      }
      if (!stopped) timer = setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [active, appointmentId, role, send, handleSignal]);

  // Troca de câmera/microfone/tela sem renegociar: substitui as faixas já enviadas
  useEffect(() => {
    localStreamRef.current = localStream;
    const pc = pcRef.current;
    if (!pc || !localStream) return;
    let needsRenegotiation = false;
    for (const track of localStream.getTracks()) {
      const sender = pc.getSenders().find((s) => s.track?.kind === track.kind);
      if (sender) sender.replaceTrack(track).catch(() => undefined);
      else needsRenegotiation = true;
    }
    if (needsRenegotiation) {
      if (role === 'THERAPIST') startOffer();
      else send('JOIN');
    }
  }, [localStream, role, startOffer, send]);

  // Telemetria real (RTT, jitter e perda) a partir de getStats()
  useEffect(() => {
    if (connectionState !== 'connected') return;
    const interval = setInterval(async () => {
      const pc = pcRef.current;
      if (!pc) return;
      const report = await pc.getStats();
      let rttMs = 0;
      let jitterMs = 0;
      let lost = 0;
      let received = 0;
      report.forEach((entry: any) => {
        if (entry.type === 'candidate-pair' && entry.state === 'succeeded' && entry.currentRoundTripTime !== undefined) {
          rttMs = Math.round(entry.currentRoundTripTime * 1000);
        }
        if (entry.type === 'inbound-rtp' && entry.kind === 'audio') {
          jitterMs = Math.round((entry.jitter ?? 0) * 1000);
          lost += entry.packetsLost ?? 0;
          received += entry.packetsReceived ?? 0;
        }
      });
      const packetLoss = received + lost > 0 ? Math.round((lost / (received + lost)) * 1000) / 10 : 0;
      setStats({ rttMs, jitterMs, packetLoss });
    }, STATS_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [connectionState]);

  // Ao sair da sala: avisa a outra parte e fecha a conexão
  const hangup = useCallback(() => {
    if (joinedRef.current) send('BYE');
    joinedRef.current = false;
    closePeer();
  }, [send, closePeer]);

  useEffect(() => () => hangup(), [hangup]);

  return { remoteStream, connectionState, poll, remoteLeft, stats, hangup };
}
