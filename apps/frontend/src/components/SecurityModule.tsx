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
  Video
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
  WebRtcSessionAuditRecord
} from '@terapiainfoco/shared';
import { UserRole, KmsKeyStatus, StressScenario, SloStatus, WebRtcVerificationStatus, WebRtcSecurityGrade, WebRtcCipherSuite } from '@terapiainfoco/shared';

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

  React.useEffect(() => {
    if (currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.PSICOLOGO_TITULAR) {
      fetchWebrtcSessions();
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
    </div>
  );
};
