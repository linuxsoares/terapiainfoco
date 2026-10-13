import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  QrCode, 
  Search, 
  AlertCircle, 
  Lock, 
  FileCheck2
} from 'lucide-react';

import type { ValidateDocumentResponse } from '@terapiainfoco/shared';
import { landingApi } from '../services/api';

export const ValidationPortal: React.FC = () => {
  const [tokenInput, setTokenInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ValidateDocumentResponse | null>(null);
  const [searched, setSearched] = useState(false);

  // Lê token automaticamente da URL caso o usuário tenha escaneado o QR Code
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token') || params.get('validar');
    if (urlToken) {
      setTokenInput(urlToken);
      performValidation(urlToken);
    }
  }, []);

  const performValidation = async (token: string) => {
    if (!token.trim()) return;

    try {
      setLoading(true);
      setSearched(true);
      const res = await landingApi.validateDocumentToken(token.trim());
      setResult(res);
    } catch {
      setResult({
        valid: false,
        message: 'Falha na conexão com o servidor de validação pública.'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    performValidation(tokenInput);
  };

  return (
    <section id="validar" className="py-20 bg-white border-t border-slate-200 relative overflow-hidden">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Cabeçalho */}
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-800 text-xs font-semibold mb-3">
            <QrCode className="w-3.5 h-3.5 text-blue-600" />
            Portal de Verificação de Autenticidade • CFP nº 006/2019
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Validação Pública de Documentos
          </h2>
          <p className="mt-3 text-sm text-slate-600 leading-relaxed">
            Consulte a autenticidade de Atestados, Declarações, Relatórios e Laudos Psicológicos emitidos através do QR Code ou inserindo o código verificador.
          </p>
        </div>

        {/* Barra de Pesquisa por Token */}
        <div className="max-w-xl mx-auto mb-10">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
              <input
                type="text"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Insira o código do documento (ex: 1190fcc8a195...)"
                className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-teal-500 font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !tokenInput.trim()}
              className="px-5 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 shrink-0"
            >
              {loading ? 'Validando...' : 'Verificar Autenticidade'}
            </button>
          </form>
        </div>

        {/* Resultado da Validação */}
        {searched && (
          <div className="max-w-2xl mx-auto">
            {result?.valid && result.document ? (
              <div className="bg-gradient-to-b from-emerald-50/50 to-white rounded-3xl p-6 sm:p-8 border border-emerald-500/30 shadow-lg space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-emerald-200/60">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-2xl bg-emerald-500 text-white shadow-md shadow-emerald-500/20">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                        Status Oficial
                      </span>
                      <h4 className="text-base font-bold text-slate-900">
                        Documento Psicológico Autêntico e Válido
                      </h4>
                    </div>
                  </div>

                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    {result.document.type}
                  </span>
                </div>

                {/* Dados Públicos do Documento */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-1">
                    <span className="text-slate-500 font-medium">Profissional Emissor(a):</span>
                    <p className="font-bold text-slate-900">{result.document.therapistName}</p>
                    <p className="text-[11px] text-teal-700 font-medium">CRP {result.document.therapistCrp}</p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-1">
                    <span className="text-slate-500 font-medium">Paciente (Iniciais LGPD):</span>
                    <p className="font-bold text-slate-900 font-mono text-sm">{result.document.patientInitials}</p>
                    <p className="text-[10px] text-slate-400">Preservação de identidade (Art. 11 LGPD)</p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-1">
                    <span className="text-slate-500 font-medium">Data e Hora de Emissão:</span>
                    <p className="font-semibold text-slate-900">
                      {new Date(result.document.issuedAt).toLocaleString('pt-BR')}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-1">
                    <span className="text-slate-500 font-medium">Fundamento Normativo:</span>
                    <p className="font-semibold text-slate-900">{result.document.regulationReference}</p>
                  </div>
                </div>

                {/* Hash Criptográfico PAdES / SHA-256 */}
                <div className="p-3.5 rounded-xl bg-slate-900 text-white text-xs space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-teal-400" />
                    Assinatura Digital PAdES / SHA-256 Hash
                  </span>
                  <p className="font-mono text-[11px] text-emerald-400 break-all">
                    {result.document.signaturePadesHash}
                  </p>
                </div>

                {/* Aviso Zero-Knowledge */}
                <div className="p-3.5 rounded-xl bg-teal-500/10 border border-teal-500/20 text-xs text-teal-900 flex items-start gap-2.5">
                  <FileCheck2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    <strong>Validação Pública Zero-Knowledge:</strong> A autenticidade e o selo imutável foram verificados diretamente no ledger criptográfico sem expor o conteúdo clínico sigiloso ou o prontuário do paciente (Resolução CFP nº 001/2009).
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-center space-y-2">
                <AlertCircle className="w-8 h-8 text-rose-600 mx-auto" />
                <h4 className="text-sm font-bold text-rose-900">
                  Documento Não Encontrado ou Token Inválido
                </h4>
                <p className="text-xs text-rose-700 max-w-md mx-auto">
                  {result?.message || 'Verifique se o código verificador de 32 caracteres foi digitado corretamente ou se o documento foi cancelado.'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
