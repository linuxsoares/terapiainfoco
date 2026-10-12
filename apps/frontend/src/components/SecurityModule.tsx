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
  Server
} from 'lucide-react';
import { api } from '../services/api';
import type { 
  SafeUser, 
  RateLimitStatusResponse, 
  EncryptedCacheStatsResponse 
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
