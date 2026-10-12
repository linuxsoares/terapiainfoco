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
  Database
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
  ResilienceCheckResult
} from '@terapiainfoco/shared';
import { UserRole } from '@terapiainfoco/shared';

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

  React.useEffect(() => {
    if (currentUser.role === UserRole.ADMIN) {
      fetchInfraStatus();
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

  React.useEffect(() => {
    if (currentUser.role === UserRole.ADMIN) {
      fetchInfraStatus();
      fetchWebhooks();
      fetchProbes();
      fetchSyntheticData();
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
    </div>
  );
};
