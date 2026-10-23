import { useEffect, useState } from 'react';
import { 
  Calendar, 
  Users, 
  Sparkles, 
  FileText,
  ShieldCheck, 
  Activity,
  KeyRound,
  ChevronDown,
  UserCheck,
  BarChart3,
  Database,
  Menu,
  X,
  User,
  LogOut,
  Eye,
  HeartHandshake,
  UserSearch,
  Globe,
  BadgeCheck,
  Gauge,
  UsersRound,
  Inbox,
  type LucideIcon
} from 'lucide-react';
import { DashboardModule } from './components/DashboardModule';
import { AgendaModule } from './components/AgendaModule';
import { PatientsModule } from './components/PatientsModule';
import { SoapModule } from './components/SoapModule';
import { DocumentsModule } from './components/DocumentsModule';
import { AuditModule } from './components/AuditModule';
import { SecurityModule } from './components/SecurityModule';
import { BackupModule } from './components/BackupModule';
import { ObservabilityModule } from './components/ObservabilityModule';
import { TeamModule } from './components/TeamModule';
import { LeadsModule } from './components/LeadsModule';
import { ChangePasswordCard } from './components/ChangePasswordCard';
import { PatientHomeModule } from './components/PatientHomeModule';
import { TherapistDirectory } from './components/TherapistDirectory';
import { TherapistProfileEditor } from './components/TherapistProfileEditor';
import { CrpVerificationModule } from './components/CrpVerificationModule';
import { PublicDirectoryPage } from './components/PublicDirectoryPage';
import { BookingPanel } from './components/BookingPanel';
import { TeleconsultationRoom } from './components/TeleconsultationRoom';
import { PublicShowcasePage } from './components/PublicShowcasePage';
import { AuthModal } from './components/AuthModal';
import { PasswordResetScreen } from './components/PasswordResetScreen';
import { AppointmentLinkScreen } from './components/AppointmentLinkScreen';
import { EmailVerificationBanner, FlashNoticeToast, type FlashNotice } from './components/EmailVerificationNotice';
import { UserProfileModal } from './components/UserProfileModal';
import { PatientPortalModal } from './components/PatientPortalModal';
import { PortabilityVaultModal } from './components/PortabilityVaultModal';
import { ThemeToggle } from './components/ThemeToggle';
import { PrivacyProvider } from './contexts/PrivacyContext';
import { PrivacyBanner, PrivacyToggleButton } from './components/PrivacyBanner';
import { api, hasStoredSession } from './services/api';
import type { SafeUser, AppModule } from '@terapiainfoco/shared';
import { UserRole, APP_MODULES, TELECONSULTATION_ROLES, canViewModule, defaultModule, visibleModules } from '@terapiainfoco/shared';

const DEMO_USERS: Record<UserRole, { email: string; name: string; crp?: string; patientId?: string; roleName: string }> = {
  [UserRole.PSICOLOGO_TITULAR]: {
    email: 'psicologo@terapiainfoco.com.br',
    name: 'Dra. Beatriz Santos',
    crp: '06/142980',
    roleName: 'Psicóloga Titular (CRP)'
  },
  [UserRole.PACIENTE]: {
    email: 'paciente@terapiainfoco.com.br',
    name: 'Mariana Silva de Oliveira',
    patientId: '00000000-0000-0000-0000-000000000002',
    roleName: 'Paciente'
  },
  [UserRole.ADMIN]: {
    email: 'admin@terapiainfoco.com.br',
    name: 'Administrador do Sistema',
    roleName: 'Admin TI & DPO'
  },
  [UserRole.SUPERVISOR_CLINICO]: {
    email: 'supervisor@terapiainfoco.com.br',
    name: 'Dr. Marcos Valente',
    crp: '06/099887',
    roleName: 'Supervisor Clínico'
  },
  [UserRole.RECEPCAO_SECRETARIA]: {
    email: 'recepcao@terapiainfoco.com.br',
    name: 'Ana Secretária',
    roleName: 'Recepção / Secretária'
  }
};

