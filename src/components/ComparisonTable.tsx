import React from 'react';
import { Check, X, ShieldAlert, Sparkles } from 'lucide-react';
import { COMPARISON_DATA } from '../data/rfcData';

export const ComparisonTable: React.FC = () => {
  return (
    <section className="py-24 bg-white relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-800 text-xs font-semibold">
            <ShieldAlert className="w-3.5 h-3.5 text-teal-600" />
            <span>Segurança Deontológica & Jurídica</span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight">
            Por que Ferramentas Genéricas Colocam Seu Registro em Risco?
          </h2>

          <p className="text-slate-600 text-base sm:text-lg">
            O Conselho Federal de Psicologia e a LGPD exigem salvaguardas que aplicativos genéricos ou IAs abertas simplesmente ignoram.
          </p>
        </div>

        {/* Table Container */}
        <div className="mt-14 overflow-x-auto rounded-3xl border border-slate-200 shadow-md">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-slate-50/90 text-xs font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                <th className="py-4.5 px-6">Critério Técnico & Jurídico</th>
                <th className="py-4.5 px-6 bg-teal-50 text-teal-900 text-center font-extrabold text-sm border-x border-teal-200/80">
                  <div className="flex items-center justify-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-teal-600" />
                    <span>TerapiaInFoco</span>
                  </div>
                </th>
                <th className="py-4.5 px-6 text-center text-slate-500 font-semibold">
                  WhatsApp + Meet Avulso
                </th>
                <th className="py-4.5 px-6 text-center text-slate-500 font-semibold">
                  Prontuários Genéricos
                </th>
                <th className="py-4.5 px-6 text-center text-red-600 font-semibold">
                  IA Genérica / ChatGPT
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {COMPARISON_DATA.map((row, idx) => (
                <tr
                  key={idx}
                  className={`hover:bg-slate-50/50 transition-colors ${
                    idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                  }`}
                >
                  <td className="py-4 px-6 font-medium text-slate-800">
                    {row.feature}
                  </td>

                  {/* TerapiaInFoco column */}
                  <td className="py-4 px-6 bg-teal-50/50 text-center border-x border-teal-200/50">
                    <div className="flex items-center justify-center">
                      <span className="w-7 h-7 rounded-full bg-teal-600 text-white flex items-center justify-center shadow-xs">
                        <Check className="w-4 h-4" />
                      </span>
                    </div>
                  </td>

                  {/* WhatsApp + Meet */}
                  <td className="py-4 px-6 text-center">
                    <div className="flex items-center justify-center">
                      <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
                        <X className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </td>

                  {/* Prontuários Genéricos */}
                  <td className="py-4 px-6 text-center">
                    <div className="flex items-center justify-center">
                      {row.prontuarioGenerico === true ? (
                        <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center">
                          <Check className="w-3.5 h-3.5" />
                        </span>
                      ) : row.prontuarioGenerico === 'Parcial' || row.prontuarioGenerico === 'Manual' ? (
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          {row.prontuarioGenerico}
                        </span>
                      ) : (
                        <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
                          <X className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>
                  </td>

                  {/* IA Genérica */}
                  <td className="py-4 px-6 text-center">
                    <div className="flex items-center justify-center">
                      {row.iaGenerica === 'Risco Alto' ? (
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-red-100 text-red-700 border border-red-200">
                          ⚠️ Risco Ético
                        </span>
                      ) : row.iaGenerica === 'Genérica' ? (
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-600">
                          Sem Diarização
                        </span>
                      ) : (
                        <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
                          <X className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footnote callout */}
        <div className="mt-6 p-4 rounded-2xl bg-amber-50 border border-amber-200/80 text-xs text-amber-900 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Atenção Ética:</strong> Colocar relatos ou áudios de pacientes em ferramentas de IA gratuitas ou sem acordo de confidencialidade com Zero Retention viola frontalmente o <strong>Art. 9º do Código de Ética Profissional do Psicólogo</strong> e o <strong>Art. 11 da LGPD</strong>, ensejando processos no CRP e sanções civis. O TerapiaInFoco é blindado contratualmente e criptograficamente para seu total resguardo.
          </p>
        </div>

      </div>
    </section>
  );
};
