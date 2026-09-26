import React, { useState } from 'react';
import { ChevronDown, HelpCircle, MessageSquare } from 'lucide-react';
import { FAQS } from '../data/rfcData';

interface FaqSectionProps {
  onOpenDemo: () => void;
}

export const FaqSection: React.FC<FaqSectionProps> = ({ onOpenDemo }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');

  const categories = ['Todas', 'Ética & CFP', 'Segurança & LGPD', 'Google Meet & Prática', 'Prontuário & Documentos'];

  const filteredFaqs = selectedCategory === 'Todas'
    ? FAQS
    : FAQS.filter((f) => f.category.toLowerCase().includes(selectedCategory.toLowerCase()) || selectedCategory.toLowerCase().includes(f.category.toLowerCase()));

  return (
    <section id="faq" className="py-24 bg-white relative">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-800 text-xs font-semibold">
            <HelpCircle className="w-3.5 h-3.5 text-teal-600" />
            <span>Respostas Claras & Fundamentadas</span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight">
            Perguntas Frequentes
          </h2>

          <p className="text-slate-600 text-base sm:text-lg">
            Tire todas as suas dúvidas sobre conformidade com o CFP, segurança LGPD e rotina clínica.
          </p>
        </div>

        {/* Category Pills */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Accordion List */}
        <div className="mt-10 space-y-4">
          {filteredFaqs.map((faq, index) => {
            const isOpen = openIndex === index;

            return (
              <div
                key={index}
                className="border border-slate-200 rounded-2xl overflow-hidden transition-all duration-200 hover:border-slate-300"
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="w-full text-left p-5 sm:p-6 bg-slate-50/50 hover:bg-slate-50 flex items-center justify-between gap-4 cursor-pointer"
                >
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700">
                      {faq.category}
                    </span>
                    <h3 className="text-base sm:text-lg font-bold text-slate-900">
                      {faq.question}
                    </h3>
                  </div>

                  <span
                    className={`w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center shrink-0 transition-transform duration-200 ${
                      isOpen ? 'rotate-180 bg-teal-50 border-teal-200 text-teal-700' : 'text-slate-500'
                    }`}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </span>
                </button>

                {isOpen && (
                  <div className="p-5 sm:p-6 bg-white border-t border-slate-100 text-sm text-slate-600 leading-relaxed">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Need more help banner */}
        <div className="mt-14 p-6 rounded-2xl bg-teal-50/60 border border-teal-200 text-center space-y-3">
          <h4 className="text-base font-bold text-teal-950">
            Ainda tem dúvidas sobre o parecer ético ou arquitetura do sistema?
          </h4>
          <p className="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto">
            Nossa equipe técnica e consultores jurídicos em saúde digital estão à disposição para uma conversa individual.
          </p>
          <button
            onClick={onOpenDemo}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs transition-colors cursor-pointer"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Falar com um Especialista em Saúde Digital</span>
          </button>
        </div>

      </div>
    </section>
  );
};
