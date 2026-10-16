import React, { useState, useEffect } from 'react';
import {
  GitBranch,
  AlertTriangle,
  Brain,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  X,
  RefreshCw,
  Sparkles,
  Shield,
  Activity,
  HeartPulse,
  Flame
} from 'lucide-react';
import {
  DiagnosticTrackCategory,
  DiagnosticUrgencyLevel,
  InitialScreenerType
} from '@terapiainfoco/shared';
import type {
  DiagnosticDecisionNode,
  DiagnosticAssessmentAnswer,
  DiagnosticAssessmentReport,
  DiagnosticDecisionTreeDefinitionResponse
} from '@terapiainfoco/shared';
import { api } from '../services/api';

interface DiagnosticDecisionTreeModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  patientName?: string;
}

export const DiagnosticDecisionTreeModal: React.FC<DiagnosticDecisionTreeModalProps> = ({
  isOpen,
  onClose,
  patientId,
  patientName = 'Paciente Selecionado'
}) => {
  // Abas principais: 'assessment' (Nova Avaliação) ou 'history' (Histórico)
  const [activeTab, setActiveTab] = useState<'assessment' | 'history'>('assessment');

  // Estado da Árvore de Decisão
  const [definition, setDefinition] = useState<DiagnosticDecisionTreeDefinitionResponse | null>(null);
  const [isLoadingDefinition, setIsLoadingDefinition] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1); // 1: Trilha, 2: Perguntas, 3: Psicométrico, 4: Revisão/Salvar

  // Trilha Selecionada
  const [selectedTrack, setSelectedTrack] = useState<DiagnosticTrackCategory | null>(null);
  const [currentNodeId, setCurrentNodeId] = useState<string>('');
  const [nodeHistory, setNodeHistory] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, DiagnosticAssessmentAnswer>>({});
  const [redFlags, setRedFlags] = useState<string[]>([]);

  // Bateria Psicométrica Inicial
  const [selectedScreener, setSelectedScreener] = useState<InitialScreenerType>(InitialScreenerType.PHQ_4);
  const [screenerAnswers, setScreenerAnswers] = useState<Record<string, number>>({});
  const [includeScreener, setIncludeScreener] = useState<boolean>(true);

  // Notas e Conclusão
  const [clinicalNotes, setClinicalNotes] = useState<string>('');
  const [confidentialNotes, setConfidentialNotes] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccessReport, setSaveSuccessReport] = useState<DiagnosticAssessmentReport | null>(null);

  // Histórico de Avaliações
  const [historyReports, setHistoryReports] = useState<DiagnosticAssessmentReport[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [viewingHistoryDetail, setViewingHistoryDetail] = useState<DiagnosticAssessmentReport | null>(null);

  // Mensagem de Feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadDefinition();
      loadPatientHistory();
    }
  }, [isOpen, patientId]);

  const loadDefinition = async () => {
    setIsLoadingDefinition(true);
    try {
      const def = await api.getDiagnosticTreeDefinition();
      setDefinition(def);
    } catch {
      setFeedback({ type: 'error', text: 'Falha ao carregar catálogo da árvore diagnóstica' });
    } finally {
      setIsLoadingDefinition(false);
    }
  };

  const loadPatientHistory = async () => {
    if (!patientId) return;
    setIsLoadingHistory(true);
    try {
      const reports = await api.getPatientDiagnosticAssessments(patientId);
      setHistoryReports(reports);
    } catch {
      setHistoryReports([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleSelectTrack = (trackCategory: DiagnosticTrackCategory) => {
    setSelectedTrack(trackCategory);
    const trackObj = definition?.tracks.find(t => t.category === trackCategory);
    const entryId = trackObj?.entryNodeId || 'anx-01';
    setCurrentNodeId(entryId);
    setNodeHistory([]);
    setAnswers({});
    setRedFlags([]);
    setStep(2);

    // Ajusta o screener sugerido de acordo com a trilha
    if (trackCategory === DiagnosticTrackCategory.ANXIETY_SPECTRUM || trackCategory === DiagnosticTrackCategory.DEPRESSIVE_SPECTRUM) {
      setSelectedScreener(InitialScreenerType.PHQ_4);
    } else if (trackCategory === DiagnosticTrackCategory.SOMATIC_AND_BURNOUT) {
      setSelectedScreener(InitialScreenerType.PSS_10);
    } else if (trackCategory === DiagnosticTrackCategory.NEURODEVELOPMENTAL_ADHD) {
      setSelectedScreener(InitialScreenerType.ASRS_V1_1);
    }
  };

  const handleAnswerCurrentNode = (optionValue: string, nextNodeId?: string, triggersRedFlag?: boolean, redFlagReason?: string) => {
    setAnswers({
      ...answers,
      [currentNodeId]: {
        nodeId: currentNodeId,
        selectedOptionValue: optionValue
      }
    });

    if (triggersRedFlag && redFlagReason && !redFlags.includes(redFlagReason)) {
      setRedFlags([...redFlags, redFlagReason]);
    }

    if (nextNodeId && definition?.nodes[nextNodeId]) {
      setNodeHistory([...nodeHistory, currentNodeId]);
      setCurrentNodeId(nextNodeId);
    } else {
      // Fim do caminho da árvore: avança para o screener psicométrico
      setStep(3);
    }
  };

  const handleGoBackNode = () => {
    if (nodeHistory.length > 0) {
      const previous = nodeHistory[nodeHistory.length - 1];
      setNodeHistory(nodeHistory.slice(0, -1));
      setCurrentNodeId(previous);
    } else {
      setStep(1);
    }
  };

  const handleSaveAssessment = async () => {
    if (!selectedTrack) return;
    setIsSaving(true);
    setFeedback(null);

    try {
      const answerList = Object.values(answers);
      const res = await api.saveDiagnosticAssessment({
        patientId,
        primaryTrack: selectedTrack,
        answers: answerList,
        psychometricAnswers: includeScreener
          ? {
              screenerType: selectedScreener,
              answers: screenerAnswers
            }
          : undefined,
        clinicalNotes: clinicalNotes.trim() || undefined,
        confidentialNotes: confidentialNotes.trim() || undefined
      });

      setSaveSuccessReport(res.report);
      setFeedback({
        type: 'success',
        text: 'Avaliação diagnóstica processada e armazenada com criptografia de ponta a ponta (FLE AES-256-GCM)!'
      });
      await loadPatientHistory();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.message || 'Erro ao registrar avaliação diagnóstica'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetForm = () => {
    setStep(1);
    setSelectedTrack(null);
    setCurrentNodeId('');
    setNodeHistory([]);
    setAnswers({});
    setRedFlags([]);
    setScreenerAnswers({});
    setClinicalNotes('');
    setConfidentialNotes('');
    setSaveSuccessReport(null);
  };

  if (!isOpen) return null;

  const currentNode: DiagnosticDecisionNode | undefined = definition?.nodes[currentNodeId];
  const currentScreenerData = definition?.screeners[selectedScreener];

  // Cálculo prévio de pontuação psicométrica da tela
  let currentScreenerScore = 0;
  for (const v of Object.values(screenerAnswers)) {
    currentScreenerScore += Number(v) || 0;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
        {/* CABEÇALHO */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400 flex items-center justify-center font-bold">
              <GitBranch className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Árvore de Decisão Diagnóstica & Triagem Inicial (RFC-001 §3.4)
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                  CID-11 & CFP
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Paciente: <span className="font-semibold text-slate-700 dark:text-slate-300">{patientName}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* ABAS */}
            <div className="flex rounded-xl bg-slate-200/60 dark:bg-slate-800 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab('assessment')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  activeTab === 'assessment'
                    ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Nova Avaliação
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  activeTab === 'history'
                    ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Histórico ({historyReports.length})
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* FEEDBACK BANNER */}
        {feedback && (
          <div
            className={`px-5 py-2.5 text-xs font-medium flex items-center justify-between ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-b border-emerald-200 dark:border-emerald-900'
                : 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-b border-rose-200 dark:border-rose-900'
            }`}
          >
            <div className="flex items-center space-x-2">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600" />
              )}
              <span>{feedback.text}</span>
            </div>
            <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* CORPO DO MODAL */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {activeTab === 'history' ? (
            /* ======================================================== */
            /* ABA 1: HISTÓRICO DE AVALIAÇÕES DIAGNÓSTICAS DO PACIENTE */
            /* ======================================================== */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Avaliações Diagnósticas Anteriores ({historyReports.length})
                </h4>
                <button
                  type="button"
                  onClick={loadPatientHistory}
                  className="text-xs text-purple-600 dark:text-purple-400 font-bold hover:underline flex items-center space-x-1"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin' : ''}`} />
                  <span>Atualizar</span>
                </button>
              </div>

              {historyReports.length === 0 ? (
                <div className="p-8 text-center rounded-2xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 space-y-2">
                  <Brain className="w-8 h-8 text-slate-400 mx-auto" />
                  <h5 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Nenhuma avaliação diagnóstica registrada ainda
                  </h5>
                  <p className="text-[11px] text-slate-500">
                    Utilize a aba "Nova Avaliação" para aplicar a árvore de decisão clínica e as escalas iniciais.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {historyReports.map(rep => (
                    <div
                      key={rep.id}
                      className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 shadow-sm hover:border-purple-300 dark:hover:border-purple-800 transition"
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              rep.urgencyLevel === DiagnosticUrgencyLevel.CRITICAL_RED_FLAG
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                : rep.urgencyLevel === DiagnosticUrgencyLevel.MODERATE
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            }`}>
                              {rep.urgencyLevel === DiagnosticUrgencyLevel.CRITICAL_RED_FLAG
                                ? '⚠️ Red Flag Crítica'
                                : rep.urgencyLevel === DiagnosticUrgencyLevel.MODERATE
                                ? 'Atenção Moderada'
                                : 'Rotina Ambulatorial'}
                            </span>

                            <span className="text-xs font-bold text-purple-600 dark:text-purple-400">
                              Trilha: {rep.primaryTrack}
                            </span>
                          </div>

                          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            CID-11 Preliminar: {rep.provisionalCid11.join(', ')}
                          </h4>
                          <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                            {rep.clinicalHypothesisSummary}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => setViewingHistoryDetail(rep)}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-bold transition flex items-center space-x-1"
                        >
                          <span>Ver Detalhes</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* RED FLAGS SE HOUVER */}
                      {rep.redFlagsIdentified && rep.redFlagsIdentified.length > 0 && (
                        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-800 dark:text-rose-300 space-y-1">
                          <strong className="block font-bold">Alertas Críticos Identificados:</strong>
                          <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                            {rep.redFlagsIdentified.map((rf, idx) => (
                              <li key={idx}>{rf}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800/60">
                        <span>Registrado em {new Date(rep.createdAt).toLocaleDateString('pt-BR')}</span>
                        <span className="font-mono text-[10px]">Checksum: {rep.integrityChecksumSha256.substring(0, 16)}...</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* MODAL DETALHE DO HISTÓRICO */}
              {viewingHistoryDetail && (
                <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in">
                  <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto">
                    <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          Relatório Diagnóstico Completo
                        </h4>
                        <span className="text-xs text-slate-500">ID: {viewingHistoryDetail.id}</span>
                      </div>
                      <button onClick={() => setViewingHistoryDetail(null)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                        <X className="w-4 h-4 text-slate-400" />
                      </button>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-1">
                        <span className="font-bold text-slate-700 dark:text-slate-300 block">Síntese Clínica Preliminar:</span>
                        <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                          {viewingHistoryDetail.clinicalHypothesisSummary}
                        </p>
                      </div>

                      {viewingHistoryDetail.psychometricBaseline && (
                        <div className="p-3.5 rounded-xl bg-purple-50/50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 space-y-1">
                          <span className="font-bold text-purple-800 dark:text-purple-300 block">
                            Resultado Psicométrico Basal ({viewingHistoryDetail.psychometricBaseline.screenerType}):
                          </span>
                          <p className="text-slate-700 dark:text-slate-300">
                            Escore: <strong>{viewingHistoryDetail.psychometricBaseline.score}</strong> / {viewingHistoryDetail.psychometricBaseline.maxScore} • {viewingHistoryDetail.psychometricBaseline.severityLevel}
                          </p>
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <span className="font-bold text-slate-700 dark:text-slate-300 block">Intervenções Recomendadas:</span>
                        <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-400">
                          {viewingHistoryDetail.recommendedInterventions.map((it, i) => (
                            <li key={i}>{it}</li>
                          ))}
                        </ul>
                      </div>

                      {viewingHistoryDetail.confidentialTherapistNotes && (
                        <div className="p-3.5 rounded-xl bg-amber-50/50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 space-y-1">
                          <span className="font-bold text-amber-800 dark:text-amber-300 block">
                            Anotações Confidenciais do Psicólogo (Segregadas):
                          </span>
                          <p className="text-slate-700 dark:text-slate-300 italic">
                            {viewingHistoryDetail.confidentialTherapistNotes}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : saveSuccessReport ? (
            /* ======================================================== */
            /* TELA DE SUCESSO / RELATÓRIO RECÉM-GERADO                 */
            /* ======================================================== */
            <div className="space-y-5 text-center p-6">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>

              <div className="space-y-1">
                <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Avaliação Diagnóstica Concluída com Sucesso!
                </h4>
                <p className="text-xs text-slate-500 max-w-lg mx-auto">
                  Os dados foram integrados ao prontuário eletrônico multidimensional sob conformidade com a Resolução CFP nº 001/2009 e encriptados com AES-256-GCM (FLE).
                </p>
              </div>

              {/* CARD RESUMO */}
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-left space-y-3 max-w-xl mx-auto text-xs">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                  <span className="font-bold text-purple-600 dark:text-purple-400">
                    CID-11 Provisório: {saveSuccessReport.provisionalCid11.join(', ')}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    saveSuccessReport.urgencyLevel === DiagnosticUrgencyLevel.CRITICAL_RED_FLAG
                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  }`}>
                    {saveSuccessReport.urgencyLevel}
                  </span>
                </div>

                <p className="text-slate-700 dark:text-slate-300">
                  {saveSuccessReport.clinicalHypothesisSummary}
                </p>

                {saveSuccessReport.psychometricBaseline && (
                  <div className="p-2.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-[11px]">
                    <strong>Escala Basal ({saveSuccessReport.psychometricBaseline.screenerType}):</strong> Escore {saveSuccessReport.psychometricBaseline.score} ({saveSuccessReport.psychometricBaseline.severityLevel})
                  </div>
                )}

                <div className="pt-2 text-[10px] text-slate-400 flex items-center justify-between font-mono">
                  <span>SHA-256: {saveSuccessReport.integrityChecksumSha256.substring(0, 24)}...</span>
                  <span>WORM Selado</span>
                </div>
              </div>

              <div className="flex justify-center space-x-3 pt-2">
                <button
                  type="button"
                  onClick={handleResetForm}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition"
                >
                  Nova Avaliação
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('history')}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition shadow-md shadow-purple-500/20"
                >
                  Ver Histórico Completo
                </button>
              </div>
            </div>
          ) : (
            /* ======================================================== */
            /* WIZARD DA AVALIAÇÃO DIAGNÓSTICA (PASSOS 1 A 4)           */
            /* ======================================================== */
            <div className="space-y-6">
              {/* INDICADOR DE PROGRESSO DOS PASSOS */}
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                {[
                  { num: 1, label: 'Trilha Clínica' },
                  { num: 2, label: 'Árvore Decisória' },
                  { num: 3, label: 'Bateria Psicométrica' },
                  { num: 4, label: 'Síntese & Salvar' }
                ].map((s) => (
                  <div key={s.num} className="flex items-center space-x-2">
                    <div
                      className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold transition ${
                        step === s.num
                          ? 'bg-purple-600 text-white shadow-md shadow-purple-500/30'
                          : step > s.num
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                      }`}
                    >
                      {step > s.num ? <CheckCircle2 className="w-4 h-4" /> : s.num}
                    </div>
                    <span className={`text-xs font-semibold hidden md:inline ${step === s.num ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'}`}>
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* ALERTA DE RED FLAGS DURANTE O FLUXO */}
              {redFlags.length > 0 && (
                <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-300 space-y-2 animate-pulse">
                  <div className="flex items-center space-x-2 font-bold">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    <span>ALERTA DE SEGURANÇA CLÍNICA • SINAL DE ALERTA VERMELHO (RED FLAG)</span>
                  </div>
                  <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
                    {redFlags.map((rf, i) => (
                      <li key={i}>{rf}</li>
                    ))}
                  </ul>
                  <p className="text-[10px] text-rose-700 dark:text-rose-400 italic">
                    Diretriz ética: O protocolo de emergência será anexado automaticamente às orientações terapêuticas finais.
                  </p>
                </div>
              )}

              {/* PASSO 1: SELEÇÃO DA TRILHA CLÍNICA */}
              {step === 1 && (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Selecione a Trilha Clínica de Hipótese Diagnóstica Inicial
                    </h4>
                    <p className="text-xs text-slate-500">
                      Escolha a linha de investigação primária com base na queixa principal relatada pelo paciente na admissão.
                    </p>
                  </div>

                  {isLoadingDefinition ? (
                    <div className="p-12 text-center text-xs text-slate-400 flex items-center justify-center space-x-2">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Carregando árvore clínica...</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {(definition?.tracks || []).map((tr) => (
                        <button
                          key={tr.category}
                          type="button"
                          onClick={() => handleSelectTrack(tr.category)}
                          className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-purple-500 dark:hover:border-purple-600 text-left transition hover:shadow-md space-y-2 group"
                        >
                          <div className="flex items-center justify-between">
                            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400 flex items-center justify-center font-bold">
                              {tr.category === DiagnosticTrackCategory.ANXIETY_SPECTRUM ? (
                                <Activity className="w-4 h-4" />
                              ) : tr.category === DiagnosticTrackCategory.DEPRESSIVE_SPECTRUM ? (
                                <HeartPulse className="w-4 h-4" />
                              ) : tr.category === DiagnosticTrackCategory.NEURODEVELOPMENTAL_ADHD ? (
                                <Brain className="w-4 h-4" />
                              ) : tr.category === DiagnosticTrackCategory.TRAUMA_AND_STRESSOR ? (
                                <Shield className="w-4 h-4" />
                              ) : (
                                <Flame className="w-4 h-4" />
                              )}
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-purple-600 transition" />
                          </div>

                          <h5 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                            {tr.label}
                          </h5>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                            {tr.description}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* PASSO 2: ÁRVORE DECISÓRIA RAMIFICADA */}
              {step === 2 && currentNode && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={handleGoBackNode}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center space-x-1"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Voltar</span>
                    </button>

                    <span className="text-[11px] text-slate-400 font-medium">
                      Trilha Ativa: <strong>{selectedTrack}</strong> • Nó: {currentNode.id}
                    </span>
                  </div>

                  <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex items-start space-x-3">
                      <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        ?
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          {currentNode.question}
                        </h4>
                        {currentNode.description && (
                          <p className="text-xs text-slate-500">
                            {currentNode.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="pt-3 space-y-3">
                      {currentNode.options.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => handleAnswerCurrentNode(opt.value, opt.nextNodeId, opt.triggersRedFlag, opt.redFlagReason)}
                          className={`w-full p-4 rounded-xl border text-left text-xs font-medium transition flex items-start justify-between space-x-3 ${
                            opt.triggersRedFlag
                              ? 'border-rose-200 bg-rose-50/50 hover:bg-rose-100 text-rose-900 dark:bg-rose-950/30 dark:border-rose-900/60 dark:text-rose-200'
                              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-purple-500 hover:bg-purple-50/30 dark:hover:bg-purple-950/30 text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              {opt.triggersRedFlag && (
                                <span className="px-2 py-0.2 rounded-full text-[9px] font-bold bg-rose-200 text-rose-800 dark:bg-rose-900 dark:text-rose-200">
                                  RED FLAG
                                </span>
                              )}
                              {opt.indicativeCid11 && (
                                <span className="px-2 py-0.2 rounded-full text-[9px] font-mono font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                  CID-11: {opt.indicativeCid11}
                                </span>
                              )}
                            </div>
                            <span>{opt.label}</span>
                          </div>

                          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* PASSO 3: BATERIA PSICOMÉTRICA INICIAL PADRONIZADA */}
              {step === 3 && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        Bateria Psicométrica Inicial Padronizada
                      </h4>
                      <p className="text-xs text-slate-500">
                        Mensure o escore basal na admissão para monitoramento de eficácia terapêutica longitudinal.
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center space-x-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={includeScreener}
                          onChange={(e) => setIncludeScreener(e.target.checked)}
                          className="rounded text-purple-600 focus:ring-purple-500"
                        />
                        <span>Aplicar Escala</span>
                      </label>
                    </div>
                  </div>

                  {includeScreener && currentScreenerData && (
                    <div className="space-y-4">
                      {/* SELETOR DE ESCALA */}
                      <div className="flex items-center space-x-2 text-xs">
                        <span className="font-semibold text-slate-600 dark:text-slate-400">Escala de Triagem:</span>
                        <select
                          value={selectedScreener}
                          onChange={(e) => {
                            setSelectedScreener(e.target.value as InitialScreenerType);
                            setScreenerAnswers({});
                          }}
                          className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-bold"
                        >
                          <option value={InitialScreenerType.PHQ_4}>PHQ-4 (Ansiedade & Depressão Rápida)</option>
                          <option value={InitialScreenerType.PSS_10}>PSS-10 (Estresse Percebido)</option>
                          <option value={InitialScreenerType.ASRS_V1_1}>ASRS-v1.1 (Triagem TDAH Adulto OMS)</option>
                        </select>
                      </div>

                      <div className="p-4 rounded-xl bg-purple-50/50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 text-xs text-purple-900 dark:text-purple-200">
                        <strong>Instruções:</strong> {currentScreenerData.instructions}
                      </div>

                      {/* ITENS DA ESCALA */}
                      <div className="space-y-3">
                        {currentScreenerData.items.map((item) => (
                          <div
                            key={item.id}
                            className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2 text-xs"
                          >
                            <p className="font-semibold text-slate-800 dark:text-slate-200">
                              {item.text}
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                              {item.options.map((opt) => {
                                const isSelected = screenerAnswers[item.id] === opt.score;
                                return (
                                  <button
                                    key={opt.label}
                                    type="button"
                                    onClick={() => setScreenerAnswers({ ...screenerAnswers, [item.id]: opt.score })}
                                    className={`p-2 rounded-lg border text-center transition font-medium ${
                                      isSelected
                                        ? 'border-purple-600 bg-purple-600 text-white font-bold'
                                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                                    }`}
                                  >
                                    <span className="block text-[11px]">{opt.label}</span>
                                    <span className="block text-[10px] opacity-75 font-mono">({opt.score} pts)</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* PLACAR TOTAL EM TEMPO REAL */}
                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          Pontuação Acumulada: <strong>{currentScreenerScore} pontos</strong>
                        </span>
                        <span className="text-purple-600 dark:text-purple-400 font-semibold">
                          Respostas: {Object.keys(screenerAnswers).length} de {currentScreenerData.items.length} itens preenchidos
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50"
                    >
                      Voltar às Perguntas
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep(4)}
                      className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-md shadow-purple-500/20 transition flex items-center space-x-1"
                    >
                      <span>Avançar para Síntese Clínica</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* PASSO 4: SÍNTESE, ANOTAÇÕES E SALVAMENTO */}
              {step === 4 && (
                <div className="space-y-5">
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Síntese da Avaliação & Hipóteses Diagnósticas
                    </h4>
                    <p className="text-xs text-slate-500">
                      Revise os achados da árvore e registre anotações clínicas com encriptação em repouso.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* CARD DE SÍNTESE DA TRILHA */}
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                        Parâmetros da Investigação
                      </span>
                      <div className="space-y-1 text-slate-800 dark:text-slate-200">
                        <p>Trilha Principal: <strong>{selectedTrack}</strong></p>
                        <p>Respostas da Árvore: <strong>{Object.keys(answers).length} nós percorridos</strong></p>
                        {includeScreener && (
                          <p>Escala Basal: <strong>{selectedScreener} ({currentScreenerScore} pts)</strong></p>
                        )}
                        <p>
                          Alertas Red Flag: <strong className={redFlags.length > 0 ? 'text-rose-600 font-bold' : 'text-emerald-600'}>{redFlags.length} identificado(s)</strong>
                        </p>
                      </div>
                    </div>

                    {/* CARD DE CRIPTOGRAFIA */}
                    <div className="p-4 rounded-xl bg-purple-50/50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 space-y-2 text-xs">
                      <div className="flex items-center space-x-1.5 text-purple-800 dark:text-purple-300 font-bold">
                        <Shield className="w-4 h-4 text-purple-600" />
                        <span>Field-Level Encryption (AES-256-GCM)</span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                        As anotações e hipóteses diagnósticas são cifradas com chave DEK descartada da RAM e atreladas a hash SHA-256 no WORM.
                      </p>
                    </div>
                  </div>

                  {/* FORMULÁRIO DE ANOTAÇÕES */}
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                        Anotações Clínicas & Hipótese Diagnóstica Preliminar (Compartilhável no Prontuário)
                      </label>
                      <textarea
                        rows={3}
                        value={clinicalNotes}
                        onChange={(e) => setClinicalNotes(e.target.value)}
                        placeholder="Ex: Paciente demonstra sintomas compatíveis com ansiedade generalizada com hiperativação simpática..."
                        className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                        Anotações Confidenciais do Psicólogo (Segregadas pelo Art. 9º CFP - Acesso Exclusivo do Terapeuta)
                      </label>
                      <textarea
                        rows={2}
                        value={confidentialNotes}
                        onChange={(e) => setConfidentialNotes(e.target.value)}
                        placeholder="Anotações estritamente confidenciais, hipóteses preliminares reservadas para supervisão..."
                        className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  </div>

                  <div className="flex justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setStep(3)}
                      className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50"
                    >
                      Voltar ao Psicométrico
                    </button>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={handleSaveAssessment}
                      className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-md shadow-purple-500/20 transition flex items-center space-x-2"
                    >
                      {isSaving ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                      <span>Concluir & Salvar no Prontuário</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
