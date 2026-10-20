import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Bot,
  UserCheck,
  HeartPulse,
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  FileText,
  Save,
  RefreshCw,
  X,
  BarChart3,
  Smile,
  Frown,
  Check,
  Tag
} from 'lucide-react';
import {
  TranscriptionSpeaker,
  ConversationalSentiment
} from '@terapiainfoco/shared';
import type {
  TranscriptionSession,
  AiSoapDraft
} from '@terapiainfoco/shared';
import { api } from '../services/api';

const KNOWN_CID11 = ['6B00', '6A70', '6B01', 'QE84'];

interface AiTranscriptionSoapModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointmentId: string;
  patientId: string;
  patientName: string;
  onEhrRecordSaved?: (recordId: string) => void;
}

export const AiTranscriptionSoapModal: React.FC<AiTranscriptionSoapModalProps> = ({
  isOpen,
  onClose,
  appointmentId,
  patientId,
  patientName,
  onEhrRecordSaved
}) => {
  const [activeTab, setActiveTab] = useState<'soap' | 'diarization' | 'ingest'>('soap');
  const [session, setSession] = useState<TranscriptionSession | null>(null);
  const [draft, setDraft] = useState<AiSoapDraft | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Campos editáveis do SOAP (Human-in-the-Loop)
  const [subjective, setSubjective] = useState<string>('');
  const [objective, setObjective] = useState<string>('');
  const [assessment, setAssessment] = useState<string>('');
  const [plan, setPlan] = useState<string>('');
  const [finalCid11, setFinalCid11] = useState<string>('');
  const [reviewNotes, setReviewNotes] = useState<string>('');

  // Formulário de Nova Ingestão
  const [rawText, setRawText] = useState<string>('');
  const [consentConfirmed, setConsentConfirmed] = useState<boolean>(true);
  // Falas transcritas durante a teleconsulta (sem gravação)
  const [liveUtterancesCount, setLiveUtterancesCount] = useState<number>(0);
  // Texto da sala exibido no campo: sem edição, o backend usa a transcrição original (tempos reais)
  const [liveTranscriptText, setLiveTranscriptText] = useState<string>('');

  useEffect(() => {
    if (isOpen && appointmentId) {
      loadSession();
      api.getLiveTranscript(appointmentId)
        .then((utterances) => {
          const text = utterances
            .map((u) => `${u.speaker === TranscriptionSpeaker.THERAPIST ? 'TERAPEUTA' : 'PACIENTE'}: ${u.text}`)
            .join('\n');
          setLiveUtterancesCount(utterances.length);
          setLiveTranscriptText(text);
          setRawText(text);
        })
        .catch(() => setLiveUtterancesCount(0));
    }
  }, [isOpen, appointmentId]);

  const loadSession = async () => {
    setIsLoading(true);
    setFeedbackMessage(null);
    try {
      const data = await api.getTranscriptionSession(appointmentId);
      if (data) {
        setSession(data);
        if (data.soapDraft) {
          setDraft(data.soapDraft);
          populateSoapFields(data.soapDraft);
        }
      } else {
        // Se ainda não existir sessão, inicializa com ingestão automática para demonstração
        setSession(null);
        setDraft(null);
        setActiveTab('ingest');
      }
    } catch {
      setSession(null);
      setDraft(null);
      setActiveTab('ingest');
    } finally {
      setIsLoading(false);
    }
  };

  const populateSoapFields = (d: AiSoapDraft) => {
    setSubjective(d.subjectiveText || '');
    setObjective(d.objectiveText || '');
    setAssessment(d.assessmentText || '');
    setPlan(d.planText || '');
    setFinalCid11(d.suggestedCid11Codes?.[0] || '');
    setReviewNotes(d.reviewNotes || '');
  };

  const handleIngest = async () => {
    if (!consentConfirmed) {
      setFeedbackMessage({
        type: 'error',
        text: 'O consentimento formal do paciente (TCLE) é obrigatório por lei (CFP nº 011/2018 & LGPD).'
      });
      return;
    }

    setIsProcessing(true);
    setFeedbackMessage(null);
    try {
      const result = await api.ingestTranscription({
        appointmentId,
        patientId,
        rawTranscriptText: rawText.trim() && rawText.trim() !== liveTranscriptText.trim() ? rawText : undefined,
        consentConfirmed: true,
        includeClinicalMarkers: true
      });

      setSession(result.session);
      setDraft(result.soapDraft);
      populateSoapFields(result.soapDraft);
      setActiveTab('soap');
      setFeedbackMessage({
        type: 'success',
        text: 'Transcrição diarizada e Rascunho SOAP sintetizado com sucesso pela IA clínica.'
      });
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.message || 'Erro ao processar transcrição.'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReviewSoap = async (saveAsEhr: boolean) => {
    if (!draft) return;
    setIsSaving(true);
    setFeedbackMessage(null);

    const isModified =
      subjective !== draft.subjectiveText ||
      objective !== draft.objectiveText ||
      assessment !== draft.assessmentText ||
      plan !== draft.planText;

    const status = isModified ? 'MODIFIED_BY_THERAPIST' : 'ACCEPTED_BY_THERAPIST';

    try {
      const res = await api.reviewAiSoapDraft({
        draftId: draft.id,
        status,
        reviewedSubjective: subjective,
        reviewedObjective: objective,
        reviewedAssessment: assessment,
        reviewedPlan: plan,
        finalCid11: finalCid11 || undefined,
        reviewNotes,
        saveAsOfficialEhrNote: saveAsEhr
      });

      setDraft(res.draft);
      setFeedbackMessage({
        type: 'success',
        text: saveAsEhr
          ? 'Prontuário Oficial do Paciente (EHR) selado com sucesso na trilha WORM!'
          : 'Rascunho de evolução aprovado e atualizado.'
      });

      if (saveAsEhr && res.createdEhrRecordId && onEhrRecordSaved) {
        onEhrRecordSaved(res.createdEhrRecordId);
      }
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.message || 'Erro ao revisar rascunho SOAP.'
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="flex flex-col w-full max-w-5xl h-[90vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* HEADER */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Transcrição & Síntese SOAP Assistida por IA
                </h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Paciente: <strong className="text-slate-800 dark:text-slate-200">{patientName}</strong> • Human-in-the-Loop Obrigatório (CFP nº 011/2018)
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <div className="hidden md:flex items-center space-x-2 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-300">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Zero-Retention LGPD</span>
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

        {/* NAVEGAÇÃO POR ABAS */}
        <div className="flex items-center px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <button
            onClick={() => setActiveTab('soap')}
            className={`flex items-center space-x-2 py-3 px-4 border-b-2 font-medium text-xs transition ${
              activeTab === 'soap'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Rascunho de Prontuário SOAP</span>
            {draft && (
              <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                Gerado
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('diarization')}
            className={`flex items-center space-x-2 py-3 px-4 border-b-2 font-medium text-xs transition ${
              activeTab === 'diarization'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Diarização & Escuta Ativa</span>
            {session && (
              <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {session.utterances.length} turnos
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('ingest')}
            className={`flex items-center space-x-2 py-3 px-4 border-b-2 font-medium text-xs transition ${
              activeTab === 'ingest'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <RefreshCw className="w-4 h-4" />
            <span>Processar Nova Transcrição</span>
          </button>
        </div>

        {/* CONTEÚDO PRINCIPAL COM SCROLL */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30 dark:bg-slate-950/30">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full space-y-3">
              <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Carregando registros de transcrição...
              </p>
            </div>
          ) : activeTab === 'soap' ? (
            /* ================= ABA SOAP ================= */
            <div className="space-y-6 max-w-4xl mx-auto">
              {/* Alerta Ético de Crise se Houver */}
              {draft?.safetyWarning && (
                <div className="p-4 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 flex items-start space-x-3 text-red-900 dark:text-red-200">
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wide">
                      Alerta Ético CFP de Vulnerabilidade Aguda
                    </h4>
                    <p className="text-xs mt-1 leading-relaxed">
                      {draft.safetyWarning}
                    </p>
                  </div>
                </div>
              )}

              {/* Banner de Contexto Human-in-the-Loop */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/20 gap-3">
                <div className="flex items-center space-x-3">
                  <Bot className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white">
                      Rascunho Preliminar Sintetizado por IA
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Revise e ajuste as seções abaixo antes de selar o prontuário. A IA nunca assina autonomamente.
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">Status:</span>
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                    {draft?.status === 'ACCEPTED_BY_THERAPIST'
                      ? 'Aprovado pelo Terapeuta'
                      : draft?.status === 'MODIFIED_BY_THERAPIST'
                      ? 'Modificado & Aprovado'
                      : 'Pendente de Revisão'}
                  </span>
                </div>
              </div>

              {/* QUADRANTES SOAP EDITÁVEIS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* S - Subjetivo */}
                <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300">
                      S — SUBJETIVO
                    </span>
                    <span className="text-[10px] text-slate-400">Relatos & Queixas do Paciente</span>
                  </div>
                  <textarea
                    rows={4}
                    value={subjective}
                    onChange={(e) => setSubjective(e.target.value)}
                    placeholder="Descreva as queixas subjetivas, sentimentos relatados e vivências expressas pelo paciente..."
                    className="w-full text-xs p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                {/* O - Objetivo */}
                <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                      O — OBJETIVO
                    </span>
                    <span className="text-[10px] text-slate-400">Comportamento & Afeto</span>
                  </div>
                  <textarea
                    rows={4}
                    value={objective}
                    onChange={(e) => setObjective(e.target.value)}
                    placeholder="Sinais observáveis, linguagem corporal, modulação do afeto e contato visual..."
                    className="w-full text-xs p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                {/* A - Avaliação */}
                <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                      A — AVALIAÇÃO
                    </span>
                    <div className="flex items-center space-x-1.5">
                      <Tag className="w-3 h-3 text-purple-500" />
                      <select
                        value={finalCid11}
                        onChange={(e) => setFinalCid11(e.target.value)}
                        className="text-[11px] py-0.5 px-1.5 rounded border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/60 text-purple-900 dark:text-purple-200"
                      >
                        <option value="">Sem CID-11</option>
                        {draft?.suggestedCid11Codes
                          ?.filter((code) => !KNOWN_CID11.includes(code))
                          .map((code) => <option key={code} value={code}>CID-11: {code} (sugerido)</option>)}
                        <option value="6B00">CID-11: 6B00 (Ansiedade Generalizada)</option>
                        <option value="6A70">CID-11: 6A70 (Episódio Depressivo)</option>
                        <option value="6B01">CID-11: 6B01 (Transtorno de Pânico)</option>
                        <option value="QE84">CID-11: QE84 (Dificuldades de Relacionamento)</option>
                      </select>
                    </div>
                  </div>
                  <textarea
                    rows={4}
                    value={assessment}
                    onChange={(e) => setAssessment(e.target.value)}
                    placeholder="Hipóteses diagnósticas, dinâmicas psíquicas e elaboração clínica..."
                    className="w-full text-xs p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                {/* P - Plano */}
                <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      P — PLANO
                    </span>
                    <span className="text-[10px] text-slate-400">Intervenções & Tarefas</span>
                  </div>
                  <textarea
                    rows={4}
                    value={plan}
                    onChange={(e) => setPlan(e.target.value)}
                    placeholder="Acordos terapêuticos, técnicas aplicadas e objetivos para a próxima sessão..."
                    className="w-full text-xs p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* NOTAS DE REVISÃO DO TERAPEUTA */}
              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Parecer de Revisão Humana (Observações Clínicas Confidenciais)
                </label>
                <input
                  type="text"
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Ex: Rascunho verificado, quadrantes ajustados com foco nas técnicas de respiração combinadas."
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-slate-900 dark:text-slate-100"
                />
              </div>

              {/* BOTÕES DE AÇÃO */}
              <div className="flex flex-col sm:flex-row items-center justify-between pt-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleReviewSoap(false)}
                  disabled={isSaving}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium transition flex items-center justify-center space-x-2"
                >
                  <Save className="w-4 h-4 text-slate-500" />
                  <span>Apenas Salvar Rascunho</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleReviewSoap(true)}
                  disabled={isSaving}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-500/20 transition flex items-center justify-center space-x-2"
                >
                  {isSaving ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>Aprovar & Selar no Prontuário Oficial (EHR)</span>
                </button>
              </div>
            </div>
          ) : activeTab === 'diarization' ? (
            /* ================= ABA DIARIZAÇÃO & ESCUTA ATIVA ================= */
            <div className="space-y-6 max-w-4xl mx-auto">
              {/* MÉTRICAS DE ESCUTA CLÍNICA ATIVA */}
              {session?.metrics && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase">
                      Proporção Fala vs Escuta
                    </span>
                    <div className="flex items-baseline space-x-2">
                      <span className="text-2xl font-bold text-slate-900 dark:text-white">
                        {Math.round(session.metrics.talkToListenRatio * 100)}%
                      </span>
                      <span className="text-xs text-slate-500">fala do terapeuta</span>
                    </div>
                    {/* Barra de Proporção Visual */}
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden flex">
                      <div
                        className="bg-cyan-500 h-full"
                        style={{
                          width: `${Math.min(
                            100,
                            (session.metrics.therapistTalkTimeSeconds /
                              session.metrics.totalDurationSeconds) *
                              100
                          )}%`
                        }}
                        title="Terapeuta"
                      />
                      <div
                        className="bg-emerald-500 h-full flex-1"
                        title="Paciente"
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>Terapeuta: {session.metrics.therapistTalkTimeSeconds}s</span>
                      <span>Paciente: {session.metrics.patientTalkTimeSeconds}s</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase">
                      Dinâmica Conversacional
                    </span>
                    <div className="flex items-baseline space-x-2">
                      <span className="text-2xl font-bold text-slate-900 dark:text-white">
                        {session.metrics.turnTakingCount}
                      </span>
                      <span className="text-xs text-slate-500">alternâncias de turno</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Silêncio reflexivo total: <strong>{session.metrics.silenceDurationSeconds}s</strong>
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase">
                      Diagnóstico de Enquadre
                    </span>
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                      {session.metrics.clinicalBalanceAdvice}
                    </p>
                  </div>
                </div>
              )}

              {/* LISTA DE ENUNCIADOS DIARIZADOS */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Linha do Tempo dos Diálogos
                </h4>

                {session?.utterances && session.utterances.length > 0 ? (
                  session.utterances.map((u, i) => {
                    const isTherapist = u.speaker === TranscriptionSpeaker.THERAPIST;
                    return (
                      <div
                        key={u.id || i}
                        className={`p-3.5 rounded-xl border transition ${
                          isTherapist
                            ? 'bg-cyan-50/50 dark:bg-cyan-950/20 border-cyan-200 dark:border-cyan-900/40 ml-4'
                            : 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40 mr-4'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center space-x-2">
                            {isTherapist ? (
                              <UserCheck className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                            ) : (
                              <HeartPulse className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            )}
                            <span className="text-xs font-bold text-slate-900 dark:text-white">
                              {isTherapist ? 'Psicólogo(a)' : patientName}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {Math.floor(u.startTimeMs / 1000)}s - {Math.floor(u.endTimeMs / 1000)}s
                            </span>
                          </div>

                          <div className="flex items-center space-x-2">
                            {u.sentimentPolarity === ConversationalSentiment.POSITIVE && (
                              <span className="flex items-center space-x-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                                <Smile className="w-3 h-3" />
                                <span>Afeto Positivo</span>
                              </span>
                            )}
                            {u.sentimentPolarity === ConversationalSentiment.NEGATIVE && (
                              <span className="flex items-center space-x-1 text-[10px] text-amber-600 dark:text-amber-400">
                                <Frown className="w-3 h-3" />
                                <span>Tensão / Angústia</span>
                              </span>
                            )}
                            {u.linkedMarkerId && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                                Marcador Vinculado
                              </span>
                            )}
                          </div>
                        </div>

                        <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                          {u.text}
                        </p>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-slate-400">Nenhum diálogo registrado.</p>
                )}
              </div>
            </div>
          ) : (
            /* ================= ABA INGESTÃO DE TRANSCRIÇÃO ================= */
            <div className="space-y-6 max-w-3xl mx-auto">
              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                  <Bot className="w-4 h-4 text-emerald-500" />
                  <span>Processamento de Transcrição Clínica</span>
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {liveUtterancesCount > 0
                    ? `A transcrição da teleconsulta está disponível (${liveUtterancesCount} falas). Ela já está no campo abaixo; revise ou substitua se preferir.`
                    : 'Cole o texto da conversa com os locutores. Sessões realizadas na sala da plataforma com consentimento já chegam transcritas.'}
                  {' '}O sistema realizará a <strong>diarização estrita dos locutores</strong> e a <strong>síntese estruturada no modelo SOAP</strong>.
                </p>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Texto da Transcrição com Locutores
                  </label>
                  <textarea
                    rows={6}
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder="[TERAPEUTA]: Olá, como você está hoje?&#10;[PACIENTE]: Doutora, tive muita ansiedade durante a semana..."
                    className="w-full text-xs p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-slate-900 dark:text-slate-100 font-mono"
                  />
                </div>

                <div className="flex items-start space-x-3 p-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40">
                  <input
                    type="checkbox"
                    id="consentCheckbox"
                    checked={consentConfirmed}
                    onChange={(e) => setConsentConfirmed(e.target.checked)}
                    className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                  />
                  <label htmlFor="consentCheckbox" className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    <strong>Consentimento Livre e Esclarecido (TCLE) confirmado:</strong> O paciente expressou consentimento inequívoco para transcrição assistida por inteligência artificial sob as diretrizes da Resolução CFP nº 011/2018 e LGPD Art. 7º.
                  </label>
                </div>

                <button
                  type="button"
                  onClick={handleIngest}
                  disabled={isProcessing}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-500/20 transition flex items-center justify-center space-x-2"
                >
                  {isProcessing ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  <span>Iniciar Diarização & Síntese SOAP IA</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
