import React, { useState } from 'react';
import { 
  Calendar, 
  Video, 
  Sparkles, 
  FileText, 
  Award, 
  ShieldCheck, 
  Lock,
  ChevronRight,
  Clock,
  CheckCircle2
} from 'lucide-react';
import { AppointmentStatus } from '@terapiainfoco/shared';

export default function App() {
  const [activeTab, setActiveTab] = useState<'agenda' | 'meet' | 'soap' | 'records' | 'docs' | 'security'>('agenda');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center font-bold text-slate-950 text-lg shadow-lg shadow-teal-500/20">
            Ψ
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-base tracking-tight">TerapiaInFoco</span>
              <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20">
                Painel Clínico
              </span>
            </div>
            <p className="text-xs text-slate-400">Plataforma de Gestão Clínica • RFC-001</p>
          </div>
        </div>

        {/* Psicólogo logado & CRP status */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full text-xs text-emerald-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>e-Psi Ativo • CRP 06/142980</span>
          </div>

          <div className="flex items-center gap-2 border-l border-slate-800 pl-4">
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-semibold text-teal-300">
              VA
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-xs font-medium text-slate-200">Dra. Vanessa Andrade</p>
              <p className="text-[10px] text-slate-500">Psicóloga Clínica (TCC)</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex flex-1">
        {/* Sidebar Nav */}
        <aside className="w-64 border-r border-slate-800/80 bg-slate-900/40 p-4 flex flex-col gap-1 shrink-0">
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Módulos RFC-001
          </div>

          <button
            onClick={() => setActiveTab('agenda')}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'agenda'
                ? 'bg-teal-500/15 text-teal-300 border border-teal-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Calendar className="w-4 h-4 text-teal-400" />
            <span>1. Agenda & Sessões</span>
          </button>

          <button
            onClick={() => setActiveTab('meet')}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'meet'
                ? 'bg-teal-500/15 text-teal-300 border border-teal-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Video className="w-4 h-4 text-sky-400" />
            <span>2. Google Meet</span>
          </button>

          <button
            onClick={() => setActiveTab('soap')}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'soap'
                ? 'bg-teal-500/15 text-teal-300 border border-teal-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>3. Transcrição & SOAP</span>
          </button>

          <button
            onClick={() => setActiveTab('records')}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'records'
                ? 'bg-teal-500/15 text-teal-300 border border-teal-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <FileText className="w-4 h-4 text-amber-400" />
            <span>4. Prontuário Imutável</span>
          </button>

          <button
            onClick={() => setActiveTab('docs')}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'docs'
                ? 'bg-teal-500/15 text-teal-300 border border-teal-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Award className="w-4 h-4 text-emerald-400" />
            <span>5. Documentos CFP</span>
          </button>

          <div className="pt-4 mt-4 border-t border-slate-800/80">
            <button
              onClick={() => setActiveTab('security')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'security'
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Lock className="w-4 h-4 text-emerald-400" />
              <span>Segurança & LGPD</span>
            </button>
          </div>
        </aside>

        {/* Workspace Body */}
        <main className="flex-1 p-8 overflow-y-auto">
          {activeTab === 'agenda' && (
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-white">Módulo 1: Agenda & Gestão de Consultas</h1>
                  <p className="text-sm text-slate-400 mt-1">
                    Grade clínica, buffers entre sessões e controle de status de atendimento (RFC §3.1)
                  </p>
                </div>
                <div className="flex gap-2">
                  <span className="px-3 py-1 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20 text-xs font-medium flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" /> Buffer: 10 min
                  </span>
                </div>
              </div>

              {/* Status Flow pill representation */}
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800/80">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  Ciclo de Vida da Sessão (§3.1)
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {Object.values(AppointmentStatus).map((status, idx) => (
                    <React.Fragment key={status}>
                      <span className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium ${
                        status === AppointmentStatus.CONFIRMADA
                          ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}>
                        {status}
                      </span>
                      {idx < 3 && <ChevronRight className="w-3.5 h-3.5 text-slate-600" />}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {/* Próximas consultas mock */}
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Consultas do Dia</h2>
                <div className="grid gap-3">
                  <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between hover:border-slate-700 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 flex flex-col items-center justify-center text-teal-300">
                        <span className="text-xs font-bold">14:00</span>
                        <span className="text-[10px] text-teal-400/80">50m</span>
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-100 flex items-center gap-2">
                          Mariana S. (32 anos)
                          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Consentimento Ativo
                          </span>
                        </h3>
                        <p className="text-xs text-slate-400">Sessão #8 • TCC • Ansiedade Corporativa</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400 font-mono bg-slate-800/80 px-2.5 py-1 rounded-lg">
                        Meet: meet.google.com/abc-defg-hij
                      </span>
                      <button className="px-3.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-medium transition-colors">
                        Iniciar Sessão
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="max-w-5xl mx-auto space-y-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">Arquitetura de Segurança & Criptografia LGPD</h1>
                <p className="text-sm text-slate-400 mt-1">
                  Proteção Zero-Trust com Envelope Encryption (AES-256-GCM + KMS) e Blind Indexing (§4)
                </p>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold">
                    1
                  </div>
                  <h3 className="font-semibold text-slate-200">Envelope Encryption</h3>
                  <p className="text-xs text-slate-400">
                    Chave mestre (KEK) em Hardware Security Module (KMS). Cada paciente possui sua Data Encryption Key (DEK) isolada.
                  </p>
                </div>

                <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                  <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center font-bold">
                    2
                  </div>
                  <h3 className="font-semibold text-slate-200">Blind Indexing (HMAC)</h3>
                  <p className="text-xs text-slate-400">
                    Busca indexada de CPF e e-mail sem expor os dados em texto claro no banco relacional.
                  </p>
                </div>

                <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                  <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center font-bold">
                    3
                  </div>
                  <h3 className="font-semibold text-slate-200">Quarentena LGPD vs CFP</h3>
                  <p className="text-xs text-slate-400">
                    Anonimização de dados ativos com retenção criptografada do prontuário por 5 anos (Resolução CFP nº 001/2009).
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab !== 'agenda' && activeTab !== 'security' && (
            <div className="max-w-4xl mx-auto py-12 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-teal-500/10 text-teal-400 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-white capitalize">Módulo {activeTab}</h2>
              <p className="text-sm text-slate-400 max-w-md mx-auto">
                Estrutura pronta para conexão com os contratos de tipo da RFC-001 definidos em <code className="text-teal-300">@terapiainfoco/shared</code>.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
