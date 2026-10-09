import React, { useState } from 'react';
import {
  QrCode,
  Award,
  CheckCircle2,
  ShieldCheck
} from 'lucide-react';
import { DOCUMENT_TEMPLATES } from '../data/rfcData';

export const DocumentSection: React.FC = () => {
  const [selectedDocId, setSelectedDocId] = useState<string>('atestado');
  const [showVerificationModal, setShowVerificationModal] = useState(false);

  const activeDoc = DOCUMENT_TEMPLATES.find((d) => d.id === selectedDocId) || DOCUMENT_TEMPLATES[0];

  return (
    <section id="documentos-cfp" className="py-24 bg-slate-50 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-100 text-purple-900 text-xs font-semibold">
            <Award className="w-3.5 h-3.5 text-purple-600" />
            <span>Resolução CFP nº 006/2019 • Módulo 5 do RFC-001</span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight">
            Emissão de Laudos e Atestados com Fé Pública
          </h2>

          <p className="text-slate-600 text-base sm:text-lg">
            Emita documentos psicológicos estruturados com rigor técnico-científico, assinatura digital ICP-Brasil e validação pública via QR Code.
          </p>
        </div>

        {/* Document Tabs */}
        <div className="mt-12 flex items-center justify-center gap-3">
          {DOCUMENT_TEMPLATES.map((doc) => (
            <button
              key={doc.id}
              onClick={() => setSelectedDocId(doc.id)}
              className={`px-5 py-3 rounded-xl font-bold text-sm transition-all cursor-pointer ${
                selectedDocId === doc.id
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/25 ring-2 ring-purple-500'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {doc.name}
            </button>
          ))}
        </div>

        {/* Document Interactive Preview Layout */}
        <div className="mt-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Requirements & Regulation */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-sm space-y-4">
              <span className="text-xs font-mono font-bold text-purple-600 uppercase tracking-wider block">
                {activeDoc.regulation}
              </span>

              <h3 className="text-xl font-bold text-slate-900">
                {activeDoc.name}
              </h3>

              <p className="text-sm text-slate-600 leading-relaxed">
                {activeDoc.purpose}
              </p>

              <div className="p-3.5 rounded-xl bg-purple-50 border border-purple-100 text-xs text-purple-900 space-y-1">
                <p className="font-bold">Estrutura Normatizada pelo CFP:</p>
                <p className="font-mono text-slate-700">{activeDoc.structure}</p>
              </div>

              <div className="space-y-3 pt-2">
                <div className="flex items-start gap-2.5 text-xs text-slate-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Padrão PDF/A:</strong> Preservação documental a longo prazo sem distorções de fonte ou layout.
                  </span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-slate-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Assinatura ICP-Brasil:</strong> Certificado digital qualificado padrão PAdES (Lei nº 14.063/2020).
                  </span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-slate-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Token de Validação Pública:</strong> Empresas e juízos podem checar a validade sem acessar o prontuário.
                  </span>
                </div>
              </div>

              <button
                onClick={() => setShowVerificationModal(true)}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <QrCode className="w-4 h-4 text-purple-400" />
                <span>Simular Validação por Terceiro (Via QR Code)</span>
              </button>
            </div>
          </div>

          {/* Right Column: Realistic Paper Document Mockup */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-300 p-8 sm:p-10 shadow-xl relative overflow-hidden font-serif">
            
            {/* Watermark */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03]">
              <span className="text-8xl font-black text-slate-950 uppercase rotate-[-25deg] select-none">
                TERAPIAINFOCO
              </span>
            </div>

            {/* Document Header */}
            <div className="text-center pb-6 border-b border-slate-200 space-y-1 font-sans">
              <div className="inline-flex items-center gap-1.5 text-teal-800 text-xs font-bold uppercase tracking-widest">
                <ShieldCheck className="w-4 h-4 text-teal-600" />
                <span>Consultório de Psicologia Clínica</span>
              </div>
              <h4 className="text-lg font-bold text-slate-900 tracking-tight font-serif pt-1">
                {activeDoc.previewContent.title}
              </h4>
              <p className="text-[11px] text-slate-500 italic">
                {activeDoc.previewContent.lawReference}
              </p>
            </div>

            {/* Document Identification Fields */}
            <div className="py-5 border-b border-slate-100 text-xs font-sans space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Profissional Responsável:</span>
                <span className="font-bold text-slate-900">{activeDoc.previewContent.therapist}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Pessoa Atendida:</span>
                <span className="font-bold text-slate-900">{activeDoc.previewContent.patient}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Finalidade:</span>
                <span className="font-medium text-slate-800">Acompanhamento de Saúde Mental</span>
              </div>
            </div>

            {/* Document Body Text */}
            <div className="py-6 text-sm text-slate-800 leading-relaxed font-serif text-justify indent-8">
              {activeDoc.previewContent.body}
            </div>

            {/* Document Date and Signature Block */}
            <div className="pt-6 border-t border-slate-200 text-center space-y-3 font-sans">
              <p className="text-xs text-slate-500 italic">
                {activeDoc.previewContent.date}
              </p>

              {/* Digital Signature Stamp */}
              <div className="inline-block bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-left text-xs space-y-1.5 shadow-xs">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-purple-600" />
                    <span className="font-bold text-slate-900 text-[11px]">
                      Assinatura Digital ICP-Brasil (PAdES)
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                    Íntegro
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 leading-snug">
                  {activeDoc.previewContent.signature}
                </p>
                <div className="flex items-center justify-between pt-1 border-t border-slate-200 text-[10px] text-slate-400">
                  <span className="font-mono">Carimbo do Tempo ICP-Brasil</span>
                  <span className="text-teal-700 font-semibold flex items-center gap-1">
                    <QrCode className="w-3.5 h-3.5" />
                    Validável publicamente
                  </span>
                </div>
              </div>
            </div>

          </div>

        </div>

      </div>

      {/* Public Verification Modal Simulation */}
      {showVerificationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-purple-600" />
                <h5 className="font-bold text-slate-900 text-sm">
                  Portal Público de Validação de Documento
                </h5>
              </div>
              <button
                onClick={() => setShowVerificationModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <p className="font-bold">Documento Autêntico e Válido</p>
                <p className="text-[11px] text-emerald-700">
                  Assinado digitalmente por Dra. Vanessa Andrade (CRP 06/142980).
                </p>
              </div>
            </div>

            <div className="text-xs text-slate-600 space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <p><strong>Tipo:</strong> Atestado Psicológico</p>
              <p><strong>Hash do Documento:</strong> <code className="font-mono text-[10px]">e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855</code></p>
              <p><strong>Sigilo Garantido:</strong> O prontuário clínico e as transcrições das sessões permanecem trancados e inacessíveis a terceiros.</p>
            </div>

            <button
              onClick={() => setShowVerificationModal(false)}
              className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer hover:bg-slate-800"
            >
              Fechar Demonstração
            </button>
          </div>
        </div>
      )}

    </section>
  );
};
