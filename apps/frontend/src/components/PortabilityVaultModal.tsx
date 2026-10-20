import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Lock,
  KeyRound,
  Download,
  CheckCircle2,
  Copy,
  Check,
  FileLock2,
  Unlock,
  History
} from 'lucide-react';
import { PortabilityKdfAlgorithm } from '@terapiainfoco/shared';
import type {
  ConsolidatedPortabilityPayload,
  EncryptedPortabilityEncFile,
  PortabilityVaultVerificationResult
} from '@terapiainfoco/shared';
import { api } from '../services/api';

interface PortabilityVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId?: string;
  patientName?: string;
}

export function PortabilityVaultModal({
  isOpen,
  onClose,
  patientId,
  patientName
}: PortabilityVaultModalProps) {
  const [activeTab, setActiveTab] = useState<'generate' | 'verify_decrypt' | 'history'>('generate');
  const [holderPassphrase, setHolderPassphrase] = useState('SenhaTitularPortabilidade#2026');
  const [kdfAlgorithm, setKdfAlgorithm] = useState<PortabilityKdfAlgorithm>(PortabilityKdfAlgorithm.ARGON2ID);
  const [requestReason, setRequestReason] = useState(
    'Portabilidade integral e autodeterminação informativa (LGPD Art. 18, incisos II e V)'
  );

  const [generating, setGenerating] = useState(false);
  const [generatedVault, setGeneratedVault] = useState<EncryptedPortabilityEncFile | null>(null);
  const [generatedFileName, setGeneratedFileName] = useState('');
  const [copiedToken, setCopiedToken] = useState(false);

  const [verifyPassphrase, setVerifyPassphrase] = useState('SenhaTitularPortabilidade#2026');
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<PortabilityVaultVerificationResult | null>(null);
  const [decryptedPayload, setDecryptedPayload] = useState<ConsolidatedPortabilityPayload | null>(null);

  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && patientId) {
      api
        .getPatientPortabilityVaultHistory(patientId)
        .then((res) => setHistoryItems(res.vaults || []))
        .catch(() => {});
    }
  }, [isOpen, patientId]);

  if (!isOpen || !patientId) return null;

  const handleGenerateEnc = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setGenerating(true);
      setFeedback(null);
      const res = await api.generatePortabilityEncVault({
        patientId,
        holderPassphrase,
        kdfAlgorithm,
        requestReason
      });
      setGeneratedVault(res.vaultFile);
      setGeneratedFileName(res.fileName);
      setVerificationResult(null);
      setDecryptedPayload(null);
      setFeedback(res.message);

      const hist = await api.getPatientPortabilityVaultHistory(patientId);
      setHistoryItems(hist.vaults || []);
    } catch (err: any) {
      setFeedback(`Erro ao gerar cofre .enc: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadEnc = () => {
    if (!generatedVault) return;
    const blob = new Blob([JSON.stringify(generatedVault, null, 2)], {
      type: 'application/octet-stream'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = generatedFileName || `prontuario-titular-${patientId.slice(0, 8)}.enc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleVerifyAndDecrypt = async () => {
    if (!generatedVault) return;
    try {
      setVerifying(true);
      setFeedback(null);
      const res = await api.decryptPortabilityEncVault({
        vaultFile: generatedVault,
        holderPassphrase: verifyPassphrase
      });
      setVerificationResult(res.verification);
      setDecryptedPayload(res.payload);
      setFeedback(res.message);
    } catch (err: any) {
      setDecryptedPayload(null);
      setFeedback(`Falha na decifragem/autenticação: ${err.message}`);
    } finally {
      setVerifying(false);
    }
  };

  const handleCopySeal = () => {
    if (!generatedVault?.notarySeal.sealToken) return;
    navigator.clipboard.writeText(generatedVault.notarySeal.sealToken);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-4xl w-full p-5 sm:p-6 space-y-5 shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-200 dark:border-slate-800 gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <FileLock2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  Cofre de Portabilidade Clínica Cifrado (.enc) — Argon2id + AES-256-GCM
                </h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Titular: <strong className="text-slate-700 dark:text-slate-200">{patientName || patientId}</strong> • 11 Seções Clínicas Consolidadas com Merkle Tree SHA-256
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white text-lg px-2 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Abas */}
        <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          <button
            type="button"
            onClick={() => setActiveTab('generate')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'generate'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            1. Gerar Pacote .enc (Argon2id)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('verify_decrypt')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'verify_decrypt'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            <Unlock className="w-3.5 h-3.5" />
            2. Verificador de Integridade & Decifragem
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'history'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            3. Histórico de Cofres Emitidos ({historyItems.length})
          </button>
        </div>

        {feedback && (
          <div className="p-3.5 rounded-2xl bg-teal-500/10 border border-teal-500/30 text-teal-800 dark:text-teal-200 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-teal-600 dark:text-teal-400" />
            <span>{feedback}</span>
          </div>
        )}

        {activeTab === 'generate' && (
          <div className="space-y-4">
            <form onSubmit={handleGenerateEnc} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Senha Pessoal do Titular (Mín. 8 caracteres)
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={holderPassphrase}
                    onChange={(e) => setHolderPassphrase(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Função de Derivação de Chave (KDF)
                </label>
                <select
                  value={kdfAlgorithm}
                  onChange={(e) => setKdfAlgorithm(e.target.value as PortabilityKdfAlgorithm)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                >
                  <option value={PortabilityKdfAlgorithm.ARGON2ID}>
                    Argon2id (RFC 9106 Memory-Hard 16 MiB + AES-256-GCM AAD)
                  </option>
                  <option value={PortabilityKdfAlgorithm.PBKDF2_SHA512}>
                    PBKDF2-HMAC-SHA512 (100.000 Iterações FIPS)
                  </option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Protocolo / Finalidade da Portabilidade (LGPD Art. 18)
                </label>
                <input
                  type="text"
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="md:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={generating || holderPassphrase.trim().length < 8}
                  className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-teal-500/20 disabled:opacity-50 cursor-pointer"
                >
                  <FileLock2 className="w-4 h-4" />
                  {generating ? 'Derivando Chave Argon2id & Selando...' : 'Gerar Arquivo Cifrado .enc'}
                </button>
              </div>
            </form>

            {generatedVault && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-teal-500/30 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">
                      {generatedVault.fileHeader} • {generatedVault.kdfAlgorithm}
                    </span>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      {generatedFileName}
                    </h4>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('verify_decrypt')}
                      className="px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold cursor-pointer"
                    >
                      Testar Decifragem
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadEnc}
                      className="px-4 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Baixar .enc
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-500 block">Merkle Root SHA-256 (11 Seções):</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200 break-all">
                      {generatedVault.merkleRootSha256}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Selo Notarial WORM RFC 8785:</span>
                      <button
                        type="button"
                        onClick={handleCopySeal}
                        className="text-teal-600 dark:text-teal-400 flex items-center gap-1 cursor-pointer"
                      >
                        {copiedToken ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copiedToken ? 'Copiado' : 'Copiar'}
                      </button>
                    </div>
                    <span className="font-mono text-teal-700 dark:text-teal-300 break-all">
                      {generatedVault.notarySeal.sealToken}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pt-1">
                  {generatedVault.sectionDigests.map((sec) => (
                    <div
                      key={sec.section}
                      className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px]"
                    >
                      <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {sec.label}
                      </div>
                      <div className="text-slate-500 mt-0.5">
                        Registros: <strong>{sec.recordsCount}</strong> • SHA256: {sec.sha256Digest.slice(0, 8)}…
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'verify_decrypt' && (
          <div className="space-y-4">
            {!generatedVault ? (
              <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/50 text-center text-xs text-slate-500">
                Gere primeiro um pacote <code>.enc</code> na aba 1 para testar a verificação de integridade e decifragem autenticada.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-3 items-end">
                  <div className="flex-1 w-full">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Senha do Titular para Decifragem & Verificação GCM
                    </label>
                    <input
                      type="password"
                      value={verifyPassphrase}
                      onChange={(e) => setVerifyPassphrase(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleVerifyAndDecrypt}
                    disabled={verifying}
                    className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    {verifying ? 'Validando Argon2id & Merkle...' : 'Verificar & Decifrar .enc'}
                  </button>
                </div>

                {verificationResult && (
                  <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2 text-xs">
                    <div className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      {verificationResult.details}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-1">
                      <div>Header V2: <strong>{verificationResult.headerValid ? 'OK' : 'FALHA'}</strong></div>
                      <div>Hash Ciphertext: <strong>{verificationResult.ciphertextHashMatch ? 'OK' : 'FALHA'}</strong></div>
                      <div>Merkle Root: <strong>{verificationResult.merkleRootMatch ? 'OK' : 'FALHA'}</strong></div>
                      <div>Selo WORM: <strong>{verificationResult.notarySealValid ? 'OK' : 'FALHA'}</strong></div>
                    </div>
                  </div>
                )}

                {decryptedPayload && (
                  <div className="p-3.5 rounded-2xl bg-slate-900 text-slate-100 font-mono text-[11px] max-h-60 overflow-y-auto">
                    <pre>{JSON.stringify(decryptedPayload, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-2">
            {historyItems.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                Nenhum cofre .enc gerado para este paciente na sessão atual.
              </p>
            ) : (
              historyItems.map((item) => (
                <div
                  key={item.vaultId}
                  className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white">{item.vaultId}</span>
                    <span className="ml-2 px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-700 dark:text-teal-300 text-[10px] font-semibold">
                      {item.kdfAlgorithm}
                    </span>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                      Merkle Root: {item.merkleRootSha256.slice(0, 24)}… • Selo: {item.sealToken}
                    </p>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {new Date(item.exportedAt).toLocaleString('pt-BR')}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
