import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  MonitorUp,
  Settings,
  Clock,
  Activity,
  UserCheck,
  UserX,
  BookmarkPlus,
  Loader2,
  ShieldCheck,
  FileText,
  DoorOpen,
  Captions
} from 'lucide-react';
import {
  type TeleconsultationRoom as Room,
  type TeleconsultationCallMetrics,
  type LiveTranscriptStatusResponse,
  type LiveTranscriptUtterance,
  TeleconsultationRoomStatus,
  CallQualityState,
  KnockingAction,
  ClinicalMarkerCategory,
  ClinicalMarkerRelevance
} from '@terapiainfoco/shared';
import { api } from '../services/api';
import { useWebRtcCall, type CallRole } from '../hooks/useWebRtcCall';
import { useLiveTranscription } from '../hooks/useLiveTranscription';

interface TeleconsultationRoomProps {
  appointmentId: string;
  role: CallRole;
  onClose: () => void;
  /** Psicólogo: abre o rascunho SOAP depois de encerrar a sessão */
  onProceedToSoap?: () => void;
}

const MARKER_LABELS: Partial<Record<ClinicalMarkerCategory, string>> = {
  [ClinicalMarkerCategory.INSIGHT]: 'Insight',
  [ClinicalMarkerCategory.CRISIS_ALERT]: 'Alerta de crise',
  [ClinicalMarkerCategory.AFFECT_SHIFT]: 'Mudança de afeto',
  [ClinicalMarkerCategory.SOMATIC_COMPLAINT]: 'Queixa somática'
};

function formatTimer(totalSecs: number): string {
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

async function openUserMedia(videoDeviceId?: string, audioDeviceId?: string): Promise<MediaStream> {
  const audio: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    ...(audioDeviceId ? { deviceId: { exact: audioDeviceId } } : {})
  };
  const video: MediaTrackConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    ...(videoDeviceId ? { deviceId: { exact: videoDeviceId } } : { facingMode: 'user' })
  };
  try {
    return await navigator.mediaDevices.getUserMedia({ video, audio });
  } catch {
    // Sem câmera (ou sem microfone): segue com o que estiver disponível
    try {
      return await navigator.mediaDevices.getUserMedia({ video: false, audio });
    } catch {
      return await navigator.mediaDevices.getUserMedia({ video, audio: false });
    }
  }
}

/**
 * Sala de teleconsulta própria (RFC-001 §3.2, ADR-005): chamada P2P entre o psicólogo e o
 * paciente da consulta, com sala de espera e sem gravação.
 */
