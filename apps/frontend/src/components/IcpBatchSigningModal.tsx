import React, { useState, useEffect } from 'react';
import {
  FileCheck2,
  KeyRound,
  CheckCircle,
  AlertTriangle,
  Clock,
  QrCode,
  Copy,
  ExternalLink,
  RefreshCw,
  X,
  Lock,
  Layers,
  Check
} from 'lucide-react';
import {
  IcpCertificateType
} from '@terapiainfoco/shared';
import type {
  BatchSignableItem,
  IcpBatchClosingManifest,
  BatchVerificationResponse
} from '@terapiainfoco/shared';
import { api } from '../services/api';

interface IcpBatchSigningModalProps {
  isOpen: boolean;
  onClose: () => void;
  therapistName: string;
  therapistCrp?: string;
  onBatchSigned?: (manifest: IcpBatchClosingManifest) => void;
}

export const IcpBatchSigningModal: React.FC<IcpBatchSigningModalProps> = ({
  isOpen,
  onClose,
  therapistName,
  therapistCrp = '—',
  onBatchSigned
}) => {
  const [activeTab, setActiveTab] = useState<'sign' | 'history' | 'verify'>('sign');
  const [pendingItems, setPendingItems] = useState<BatchSignableItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [manifests, setManifests] = useState<IcpBatchClosingManifest[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSigning, setIsSigning] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Formulário de Assinatura
  const [certType, setCertType] = useState<IcpCertificateType>(IcpCertificateType.A1_FILE);
  const [certPin, setCertPin] = useState<string>('Senha@Cert123');
  const [pscProvider, setPscProvider] = useState<string>('BirdID (Soluti)');

  // Validador Público
  const [verifyToken, setVerifyToken] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verifyResult, setVerifyResult] = useState<BatchVerificationResponse | null>(null);

  // Manifesto recém assinado para comprovante
  const [lastSignedManifest, setLastSignedManifest] = useState<IcpBatchClosingManifest | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    setIsLoading(true);
    setFeedbackMessage(null);
    try {
      const [items, hist] = await Promise.all([
        api.getUnsignedBatchItems(),
        api.getIcpBatchManifests()
      ]);
      setPendingItems(items);
      setSelectedIds(items.map(i => i.id)); // Seleciona todos por padrão
      setManifests(hist);
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.message || 'Erro ao carregar itens pendentes de assinatura.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === pendingItems.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(pendingItems.map(i => i.id));
    }
  };

  const toggleSelectItem = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleExecuteBatchSignature = async () => {
    if (selectedIds.length === 0) {
      setFeedbackMessage({
        type: 'error',
        text: 'Selecione ao menos um item clínico para fechar e assinar no lote.'
      });
      return;
    }

    if (!certPin || certPin.length < 4) {
      setFeedbackMessage({
        type: 'error',
        text: 'A senha/PIN do Certificado Digital é obrigatória (mínimo 4 caracteres).'
      });
      return;
    }

    setIsSigning(true);
    setFeedbackMessage(null);
    try {
      const res = await api.executeIcpBatchSignature({
        recordIds: selectedIds,
        certificateType: certType,
        certificatePinOrSecret: certPin,
        pscCloudProvider: certType === IcpCertificateType.CLOUD_PSC_OIDC ? pscProvider : undefined
      });

      setLastSignedManifest(res.manifest);
      setFeedbackMessage({
        type: 'success',
        text: `Lote de ${res.sealedRecordsCount} registros clínicos selado com sucesso via Certificado ICP-Brasil e carimbo do tempo TSA!`
      });

      // Recarrega lista
      await loadData();
      if (onBatchSigned) onBatchSigned(res.manifest);
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.message || 'Erro ao assinar lote com certificado ICP-Brasil.'
      });
    } finally {
      setIsSigning(false);
    }
  };

  const handleVerifyToken = async () => {
    if (!verifyToken.trim()) return;
    setIsVerifying(true);
    setVerifyResult(null);
    try {
      const res = await api.verifyIcpBatchSignature({ publicValidationToken: verifyToken.trim() });
      setVerifyResult(res);
    } catch (err: any) {
      setVerifyResult({
        success: false,
        valid: false,
        verifiedAt: new Date().toISOString(),
        details: err.message || 'Erro ao conectar ao validador público ICP-Brasil.'
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setFeedbackMessage({
      type: 'success',
      text: 'Token copiado para a área de transferência!'
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="flex flex-col w-full max-w-5xl h-[92vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* HEADER */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <FileCheck2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Fechamento de Ciclo & Assinatura ICP-Brasil em Lote
                </h3>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                  PAdES / MP 2.200-2
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Profissional: <strong className="text-slate-800 dark:text-slate-200">{therapistName}</strong> (CRP {therapistCrp}) • Carimbo do Tempo TSA (DOC-ICP-11)
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <div className="hidden md:flex items-center space-x-2 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-300">
              <Lock className="w-3.5 h-3.5 text-blue-500" />
              <span>Imutabilidade WORM (CFP 001/2009)</span>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title="Fechar Modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* FEEDBACK BANNER */}
        {feedbackMessage && (
          <div
            className={`px-6 py-2.5 text-xs font-medium flex items-center justify-between ${
              feedbackMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-b border-emerald-200 dark:border-emerald-800/40'
                : 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300 border-b border-red-200 dark:border-red-800/40'
            }`}
          >
            <div className="flex items-center space-x-2">
              {feedbackMessage.type === 'success' ? (
                <CheckCircle className="w-4 h-4 text-emerald-500" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-500" />
              )}
              <span>{feedbackMessage.text}</span>
            </div>
            <button
              onClick={() => setFeedbackMessage(null)}
              className="hover:opacity-75"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* NAVEGAÇÃO DE ABAS */}
        <div className="flex items-center px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <button
            onClick={() => setActiveTab('sign')}
            className={`flex items-center space-x-2 py-3 px-4 border-b-2 font-medium text-xs transition ${
              activeTab === 'sign'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Assinar Lote Pendente</span>
            <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
              {pendingItems.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center space-x-2 py-3 px-4 border-b-2 font-medium text-xs transition ${
              activeTab === 'history'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Histórico de Lotes Selados</span>
            <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {manifests.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('verify')}
            className={`flex items-center space-x-2 py-3 px-4 border-b-2 font-medium text-xs transition ${
              activeTab === 'verify'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>Validador Público de Lote</span>
          </button>
        </div>

        {/* CONTEÚDO PRINCIPAL COM SCROLL */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30 dark:bg-slate-950/30">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full space-y-3">
              <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Buscando registros e documentos pendentes de assinatura...
              </p>
            </div>
          ) : activeTab === 'sign' ? (
            /* ================= ABA ASSINATURA EM LOTE ================= */
            <div className="space-y-6 max-w-4xl mx-auto">
              {/* COMPROVANTE DO ÚLTIMO LOTE SE HOUVER */}
              {lastSignedManifest && (
                <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-emerald-800 dark:text-emerald-300 font-bold text-xs uppercase tracking-wide">
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                      <span>Comprovante de Lote Assinado com Fé Pública</span>
                    </div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {new Date(lastSignedManifest.signedAt).toLocaleString('pt-BR')}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-400 text-[10px] block">Merkle Root Criptográfica (SHA-256):</span>
                      <span className="font-mono text-[11px] text-slate-800 dark:text-slate-200 break-all">
                        {lastSignedManifest.merkleRootHash}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block">Autoridade Certificadora:</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {lastSignedManifest.certificateIssuer}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1">
                    <div className="flex items-center space-x-2 w-full sm:w-auto">
                      <input
                        type="text"
                        readOnly
                        value={lastSignedManifest.publicValidationToken}
                        className="text-[11px] font-mono px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 w-full sm:w-72 select-all"
                      />
                      <button
                        onClick={() => copyToClipboard(lastSignedManifest.publicValidationToken)}
                        className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition"
                        title="Copiar Token"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>

                    <button
                      onClick={() => {
                        setVerifyToken(lastSignedManifest.publicValidationToken);
                        setActiveTab('verify');
                      }}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1"
                    >
                      <span>Abrir no Validador Notarial Público</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* SELEÇÃO DE ITENS DO LOTE */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                      Registros Clínicos & Documentos Pendentes ({pendingItems.length})
                    </h4>
                    <span className="text-[11px] text-slate-500">
                      • {selectedIds.length} selecionados
                    </span>
                  </div>

                  <button
                    onClick={toggleSelectAll}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
                  >
                    {selectedIds.length === pendingItems.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
                  {pendingItems.map((item) => {
                    const isSelected = selectedIds.includes(item.id);
                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleSelectItem(item.id)}
                        className={`p-3 rounded-xl border cursor-pointer transition flex items-start space-x-3 ${
                          isSelected
                            ? 'bg-blue-50/50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-800'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-75'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}} // controlado pelo container
                          className="mt-1 rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-1.5 mb-1">
                            <span className="px-1.5 py-0.5 text-[9px] font-bold rounded uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {item.type.replace('_', ' ')}
                            </span>
                            <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 truncate">
                              {item.patientNameMasked}
                            </span>
                          </div>
                          <p className="text-xs font-medium text-slate-900 dark:text-white truncate">
                            {item.title}
                          </p>
                          <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1 font-mono">
                            <span>{new Date(item.itemDate).toLocaleDateString('pt-BR')}</span>
                            <span title={item.itemCanonicalSha256}>
                              Hash: {item.itemCanonicalSha256.substring(0, 8)}...
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* CONFIGURAÇÃO DO CERTIFICADO DIGITAL ICP-BRASIL */}
              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <KeyRound className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                      Certificado Digital ICP-Brasil Homologado
                    </h4>
                  </div>
                  <span className="text-[10px] text-slate-500">Padrão PAdES-T (DOC-ICP-15)</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Opção A1 */}
                  <div
                    onClick={() => setCertType(IcpCertificateType.A1_FILE)}
                    className={`p-3 rounded-xl border cursor-pointer transition ${
                      certType === IcpCertificateType.A1_FILE
                        ? 'bg-blue-50/50 dark:bg-blue-950/40 border-blue-500 text-blue-900 dark:text-blue-200'
                        : 'bg-slate-50/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className="text-xs font-bold block">Certificado A1 (.pfx)</span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">Software em Enclave Local</span>
                  </div>

                  {/* Opção A3 */}
                  <div
                    onClick={() => setCertType(IcpCertificateType.A3_HARDWARE_TOKEN)}
                    className={`p-3 rounded-xl border cursor-pointer transition ${
                      certType === IcpCertificateType.A3_HARDWARE_TOKEN
                        ? 'bg-blue-50/50 dark:bg-blue-950/40 border-blue-500 text-blue-900 dark:text-blue-200'
                        : 'bg-slate-50/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className="text-xs font-bold block">Certificado A3 (Hardware)</span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">Token Criptográfico USB / Smartcard</span>
                  </div>

                  {/* Opção Nuvem PSC */}
                  <div
                    onClick={() => setCertType(IcpCertificateType.CLOUD_PSC_OIDC)}
                    className={`p-3 rounded-xl border cursor-pointer transition ${
                      certType === IcpCertificateType.CLOUD_PSC_OIDC
                        ? 'bg-blue-50/50 dark:bg-blue-950/40 border-blue-500 text-blue-900 dark:text-blue-200'
                        : 'bg-slate-50/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className="text-xs font-bold block">Nuvem PSC (OIDC)</span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">BirdID / SafeID / NeoID</span>
                  </div>
                </div>

                {certType === IcpCertificateType.CLOUD_PSC_OIDC && (
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Provedor PSC em Nuvem Homologado ICP-Brasil
                    </label>
                    <select
                      value={pscProvider}
                      onChange={(e) => setPscProvider(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-slate-900 dark:text-slate-100"
                    >
                      <option value="BirdID (Soluti)">BirdID (Soluti - ITI 02/2019)</option>
                      <option value="SafeID (Certisign)">SafeID (Certisign - ITI 03/2019)</option>
                      <option value="NeoID (Serpro)">NeoID (Serpro - ITI 01/2019)</option>
                      <option value="VIDaaS (Valid)">VIDaaS (Valid - ITI 04/2019)</option>
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      {certType === IcpCertificateType.A3_HARDWARE_TOKEN ? 'PIN do Token Criptográfico A3' : 'Senha de Autorização do Certificado'}
                    </label>
                    <input
                      type="password"
                      value={certPin}
                      onChange={(e) => setCertPin(e.target.value)}
                      placeholder="••••••••"
                      className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Autoridade de Carimbo do Tempo (ACT Credenciada)
                    </label>
                    <div className="text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-slate-600 dark:text-slate-300 flex items-center justify-between">
                      <span>ACT Observatório Nacional (DOC-ICP-11)</span>
                      <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400">2.16.76.1.4.1</span>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  <strong>Efeito Jurídico Pleno:</strong> Ao assinar este lote, todos os registros selecionados serão chancelados com validade probatória irrefutável e travados contra alterações posteriores (*WORM Seal*). Qualquer retificação demandará termo formal vinculado (CFP nº 001/2009 Art. 9º).
                </div>

                {/* BOTÃO DE ASSINATURA EM LOTE */}
                <button
                  type="button"
                  onClick={handleExecuteBatchSignature}
                  disabled={isSigning || selectedIds.length === 0}
                  className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-lg shadow-blue-500/20 transition flex items-center justify-center space-x-2"
                >
                  {isSigning ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileCheck2 className="w-4 h-4" />
                  )}
                  <span>
                    Assinar & Selar Lote ({selectedIds.length} Itens) com Certificado ICP-Brasil
                  </span>
                </button>
              </div>
            </div>
          ) : activeTab === 'history' ? (
            /* ================= ABA HISTÓRICO DE LOTES ================= */
            <div className="space-y-4 max-w-4xl mx-auto">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Manifestos de Lotes Selados ({manifests.length})
              </h4>

              {manifests.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  Nenhum lote foi assinado anteriormente.
                </div>
              ) : (
                manifests.map((m) => (
                  <div
                    key={m.id}
                    className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center space-x-2">
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          Lote #{m.id.substring(0, 8)} • {m.totalItemsCount} Registros Selados
                        </span>
                        <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          {m.signatureStandard}
                        </span>
                      </div>
                      <span className="text-xs text-slate-400 font-mono">
                        {new Date(m.signedAt).toLocaleString('pt-BR')}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/50">
                        <span className="text-[10px] text-slate-400 block">Merkle Root:</span>
                        <span className="font-mono text-[11px] text-slate-800 dark:text-slate-200 break-all">
                          {m.merkleRootHash}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/50">
                        <span className="text-[10px] text-slate-400 block">Titular do Certificado:</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {m.certificateSubjectDn.split(',')[0]}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                      <span className="text-[11px] text-slate-500 font-mono select-all truncate max-w-md">
                        Token: {m.publicValidationToken}
                      </span>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => copyToClipboard(m.publicValidationToken)}
                          className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center space-x-1"
                        >
                          <Copy className="w-3 h-3" />
                          <span>Copiar</span>
                        </button>
                        <button
                          onClick={() => {
                            setVerifyToken(m.publicValidationToken);
                            setActiveTab('verify');
                          }}
                          className="px-2.5 py-1 text-xs rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 hover:bg-blue-100 transition flex items-center space-x-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Validar</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            /* ================= ABA VALIDADOR PÚBLICO ================= */
            <div className="space-y-6 max-w-2xl mx-auto">
              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center space-x-2">
                  <QrCode className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Validador Notarial Público de Lotes ICP-Brasil
                  </h4>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Insira o token de validação do lote emitido pela plataforma para verificar a integridade matemática da <strong>Merkle Tree</strong>, o certificado qualificado do psicólogo e o <strong>Carimbo do Tempo TSA oficial</strong>.
                </p>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                    Token Público do Lote (icp_batch_v1_...)
                  </label>
                  <input
                    type="text"
                    value={verifyToken}
                    onChange={(e) => setVerifyToken(e.target.value)}
                    placeholder="icp_batch_v1_eyJtYW5pZmVzdElkIjoi..."
                    className="w-full text-xs font-mono p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-slate-900 dark:text-slate-100"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleVerifyToken}
                  disabled={isVerifying || !verifyToken.trim()}
                  className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition flex items-center justify-center space-x-2"
                >
                  {isVerifying ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>Atestar Autenticidade & Merkle Root</span>
                </button>
              </div>

              {/* RESULTADO DA VALIDAÇÃO */}
              {verifyResult && (
                <div
                  className={`p-4 rounded-xl border ${
                    verifyResult.valid
                      ? 'bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
                      : 'bg-red-50/50 dark:bg-red-950/30 border-red-300 dark:border-red-800'
                  } space-y-3`}
                >
                  <div className="flex items-center space-x-2">
                    {verifyResult.valid ? (
                      <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                    )}
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                      {verifyResult.valid ? 'Lote Verificado e Válido (Fé Pública Plena)' : 'Falha na Validação Notarial'}
                    </h5>
                  </div>

                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                    {verifyResult.details}
                  </p>

                  {verifyResult.manifest && (
                    <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-400">Profissional Responsável:</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {verifyResult.manifest.therapistName} (CRP {verifyResult.manifest.therapistCrp})
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-400">Total de Registros Selados:</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {verifyResult.manifest.totalItemsCount} documentos
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-400">Data da Assinatura:</span>
                        <span className="font-mono text-slate-800 dark:text-slate-200">
                          {new Date(verifyResult.manifest.signedAt).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                        <span className="text-slate-400 text-[10px] block">Merkle Root Válida:</span>
                        <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 break-all">
                          {verifyResult.manifest.merkleRootHash}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
