import React, { useState } from 'react';
import {
  Calendar,
  Video,
  Sparkles,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  ShieldCheck,
  BellRing,
  QrCode,
  Lock,
  Layers
} from 'lucide-react';
import { RFC_MODULES } from '../data/rfcData';

export const FeatureModules: React.FC = () => {
  const [selectedModule, setSelectedModule] = useState(0);

  const moduleIcons = [
    <Calendar className="w-5 h-5" />,
    <Video className="w-5 h-5" />,
    <Sparkles className="w-5 h-5" />,
    <FileSpreadsheet className="w-5 h-5" />,
    <FileText className="w-5 h-5" />
  ];

  return (
    <section id="modulos" className="py-24 bg-white relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-800 text-xs font-semibold">
            <Layers className="w-3.5 h-3.5 text-teal-600" />
            <span>Arquitetura Funcional • Seção 3 do RFC-001</span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight">
            5 Módulos Integrados em um Fluxo Contínuo
          </h2>

          <p className="text-slate-600 text-base sm:text-lg">
            Projetado de ponta a ponta para a realidade do psicólogo clínico brasileiro: da confirmação da sessão no WhatsApp até a emissão de laudos com validade jurídica.
          </p>
        </div>

        {/* Module Navigation Tabs */}
        <div className="mt-12 flex items-center justify-center gap-2 overflow-x-auto pb-4 scrollbar-none">
          {RFC_MODULES.map((mod, idx) => (
            <button
              key={mod.id}
              onClick={() => setSelectedModule(idx)}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold whitespace-nowrap transition-all cursor-pointer ${
                selectedModule === idx
                  ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/25 ring-2 ring-teal-500'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/80'
              }`}
            >
              <span className={selectedModule === idx ? 'text-white' : 'text-teal-600'}>
                {moduleIcons[idx]}
              </span>
              <span>{mod.title.split('&')[0].trim()}</span>
            </button>
          ))}
        </div>

        {/* Selected Module Showcase Card */}
        <div className="mt-8 bg-slate-50 border border-slate-200/90 rounded-3xl p-6 sm:p-10 lg:p-12 shadow-sm">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            
            {/* Left Column: Details */}
            <div className="lg:col-span-6 space-y-6">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-teal-100 text-teal-800 border border-teal-200">
                  {RFC_MODULES[selectedModule].badge}
                </span>
                <span className="px-2.5 py-0.5 rounded text-[11px] font-semibold bg-slate-200 text-slate-700">
                  {RFC_MODULES[selectedModule].tag}
                </span>
              </div>

              <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                {RFC_MODULES[selectedModule].title}
              </h3>

              <p className="text-slate-600 text-base leading-relaxed">
                {RFC_MODULES[selectedModule].description}
              </p>

              {/* Highlights List */}
              <div className="space-y-3 pt-2">
                {RFC_MODULES[selectedModule].highlights.map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center shrink-0 mt-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-sm font-medium text-slate-700 leading-snug">
                      {item}
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-4 flex items-center gap-4 text-xs text-slate-500">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Totalmente auditado</span>
                </div>
                <span>•</span>
                <div className="flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-teal-600" />
                  <span>Criptografia de Campo (FLE)</span>
                </div>
              </div>
            </div>

            {/* Right Column: Visual Component for each module */}
            <div className="lg:col-span-6">
              
              {/* Module 1 Visual: Agenda & Notification Flow */}
              {selectedModule === 0 && (
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-md space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-teal-600" />
                      <span className="text-sm font-bold text-slate-900">Grade Semanal • Terça-feira</span>
                    </div>
                    <span className="text-xs text-teal-700 bg-teal-50 px-2.5 py-0.5 rounded-full font-semibold">
                      Buffer de 15m Ativo
                    </span>
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-slate-900">14:00 - 14:50 • Mariana S.</p>
                        <p className="text-slate-500 text-[11px]">Sessão Online (Google Meet) • Confirmada</p>
                      </div>
                      <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                        WhatsApp Enviado
                      </span>
                    </div>

                    <div className="p-2 rounded-lg bg-teal-50/50 border border-dashed border-teal-200 text-center text-teal-800 text-[11px] font-medium">
                      ☕ 14:50 - 15:05 • Intervalo de Respiro / Finalização de Notas
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-slate-900">15:05 - 15:55 • Carlos E.</p>
                        <p className="text-slate-500 text-[11px]">Sessão Online (Google Meet) • Recorrente</p>
                      </div>
                      <span className="px-2 py-1 rounded bg-teal-100 text-teal-800 text-[10px] font-bold">
                        Lembrete 2h OK
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                    <BellRing className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Lembretes automáticos reduziram faltas para menos de 4% nas clínicas piloto.</span>
                  </div>
                </div>
              )}

              {/* Module 2 Visual: Google Meet Integration & Waiting Room */}
              {selectedModule === 1 && (
                <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-md space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <Video className="w-4 h-4 text-teal-400" />
                      <span className="text-sm font-bold text-white">Google Meet Orquestrado</span>
                    </div>
                    <span className="text-xs text-teal-400 bg-teal-950 px-2 py-0.5 rounded border border-teal-800 font-mono">
                      Knocking Protection
                    </span>
                  </div>

                  <div className="bg-slate-800/90 rounded-xl p-4 border border-slate-700 space-y-2">
                    <p className="text-xs text-slate-300 font-medium">
                      Link gerado com criptografia para a sessão:
                    </p>
                    <div className="flex items-center justify-between bg-slate-950 px-3 py-2 rounded-lg font-mono text-xs text-teal-300 border border-slate-800">
                      <span>https://meet.google.com/qrp-zvxm-jke</span>
                      <Lock className="w-3.5 h-3.5 text-teal-500" />
                    </div>
                  </div>

                  <div className="bg-amber-950/40 border border-amber-800/60 rounded-xl p-3.5 text-xs text-amber-200 space-y-1">
                    <p className="font-bold flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                      Proteção Anti-Invasão de Horário (Knocking)
                    </p>
                    <p className="text-amber-300/80 text-[11px]">
                      Mesmo que o paciente do horário seguinte clique no link mais cedo, ele fica retido na sala de espera externa. Apenas você autoriza a entrada quando a consulta anterior terminar.
                    </p>
                  </div>
                </div>
              )}

              {/* Module 3 Visual: AI Diarization */}
              {selectedModule === 2 && (
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-md space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-teal-600" />
                      <span className="text-sm font-bold text-slate-900">Pipeline de Diarização Clínica</span>
                    </div>
                    <span className="text-xs text-teal-700 bg-teal-50 px-2 py-0.5 rounded font-bold">
                      Zero Data Retention
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-teal-50 border border-teal-100">
                      <span className="font-bold text-teal-900 text-[11px] block">[TERAPEUTA]</span>
                      <p className="text-slate-700">"Quais foram os gatilhos identificados na crise de ansiedade?"</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="font-bold text-indigo-900 text-[11px] block">[PACIENTE]</span>
                      <p className="text-slate-700">"A reunião com a diretoria gerou a sensação de falta de ar imediata..."</p>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900 text-white text-xs space-y-1">
                    <div className="flex items-center justify-between text-teal-400 font-bold text-[11px]">
                      <span>Rascunho SOAP em 3.2s</span>
                      <span>100% Auditável</span>
                    </div>
                    <p className="text-slate-300 text-[11px]">
                      O modelo extrai os sentimentos para (S), a conduta observável para (O), o raciocínio clínico para (A) e as tarefas para (P).
                    </p>
                  </div>
                </div>
              )}

              {/* Module 4 Visual: Immutability & Audit Trail */}
              {selectedModule === 3 && (
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-md space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-teal-600" />
                      <span className="text-sm font-bold text-slate-900">Prontuário Imutável (Append-Only)</span>
                    </div>
                    <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-bold">
                      Res. CFP 001/2009
                    </span>
                  </div>

                  <div className="space-y-2 text-xs font-mono">
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700">
                      <span className="text-teal-700 font-bold">● Sessão #01</span> — 12/03/2026 [SELADO & ASSINADO]
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700">
                      <span className="text-teal-700 font-bold">● Sessão #02</span> — 19/03/2026 [SELADO & ASSINADO]
                    </div>
                    <div className="p-2.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-900 font-bold">
                      <span>● Sessão #03</span> — Termo de Retificação Averbado (#TR-04)
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
                    <p className="font-semibold text-slate-900">Garantia Ética:</p>
                    <p className="text-[11px]">
                      Nenhum registro clínico pode ser deletado ou sobrescrito. Retificações geram um novo nó criptográfico averbado ao original, assegurando fé pública perante o Conselho.
                    </p>
                  </div>
                </div>
              )}

              {/* Module 5 Visual: Official Documents with QR Code */}
              {selectedModule === 4 && (
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-md space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-teal-600" />
                      <span className="text-sm font-bold text-slate-900">Emissão Conforme Res. CFP 006/2019</span>
                    </div>
                    <span className="text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded font-bold">
                      PDF/A + ICP-Brasil
                    </span>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">ATESTADO PSICOLÓGICO</span>
                      <span className="text-[10px] text-slate-500 font-mono">Token: 8b22-c0a1</span>
                    </div>

                    <div className="h-2 bg-slate-200 rounded w-full"></div>
                    <div className="h-2 bg-slate-200 rounded w-4/5"></div>
                    <div className="h-2 bg-slate-200 rounded w-2/3"></div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                      <div className="flex items-center gap-2 text-[10px] text-slate-600">
                        <QrCode className="w-6 h-6 text-slate-900" />
                        <span>Validação Pública Sem Expor Prontuário</span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                        PAdES Válido
                      </span>
                    </div>
                  </div>
                </div>
              )}

            </div>

          </div>
        </div>

      </div>
    </section>
  );
};
