import { useState, useEffect } from 'react';
import { 
  Calendar, 
  Users, 
  Sparkles, 
  FileText,
  ShieldCheck, 
  Lock,
  Activity,
  KeyRound,
  ShieldAlert,
  ChevronDown,
  UserCheck,
  BarChart3,
  Database
} from 'lucide-react';
import { DashboardModule } from './components/DashboardModule';
import { AgendaModule } from './components/AgendaModule';
import { PatientsModule } from './components/PatientsModule';
import { SoapModule } from './components/SoapModule';
import { DocumentsModule } from './components/DocumentsModule';
import { AuditModule } from './components/AuditModule';
import { SecurityModule } from './components/SecurityModule';
import { BackupModule } from './components/BackupModule';
import { ThemeToggle } from './components/ThemeToggle';
import { PrivacyProvider } from './contexts/PrivacyContext';
import { PrivacyBanner, PrivacyToggleButton } from './components/PrivacyBanner';
import { api } from './services/api';
import type { SafeUser } from '@terapiainfoco/shared';

import { UserRole } from '@terapiainfoco/shared';

const DEMO_USERS: Record<UserRole, { email: string; name: string; crp?: string; roleName: string }> = {
  [UserRole.PSICOLOGO_TITULAR]: {
    email: 'psicologo@terapiainfoco.com.br',
    name: 'Dra. Beatriz Santos',
    crp: '06/142980',
    roleName: 'Psicóloga Titular'
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
  },
  [UserRole.ADMIN]: {
    email: 'admin@terapiainfoco.com.br',
    name: 'Administrador do Sistema',
    roleName: 'Admin TI & DPO'
  }
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'agenda' | 'patients' | 'soap' | 'documents' | 'audit' | 'security' | 'backups'>('dashboard');

  // Usuário autenticado
  const [currentUser, setCurrentUser] = useState<SafeUser>({
    id: '00000000-0000-0000-0000-000000000001',
    email: 'psicologo@terapiainfoco.com.br',
    name: 'Dra. Beatriz Santos',
    role: UserRole.PSICOLOGO_TITULAR,
    crp: '06/142980',
    crpRegion: 'SP',
    therapistId: 'therapist-001',
    twoFactorEnabled: false,
    createdAt: new Date().toISOString()
  });

  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);

  // Inicializa login silencioso com token JWT real do psicólogo padrão
  useEffect(() => {
    api.login('psicologo@terapiainfoco.com.br', 'Senha@123456')
      .then(res => {
        if (res.user) setCurrentUser(res.user);
      })
      .catch(() => {
        // Fallback local se backend offline
      });
  }, []);

  const handleSwitchRole = async (role: UserRole) => {
    const demo = DEMO_USERS[role];
    try {
      const res = await api.login(demo.email, 'Senha@123456');
      if (res.user) {
        setCurrentUser(res.user);
      } else {
        setCurrentUser(prev => ({
          ...prev,
          role,
          name: demo.name,
          email: demo.email,
          crp: demo.crp
        }));
      }
    } catch {
      setCurrentUser(prev => ({
        ...prev,
        role,
        name: demo.name,
        email: demo.email,
        crp: demo.crp
      }));
    } finally {
      setRoleDropdownOpen(false);
    }
  };

  // Verificações RBAC para a UI
  const isSecretary = currentUser.role === UserRole.RECEPCAO_SECRETARIA;
  const isBlockedClinicalTab = isSecretary && (activeTab === 'soap' || activeTab === 'documents' || activeTab === 'audit' || activeTab === 'dashboard' || activeTab === 'backups');

  return (
    <PrivacyProvider>
      <div className="min-h-screen bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
        {/* Top Navbar */}
        <header className="border-b border-slate-200 bg-white/90 dark:border-slate-800 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-50 px-6 py-3.5 flex items-center justify-between transition-colors duration-200">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center font-bold text-slate-950 text-lg shadow-lg shadow-teal-500/20">
              Ψ
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 dark:text-white text-base tracking-tight">TerapiaInFoco</span>
                <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-700 dark:text-teal-400 border border-teal-500/20">
                  Painel Clínico
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Plataforma de Gestão Clínica • RFC-001</p>
            </div>
          </div>

          {/* Controles do Topo: Tema, Anti-Shoulder Surfing, e-Psi, Status 2FA e Seletor de Perfil RBAC */}
          <div className="flex items-center gap-3 md:gap-4">
            <ThemeToggle />
            <PrivacyToggleButton />

          {/* Indicador de 2FA */}
          <button
            onClick={() => setActiveTab('security')}
            className={`hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
              currentUser.twoFactorEnabled
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700'
                : 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700 hover:scale-105'
            }`}
            title="Clique para gerenciar 2FA"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>{currentUser.twoFactorEnabled ? '2FA Ativo 🔒' : 'Ativar 2FA'}</span>
          </button>

          {/* Registro CRP se for psicólogo */}
          {currentUser.crp && (
            <div className="hidden sm:flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full text-xs text-emerald-700 dark:text-emerald-400 font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>CRP {currentUser.crp}</span>
            </div>
          )}

          {/* Seletor de Perfil RBAC */}
          <div className="relative">
            <button
              onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
              className="flex items-center gap-2.5 border-l border-slate-200 dark:border-slate-800 pl-3 md:pl-4 py-1 hover:opacity-80 transition-opacity text-left"
            >
              <div className="w-8 h-8 rounded-full bg-teal-100 border border-teal-200 dark:bg-slate-800 dark:border-slate-700 flex items-center justify-center text-xs font-bold text-teal-800 dark:text-teal-300">
                {currentUser.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="hidden sm:block">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{currentUser.name}</p>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400">
                    {DEMO_USERS[currentUser.role]?.roleName || currentUser.role}
                  </span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </div>
              </div>
            </button>

            {/* Dropdown de Papéis RBAC */}
            {roleDropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-2 z-50 animate-fade-in space-y-1">
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800">
                  Alternar Perfil (Simulador RBAC)
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

                <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => {
                      setRoleDropdownOpen(false);
                      setActiveTab('security');
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-teal-500" />
                    <span>Configurações de Segurança & 2FA</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Banner de Modo Anti-Shoulder Surfing */}
      <PrivacyBanner />

      {/* Main Layout */}
      <div className="flex flex-1">
        {/* Sidebar Nav */}
        <aside className="w-64 border-r border-slate-200 bg-white/70 dark:border-slate-800/80 dark:bg-slate-900/40 p-4 flex flex-col gap-1 shrink-0 transition-colors duration-200">
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Módulos RFC-001
          </div>

          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'dashboard'
                ? 'bg-teal-50 text-teal-800 border border-teal-200 shadow-sm dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/50'
            }`}
          >
            <div className="flex items-center gap-3">
              <BarChart3 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span>0. Dashboard & Métricas</span>
            </div>
            {isSecretary && (
              <span title="Restrito a Psicólogos e Admin">
                <Lock className="w-3.5 h-3.5 text-rose-500" />
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('agenda')}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'agenda'
                ? 'bg-teal-50 text-teal-800 border border-teal-200 shadow-sm dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/50'
            }`}
          >
            <Calendar className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <span>1. Agenda & Meet</span>
          </button>

          <button
            onClick={() => setActiveTab('patients')}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'patients'
                ? 'bg-teal-50 text-teal-800 border border-teal-200 shadow-sm dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/50'
            }`}
          >
            <Users className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            <span>2. Pacientes & FLE</span>
          </button>

          <button
            onClick={() => setActiveTab('soap')}
            className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'soap'
                ? 'bg-teal-50 text-teal-800 border border-teal-200 shadow-sm dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/50'
            }`}
          >
            <div className="flex items-center gap-3">
              <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span>3 & 4. SOAP & IA</span>
            </div>
            {isSecretary && (
              <span title="Restrito a Psicólogos">
                <Lock className="w-3.5 h-3.5 text-rose-500" />
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('documents')}
            className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'documents'
                ? 'bg-teal-50 text-teal-800 border border-teal-200 shadow-sm dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/50'
            }`}
          >
            <div className="flex items-center gap-3">
              <FileText className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span>5. Documentos CFP</span>
            </div>
            {isSecretary && (
              <span title="Restrito a Psicólogos">
                <Lock className="w-3.5 h-3.5 text-rose-500" />
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'audit'
                ? 'bg-teal-50 text-teal-800 border border-teal-200 shadow-sm dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/50'
            }`}
          >
            <div className="flex items-center gap-3">
              <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Trilha WORM (Audit)</span>
            </div>
            {isSecretary && (
              <span title="Restrito a Psicólogos e Admin">
                <Lock className="w-3.5 h-3.5 text-rose-500" />
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('backups')}
            className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'backups'
                ? 'bg-teal-50 text-teal-800 border border-teal-200 shadow-sm dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/50'
            }`}
          >
            <div className="flex items-center gap-3">
              <Database className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span>Backups & DR (KMS)</span>
            </div>
            {isSecretary && (
              <span title="Restrito a Psicólogos e Admin">
                <Lock className="w-3.5 h-3.5 text-rose-500" />
              </span>
            )}
          </button>


          <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-800/80">
            <button
              onClick={() => setActiveTab('security')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'security'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-sm dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <KeyRound className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Segurança & 2FA</span>
              </div>
              {currentUser.twoFactorEnabled && (
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              )}
            </button>
          </div>
        </aside>

        {/* Workspace Body */}
        <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-5xl mx-auto">
            {/* Bloqueio Amigável de Autorização RBAC para Recepção / Secretária */}
            {isBlockedClinicalTab ? (
              <div className="max-w-xl mx-auto my-12 bg-white dark:bg-slate-900 rounded-3xl p-8 border border-rose-200 dark:border-rose-900/60 shadow-xl text-center space-y-4 animate-fade-in">
                <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto border border-rose-200 dark:border-rose-800">
                  <ShieldAlert className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  Acesso Restrito pelo CFP nº 001/2009 e LGPD Art. 11
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Prontuários eletrônicos, anotações de evolução SOAP, transcrições de áudio e laudos psicológicos são
                  de acesso <strong>estritamente sigiloso e exclusivo do psicólogo responsável e supervisores clínicos</strong>.
                </p>
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                  Perfil atual: <strong className="text-slate-800 dark:text-slate-200">Recepção / Secretária</strong> (Acesso permitido: Agenda, Agendamento e Contato).
                </div>
                <button
                  onClick={() => handleSwitchRole(UserRole.PSICOLOGO_TITULAR)}
                  className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs shadow-md transition-all active:scale-95"
                >
                  Alternar para Perfil de Psicólogo Titular
                </button>
              </div>
            ) : (
              <>
                {activeTab === 'dashboard' && <DashboardModule />}
                {activeTab === 'agenda' && <AgendaModule />}
                {activeTab === 'patients' && <PatientsModule />}
                {activeTab === 'soap' && <SoapModule />}
                {activeTab === 'documents' && <DocumentsModule />}
                {activeTab === 'audit' && <AuditModule />}
                {activeTab === 'security' && (
                  <SecurityModule
                    currentUser={currentUser}
                    onUserUpdated={setCurrentUser}
                    onSwitchRole={handleSwitchRole}
                  />
                )}
                {activeTab === 'backups' && (
                  <BackupModule currentUser={currentUser} />
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  </PrivacyProvider>
  );
}
