import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Plus,
  Printer,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Copy,
  Check,
  XCircle,
  FileText,
  DollarSign,
  Scale
} from 'lucide-react';
import QRCode from 'qrcode';
import {
  type ClinicalReceipt,
  type CreateClinicalReceiptDTO,
  type CancelReceiptDTO,
  type ValidateReceiptPublicResponse,
  type FeeContract,
  type CreateFeeContractDTO,
  ReceiptPurpose,
  BillingModality,
  PaymentMethod,
  PaymentStatus
} from '@terapiainfoco/shared';
import { api } from '../services/api';

interface BillingReceiptsModuleProps {
  patientId?: string;
  patientName?: string;
}

export function BillingReceiptsModule({
  patientId = '00000000-0000-0000-0000-000000000002',
  patientName = 'Mariana Silva de Oliveira'
}: BillingReceiptsModuleProps) {
  const [receipts, setReceipts] = useState<ClinicalReceipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Recibo selecionado para exibição / impressão
  const [selectedReceipt, setSelectedReceipt] = useState<ClinicalReceipt | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Modais
  const [showCreateReceiptModal, setShowCreateReceiptModal] = useState(false);
  const [showContractModal, setShowContractModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showValidatorModal, setShowValidatorModal] = useState(false);

  // Estado do Form de Recibo
  const [createLoading, setCreateLoading] = useState(false);
  const [receiptAmount, setReceiptAmount] = useState('250,00');
  const [receiptPurpose, setReceiptPurpose] = useState<ReceiptPurpose>(ReceiptPurpose.CONVENIO_REIMBURSO);
  const [billingModality, setBillingModality] = useState<BillingModality>(BillingModality.PER_SESSION);
  const [sessionModality, setSessionModality] = useState<'ONLINE' | 'PRESENCIAL'>('ONLINE');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.PIX);
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [sessionDateInput, setSessionDateInput] = useState(() => new Date().toISOString().split('T')[0]);
  const [receiptNotes, setReceiptNotes] = useState('Atendimento psicoterápico individual em modalidade remota (TCC).');

  // Responsável financeiro opcional
  const [hasResponsible, setHasResponsible] = useState(false);
  const [respName, setRespName] = useState('');
  const [respCpf, setRespCpf] = useState('');
  const [respKinship, setRespKinship] = useState('Mãe');

  // Cancelamento
  const [cancelReason, setCancelReason] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);

  // Contrato de Honorários
  const [contractLoading, setContractLoading] = useState(false);
  const [sessionPriceInput, setSessionPriceInput] = useState('250,00');
  const [cancellationHours, setCancellationHours] = useState(24);
  const [paymentDueDateRule, setPaymentDueDateRule] = useState('Ao final de cada sessão via PIX ou até o dia 5 do mês subsequente.');
  const [createdContract, setCreatedContract] = useState<FeeContract | null>(null);

  // Validador público
  const [validateTokenInput, setValidateTokenInput] = useState('');
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidateReceiptPublicResponse | null>(null);

  // Total consolidado
  const [totalFormatted, setTotalFormatted] = useState('R$ 0,00');

  const fetchReceipts = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.listClinicalReceipts(patientId);
      setReceipts(res.receipts);
      setTotalFormatted(res.totalFormatted);
      if (res.receipts.length > 0 && !selectedReceipt) {
        selectReceipt(res.receipts[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Falha ao listar recibos de honorários');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReceipts();
  }, [patientId]);

  const selectReceipt = async (receipt: ClinicalReceipt) => {
    setSelectedReceipt(receipt);
    if (receipt.validationToken) {
      try {
        const verifyUrl = `${window.location.origin}/verify/receipt/${receipt.validationToken}`;
        const url = await QRCode.toDataURL(verifyUrl, {
          width: 140,
          margin: 1,
          color: { dark: '#0f172a', light: '#ffffff' }
        });
        setQrCodeDataUrl(url);
      } catch {
        setQrCodeDataUrl(null);
      }
    } else {
      setQrCodeDataUrl(null);
    }
  };

  const parseAmountToCents = (val: string): number => {
    const clean = val.replace(/[^\d,.]/g, '').replace(',', '.');
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : Math.round(parsed * 100);
  };

  const handleCreateReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountCents = parseAmountToCents(receiptAmount);
    if (amountCents <= 0) {
      setError('Informe um valor monetário válido em centavos ou reais.');
      return;
    }

    try {
      setCreateLoading(true);
      setError(null);

      const dto: CreateClinicalReceiptDTO = {
        patientId,
        purpose: receiptPurpose,
        modality: billingModality,
        amountCents,
        paymentMethod,
        paymentDate,
        sessionsCovered: [
          {
            data: sessionDateInput || paymentDate,
            modalidade: sessionModality
          }
        ],
        notes: receiptNotes,
        financialResponsible: hasResponsible && respName.trim() ? {
          nome: respName.trim(),
          cpf: respCpf.trim() || '000.000.000-00',
          parentesco: respKinship
        } : undefined
      };

      const newReceipt = await api.createClinicalReceipt(dto);
      setSuccessMsg(`Recibo ${newReceipt.receiptNumber} emitido com sucesso! Selo imutável WORM gerado.`);
      setShowCreateReceiptModal(false);
      await fetchReceipts();
      selectReceipt(newReceipt);
    } catch (err: any) {
      setError(err.message || 'Erro ao emitir recibo');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleCancelReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReceipt) return;
    if (!cancelReason.trim()) {
      setError('Informe a justificativa formal para o cancelamento do recibo.');
      return;
    }

    try {
      setCancelLoading(true);
      setError(null);
      const dto: CancelReceiptDTO = {
        receiptId: selectedReceipt.id,
        cancelReason: cancelReason.trim()
      };
      const cancelled = await api.cancelClinicalReceipt(dto);
      setSuccessMsg(`Recibo ${cancelled.receiptNumber} cancelado formalmente com registro de auditoria.`);
      setShowCancelModal(false);
      setCancelReason('');
      await fetchReceipts();
      selectReceipt(cancelled);
    } catch (err: any) {
      setError(err.message || 'Erro ao cancelar recibo');
    } finally {
      setCancelLoading(false);
    }
  };

  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    const sessionPriceCents = parseAmountToCents(sessionPriceInput);
    if (sessionPriceCents <= 0) {
      setError('Informe um valor por sessão válido.');
      return;
    }

    try {
      setContractLoading(true);
      setError(null);
      const dto: CreateFeeContractDTO = {
        patientId,
        sessionPriceCents,
        cancellationPolicyHours: Number(cancellationHours),
        paymentDueDateRule
      };
      const contract = await api.createFeeContract(dto);
      setCreatedContract(contract);
      setSuccessMsg('Termo de Honorários e Prestação de Serviços Psicológicos gerado e assinado digitalmente!');
    } catch (err: any) {
      setError(err.message || 'Erro ao gerar termo de honorários');
    } finally {
      setContractLoading(false);
    }
  };

  const handleValidateToken = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!validateTokenInput.trim()) return;

    try {
      setValidating(true);
      setValidationResult(null);
      const res = await api.validateReceiptPublic(validateTokenInput.trim());
      setValidationResult(res);
    } catch (err: any) {
      setValidationResult({
        success: false,
        valid: false,
        message: err.message || 'Recibo não encontrado ou inválido.'
      });
    } finally {
      setValidating(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(id);
    setTimeout(() => setCopiedToken(null), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Seção de Faturamento */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900/60 p-5 rounded-3xl border border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400 font-bold text-xs uppercase tracking-wider">
            <DollarSign className="w-4 h-4" />
            <span>Faturamento Clínico & Honorários</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-1">
            Recibos de Honorários & Termos de Serviços
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Emissão probatória para Reembolso de Convênio e DMED/IRPF de {patientName}, com validação anônima e selo WORM.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => {
              setShowValidatorModal(true);
              if (selectedReceipt) {
                setValidateTokenInput(selectedReceipt.validationToken);
                api.validateReceiptPublic(selectedReceipt.validationToken).then(setValidationResult);
              }
            }}
            className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer"
          >
            <QrCode className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span>Validador Convênio</span>
          </button>

          <button
            onClick={() => setShowContractModal(true)}
            className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer"
          >
            <Scale className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <span>Termo de Honorários</span>
          </button>

          <button
            onClick={() => setShowCreateReceiptModal(true)}
            className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-teal-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Emitir Recibo</span>
          </button>
        </div>
      </div>

      {/* Alertas de Feedback */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Grid Principal: Lista à Esquerda + Visualizador Timbrado à Direita */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Painel Esquerdo: Lista de Recibos */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Total Faturado</span>
              <span className="text-xl font-bold text-teal-600 dark:text-teal-400">{totalFormatted}</span>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Recibos Emitidos</span>
              <span className="text-lg font-bold text-slate-800 dark:text-white">{receipts.length}</span>
            </div>
            <button
              onClick={fetchReceipts}
              title="Atualizar"
              className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="space-y-2.5 max-h-[620px] overflow-y-auto pr-1">
            {receipts.length === 0 ? (
              <div className="p-8 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 space-y-2">
                <FileText className="w-8 h-8 text-slate-400 mx-auto" />
                <p>Nenhum recibo de honorários emitido para este paciente.</p>
                <button
                  onClick={() => setShowCreateReceiptModal(true)}
                  className="text-teal-600 dark:text-teal-400 font-semibold underline cursor-pointer"
                >
                  Emitir primeiro recibo
                </button>
              </div>
            ) : (
              receipts.map((rec) => {
                const isSelected = selectedReceipt?.id === rec.id;
                const isCancelled = rec.paymentStatus === PaymentStatus.CANCELLED;

                return (
                  <div
                    key={rec.id}
                    onClick={() => selectReceipt(rec)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer relative ${
                      isSelected
                        ? 'bg-teal-50/50 dark:bg-teal-950/20 border-teal-500 shadow-sm'
                        : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">{rec.receiptNumber}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                            isCancelled
                              ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300'
                              : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                          }`}>
                            {isCancelled ? 'Cancelado' : 'Quitado'}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-1">
                          {rec.amountFormatted} <span className="text-[11px] font-normal text-slate-500">via {rec.paymentMethod}</span>
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="text-[11px] text-slate-500 block">
                          {new Date(rec.paymentDate).toLocaleDateString('pt-BR')}
                        </span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          {rec.modality}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800/80 pt-2">
                      <span>{rec.purpose}</span>
                      <span className="font-mono text-[10px]">{rec.validationToken.substring(0, 12)}...</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Painel Direito: Exibição Timbrada do Recibo Oficial */}
        <div className="lg:col-span-7">
          {selectedReceipt ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              {/* Barra de Ações do Documento */}
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Recibo Oficial: {selectedReceipt.receiptNumber}
                  </span>
                  {selectedReceipt.paymentStatus === PaymentStatus.CANCELLED ? (
                    <span className="text-[10px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-0.5 rounded-full border border-rose-200">
                      Cancelado
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> Válido WORM
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {selectedReceipt.paymentStatus !== PaymentStatus.CANCELLED && (
                    <button
                      onClick={() => setShowCancelModal(true)}
                      className="px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-800 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Cancelar</span>
                    </button>
                  )}

                  <button
                    onClick={() => window.print()}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Imprimir</span>
                  </button>
                </div>
              </div>

              {/* Corpo Timbrado do Recibo (Padrão Receita Federal / DMED / CFP) */}
              <div className="p-6 sm:p-8 space-y-6 text-slate-800 dark:text-slate-200 font-sans print:p-0 print:m-0">
                {/* Cabeçalho Profissional */}
                <div className="border-b border-slate-200 dark:border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white uppercase tracking-tight">
                      {selectedReceipt.therapistName}
                    </h3>
                    <p className="text-xs text-teal-600 dark:text-teal-400 font-semibold">
                      Psicóloga Clínica • {selectedReceipt.therapistCrp}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      CPF: {selectedReceipt.therapistCpfOrCnpj} • Livro Caixa / Carnê-Leão
                    </p>
                  </div>

                  <div className="sm:text-right">
                    <span className="text-xs font-mono font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-lg">
                      {selectedReceipt.receiptNumber}
                    </span>
                    <span className="block text-[11px] text-slate-500 mt-1">
                      Data de Quitação: {new Date(selectedReceipt.paymentDate).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>

                {/* Banner de Cancelamento se Houver */}
                {selectedReceipt.paymentStatus === PaymentStatus.CANCELLED && (
                  <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-2xl text-xs text-rose-800 dark:text-rose-200 space-y-1">
                    <div className="font-bold flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-600" />
                      RECIBO CANCELADO EM {selectedReceipt.cancelledAt && new Date(selectedReceipt.cancelledAt).toLocaleString('pt-BR')}
                    </div>
                    <p><strong>Motivo:</strong> {selectedReceipt.cancelReason}</p>
                  </div>
                )}

                {/* Bloco Declaratório do Recibo */}
                <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Declaração de Recebimento de Honorários
                    </span>
                    <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                      {selectedReceipt.amountFormatted}
                    </span>
                  </div>

                  <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                    Recebi de <strong className="text-slate-900 dark:text-white">{selectedReceipt.patientName}</strong>
                    {selectedReceipt.patientCpf && ` (CPF: ${selectedReceipt.patientCpf})`}
                    {selectedReceipt.financialResponsible && (
                      <span className="text-slate-600 dark:text-slate-400">
                        {', por intermédio de seu responsável financeiro '}
                        <strong className="text-slate-900 dark:text-white">{selectedReceipt.financialResponsible.nome}</strong>
                        {selectedReceipt.financialResponsible.cpf && ` (CPF: ${selectedReceipt.financialResponsible.cpf})`}
                        {selectedReceipt.financialResponsible.parentesco && ` [${selectedReceipt.financialResponsible.parentesco}]`}
                      </span>
                    )}
                    {', a quantia líquida de '}
                    <strong className="text-slate-900 dark:text-white">{selectedReceipt.amountFormatted} ({selectedReceipt.amountInWords})</strong>
                    {', referente à prestação de serviços profissionais de Psicologia Clínica na modalidade '}
                    <strong className="text-slate-900 dark:text-white">{selectedReceipt.modality}</strong>
                    {', liquidada em '}
                    <strong>{new Date(selectedReceipt.paymentDate).toLocaleDateString('pt-BR')}</strong>
                    {' através de '}
                    <strong className="text-slate-900 dark:text-white">{selectedReceipt.paymentMethod}</strong>.
                  </p>
                </div>

                {/* Sessões Discriminadas (Exigência DMED / Convênio) */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">
                    Discriminação das Sessões Cobertas
                  </h4>
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="p-2.5">Item</th>
                          <th className="p-2.5">Data do Atendimento</th>
                          <th className="p-2.5">Modalidade</th>
                          <th className="p-2.5">Finalidade</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {selectedReceipt.sessionsCovered.map((s, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                            <td className="p-2.5 font-bold text-slate-500">#{idx + 1}</td>
                            <td className="p-2.5 font-medium">{new Date(s.data).toLocaleDateString('pt-BR')}</td>
                            <td className="p-2.5 text-slate-600 dark:text-slate-400">{s.modalidade}</td>
                            <td className="p-2.5 text-slate-600 dark:text-slate-400">{selectedReceipt.purpose}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {selectedReceipt.notes && (
                  <div className="text-xs text-slate-500 italic bg-slate-50 dark:bg-slate-800/30 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                    Observações: {selectedReceipt.notes}
                  </div>
                )}

                {/* Rodapé de Autenticidade & QR Code para Reembolso de Convênio */}
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="space-y-1.5 text-left text-xs">
                    <div className="flex items-center gap-1.5 text-teal-600 dark:text-teal-400 font-bold">
                      <ShieldCheck className="w-4 h-4" />
                      <span>Selo Probatório WORM & Integridade Criptográfica</span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-mono">
                      Hash SHA-256: {selectedReceipt.documentHashSha256.substring(0, 32)}...
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono">
                      Token Público: {selectedReceipt.validationToken}
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => copyToClipboard(selectedReceipt.validationToken, selectedReceipt.id)}
                        className="text-[11px] font-semibold text-teal-600 hover:text-teal-500 flex items-center gap-1 cursor-pointer"
                      >
                        {copiedToken === selectedReceipt.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedToken === selectedReceipt.id ? 'Token copiado!' : 'Copiar Token para Operadora'}</span>
                      </button>
                    </div>
                  </div>

                  {qrCodeDataUrl && (
                    <div className="text-center p-2 bg-white rounded-2xl border border-slate-200 shadow-sm shrink-0">
                      <img src={qrCodeDataUrl} alt="QR Code de Autenticidade" className="w-24 h-24 mx-auto" />
                      <span className="text-[9px] font-bold text-slate-600 block mt-1 uppercase tracking-wider">
                        Validar Recibo
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 rounded-3xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center text-slate-500">
              Selecione um recibo de honorários ao lado para visualizar os detalhes timbrados.
            </div>
          )}
        </div>
      </div>

      {/* Modal: Emitir Novo Recibo de Honorários */}
      {showCreateReceiptModal && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-xl w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                Emitir Recibo de Honorários Clínicos
              </h3>
              <button onClick={() => setShowCreateReceiptModal(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleCreateReceipt} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Valor Total (R$) *
                  </label>
                  <input
                    type="text"
                    required
                    value={receiptAmount}
                    onChange={(e) => setReceiptAmount(e.target.value)}
                    placeholder="Ex: 250,00"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Data do Pagamento *
                  </label>
                  <input
                    type="date"
                    required
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Forma de Pagamento *
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500 cursor-pointer"
                  >
                    <option value={PaymentMethod.PIX}>PIX Instantâneo</option>
                    <option value={PaymentMethod.CREDIT_CARD}>Cartão de Crédito</option>
                    <option value={PaymentMethod.DEBIT_CARD}>Cartão de Débito</option>
                    <option value={PaymentMethod.BANK_TRANSFER}>Transferência / TED</option>
                    <option value={PaymentMethod.CASH}>Dinheiro em Espécie</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Finalidade / Destinação *
                  </label>
                  <select
                    value={receiptPurpose}
                    onChange={(e) => setReceiptPurpose(e.target.value as ReceiptPurpose)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500 cursor-pointer"
                  >
                    <option value={ReceiptPurpose.CONVENIO_REIMBURSO}>Reembolso Convênio / Operadora</option>
                    <option value={ReceiptPurpose.IRPF_CARNE_LEAO}>Declaração IRPF / Carnê-Leão / DMED</option>
                    <option value={ReceiptPurpose.SIMPLES_QUITACAO}>Comprovante de Quitação Simples</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Modalidade de Cobrança *
                  </label>
                  <select
                    value={billingModality}
                    onChange={(e) => setBillingModality(e.target.value as BillingModality)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500 cursor-pointer"
                  >
                    <option value={BillingModality.PER_SESSION}>Por Sessão Individual</option>
                    <option value={BillingModality.MONTHLY_PACKAGE}>Pacote Mensal</option>
                    <option value={BillingModality.CUSTOM_PACKAGE}>Pacote Customizado</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Atendimento *
                  </label>
                  <select
                    value={sessionModality}
                    onChange={(e) => setSessionModality(e.target.value as 'ONLINE' | 'PRESENCIAL')}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500 cursor-pointer"
                  >
                    <option value="ONLINE">Online / Remoto</option>
                    <option value="PRESENCIAL">Presencial</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Data da Sessão
                  </label>
                  <input
                    type="date"
                    value={sessionDateInput}
                    onChange={(e) => setSessionDateInput(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              {/* Responsável Financeiro (Dependentes / Menores) */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={hasResponsible}
                    onChange={(e) => setHasResponsible(e.target.checked)}
                    className="rounded text-teal-600 focus:ring-teal-500 w-4 h-4"
                  />
                  <span>Recibo em nome de Responsável Financeiro (Dependente / Menor)</span>
                </label>

                {hasResponsible && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">Nome Completo</label>
                      <input
                        type="text"
                        value={respName}
                        onChange={(e) => setRespName(e.target.value)}
                        placeholder="Nome do pagador"
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">CPF do Pagador</label>
                      <input
                        type="text"
                        value={respCpf}
                        onChange={(e) => setRespCpf(e.target.value)}
                        placeholder="000.000.000-00"
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">Parentesco</label>
                      <input
                        type="text"
                        value={respKinship}
                        onChange={(e) => setRespKinship(e.target.value)}
                        placeholder="Mãe / Pai / Cônjuge"
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Notas Complementares
                </label>
                <textarea
                  rows={2}
                  value={receiptNotes}
                  onChange={(e) => setReceiptNotes(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateReceiptModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-teal-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{createLoading ? 'Emitindo...' : 'Emitir Recibo com Selo WORM'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Cancelar Recibo com Justificativa */}
      {showCancelModal && selectedReceipt && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <XCircle className="w-5 h-5" />
                Cancelar Recibo {selectedReceipt.receiptNumber}
              </h3>
              <button onClick={() => setShowCancelModal(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer">✕</button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Em conformidade com a legislação tributária e auditoria WORM, o recibo não será excluído, mas marcado como <strong>CANCELADO</strong> com carimbo de data/hora e justificativa probatória.
            </p>

            <form onSubmit={handleCancelReceipt} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Justificativa Formal do Cancelamento *
                </label>
                <textarea
                  required
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Ex: Erro na data da sessão informada; emitido novo recibo substituto REC-2026-..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-rose-500 font-sans"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={cancelLoading}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-rose-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" />
                  <span>{cancelLoading ? 'Cancelando...' : 'Confirmar Cancelamento'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Termo / Contrato de Honorários e Prestação de Serviços (RFC-001 §3.6) */}
      {showContractModal && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-xl w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Scale className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                Contrato de Honorários & Prestação de Serviços
              </h3>
              <button onClick={() => setShowContractModal(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer">✕</button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Formalização de honorários conforme Resolução CFP nº 010/2005 (Código de Ética do Psicólogo, Art. 4º e Art. 9º), incluindo preço por sessão, regras de desmarcação e cláusula de confidencialidade estrita.
            </p>

            {createdContract ? (
              <div className="p-4 rounded-2xl bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 space-y-3">
                <div className="flex items-center gap-2 text-teal-800 dark:text-teal-200 font-bold text-xs">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Contrato Gerado com Sucesso!</span>
                </div>
                <div className="text-xs space-y-1.5 text-slate-700 dark:text-slate-300">
                  <p><strong>Paciente:</strong> {createdContract.patientName}</p>
                  <p><strong>Terapeuta:</strong> {createdContract.therapistName} ({createdContract.therapistCrp})</p>
                  <p><strong>Valor por Sessão:</strong> {createdContract.sessionPriceFormatted}</p>
                  <p><strong>Política de Desmarcação:</strong> Aviso prévio de no mínimo {createdContract.cancellationPolicyHours} horas.</p>
                  <p><strong>Regra de Pagamento:</strong> {createdContract.paymentDueDateRule}</p>
                  <p className="text-[11px] font-mono text-slate-500 pt-1">
                    Hash SHA-256: {createdContract.contractHashSha256.substring(0, 32)}...
                  </p>
                </div>
                <button
                  onClick={() => setCreatedContract(null)}
                  className="text-xs text-teal-600 dark:text-teal-400 font-bold underline cursor-pointer"
                >
                  Gerar outro termo
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreateContract} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Valor por Sessão (R$) *
                    </label>
                    <input
                      type="text"
                      required
                      value={sessionPriceInput}
                      onChange={(e) => setSessionPriceInput(e.target.value)}
                      placeholder="250,00"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500 font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Antecedência Mínima Cancelamento (horas) *
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={72}
                      value={cancellationHours}
                      onChange={(e) => setCancellationHours(Number(e.target.value))}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500 font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Regra de Vencimento / Pagamento
                  </label>
                  <input
                    type="text"
                    required
                    value={paymentDueDateRule}
                    onChange={(e) => setPaymentDueDateRule(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-400 space-y-1">
                  <strong>Cláusula Ética de Confidencialidade (CFP Art. 9º):</strong>
                  <p>
                    O atendimento é regido pelo Código de Ética Profissional do Psicólogo, com sigilo estrito. Desmarcações sem aviso prévio de {cancellationHours}h implicam na cobrança integral da vaga reservada.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowContractModal(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Fechar
                  </button>
                  <button
                    type="submit"
                    disabled={contractLoading}
                    className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-teal-500/20 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{contractLoading ? 'Gerando...' : 'Gerar Termo de Honorários'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal: Validador Público de Recibo para Convênio / Operadora */}
      {showValidatorModal && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <QrCode className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                Validador Público de Recibo (Convênio)
              </h3>
              <button onClick={() => setShowValidatorModal(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer">✕</button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Consulte a autenticidade do recibo sem efetuar login. Em cumprimento à LGPD (Art. 11) e sigilo CFP (Art. 9º), o paciente é exibido apenas por iniciais.
            </p>

            <form onSubmit={handleValidateToken} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Token do Recibo
                </label>
                <input
                  type="text"
                  required
                  value={validateTokenInput}
                  onChange={(e) => setValidateTokenInput(e.target.value)}
                  placeholder="rcb_..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <button
                type="submit"
                disabled={validating}
                className="w-full py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${validating ? 'animate-spin' : ''}`} />
                <span>{validating ? 'Validando...' : 'Verificar Autenticidade'}</span>
              </button>
            </form>

            {validationResult && (
              <div className={`p-4 rounded-2xl border text-xs space-y-2 ${
                validationResult.valid
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                  : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
              }`}>
                <div className="flex items-center gap-2 font-bold">
                  {validationResult.valid ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
                  <span>{validationResult.message}</span>
                </div>

                {validationResult.valid && validationResult.receipt && (
                  <div className="space-y-1 pt-1 text-[11px]">
                    <p><strong>Número:</strong> {validationResult.receipt.receiptNumber}</p>
                    <p><strong>Paciente (Iniciais LGPD):</strong> {validationResult.receipt.patientInitials}</p>
                    <p><strong>Profissional:</strong> {validationResult.receipt.therapistName} ({validationResult.receipt.therapistCrp})</p>
                    <p><strong>Valor:</strong> {validationResult.receipt.amountFormatted}</p>
                    <p><strong>Data de Quitação:</strong> {new Date(validationResult.receipt.paymentDate).toLocaleDateString('pt-BR')}</p>
                    <p><strong>Status:</strong> {validationResult.receipt.paymentStatus}</p>
                    <p className="font-mono text-[10px] text-slate-500 pt-1">
                      Hash SHA-256: {validationResult.receipt.documentHashSha256?.substring(0, 32)}...
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
