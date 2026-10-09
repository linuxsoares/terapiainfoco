import { useState } from 'react';
import { 
  Calendar, 
  Users, 
  Sparkles, 
  FileText,
  ShieldCheck, 
  Lock,
  Activity,
  HeartHandshake
} from 'lucide-react';
import { AgendaModule } from './components/AgendaModule';
import { PatientsModule } from './components/PatientsModule';
import { SoapModule } from './components/SoapModule';
import { DocumentsModule } from './components/DocumentsModule';
import { AuditModule } from './components/AuditModule';
import { ThemeToggle } from './components/ThemeToggle';

export default function App() {
  const [activeTab, setActiveTab] = useState<'agenda' | 'patients' | 'soap' | 'documents' | 'audit' | 'security'>('agenda');

  return (
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

        {/* Controles do Topo: Tema, e-Psi e Perfil */}
        <div className="flex items-center gap-3 md:gap-4">
          <ThemeToggle />

          <div className="hidden sm:flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full text-xs text-emerald-700 dark:text-emerald-400 font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>e-Psi Ativo • CRP 06/142980</span>
          </div>

          <div className="flex items-center gap-2 border-l border-slate-200 dark:border-slate-800 pl-3 md:pl-4">
            <div className="w-8 h-8 rounded-full bg-teal-100 border border-teal-200 dark:bg-slate-800 dark:border-slate-700 flex items-center justify-center text-xs font-semibold text-teal-800 dark:text-teal-300">
              VA
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Dra. Vanessa Andrade</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Psicóloga Clínica (TCC)</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex flex-1">
        {/* Sidebar Nav */}
        <aside className="w-64 border-r border-slate-200 bg-white/70 dark:border-slate-800/80 dark:bg-slate-900/40 p-4 flex flex-col gap-1 shrink-0 transition-colors duration-200">
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Módulos RFC-001
          </div>

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
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'soap'
                ? 'bg-teal-50 text-teal-800 border border-teal-200 shadow-sm dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/50'
            }`}
          >
            <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span>3 & 4. SOAP & Prontuário</span>
          </button>

          <button
            onClick={() => setActiveTab('documents')}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'documents'
                ? 'bg-teal-50 text-teal-800 border border-teal-200 shadow-sm dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/50'
            }`}
          >
            <FileText className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <span>5. Documentos CFP</span>
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'audit'
                ? 'bg-teal-50 text-teal-800 border border-teal-200 shadow-sm dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/50'
            }`}
          >
            <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Trilha WORM (Audit)</span>
          </button>

          <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-800/80">
            <button
              onClick={() => setActiveTab('security')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'security'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-sm dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/50'
              }`}
            >
              <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Segurança & LGPD</span>
            </button>
          </div>
        </aside>

        {/* Workspace Body */}
        <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-5xl mx-auto">
            {activeTab === 'agenda' && <AgendaModule />}
            {activeTab === 'patients' && <PatientsModule />}
            {activeTab === 'soap' && <SoapModule />}
            {activeTab === 'documents' && <DocumentsModule />}
            {activeTab === 'audit' && <AuditModule />}

            {activeTab === 'security' && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                    <Lock className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                    Arquitetura de Segurança Zero-Trust & LGPD
                  </h1>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    Proteção de dados sensíveis de saúde conforme Resolução CFP nº 001/2009 e LGPD Art. 11 (RFC §4)
                  </p>
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                  <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none space-y-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                      1
                    </div>
                    <h3 className="font-semibold text-slate-900 dark:text-slate-200">Envelope Encryption</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Chave mestre (KEK) em Hardware Security Module (KMS). Cada paciente possui sua Data Encryption Key (DEK) isolada descartada da RAM após a requisição.
                    </p>
                  </div>

                  <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none space-y-2">
                    <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center font-bold">
                      2
                    </div>
                    <h3 className="font-semibold text-slate-900 dark:text-slate-200">Blind Indexing (HMAC)</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Busca indexada de CPF e e-mail sem expor os dados em texto claro no banco relacional PostgreSQL.
                    </p>
                  </div>

                  <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none space-y-2">
                    <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold">
                      3
                    </div>
                    <h3 className="font-semibold text-slate-900 dark:text-slate-200">Quarentena LGPD vs CFP</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Anonimização de dados ativos com retenção criptografada do prontuário por 5 anos (Resolução CFP nº 001/2009).
                    </p>
                  </div>
                </div>

                <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                    <HeartHandshake className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Deontologia & Código de Ética Profissional (Art. 9º)</h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      O sistema atua como operador estritamente seguro. Nem mesmo administradores de banco de dados ou operadores de nuvem conseguem ler notas de evolução, hipóteses diagnósticas ou transcrições de sessões sem as chaves dos profissionais.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
