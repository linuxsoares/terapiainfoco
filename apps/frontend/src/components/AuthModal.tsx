import React, { useState, useEffect } from 'react';
import {
  X,
  LogIn,
  UserPlus,
  ShieldCheck,
  KeyRound,
  Lock,
  Mail,
  User,
  Phone,
  Award,
  HeartHandshake,
  CheckCircle2,
  AlertTriangle,
  Fingerprint,
  Globe,
  Sparkles
} from 'lucide-react';
import { UserRole, SocialAuthProvider } from '@terapiainfoco/shared';
import type { SafeUser } from '@terapiainfoco/shared';
import { api } from '../services/api';

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: 'login' | 'register';
  preselectedRole?: UserRole;
  onClose: () => void;
  onAuthenticated: (user: SafeUser, message?: string) => void;
  /** Atalhos de contas demo: disponível apenas em DEMO_MODE */
  onQuickDemoLogin?: (role: UserRole) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode = 'login',
  preselectedRole = UserRole.PSICOLOGO_TITULAR,
  onClose,
  onAuthenticated,
  onQuickDemoLogin
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [selectedRole, setSelectedRole] = useState<UserRole>(preselectedRole);

  // Campos de Login
  const demoEnabled = !!onQuickDemoLogin;
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [mfaStep, setMfaStep] = useState(false);
  const [mfaTempToken, setMfaTempToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  // Recuperação de senha: pede o link por e-mail sem sair do modal
  const [forgotStep, setForgotStep] = useState<'none' | 'request' | 'sent'>('none');
  const [forgotMessage, setForgotMessage] = useState('');

  // Campos de Criação de Perfil (Com ou Sem Login Social)
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPhone, setRegPhone] = useState('(11) 99876-5432');
  // Psicólogo
  const [regCrp, setRegCrp] = useState('06/184210');
  const [regCrpRegion, setRegCrpRegion] = useState('SP');
  const [regSpecialty, setRegSpecialty] = useState('Terapia Cognitivo-Comportamental (TCC)');
  const [regSessionFee, setRegSessionFee] = useState('250');
  const [regBio] = useState('Psicólogo(a) Clínico(a) com atuação em saúde mental e telepsicologia ética (CFP nº 011/2018).');
  // Paciente
  const [regCpf, setRegCpf] = useState('123.456.789-00');
  const [regEmergencyName, setRegEmergencyName] = useState('Contato Familiar (Rede de Apoio)');
  const [regEmergencyPhone, setRegEmergencyPhone] = useState('(11) 98888-7777');
  // Admin / DPO
  const [regDepartment, setRegDepartment] = useState('Segurança da Informação & Governança LGPD');
  const [regDpoCert, setRegDpoCert] = useState('CDPO/BR • ISO/IEC 27701');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setMode(initialMode);
    if (preselectedRole) {
      setSelectedRole(preselectedRole);
    }
    setError(null);
    setFeedback(null);
    setForgotStep('none');
  }, [initialMode, preselectedRole, isOpen]);

  // Contas Admin/DPO são criadas apenas por um administrador (não há cadastro público)
  useEffect(() => {
    if (mode === 'register' && selectedRole === UserRole.ADMIN) {
      setSelectedRole(UserRole.PACIENTE);
    }
  }, [mode, selectedRole]);

  if (!isOpen) return null;

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      setForgotMessage(await api.requestPasswordReset(loginEmail.trim()));
      setForgotStep('sent');
    } catch (err: any) {
      setError(err.message || 'Não foi possível enviar o link agora.');
    } finally {
      setLoading(false);
    }
  };

  const handleTraditionalLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.login(loginEmail, loginPassword);
      if (res.mfaRequired && res.tempToken) {
        setMfaStep(true);
        setMfaTempToken(res.tempToken);
        setFeedback('Autenticação de 2 Fatores (TOTP) solicitada.');
      } else if (res.user) {
        onAuthenticated(res.user, 'Login realizado com sucesso.');
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Credenciais inválidas.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.validateLogin2FA(mfaTempToken, mfaCode);
      if (res.user) {
        onAuthenticated(res.user, '2FA validado com sucesso.');
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Código 2FA inválido.');
    } finally {
      setLoading(false);
    }
  };

  const handleTraditionalRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.registerProfile({
        name: regName,
        email: regEmail,
        password: regPassword,
        role: selectedRole,
        phone: regPhone,
        crp: selectedRole === UserRole.PSICOLOGO_TITULAR ? regCrp : undefined,
        crpRegion: selectedRole === UserRole.PSICOLOGO_TITULAR ? regCrpRegion : undefined,
        specialty: selectedRole === UserRole.PSICOLOGO_TITULAR ? regSpecialty : undefined,
        bio: selectedRole === UserRole.PSICOLOGO_TITULAR ? regBio : undefined,
        sessionFeeCents: selectedRole === UserRole.PSICOLOGO_TITULAR ? Math.round(Number(regSessionFee || 250) * 100) : undefined,
        cpf: selectedRole === UserRole.PACIENTE ? regCpf : undefined,
        emergencyContactName: selectedRole === UserRole.PACIENTE ? regEmergencyName : undefined,
        emergencyContactPhone: selectedRole === UserRole.PACIENTE ? regEmergencyPhone : undefined,
        department: selectedRole === UserRole.ADMIN ? regDepartment : undefined,
        dpoCertification: selectedRole === UserRole.ADMIN ? regDpoCert : undefined,
        socialProvider: SocialAuthProvider.EMAIL_PASSWORD
      });

      if (res.user) {
        onAuthenticated(res.user, `Perfil (${selectedRole}) criado com sucesso!`);
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao criar perfil.');
    } finally {
      setLoading(false);
    }
  };

  const handleSocialAuth = async (provider: SocialAuthProvider) => {
    setLoading(true);
    setError(null);
    try {
      const targetRole = mode === 'register' ? selectedRole : selectedRole;
      const defaultProfilesByRole: Record<string, { name: string; email: string }> = {
        [UserRole.PSICOLOGO_TITULAR]: {
          name: regName.trim() || 'Dra. Helena Albuquerque (Social OAuth)',
          email: regEmail.trim() || `psicologa.${provider.toLowerCase()}@terapiainfoco.com.br`
        },
        [UserRole.PACIENTE]: {
          name: regName.trim() || ' Gabriel Costa (Paciente Social OAuth)',
          email: regEmail.trim() || `paciente.${provider.toLowerCase()}@terapiainfoco.com.br`
        },
        [UserRole.ADMIN]: {
          name: regName.trim() || 'Roberto Mendes (DPO Social OAuth)',
          email: regEmail.trim() || `admin.${provider.toLowerCase()}@terapiainfoco.com.br`
        }
      };

      // Se estiver na aba de Login e for um e-mail já preenchido, usa o e-mail informado
      const preset = defaultProfilesByRole[targetRole] || defaultProfilesByRole[UserRole.PACIENTE];
      const emailToUse =
        mode === 'login' && loginEmail.trim()
          ? loginEmail.trim()
          : preset.email;
      const nameToUse =
        mode === 'register' && regName.trim()
          ? regName.trim()
          : emailToUse === 'psicologo@terapiainfoco.com.br'
          ? 'Dra. Beatriz Santos'
          : emailToUse === 'paciente@terapiainfoco.com.br'
          ? 'Mariana Silva de Oliveira'
          : emailToUse === 'admin@terapiainfoco.com.br'
          ? 'Administrador do Sistema'
          : preset.name.trim();

      const res = await api.socialLoginOrRegister({
        provider,
        email: emailToUse,
        name: nameToUse,
        role: targetRole,
        phone: regPhone,
        crp: targetRole === UserRole.PSICOLOGO_TITULAR ? regCrp : undefined,
        crpRegion: targetRole === UserRole.PSICOLOGO_TITULAR ? regCrpRegion : undefined,
        specialty: targetRole === UserRole.PSICOLOGO_TITULAR ? regSpecialty : undefined,
        cpf: targetRole === UserRole.PACIENTE ? regCpf : undefined,
        department: targetRole === UserRole.ADMIN ? regDepartment : undefined,
        dpoCertification: targetRole === UserRole.ADMIN ? regDpoCert : undefined
      });

      if (res.user) {
        onAuthenticated(
          res.user,
          res.message || `Autenticado via ${provider} com sucesso!`
        );
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Falha na autenticação social.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center font-bold text-slate-950 text-lg shadow-md">
              Ψ
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                {mode === 'login' ? 'Entrar no TerapiaInFoco' : 'Criar Novo Perfil na Plataforma'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Autenticação Segura JWT • Login Social OAuth 2.0 / Gov.br • 2FA & Passkeys FIDO2
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="grid grid-cols-2 border-b border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-950/60 p-1.5 gap-1.5">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
              mode === 'login'
                ? 'bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-300 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <LogIn className="w-4 h-4" />
            <span>Entrar (Login)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
              mode === 'register'
                ? 'bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-300 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Criar Perfil (Com ou Sem Login Social)</span>
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {feedback && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{feedback}</span>
            </div>
          )}

          {/* Seletor de Perfil (Paciente, Psicólogo, Admin) comum para Login Social e Cadastro */}
          <div className="space-y-2">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {mode === 'register'
                ? '1. Escolha o Perfil (Paciente ou Psicólogo):'
                : '1. Escolha o Perfil de Acesso (Paciente, Psicólogo ou Admin):'}
            </label>
            <div className={`grid grid-cols-1 gap-2.5 ${mode === 'register' ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
              {[
                {
                  role: UserRole.PACIENTE,
                  title: 'Paciente',
                  sub: 'Portal, Exercícios & Cofre .enc',
                  emailPreset: 'paciente@terapiainfoco.com.br',
                  icon: HeartHandshake
                },
                {
                  role: UserRole.PSICOLOGO_TITULAR,
                  title: 'Psicólogo(a)',
                  sub: 'Agenda, SOAP IA, CFP & ICP',
                  emailPreset: 'psicologo@terapiainfoco.com.br',
                  icon: Sparkles
                },
                {
                  role: UserRole.ADMIN,
                  title: 'Admin / DPO',
                  sub: 'Segurança, KMS, WORM & LGPD',
                  emailPreset: 'admin@terapiainfoco.com.br',
                  icon: ShieldCheck
                }
              ].filter(item => mode === 'login' || item.role !== UserRole.ADMIN).map(item => {
                const IconComp = item.icon;
                const active = selectedRole === item.role;
                return (
                  <button
                    key={item.role}
                    type="button"
                    onClick={() => {
                      setSelectedRole(item.role);
                      // Credenciais demo só são sugeridas em DEMO_MODE
                      if (mode === 'login' && demoEnabled) {
                        setLoginEmail(item.emailPreset);
                        setLoginPassword('Senha@123456');
                      }
                    }}
                    className={`p-3 rounded-2xl border text-left transition-all flex items-start gap-2.5 ${
                      active
                        ? 'bg-teal-500/10 border-teal-500 text-teal-900 dark:text-teal-200 ring-1 ring-teal-500/40'
                        : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                    }`}
                  >
                    <IconComp className={`w-4 h-4 mt-0.5 shrink-0 ${active ? 'text-teal-600 dark:text-teal-400' : 'text-slate-400'}`} />
                    <div>
                      <p className="text-xs font-bold">{item.title}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">{item.sub}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Login Social sem verificação OIDC do token: disponível apenas em DEMO_MODE */}
          {demoEnabled && (
          <>
          {/* Botões de Login Social / Criação Social Rápida */}
          <div className="space-y-2">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              2. {mode === 'login' ? 'Entrar com Login Social ou Biometria:' : 'Criar Perfil Rápido com Login Social (1-Clique):'}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => handleSocialAuth(SocialAuthProvider.GOOGLE)}
                className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 shadow-2xs transition-all"
              >
                <Globe className="w-4 h-4 text-blue-500" />
                <span>Google</span>
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => handleSocialAuth(SocialAuthProvider.GOV_BR)}
                className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold bg-blue-600/10 hover:bg-blue-600/20 text-blue-700 dark:text-blue-300 border border-blue-500/30 transition-all"
              >
                <Award className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Gov.br (ICP)</span>
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => handleSocialAuth(SocialAuthProvider.APPLE)}
                className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 transition-all"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Apple ID</span>
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => handleSocialAuth(SocialAuthProvider.PASSKEY_FIDO2)}
                className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold bg-teal-500/10 hover:bg-teal-500/20 text-teal-800 dark:text-teal-300 border border-teal-500/30 transition-all"
              >
                <Fingerprint className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span>Passkey FIDO2</span>
              </button>
            </div>
          </div>

          <div className="relative flex py-1 items-center">
            <div className="grow border-t border-slate-200 dark:border-slate-800"></div>
            <span className="shrink mx-3 text-[11px] font-semibold text-slate-400">
              {mode === 'login' ? 'ou entre com E-mail e Senha' : 'ou preencha seu cadastro sem Login Social'}
            </span>
            <div className="grow border-t border-slate-200 dark:border-slate-800"></div>
          </div>
          </>
          )}

          {/* FORMULÁRIO DE LOGIN */}
          {mode === 'login' && !mfaStep && forgotStep !== 'none' && (
            <div className="space-y-4">
              {forgotStep === 'request' ? (
                <form onSubmit={handleForgotPassword} className="space-y-3">
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Informe o e-mail da conta. Enviaremos um link para criar uma nova senha, válido por 30 minutos.
                  </p>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      required
                      autoFocus
                      value={loginEmail}
                      onChange={e => setLoginEmail(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                      placeholder="seu@email.com.br"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-500 hover:to-emerald-500 shadow-md transition-all disabled:opacity-60"
                  >
                    {loading ? 'Enviando...' : 'Enviar link de redefinição'}
                  </button>
                </form>
              ) : (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-800 dark:text-emerald-300" role="status">
                  {forgotMessage} Confira também a caixa de spam.
                </div>
              )}
              <button
                type="button"
                onClick={() => { setForgotStep('none'); setError(null); }}
                className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
              >
                Voltar para o login
              </button>
            </div>
          )}

          {mode === 'login' && !mfaStep && forgotStep === 'none' && (
            <form onSubmit={handleTraditionalLogin} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    E-mail Institucional / Pessoal
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      required
                      value={loginEmail}
                      onChange={e => setLoginEmail(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                      placeholder="seu@email.com.br"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Senha Criptográfica
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="password"
                      required
                      value={loginPassword}
                      onChange={e => setLoginPassword(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                      placeholder="••••••••"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => { setForgotStep('request'); setError(null); }}
                    className="mt-1 text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
                  >
                    Esqueci minha senha
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-500 hover:to-emerald-500 shadow-md transition-all"
              >
                {loading ? 'Autenticando...' : `Entrar como ${selectedRole === UserRole.PACIENTE ? 'Paciente' : selectedRole === UserRole.ADMIN ? 'Admin / DPO' : 'Psicólogo(a)'}`}
              </button>

              {/* Atalhos Demo 1-Clique */}
              {onQuickDemoLogin && (
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Acesso Rápido Demo (1-Clique):
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onQuickDemoLogin(UserRole.PSICOLOGO_TITULAR);
                      onClose();
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-500/10 text-teal-700 dark:text-teal-300 hover:bg-teal-500/20"
                  >
                    👩‍⚕️ Psicóloga (Dra. Beatriz)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onQuickDemoLogin(UserRole.PACIENTE);
                      onClose();
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/20"
                  >
                    🌿 Paciente (Mariana Silva)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onQuickDemoLogin(UserRole.ADMIN);
                      onClose();
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
                  >
                    🛡️ Admin / DPO
                  </button>
                </div>
              </div>
              )}
            </form>
          )}

          {/* STEP MFA 2FA */}
          {mode === 'login' && mfaStep && (
            <form onSubmit={handleVerifyMfa} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Código Autenticador 2FA (6 dígitos ou Backup Code)
                </label>
                <input
                  type="text"
                  required
                  value={mfaCode}
                  onChange={e => setMfaCode(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-sm font-mono tracking-widest text-center bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  placeholder="000000"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl text-xs font-bold text-slate-950 bg-teal-400 hover:bg-teal-500"
              >
                Validar Código 2FA
              </button>
            </form>
          )}

          {/* FORMULÁRIO DE CRIAÇÃO DE PERFIL (SEM LOGIN SOCIAL) */}
          {mode === 'register' && (
            <form onSubmit={handleTraditionalRegister} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nome Completo
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      value={regName}
                      onChange={e => setRegName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                      placeholder={
                        selectedRole === UserRole.PSICOLOGO_TITULAR
                          ? 'Ex: Dra. Carolina Mendes'
                          : selectedRole === UserRole.PACIENTE
                          ? 'Ex: Pedro Henrique Souza'
                          : 'Ex: Carlos Eduardo DPO'
                      }
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    E-mail
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      required
                      value={regEmail}
                      onChange={e => setRegEmail(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                      placeholder="nome@dominio.com.br"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Senha (mín. 8 caracteres • Argon2id)
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={regPassword}
                      onChange={e => setRegPassword(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                      placeholder="Mínimo 8 caracteres"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Telefone / WhatsApp
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={regPhone}
                      onChange={e => setRegPhone(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                      placeholder="(11) 99999-9999"
                    />
                  </div>
                </div>
              </div>

              {/* Campos Específicos: PSICÓLOGO */}
              {selectedRole === UserRole.PSICOLOGO_TITULAR && (
                <div className="p-4 rounded-2xl bg-teal-500/5 border border-teal-500/20 space-y-3">
                  <p className="text-xs font-bold text-teal-800 dark:text-teal-300">
                    Credenciais Profissionais CFP / e-Psi
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Registro CRP
                      </label>
                      <input
                        type="text"
                        required
                        value={regCrp}
                        onChange={e => setRegCrp(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                        placeholder="06/142980"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Região UF
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={2}
                        value={regCrpRegion}
                        onChange={e => setRegCrpRegion(e.target.value.toUpperCase())}
                        className="w-full px-3 py-1.5 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                        placeholder="SP"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Honorário por Sessão (R$)
                      </label>
                      <input
                        type="number"
                        value={regSessionFee}
                        onChange={e => setRegSessionFee(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Abordagem Teórica / Especialidade Clínica
                    </label>
                    <input
                      type="text"
                      value={regSpecialty}
                      onChange={e => setRegSpecialty(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    />
                  </div>
                </div>
              )}

              {/* Campos Específicos: PACIENTE */}
              {selectedRole === UserRole.PACIENTE && (
                <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 space-y-3">
                  <p className="text-xs font-bold text-indigo-800 dark:text-indigo-300">
                    Proteção de Dados Sensíveis (FLE AES-256-GCM & Rede de Apoio CFP)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        CPF (Cifrado em Repouso)
                      </label>
                      <input
                        type="text"
                        value={regCpf}
                        onChange={e => setRegCpf(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                        placeholder="000.000.000-00"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Contato de Emergência (Nome)
                      </label>
                      <input
                        type="text"
                        value={regEmergencyName}
                        onChange={e => setRegEmergencyName(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Telefone de Emergência
                      </label>
                      <input
                        type="text"
                        value={regEmergencyPhone}
                        onChange={e => setRegEmergencyPhone(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Campos Específicos: ADMIN / DPO */}
              {selectedRole === UserRole.ADMIN && (
                <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-3">
                  <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
                    Credenciais de Governança, TI & Encarregado de Dados (DPO LGPD Art. 41)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Departamento / Unidade
                      </label>
                      <input
                        type="text"
                        value={regDepartment}
                        onChange={e => setRegDepartment(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Certificação DPO / Segurança
                      </label>
                      <input
                        type="text"
                        value={regDpoCert}
                        onChange={e => setRegDpoCert(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                      />
                    </div>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-500 hover:to-emerald-500 shadow-md transition-all"
              >
                {loading
                  ? 'Criando Perfil...'
                  : `Concluir Criação de Perfil (${selectedRole === UserRole.PACIENTE ? 'Paciente' : selectedRole === UserRole.ADMIN ? 'Admin / DPO' : 'Psicólogo(a)'})`}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