const LAST_TAB_KEY = 'terapiainfoco_active_tab';

function readLastTab(): AppModule | null {
  try {
    const value = localStorage.getItem(LAST_TAB_KEY);
    return value && (APP_MODULES as readonly string[]).includes(value) ? (value as AppModule) : null;
  } catch {
    return null;
  }
}

function writeLastTab(tab: AppModule): void {
  try {
    localStorage.setItem(LAST_TAB_KEY, tab);
  } catch {
    // Armazenamento indisponível (aba anônima/bloqueio): apenas não lembra a tela
  }
}

function urlParam(name: string): string | null {
  return typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get(name) : null;
}

/** Nome do papel exibido ao usuário (nunca o valor cru do enum) */
const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.PSICOLOGO_TITULAR]: 'Psicólogo(a)',
  [UserRole.SUPERVISOR_CLINICO]: 'Supervisor(a) Clínico(a)',
  [UserRole.RECEPCAO_SECRETARIA]: 'Recepção',
  [UserRole.PACIENTE]: 'Paciente',
  [UserRole.ADMIN]: 'Administrador(a)'
};


/** Itens de navegação; a visibilidade por perfil vem de MODULE_ACCESS (@terapiainfoco/shared) */
const NAV_ITEMS: Record<Exclude<AppModule, 'security'>, { label: string; shortLabel: string; icon: LucideIcon; iconClass: string }> = {
  portal: { label: 'Meu Espaço', shortLabel: 'Início', icon: HeartHandshake, iconClass: 'text-indigo-600 dark:text-indigo-400' },
  directory: { label: 'Encontrar Psicólogo', shortLabel: 'Buscar', icon: UserSearch, iconClass: 'text-teal-600 dark:text-teal-400' },
  dashboard: { label: 'Dashboard', shortLabel: 'Início', icon: BarChart3, iconClass: 'text-teal-600 dark:text-teal-400' },
  agenda: { label: 'Agenda & Teleconsulta', shortLabel: 'Agenda', icon: Calendar, iconClass: 'text-teal-600 dark:text-teal-400' },
  patients: { label: 'Pacientes', shortLabel: 'Pacientes', icon: Users, iconClass: 'text-sky-600 dark:text-sky-400' },
  soap: { label: 'Evolução SOAP & IA', shortLabel: 'SOAP', icon: Sparkles, iconClass: 'text-purple-600 dark:text-purple-400' },
  documents: { label: 'Documentos & Recibos', shortLabel: 'Documentos', icon: FileText, iconClass: 'text-teal-600 dark:text-teal-400' },
  publicProfile: { label: 'Meu Perfil Público', shortLabel: 'Perfil Público', icon: Globe, iconClass: 'text-teal-600 dark:text-teal-400' },
  audit: { label: 'Auditoria', shortLabel: 'Auditoria', icon: Activity, iconClass: 'text-emerald-600 dark:text-emerald-400' },
  crpVerification: { label: 'Verificação de CRP', shortLabel: 'CRP', icon: BadgeCheck, iconClass: 'text-emerald-600 dark:text-emerald-400' },
  team: { label: 'Equipe', shortLabel: 'Equipe', icon: UsersRound, iconClass: 'text-sky-600 dark:text-sky-400' },
  leads: { label: 'Pedidos de Acesso', shortLabel: 'Pedidos', icon: Inbox, iconClass: 'text-teal-600 dark:text-teal-400' },
  backups: { label: 'Backups & DR (KMS)', shortLabel: 'Backups', icon: Database, iconClass: 'text-teal-600 dark:text-teal-400' },
  observability: { label: 'Segurança & Observabilidade', shortLabel: 'Observabilidade', icon: Gauge, iconClass: 'text-teal-600 dark:text-teal-400' }
};

