import React, { useState, useEffect } from 'react';
import { ShieldCheck, Sparkles, Menu, X, ArrowRight, Lock } from 'lucide-react';

interface NavbarProps {
  onOpenDemo: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenDemo }) => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/90 backdrop-blur-md shadow-sm border-b border-slate-200/80 py-3'
          : 'bg-transparent py-5'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <a href="#" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-600 via-teal-500 to-emerald-400 flex items-center justify-center text-white shadow-md shadow-teal-500/20 group-hover:scale-105 transition-transform duration-200">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight text-slate-900 font-sans">
                  Terapia<span className="text-teal-600">InFoco</span>
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-teal-50 text-teal-700 border border-teal-200/70">
                  RFC-001
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                Telepsicologia • IA Clínica • Criptografia LGPD
              </p>
            </div>
          </a>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <a
              href="#modulos"
              className="hover:text-teal-600 transition-colors"
            >
              Módulos
            </a>
            <a
              href="#simulador-ia"
              className="hover:text-teal-600 transition-colors flex items-center gap-1.5 text-slate-800 font-semibold"
            >
              <Sparkles className="w-4 h-4 text-teal-500" />
              Simulador SOAP
            </a>
            <a
              href="#seguranca"
              className="hover:text-teal-600 transition-colors flex items-center gap-1"
            >
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              Criptografia & LGPD
            </a>
            <a
              href="#documentos-cfp"
              className="hover:text-teal-600 transition-colors"
            >
              Laudos CFP
            </a>
            <a
              href="#calculadora"
              className="hover:text-teal-600 transition-colors"
            >
              Calculadora
            </a>
            <a
              href="#precos"
              className="hover:text-teal-600 transition-colors"
            >
              Planos
            </a>
            <a
              href="#faq"
              className="hover:text-teal-600 transition-colors"
            >
              FAQ
            </a>
          </nav>

          {/* Action CTAs */}
          <div className="hidden sm:flex items-center gap-3">
            <div className="hidden xl:flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium border border-emerald-200/60">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Conforme CFP Res. 011/2018
            </div>

            <button
              onClick={onOpenDemo}
              className="relative inline-flex items-center justify-center px-4 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-lg shadow-sm hover:bg-teal-700 transition-all duration-200 active:scale-95 group"
            >
              <span>Solicitar Acesso Beta</span>
              <ArrowRight className="w-4 h-4 ml-1.5 transition-transform group-hover:translate-x-1" />
            </button>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            aria-label="Abrir menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-3 pt-3 pb-4 border-t border-slate-200 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl px-4 space-y-3">
            <a
              href="#modulos"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-sm font-medium text-slate-700 hover:text-teal-600"
            >
              Módulos do Sistema
            </a>
            <a
              href="#simulador-ia"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-sm font-semibold text-teal-700 hover:text-teal-800"
            >
              ✨ Simulador de IA Clínica (SOAP)
            </a>
            <a
              href="#seguranca"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-sm font-medium text-slate-700 hover:text-teal-600"
            >
              Criptografia & Conformidade LGPD
            </a>
            <a
              href="#documentos-cfp"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-sm font-medium text-slate-700 hover:text-teal-600"
            >
              Laudos e Documentos CFP
            </a>
            <a
              href="#calculadora"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-sm font-medium text-slate-700 hover:text-teal-600"
            >
              Calculadora de Tempo e ROI
            </a>
            <a
              href="#precos"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-sm font-medium text-slate-700 hover:text-teal-600"
            >
              Planos e Preços
            </a>
            <a
              href="#faq"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-sm font-medium text-slate-700 hover:text-teal-600"
            >
              Perguntas Frequentes
            </a>

            <div className="pt-2 border-t border-slate-100">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenDemo();
                }}
                className="w-full flex items-center justify-center gap-2 py-3 bg-teal-600 text-white rounded-xl font-semibold text-sm shadow-md"
              >
                <span>Solicitar Acesso Beta</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
