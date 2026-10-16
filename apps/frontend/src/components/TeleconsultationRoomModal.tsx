import { useState, useEffect, useRef } from 'react';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  ShieldCheck,
  Radio,
  Activity,
  AlertTriangle,
  UserCheck,
  CheckCircle2,
  Clock,
  Sparkles,
  BookmarkPlus,
  Send,
  FileText
} from 'lucide-react';
import {
  type TeleconsultationRoom,
  type TeleconsultationCallMetrics,
  TeleconsultationRoomStatus,
  CallQualityState,
  KnockingAction,
  ClinicalMarkerCategory,
  ClinicalMarkerRelevance
} from '@terapiainfoco/shared';
import { api } from '../services/api';

interface TeleconsultationRoomModalProps {
  appointmentId: string;
  patientName?: string;
  onClose: () => void;
  onProceedToSoap?: () => void;
}

export function TeleconsultationRoomModal({
  appointmentId,
  patientName = 'Mariana Silva de Oliveira',
  onClose,
  onProceedToSoap
}: TeleconsultationRoomModalProps) {
  const [room, setRoom] = useState<TeleconsultationRoom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Controles de Mídia Locais
  const [micEnabled, setMicEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [recordingActive, setRecordingActive] = useState(false);
  const [recordingLoading, setRecordingLoading] = useState(false);

  // Telemetria & Simulação de Qualidade (RFC-001 §3.2)
  const [showTelemetryPanel, setShowTelemetryPanel] = useState(false);

  // Marcadores Clínicos Rápidos em Tempo Real (RFC-001 §3.3)
  const [showMarkerDrawer, setShowMarkerDrawer] = useState(false);
  const [markerCategory, setMarkerCategory] = useState<ClinicalMarkerCategory>(ClinicalMarkerCategory.INSIGHT);
  const [markerNote, setMarkerNote] = useState('');
  const [markerSaving, setMarkerSaving] = useState(false);

  // Cronômetro da Sessão
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchRoom = async () => {
    try {
      const roomData = await api.getTeleconsultationRoom(appointmentId);
      setRoom(roomData);
      setRecordingActive(roomData.isRecordingActive);
    } catch (err: any) {
      setError(err.message || 'Erro ao conectar à sala de teleconsulta');
    }
  };

  useEffect(() => {
    fetchRoom();
    // Inicia cronômetro da sessão
    timerRef.current = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [appointmentId]);

  // Polling leve para verificar se o paciente bateu à porta (Knocking)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const updated = await api.getTeleconsultationRoom(appointmentId);
        setRoom(updated);
      } catch {
        // Silencioso em caso de rede momentânea
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [appointmentId]);

  const handleSimulateKnock = async () => {
    try {
      setError(null);
      await api.knockTeleconsultationWaitingRoom({
        appointmentId,
        patientName,
        clientFingerprint: `client_mac_${Date.now().toString(36)}`
      });
      setSuccessMsg('Paciente ingressou na Sala de Espera (Knocking)! Notificação enviada ao terapeuta.');
      await fetchRoom();
    } catch (err: any) {
      setError(err.message || 'Erro ao simular knocking');
    }
  };

  const handleAdmitParticipant = async (participantId: string, action: 'ADMIT' | 'REJECT') => {
    try {
      setError(null);
      const updated = await api.admitTeleconsultationParticipant({
        appointmentId,
        participantId,
        action
      });
      setRoom(updated);
      setSuccessMsg(action === 'ADMIT' ? `${patientName} admitido(a) na teleconsulta!` : 'Participante rejeitado.');
    } catch (err: any) {
      setError(err.message || 'Erro ao responder à solicitação da sala de espera');
    }
  };

  const handleToggleRecording = async () => {
    try {
      setRecordingLoading(true);
      setError(null);
      const nextState = !recordingActive;
      const updated = await api.toggleTeleconsultationRecording({
        appointmentId,
        isRecordingActive: nextState,
        recordingConsentConfirmed: true
      });
      setRoom(updated);
      setRecordingActive(nextState);
      setSuccessMsg(nextState ? 'Gravação ativada com consentimento prévio TCLE (LGPD/CFP).' : 'Gravação pausada.');
    } catch (err: any) {
      setError(err.message || 'Erro ao alternar gravação');
    } finally {
      setRecordingLoading(false);
    }
  };

  const handleUpdateQuality = async (rtt: number, jitter: number, loss: number) => {
    try {
      const res = await api.updateTeleconsultationQuality({
        appointmentId,
        rttMs: rtt,
        jitterMs: jitter,
        packetLoss: loss
      });
      setRoom(res.room);
    } catch (err: any) {
      setError(err.message || 'Erro ao sincronizar telemetria WebRTC');
    }
  };

  const handleSaveMarker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!markerNote.trim()) return;

    try {
      setMarkerSaving(true);
      const min = Math.floor(elapsedSeconds / 60);
      const sec = elapsedSeconds % 60;
      const timecode = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;

      await api.createClinicalMarker({
        appointmentId,
        timestampMs: elapsedSeconds * 1000,
        timeFormatted: timecode,
        category: markerCategory,
        relevance: ClinicalMarkerRelevance.HIGH,
        note: markerNote.trim(),
        suggestedSoapQuadrant: markerCategory === ClinicalMarkerCategory.INSIGHT ? 'ASSESSMENT' : 'SUBJECTIVE'
      });

      setSuccessMsg(`Marcador [${markerCategory}] registrado com sucesso em ${timecode}!`);
      setMarkerNote('');
      setShowMarkerDrawer(false);
    } catch (err: any) {
      setError(err.message || 'Erro ao registrar marcador clínico');
    } finally {
      setMarkerSaving(false);
    }
  };

  const handleEndCall = async () => {
    try {
      setError(null);
      const updated = await api.endTeleconsultation({
        appointmentId,
        durationSeconds: elapsedSeconds,
        summaryNotes: 'Teleconsulta encerrada com sucesso pelo psicólogo titular.'
      });
      setRoom(updated);
      if (timerRef.current) clearInterval(timerRef.current);
    } catch (err: any) {
      setError(err.message || 'Erro ao finalizar teleconsulta');
    }
  };

  const formatTimer = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const waitingPatients = room?.waitingParticipants.filter(p => p.status === 'WAITING') || [];
  const metrics: TeleconsultationCallMetrics = room?.metrics || {
    rttMs: 25,
    jitterMs: 4,
    packetLossRate: 0.1,
    mosScore: 4.45,
    qualityState: CallQualityState.EXCELLENT
  };

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 z-50 animate-fade-in text-white font-sans">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-5xl h-[92vh] flex flex-col overflow-hidden shadow-2xl relative">
        {/* Barra Superior da Teleconsulta */}
        <div className="px-5 py-3 border-b border-slate-800/80 bg-slate-900/80 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider text-teal-400">
                Teleconsulta WebRTC P2P (RFC-001 §3.2)
              </span>
            </div>
            <span className="text-slate-600 hidden sm:inline">•</span>
            <span className="text-xs font-semibold text-slate-300 hidden sm:inline">
              Paciente: {room?.patientName || patientName}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Status de Gravação LGPD */}
            {recordingActive && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/20 border border-rose-500/40 text-[11px] font-bold text-rose-300 animate-pulse">
                <Radio className="w-3.5 h-3.5 text-rose-400" />
                <span>GRAVANDO • TCLE ATIVO</span>
              </div>
            )}

            {/* Cronômetro */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 border border-slate-700/80 text-xs font-mono font-bold text-slate-200">
              <Clock className="w-3.5 h-3.5 text-teal-400" />
              <span>{formatTimer(elapsedSeconds)}</span>
            </div>

            {/* Indicador de Qualidade MOS */}
            <button
              onClick={() => setShowTelemetryPanel(!showTelemetryPanel)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all cursor-pointer ${
                metrics.qualityState === CallQualityState.EXCELLENT || metrics.qualityState === CallQualityState.GOOD
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : metrics.qualityState === CallQualityState.FAIR
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-rose-500/20 border-rose-500/50 text-rose-300 animate-bounce'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>MOS {metrics.mosScore.toFixed(2)} ({metrics.qualityState})</span>
            </button>
          </div>
        </div>

        {/* Alerta Ético CFP nº 011/2018 se Qualidade Baixa */}
        {metrics.ethicalNotice && (
          <div className="px-5 py-2.5 bg-amber-500/20 border-b border-amber-500/30 text-amber-200 text-xs flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{metrics.ethicalNotice}</span>
            </div>
            {videoEnabled && (
              <button
                onClick={() => setVideoEnabled(false)}
                className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-[11px] transition-colors cursor-pointer shrink-0"
              >
                Desligar Vídeo
              </button>
            )}
          </div>
        )}

        {/* Feedback Messages */}
        {error && (
          <div className="px-4 py-2 bg-rose-500/20 text-rose-300 text-xs flex items-center justify-between border-b border-rose-500/30">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-slate-400 hover:text-white">✕</button>
          </div>
        )}
        {successMsg && (
          <div className="px-4 py-2 bg-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between border-b border-emerald-500/30">
            <span>{successMsg}</span>
            <button onClick={() => setSuccessMsg(null)} className="text-slate-400 hover:text-white">✕</button>
          </div>
        )}

        {/* Notificação Flutuante de Paciente na Sala de Espera (Knocking) */}
        {waitingPatients.length > 0 && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 bg-slate-800/95 border border-teal-500/40 rounded-2xl p-4 shadow-2xl flex flex-col sm:flex-row items-center gap-4 animate-bounce-short max-w-lg w-[90%]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-300">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-white block">
                  {waitingPatients[0].name} está na Sala de Espera
                </span>
                <span className="text-[11px] text-slate-400">
                  Aguardando autorização ética para entrada na sessão
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:ml-auto w-full sm:w-auto">
              <button
                onClick={() => handleAdmitParticipant(waitingPatients[0].participantId, KnockingAction.REJECT)}
                className="flex-1 sm:flex-none px-3 py-1.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-700 text-xs font-semibold cursor-pointer"
              >
                Rejeitar
              </button>
              <button
                onClick={() => handleAdmitParticipant(waitingPatients[0].participantId, KnockingAction.ADMIT)}
                className="flex-1 sm:flex-none px-4 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-lg shadow-teal-500/30 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Admitir Paciente</span>
              </button>
            </div>
          </div>
        )}

        {/* Área Central de Vídeo (Remoto + Local PIP) */}
        <div className="flex-1 bg-slate-950 relative overflow-hidden flex items-center justify-center">
          {/* Feed do Paciente (Remoto) */}
          {room?.status === TeleconsultationRoomStatus.IN_PROGRESS ? (
            <div className="w-full h-full flex flex-col items-center justify-center relative bg-gradient-to-b from-slate-900 to-slate-950">
              {/* Avatar e Representação do Paciente */}
              <div className="relative text-center space-y-4">
                <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-gradient-to-tr from-teal-600 to-emerald-400 p-1 mx-auto shadow-2xl relative">
                  <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center text-3xl sm:text-4xl font-bold text-teal-300">
                    {patientName.split(' ').map(n => n[0]).slice(0, 2).join('')}
                  </div>
                  {/* Ondas Sonoras Simulando Voz Ativa */}
                  <span className="absolute inset-0 rounded-full border-2 border-teal-400 animate-ping opacity-40" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white tracking-wide">{patientName}</h3>
                  <p className="text-xs text-slate-400">Canal Cifrado DTLS-SRTP • 1080p 30fps</p>
                </div>
              </div>

              {/* Selo Criptográfico de Segurança Flutuante */}
              <div className="absolute top-4 left-4 bg-slate-900/70 backdrop-blur-sm border border-slate-800 px-3 py-1.5 rounded-xl text-[10px] text-slate-300 flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                <span>E2EE DTLS-SRTP • SAS: {room.peerConnectionFingerprint?.substring(0, 10)}...</span>
              </div>
            </div>
          ) : room?.status === TeleconsultationRoomStatus.COMPLETED ? (
            <div className="text-center p-8 space-y-4 max-w-md">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-white">Teleconsulta Finalizada</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                A sessão foi encerrada e arquivada com selo WORM. Prossiga para a evolução clínica e geração dos quadrantes SOAP assistidos por IA.
              </p>
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2.5">
                <button
                  onClick={onClose}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-xs font-semibold cursor-pointer"
                >
                  Fechar Janela
                </button>
                {onProceedToSoap && (
                  <button
                    onClick={onProceedToSoap}
                    className="w-full sm:w-auto px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-lg shadow-teal-500/20 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Ir para Prontuário SOAP</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* Sala em Espera de Paciente */
            <div className="text-center p-8 space-y-4 max-w-md">
              <div className="w-16 h-16 rounded-full bg-teal-500/20 border border-teal-500/40 text-teal-300 flex items-center justify-center mx-auto animate-pulse">
                <Video className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-white">Sala de Teleconsulta Criada</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Aguardando o paciente ingressar pelo link seguro. Quando o paciente clicar no link, você receberá a solicitação de admissão na Sala de Espera (Knocking).
              </p>
              <button
                onClick={handleSimulateKnock}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-400 text-xs font-semibold border border-teal-500/30 transition-all cursor-pointer inline-flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>Simular Entrada do Paciente (Knock)</span>
              </button>
            </div>
          )}

          {/* Vídeo Local do Psicólogo (Picture-in-Picture) */}
          <div className="absolute bottom-4 right-4 w-36 h-28 sm:w-48 sm:h-36 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden flex flex-col items-center justify-center text-center p-2 z-20">
            {videoEnabled ? (
              <div className="w-full h-full bg-slate-800 rounded-xl flex flex-col items-center justify-center relative overflow-hidden">
                <div className="w-10 h-10 rounded-full bg-teal-600/30 text-teal-300 flex items-center justify-center font-bold text-xs mb-1">
                  Dra.
                </div>
                <span className="text-[10px] font-bold text-slate-300">Você (Terapeuta)</span>
                <span className="text-[9px] text-emerald-400">Câmera Ativa</span>
              </div>
            ) : (
              <div className="w-full h-full bg-slate-900 rounded-xl flex flex-col items-center justify-center text-slate-500">
                <VideoOff className="w-6 h-6 mb-1 text-slate-600" />
                <span className="text-[10px]">Câmera Desligada</span>
              </div>
            )}
            {!micEnabled && (
              <span className="absolute top-2 left-2 p-1 rounded-full bg-rose-500/80 text-white">
                <MicOff className="w-3 h-3" />
              </span>
            )}
          </div>

          {/* Painel Flutuante de Telemetria de Conexão WebRTC */}
          {showTelemetryPanel && (
            <div className="absolute top-4 right-4 z-40 bg-slate-900/95 border border-slate-700 rounded-2xl p-4 shadow-2xl w-80 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-teal-400" />
                  Telemetria WebRTC (RFC §3.2)
                </h4>
                <button onClick={() => setShowTelemetryPanel(false)} className="text-slate-400 hover:text-white">✕</button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 bg-slate-800/60 rounded-xl border border-slate-700/50">
                  <span className="text-slate-400 block">Latência (RTT):</span>
                  <span className="text-base font-bold text-teal-300">{metrics.rttMs} ms</span>
                </div>
                <div className="p-2 bg-slate-800/60 rounded-xl border border-slate-700/50">
                  <span className="text-slate-400 block">Jitter:</span>
                  <span className="text-base font-bold text-teal-300">{metrics.jitterMs} ms</span>
                </div>
                <div className="p-2 bg-slate-800/60 rounded-xl border border-slate-700/50">
                  <span className="text-slate-400 block">Perda Pacotes:</span>
                  <span className="text-base font-bold text-teal-300">{metrics.packetLossRate.toFixed(1)}%</span>
                </div>
                <div className="p-2 bg-slate-800/60 rounded-xl border border-slate-700/50">
                  <span className="text-slate-400 block">MOS (G.107):</span>
                  <span className="text-base font-bold text-emerald-400">{metrics.mosScore.toFixed(2)}</span>
                </div>
              </div>

              {/* Botões de Simulação de Degradação */}
              <div className="pt-2 border-t border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">
                  Simular Cenários de Rede:
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleUpdateQuality(25, 4, 0.1)}
                    className="flex-1 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-bold border border-emerald-500/40 cursor-pointer"
                  >
                    Cristalina
                  </button>
                  <button
                    onClick={() => handleUpdateQuality(110, 18, 2.0)}
                    className="flex-1 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[10px] font-bold border border-amber-500/40 cursor-pointer"
                  >
                    Oscilante
                  </button>
                  <button
                    onClick={() => handleUpdateQuality(340, 65, 14.0)}
                    className="flex-1 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[10px] font-bold border border-rose-500/40 cursor-pointer"
                  >
                    Crítica
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Drawer Lateral: Marcadores Clínicos em Tempo Real (RFC-001 §3.3) */}
          {showMarkerDrawer && (
            <div className="absolute top-0 right-0 bottom-0 w-80 z-40 bg-slate-900/95 border-l border-slate-800 p-5 shadow-2xl flex flex-col space-y-4 animate-slide-left">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-white flex items-center gap-2">
                  <BookmarkPlus className="w-4 h-4 text-teal-400" />
                  Marcador Clínico Rápido
                </h4>
                <button onClick={() => setShowMarkerDrawer(false)} className="text-slate-400 hover:text-white cursor-pointer">✕</button>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                Capture momentos-chave da teleconsulta com timecode sincronizado para alimentar os quadrantes SOAP ao final da sessão.
              </p>

              <form onSubmit={handleSaveMarker} className="space-y-3 flex-1 flex flex-col">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    Categoria do Marcador
                  </label>
                  <select
                    value={markerCategory}
                    onChange={(e) => setMarkerCategory(e.target.value as ClinicalMarkerCategory)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500 cursor-pointer"
                  >
                    <option value={ClinicalMarkerCategory.INSIGHT}>💡 Insight / Reestruturação</option>
                    <option value={ClinicalMarkerCategory.CRISIS_ALERT}>🚨 Alerta de Crise / Risco</option>
                    <option value={ClinicalMarkerCategory.AFFECT_SHIFT}>🎭 Mudança Afetiva</option>
                    <option value={ClinicalMarkerCategory.RESISTANCE}>🛑 Resistência / Esquiva</option>
                    <option value={ClinicalMarkerCategory.SOMATIC_COMPLAINT}>🩺 Queixa Somática</option>
                  </select>
                </div>

                <div className="flex-1">
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    Nota Clínica (Timecode: {formatTimer(elapsedSeconds)})
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={markerNote}
                    onChange={(e) => setMarkerNote(e.target.value)}
                    placeholder="Ex: Paciente verbalizou insight sobre mecanismo de autocobrança em relação ao pai..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-teal-500 resize-none font-sans"
                  />
                </div>

                <button
                  type="submit"
                  disabled={markerSaving}
                  className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-teal-500/20 cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{markerSaving ? 'Registrando...' : 'Salvar Marcador (Firma WORM)'}</span>
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Barra Inferior de Controles da Teleconsulta */}
        <div className="px-6 py-4 border-t border-slate-800/80 bg-slate-900/90 flex flex-wrap items-center justify-between gap-4 shrink-0">
          {/* Controles de Áudio e Vídeo */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setMicEnabled(!micEnabled)}
              className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                micEnabled
                  ? 'bg-slate-800 border-slate-700 text-white hover:bg-slate-700'
                  : 'bg-rose-500/20 border-rose-500/50 text-rose-300 hover:bg-rose-500/30'
              }`}
              title={micEnabled ? 'Desativar Microfone' : 'Ativar Microfone'}
            >
              {micEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            </button>

            <button
              onClick={() => setVideoEnabled(!videoEnabled)}
              className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                videoEnabled
                  ? 'bg-slate-800 border-slate-700 text-white hover:bg-slate-700'
                  : 'bg-rose-500/20 border-rose-500/50 text-rose-300 hover:bg-rose-500/30'
              }`}
              title={videoEnabled ? 'Desativar Câmera' : 'Ativar Câmera'}
            >
              {videoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            </button>
          </div>

          {/* Ações Clínicas Centrais */}
          <div className="flex items-center gap-2.5">
            {/* Gravação Consentida */}
            <button
              onClick={handleToggleRecording}
              disabled={recordingLoading}
              className={`px-4 py-2.5 rounded-2xl border text-xs font-bold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 ${
                recordingActive
                  ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-600 shadow-lg shadow-rose-600/30'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
            >
              <Radio className={`w-4 h-4 ${recordingActive ? 'animate-pulse' : ''}`} />
              <span>{recordingActive ? 'Pausar Gravação' : 'Gravar com TCLE'}</span>
            </button>

            {/* Marcador Clínico Rápido */}
            <button
              onClick={() => setShowMarkerDrawer(!showMarkerDrawer)}
              className="px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-teal-300 border border-teal-500/30 text-xs font-bold flex items-center gap-2 transition-all cursor-pointer"
            >
              <BookmarkPlus className="w-4 h-4 text-teal-400" />
              <span>Marcar Insight / Crise</span>
            </button>
          </div>

          {/* Finalizar Consulta */}
          <div className="flex items-center gap-2.5">
            {room?.status !== TeleconsultationRoomStatus.COMPLETED && (
              <button
                onClick={handleEndCall}
                className="px-5 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-600/20 transition-all cursor-pointer"
              >
                <PhoneOff className="w-4 h-4" />
                <span>Encerrar Teleconsulta</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="px-3 py-2.5 rounded-2xl border border-slate-700 text-slate-400 hover:text-white text-xs font-semibold cursor-pointer"
            >
              Sair
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
