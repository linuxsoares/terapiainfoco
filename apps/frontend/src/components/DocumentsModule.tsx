import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  FileCheck2, 
  Plus, 
  Printer, 
  QrCode, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  Lock, 
  RefreshCw, 
  Sparkles,
  FileDown,
  Award,
  Stethoscope,
  Share2,
  Copy,
  Check,
  Layers,
  Send,
  DollarSign
} from 'lucide-react';
import QRCode from 'qrcode';
import { 
  DocumentType, 
  ClinicalReportPurpose,
  ReferralUrgency,
  ReferralStatus,
  type DecryptedPsychologicalDocument, 
  type ValidateDocumentResponse,
  type ConsolidatedClinicalReport,
  type ClinicalReferral,
  type GenerateConsolidatedReportDTO,
  type CreateClinicalReferralDTO,
  type CounterReferralDTO
} from '@terapiainfoco/shared';
import { api } from '../services/api';
import { BillingReceiptsModule } from './BillingReceiptsModule';

const CFP_TEMPLATES: Record<DocumentType, { title: string; defaultContent: string }> = {
  [DocumentType.DECLARACAO]: {
    title: 'Declaração de Comparecimento a Acompanhamento Psicológico',
    defaultContent: `Declaro, para os devidos fins a pedido da pessoa interessada, que Mariana Silva de Oliveira, inscrita no CPF sob nº 123.456.789-00, realiza atendimento psicoterápico sob minha responsabilidade profissional às sextas-feiras, com início às 14:00 e término às 14:50 horas.

Por ser a expressão da verdade e em conformidade com o Artigo 11 da Resolução CFP nº 006/2019, firmo a presente.`
  },
  [DocumentType.ATESTADO]: {
    title: 'Atestado Psicológico',
    defaultContent: `Atesto, para os devidos fins de justificativa e adequação laboral, a pedido da paciente, que Mariana Silva de Oliveira, inscrita no CPF sob nº 123.456.789-00, encontra-se em acompanhamento psicológico regular por motivo de transtorno adaptativo associado a estresse agudo ocupacional.

Com base em avaliação psicológica clínica estruturada, recomendo o afastamento das atividades laborais por um período de 03 (três) dias, a contar desta data, para estabilização do quadro e manejo terapêutico.

Documento emitido em estrito cumprimento dos Artigos 9º a 13 da Resolução CFP nº 006/2019.`
  },
  [DocumentType.RELATORIO]: {
    title: 'Relatório Psicológico Clínico',
    defaultContent: `1. IDENTIFICAÇÃO
Autora: Dra. Vanessa Andrade - CRP 06/142980
Paciente: Mariana Silva de Oliveira, CPF: 123.456.789-00
Finalidade: Encaminhamento para avaliação psiquiátrica complementar e acompanhamento multidisciplinar.

2. DESCRIÇÃO DA DEMANDA
A paciente buscou atendimento queixando-se de episódios recorrentes de ansiedade antecipatória, taquicardia situacional e prejuízos no padrão de sono há cerca de 6 meses.

3. PROCEDIMENTO
Foram realizadas 8 (oito) sessões semanais de psicoterapia baseadas na Terapia Cognitivo-Comportamental (TCC), com aplicação de escalas padronizadas e anamnese clínica.

4. ANÁLISE
Observa-se boa capacidade de insight, humor predominantemente ansioso e resposta inicial favorável às técnicas de reestruturação cognitiva, mantendo-se sintomas residuais de insônia intermediária.

5. CONCLUSÃO
Recomenda-se a continuidade do processo psicoterápico concomitante com avaliação médica especializada.`
  },
  [DocumentType.LAUDO]: {
    title: 'Laudo Pericial Psicológico',
    defaultContent: `1. IDENTIFICAÇÃO
Perita Assistente: Dra. Vanessa Andrade - CRP 06/142980
Examinanda: Mariana Silva de Oliveira, CPF: 123.456.789-00

2. DESCRIÇÃO DA DEMANDA
Avaliação psicológica pericial solicitada para fins de averiguação de aptidão e saúde mental.

3. PROCEDIMENTO E INSTRUMENTOS
Bateria de testes validados pelo SATEPSI, anamnese semiestruturada e observação clínica comportamental em 4 encontros presenciais.

4. ANÁLISE DOS DADOS
Os resultados dos instrumentos psicométricos indicam preservação das funções executivas, atenção concentrada adequada e capacidade crítica preservada.

5. CONCLUSÃO TÉCNICA
Com base nos dados apurados, atesta-se plena aptidão psicológica para o exercício das atividades postuladas.`
  }
};