export function TeleconsultationRoom({ appointmentId, role, onClose, onProceedToSoap }: TeleconsultationRoomProps) {
  const isTherapist = role === 'THERAPIST';
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [devices, setDevices] = useState<{ video: MediaDeviceInfo[]; audio: MediaDeviceInfo[] }>({ video: [], audio: [] });
  const [selectedVideo, setSelectedVideo] = useState('');
  const [selectedAudio, setSelectedAudio] = useState('');
  const [showDevices, setShowDevices] = useState(false);
  const [knocked, setKnocked] = useState(isTherapist);
  const [knocking, setKnocking] = useState(false);
  const [metrics, setMetrics] = useState<TeleconsultationCallMetrics | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [showMarker, setShowMarker] = useState(false);
  const [markerCategory, setMarkerCategory] = useState<ClinicalMarkerCategory>(ClinicalMarkerCategory.INSIGHT);
  const [markerNote, setMarkerNote] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [transcriptionStatus, setTranscriptionStatus] = useState<LiveTranscriptStatusResponse | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [transcript, setTranscript] = useState<LiveTranscriptUtterance[]>([]);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const { remoteStream, connectionState, poll, remoteLeft, stats, hangup } = useWebRtcCall({
    appointmentId,
    role,
    localStream,
    active: knocked
  });

  const roomStatus = poll?.roomStatus ?? room?.status;
  const sessionEnded = roomStatus === TeleconsultationRoomStatus.COMPLETED;
  const myStatus = poll?.myStatus;
  const waiting = (poll?.waitingParticipants ?? []).filter((p) => p.status === 'WAITING');
  const inSession = roomStatus === TeleconsultationRoomStatus.IN_PROGRESS && (isTherapist || myStatus === 'ADMITTED');

  // Transcrição da própria fala (áudio descartado após o STT; a chamada não é gravada)
  const transcription = useLiveTranscription({
    appointmentId,
    stream: localStream,
    enabled: Boolean(transcriptionStatus?.enabled && inSession && micEnabled)
  });

  const startMedia = useCallback(async (videoId?: string, audioId?: string) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Este navegador não permite acesso à câmera e ao microfone.');
      return;
    }
    try {
      const stream = await openUserMedia(videoId, audioId);
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = stream;
      setLocalStream(stream);
      setScreenSharing(false);
      setMicEnabled(stream.getAudioTracks().some((t) => t.enabled));
      setVideoEnabled(stream.getVideoTracks().some((t) => t.enabled));
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices({ video: all.filter((d) => d.kind === 'videoinput'), audio: all.filter((d) => d.kind === 'audioinput') });
      setError(null);
    } catch (err: any) {
      setError(
        err?.name === 'NotAllowedError'
          ? 'Acesso à câmera e ao microfone bloqueado. Libere a permissão no ícone de cadeado da barra de endereços.'
          : 'Não foi possível acessar câmera ou microfone. Verifique se estão conectados.'
      );
    }
  }, []);

  // Status da transcrição; o psicólogo acompanha quando o paciente autorizar
  useEffect(() => {
    const load = () => api.getLiveTranscriptionStatus(appointmentId).then(setTranscriptionStatus).catch(() => undefined);
    load();
    if (!isTherapist) return;
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [appointmentId, isTherapist]);

  const [consentDismissed, setConsentDismissed] = useState(false);
  const [savingConsent, setSavingConsent] = useState(false);
  const decideTranscription = async (granted: boolean) => {
    setSavingConsent(true);
    try {
      setTranscriptionStatus(await api.setLiveTranscriptionConsent(appointmentId, granted));
      setConsentDismissed(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingConsent(false);
    }
  };

  // Psicólogo acompanha a transcrição da sessão
  useEffect(() => {
    if (!isTherapist || !showTranscript) return;
    const load = () => api.getLiveTranscript(appointmentId).then(setTranscript).catch(() => undefined);
    load();
    const interval = setInterval(load, 6000);
    return () => clearInterval(interval);
  }, [isTherapist, showTranscript, appointmentId]);

  useEffect(() => {
    api.getTeleconsultationRoom(appointmentId).then(setRoom).catch((err) => setError(err.message));
    startMedia();
    return () => localStreamRef.current?.getTracks().forEach((t) => t.stop());
  }, [appointmentId, startMedia]);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream]);
  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  // Cronômetro a partir do início real da sessão (admissão do paciente)
  useEffect(() => {
    const startedAt = room?.startedAt;
    if (!startedAt || sessionEnded) return;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [room?.startedAt, sessionEnded]);

  // Atualiza a sala quando a sessão começa ou termina (startedAt, duração)
  useEffect(() => {
    if (roomStatus && roomStatus !== room?.status) {
      api.getTeleconsultationRoom(appointmentId).then(setRoom).catch(() => undefined);
    }
  }, [roomStatus, room?.status, appointmentId]);

  // Telemetria real enviada pelo psicólogo: o backend calcula o MOS (ITU-T G.107)
  useEffect(() => {
    if (!isTherapist || !stats) return;
    api.updateTeleconsultationQuality({ appointmentId, rttMs: stats.rttMs, jitterMs: stats.jitterMs, packetLoss: stats.packetLoss })
      .then((res) => setMetrics(res.metrics))
      .catch(() => undefined);
  }, [isTherapist, stats, appointmentId]);

  const toggleMic = () => {
    const next = !micEnabled;
    localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = next; });
    setMicEnabled(next);
  };

  const toggleVideo = () => {
    const next = !videoEnabled;
    localStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = next; });
    setVideoEnabled(next);
  };

  const toggleScreenShare = async () => {
    if (screenSharing) {
      await startMedia(selectedVideo || undefined, selectedAudio || undefined);
      return;
    }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const screenTrack = display.getVideoTracks()[0];
      const audioTracks = localStreamRef.current?.getAudioTracks() ?? [];
      localStreamRef.current?.getVideoTracks().forEach((t) => t.stop());
      const combined = new MediaStream([screenTrack, ...audioTracks]);
      localStreamRef.current = combined;
      setLocalStream(combined);
      setScreenSharing(true);
      screenTrack.onended = () => startMedia(selectedVideo || undefined, selectedAudio || undefined);
    } catch {
      // Usuário cancelou a escolha da tela
    }
  };

  const enterWaitingRoom = async () => {
    setKnocking(true);
    try {
      await api.knockTeleconsultationWaitingRoom({ appointmentId });
      setKnocked(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setKnocking(false);
    }
  };

  const decide = async (participantId: string, action: KnockingAction) => {
    try {
      setRoom(await api.admitTeleconsultationParticipant({ appointmentId, participantId, action }));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const saveMarker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!markerNote.trim()) return;
    try {
      await api.createClinicalMarker({
        appointmentId,
        timestampMs: elapsed * 1000,
        timeFormatted: formatTimer(elapsed),
        category: markerCategory,
        relevance: ClinicalMarkerRelevance.HIGH,
        note: markerNote.trim(),
        suggestedSoapQuadrant: markerCategory === ClinicalMarkerCategory.INSIGHT ? 'ASSESSMENT' : 'SUBJECTIVE'
      });
      setNotice(`Marcador registrado em ${formatTimer(elapsed)}.`);
      setMarkerNote('');
      setShowMarker(false);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const endSession = async () => {
    setEnding(true);
    try {
      setRoom(await api.endTeleconsultation({ appointmentId, durationSeconds: elapsed }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setEnding(false);
    }
  };

  const leave = () => {
    hangup();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    onClose();
  };

  const counterpartName = isTherapist ? room?.patientName ?? 'Paciente' : room?.therapistName ?? 'Psicólogo(a)';
  const connected = connectionState === 'connected' && remoteStream;

  let stageMessage: string | null = null;
  if (sessionEnded) stageMessage = 'Sessão encerrada.';
  else if (!isTherapist && !knocked) stageMessage = 'Confira câmera e microfone e entre na sala de espera quando estiver pronto(a).';
  else if (!isTherapist && myStatus === 'REJECTED') stageMessage = 'O psicólogo não liberou a entrada. Fale com o consultório se precisar.';
  else if (!isTherapist && myStatus !== 'ADMITTED') stageMessage = 'Você está na sala de espera. O psicólogo vai admiti-lo(a) em instantes.';
  else if (!connected && remoteLeft) stageMessage = `${counterpartName} saiu da chamada.`;
  else if (!connected) stageMessage = isTherapist && waiting.length === 0 && !remoteStream ? 'Aguardando o paciente entrar na sala de espera.' : 'Conectando...';

  const qualityOk = !metrics || metrics.qualityState === CallQualityState.EXCELLENT || metrics.qualityState === CallQualityState.GOOD;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 flex items-center justify-center p-2 sm:p-4 text-white" role="dialog" aria-label="Sala de teleconsulta">
      <div className="w-full max-w-6xl h-[94vh] flex flex-col rounded-3xl border border-slate-800 bg-slate-900 overflow-hidden">
        <header className="px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <span className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-amber-400'}`} aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">Teleconsulta com {counterpartName}</p>
              <p className="text-[11px] text-slate-400 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-teal-400" /> Ponta a ponta, sem gravação
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {transcriptionStatus && (
              <span data-testid="transcription-indicator" className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${
                transcription.active ? 'border-teal-500/50 text-teal-300' : 'border-slate-700 text-slate-400'
              }`} title="A fala é convertida em texto para o prontuário e o áudio é descartado">
                <Captions className="w-3.5 h-3.5" />
                {transcription.active
                  ? 'Transcrevendo'
                  : transcriptionStatus.reason === 'NO_CONSENT'
                    ? isTherapist ? 'Aguardando autorização do paciente' : 'Transcrição não autorizada'
                    : transcriptionStatus.reason === 'STT_DISABLED'
                      ? 'Transcrição não configurada'
                      : 'Transcrição em espera'}
              </span>
            )}
            {room?.startedAt && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 font-mono">
                <Clock className="w-3.5 h-3.5 text-teal-400" /> {formatTimer(elapsed)}
              </span>
            )}
            {isTherapist && metrics && (
              <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${qualityOk ? 'border-emerald-500/40 text-emerald-300' : 'border-amber-500/50 text-amber-300'}`}>
                <Activity className="w-3.5 h-3.5" /> MOS {metrics.mosScore.toFixed(2)}
              </span>
            )}
            <button onClick={() => setShowDevices(!showDevices)} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700" aria-label="Configurar câmera e microfone">
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </header>

        {(error || notice || metrics?.ethicalNotice || transcription.error) && (
          <div className="px-4 py-2 text-xs border-b border-slate-800 space-y-1">
            {error && <p className="text-rose-300">{error}</p>}
            {transcription.error && <p className="text-amber-300">Transcrição: {transcription.error}</p>}
            {notice && <p className="text-emerald-300">{notice}</p>}
            {metrics?.ethicalNotice && <p className="text-amber-300">{metrics.ethicalNotice}</p>}
          </div>
        )}

        {!isTherapist && transcriptionStatus?.reason === 'NO_CONSENT' && !consentDismissed && !sessionEnded && (
          <div className="px-4 py-3 border-b border-slate-800 bg-teal-950/40 flex flex-wrap items-center justify-between gap-3" data-testid="transcription-consent">
            <p className="text-xs text-slate-200 max-w-2xl">
              Você permite que a sua fala nesta sessão seja <strong>transcrita em texto</strong> para o prontuário do seu psicólogo?
              O áudio e o vídeo <strong>não são gravados</strong>: cada trecho é convertido em texto e descartado. Você pode revogar quando quiser.
            </p>
            <div className="flex gap-2">
              <button onClick={() => decideTranscription(true)} disabled={savingConsent}
                className="px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold disabled:opacity-50">
                Permitir transcrição
              </button>
              <button onClick={() => decideTranscription(false)} disabled={savingConsent}
                className="px-3 py-1.5 rounded-lg border border-slate-600 text-xs">
                Agora não
              </button>
            </div>
          </div>
        )}

        {showDevices && (
          <div className="px-4 py-3 border-b border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <label className="space-y-1">
              <span className="text-slate-400">Câmera</span>
              <select value={selectedVideo} onChange={(e) => { setSelectedVideo(e.target.value); startMedia(e.target.value || undefined, selectedAudio || undefined); }}
                className="w-full rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5">
                <option value="">Padrão do sistema</option>
                {devices.video.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Câmera'}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-slate-400">Microfone</span>
              <select value={selectedAudio} onChange={(e) => { setSelectedAudio(e.target.value); startMedia(selectedVideo || undefined, e.target.value || undefined); }}
                className="w-full rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5">
                <option value="">Padrão do sistema</option>
                {devices.audio.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microfone'}</option>)}
              </select>
            </label>
          </div>
        )}

        <div className="flex-1 flex min-h-0">
          <div className="relative flex-1 bg-black">
            <video ref={remoteVideoRef} autoPlay playsInline data-testid="remote-video"
              className={`w-full h-full object-contain ${connected ? '' : 'hidden'}`} />
            {stageMessage && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
                {!sessionEnded && myStatus !== 'REJECTED' && (knocked || isTherapist) && <Loader2 className="w-8 h-8 animate-spin text-teal-400" />}
                <p className="text-sm text-slate-300 max-w-md" data-testid="stage-message">{stageMessage}</p>
                {!isTherapist && !knocked && !sessionEnded && (
                  <button onClick={enterWaitingRoom} disabled={knocking || !localStream}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-sm font-bold disabled:opacity-50">
                    <DoorOpen className="w-4 h-4" /> Entrar na sala de espera
                  </button>
                )}
                {isTherapist && sessionEnded && onProceedToSoap && (
                  <button onClick={onProceedToSoap}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-bold">
                    <FileText className="w-4 h-4" /> Seguir para o rascunho SOAP
                  </button>
                )}
              </div>
            )}
            <video ref={localVideoRef} autoPlay playsInline muted data-testid="local-video"
              className={`absolute bottom-3 right-3 w-36 sm:w-56 aspect-video rounded-xl border border-slate-700 bg-slate-800 object-cover ${screenSharing ? '' : '-scale-x-100'} ${videoEnabled ? '' : 'opacity-30'}`} />
          </div>

          {isTherapist && (waiting.length > 0 || showMarker || showTranscript) && (
            <aside className="w-72 border-l border-slate-800 p-4 space-y-4 overflow-y-auto">
              {waiting.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300">Sala de espera</h3>
                  {waiting.map((p) => (
                    <div key={p.participantId} className="rounded-xl bg-slate-800 p-3 space-y-2">
                      <p className="text-sm font-medium">{p.name}</p>
                      <div className="flex gap-2">
                        <button onClick={() => decide(p.participantId, KnockingAction.ADMIT)}
                          className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-emerald-500 text-slate-950 text-xs font-bold">
                          <UserCheck className="w-3.5 h-3.5" /> Admitir
                        </button>
                        <button onClick={() => decide(p.participantId, KnockingAction.REJECT)}
                          className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-600 text-xs">
                          <UserX className="w-3.5 h-3.5" /> Recusar
                        </button>
                      </div>
                    </div>
                  ))}
                </section>
              )}
              {showTranscript && (
                <section className="space-y-2" data-testid="transcript-panel">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-teal-300">Transcrição da sessão</h3>
                  {transcript.length === 0 ? (
                    <p className="text-xs text-slate-400">As falas aparecem aqui alguns segundos depois de ditas.</p>
                  ) : (
                    <ul className="space-y-1.5 text-xs">
                      {transcript.map((u) => (
                        <li key={u.id}>
                          <span className={u.speaker === 'PATIENT' ? 'text-amber-300' : 'text-teal-300'}>
                            {u.speaker === 'PATIENT' ? counterpartName : 'Você'} ({formatTimer(Math.floor(u.startTimeMs / 1000))}):
                          </span>{' '}
                          <span className="text-slate-200">{u.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
              {showMarker && (
                <form onSubmit={saveMarker} className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-teal-300">Marcador clínico ({formatTimer(elapsed)})</h3>
                  <select value={markerCategory} onChange={(e) => setMarkerCategory(e.target.value as ClinicalMarkerCategory)}
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5 text-xs">
                    {Object.entries(MARKER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <textarea value={markerNote} onChange={(e) => setMarkerNote(e.target.value)} rows={3} placeholder="Nota do momento"
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5 text-xs" />
                  <button type="submit" className="w-full px-3 py-1.5 rounded-lg bg-teal-500 text-slate-950 text-xs font-bold">Registrar</button>
                </form>
              )}
            </aside>
          )}
        </div>

        <footer className="px-4 py-3 border-t border-slate-800 flex flex-wrap items-center justify-center gap-2">
          <button onClick={toggleMic} aria-label={micEnabled ? 'Desligar microfone' : 'Ligar microfone'}
            className={`p-3 rounded-full ${micEnabled ? 'bg-slate-800 hover:bg-slate-700' : 'bg-rose-600'}`}>
            {micEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>
          <button onClick={toggleVideo} aria-label={videoEnabled ? 'Desligar câmera' : 'Ligar câmera'}
            className={`p-3 rounded-full ${videoEnabled ? 'bg-slate-800 hover:bg-slate-700' : 'bg-rose-600'}`}>
            {videoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>
          <button onClick={toggleScreenShare} aria-label="Compartilhar tela"
            className={`p-3 rounded-full ${screenSharing ? 'bg-teal-600' : 'bg-slate-800 hover:bg-slate-700'}`}>
            <MonitorUp className="w-5 h-5" />
          </button>
          {isTherapist && !sessionEnded && (
            <button onClick={() => setShowMarker(!showMarker)} aria-label="Registrar marcador clínico"
              className={`p-3 rounded-full ${showMarker ? 'bg-teal-600' : 'bg-slate-800 hover:bg-slate-700'}`}>
              <BookmarkPlus className="w-5 h-5" />
            </button>
          )}
          {isTherapist && transcriptionStatus?.enabled && (
            <button onClick={() => setShowTranscript(!showTranscript)} aria-label="Ver transcrição da sessão"
              className={`p-3 rounded-full ${showTranscript ? 'bg-teal-600' : 'bg-slate-800 hover:bg-slate-700'}`}>
              <Captions className="w-5 h-5" />
            </button>
          )}
          {isTherapist && !sessionEnded && room?.startedAt && (
            <button onClick={endSession} disabled={ending}
              className="px-4 py-3 rounded-full bg-rose-600 hover:bg-rose-500 text-sm font-semibold disabled:opacity-50">
              Encerrar sessão
            </button>
          )}
          <button onClick={leave} className="inline-flex items-center gap-2 px-4 py-3 rounded-full bg-slate-700 hover:bg-slate-600 text-sm font-semibold">
            <PhoneOff className="w-4 h-4" /> Sair
          </button>
        </footer>
      </div>
    </div>
  );
}