const NAV_ITEM_ACTIVE = 'bg-teal-50 text-teal-800 border border-teal-200 shadow-sm dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30';
const NAV_ITEM_IDLE = 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/50';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppModule>('dashboard');
  // Consulta aberta na Evolução SOAP (a partir da Agenda ou escolhida na própria tela)
  const [soapAppointmentId, setSoapAppointmentId] = useState<string | null>(null);
  // Sessão salva (ou link de sala) é verificada antes de decidir entre vitrine e painel
  const [restoringSession, setRestoringSession] = useState<boolean>(() => hasStoredSession());
  // Link de recuperação de senha enviado por e-mail (?redefinir-senha=<token>)
  const [passwordResetToken, setPasswordResetToken] = useState<string | null>(() => urlParam('redefinir-senha'));
  // Link do lembrete de consulta (?consulta=<token>): confirmar presença ou cancelar, sem login
  const [appointmentLinkToken, setAppointmentLinkToken] = useState<string | null>(() => urlParam('consulta'));
  const [flashNotice, setFlashNotice] = useState<FlashNotice | null>(null);

  // Controle de exibição da Vitrine Pública (Sem Login) vs. Workspace Autenticado
  const [showPublicShowcase, setShowPublicShowcase] = useState<boolean>(true);
  // Link da sala (?sala=<consulta>): abre a teleconsulta assim que houver sessão
  const [roomAppointmentId, setRoomAppointmentId] = useState<string | null>(
    () => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('sala') : null)
  );
  // Links vindos da landing page: ?vitrine=psicologos abre a busca; ?entrar / ?cadastro=paciente abrem o acesso
  const [publicView, setPublicView] = useState<'showcase' | 'directory'>(
    () => (urlParam('vitrine') === 'psicologos' ? 'directory' : 'showcase')
  );

  // Modais de Autenticação, Criação de Perfil, Meu Perfil e Atalhos do Paciente
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');
  const [authPreselectedRole, setAuthPreselectedRole] = useState<UserRole>(UserRole.PSICOLOGO_TITULAR);
  const [profileModalOpen, setProfileModalOpen] = useState<boolean>(false);
  const [patientPortalModalOpen, setPatientPortalModalOpen] = useState<boolean>(false);
  const [portabilityVaultModalOpen, setPortabilityVaultModalOpen] = useState<boolean>(false);

  // Usuário autenticado
  const [currentUser, setCurrentUser] = useState<SafeUser>({
    id: '00000000-0000-0000-0000-000000000001',
    email: 'psicologo@terapiainfoco.com.br',
    name: 'Dra. Beatriz Santos',
    role: UserRole.PSICOLOGO_TITULAR,
    crp: '06/142980',
    crpRegion: 'SP',
    therapistId: 'therapist-001',
    phone: '(11) 99123-4567',
    specialty: 'Terapia Cognitivo-Comportamental (TCC) & ACT',
    bio: 'Psicóloga Clínica (USP), Especialista em Transtornos de Ansiedade, Neuropsicologia e Telepsicologia Ética (CFP nº 011/2018).',
    sessionFeeCents: 25000,
    twoFactorEnabled: false,
    createdAt: new Date().toISOString()
  });

  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  // Atalhos de contas demo só existem quando o backend roda em DEMO_MODE (padrão: desligado)
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    api.getPublicConfig().then((cfg) => setDemoMode(cfg.demoMode)).catch(() => setDemoMode(false));
  }, []);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Login com conta demo (apenas em DEMO_MODE); sem login real o perfil não é trocado
  const handleSwitchRole = async (role: UserRole) => {
    const demo = DEMO_USERS[role] || DEMO_USERS[UserRole.PSICOLOGO_TITULAR];
    setRoleDropdownOpen(false);
    try {
      const res = await api.login(demo.email, 'Senha@123456');
      if (!res.user) return;
      setCurrentUser(res.user);
      setShowPublicShowcase(false);
      setActiveTab(defaultModule(res.user.role));
    } catch {
      // Conta demo indisponível
    }
  };
  const quickDemoLogin = demoMode ? handleSwitchRole : undefined;

  const handleOpenAuth = (mode: 'login' | 'register', preselectedRole: UserRole = UserRole.PSICOLOGO_TITULAR) => {
    setAuthModalMode(mode);
    setAuthPreselectedRole(preselectedRole);
    setAuthModalOpen(true);
  };

  const handleAuthenticated = (user: SafeUser) => {
    setCurrentUser(user);
    setShowPublicShowcase(false);
    setActiveTab(defaultModule(user.role));
  };

  /** Sessão recuperada após refresh: volta à última tela, se o perfil puder vê-la */
  const restoreAuthenticated = (user: SafeUser) => {
    setCurrentUser(user);
    setShowPublicShowcase(false);
    const lastTab = readLastTab();
    setActiveTab(lastTab && canViewModule(user.role, lastTab) ? lastTab : defaultModule(user.role));
  };

  // O token do lembrete fica só no estado: sai da URL (histórico e eventual compartilhamento da tela)
  useEffect(() => {
    if (!urlParam('consulta')) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('consulta');
    window.history.replaceState(null, '', url.toString());
  }, []);

  // Link de confirmação de e-mail (?verificar-email=<token>): confirma e tira o token da URL
  useEffect(() => {
    const token = urlParam('verificar-email');
    if (!token) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('verificar-email');
    window.history.replaceState(null, '', url.toString());
    api.verifyEmail(token)
      .then((verified) => {
        setCurrentUser((prev) => (prev.id === verified.id ? { ...prev, emailVerified: true } : prev));
        // A sessão pode ter sido restaurada antes da confirmação: recarrega o usuário logado
        if (hasStoredSession()) {
          api.getMe()
            .then((me) => setCurrentUser((prev) => (prev.id === me.id ? me : prev)))
            .catch(() => undefined);
        }
        setFlashNotice({ type: 'success', text: 'E-mail confirmado. Obrigado!' });
      })
      .catch((err: any) => setFlashNotice({ type: 'error', text: err.message || 'Não foi possível confirmar o e-mail.' }));
  }, []);

  // Lembra a tela aberta para voltar a ela depois de um refresh
  useEffect(() => {
    if (!showPublicShowcase) writeLastTab(activeTab);
  }, [activeTab, showPublicShowcase]);

  // Recupera a sessão salva ao abrir/recarregar a página (o cliente renova o token expirado)
  useEffect(() => {
    const openEntryAuth = () => {
      if (roomAppointmentId) handleOpenAuth('login', UserRole.PACIENTE);
      else if (urlParam('cadastro') === 'paciente') handleOpenAuth('register', UserRole.PACIENTE);
      else if (urlParam('entrar') !== null) handleOpenAuth('login');
    };
    if (!hasStoredSession()) {
      openEntryAuth();
      return;
    }
    api.getMe()
      .then(restoreAuthenticated)
      .catch(openEntryAuth)
      .finally(() => setRestoringSession(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeRoom = () => {
    setRoomAppointmentId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('sala');
    window.history.replaceState(null, '', url.toString());
  };

  const handleLogout = async () => {
    setRoleDropdownOpen(false);
    try {
      await api.logout();
    } catch {
      // ignore
    }
    setShowPublicShowcase(true);
  };

  // Navegação dinâmica: só aparecem os módulos permitidos ao perfil (RFC-001 §4.5)
  const isPatient = currentUser.role === UserRole.PACIENTE;
  const navModules = visibleModules(currentUser.role).filter(
    (module): module is Exclude<AppModule, 'security'> => module !== 'security'
  );
  const currentTab: AppModule = canViewModule(currentUser.role, activeTab) ? activeTab : defaultModule(currentUser.role);
  // Para o consultório a auditoria é o histórico de acessos da equipe; a trilha completa é do DPO
  const navItem = (module: Exclude<AppModule, 'security'>) =>
    module === 'audit' && currentUser.role !== UserRole.ADMIN
      ? { ...NAV_ITEMS.audit, label: 'Histórico de Acessos', shortLabel: 'Acessos' }
      : NAV_ITEMS[module];

  // Se estiver na Vitrine Pública Sem Login, exibe a página completa de apresentação da ferramenta
  if (appointmentLinkToken) {
    return <AppointmentLinkScreen token={appointmentLinkToken} onDone={() => setAppointmentLinkToken(null)} />;
  }

  if (passwordResetToken) {
    return (
      <PasswordResetScreen
        token={passwordResetToken}
        onDone={() => {
          // O token sai da URL (histórico e eventual compartilhamento da tela)
          const url = new URL(window.location.href);
          url.searchParams.delete('redefinir-senha');
          window.history.replaceState(null, '', url.toString());
          setPasswordResetToken(null);
          handleOpenAuth('login');
        }}
      />
    );
  }

  if (restoringSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 text-sm" role="status">
        Carregando sua sessão...
      </div>
    );
  }

  if (showPublicShowcase) {
    return (
      <PrivacyProvider>
        {publicView === 'directory' ? (
          <PublicDirectoryPage onBack={() => setPublicView('showcase')} onOpenAuth={handleOpenAuth} />
        ) : (
          <PublicShowcasePage
            onOpenAuth={handleOpenAuth}
            onQuickDemoLogin={quickDemoLogin}
            onOpenDirectory={() => setPublicView('directory')}
          />
        )}
        <AuthModal
          isOpen={authModalOpen}
          initialMode={authModalMode}
          preselectedRole={authPreselectedRole}
          onClose={() => setAuthModalOpen(false)}
          onAuthenticated={handleAuthenticated}
          onQuickDemoLogin={quickDemoLogin}
        />
        <FlashNoticeToast notice={flashNotice} onClose={() => setFlashNotice(null)} />
      </PrivacyProvider>
    );
  }

  // Senha inicial definida pelo Admin: nada além da troca até ela acontecer (o backend também bloqueia)
  if (currentUser.mustChangePassword) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl space-y-4">
          <div className="text-center space-y-1">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Bem-vindo(a), {currentUser.name}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Sua conta foi criada com uma senha inicial. Defina uma senha pessoal para continuar.
            </p>
          </div>
          <ChangePasswordCard onChanged={setCurrentUser} />
          <div className="text-center">
            <button onClick={handleLogout} className="text-xs text-slate-500 dark:text-slate-400 hover:underline">
              Sair
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PrivacyProvider>
      <div className="min-h-screen bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
        {/* Top Navbar */}
        <header className="border-b border-slate-200 bg-white/90 dark:border-slate-800 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-40 px-3 sm:px-6 py-2.5 sm:py-3.5 flex items-center justify-between transition-colors duration-200">
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Botão de Menu Mobile (Hambúrguer) */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 -ml-1 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl md:hidden transition-colors"
              aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            {/* Logo: volta à tela inicial do perfil */}
            <button
              type="button"
              onClick={() => {
                setActiveTab(defaultModule(currentUser.role));
                setMobileMenuOpen(false);
              }}
              className="flex items-center gap-2 sm:gap-3 text-left rounded-xl cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50"
              aria-label="Ir para a tela inicial"
              title="Tela inicial"
            >
              <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center font-bold text-slate-950 text-base sm:text-lg shadow-lg shadow-teal-500/20 shrink-0">
                Ψ
              </span>
              <span className="block">
                <span className="flex items-center gap-1.5 sm:gap-2">
                  <span className="font-bold text-slate-900 dark:text-white text-sm sm:text-base tracking-tight">TerapiaInFoco</span>
                  <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-widest px-1.5 sm:px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-700 dark:text-teal-400 border border-teal-500/20">
                    {isPatient ? 'Portal do Paciente' : currentUser.role === UserRole.ADMIN ? 'Painel DPO / Admin' : 'Painel Clínico'}
                  </span>
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">Gestão clínica e teleconsulta</span>
              </span>
            </button>
          </div>

          {/* Controles do Topo: tema, anti-shoulder surfing e menu da conta (perfil, vitrine, sair) */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 md:gap-3">
            <ThemeToggle />
            <PrivacyToggleButton />

            {/* Registro CRP se for psicólogo */}
            {currentUser.crp && (
              <div className="hidden md:flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>CRP {currentUser.crp}</span>
              </div>
            )}

            {/* Seletor de Perfil RBAC */}
            <div className="relative">
              <button
                onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
                className="flex items-center gap-2 border-l border-slate-200 dark:border-slate-800 pl-2 sm:pl-3 md:pl-4 py-1 hover:opacity-80 transition-opacity text-left"
              >
                <div className="w-8 h-8 rounded-full bg-teal-100 border border-teal-200 dark:bg-slate-800 dark:border-slate-700 flex items-center justify-center text-xs font-bold text-teal-800 dark:text-teal-300 shrink-0">
                  {currentUser.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="hidden sm:block">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{currentUser.name}</p>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400">
                      {ROLE_LABELS[currentUser.role]}
                    </span>
                    <ChevronDown className="w-3 h-3 text-slate-400" />
                  </div>
                </div>
              </button>

              {/* Dropdown de Papéis RBAC & Gestão de Conta */}
              {roleDropdownOpen && (
                <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-2 z-50 animate-fade-in space-y-1">
                  {demoMode && (
                  <>
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800">
                    Alternar Perfil (Paciente, Psicólogo, Admin)
                  </div>

                  {Object.entries(DEMO_USERS).map(([roleKey, data]) => {
                    const isSelected = currentUser.role === roleKey;
                    return (
                      <button
                        key={roleKey}
                        onClick={() => handleSwitchRole(roleKey as UserRole)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors text-left ${
                          isSelected
                            ? 'bg-teal-50 text-teal-900 font-bold dark:bg-teal-950/50 dark:text-teal-300'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div>
                          <p className="font-semibold">{data.name}</p>
                          <p className="text-[10px] text-slate-400">{data.roleName}</p>
                        </div>
                        {isSelected && <UserCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" />}
                      </button>
                    );
                  })}
                  </>
                  )}

                  <div className="pt-1 border-t border-slate-100 dark:border-slate-800 space-y-1">
                    <button
                      onClick={() => {
                        setRoleDropdownOpen(false);
                        setProfileModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <User className="w-3.5 h-3.5 text-teal-500" />
                      <span>Meu Perfil</span>
                    </button>

                    <button
                      onClick={() => {
                        setRoleDropdownOpen(false);
                        setShowPublicShowcase(true);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Eye className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Ver Vitrine Pública (Sem Login)</span>
                    </button>

                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sair da Conta (Logout)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Banner de Modo Anti-Shoulder Surfing */}
        <PrivacyBanner />

        {/* Mobile Drawer (Menu Lateral Deslizante para Mobile) */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 md:hidden animate-fade-in"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        <aside
          className={`fixed top-0 bottom-0 left-0 w-72 max-w-[85vw] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-4 flex flex-col justify-between z-50 md:hidden shadow-2xl transition-transform duration-300 ease-in-out ${
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center font-bold text-slate-950 text-base">
                  Ψ
                </div>
                <div>
                  <span className="font-bold text-slate-900 dark:text-white text-sm">TerapiaInFoco</span>
                  <p className="text-[10px] text-slate-400">Navegação Clínica</p>
                </div>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Fechar menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1">
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Módulos
              </div>

              {[...navModules, 'security' as const].map((module) => {
                const item = module === 'security'
                  ? { label: 'Segurança & 2FA', icon: KeyRound, iconClass: 'text-emerald-600 dark:text-emerald-400' }
                  : navItem(module);
                const Icon = item.icon;
                return (
                  <button
                    key={module}
                    onClick={() => { setActiveTab(module); setMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      currentTab === module ? NAV_ITEM_ACTIVE : NAV_ITEM_IDLE
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${item.iconClass}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Main Layout */}
        <div className="flex flex-1">
          {/* Sidebar Nav (Desktop) */}
          <aside className="hidden md:flex w-64 border-r border-slate-200 bg-white/70 dark:border-slate-800/80 dark:bg-slate-900/40 p-4 flex-col gap-1 shrink-0 transition-colors duration-200">
            <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Módulos
            </div>

            {navModules.map((module) => {
              const { label, icon: Icon, iconClass } = navItem(module);
              return (
                <button
                  key={module}
                  onClick={() => setActiveTab(module)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    currentTab === module ? NAV_ITEM_ACTIVE : NAV_ITEM_IDLE
                  }`}
                >
                  <Icon className={`w-4 h-4 ${iconClass}`} />
                  <span>{label}</span>
                </button>
              );
            })}

            <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-800/80 space-y-1">
              <button
                onClick={() => setActiveTab('security')}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  currentTab === 'security'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-sm dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <KeyRound className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Segurança & 2FA</span>
                </div>
                {currentUser.twoFactorEnabled ? (
                  <span className="w-2 h-2 rounded-full bg-emerald-500" title="2FA ativo"></span>
                ) : (
                  <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">Ativar 2FA</span>
                )}
              </button>
            </div>
          </aside>

          {/* Workspace Body */}
          <main className="flex-1 p-3.5 sm:p-6 lg:p-8 pb-20 md:pb-8 overflow-y-auto overflow-x-hidden">
            <div className="max-w-5xl mx-auto">
              {currentUser.emailVerified === false && <EmailVerificationBanner email={currentUser.email} />}
              <FlashNoticeToast notice={flashNotice} onClose={() => setFlashNotice(null)} />
              <>
                  {currentTab === 'portal' && (
                    <PatientHomeModule
                      currentUser={currentUser}
                      onOpenPortal={() => setPatientPortalModalOpen(true)}
                      onOpenPortabilityVault={() => setPortabilityVaultModalOpen(true)}
                      onOpenProfile={() => setProfileModalOpen(true)}
                      onFindTherapist={() => setActiveTab('directory')}
                      onJoinRoom={setRoomAppointmentId}
                    />
                  )}
                  {currentTab === 'directory' && (
                    <div className="space-y-4">
                      <h1 className="text-xl font-bold text-slate-900 dark:text-white">Encontre um psicólogo</h1>
                      <TherapistDirectory
                        renderBooking={(profile) => (
                          <BookingPanel
                            profile={profile}
                            onBooked={() => {
                              // O primeiro agendamento cria o prontuário vinculado à conta (patientId)
                              api.getMe().then(setCurrentUser).catch(() => {});
                            }}
                          />
                        )}
                      />
                    </div>
                  )}
                  {currentTab === 'publicProfile' && <TherapistProfileEditor />}
                  {currentTab === 'crpVerification' && <CrpVerificationModule />}
                  {currentTab === 'team' && <TeamModule />}
                  {currentTab === 'leads' && <LeadsModule />}
                  {currentTab === 'dashboard' && <DashboardModule />}
                  {currentTab === 'agenda' && (
                    <AgendaModule
                      role={currentUser.role}
                      onOpenSoap={(appointmentId) => {
                        setSoapAppointmentId(appointmentId);
                        setActiveTab('soap');
                      }}
                    />
                  )}
                  {currentTab === 'patients' && <PatientsModule role={currentUser.role} />}
                  {currentTab === 'soap' && <SoapModule appointmentId={soapAppointmentId} onAppointmentChange={setSoapAppointmentId} signer={{ name: currentUser.name, crp: currentUser.crp }} />}
                  {currentTab === 'documents' && <DocumentsModule />}
                  {currentTab === 'audit' && <AuditModule isDpo={currentUser.role === UserRole.ADMIN} />}
                  {currentTab === 'security' && (
                    <SecurityModule
                      currentUser={currentUser}
                      onUserUpdated={setCurrentUser}
                      onSwitchRole={quickDemoLogin}
                    />
                  )}
                  {currentTab === 'backups' && (
                    <BackupModule currentUser={currentUser} />
                  )}
                  {currentTab === 'observability' && <ObservabilityModule />}
              </>
            </div>
          </main>
        </div>

        {/* Só paciente e quem atende entram na sala; recepção e admin não têm papel na chamada */}
        {roomAppointmentId && TELECONSULTATION_ROLES.includes(currentUser.role) && (
          <TeleconsultationRoom
            appointmentId={roomAppointmentId}
            role={currentUser.role === UserRole.PACIENTE ? 'PATIENT' : 'THERAPIST'}
            onClose={closeRoom}
          />
        )}

        {/* Modais Globais: Auth, Meu Perfil, Portal do Paciente e Cofre de Portabilidade .enc */}
        <AuthModal
          isOpen={authModalOpen}
          initialMode={authModalMode}
          preselectedRole={authPreselectedRole}
          onClose={() => setAuthModalOpen(false)}
          onAuthenticated={handleAuthenticated}
          onQuickDemoLogin={quickDemoLogin}
        />

        <UserProfileModal
          isOpen={profileModalOpen}
          user={currentUser}
          onClose={() => setProfileModalOpen(false)}
          onProfileUpdated={updated => setCurrentUser(updated)}
          onOpenPatientPortal={() => setPatientPortalModalOpen(true)}
          onOpenPortabilityVault={() => setPortabilityVaultModalOpen(true)}
          socialLoginEnabled={demoMode}
        />

        <PatientPortalModal
          isOpen={patientPortalModalOpen}
          onClose={() => setPatientPortalModalOpen(false)}
          initialPatientId={currentUser.patientId || ''}
        />

        <PortabilityVaultModal
          isOpen={portabilityVaultModalOpen}
          onClose={() => setPortabilityVaultModalOpen(false)}
          patientId={currentUser.patientId || ''}
          patientName={currentUser.name}
        />

        {/* Mobile Bottom Navigation Bar */}
        <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-2 py-1.5 flex items-center justify-around md:hidden shadow-lg">
          {navModules.slice(0, 3).map((module) => {
            const { shortLabel, icon: Icon } = navItem(module);
            return (
              <button
                key={module}
                onClick={() => setActiveTab(module)}
                className={`flex flex-col items-center py-1 px-2 rounded-xl text-[10px] font-semibold transition-colors cursor-pointer ${
                  currentTab === module
                    ? 'text-teal-600 dark:text-teal-400 font-bold'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon className="w-5 h-5 mb-0.5" />
                <span>{shortLabel}</span>
              </button>
            );
          })}

          <button
            onClick={() => setProfileModalOpen(true)}
            className="flex flex-col items-center py-1 px-2 rounded-xl text-[10px] font-semibold text-teal-600 dark:text-teal-400 cursor-pointer"
          >
            <User className="w-5 h-5 mb-0.5" />
            <span>Perfil</span>
          </button>

          <button
            onClick={() => setMobileMenuOpen(true)}
            className="flex flex-col items-center py-1 px-2 rounded-xl text-[10px] font-semibold text-slate-500 dark:text-slate-400 hover:text-teal-600 transition-colors cursor-pointer"
          >
            <Menu className="w-5 h-5 mb-0.5" />
            <span>Mais</span>
          </button>
        </nav>
      </div>
    </PrivacyProvider>
  );
}