export function DocumentsModule() {
  const [documents, setDocuments] = useState<DecryptedPsychologicalDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal de Criação
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedType, setSelectedType] = useState<DocumentType>(DocumentType.ATESTADO);
  const [title, setTitle] = useState(CFP_TEMPLATES[DocumentType.ATESTADO].title);
  const [content, setContent] = useState(CFP_TEMPLATES[DocumentType.ATESTADO].defaultContent);
  const [patientId] = useState('00000000-0000-0000-0000-000000000002');
  const [createLoading, setCreateLoading] = useState(false);

  // Documento selecionado para visualização / impressão / assinatura
  const [selectedDoc, setSelectedDoc] = useState<DecryptedPsychologicalDocument | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [signLoading, setSignLoading] = useState(false);

  // Download PDF Timbrado Server-Side
  const [downloadingPdf, setDownloadingPdf] = useState(false);


  // Validador Público
  const [showValidatorModal, setShowValidatorModal] = useState(false);
  const [inputToken, setInputToken] = useState('');
  const [validationResult, setValidationResult] = useState<ValidateDocumentResponse | null>(null);
  const [validating, setValidating] = useState(false);

  // Navegação entre Abas Clínicas da RFC-001 §3.5/§3.6 & Resolução CFP nº 006/2019
  const [activeTab, setActiveTab] = useState<'single_docs' | 'consolidated_reports' | 'referrals' | 'billing_receipts'>('single_docs');

  // Relatórios Consolidados Multi-Sessões
  const [consolidatedReports, setConsolidatedReports] = useState<ConsolidatedClinicalReport[]>([]);
  const [selectedConsolidated, setSelectedConsolidated] = useState<ConsolidatedClinicalReport | null>(null);
  const [showConsolidatedModal, setShowConsolidatedModal] = useState(false);
  const [consolidatedLoading, setConsolidatedLoading] = useState(false);
  const [consolidatedSignLoading, setConsolidatedSignLoading] = useState(false);
  const [consolidatedFormData, setConsolidatedFormData] = useState<GenerateConsolidatedReportDTO>({
    patientId: '00000000-0000-0000-0000-000000000002',
    finalidade: ClinicalReportPurpose.JUDICIAL_EXPERT,
    solicitante: 'Juízo da 3ª Vara de Família e Sucessões',
    descricaoDemanda: 'Perícia psicológica solicitada para avaliação de capacidade adaptativa, estabilidade emocional e dinâmica biopsicossocial.',
    dataInicio: '',
    dataFim: '',
    includePsychometrics: true,
    includeGoals: true,
    includeTimelineSessions: true,
    hipoteseDiagnostica: 'CID-11: 6A70 Transtorno Depressivo (Avaliação e Monitoramento Contínuo)',
    parecerFinal: 'Apresenta estabilidade funcional, juízo crítico preservado e condições favoráveis para o pleno exercício de suas atividades cotidianas.',
    prognostico: 'Favorável mediante adesão continuada ao plano psicoterapêutico.',
    encaminhamentosSugeridos: ['Manutenção da psicoterapia em frequência semanal', 'Acompanhamento multiprofissional periódico'],
    localEmissao: 'São Paulo, SP'
  });

  // Encaminhamentos Multidisciplinares Interoperáveis
  const [referrals, setReferrals] = useState<ClinicalReferral[]>([]);
  const [selectedReferral, setSelectedReferral] = useState<ClinicalReferral | null>(null);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [referralLoading, setReferralLoading] = useState(false);
  const [copiedReferralToken, setCopiedReferralToken] = useState<string | null>(null);
  const [referralFormData, setReferralFormData] = useState<CreateClinicalReferralDTO>({
    patientId: '00000000-0000-0000-0000-000000000002',
    recipientProfessional: 'Dr. Roberto Mendes CRM/SP 123456',
    recipientSpecialty: 'Psiquiatria Clínica',
    recipientInstitution: 'Ambulatório Médico Especializado',
    urgency: ReferralUrgency.PRIORITY,
    clinicalSummary: 'Paciente em acompanhamento semanal apresentando quadro de humor deprimido e ansiedade antecipatória com prejuízo funcional.',
    reasonForReferral: 'Avaliação especializada para conduta psicofarmacológica adjuvante e continuidade do cuidado em contra-referência.',
    diagnosticHypothesis: 'CID-11: 6A70 Transtorno Depressivo / 6B00 Transtorno de Ansiedade Generalizada',
    currentMedicationReported: 'Nenhum psicofármaco no momento.',
    includeLatestPsychometric: true
  });

  // Contra-referência
  const [showCounterModal, setShowCounterModal] = useState(false);
  const [counterFormData, setCounterFormData] = useState<CounterReferralDTO>({
    referralId: '',
    counterReferenceNotes: 'Paciente avaliado em interconsulta psiquiátrica. Iniciado Escitalopram 10mg/dia com retorno previsto em 30 dias. Recomendada manutenção da psicoterapia semanal.',
    counterReferredBy: 'Dr. Roberto Mendes - Psiquiatra CRM/SP 123456'
  });

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getDocuments();
      setDocuments(data);
      if (data.length > 0 && !selectedDoc) {
        selectDocument(data[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Falha ao listar documentos');
    } finally {
      setLoading(false);
    }
  };

  const fetchConsolidatedReports = async () => {
    try {
      const data = await api.listConsolidatedReportsByPatient(patientId);
      setConsolidatedReports(data);
      if (data.length > 0 && !selectedConsolidated) {
        setSelectedConsolidated(data[0]);
      }
    } catch (err: any) {
      console.warn('Falha ao listar laudos consolidados:', err);
    }
  };

  const fetchReferrals = async () => {
    try {
      const data = await api.listClinicalReferralsByPatient(patientId);
      setReferrals(data);
      if (data.length > 0 && !selectedReferral) {
        setSelectedReferral(data[0]);
      }
    } catch (err: any) {
      console.warn('Falha ao listar encaminhamentos:', err);
    }
  };

  useEffect(() => {
    fetchDocuments();
    fetchConsolidatedReports();
    fetchReferrals();
  }, []);

  const selectDocument = async (doc: DecryptedPsychologicalDocument) => {
    setSelectedDoc(doc);
    // Gera QR Code da URL de validação pública
    try {
      const validationUrl = `${window.location.origin}/validar/${doc.validationToken}`;
      const dataUrl = await QRCode.toDataURL(validationUrl, {
        width: 160,
        margin: 1,
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      });
      setQrCodeDataUrl(dataUrl);
    } catch {
      setQrCodeDataUrl(null);
    }
  };

  const handleTypeChange = (type: DocumentType) => {
    setSelectedType(type);
    setTitle(CFP_TEMPLATES[type].title);
    setContent(CFP_TEMPLATES[type].defaultContent);
  };

  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreateLoading(true);
      setError(null);
      const newDoc = await api.createDocumentDraft({
        patientId,
        type: selectedType,
        title,
        content
      });
      setSuccessMsg('Rascunho de documento criado com sucesso! Criptografado com AES-256.');
      setShowCreateModal(false);
      await fetchDocuments();
      selectDocument(newDoc);
    } catch (err: any) {
      setError(err.message || 'Erro ao criar documento');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleSignDocument = async () => {
    if (!selectedDoc) return;
    try {
      setSignLoading(true);
      setError(null);
      const signed = await api.signDocument(selectedDoc.id);
      setSelectedDoc(signed);
      setSuccessMsg('Documento assinado digitalmente com sucesso! Selo imutável SHA-256 gerado.');
      await fetchDocuments();
      selectDocument(signed);
    } catch (err: any) {
      setError(err.message || 'Erro ao assinar documento');
    } finally {
      setSignLoading(false);
    }
  };

  const handleValidateToken = async (tokenToTest: string) => {
    if (!tokenToTest.trim()) return;
    try {
      setValidating(true);
      setValidationResult(null);
      const result = await api.validateDocumentToken(tokenToTest.trim());
      setValidationResult(result);
    } catch (err: any) {
      setValidationResult({
        valid: false,
        message: err.message || 'Documento não localizado ou inválido.'
      });
    } finally {
      setValidating(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!selectedDoc) return;
    try {
      setDownloadingPdf(true);
      setError(null);
      const blob = await api.downloadDocumentPdf(selectedDoc.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `documento-cfp-${selectedDoc.id.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setSuccessMsg('PDF timbrado oficial A4 (CFP nº 006/2019) baixado com sucesso!');
    } catch (err: any) {
      setError(err.message || 'Erro ao gerar download do PDF.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleGenerateConsolidatedReport = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setConsolidatedLoading(true);
      setError(null);
      const report = await api.generateConsolidatedReport(consolidatedFormData);
      setSuccessMsg('Laudo Pericial Consolidado gerado com sucesso conforme Resolução CFP nº 006/2019!');
      setShowConsolidatedModal(false);
      await fetchConsolidatedReports();
      setSelectedConsolidated(report);
    } catch (err: any) {
      setError(err.message || 'Erro ao gerar laudo consolidado');
    } finally {
      setConsolidatedLoading(false);
    }
  };

  const handleSignConsolidatedReport = async (reportId: string) => {
    try {
      setConsolidatedSignLoading(true);
      setError(null);
      const signed = await api.signConsolidatedReport(reportId);
      setSuccessMsg('Laudo assinado eletronicamente (hash SHA-256 registrado).');
      setSelectedConsolidated(signed);
      await fetchConsolidatedReports();
    } catch (err: any) {
      setError(err.message || 'Erro ao assinar laudo consolidado');
    } finally {
      setConsolidatedSignLoading(false);
    }
  };

  const handleCreateReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setReferralLoading(true);
      setError(null);
      const ref = await api.createClinicalReferral(referralFormData);
      setSuccessMsg('Guia de encaminhamento multidisciplinar emitida com sucesso!');
      setShowReferralModal(false);
      await fetchReferrals();
      setSelectedReferral(ref);
    } catch (err: any) {
      setError(err.message || 'Erro ao criar encaminhamento');
    } finally {
      setReferralLoading(false);
    }
  };

  const handleRegisterCounterReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setReferralLoading(true);
      setError(null);
      const updated = await api.registerCounterReferral(counterFormData);
      setSuccessMsg('Contra-referência médica registrada e anexada ao prontuário!');
      setShowCounterModal(false);
      setSelectedReferral(updated);
      await fetchReferrals();
    } catch (err: any) {
      setError(err.message || 'Erro ao registrar contra-referência');
    } finally {
      setReferralLoading(false);
    }
  };

  const copyReferralLink = (token: string) => {
    const fullUrl = `${window.location.origin}/verify/referral/${token}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedReferralToken(token);
    setTimeout(() => setCopiedReferralToken(null), 3000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <FileCheck2 className="w-6 h-6 text-teal-600 dark:text-teal-400" />
            Documentos CFP 006/2019 & Laudos Periciais
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Laudos Periciais Multi-Sessões, Encaminhamentos Multidisciplinares e Documentos Oficiais com Assinatura Digital e WORM
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {activeTab === 'single_docs' && (
            <>
              <button
                onClick={() => {
                  setShowValidatorModal(true);
                  if (selectedDoc?.isSigned) {
                    setInputToken(selectedDoc.validationToken);
                    handleValidateToken(selectedDoc.validationToken);
                  }
                }}
                className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-semibold flex items-center gap-2 shadow-sm dark:shadow-none transition-all cursor-pointer"
              >
                <QrCode className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>Validador Público</span>
              </button>

              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-teal-500/20 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Novo Documento</span>
              </button>
            </>
          )}

          {activeTab === 'consolidated_reports' && (
            <button
              onClick={() => setShowConsolidatedModal(true)}
              className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-teal-500/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Gerar Novo Laudo Consolidado</span>
            </button>
          )}

          {activeTab === 'referrals' && (
            <button
              onClick={() => setShowReferralModal(true)}
              className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-teal-500/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Emitir Encaminhamento</span>
            </button>
          )}
        </div>
      </div>

      {/* Seletor de Abas da RFC-001 §3.5 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('single_docs')}
          className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'single_docs'
              ? 'bg-teal-600 text-white shadow-md shadow-teal-500/20'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Documentos Avulsos CFP ({documents.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('consolidated_reports')}
          className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'consolidated_reports'
              ? 'bg-teal-600 text-white shadow-md shadow-teal-500/20'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Laudos Periciais Multi-Sessões ({consolidatedReports.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('referrals')}
          className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'referrals'
              ? 'bg-teal-600 text-white shadow-md shadow-teal-500/20'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Stethoscope className="w-4 h-4" />
          <span>Encaminhamentos & Contra-Referência ({referrals.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('billing_receipts')}
          className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'billing_receipts'
              ? 'bg-teal-600 text-white shadow-md shadow-teal-500/20'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>Faturamento & Recibos de Honorários</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-sm flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Conteúdo Aba 1: Documentos Avulsos CFP */}
      {activeTab === 'single_docs' && (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Painel Esquerdo: Lista de Documentos */}
        <div className="lg:col-span-4 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
            <span>Documentos Emitidos ({documents.length})</span>
            <button onClick={fetchDocuments} title="Atualizar" className="hover:text-teal-600 dark:hover:text-teal-400 cursor-pointer">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {documents.length === 0 ? (
              <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 space-y-2">
                <FileText className="w-8 h-8 text-slate-400 mx-auto" />
                <p>Nenhum documento emitido ainda.</p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="text-teal-600 dark:text-teal-400 font-semibold underline cursor-pointer"
                >
                  Emitir primeiro documento
                </button>
              </div>
            ) : (
              documents.map((doc) => {
                const isSelected = selectedDoc?.id === doc.id;
                return (
                  <div
                    key={doc.id}
                    onClick={() => selectDocument(doc)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-teal-50 dark:bg-teal-950/20 border-teal-500/40 shadow-sm'
                        : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {doc.type}
                      </span>
                      {doc.isSigned ? (
                        <div className="flex items-center gap-1">
                          {doc.icpSignature && (
                            <span className="text-[9px] font-bold text-teal-800 dark:text-teal-300 bg-teal-500/10 border border-teal-500/30 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                              <Award className="w-2.5 h-2.5" />
                              {doc.icpSignature.certificate.complianceIcpBrasil ? 'ICP' : 'Plataforma'}
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                            <ShieldCheck className="w-3 h-3" />
                            Assinado
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                          Rascunho
                        </span>
                      )}
                    </div>

                    <h4 className="text-xs font-bold text-slate-900 dark:text-white mt-2 line-clamp-1">
                      {doc.title}
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {new Date(doc.createdAt).toLocaleDateString('pt-BR')} • {doc.regulationReference}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Painel Direito: Papel Timbrado & Emissão com QR Code */}
        <div className="lg:col-span-8 space-y-4">
          {selectedDoc ? (
            <div className="space-y-4">
              {/* Barra de Ações Superior */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900/80 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Status:
                  </span>
                  {selectedDoc.icpSignature ? (
                    <span className="text-xs font-bold text-teal-700 dark:text-teal-300 flex items-center gap-1.5 bg-teal-500/10 border border-teal-500/20 px-2.5 py-1 rounded-xl">
                      <Award className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                      {selectedDoc.icpSignature.certificate.complianceIcpBrasil ? 'ICP-Brasil' : 'Assinatura eletrônica da plataforma'}
                    </span>
                  ) : selectedDoc.isSigned ? (
                    <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                      <ShieldCheck className="w-4 h-4" />
                      Assinado Digitalmente (Imutável)
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <Lock className="w-4 h-4" />
                      Rascunho Pendente de Assinatura
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!selectedDoc.isSigned && (
                    <button
                      onClick={handleSignDocument}
                      disabled={signLoading}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>{signLoading ? 'Assinando...' : 'Assinar eletronicamente'}</span>
                    </button>
                  )}

                  <button
                    onClick={handleDownloadPdf}
                    disabled={downloadingPdf}
                    className="px-3.5 py-2 rounded-xl bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/40 dark:hover:bg-teal-900/60 text-teal-700 dark:text-teal-300 border border-teal-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    title="Baixar arquivo PDF A4 timbrado com QR Code dinâmico embutido"
                  >
                    <FileDown className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    <span>{downloadingPdf ? 'Baixando PDF...' : 'Baixar PDF Timbrado'}</span>
                  </button>

                  <button
                    onClick={handlePrint}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Imprimir</span>
                  </button>
                </div>
              </div>

              {/* Folha Formal Clínica (Visualização A4 / Papel Timbrado) */}
              <div className="bg-white text-slate-900 p-4 sm:p-8 md:p-12 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-6 sm:space-y-8 font-serif min-h-[650px] flex flex-col justify-between">
                {/* Cabeçalho Profissional */}
                <div className="border-b-2 border-slate-800 pb-6 text-center space-y-1">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-2xl font-bold font-sans text-teal-800">Ψ</span>
                    <h2 className="text-lg font-bold tracking-wider text-slate-900 uppercase font-sans">
                      Dra. Vanessa Andrade
                    </h2>
                  </div>
                  <p className="text-xs font-sans text-slate-600 font-semibold tracking-wide">
                    Psicóloga Clínica • CRP 06/142980 • Cadastro e-Psi Ativo
                  </p>
                  <p className="text-[11px] font-sans text-slate-500">
                    Terapia Cognitivo-Comportamental • Telepsicologia & Avaliação Clínica
                  </p>
                </div>

                {/* Conteúdo Central do Documento */}
                <div className="space-y-6 flex-1 py-4">
                  <div className="text-center space-y-1">
                    <h3 className="text-base font-bold uppercase tracking-wider text-slate-900 font-sans">
                      {selectedDoc.title}
                    </h3>
                    <span className="inline-block text-[11px] font-sans uppercase font-semibold text-slate-500 border border-slate-300 px-2 py-0.5 rounded">
                      {selectedDoc.regulationReference}
                    </span>
                  </div>

                  <div className="text-xs sm:text-sm text-slate-800 leading-relaxed whitespace-pre-wrap text-justify px-2">
                    {selectedDoc.content}
                  </div>
                </div>

                {/* Rodapé e Autenticação Criptográfica com QR Code */}
                <div className="pt-6 border-t border-slate-300 font-sans space-y-6">
                  <div className="flex flex-col sm:flex-row items-end justify-between gap-6">
                    {/* Validação Pública via QR Code */}
                    <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-200 w-full sm:w-auto">
                      {qrCodeDataUrl ? (
                        <img 
                          src={qrCodeDataUrl} 
                          alt="QR Code de Validação" 
                          className="w-20 h-20 rounded-lg border border-slate-200 bg-white p-1"
                        />
                      ) : (
                        <div className="w-20 h-20 rounded-lg bg-slate-200 flex items-center justify-center text-slate-400">
                          <QrCode className="w-8 h-8" />
                        </div>
                      )}
                      <div className="space-y-1 text-left">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-teal-800 flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Autenticidade Verificável
                        </span>
                        <p className="text-[10px] text-slate-600 max-w-[220px] leading-tight">
                          Aponte a câmera para verificar a assinatura e autoria no Conselho Federal de Psicologia.
                        </p>
                        <p className="text-[10px] font-mono text-slate-500 break-all">
                          Token: {selectedDoc.validationToken.slice(0, 16)}...
                        </p>
                      </div>
                    </div>

                    {/* Assinatura do Profissional */}
                    <div className="text-center sm:text-right space-y-1 w-full sm:w-auto">
                      <div className="w-48 sm:ml-auto border-b border-slate-800 pt-8 pb-1">
                        <span className="font-serif italic text-sm text-slate-800">Vanessa Andrade</span>
                      </div>
                      <p className="text-xs font-bold text-slate-900">Dra. Vanessa Andrade</p>
                      <p className="text-[10px] text-slate-600">Psicóloga — CRP 06/142980</p>
                      <p className="text-[10px] text-slate-500">
                        {selectedDoc.signedAt 
                          ? `Assinado em ${new Date(selectedDoc.signedAt).toLocaleString('pt-BR')}`
                          : 'Rascunho não assinado'}
                      </p>
                    </div>
                  </div>

                  {/* Selo da assinatura (da plataforma enquanto não houver provedor ICP-Brasil) */}
                  {selectedDoc.icpSignature && (
                    <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 flex items-start gap-3.5 text-xs text-slate-800">
                      <div className="p-2 bg-emerald-600 text-white rounded-xl shrink-0">
                        <Award className="w-5 h-5" />
                      </div>
                      <div className="space-y-1 text-left font-sans flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-emerald-950 text-xs flex items-center gap-1">
                            {selectedDoc.icpSignature.certificate.complianceIcpBrasil
                              ? 'Assinatura com certificado ICP-Brasil'
                              : `Assinado eletronicamente por ${selectedDoc.icpSignature.certificate.subject}`}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-700">
                          <strong>Emissor:</strong> {selectedDoc.icpSignature.certificate.issuer} • <strong>Serial:</strong> {selectedDoc.icpSignature.certificate.serialNumber}
                        </p>
                        <p className="text-[10px] text-slate-600 font-mono break-all">
                          <strong>Registro de horário:</strong> {selectedDoc.icpSignature.timestampToken}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          Registra quem assinou, quando e o hash do conteúdo. Não é assinatura qualificada ICP-Brasil: para isso, baixe o PDF e assine com o seu certificado digital ou no assinador do gov.br.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Hash Criptográfico PAdES / SHA-256 */}
                  {selectedDoc.signaturePadesHash && (
                    <div className="text-[10px] text-slate-500 font-mono bg-slate-100 p-2 rounded-lg text-center break-all border border-slate-200">
                      Selo de Imutabilidade Documental SHA-256: {selectedDoc.signaturePadesHash}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 rounded-3xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center text-slate-500">
              Selecione um documento ao lado ou crie um novo para visualizar.
            </div>
          )}
        </div>
      </div>
      )}

      {/* Conteúdo Aba 2: Laudos Periciais Multi-Sessões & Relatórios Consolidados (CFP nº 006/2019) */}
      {activeTab === 'consolidated_reports' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Painel Esquerdo: Lista de Laudos */}
          <div className="lg:col-span-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
              <span>Laudos Consolidados ({consolidatedReports.length})</span>
              <button onClick={fetchConsolidatedReports} title="Atualizar" className="hover:text-teal-600 dark:hover:text-teal-400 cursor-pointer">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {consolidatedReports.length === 0 ? (
                <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 space-y-2">
                  <Layers className="w-8 h-8 text-slate-400 mx-auto" />
                  <p>Nenhum laudo pericial gerado ainda.</p>
                  <button
                    onClick={() => setShowConsolidatedModal(true)}
                    className="text-teal-600 dark:text-teal-400 font-semibold underline cursor-pointer"
                  >
                    Gerar primeiro laudo multi-sessões
                  </button>
                </div>
              ) : (
                consolidatedReports.map((rep) => {
                  const isSelected = selectedConsolidated?.id === rep.id;
                  const isSigned = rep.status === 'SIGNED';

                  return (
                    <div
                      key={rep.id}
                      onClick={() => setSelectedConsolidated(rep)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer text-left space-y-2 ${
                        isSelected
                          ? 'bg-teal-50/50 dark:bg-teal-950/20 border-teal-500/50 dark:border-teal-500/30 shadow-sm'
                          : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {rep.identificacao.finalidade}
                        </span>
                        {isSigned ? (
                          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Assinado
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            Rascunho
                          </span>
                        )}
                      </div>

                      <h4 className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1">
                        {rep.identificacao.solicitante}
                      </h4>

                      <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                        {rep.descricaoDemanda}
                      </p>

                      <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
                        <span>{rep.procedimento.numeroSessoes} Sessões Integradas</span>
                        <span>{new Date(rep.createdAt).toLocaleDateString('pt-BR')}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Painel Direito: Visualizador Timbrado A4 do Laudo Pericial CFP 006/2019 */}
          <div className="lg:col-span-8">
            {selectedConsolidated ? (
              <div className="space-y-4">
                {/* Ações do Laudo */}
                <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Status do Laudo:
                    </span>
                    {selectedConsolidated.status === 'SIGNED' ? (
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 flex items-center gap-1">
                        <Award className="w-3.5 h-3.5" />
                        Assinado eletronicamente ({selectedConsolidated.signedByCrp})
                      </span>
                    ) : (
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                        Rascunho Oficial
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {selectedConsolidated.status === 'DRAFT' && (
                      <button
                        onClick={() => handleSignConsolidatedReport(selectedConsolidated.id)}
                        disabled={consolidatedSignLoading}
                        className="px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                      >
                        <Award className="w-3.5 h-3.5" />
                        <span>{consolidatedSignLoading ? 'Assinando...' : 'Assinar eletronicamente'}</span>
                      </button>
                    )}
                    <button
                      onClick={handlePrint}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Imprimir / PDF</span>
                    </button>
                  </div>
                </div>

                {/* Papel Timbrado Oficial A4 */}
                <div className="bg-white text-slate-900 p-6 sm:p-10 rounded-3xl border border-slate-200 shadow-xl space-y-6 font-serif">
                  {/* Cabeçalho Oficial */}
                  <div className="text-center border-b border-slate-200 pb-5 space-y-1">
                    <p className="text-[11px] font-sans uppercase font-bold tracking-widest text-teal-800">
                      Conselho Federal de Psicologia — Resolução CFP nº 006/2019
                    </p>
                    <h2 className="text-lg sm:text-xl font-bold font-sans tracking-tight text-slate-900">
                      LAUDO PSICOLÓGICO PERICIAL CONSOLIDADO
                    </h2>
                    <p className="text-xs text-slate-500 font-sans">
                      Documento técnico emitido em estrito cumprimento dos Artigos 9º a 13 da Resolução CFP nº 006/2019
                    </p>
                  </div>

                  {/* I. Identificação */}
                  <div className="space-y-1.5 font-sans text-xs border-b border-slate-100 pb-4">
                    <h3 className="font-bold uppercase tracking-wider text-teal-800 text-xs">
                      I. Identificação
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700">
                      <div><strong className="text-slate-900">Paciente:</strong> {selectedConsolidated.identificacao.pacienteNome}</div>
                      <div><strong className="text-slate-900">Documento:</strong> {selectedConsolidated.identificacao.pacienteDocumento || 'Sigilo Resguardado'}</div>
                      <div><strong className="text-slate-900">Solicitante:</strong> {selectedConsolidated.identificacao.solicitante}</div>
                      <div><strong className="text-slate-900">Finalidade:</strong> {selectedConsolidated.identificacao.finalidade}</div>
                      <div><strong className="text-slate-900">Profissional Responsável:</strong> {selectedConsolidated.identificacao.autorNome}</div>
                      <div><strong className="text-slate-900">Registro Profissional:</strong> {selectedConsolidated.identificacao.autorCrp}</div>
                    </div>
                  </div>

                  {/* II. Descrição da Demanda */}
                  <div className="space-y-1.5 font-sans text-xs border-b border-slate-100 pb-4">
                    <h3 className="font-bold uppercase tracking-wider text-teal-800 text-xs">
                      II. Descrição da Demanda
                    </h3>
                    <p className="text-slate-700 leading-relaxed font-serif text-sm">
                      {selectedConsolidated.descricaoDemanda}
                    </p>
                  </div>

                  {/* III. Procedimento */}
                  <div className="space-y-2 font-sans text-xs border-b border-slate-100 pb-4">
                    <h3 className="font-bold uppercase tracking-wider text-teal-800 text-xs">
                      III. Procedimento
                    </h3>
                    <p className="text-slate-700 leading-relaxed font-serif text-sm">
                      O processo avaliativo pericial compreendeu o período de <strong>{selectedConsolidated.procedimento.periodoInicial}</strong> a <strong>{selectedConsolidated.procedimento.periodoFinal}</strong>, totalizando <strong>{selectedConsolidated.procedimento.numeroSessoes} sessões clínicas</strong> estruturadas.
                    </p>
                    <div className="mt-2 space-y-1 font-sans">
                      <span className="font-semibold text-slate-800 text-[11px]">Recursos e Instrumentos Empregados:</span>
                      <ul className="list-disc list-inside text-[11px] text-slate-600 space-y-0.5">
                        {selectedConsolidated.procedimento.recursosUtilizados.map((rec, i) => (
                          <li key={i}>{rec}</li>
                        ))}
                      </ul>
                    </div>

                    {selectedConsolidated.procedimento.escalasAplicadas && selectedConsolidated.procedimento.escalasAplicadas.length > 0 && (
                      <div className="mt-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="font-semibold text-slate-800 text-[11px] block mb-1">
                          Escalas Psicométricas Padronizadas Integradas:
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                          {selectedConsolidated.procedimento.escalasAplicadas.map((esc, i) => (
                            <div key={i} className="p-2 bg-white rounded-lg border border-slate-200">
                              <span className="font-bold text-teal-800">{esc.tipo}</span> ({esc.data}): Escore <strong>{esc.score}</strong> — {esc.gravidade}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* IV. Análise */}
                  <div className="space-y-2 font-sans text-xs border-b border-slate-100 pb-4">
                    <h3 className="font-bold uppercase tracking-wider text-teal-800 text-xs">
                      IV. Análise
                    </h3>
                    <p className="text-slate-700 leading-relaxed font-serif text-sm">
                      {selectedConsolidated.analise.evolucaoClinica}
                    </p>
                    <p className="text-slate-700 leading-relaxed font-serif text-sm mt-2">
                      {selectedConsolidated.analise.analisePsicologica}
                    </p>

                    {selectedConsolidated.analise.metasAlcancadas && selectedConsolidated.analise.metasAlcancadas.length > 0 && (
                      <div className="mt-2 p-3 bg-teal-50/50 rounded-xl border border-teal-200/60 font-sans">
                        <span className="font-semibold text-teal-900 text-[11px] block mb-1">
                          Evolução de Metas Terapêuticas SMART:
                        </span>
                        <div className="space-y-1.5">
                          {selectedConsolidated.analise.metasAlcancadas.map((meta, i) => (
                            <div key={i} className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-700">{meta.meta}</span>
                              <span className="font-bold text-teal-800">{meta.progresso}% ({meta.status})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* V. Conclusão */}
                  <div className="space-y-2 font-sans text-xs border-b border-slate-100 pb-4">
                    <h3 className="font-bold uppercase tracking-wider text-teal-800 text-xs">
                      V. Conclusão
                    </h3>
                    <p className="text-slate-700 leading-relaxed font-serif text-sm">
                      {selectedConsolidated.conclusao.parecerFinal}
                    </p>
                    {selectedConsolidated.conclusao.hipoteseDiagnostica && (
                      <p className="text-slate-800 font-sans text-xs font-semibold mt-1">
                        Classificação Diagnóstica Internacional: <span className="text-teal-900 font-bold">{selectedConsolidated.conclusao.hipoteseDiagnostica}</span>
                      </p>
                    )}
                    {selectedConsolidated.conclusao.prognostico && (
                      <p className="text-slate-700 font-sans text-xs">
                        <strong>Prognóstico:</strong> {selectedConsolidated.conclusao.prognostico}
                      </p>
                    )}
                    {selectedConsolidated.conclusao.encaminhamentosSugeridos && selectedConsolidated.conclusao.encaminhamentosSugeridos.length > 0 && (
                      <div className="mt-2 font-sans">
                        <span className="font-semibold text-slate-800 text-[11px]">Encaminhamentos e Recomendações:</span>
                        <ul className="list-disc list-inside text-[11px] text-slate-600">
                          {selectedConsolidated.conclusao.encaminhamentosSugeridos.map((enc, i) => (
                            <li key={i}>{enc}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="pt-2 text-right text-[11px] text-slate-500 font-sans">
                      {selectedConsolidated.conclusao.localEmissao}, {new Date(selectedConsolidated.conclusao.dataEncerramento).toLocaleDateString('pt-BR')}.
                    </div>
                  </div>

                  {/* Selo criptográfico da assinatura eletrônica */}
                  <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-200 font-sans">
                    <div className="text-[10px] text-slate-500 font-mono space-y-0.5">
                      <div>Selo de Autenticidade WORM: <span className="font-bold text-slate-700">{selectedConsolidated.wormAuditId}</span></div>
                      <div className="break-all">Digest SHA-256: {selectedConsolidated.documentHashSha256}</div>
                    </div>

                    <div className="text-center sm:text-right space-y-0.5">
                      <p className="text-xs font-bold text-slate-900">{selectedConsolidated.identificacao.autorNome}</p>
                      <p className="text-[10px] text-slate-600">{selectedConsolidated.identificacao.autorCrp}</p>
                      {selectedConsolidated.signedAt && (
                        <p className="text-[9px] text-emerald-700 font-semibold">
                          Assinado em {new Date(selectedConsolidated.signedAt).toLocaleString('pt-BR')} (assinatura eletrônica da plataforma)
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-12 rounded-3xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center text-slate-500">
                Selecione um laudo ao lado ou clique em "Gerar Novo Laudo Consolidado".
              </div>
            )}
          </div>
        </div>
      )}

      {/* Conteúdo Aba 3: Encaminhamentos Multidisciplinares & Contra-Referência (RFC-001 §3.5) */}
      {activeTab === 'referrals' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Painel Esquerdo: Lista de Encaminhamentos */}
          <div className="lg:col-span-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
              <span>Encaminhamentos ({referrals.length})</span>
              <button onClick={fetchReferrals} title="Atualizar" className="hover:text-teal-600 dark:hover:text-teal-400 cursor-pointer">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {referrals.length === 0 ? (
                <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 space-y-2">
                  <Stethoscope className="w-8 h-8 text-slate-400 mx-auto" />
                  <p>Nenhum encaminhamento emitido.</p>
                  <button
                    onClick={() => setShowReferralModal(true)}
                    className="text-teal-600 dark:text-teal-400 font-semibold underline cursor-pointer"
                  >
                    Emitir primeiro encaminhamento
                  </button>
                </div>
              ) : (
                referrals.map((ref) => {
                  const isSelected = selectedReferral?.id === ref.id;
                  const isEmergency = ref.urgency === ReferralUrgency.EMERGENCY;
                  const isPriority = ref.urgency === ReferralUrgency.PRIORITY;
                  const isCounter = ref.status === ReferralStatus.COUNTER_REFERRED;

                  return (
                    <div
                      key={ref.id}
                      onClick={() => setSelectedReferral(ref)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer text-left space-y-2 ${
                        isSelected
                          ? 'bg-teal-50/50 dark:bg-teal-950/20 border-teal-500/50 dark:border-teal-500/30 shadow-sm'
                          : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          isEmergency 
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                            : isPriority
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300'
                        }`}>
                          {ref.urgency}
                        </span>

                        {isCounter ? (
                          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Contra-Referência
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                            Aguardando Retorno
                          </span>
                        )}
                      </div>

                      <h4 className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1">
                        {ref.recipientProfessional}
                      </h4>
                      <p className="text-[11px] text-teal-600 dark:text-teal-400 font-semibold">
                        {ref.recipientSpecialty} {ref.recipientInstitution && `• ${ref.recipientInstitution}`}
                      </p>

                      <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                        {ref.reasonForReferral}
                      </p>

                      <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
                        <span>{new Date(ref.createdAt).toLocaleDateString('pt-BR')}</span>
                        <span className="font-mono">{ref.validationToken.slice(0, 10)}...</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Painel Direito: Guia de Encaminhamento & Contra-Referência */}
          <div className="lg:col-span-8">
            {selectedReferral ? (
              <div className="space-y-4">
                {/* Header da Guia */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-bold uppercase px-3 py-1 rounded-full ${
                      selectedReferral.urgency === ReferralUrgency.EMERGENCY
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                        : selectedReferral.urgency === ReferralUrgency.PRIORITY
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                        : 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300'
                    }`}>
                      Urgência: {selectedReferral.urgency}
                    </span>

                    <button
                      onClick={() => copyReferralLink(selectedReferral.validationToken)}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      {copiedReferralToken === selectedReferral.validationToken ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-600">Link Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar Link de Validação</span>
                        </>
                      )}
                    </button>
                  </div>

                  {selectedReferral.status !== ReferralStatus.COUNTER_REFERRED && (
                    <button
                      onClick={() => {
                        setCounterFormData({
                          referralId: selectedReferral.id,
                          counterReferenceNotes: 'Paciente avaliado em interconsulta especializada. Recomendada conduta integrada com psicoterapia.',
                          counterReferredBy: selectedReferral.recipientProfessional
                        });
                        setShowCounterModal(true);
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Registrar Contra-Referência Médica</span>
                    </button>
                  )}
                </div>

                {/* Guia de Encaminhamento Timbrada */}
                <div className="bg-white text-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xl space-y-5">
                  <div className="border-b border-slate-200 pb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-teal-800">
                        Comunicação Interdisciplinar em Saúde Mental
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        {selectedReferral.validationToken}
                      </span>
                    </div>
                    <h2 className="text-lg font-bold text-slate-900 mt-1">
                      GUIA DE ENCAMINHAMENTO PSICOLÓGICO CLÍNICO
                    </h2>
                    <p className="text-xs text-slate-500">
                      Emitido em {new Date(selectedReferral.createdAt).toLocaleString('pt-BR')} por {selectedReferral.therapistName} ({selectedReferral.therapistCrp})
                    </p>
                  </div>

                  {/* Alerta de Sigilo Art. 9º CFP */}
                  <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl text-[11px] text-blue-900 flex items-start gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                      <strong>Resguardo Ético (CFP Art. 9º):</strong> Informações clínicas disponibilizadas de forma estritamente proporcional e necessária para assegurar a continuidade do cuidado biopsicossocial multiprofissional.
                    </p>
                  </div>

                  {/* Destinatário & Paciente */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <div>
                      <strong className="text-slate-900 block">Profissional / Serviço Destinatário:</strong>
                      <span className="text-slate-700">{selectedReferral.recipientProfessional}</span>
                      <span className="text-slate-500 block text-[11px]">{selectedReferral.recipientSpecialty} {selectedReferral.recipientInstitution && `• ${selectedReferral.recipientInstitution}`}</span>
                    </div>
                    <div>
                      <strong className="text-slate-900 block">Paciente:</strong>
                      <span className="text-slate-700">{selectedReferral.patientName}</span>
                      <span className="text-slate-500 block text-[11px]">Identificação clínica e prontuário integrado</span>
                    </div>
                  </div>

                  {/* Justificativa & Resumo Clínico Seguro */}
                  <div className="space-y-3 text-xs text-slate-800">
                    <div>
                      <strong className="text-teal-900 block mb-1 uppercase tracking-wider text-[11px]">1. Justificativa do Encaminhamento:</strong>
                      <p className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-slate-700 leading-relaxed font-serif text-sm">
                        {selectedReferral.reasonForReferral}
                      </p>
                    </div>

                    <div>
                      <strong className="text-teal-900 block mb-1 uppercase tracking-wider text-[11px]">2. Resumo Clínico Seguro & Observações:</strong>
                      <p className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-slate-700 leading-relaxed font-serif text-sm">
                        {selectedReferral.clinicalSummary}
                      </p>
                    </div>

                    {selectedReferral.diagnosticHypothesis && (
                      <div className="p-3 bg-teal-50/40 rounded-xl border border-teal-200/50">
                        <strong className="text-teal-950 block text-[11px] mb-0.5">Hipótese Diagnóstica Prévia (CID-11):</strong>
                        <span className="font-semibold text-teal-800">{selectedReferral.diagnosticHypothesis}</span>
                      </div>
                    )}

                    {selectedReferral.psychometricSummary && (
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <strong className="text-slate-900 block text-[11px] mb-1">Evidência Psicométrica Objetiva Mais Recente:</strong>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="font-bold text-teal-800">{selectedReferral.psychometricSummary.scaleType}</span>
                          <span>Escore: <strong>{selectedReferral.psychometricSummary.score}</strong></span>
                          <span>Classificação: <strong>{selectedReferral.psychometricSummary.severity}</strong></span>
                          <span className="text-slate-500 text-[11px]">({new Date(selectedReferral.psychometricSummary.appliedAt).toLocaleDateString('pt-BR')})</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Seção de Retorno / Contra-Referência Médica */}
                  <div className="pt-3 border-t border-slate-200">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-2 flex items-center gap-1.5">
                      <Share2 className="w-3.5 h-3.5 text-teal-600" />
                      Contra-Referência Multidisciplinar
                    </h3>

                    {selectedReferral.status === ReferralStatus.COUNTER_REFERRED ? (
                      <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl text-xs space-y-2">
                        <div className="flex items-center justify-between text-emerald-950 font-bold">
                          <span>Parecer e Conduta Médica Recebida</span>
                          <span className="text-[10px] text-emerald-700 font-normal">
                            {selectedReferral.counterReferredAt && new Date(selectedReferral.counterReferredAt).toLocaleString('pt-BR')}
                          </span>
                        </div>
                        <p className="text-slate-700 font-serif text-sm leading-relaxed">
                          {selectedReferral.counterReferenceNotes}
                        </p>
                        <p className="text-[11px] text-emerald-800 font-semibold pt-1">
                          Responsável pela Contra-Referência: {selectedReferral.counterReferredBy}
                        </p>
                      </div>
                    ) : (
                      <div className="p-4 bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-center text-xs text-slate-500 space-y-1">
                        <p>Nenhum parecer médico registrado para esta guia ainda.</p>
                        <p className="text-[11px] text-slate-400">
                          O especialista pode validar a guia online ou a equipe pode registrar a resposta recebida.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-12 rounded-3xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center text-slate-500">
                Selecione um encaminhamento ao lado ou clique em "Emitir Encaminhamento".
              </div>
            )}
          </div>
        </div>
      )}

      {/* Conteúdo Aba 4: Faturamento & Recibos de Honorários (RFC-001 §3.6) */}
      {activeTab === 'billing_receipts' && (
        <BillingReceiptsModule patientId={patientId} />
      )}

      {/* Modal de Criação de Documento */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                Emitir Documento Psicológico (CFP nº 006/2019)
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleCreateDocument} className="space-y-4">
              {/* Seletor de Tipo de Documento */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Modalidade do Documento (Resolução CFP nº 006/2019)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[DocumentType.ATESTADO, DocumentType.DECLARACAO, DocumentType.RELATORIO, DocumentType.LAUDO].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleTypeChange(type)}
                      className={`p-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer text-center ${
                        selectedType === type
                          ? 'bg-teal-600 text-white border-teal-600 shadow-md shadow-teal-500/20'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Título */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Título do Documento
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                  required
                />
              </div>

              {/* Conteúdo Clínico */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Texto Oficial do Documento
                  </label>
                  <span className="text-[11px] text-teal-600 dark:text-teal-400 flex items-center gap-1 font-medium">
                    <Sparkles className="w-3 h-3" />
                    Modelo CFP Carregado
                  </span>
                </div>
                <textarea
                  rows={9}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500 resize-none leading-relaxed font-sans"
                  required
                />
              </div>

              {/* Botões */}
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer shadow-lg shadow-teal-500/20"
                >
                  {createLoading ? 'Salvando...' : 'Salvar Rascunho com AES-256'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Validador Público de QR Code (Simulador do Terceiro / Validador) */}
      {showValidatorModal && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <QrCode className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                Portal de Validação Pública de Autenticidade
              </h3>
              <button onClick={() => setShowValidatorModal(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer">✕</button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Este validador simula a página pública acessada por terceiros (RH, empresas ou convênios) ao escanear o QR Code de um documento impresso ou digital.
            </p>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Insira o Token de Validação..."
                value={inputToken}
                onChange={(e) => setInputToken(e.target.value)}
                className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:border-purple-500"
              />
              <button
                type="button"
                onClick={() => handleValidateToken(inputToken)}
                disabled={validating}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              >
                {validating ? 'Verificando...' : 'Verificar'}
              </button>
            </div>

            {/* Resultado da Validação */}
            {validationResult && (
              <div className={`p-4 rounded-2xl border space-y-3 ${
                validationResult.valid
                  ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-500/30'
                  : 'bg-rose-50 dark:bg-rose-950/20 border-rose-500/30'
              }`}>
                {validationResult.valid && validationResult.document ? (
                  <>
                    <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-xs font-bold uppercase tracking-wider">
                      <ShieldCheck className="w-4 h-4" />
                      Documento Válido & Autêntico no CFP
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-500">Profissional Emissor:</span>
                        <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                          {validationResult.document.therapistName}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500">Registro Profissional:</span>
                        <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                          CRP {validationResult.document.therapistCrp}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500">Iniciais do Paciente (LGPD):</span>
                        <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                          {validationResult.document.patientInitials}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500">Tipo de Documento:</span>
                        <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                          {validationResult.document.type}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <span className="text-slate-500">Data de Emissão:</span>
                        <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                          {validationResult.document.issuedAt}
                        </p>
                      </div>
                    </div>

                    <div className="text-[10px] font-mono text-emerald-800 dark:text-emerald-300/80 bg-white dark:bg-slate-950 p-2 rounded-xl border border-emerald-500/20 break-all">
                      Hash PAdES/SHA-256: {validationResult.document.signaturePadesHash}
                    </div>

                    {validationResult.document.icpSignature && (
                      <div className="text-[10px] bg-emerald-500/10 border border-emerald-500/30 p-2.5 rounded-xl text-emerald-800 dark:text-emerald-300 space-y-1">
                        <div className="font-bold flex items-center gap-1">
                          <Award className="w-3.5 h-3.5" />
                          {validationResult.document.icpSignature.certificate.complianceIcpBrasil ? 'Assinatura com certificado ICP-Brasil' : 'Assinatura eletrônica da plataforma (sem certificado ICP-Brasil)'}
                        </div>
                        <div>Emissor: {validationResult.document.icpSignature.certificate.issuer}</div>
                        <div>Serial: {validationResult.document.icpSignature.certificate.serialNumber}</div>
                        <div className="font-mono text-[9px] text-slate-500 break-all">
                          Horário: {validationResult.document.icpSignature.timestampToken}
                        </div>
                      </div>
                    )}

                    <p className="text-[11px] text-slate-600 dark:text-slate-400 italic">
                      * O conteúdo clínico integral permanece confidencial nos termos do Código de Ética do Psicólogo e LGPD Art. 11.
                    </p>
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 text-xs font-semibold">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{validationResult.message || 'Código de validação inválido.'}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Gerar Laudo Pericial Consolidado Multi-Sessões (CFP nº 006/2019) */}
      {showConsolidatedModal && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-3xl w-full p-4 sm:p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                Gerar Laudo Pericial Multi-Sessões (Resolução CFP nº 006/2019)
              </h3>
              <button onClick={() => setShowConsolidatedModal(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer">✕</button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Estruturação automática nas 5 seções canônicas: Identificação, Descrição da Demanda, Procedimento, Análise e Conclusão com integração do prontuário, metas SMART e psicometria.
            </p>

            <form onSubmit={handleGenerateConsolidatedReport} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Finalidade do Documento
                  </label>
                  <select
                    value={consolidatedFormData.finalidade}
                    onChange={(e) => setConsolidatedFormData({ ...consolidatedFormData, finalidade: e.target.value as ClinicalReportPurpose })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                  >
                    <option value={ClinicalReportPurpose.JUDICIAL_EXPERT}>Perícia Judicial / Assistência Técnica</option>
                    <option value={ClinicalReportPurpose.PSYCHIATRIC_REFERRAL}>Interconsulta / Encaminhamento Psiquiátrico</option>
                    <option value={ClinicalReportPurpose.CLINICAL_EVOLUTION}>Relatório de Evolução e Síntese Terapêutica</option>
                    <option value={ClinicalReportPurpose.OCCUPATIONAL}>Avaliação Laboral / Ocupacional</option>
                    <option value={ClinicalReportPurpose.EDUCATIONAL}>Avaliação Psicopedagógica / Escolar</option>
                    <option value={ClinicalReportPurpose.DISCHARGE_SUMMARY}>Sumário de Alta Terapêutica</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Solicitante Oficial
                  </label>
                  <input
                    type="text"
                    required
                    value={consolidatedFormData.solicitante}
                    onChange={(e) => setConsolidatedFormData({ ...consolidatedFormData, solicitante: e.target.value })}
                    placeholder="Ex: Juízo da 1ª Vara de Família, Dr. Psiquiatra, etc."
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  II. Descrição da Demanda (Motivo, queixas e objetivos da avaliação)
                </label>
                <textarea
                  required
                  rows={3}
                  value={consolidatedFormData.descricaoDemanda}
                  onChange={(e) => setConsolidatedFormData({ ...consolidatedFormData, descricaoDemanda: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500 font-sans"
                />
              </div>

              {/* Toggles de Agregação Automática */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  Agregação Automatizada da Linha do Tempo Clínica:
                </span>
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700 dark:text-slate-300">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={consolidatedFormData.includeTimelineSessions}
                      onChange={(e) => setConsolidatedFormData({ ...consolidatedFormData, includeTimelineSessions: e.target.checked })}
                      className="rounded text-teal-600 focus:ring-teal-500"
                    />
                    <span>Histórico de Sessões da Timeline</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={consolidatedFormData.includePsychometrics}
                      onChange={(e) => setConsolidatedFormData({ ...consolidatedFormData, includePsychometrics: e.target.checked })}
                      className="rounded text-teal-600 focus:ring-teal-500"
                    />
                    <span>Escalas Psicométricas (PHQ-9 & GAD-7)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={consolidatedFormData.includeGoals}
                      onChange={(e) => setConsolidatedFormData({ ...consolidatedFormData, includeGoals: e.target.checked })}
                      className="rounded text-teal-600 focus:ring-teal-500"
                    />
                    <span>Metas Terapêuticas SMART</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Classificação Diagnóstica (CID-11)
                  </label>
                  <input
                    type="text"
                    value={consolidatedFormData.hipoteseDiagnostica}
                    onChange={(e) => setConsolidatedFormData({ ...consolidatedFormData, hipoteseDiagnostica: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Local de Emissão
                  </label>
                  <input
                    type="text"
                    value={consolidatedFormData.localEmissao}
                    onChange={(e) => setConsolidatedFormData({ ...consolidatedFormData, localEmissao: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  V. Parecer Final e Conclusão Técnica
                </label>
                <textarea
                  rows={2}
                  value={consolidatedFormData.parecerFinal}
                  onChange={(e) => setConsolidatedFormData({ ...consolidatedFormData, parecerFinal: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500 font-sans"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConsolidatedModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={consolidatedLoading}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-teal-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{consolidatedLoading ? 'Compilando Laudo...' : 'Gerar Laudo Pericial Oficial'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Emitir Guia de Encaminhamento Multidisciplinar (RFC-001 §3.5) */}
      {showReferralModal && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full p-4 sm:p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                Emitir Encaminhamento Multidisciplinar Interoperável
              </h3>
              <button onClick={() => setShowReferralModal(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer">✕</button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Gera guia médica/psiquiátrica segura com nível de urgência, token público de validação e resguardo do sigilo (Código de Ética do Psicólogo Art. 9º).
            </p>

            <form onSubmit={handleCreateReferral} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Profissional Destinatário
                  </label>
                  <input
                    type="text"
                    required
                    value={referralFormData.recipientProfessional}
                    onChange={(e) => setReferralFormData({ ...referralFormData, recipientProfessional: e.target.value })}
                    placeholder="Ex: Dr. Roberto Mendes CRM/SP 123456"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Especialidade Médica / Área
                  </label>
                  <input
                    type="text"
                    required
                    value={referralFormData.recipientSpecialty}
                    onChange={(e) => setReferralFormData({ ...referralFormData, recipientSpecialty: e.target.value })}
                    placeholder="Ex: Psiquiatria Clínica, Neurologia"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Instituição / Hospital (Opcional)
                  </label>
                  <input
                    type="text"
                    value={referralFormData.recipientInstitution || ''}
                    onChange={(e) => setReferralFormData({ ...referralFormData, recipientInstitution: e.target.value })}
                    placeholder="Ex: Ambulatório Médico Especializado"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nível de Urgência Clínica
                  </label>
                  <select
                    value={referralFormData.urgency}
                    onChange={(e) => setReferralFormData({ ...referralFormData, urgency: e.target.value as ReferralUrgency })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500 font-semibold"
                  >
                    <option value={ReferralUrgency.ROUTINE}>Rotina (Acompanhamento Eletivo)</option>
                    <option value={ReferralUrgency.PRIORITY}>Prioritário (Prejuízo Funcional / Sintomas Moderados a Graves)</option>
                    <option value={ReferralUrgency.EMERGENCY}>Emergência (Crise Aguda / Ideação Severa)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Justificativa Clínica do Encaminhamento
                </label>
                <input
                  type="text"
                  required
                  value={referralFormData.reasonForReferral}
                  onChange={(e) => setReferralFormData({ ...referralFormData, reasonForReferral: e.target.value })}
                  placeholder="Ex: Avaliação farmacológica para sintomas depressivos e insônia resistente"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Resumo Clínico Seguro (Resguardo Ético CFP Art. 9º)
                </label>
                <textarea
                  required
                  rows={3}
                  value={referralFormData.clinicalSummary}
                  onChange={(e) => setReferralFormData({ ...referralFormData, clinicalSummary: e.target.value })}
                  placeholder="Descreva estritamente os sintomas e dados relevantes para o profissional receptor..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500 font-sans"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Hipótese Diagnóstica (CID-11)
                  </label>
                  <input
                    type="text"
                    value={referralFormData.diagnosticHypothesis || ''}
                    onChange={(e) => setReferralFormData({ ...referralFormData, diagnosticHypothesis: e.target.value })}
                    placeholder="Ex: CID-11: 6A70 Transtorno Depressivo"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={referralFormData.includeLatestPsychometric}
                      onChange={(e) => setReferralFormData({ ...referralFormData, includeLatestPsychometric: e.target.checked })}
                      className="rounded text-teal-600 focus:ring-teal-500"
                    />
                    <span>Anexar última avaliação psicométrica</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReferralModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={referralLoading}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-teal-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>{referralLoading ? 'Emitindo...' : 'Emitir Guia de Encaminhamento'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Registrar Contra-Referência Médica Recebida */}
      {showCounterModal && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-4 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Share2 className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                Registrar Contra-Referência Médica
              </h3>
              <button onClick={() => setShowCounterModal(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer">✕</button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Anexe o retorno diagnóstico e a conduta medicamentosa prescrita pelo médico especialista para integração ao plano terapêutico contínuo.
            </p>

            <form onSubmit={handleRegisterCounterReferral} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Profissional que respondeu a Contra-Referência
                </label>
                <input
                  type="text"
                  required
                  value={counterFormData.counterReferredBy}
                  onChange={(e) => setCounterFormData({ ...counterFormData, counterReferredBy: e.target.value })}
                  placeholder="Ex: Dr. Roberto Mendes CRM 123456"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Parecer Médico e Conduta Adotada
                </label>
                <textarea
                  required
                  rows={4}
                  value={counterFormData.counterReferenceNotes}
                  onChange={(e) => setCounterFormData({ ...counterFormData, counterReferenceNotes: e.target.value })}
                  placeholder="Ex: Paciente avaliado em consulta. Iniciado Escitalopram 10mg/dia. Solicitado retorno em 30 dias..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500 font-sans"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCounterModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={referralLoading}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-teal-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{referralLoading ? 'Salvando...' : 'Salvar Contra-Referência'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
