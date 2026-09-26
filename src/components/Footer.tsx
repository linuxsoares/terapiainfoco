import React from 'react';
import { ShieldCheck, Lock } from 'lucide-react';

interface FooterProps {
  onOpenDemo: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenDemo }) => {
  return (
    <footer className="bg-slate-950 text-slate-400 border-t border-slate-800 pt-16 pb-12 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        
        {/* Top Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
          
          {/* Brand & Mission (2 cols) */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-600 to-emerald-400 flex items-center justify-center text-white shadow-md shadow-teal-500/20">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="text-xl font-bold tracking-tight text-white font-sans">
                  Terapia<span className="text-teal-400">InFoco</span>
                </span>
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-teal-950 text-teal-400 border border-teal-800">
                  RFC-001
                </span>
              </div>
            </div>

            <p className="text-slate-400 leading-relaxed text-xs max-w-sm">
              Plataforma de telepsicologia especializada que une teleatendimento no Google Meet, transcrição clínica com diarização, notas SOAP assistidas por IA e Envelope Encryption nível LGPD.
            </p>

            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-400 space-y-1">
              <span className="text-teal-400 font-bold block">Documento de Origem:</span>
              <p>RFC-001 (Versão 1.0.0 — Domínio Saúde Digital / Telepsicologia / Segurança & Compliance LGPD).</p>
            </div>
          </div>

          {/* Column: Navegação */}
          <div className="space-y-3">
            <h4 className="text-white font-bold uppercase tracking-wider text-xs">Navegação</h4>
            <ul className="space-y-2">
              <li>
                <a href="#modulos" className="hover:text-white transition-colors">
                  Módulos do Sistema
                </a>
              </li>
              <li>
                <a href="#simulador-ia" className="hover:text-white transition-colors">
                  Simulador de IA Clínica
                </a>
              </li>
              <li>
                <a href="#seguranca" className="hover:text-white transition-colors">
                  Arquitetura de Segurança
                </a>
              </li>
              <li>
                <a href="#documentos-cfp" className="hover:text-white transition-colors">
                  Modelos de Laudos CFP
                </a>
              </li>
              <li>
                <a href="#calculadora" className="hover:text-white transition-colors">
                  Calculadora de Economia
                </a>
              </li>
              <li>
                <a href="#precos" className="hover:text-white transition-colors">
                  Planos e Preços
                </a>
              </li>
              <li>
                <a href="#faq" className="hover:text-white transition-colors">
                  Perguntas Frequentes
                </a>
              </li>
            </ul>
          </div>

          {/* Column: Conformidade Ética CFP */}
          <div className="space-y-3">
            <h4 className="text-white font-bold uppercase tracking-wider text-xs">Normas do CFP</h4>
            <ul className="space-y-2 text-slate-400">
              <li className="flex items-center gap-1.5">
                <span className="text-teal-400">●</span>
                <span>Resolução CFP nº 011/2018 (e-Psi)</span>
              </li>
              <li className="flex items-center gap-1.5">
                <span className="text-teal-400">●</span>
                <span>Resolução CFP nº 006/2019 (Documentos)</span>
              </li>
              <li className="flex items-center gap-1.5">
                <span className="text-teal-400">●</span>
                <span>Resolução CFP nº 001/2009 (Guarda 5 Anos)</span>
              </li>
              <li className="flex items-center gap-1.5">
                <span className="text-teal-400">●</span>
                <span>Resolução CFP nº 004/2020 (Prontuário)</span>
              </li>
              <li className="flex items-center gap-1.5">
                <span className="text-teal-400">●</span>
                <span>Art. 9º Código de Ética (Sigilo Absoluto)</span>
              </li>
            </ul>
          </div>

          {/* Column: Segurança & LGPD */}
          <div className="space-y-3">
            <h4 className="text-white font-bold uppercase tracking-wider text-xs">Segurança & LGPD</h4>
            <ul className="space-y-2 text-slate-400">
              <li className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                <span>Envelope Encryption AES-256</span>
              </li>
              <li className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                <span>Google Cloud KMS / HSM</span>
              </li>
              <li className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                <span>Zero Data Retention Policy</span>
              </li>
              <li className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                <span>Blind Indexing (HMAC-SHA256)</span>
              </li>
              <li className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                <span>Trilha de Auditoria WORM</span>
              </li>
            </ul>
          </div>

        </div>

        {/* Regulatory Disclaimer Banner */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-[11px] text-slate-400 leading-relaxed text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>
            O <strong>TerapiaInFoco</strong> atua estritamente como operador tecnológico seguro de dados clínicos em conformidade com o Art. 11 da LGPD e as diretrizes do Conselho Federal de Psicologia. O profissional psicólogo permanece como o único responsável técnico e ético pela emissão de pareceres, diagnósticos e guarda documental.
          </p>
          <button
            onClick={onOpenDemo}
            className="shrink-0 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs transition-colors cursor-pointer"
          >
            Acesso Beta
          </button>
        </div>

        {/* Bottom Line */}
        <div className="pt-8 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-4 text-slate-500 text-[11px]">
          <p>© {new Date().getFullYear()} TerapiaInFoco Tecnologia em Saúde Mental Ltda. Todos os direitos reservados.</p>
          <div className="flex items-center gap-4">
            <span className="hover:text-slate-400 cursor-pointer">Termos de Uso</span>
            <span>•</span>
            <span className="hover:text-slate-400 cursor-pointer">Aviso de Privacidade LGPD</span>
            <span>•</span>
            <span className="hover:text-slate-400 cursor-pointer">Segurança Criptográfica</span>
          </div>
        </div>

      </div>
    </footer>
  );
};
