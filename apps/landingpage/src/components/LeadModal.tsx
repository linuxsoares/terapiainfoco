import React, { useState } from 'react';
import { X, Sparkles, CheckCircle, ArrowRight, Lock } from 'lucide-react';
import { landingApi } from '../services/api';

interface LeadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LeadModal: React.FC<LeadModalProps> = ({ isOpen, onClose }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    crp: '',
    whatsapp: '',
    practiceType: 'autonomo',
    // Consentimento LGPD precisa ser marcado pela pessoa
    consent: false,
    // Honeypot: campo oculto que só robôs preenchem
    website: ''
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError(null);
      await landingApi.createLead(formData);
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Não foi possível enviar o pedido. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetAndClose = () => {
    setSubmitted(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-y-auto max-h-[90vh] my-auto">
        
        {/* Close Button */}
        <button
          onClick={handleResetAndClose}
          className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors z-10 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {!submitted ? (
          <div className="p-5 sm:p-8 space-y-5">
            {/* Modal Header */}
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-xs font-bold">
                <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                <span>Acesso Antecipado Exclusivo • Cohort Piloto</span>
              </div>
              <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                Experimente o TerapiaInFoco em Primeira Mão
              </h3>
              <p className="text-xs sm:text-sm text-slate-600">
                Preencha seus dados para receber um convite VIP com 30 dias de uso ilimitado de IA e teleconsulta própria sem gravação.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="relative space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  Nome Completo
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Dra. Juliana Menezes"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">
                    E-mail Profissional
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="voce@consultorio.com.br"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1">
                    Registro CRP (com Região)
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.crp}
                    onChange={(e) => setFormData({ ...formData, crp: e.target.value })}
                    placeholder="Ex: 06/142980"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  WhatsApp para Ativação da Conta
                </label>
                <input
                  type="tel"
                  required
                  value={formData.whatsapp}
                  onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                  placeholder="(11) 98765-4321"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  Modalidade de Atuação Principal
                </label>
                <select
                  value={formData.practiceType}
                  onChange={(e) => setFormData({ ...formData, practiceType: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm bg-white"
                >
                  <option value="autonomo">Psicólogo Autônomo (Consultório Particular)</option>
                  <option value="clinica">Clínica / Espaço Multidisciplinar Compartilhado</option>
                  <option value="hibrido">Atendimento Online e Presencial Híbrido</option>
                </select>
              </div>

              {/* Checkbox consent */}
              <div className="flex items-start gap-2 pt-1">
                <input
                  type="checkbox"
                  id="lead-consent"
                  checked={formData.consent}
                  onChange={(e) => setFormData({ ...formData, consent: e.target.checked })}
                  className="mt-0.5 rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                  required
                />
                <label htmlFor="lead-consent" className="text-[11px] text-slate-600 leading-tight">
                  Autorizo o contato para agendamento da sessão de onboarding e concordo com o tratamento de dados segundo a LGPD.
                </label>
              </div>

              {/* Honeypot fora da tela (não aparece para pessoas nem para leitores de tela) */}
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                className="absolute w-px h-px opacity-0 pointer-events-none overflow-hidden"
              />

              {error && <p className="text-xs text-rose-600">{error}</p>}

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-teal-600/25 transition-all cursor-pointer disabled:opacity-50"
              >
                <span>{submitting ? 'Enviando...' : 'Garantir Meu Acesso VIP Gratuito'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="pt-2 flex items-center justify-center gap-2 text-[11px] text-slate-400">
              <Lock className="w-3.5 h-3.5 text-teal-600" />
              <span>Seus dados nunca serão compartilhados com terceiros.</span>
            </div>
          </div>
        ) : (
          /* Success Screen */
          <div className="p-6 sm:p-8 text-center space-y-5">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <h3 className="text-2xl font-extrabold text-slate-900">
                Pedido recebido!
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed max-w-sm mx-auto">
                Olá, <strong>{formData.name || 'Doutor(a)'}</strong>! Seu pedido de acesso beta foi registrado.
              </p>
            </div>

            <p className="text-xs text-slate-500">
              Nossa equipe entrará em contato pelo e-mail ou WhatsApp informado para agendar o onboarding.
            </p>

            <button
              onClick={handleResetAndClose}
              className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs cursor-pointer"
            >
              Voltar à Página Principal
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
