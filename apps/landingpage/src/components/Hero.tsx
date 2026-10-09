import React, { useState } from 'react';
import {
  ShieldCheck,
  Video,
  FileCheck2,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Lock
} from 'lucide-react';

interface HeroProps {
  onOpenDemo: () => void;
  onExploreSimulator: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onOpenDemo, onExploreSimulator }) => {
  const [signedState, setSignedState] = useState(false);

  return (
    <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 overflow-hidden bg-gradient-to-b from-teal-50/40 via-white to-slate-50/50">
      {/* Subtle Background Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[450px] bg-gradient-to-tr from-teal-200/30 via-emerald-100/20 to-indigo-100/30 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute top-10 right-10 w-72 h-72 bg-teal-300/10 rounded-full blur-2xl pointer-events-none -z-10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          
          {/* Left Column: Value Proposition & Copy */}
          <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
            
            {/* Top compliance badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-teal-100/70 border border-teal-200 text-teal-900 text-xs font-semibold shadow-xs">
              <ShieldCheck className="w-4 h-4 text-teal-600" />
              <span>Conforme Resoluções CFP nº 011/2018 & 001/2009 • LGPD Art. 11</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-950 leading-[1.12]">
              Mais presença com seu paciente.{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-700 via-teal-600 to-emerald-500">
                Zero noites perdidas
              </span>{' '}
              com prontuários manuais.
            </h1>

            {/* Subtitle */}
            <p className="text-lg sm:text-xl text-slate-600 font-normal leading-relaxed max-w-2xl mx-auto lg:mx-0">
              A primeira plataforma de telepsicologia do Brasil com{' '}
              <strong className="text-slate-900 font-semibold">Google Meet nativo</strong>,{' '}
              <strong className="text-slate-900 font-semibold">transcrição com diarização clínica</strong>,{' '}
              geração assistida de notas <strong className="text-teal-700 font-semibold">SOAP</strong> e{' '}
              <strong className="text-slate-900 font-semibold">Criptografia de Envelope (AES-256-GCM)</strong> em total consonância com as normas éticas do CFP.
            </p>

            {/* Quick Proof Badges */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-y-2 gap-x-5 text-xs text-slate-600 pt-1 font-medium">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-teal-600" />
                <span>Human-in-the-Loop Obrigatório</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-teal-600" />
                <span>Zero Data Retention em IA</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-teal-600" />
                <span>Assinatura Digital ICP-Brasil</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
              <button
                onClick={onOpenDemo}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-base shadow-lg shadow-teal-600/25 hover:shadow-teal-600/35 transition-all duration-200 active:scale-98 group cursor-pointer"
              >
                <span>Solicitar Demonstração Gratuita</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </button>

              <button
                onClick={onExploreSimulator}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 font-semibold text-base border border-slate-200 shadow-xs hover:border-slate-300 transition-all duration-200 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-teal-600" />
                <span>Testar Simulador de IA</span>
              </button>
            </div>

            {/* Social proof mini-strip */}
            <div className="pt-4 flex items-center justify-center lg:justify-start gap-6 border-t border-slate-200/70">
              <div>
                <p className="text-2xl font-bold text-slate-900 tracking-tight">-45%</p>
                <p className="text-xs text-slate-500 font-medium">Faltas (No-Show)</p>
              </div>
              <div className="w-px h-8 bg-slate-200" />
              <div>
                <p className="text-2xl font-bold text-teal-700 tracking-tight">85 min</p>
                <p className="text-xs text-slate-500 font-medium">Economizados por dia</p>
              </div>
              <div className="w-px h-8 bg-slate-200" />
              <div>
                <p className="text-2xl font-bold text-slate-900 tracking-tight">5 Anos</p>
                <p className="text-xs text-slate-500 font-medium">Guarda Legal CFP</p>
              </div>
            </div>

          </div>

          {/* Right Column: Interactive Clinical Session Live Card */}
          <div className="lg:col-span-5 relative">
            
            {/* Ambient card aura */}
            <div className="absolute -inset-1.5 bg-gradient-to-r from-teal-500/20 to-indigo-500/20 rounded-3xl blur-xl opacity-75" />

            {/* Main Interactive Card */}
            <div className="relative bg-white border border-slate-200/90 rounded-2xl shadow-2xl p-5 sm:p-6 space-y-4">
              
              {/* Header of the Session Card */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <img
                      src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80"
                      alt="Paciente Mariana S."
                      className="w-10 h-10 rounded-full object-cover ring-2 ring-teal-500/30"
                    />
                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></span>
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Mariana S. • Sessão #08</h2>
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <Video className="w-3 h-3 text-teal-600" />
                      Google Meet (Encerrada às 14:50)
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Áudio Diarizado
                  </span>
                  <p className="text-[10px] text-slate-400 mt-0.5">Consentimento OK</p>
                </div>
              </div>

              {/* Diarization Snippet preview */}
              <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-100 space-y-2 text-xs">
                <div className="flex items-start gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-teal-100 text-teal-800 font-bold text-[10px] shrink-0">
                    TERAPEUTA
                  </span>
                  <p className="text-slate-600 text-[11px]">
                    "Como você tem modulado a respiração diafragmática nas reuniões?"
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold text-[10px] shrink-0">
                    PACIENTE
                  </span>
                  <p className="text-slate-600 text-[11px]">
                    "Consegui pausar por 3 minutos antes da apresentação. A taquicardia baixou e não travei..."
                  </p>
                </div>
              </div>

              {/* AI Auto-Generated SOAP Draft */}
              <div className="bg-teal-50/50 rounded-xl p-3.5 border border-teal-100/80 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-teal-900">
                    <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                    <span>Rascunho SOAP Gerado por IA Clínica (3.4s)</span>
                  </div>
                  <span className="text-[10px] text-teal-700 font-medium bg-teal-100/70 px-2 py-0.5 rounded">
                    Human-in-the-Loop
                  </span>
                </div>

                <div className="space-y-1.5 text-[11px] text-slate-700">
                  <p>
                    <strong className="text-slate-900 font-semibold">S (Subjetivo):</strong> Paciente relata remissão das crises de pânico ocupacionais após manejo da respiração 4-7-8.
                  </p>
                  <p>
                    <strong className="text-slate-900 font-semibold">O (Objetivo):</strong> Afeto modulado, postura receptiva, sem agitação psicomotora.
                  </p>
                  <p>
                    <strong className="text-slate-900 font-semibold">A (Avaliação):</strong> Evolução favorável de ansiedade com fortalecimento de autoeficácia (TCC).
                  </p>
                  <p>
                    <strong className="text-slate-900 font-semibold">P (Plano):</strong> Manter diário de pensamentos disfuncionais e iniciar higiene do sono.
                  </p>
                </div>
              </div>

              {/* Security & Action Footer */}
              <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <Lock className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Criptografia AES-256-GCM ativa</span>
                </div>

                {signedState ? (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold">
                    <FileCheck2 className="w-4 h-4 text-emerald-700" />
                    <span>Prontuário Assinado & Selado (ICP-Brasil)</span>
                  </div>
                ) : (
                  <button
                    onClick={() => setSignedState(true)}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-teal-700 text-white text-xs font-semibold transition-colors cursor-pointer shadow-xs"
                  >
                    <FileCheck2 className="w-3.5 h-3.5" />
                    <span>Revisar & Selar Prontuário</span>
                  </button>
                )}
              </div>

              {/* Floating Compliance Badge */}
              <div className="text-center pt-1">
                <span className="text-[10px] text-slate-400 font-medium">
                  🔒 Guarda imutável por 5 anos (Res. CFP nº 001/2009) em cofre WORM
                </span>
              </div>

            </div>

          </div>

        </div>
      </div>
    </section>
  );
};
