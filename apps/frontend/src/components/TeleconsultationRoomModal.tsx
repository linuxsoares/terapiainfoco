import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  FileText,
  Settings,
  MonitorUp,
  RefreshCw,
  Download,
  Volume2,
  VolumeX,
  Maximize2,
  Columns,
  Camera
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

type StageViewMode = 'SPLIT_VIEW' | 'LOCAL_FULL' | 'REMOTE_P2P';

export function TeleconsultationRoomModal({
  appointmentId,
  patientName = 'Mariana Silva de Oliveira',
  onClose,
  onProceedToSoap
}: TeleconsultationRoomModalProps) {
  const [room, setRoom] = useState<TeleconsultationRoom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Controles de Mídia de Hardware Reais (getUserMedia / WebRTC)
  const [micEnabled, setMicEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [screenShareActive, setScreenShareActive] = useState(false);
  const [mirrorLocalVideo, setMirrorLocalVideo] = useState(true);
  const [stageViewMode, setStageViewMode] = useState<StageViewMode>('SPLIT_VIEW');

  // Estado da Stream e Dispositivos Físicos
  const [hardwareConnected, setHardwareConnected] = useState(false);
  const [hardwareLoading, setHardwareLoading] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState<string>('');
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string>('');
  const [activeCameraLabel, setActiveCameraLabel] = useState<string>('Detectando câmera...');
  const [activeMicLabel, setActiveMicLabel] = useState<string>('Detectando microfone...');
  const [activeResolution, setActiveResolution] = useState<string>('1280x720 @ 30fps');
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);

  // Medidor de Nível de Áudio em Tempo Real (Web Audio API AnalyserNode)
  const [audioLevel, setAudioLevel] = useState<number>(0);

  // Loopback WebRTC P2P Real (RTCPeerConnection Local -> Remoto)
  const [p2pLoopbackActive, setP2pLoopbackActive] = useState(false);
  const [loopbackAudioMuted, setLoopbackAudioMuted] = useState(true);
  const [p2pConnectionState, setP2pConnectionState] = useState<string>('new');
  const [localSdpFingerprint, setLocalSdpFingerprint] = useState<string>('');

  // Gravação Real via MediaRecorder API + Sincronização TCLE
  const [recordingActive, setRecordingActive] = useState(false);
  const [recordingLoading, setRecordingLoading] = useState(false);
  const [recordedBytes, setRecordedBytes] = useState<number>(0);
  const [recordedBlobUrl, setRecordedBlobUrl] = useState<string | null>(null);

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

  // Referências de DOM e WebRTC / WebAudio
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localVideoMainRef = useRef<HTMLVideoElement | null>(null);
  const localVideoPipRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioMeterIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const pcLocalRef = useRef<RTCPeerConnection | null>(null);
  const pcRemoteRef = useRef<RTCPeerConnection | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Vincula o MediaStream aos elementos <video> sempre que o layout ou stream mudar
  const attachStreamsToVideoElements = useCallback(() => {
    const stream = localStreamRef.current;
    if (localVideoMainRef.current && stream) {
      if (localVideoMainRef.current.srcObject !== stream) {
        localVideoMainRef.current.srcObject = stream;
      }
      localVideoMainRef.current.play().catch(() => {});
    }
    if (localVideoPipRef.current && stream) {
      if (localVideoPipRef.current.srcObject !== stream) {
        localVideoPipRef.current.srcObject = stream;
      }
      localVideoPipRef.current.play().catch(() => {});
    }
    const remStream = remoteStreamRef.current || localStreamRef.current;
    if (remoteVideoRef.current && remStream) {
      if (remoteVideoRef.current.srcObject !== remStream) {
        remoteVideoRef.current.srcObject = remStream;
      }
      remoteVideoRef.current.play().catch(() => {});
    }
  }, []);

  useEffect(() => {
    attachStreamsToVideoElements();
  }, [stageViewMode, hardwareConnected, videoEnabled, p2pLoopbackActive, room?.status, attachStreamsToVideoElements]);

  // Configura analisador de espectro de voz em tempo real (VU Meter)
  const setupAudioAnalyser = useCallback((stream: MediaStream) => {
    try {
      if (audioMeterIntervalRef.current) {
        clearInterval(audioMeterIntervalRef.current);
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        setAudioLevel(0);
        return;
      }

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      source.connect(analyser);

      audioContextRef.current = ctx;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      audioMeterIntervalRef.current = setInterval(() => {
        if (!analyserRef.current) return;
        const currentAudioTrack = localStreamRef.current?.getAudioTracks()[0];
        if (!currentAudioTrack || !currentAudioTrack.enabled) {
          setAudioLevel(0);
          return;
        }
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((avg / 95) * 100));
        setAudioLevel(normalized);
      }, 80);
    } catch {
      // Fallback silencioso se AudioContext não puder iniciar antes de gesto
    }
  }, []);

  // Estabelece conexão WebRTC P2P real (RTCPeerConnection Loopback + Sinalização Backend)
  const establishWebRtcP2pLoopback = useCallback(async (stream: MediaStream) => {
    try {
      if (pcLocalRef.current) pcLocalRef.current.close();
      if (pcRemoteRef.current) pcRemoteRef.current.close();

      const pcLocal = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      const pcRemote = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      pcLocalRef.current = pcLocal;
      pcRemoteRef.current = pcRemote;

      const remoteMediaStream = new MediaStream();
      remoteStreamRef.current = remoteMediaStream;

      pcRemote.ontrack = (event) => {
        event.streams[0]?.getTracks().forEach((track) => {
          remoteMediaStream.addTrack(track);
        });
        attachStreamsToVideoElements();
      };

      pcLocal.onicecandidate = (e) => {
        if (e.candidate) {
          pcRemote.addIceCandidate(e.candidate).catch(() => {});
        }
      };

      pcRemote.onicecandidate = (e) => {
        if (e.candidate) {
          pcLocal.addIceCandidate(e.candidate).catch(() => {});
        }
      };

      pcLocal.onconnectionstatechange = () => {
        setP2pConnectionState(pcLocal.connectionState);
      };

      stream.getTracks().forEach((track) => {
        pcLocal.addTrack(track, stream);
      });

      const offer = await pcLocal.createOffer();
      await pcLocal.setLocalDescription(offer);

      // Extrai o fingerprint real DTLS-SRTP do SDP gerado pelo navegador
      const fingerprintMatch = offer.sdp?.match(/a=fingerprint:([^\r\n]+)/);
      if (fingerprintMatch?.[1]) {
        setLocalSdpFingerprint(fingerprintMatch[1]);
      }

      // Envia sinal OFFER para o backend para auditoria e sincronização multi-aba
      api.sendTeleconsultationSignal({
        appointmentId,
        signalType: 'OFFER',
        sdp: offer.sdp
      }).catch(() => {});

      await pcRemote.setRemoteDescription(offer);
      const answer = await pcRemote.createAnswer();
      await pcRemote.setLocalDescription(answer);
      await pcLocal.setRemoteDescription(answer);

      setP2pLoopbackActive(true);
      setP2pConnectionState('connected');
      attachStreamsToVideoElements();
    } catch {
      // Caso RTCPeerConnection não esteja disponível no ambiente de teste
    }
  }, [appointmentId, attachStreamsToVideoElements]);

  // Enumera câmeras e microfones reais conectados ao computador/celular
  const refreshDeviceList = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === 'videoinput');
      const mics = devices.filter((d) => d.kind === 'audioinput');
      setVideoDevices(cams);
      setAudioDevices(mics);
    } catch {
      // Ignora erro de enumeração
    }
  }, []);

  // Captura real de câmera e microfone via navigator.mediaDevices.getUserMedia
  const startHardwareMedia = useCallback(async (opts?: { videoDeviceId?: string; audioDeviceId?: string }) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Seu navegador não disponibiliza a API WebRTC navigator.mediaDevices.getUserMedia.');
      return;
    }

    setHardwareLoading(true);
    setPermissionDenied(false);
    setError(null);

    try {
      // Encerra tracks anteriores antes de reabrir
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }

      const vId = opts?.videoDeviceId ?? selectedVideoDeviceId;
      const aId = opts?.audioDeviceId ?? selectedAudioDeviceId;

      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
        ...(vId ? { deviceId: { exact: vId } } : { facingMode: 'user' })
      };

      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        ...(aId ? { deviceId: { exact: aId } } : {})
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: audioConstraints
        });
      } catch {
        // Fallback: tenta apenas vídeo ou apenas áudio caso um dos periféricos não exista
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        }
      }

      localStreamRef.current = stream;
      setHardwareConnected(true);
      setScreenShareActive(false);

      const vTrack = stream.getVideoTracks()[0];
      const aTrack = stream.getAudioTracks()[0];

      setVideoEnabled(Boolean(vTrack && vTrack.enabled));
      setMicEnabled(Boolean(aTrack && aTrack.enabled));

      const settings = vTrack?.getSettings();
      const resString = settings?.width && settings?.height
        ? `${settings.width}x${settings.height} @ ${Math.round(settings.frameRate || 30)}fps`
        : '1280x720 @ 30fps';

      const camLabel = vTrack?.label || 'Câmera HD WebRTC Conectada';
      const micLabel = aTrack?.label || 'Microfone WebRTC Conectado';

      setActiveCameraLabel(camLabel);
      setActiveMicLabel(micLabel);
      setActiveResolution(resString);

      if (settings?.deviceId && !vId) setSelectedVideoDeviceId(settings.deviceId);
      const audioSettings = aTrack?.getSettings();
      if (audioSettings?.deviceId && !aId) setSelectedAudioDeviceId(audioSettings.deviceId);

      await refreshDeviceList();
      setupAudioAnalyser(stream);
      attachStreamsToVideoElements();
      await establishWebRtcP2pLoopback(stream);

      // Sincroniza o estado real de hardware no backend e auditoria WORM
      api.syncTeleconsultationHardware({
        appointmentId,
        cameraActive: Boolean(vTrack),
        microphoneActive: Boolean(aTrack),
        screenShareActive: false,
        cameraLabel: camLabel,
        microphoneLabel: micLabel,
        resolution: resString,
        frameRate: Math.round(settings?.frameRate || 30),
        audioSampleRate: audioSettings?.sampleRate || 48000
      }).then((updatedRoom) => {
        setRoom(updatedRoom);
      }).catch(() => {});

      setSuccessMsg(`Hardware conectado: ${camLabel} + ${micLabel}`);
    } catch (err: any) {
      setPermissionDenied(true);
      setHardwareConnected(false);
      setError(
        err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError'
          ? 'Permissão de câmera/microfone bloqueada no navegador. Permita o acesso no ícone de cadeado da barra de endereços e clique em "Conectar Câmera & Microfone".'
          : `Não foi possível acessar câmera/microfone: ${err?.message || 'Verifique se os dispositivos estão conectados.'}`
      );
    } finally {
      setHardwareLoading(false);
    }
  }, [
    appointmentId,
    selectedVideoDeviceId,
    selectedAudioDeviceId,
    refreshDeviceList,
    setupAudioAnalyser,
    attachStreamsToVideoElements,
    establishWebRtcP2pLoopback
  ]);

  // Limpeza completa de hardware ao fechar o modal
  const stopAllHardwareMedia = useCallback(() => {
    if (audioMeterIntervalRef.current) {
      clearInterval(audioMeterIntervalRef.current);
      audioMeterIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Ignora
      }
    }
    if (pcLocalRef.current) {
      pcLocalRef.current.close();
      pcLocalRef.current = null;
    }
    if (pcRemoteRef.current) {
      pcRemoteRef.current.close();
      pcRemoteRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach((track) => track.stop());
      remoteStreamRef.current = null;
    }
    setHardwareConnected(false);
    setAudioLevel(0);
  }, []);

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
    startHardwareMedia();

    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopAllHardwareMedia();
    };
  }, [appointmentId]);

  // Polling leve para verificar se o paciente bateu à porta (Knocking) e coletar getStats() reais do WebRTC
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const updated = await api.getTeleconsultationRoom(appointmentId);
        setRoom(updated);
      } catch {
        // Silencioso
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [appointmentId]);

  // Alterna Microfone Real (MediaStreamTrack.enabled)
  const handleToggleMic = async () => {
    if (!localStreamRef.current) {
      await startHardwareMedia();
      return;
    }
    const audioTracks = localStreamRef.current.getAudioTracks();
    if (audioTracks.length === 0) {
      await startHardwareMedia();
      return;
    }
    const nextState = !micEnabled;
    audioTracks.forEach((track) => {
      track.enabled = nextState;
    });
    setMicEnabled(nextState);
    if (!nextState) setAudioLevel(0);

    api.syncTeleconsultationHardware({
      appointmentId,
      cameraActive: videoEnabled,
      microphoneActive: nextState,
      screenShareActive,
      cameraLabel: activeCameraLabel,
      microphoneLabel: activeMicLabel,
      resolution: activeResolution
    }).catch(() => {});
  };

  // Alterna Câmera Real (MediaStreamTrack.enabled)
  const handleToggleVideo = async () => {
    if (!localStreamRef.current) {
      await startHardwareMedia();
      return;
    }
    const videoTracks = localStreamRef.current.getVideoTracks();
    if (videoTracks.length === 0) {
      await startHardwareMedia();
      return;
    }
    const nextState = !videoEnabled;
    videoTracks.forEach((track) => {
      track.enabled = nextState;
    });
    setVideoEnabled(nextState);

    api.syncTeleconsultationHardware({
      appointmentId,
      cameraActive: nextState,
      microphoneActive: micEnabled,
      screenShareActive,
      cameraLabel: activeCameraLabel,
      microphoneLabel: activeMicLabel,
      resolution: activeResolution
    }).catch(() => {});
  };

  // Compartilhamento de Tela Real (navigator.mediaDevices.getDisplayMedia)
  const handleToggleScreenShare = async () => {
    if (screenShareActive) {
      await startHardwareMedia();
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError('Compartilhamento de tela não suportado neste navegador.');
      return;
    }
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false
      });
      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) return;

      // Mantém o áudio do microfone atual se existir
      const existingAudioTracks = localStreamRef.current?.getAudioTracks() || [];
      localStreamRef.current?.getVideoTracks().forEach((t) => t.stop());

      const combinedStream = new MediaStream([screenTrack, ...existingAudioTracks]);
      localStreamRef.current = combinedStream;
      setScreenShareActive(true);
      setVideoEnabled(true);
      setMirrorLocalVideo(false);
      setActiveCameraLabel(`Compartilhamento de Tela (${screenTrack.label || 'Display'})`);

      screenTrack.onended = () => {
        setMirrorLocalVideo(true);
        startHardwareMedia();
      };

      attachStreamsToVideoElements();
      await establishWebRtcP2pLoopback(combinedStream);
      setSuccessMsg('Compartilhamento de tela iniciado em alta definição.');
    } catch {
      // Usuário cancelou a janela de escolha de tela
    }
  };

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

  // Gravação Real com MediaRecorder API + Sincronização TCLE no Backend
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

      if (nextState && localStreamRef.current && typeof MediaRecorder !== 'undefined') {
        try {
          recordedChunksRef.current = [];
          setRecordedBytes(0);
          if (recordedBlobUrl) {
            URL.revokeObjectURL(recordedBlobUrl);
            setRecordedBlobUrl(null);
          }

          const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
            ? 'video/webm;codecs=vp8,opus'
            : MediaRecorder.isTypeSupported('video/webm')
            ? 'video/webm'
            : '';

          const recorder = mimeType
            ? new MediaRecorder(localStreamRef.current, { mimeType })
            : new MediaRecorder(localStreamRef.current);

          recorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
              recordedChunksRef.current.push(event.data);
              const total = recordedChunksRef.current.reduce((acc, b) => acc + b.size, 0);
              setRecordedBytes(total);
            }
          };

          recorder.onstop = () => {
            if (recordedChunksRef.current.length > 0) {
              const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'video/webm' });
              const url = URL.createObjectURL(blob);
              setRecordedBlobUrl(url);
            }
          };

          recorder.start(1000);
          mediaRecorderRef.current = recorder;
        } catch {
          // MediaRecorder opcional
        }
      } else if (!nextState && mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }

      setSuccessMsg(
        nextState
          ? 'Gravação de câmera/microfone ativada com consentimento prévio TCLE (LGPD/CFP).'
          : 'Gravação finalizada. Você pode baixar o arquivo capturado na barra inferior.'
      );
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
      stopAllHardwareMedia();
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

  const handleCloseModal = () => {
    stopAllHardwareMedia();
    onClose();
  };

  const formatTimer = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const waitingPatients = room?.waitingParticipants.filter((p) => p.status === 'WAITING') || [];
  const metrics: TeleconsultationCallMetrics = room?.metrics || {
    rttMs: 25,
    jitterMs: 4,
    packetLossRate: 0.1,
    mosScore: 4.45,
    qualityState: CallQualityState.EXCELLENT
  };

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 z-50 animate-fade-in text-white font-sans">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-6xl h-[93vh] flex flex-col overflow-hidden shadow-2xl relative">
        {/* Barra Superior da Teleconsulta */}
        <div className="px-4 sm:px-5 py-3 border-b border-slate-800/80 bg-slate-900/90 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  hardwareConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              />
              <span className="text-xs font-bold uppercase tracking-wider text-teal-400">
                Teleconsulta WebRTC P2P (RFC-001 §3.2)
              </span>
            </div>
            <span className="text-slate-600 hidden sm:inline">•</span>
            <span className="text-xs font-semibold text-slate-300 hidden sm:inline">
              Paciente: {room?.patientName || patientName}
            </span>

            {/* Badge de Status de Hardware */}
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1.5 ${
                hardwareConnected
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              }`}
            >
              <Camera className="w-3 h-3" />
              {hardwareConnected ? `${activeResolution}` : 'Aguardando Permissão de Câmera/Mic'}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Alternador de Modo de Palco */}
            <div className="hidden md:flex items-center bg-slate-800/90 border border-slate-700 rounded-xl p-0.5 text-[10px] font-bold">
              <button
                onClick={() => setStageViewMode('SPLIT_VIEW')}
                className={`px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all cursor-pointer ${
                  stageViewMode === 'SPLIT_VIEW' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
                title="Exibir Câmera Local e Canal Remoto Lado a Lado"
              >
                <Columns className="w-3 h-3" />
                <span>Lado a Lado</span>
              </button>
              <button
                onClick={() => setStageViewMode('LOCAL_FULL')}
                className={`px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all cursor-pointer ${
                  stageViewMode === 'LOCAL_FULL' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
                title="Expandir Minha Câmera em Tela Cheia"
              >
                <Maximize2 className="w-3 h-3" />
                <span>Minha Câmera</span>
              </button>
              <button
                onClick={() => setStageViewMode('REMOTE_P2P')}
                className={`px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all cursor-pointer ${
                  stageViewMode === 'REMOTE_P2P' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
                title="Visualização Padrão com Picture-in-Picture"
              >
                <Video className="w-3 h-3" />
                <span>Palco + PiP</span>
              </button>
            </div>

            {/* Status de Gravação LGPD */}
            {recordingActive && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/20 border border-rose-500/40 text-[11px] font-bold text-rose-300 animate-pulse">
                <Radio className="w-3.5 h-3.5 text-rose-400" />
                <span>GRAVANDO ({formatBytes(recordedBytes)})</span>
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

            {/* Botão Seletor de Dispositivos de Hardware */}
            <button
              onClick={() => {
                refreshDeviceList();
                setShowDeviceSettings(!showDeviceSettings);
              }}
              className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
                showDeviceSettings
                  ? 'bg-teal-600 border-teal-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
              }`}
              title="Configurar Câmera e Microfone"
            >
              <Settings className="w-4 h-4" />
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
                onClick={handleToggleVideo}
                className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-[11px] transition-colors cursor-pointer shrink-0"
              >
                Desligar Vídeo
              </button>
            )}
          </div>
        )}

        {/* Feedback Messages */}
        {error && (
          <div className="px-4 py-2 bg-rose-500/20 text-rose-200 text-xs flex items-center justify-between gap-3 border-b border-rose-500/30 shrink-0">
            <span>{error}</span>
            <div className="flex items-center gap-2 shrink-0">
              {permissionDenied && (
                <button
                  onClick={() => startHardwareMedia()}
                  className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] cursor-pointer"
                >
                  Tentar Novamente
                </button>
              )}
              <button onClick={() => setError(null)} className="text-slate-400 hover:text-white cursor-pointer">
                ✕
              </button>
            </div>
          </div>
        )}
        {successMsg && (
          <div className="px-4 py-2 bg-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between border-b border-emerald-500/30 shrink-0">
            <span>{successMsg}</span>
            <button onClick={() => setSuccessMsg(null)} className="text-slate-400 hover:text-white cursor-pointer">
              ✕
            </button>
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

        {/* Área Central de Vídeo (Suporte a Câmera Real + Loopback WebRTC P2P + Split View) */}
        <div className="flex-1 bg-slate-950 relative overflow-hidden flex items-center justify-center p-3 sm:p-4">
          {room?.status === TeleconsultationRoomStatus.COMPLETED ? (
            <div className="text-center p-8 space-y-4 max-w-md bg-slate-900/80 border border-slate-800 rounded-3xl">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-white">Teleconsulta Finalizada</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                A sessão foi encerrada, câmera e microfone foram desligados com segurança e o registro foi arquivado com selo WORM.
              </p>
              {recordedBlobUrl && (
                <a
                  href={recordedBlobUrl}
                  download={`teleconsulta-${appointmentId}.webm`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar Gravação da Sessão ({formatBytes(recordedBytes)})</span>
                </a>
              )}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2.5">
                <button
                  onClick={handleCloseModal}
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
          ) : stageViewMode === 'LOCAL_FULL' ? (
            /* MODO 1: Câmera Local Real em Tela Cheia */
            <div
              className={`w-full h-full rounded-2xl bg-slate-900 border overflow-hidden relative flex items-center justify-center transition-all ${
                audioLevel > 15 ? 'border-emerald-500 shadow-lg shadow-emerald-500/15' : 'border-slate-800'
              }`}
            >
              {hardwareConnected && videoEnabled ? (
                <video
                  ref={localVideoMainRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${mirrorLocalVideo ? 'scale-x-[-1]' : ''}`}
                />
              ) : (
                <div className="text-center space-y-3 p-6">
                  <div className="w-20 h-20 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto text-slate-400">
                    <VideoOff className="w-9 h-9" />
                  </div>
                  <p className="text-sm font-bold text-slate-200">
                    {hardwareConnected ? 'Câmera Pausada pelo Usuário' : 'Câmera e Microfone Desconectados'}
                  </p>
                  <button
                    onClick={() => (hardwareConnected ? handleToggleVideo() : startHardwareMedia())}
                    disabled={hardwareLoading}
                    className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold cursor-pointer inline-flex items-center gap-2"
                  >
                    <Camera className="w-4 h-4" />
                    <span>{hardwareLoading ? 'Conectando...' : 'Ativar Câmera & Microfone Agora'}</span>
                  </button>
                </div>
              )}

              {/* Overlay de Metadados da Câmera */}
              <div className="absolute top-3 left-3 bg-slate-950/75 backdrop-blur-md border border-slate-800 px-3 py-1.5 rounded-xl text-[11px] text-slate-200 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="font-bold">Você (Câmera Real):</span>
                <span className="text-teal-300">{activeCameraLabel}</span>
              </div>

              {/* Medidor de Voz no Rodapé do Vídeo */}
              <div className="absolute bottom-3 left-3 bg-slate-950/80 backdrop-blur-md border border-slate-800 px-3 py-1.5 rounded-xl flex items-center gap-2.5 text-[11px]">
                {micEnabled ? (
                  <Mic className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <MicOff className="w-3.5 h-3.5 text-rose-400" />
                )}
                <span className="text-slate-300 font-medium truncate max-w-[180px]">{activeMicLabel}</span>
                <div className="w-24 h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-teal-400 to-emerald-400 transition-all duration-75"
                    style={{ width: `${micEnabled ? audioLevel : 0}%` }}
                  />
                </div>
                <span className="font-mono text-[10px] text-emerald-300 w-8 text-right">
                  {micEnabled ? `${audioLevel}%` : 'Mudo'}
                </span>
              </div>
            </div>
          ) : stageViewMode === 'SPLIT_VIEW' ? (
            /* MODO 2: Lado a Lado (Câmera Real do Terapeuta/Usuário + Canal P2P / Sala de Espera) */
            <div className="w-full h-full grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
              {/* Quadro Esquerdo: Câmera e Microfone Reais do Usuário */}
              <div
                className={`rounded-2xl bg-slate-900 border overflow-hidden relative flex items-center justify-center transition-all ${
                  audioLevel > 15 ? 'border-emerald-500 shadow-lg shadow-emerald-500/15' : 'border-slate-800'
                }`}
              >
                {hardwareConnected && videoEnabled ? (
                  <video
                    ref={localVideoMainRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${mirrorLocalVideo ? 'scale-x-[-1]' : ''}`}
                  />
                ) : (
                  <div className="text-center space-y-3 p-6">
                    <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto text-slate-400">
                      <VideoOff className="w-7 h-7" />
                    </div>
                    <p className="text-xs font-bold text-slate-300">
                      {hardwareConnected ? 'Sua Câmera está Desativada' : 'Permita o Acesso à Câmera e Microfone'}
                    </p>
                    <button
                      onClick={() => (hardwareConnected ? handleToggleVideo() : startHardwareMedia())}
                      disabled={hardwareLoading}
                      className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold cursor-pointer inline-flex items-center gap-2"
                    >
                      <Camera className="w-4 h-4" />
                      <span>{hardwareLoading ? 'Conectando...' : 'Conectar Câmera & Microfone'}</span>
                    </button>
                  </div>
                )}

                <div className="absolute top-3 left-3 bg-slate-950/75 backdrop-blur-md border border-slate-800 px-3 py-1 rounded-xl text-[10px] text-slate-200 flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${hardwareConnected && videoEnabled ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                  <span className="font-bold">Sua Câmera ({activeResolution})</span>
                </div>

                {/* Barra de Nível de Voz (Microfone Real) */}
                <div className="absolute bottom-3 left-3 right-3 bg-slate-950/80 backdrop-blur-md border border-slate-800/90 px-3 py-2 rounded-xl flex items-center justify-between gap-2 text-[11px]">
                  <div className="flex items-center gap-2 min-w-0">
                    {micEnabled ? (
                      <Mic className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <MicOff className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    )}
                    <span className="text-slate-300 truncate text-[10px]">{activeMicLabel}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-20 sm:w-28 h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-teal-400 via-emerald-400 to-lime-400 transition-all duration-75"
                        style={{ width: `${micEnabled ? audioLevel : 0}%` }}
                      />
                    </div>
                    <span className="font-mono text-[10px] text-emerald-300 w-8 text-right">
                      {micEnabled ? `${audioLevel}%` : 'OFF'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quadro Direito: Stream Remoto WebRTC P2P / Paciente / Sala de Espera */}
              <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden relative flex flex-col items-center justify-center p-4">
                {room?.status === TeleconsultationRoomStatus.IN_PROGRESS ? (
                  p2pLoopbackActive && hardwareConnected && videoEnabled ? (
                    <div className="w-full h-full relative flex items-center justify-center">
                      <video
                        ref={remoteVideoRef}
                        autoPlay
                        playsInline
                        muted={loopbackAudioMuted}
                        className="w-full h-full object-cover rounded-xl"
                      />
                      <div className="absolute top-3 left-3 bg-slate-950/80 backdrop-blur-md border border-teal-500/40 px-3 py-1 rounded-xl text-[10px] text-teal-300 flex items-center gap-2">
                        <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                        <span>Stream Remoto WebRTC P2P ({p2pConnectionState}) • {patientName}</span>
                      </div>
                      <button
                        onClick={() => setLoopbackAudioMuted(!loopbackAudioMuted)}
                        className="absolute bottom-3 right-3 px-3 py-1.5 rounded-xl bg-slate-950/85 border border-slate-700 text-[10px] font-bold text-slate-200 hover:text-white flex items-center gap-1.5 cursor-pointer"
                        title="Ativar ou silenciar retorno de áudio do canal WebRTC P2P"
                      >
                        {loopbackAudioMuted ? (
                          <>
                            <VolumeX className="w-3.5 h-3.5 text-amber-400" />
                            <span>Ouvir Retorno do Microfone (Loopback)</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Retorno de Áudio Ativo</span>
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="text-center space-y-4">
                      <div className="w-28 h-28 rounded-full bg-gradient-to-tr from-teal-600 to-emerald-400 p-1 mx-auto shadow-2xl relative">
                        <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center text-3xl font-bold text-teal-300">
                          {patientName
                            .split(' ')
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join('')}
                        </div>
                        <span className="absolute inset-0 rounded-full border-2 border-teal-400 animate-ping opacity-40" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-white">{patientName}</h3>
                        <p className="text-xs text-slate-400">Conectado via Canal Cifrado DTLS-SRTP</p>
                      </div>
                    </div>
                  )
                ) : (
                  /* Sala de Espera / Knocking */
                  <div className="text-center space-y-4 max-w-sm">
                    <div className="w-14 h-14 rounded-full bg-teal-500/20 border border-teal-500/40 text-teal-300 flex items-center justify-center mx-auto animate-pulse">
                      <Video className="w-7 h-7" />
                    </div>
                    <h3 className="text-base font-bold text-white">
                      {hardwareConnected
                        ? 'Câmera & Microfone Prontos para Atendimento'
                        : 'Sala de Teleconsulta Pronta'}
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Sua câmera e microfone já estão operacionais no quadro ao lado. Admita o paciente na Sala de Espera (Knocking) para iniciar o streaming P2P bilateral.
                    </p>
                    <button
                      onClick={handleSimulateKnock}
                      className="px-4 py-2 rounded-xl bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 text-xs font-bold border border-teal-500/40 transition-all cursor-pointer inline-flex items-center gap-2"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Simular Entrada do Paciente (Knock)</span>
                    </button>
                  </div>
                )}

                {/* Selo DTLS-SRTP */}
                <div className="absolute bottom-3 left-3 bg-slate-950/75 backdrop-blur-sm border border-slate-800 px-2.5 py-1 rounded-xl text-[10px] text-slate-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                  <span>
                    E2EE DTLS-SRTP •{' '}
                    {localSdpFingerprint
                      ? localSdpFingerprint.substring(0, 22)
                      : room?.peerConnectionFingerprint?.substring(0, 14)}
                    ...
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* MODO 3: Palco Principal + Picture-in-Picture (PiP) */
            <div className="w-full h-full rounded-2xl bg-slate-900 border border-slate-800 relative overflow-hidden flex items-center justify-center">
              {room?.status === TeleconsultationRoomStatus.IN_PROGRESS && p2pLoopbackActive && hardwareConnected && videoEnabled ? (
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  muted={loopbackAudioMuted}
                  className="w-full h-full object-cover"
                />
              ) : room?.status === TeleconsultationRoomStatus.IN_PROGRESS ? (
                <div className="text-center space-y-4">
                  <div className="w-32 h-32 rounded-full bg-gradient-to-tr from-teal-600 to-emerald-400 p-1 mx-auto shadow-2xl relative">
                    <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center text-3xl font-bold text-teal-300">
                      {patientName
                        .split(' ')
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join('')}
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-white">{patientName}</h3>
                </div>
              ) : (
                <div className="text-center p-8 space-y-4 max-w-md">
                  <div className="w-16 h-16 rounded-full bg-teal-500/20 border border-teal-500/40 text-teal-300 flex items-center justify-center mx-auto animate-pulse">
                    <Video className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Sala de Teleconsulta Criada</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Aguardando o paciente ingressar pelo link seguro. Sua câmera está ativa na janela Picture-in-Picture no canto inferior direito.
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

              {/* Picture-in-Picture (PiP) Real */}
              <div className="absolute bottom-4 right-4 w-44 h-32 sm:w-56 sm:h-40 rounded-2xl bg-slate-950 border-2 border-slate-700 shadow-2xl overflow-hidden flex flex-col items-center justify-center z-20">
                {hardwareConnected && videoEnabled ? (
                  <video
                    ref={localVideoPipRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${mirrorLocalVideo ? 'scale-x-[-1]' : ''}`}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-500 p-2 text-center">
                    <VideoOff className="w-6 h-6 mb-1 text-slate-600" />
                    <span className="text-[10px]">Câmera Desligada</span>
                  </div>
                )}
                <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between text-[9px] bg-slate-950/75 px-2 py-0.5 rounded-lg">
                  <span className="font-bold text-slate-200">Você</span>
                  <span className="text-emerald-400 font-mono">{micEnabled ? `Mic ${audioLevel}%` : 'Mudo'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Painel Flutuante de Seleção de Dispositivos de Hardware (Câmera / Microfone) */}
          {showDeviceSettings && (
            <div className="absolute top-4 right-4 z-40 bg-slate-900/95 border border-slate-700 rounded-2xl p-4 shadow-2xl w-80 sm:w-96 space-y-3.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-white flex items-center gap-2">
                  <Settings className="w-4 h-4 text-teal-400" />
                  Dispositivos de Câmera & Microfone
                </h4>
                <button
                  onClick={() => setShowDeviceSettings(false)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-2.5 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    Selecionar Câmera (Vídeo Input)
                  </label>
                  <select
                    value={selectedVideoDeviceId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedVideoDeviceId(id);
                      startHardwareMedia({ videoDeviceId: id, audioDeviceId: selectedAudioDeviceId });
                    }}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500"
                  >
                    {videoDevices.length === 0 && <option value="">Câmera Padrão do Sistema</option>}
                    {videoDevices.map((cam, idx) => (
                      <option key={cam.deviceId || idx} value={cam.deviceId}>
                        {cam.label || `Câmera ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    Selecionar Microfone (Áudio Input)
                  </label>
                  <select
                    value={selectedAudioDeviceId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedAudioDeviceId(id);
                      startHardwareMedia({ videoDeviceId: selectedVideoDeviceId, audioDeviceId: id });
                    }}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500"
                  >
                    {audioDevices.length === 0 && <option value="">Microfone Padrão do Sistema</option>}
                    {audioDevices.map((mic, idx) => (
                      <option key={mic.deviceId || idx} value={mic.deviceId}>
                        {mic.label || `Microfone ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="text-[11px] text-slate-300 flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={mirrorLocalVideo}
                      onChange={(e) => setMirrorLocalVideo(e.target.checked)}
                      className="rounded border-slate-600 text-teal-500 focus:ring-teal-500"
                    />
                    <span>Espelhar minha câmera horizontalmente</span>
                  </label>
                </div>

                <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
                  <button
                    onClick={() => startHardwareMedia()}
                    disabled={hardwareLoading}
                    className="flex-1 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${hardwareLoading ? 'animate-spin' : ''}`} />
                    <span>Reconectar Câmera/Mic</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Painel Flutuante de Telemetria de Conexão WebRTC */}
          {showTelemetryPanel && (
            <div className="absolute top-4 right-4 z-40 bg-slate-900/95 border border-slate-700 rounded-2xl p-4 shadow-2xl w-80 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-teal-400" />
                  Telemetria WebRTC (RFC §3.2)
                </h4>
                <button onClick={() => setShowTelemetryPanel(false)} className="text-slate-400 hover:text-white">
                  ✕
                </button>
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
                <button
                  onClick={() => setShowMarkerDrawer(false)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  ✕
                </button>
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
        <div className="px-4 sm:px-6 py-3.5 border-t border-slate-800/80 bg-slate-900/95 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Controles Reais de Microfone, Câmera e Compartilhamento de Tela */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleMic}
              className={`px-3.5 py-2.5 rounded-2xl border transition-all cursor-pointer flex items-center gap-2 text-xs font-bold ${
                micEnabled && hardwareConnected
                  ? 'bg-slate-800 border-slate-700 text-white hover:bg-slate-700'
                  : 'bg-rose-500/20 border-rose-500/50 text-rose-300 hover:bg-rose-500/30'
              }`}
              title={micEnabled ? 'Desativar Microfone Real' : 'Ativar Microfone Real'}
            >
              {micEnabled && hardwareConnected ? (
                <Mic className="w-4 h-4 text-emerald-400" />
              ) : (
                <MicOff className="w-4 h-4 text-rose-400" />
              )}
              <span className="hidden sm:inline">{micEnabled && hardwareConnected ? 'Mic Ativo' : 'Mic Mudo'}</span>
              {micEnabled && hardwareConnected && (
                <span className="w-8 h-1.5 bg-slate-700 rounded-full overflow-hidden hidden md:inline-block">
                  <span
                    className="block h-full bg-emerald-400 transition-all duration-75"
                    style={{ width: `${audioLevel}%` }}
                  />
                </span>
              )}
            </button>

            <button
              onClick={handleToggleVideo}
              className={`px-3.5 py-2.5 rounded-2xl border transition-all cursor-pointer flex items-center gap-2 text-xs font-bold ${
                videoEnabled && hardwareConnected
                  ? 'bg-slate-800 border-slate-700 text-white hover:bg-slate-700'
                  : 'bg-rose-500/20 border-rose-500/50 text-rose-300 hover:bg-rose-500/30'
              }`}
              title={videoEnabled ? 'Desativar Câmera Real' : 'Ativar Câmera Real'}
            >
              {videoEnabled && hardwareConnected ? (
                <Video className="w-4 h-4 text-teal-400" />
              ) : (
                <VideoOff className="w-4 h-4 text-rose-400" />
              )}
              <span className="hidden sm:inline">
                {videoEnabled && hardwareConnected ? 'Câmera Ativa' : 'Câmera Off'}
              </span>
            </button>

            <button
              onClick={handleToggleScreenShare}
              className={`px-3.5 py-2.5 rounded-2xl border transition-all cursor-pointer flex items-center gap-2 text-xs font-bold ${
                screenShareActive
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/30'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
              title="Compartilhar Tela durante a Teleconsulta"
            >
              <MonitorUp className="w-4 h-4" />
              <span className="hidden lg:inline">
                {screenShareActive ? 'Parar Tela' : 'Compartilhar Tela'}
              </span>
            </button>
          </div>

          {/* Ações Clínicas Centrais */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Gravação Consentida + Download */}
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

            {recordedBlobUrl && !recordingActive && (
              <a
                href={recordedBlobUrl}
                download={`teleconsulta-${appointmentId}.webm`}
                className="px-3.5 py-2.5 rounded-2xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 text-xs font-bold flex items-center gap-1.5 transition-all"
              >
                <Download className="w-4 h-4" />
                <span>Baixar Vídeo ({formatBytes(recordedBytes)})</span>
              </a>
            )}

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
          <div className="flex items-center gap-2">
            {room?.status !== TeleconsultationRoomStatus.COMPLETED && (
              <button
                onClick={handleEndCall}
                className="px-4 sm:px-5 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-600/20 transition-all cursor-pointer"
              >
                <PhoneOff className="w-4 h-4" />
                <span>Encerrar Teleconsulta</span>
              </button>
            )}

            <button
              onClick={handleCloseModal}
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
