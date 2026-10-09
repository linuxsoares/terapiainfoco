import React, { useState } from 'react';
import { Clock, DollarSign, Sparkles, ArrowRight } from 'lucide-react';

interface RoiCalculatorProps {
  onOpenDemo: () => void;
}

export const RoiCalculator: React.FC<RoiCalculatorProps> = ({ onOpenDemo }) => {
  const [sessionsPerWeek, setSessionsPerWeek] = useState<number>(20);
  const [sessionPrice, setSessionPrice] = useState<number>(180);
  const [currentMinutesPerNote, setCurrentMinutesPerNote] = useState<number>(20);

  // Math calculations
  const sessionsPerMonth = Math.round(sessionsPerWeek * 4.33);
  const currentHoursPerMonth = Math.round((sessionsPerMonth * currentMinutesPerNote) / 60);
  const newHoursPerMonth = Math.round((sessionsPerMonth * 3) / 60); // 3 minutes with TerapiaInFoco
  const hoursSavedPerMonth = Math.max(1, currentHoursPerMonth - newHoursPerMonth);
  const extraRevenuePotential = Math.round((hoursSavedPerMonth * sessionPrice) * 0.6); // assuming 60% of saved time could become new sessions or leisure

  return (
    <section id="calculadora" className="py-24 bg-gradient-to-b from-white via-teal-50/20 to-white relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-100 text-teal-800 text-xs font-semibold">
            <Clock className="w-3.5 h-3.5 text-teal-600" />
            <span>Simulador de Economia de Tempo & Qualidade de Vida</span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight">
            Quanto Vale o Seu Tempo Fora do Consultório?
          </h2>

          <p className="text-slate-600 text-base sm:text-lg">
            Descubra quantas horas por mês você gasta digitando evoluções e laudos — e quanto tempo e tranquilidade você recupera com o TerapiaInFoco.
          </p>
        </div>

        {/* Calculator Grid */}
        <div className="mt-14 max-w-5xl mx-auto bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-10 shadow-xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            
            {/* Sliders Column */}
            <div className="lg:col-span-6 space-y-6">
              
              {/* Slider 1: Sessions per week */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm font-bold text-slate-800">
                  <label htmlFor="sessions">Sessões atendidas por semana:</label>
                  <span className="px-3 py-1 bg-teal-50 text-teal-700 rounded-lg font-mono text-base border border-teal-200">
                    {sessionsPerWeek} sessões
                  </span>
                </div>
                <input
                  id="sessions"
                  type="range"
                  min="5"
                  max="50"
                  step="1"
                  value={sessionsPerWeek}
                  onChange={(e) => setSessionsPerWeek(Number(e.target.value))}
                  className="w-full accent-teal-600 cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>5 sessões</span>
                  <span>50 sessões/sem</span>
                </div>
              </div>

              {/* Slider 2: Current Minutes per Note */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm font-bold text-slate-800">
                  <label htmlFor="minutes">Minutos gastos por prontuário hoje:</label>
                  <span className="px-3 py-1 bg-teal-50 text-teal-700 rounded-lg font-mono text-base border border-teal-200">
                    {currentMinutesPerNote} minutos
                  </span>
                </div>
                <input
                  id="minutes"
                  type="range"
                  min="10"
                  max="40"
                  step="5"
                  value={currentMinutesPerNote}
                  onChange={(e) => setCurrentMinutesPerNote(Number(e.target.value))}
                  className="w-full accent-teal-600 cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>10 min (rápido)</span>
                  <span>40 min (detalhado)</span>
                </div>
              </div>

              {/* Slider 3: Average Session Fee */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm font-bold text-slate-800">
                  <label htmlFor="price">Valor médio da sua sessão:</label>
                  <span className="px-3 py-1 bg-teal-50 text-teal-700 rounded-lg font-mono text-base border border-teal-200">
                    R$ {sessionPrice}
                  </span>
                </div>
                <input
                  id="price"
                  type="range"
                  min="80"
                  max="400"
                  step="10"
                  value={sessionPrice}
                  onChange={(e) => setSessionPrice(Number(e.target.value))}
                  className="w-full accent-teal-600 cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>R$ 80</span>
                  <span>R$ 400</span>
                </div>
              </div>

            </div>

            {/* Dynamic Results Card */}
            <div className="lg:col-span-6 bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl border border-slate-800">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <span className="text-xs font-bold text-teal-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-teal-400" />
                  Seu Ganho Mensal Estimado
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  ~{sessionsPerMonth} sessões/mês
                </span>
              </div>

              <div className="space-y-4">
                {/* Hours Saved */}
                <div>
                  <p className="text-xs text-slate-400">Tempo recuperado da burocracia:</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-teal-300 to-emerald-400">
                      +{hoursSavedPerMonth} Horas
                    </span>
                    <span className="text-xs text-slate-400">/ mês</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Equivale a quase <strong>{Math.round(hoursSavedPerMonth / 8)} dias inteiros de trabalho</strong> devolvidos para sua vida pessoal ou descanso.
                  </p>
                </div>

                {/* Financial ROI or Rest Value */}
                <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700/70 space-y-1">
                  <p className="text-xs text-slate-300 flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Potencial de Faturamento Extra / Descanso:</span>
                  </p>
                  <p className="text-2xl font-bold text-emerald-400">
                    R$ {extraRevenuePotential.toLocaleString('pt-BR')} <span className="text-xs text-slate-400 font-normal">/ mês</span>
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Mesmo dedicando apenas metade desse tempo a novas consultas, você multiplica o investimento na plataforma por mais de 10x.
                  </p>
                </div>
              </div>

              <button
                onClick={onOpenDemo}
                className="w-full py-3.5 px-4 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-teal-500/20"
              >
                <span>Recuperar Minhas {hoursSavedPerMonth} Horas</span>
                <ArrowRight className="w-4 h-4" />
              </button>

            </div>

          </div>
        </div>

      </div>
    </section>
  );
};
