import React, { useState } from 'react';
import { Check, Sparkles, ShieldCheck, ArrowRight } from 'lucide-react';
import { PRICING_PLANS } from '../data/rfcData';

interface PricingProps {
  onOpenDemo: () => void;
}

export const PricingSection: React.FC<PricingProps> = ({ onOpenDemo }) => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('annual');

  return (
    <section id="precos" className="py-24 bg-slate-50 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-100 text-teal-800 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-teal-600" />
            <span>Investimento Transparente</span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight">
            Planos Sob Medida Para Sua Prática Clínica
          </h2>

          <p className="text-slate-600 text-base sm:text-lg">
            Comece com 14 dias de teste gratuito, sem necessidade de cartão de crédito no cadastro.
          </p>

          {/* Billing Switch */}
          <div className="pt-4 flex items-center justify-center gap-3">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                billingCycle === 'monthly'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
              }`}
            >
              Mensal
            </button>
            <button
              onClick={() => setBillingCycle('annual')}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer flex items-center gap-2 ${
                billingCycle === 'annual'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
              }`}
            >
              <span>Anual</span>
              <span className="px-2 py-0.5 rounded-full bg-teal-200 text-teal-900 text-[10px] font-extrabold uppercase">
                2 Meses Grátis
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
          {PRICING_PLANS.map((plan) => {
            const price = billingCycle === 'annual' ? plan.annualPrice : plan.monthlyPrice;

            return (
              <div
                key={plan.id}
                className={`relative flex flex-col justify-between rounded-3xl p-8 transition-all duration-300 ${
                  plan.popular
                    ? 'bg-white border-2 border-teal-500 shadow-2xl shadow-teal-500/15 md:-translate-y-2'
                    : 'bg-white/80 border border-slate-200 shadow-sm hover:border-slate-300'
                }`}
              >
                {/* Popular Ribbon */}
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-teal-600 to-emerald-500 text-white text-xs font-extrabold tracking-wide uppercase shadow-md shadow-teal-600/20">
                    {plan.badge}
                  </div>
                )}

                <div className="space-y-6">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">{plan.name}</h3>
                    <p className="text-xs text-slate-500 mt-1 min-h-[32px]">{plan.tagline}</p>
                  </div>

                  {/* Price Block */}
                  <div className="pt-2 pb-4 border-b border-slate-100">
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm font-semibold text-slate-500">R$</span>
                      <span className="text-4xl sm:text-5xl font-black text-slate-950 tracking-tight">
                        {price}
                      </span>
                      <span className="text-xs text-slate-500 font-medium">/ mês</span>
                    </div>
                    {billingCycle === 'annual' && (
                      <p className="text-[11px] text-teal-700 font-semibold mt-1">
                        Faturado anualmente (Economia de R$ {(plan.monthlyPrice - plan.annualPrice) * 12}/ano)
                      </p>
                    )}
                  </div>

                  {/* Features List */}
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      O que está incluído:
                    </p>
                    {plan.features.map((feature, i) => (
                      <div key={i} className="flex items-start gap-2.5 text-xs text-slate-600">
                        <Check className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                        <span className="leading-snug">{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Card CTA */}
                <div className="pt-8">
                  <button
                    onClick={onOpenDemo}
                    className={`w-full py-3.5 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      plan.popular
                        ? 'bg-teal-600 hover:bg-teal-700 text-white shadow-lg shadow-teal-600/25'
                        : 'bg-slate-900 hover:bg-slate-800 text-white'
                    }`}
                  >
                    <span>{plan.cta}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <p className="text-[10px] text-slate-400 text-center mt-2.5">
                    Cancela quando quiser • Sem fidelidade oculta
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Security and migration footer badge */}
        <div className="mt-14 max-w-2xl mx-auto p-4 rounded-2xl bg-white border border-slate-200 text-center text-xs text-slate-600 flex flex-col sm:flex-row items-center justify-center gap-4">
          <div className="flex items-center gap-1.5 font-semibold text-slate-800">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Migração Assistida Gratuita de Prontuários</span>
          </div>
          <span className="hidden sm:inline text-slate-300">|</span>
          <div className="text-slate-500">
            Importamos sua base de pacientes com encriptação instantânea.
          </div>
        </div>

      </div>
    </section>
  );
};
