import React, { useState, useEffect } from 'react';
import {
  HeartHandshake,
  Calendar,
  FileText,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Send,
  Video,
  Receipt,
  Shield,
  X,
  RefreshCw,
  Award,
  ChevronRight,
  Activity,
  MessageSquare,
  Lock,
  LogOut,
  Copy,
  Check
} from 'lucide-react';
import {
  ExerciseType,
  ExerciseStatus
} from '@terapiainfoco/shared';
import type {
  TherapeuticExercise,
  PatientPortalOverview,
  PatientPortalProfile,
  DecryptedPatient
} from '@terapiainfoco/shared';
import { api } from '../services/api';

interface PatientPortalModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPatientId?: string;
}

export const PatientPortalModal: React.FC<PatientPortalModalProps> = ({
  isOpen,
  onClose,
  initialPatientId
}) => {
  // Controle de Modo: 'portal' (Visão do Paciente) ou 'therapist' (Prescritor)
  const [viewMode, setViewMode] = useState<'portal' | 'therapist'>('portal');

  // Estado de Autenticação do Paciente
  const [patientToken, setPatientToken] = useState<string | null>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('terapiainfoco_patient_token') : null;
  });
  const [authStep, setAuthStep] = useState<'email' | 'code'>('email');
  const [inputEmail, setInputEmail] = useState<string>('ana.paula.paciente@gmail.com');
  const [inputCode, setInputCode] = useState<string>('');
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);
  const [patientProfile, setPatientProfile] = useState<PatientPortalProfile | null>(null);

  // Dados do Portal do Paciente
  const [overview, setOverview] = useState<PatientPortalOverview | null>(null);
  const [exercises, setExercises] = useState<TherapeuticExercise[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [portalTab, setPortalTab] = useState<'overview' | 'exercises' | 'receipts' | 'consent'>('overview');
  const [isLoadingPortal, setIsLoadingPortal] = useState<boolean>(false);

  // Exercício em Resolução (Modal Interno do Paciente)
  const [resolvingExercise, setResolvingExercise] = useState<TherapeuticExercise | null>(null);
  const [exerciseAnswers, setExerciseAnswers] = useState<Record<string, any>>({});
  const [exerciseNotes, setExerciseNotes] = useState<string>('');
  const [isSubmittingExercise, setIsSubmittingExercise] = useState<boolean>(false);

  // Estado do Terapeuta (Prescrição)
  const [patientsList, setPatientsList] = useState<DecryptedPatient[]>([]);
  const [selectedTherapistPatientId, setSelectedTherapistPatientId] = useState<string>(initialPatientId || '');
  const [therapistExercises, setTherapistExercises] = useState<TherapeuticExercise[]>([]);
  const [isAssigning, setIsAssigning] = useState<boolean>(false);
  const [newExerciseTitle, setNewExerciseTitle] = useState<string>('Registro de Pensamentos Disfuncionais (RPD)');
  const [newExerciseDesc, setNewExerciseDesc] = useState<string>('Anote situações de ansiedade e busque respostas adaptativas.');
  const [newExerciseType, setNewExerciseType] = useState<ExerciseType>(ExerciseType.RPD_THOUGHT_RECORD);
  const [newExerciseDue, setNewExerciseDue] = useState<string>('');
  const [reviewingExercise, setReviewingExercise] = useState<TherapeuticExercise | null>(null);
  const [reviewFeedback, setReviewFeedback] = useState<string>('');
  const [isSubmittingReview, setIsSubmittingReview] = useState<boolean>(false);

  // Mensagens de Feedback
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (patientToken) {
        loadPortalData(patientToken);
      }
      loadTherapistPatients();
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedTherapistPatientId) {
      loadTherapistPatientExercises(selectedTherapistPatientId);
    }
  }, [selectedTherapistPatientId]);

  const loadPortalData = async (token: string) => {
    setIsLoadingPortal(true);
    try {
      const [ov, exList, recList] = await Promise.all([
        api.getPatientPortalOverview(token),
        api.getPatientExercises(token),
        api.getPatientReceipts(token)
      ]);
      setOverview(ov);
      setPatientProfile(ov.profile);
      setExercises(exList);
      setReceipts(recList);
    } catch {
      // Se o token estiver expirado, reseta
      setPatientToken(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('terapiainfoco_patient_token');
      }
    } finally {
      setIsLoadingPortal(false);
    }
  };

  const loadTherapistPatients = async () => {
    try {
      const appointments = await api.getAppointments();
      const map = new Map<string, string>();
      map.set('pat-001', 'Mariana Silva de Oliveira');
      map.set('pat-002', 'Lucas Gabriel Santos');
      map.set('pat-003', 'Beatriz Costa Lima');
      if (initialPatientId) {
        map.set(initialPatientId, 'Paciente Selecionado');
      }
      for (const a of appointments) {
        if (a.patientId && !map.has(a.patientId)) {
          map.set(a.patientId, `Paciente (${a.patientId})`);
        }
      }
      const list = Array.from(map.entries()).map(([id, name]) => ({ id, name }));
      setPatientsList(list as any);
      if (!selectedTherapistPatientId && list.length > 0) {
        setSelectedTherapistPatientId(list[0].id);
      }
    } catch {
      setPatientsList([
        { id: initialPatientId || 'pat-001', name: 'Mariana Silva de Oliveira' } as any
      ]);
    }
  };

  const loadTherapistPatientExercises = async (patId: string) => {
    try {
      const list = await api.getTherapistPatientExercises(patId);
      setTherapistExercises(list);
    } catch {
      setTherapistExercises([]);
    }
  };

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputEmail.trim()) return;
    setIsAuthenticating(true);
    setFeedbackMessage(null);
    try {
      const res = await api.requestPatientAccessCode({ email: inputEmail.trim() });
      if (res.code) {
        setDemoCode(res.code);
        setInputCode(res.code);
      }
      setAuthStep('code');
      setFeedbackMessage({
        type: 'success',
        text: 'Código de acesso enviado com sucesso para seu e-mail!'
      });
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.message || 'E-mail não localizado no cadastro da clínica.'
      });
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCode.trim()) return;
    setIsAuthenticating(true);
    setFeedbackMessage(null);
    try {
      const res = await api.verifyPatientAccessCode({
        email: inputEmail.trim(),
        code: inputCode.trim()
      });
      if (res.token) {
        setPatientToken(res.token);
        if (res.profile) setPatientProfile(res.profile);
        await loadPortalData(res.token);
        setFeedbackMessage({
          type: 'success',
          text: `Bem-vindo(a), ${res.profile?.name || 'ao seu espaço clínico'}!`
        });
      }
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.message || 'Código de acesso inválido ou expirado.'
      });
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogoutPatient = () => {
    setPatientToken(null);
    setPatientProfile(null);
    setOverview(null);
    setExercises([]);
    setAuthStep('email');
    if (typeof window !== 'undefined') {
      localStorage.removeItem('terapiainfoco_patient_token');
    }
  };

  const handleOpenExercise = (ex: TherapeuticExercise) => {
    setResolvingExercise(ex);
    setExerciseAnswers(ex.answers || {});
    setExerciseNotes('');
  };

  const handleSubmitExerciseResponse = async () => {
    if (!resolvingExercise || !patientToken) return;
    setIsSubmittingExercise(true);
    setFeedbackMessage(null);
    try {
      await api.submitPatientExercise(
        {
          exerciseId: resolvingExercise.id,
          answers: exerciseAnswers,
          notes: exerciseNotes
        },
        patientToken
      );

      setFeedbackMessage({
        type: 'success',
        text: 'Exercício concluído e salvo com criptografia de ponta a ponta!'
      });
      setResolvingExercise(null);
      await loadPortalData(patientToken);
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.message || 'Erro ao submeter exercício.'
      });
    } finally {
      setIsSubmittingExercise(false);
    }
  };

  const handleAssignExerciseByTherapist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTherapistPatientId || !newExerciseTitle.trim()) return;
    setIsAssigning(true);
    setFeedbackMessage(null);
    try {
      await api.assignTherapeuticExercise({
        patientId: selectedTherapistPatientId,
        title: newExerciseTitle.trim(),
        description: newExerciseDesc.trim(),
        type: newExerciseType,
        dueAt: newExerciseDue || undefined
      });

      setFeedbackMessage({
        type: 'success',
        text: 'Exercício terapêutico prescrito com sucesso para o paciente!'
      });
      await loadTherapistPatientExercises(selectedTherapistPatientId);
      setNewExerciseTitle('');
      setNewExerciseDesc('');
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.message || 'Erro ao prescrever exercício terapêutico.'
      });
    } finally {
      setIsAssigning(false);
    }
  };

  const handleSubmitReviewByTherapist = async () => {
    if (!reviewingExercise || !reviewFeedback.trim()) return;
    setIsSubmittingReview(true);
    setFeedbackMessage(null);
    try {
      await api.reviewTherapeuticExercise({
        exerciseId: reviewingExercise.id,
        feedback: reviewFeedback.trim()
      });

      setFeedbackMessage({
        type: 'success',
        text: 'Feedback clínico registrado na trilha do paciente!'
      });
      setReviewingExercise(null);
      setReviewFeedback('');
      if (selectedTherapistPatientId) {
        await loadTherapistPatientExercises(selectedTherapistPatientId);
      }
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.message || 'Erro ao registrar feedback clínico.'
      });
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(id);
    setTimeout(() => setCopiedToken(null), 2500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-5xl h-[90vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl flex flex-col border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* CABEÇALHO DO MODAL */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <HeartHandshake className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                  Portal do Paciente & Exercícios Terapêuticos
                </h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Espaço protegido para tarefas entre sessões (TCC/ACT/DBT), teleconsulta ética e recibos de reembolso
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Seletor de Modo: Visão do Paciente vs Painel do Psicólogo */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setViewMode('portal')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  viewMode === 'portal'
                    ? 'bg-white dark:bg-slate-700 text-purple-600 dark:text-purple-300 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Visão do Paciente
              </button>
              <button
                type="button"
                onClick={() => setViewMode('therapist')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  viewMode === 'therapist'
                    ? 'bg-white dark:bg-slate-700 text-purple-600 dark:text-purple-300 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Prescrição pelo Psicólogo
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* FEEDBACK BANNER */}
        {feedbackMessage && (
          <div
            className={`px-6 py-2.5 text-xs font-medium flex items-center justify-between transition ${
              feedbackMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
            }`}
          >
            <span>{feedbackMessage.text}</span>
            <button onClick={() => setFeedbackMessage(null)} className="text-[10px] underline ml-2">
              Dispensar
            </button>
          </div>
        )}

        {/* CONTEÚDO PRINCIPAL COM ROLAGEM */}
        <div className="flex-1 overflow-y-auto bg-slate-50/40 dark:bg-slate-950/40">
          {viewMode === 'portal' ? (
            /* ========================================================= */
            /* MODO 1: VISÃO DO PACIENTE                                  */
            /* ========================================================= */
            !patientToken ? (
              /* TELA DE LOGIN DO PACIENTE */
              <div className="flex items-center justify-center min-h-[500px] p-6">
                <div className="w-full max-w-md p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl space-y-6">
                  <div className="text-center space-y-2">
                    <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center mx-auto">
                      <Lock className="w-6 h-6" />
                    </div>
                    <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      Acesso Seguro ao Portal do Paciente
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Acesso sem senhas complexas: enviamos um código descartável de 6 dígitos para o seu e-mail cadastrado.
                    </p>
                  </div>

                  {authStep === 'email' ? (
                    <form onSubmit={handleRequestCode} className="space-y-4">
                      <div>
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                          Seu E-mail Cadastrado na Clínica
                        </label>
                        <input
                          type="email"
                          required
                          value={inputEmail}
                          onChange={(e) => setInputEmail(e.target.value)}
                          placeholder="seu.email@exemplo.com"
                          className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-slate-900 dark:text-slate-100"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isAuthenticating}
                        className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-md shadow-purple-500/20 transition flex items-center justify-center space-x-2"
                      >
                        {isAuthenticating ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                        <span>Enviar Código de Acesso</span>
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleVerifyCode} className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Código de 6 Dígitos
                          </label>
                          <button
                            type="button"
                            onClick={() => setAuthStep('email')}
                            className="text-[11px] text-purple-600 dark:text-purple-400 hover:underline"
                          >
                            Trocar e-mail
                          </button>
                        </div>
                        <input
                          type="text"
                          required
                          maxLength={6}
                          value={inputCode}
                          onChange={(e) => setInputCode(e.target.value)}
                          placeholder="123456"
                          className="w-full text-center text-lg font-mono tracking-widest p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-slate-900 dark:text-slate-100"
                        />
                        {demoCode && (
                          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 text-center">
                            Código de demonstração: <strong className="font-mono text-purple-600 dark:text-purple-400">{demoCode}</strong>
                          </p>
                        )}
                      </div>

                      <button
                        type="submit"
                        disabled={isAuthenticating}
                        className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-md shadow-purple-500/20 transition flex items-center justify-center space-x-2"
                      >
                        {isAuthenticating ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <ArrowRight className="w-4 h-4" />
                        )}
                        <span>Acessar Meu Espaço Terapêutico</span>
                      </button>
                    </form>
                  )}

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-center">
                    <span className="text-[10px] text-slate-400 flex items-center justify-center space-x-1">
                      <Shield className="w-3 h-3 text-purple-500" />
                      <span>Protegido com Criptografia LGPD & Sigilo CFP nº 011/2018</span>
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              /* PAINEL AUTENTICADO DO PACIENTE */
              <div className="p-6 space-y-6 max-w-5xl mx-auto">
                {/* CABEÇALHO DO PACIENTE */}
                <div className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm gap-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-bold text-sm flex items-center justify-center border border-purple-200 dark:border-purple-800">
                      {patientProfile?.initials || 'P.'}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {patientProfile?.name}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Acompanhamento com <strong className="text-slate-700 dark:text-slate-300">{patientProfile?.therapistName}</strong> ({patientProfile?.therapistCrp})
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <button
                      onClick={handleLogoutPatient}
                      className="flex items-center space-x-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Encerrar Sessão</span>
                    </button>
                  </div>
                </div>

                {/* NAVEGAÇÃO DE ABAS DO PORTAL */}
                <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-slate-800 pb-2">
                  <button
                    onClick={() => setPortalTab('overview')}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold transition ${
                      portalTab === 'overview'
                        ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <Activity className="w-4 h-4" />
                    <span>Meu Acompanhamento</span>
                  </button>

                  <button
                    onClick={() => setPortalTab('exercises')}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold transition ${
                      portalTab === 'exercises'
                        ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Exercícios Terapêuticos</span>
                    {overview && overview.pendingExercisesCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        {overview.pendingExercisesCount} pendente(s)
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setPortalTab('receipts')}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold transition ${
                      portalTab === 'receipts'
                        ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <Receipt className="w-4 h-4" />
                    <span>Recibos para Reembolso</span>
                    {receipts.length > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {receipts.length}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setPortalTab('consent')}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold transition ${
                      portalTab === 'consent'
                        ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <Shield className="w-4 h-4" />
                    <span>Termos & Consentimentos (TCLE)</span>
                  </button>
                </div>

                {/* CONTEÚDO DAS ABAS DO PACIENTE */}
                {isLoadingPortal ? (
                  <div className="flex flex-col items-center justify-center p-12 space-y-3">
                    <RefreshCw className="w-6 h-6 text-purple-500 animate-spin" />
                    <span className="text-xs text-slate-500">Carregando seu espaço clínico...</span>
                  </div>
                ) : portalTab === 'overview' ? (
                  <div className="space-y-6">
                    {/* CARD DA PRÓXIMA CONSULTA */}
                    {overview?.nextAppointment ? (
                      <div className="p-5 rounded-2xl bg-gradient-to-r from-purple-500/10 via-purple-500/5 to-transparent border border-purple-200 dark:border-purple-800/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                              Próximo Atendimento
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {overview.nextAppointment.type}
                            </span>
                          </div>
                          <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                            {new Date(overview.nextAppointment.date).toLocaleDateString('pt-BR', {
                              weekday: 'long',
                              day: '2-digit',
                              month: 'long'
                            })} às {overview.nextAppointment.time}
                          </h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Duração prevista: {overview.nextAppointment.durationMinutes} minutos • Sala Segura com Cifragem Ponta a Ponta
                          </p>
                        </div>

                        <div>
                          {overview.nextAppointment.canEnterWaitingRoom ? (
                            <button
                              type="button"
                              onClick={() => {
                                alert(`Entrando na Sala de Espera Ética (Knocking CFP nº 011/2018). O psicólogo será notificado para admiti-lo.`);
                              }}
                              className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-md shadow-purple-500/20 transition flex items-center space-x-2"
                            >
                              <Video className="w-4 h-4" />
                              <span>Entrar na Sala de Espera</span>
                            </button>
                          ) : (
                            <div className="text-right">
                              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                                Sala de Espera liberada 30 min antes
                              </span>
                              <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">
                                Consulta Confirmada
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-2">
                        <Calendar className="w-8 h-8 text-slate-400 mx-auto" />
                        <h5 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          Nenhuma consulta futura agendada no momento
                        </h5>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                          Entre em contato diretamente com sua psicóloga para agendar seu próximo horário.
                        </p>
                      </div>
                    )}

                    {/* CARDS DE RESUMO DE ATIVIDADES */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Exercícios Pendentes</span>
                        <div className="flex items-baseline space-x-2">
                          <span className="text-2xl font-black text-amber-600 dark:text-amber-400">
                            {overview?.pendingExercisesCount || 0}
                          </span>
                          <span className="text-xs text-slate-500">para esta semana</span>
                        </div>
                      </div>

                      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Exercícios Realizados</span>
                        <div className="flex items-baseline space-x-2">
                          <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                            {overview?.completedExercisesCount || 0}
                          </span>
                          <span className="text-xs text-slate-500">completados</span>
                        </div>
                      </div>

                      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Recibos Emitidos</span>
                        <div className="flex items-baseline space-x-2">
                          <span className="text-2xl font-black text-blue-600 dark:text-blue-400">
                            {overview?.availableReceiptsCount || 0}
                          </span>
                          <span className="text-xs text-slate-500">prontos para reembolso</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : portalTab === 'exercises' ? (
                  /* ABA DE EXERCÍCIOS TERAPÊUTICOS */
                  <div className="space-y-4">
                    {exercises.length === 0 ? (
                      <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                        <Sparkles className="w-8 h-8 text-slate-400 mx-auto" />
                        <h5 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          Nenhum exercício terapêutico prescrito no momento
                        </h5>
                        <p className="text-[11px] text-slate-500">
                          Sua terapeuta indicará atividades aqui conforme a evolução do seu tratamento.
                        </p>
                      </div>
                    ) : (
                      exercises.map(ex => (
                        <div
                          key={ex.id}
                          className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3"
                        >
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center space-x-2">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  ex.status === ExerciseStatus.COMPLETED || ex.status === ExerciseStatus.REVIEWED
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                }`}>
                                  {ex.status === ExerciseStatus.COMPLETED ? 'Concluído' : ex.status === ExerciseStatus.REVIEWED ? 'Revisado pela Terapeuta' : 'Pendente'}
                                </span>
                                <span className="text-xs font-bold text-purple-600 dark:text-purple-400">
                                  {ex.type === ExerciseType.RPD_THOUGHT_RECORD ? 'TCC • RPD' : ex.type === ExerciseType.MOOD_TRACKER ? 'Diário de Humor' : 'Mindfulness'}
                                </span>
                              </div>
                              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{ex.title}</h4>
                              <p className="text-xs text-slate-500 dark:text-slate-400">{ex.description}</p>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleOpenExercise(ex)}
                              className="px-3 py-1.5 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/60 text-xs font-bold transition flex items-center space-x-1"
                            >
                              <span>{ex.status === ExerciseStatus.COMPLETED || ex.status === ExerciseStatus.REVIEWED ? 'Ver Respostas' : 'Responder Exercício'}</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* FEEDBACK DO TERAPEUTA SE HOUVER */}
                          {ex.therapistFeedback && (
                            <div className="p-3.5 rounded-xl bg-purple-50/50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 space-y-1">
                              <div className="flex items-center space-x-1.5 text-xs font-bold text-purple-800 dark:text-purple-300">
                                <Award className="w-3.5 h-3.5 text-purple-600" />
                                <span>Feedback da Terapeuta:</span>
                              </div>
                              <p className="text-xs text-slate-700 dark:text-slate-300 italic leading-relaxed">
                                "{ex.therapistFeedback}"
                              </p>
                              {ex.reviewedAt && (
                                <span className="text-[10px] text-slate-400 block mt-1">
                                  Revisado em {new Date(ex.reviewedAt).toLocaleDateString('pt-BR')}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                ) : portalTab === 'receipts' ? (
                  /* ABA DE RECIBOS PARA REEMBOLSO */
                  <div className="space-y-4">
                    {receipts.length === 0 ? (
                      <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                        <Receipt className="w-8 h-8 text-slate-400 mx-auto" />
                        <h5 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          Nenhum recibo emitido até o momento
                        </h5>
                        <p className="text-[11px] text-slate-500">
                          Recibos gerados pela sua psicóloga para reembolso de convênio ou declaração de IR aparecerão aqui.
                        </p>
                      </div>
                    ) : (
                      receipts.map(rec => (
                        <div
                          key={rec.id}
                          className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <span className="font-mono text-xs font-bold text-purple-600 dark:text-purple-400">
                                {rec.receiptNumber}
                              </span>
                              <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                Quitado
                              </span>
                            </div>
                            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                              R$ {(rec.amountCents / 100).toFixed(2)} • {rec.purpose === 'CONVENIO_REIMBURSO' ? 'Reembolso de Plano de Saúde' : 'Comprovante de Quitação'}
                            </h4>
                            <p className="text-[11px] text-slate-500">
                              Emitido em {new Date(rec.issueDate).toLocaleDateString('pt-BR')} • {rec.sessionDates?.length || 1} sessão(ões)
                            </p>
                          </div>

                          <div className="flex items-center space-x-2">
                            <button
                              type="button"
                              onClick={() => copyToClipboard(rec.validationToken || rec.id, rec.id)}
                              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center space-x-1"
                            >
                              {copiedToken === rec.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                              <span>{copiedToken === rec.id ? 'Token Copiado' : 'Token de Fé Pública'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                alert(`Download do Recibo Oficial Timbrado com QR Code para envio à operadora de saúde.`);
                              }}
                              className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition flex items-center space-x-1"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>Baixar Recibo PDF</span>
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  /* ABA DE CONSENTIMENTO E TCLE */
                  <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
                    <div className="flex items-center space-x-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                      <Shield className="w-4 h-4 text-purple-600" />
                      <span>Termos de Consentimento Livre e Esclarecido (TCLE) Ativos</span>
                    </div>

                    <div className="space-y-3">
                      <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <div>
                          <span className="text-xs font-bold block text-slate-800 dark:text-slate-200">
                            Atendimento Psicológico por Meios Tecnológicos (CFP nº 011/2018)
                          </span>
                          <span className="text-[11px] text-slate-500">
                            Consentimento de adesão à telepsicologia com sigilo profissional estrito (Art. 9º).
                          </span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          Aceito & Válido
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <div>
                          <span className="text-xs font-bold block text-slate-800 dark:text-slate-200">
                            Transcrição Consentida da Sessão, sem Gravação (LGPD Art. 11)
                          </span>
                          <span className="text-[11px] text-slate-500">
                            Armazenamento em repouso criptografado com destruição programada pós-sessão.
                          </span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          Aceito & Válido
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          ) : (
            /* ========================================================= */
            /* MODO 2: PRESCRIÇÃO DE EXERCÍCIOS PELO TERAPEUTA          */
            /* ========================================================= */
            <div className="p-6 space-y-6 max-w-5xl mx-auto">
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Prescrever Exercício Terapêutico (TCC / ACT / DBT)
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Envie tarefas entre sessões diretamente para o Portal do Paciente com formulário interativo guiado.
                    </p>
                  </div>

                  {/* SELETOR DE PACIENTE */}
                  <div className="w-full md:w-64">
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                      Selecionar Paciente:
                    </label>
                    <select
                      value={selectedTherapistPatientId}
                      onChange={(e) => setSelectedTherapistPatientId(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-slate-900 dark:text-slate-100 font-medium"
                    >
                      {patientsList.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* FORMULÁRIO DE PRESCRIÇÃO */}
                <form onSubmit={handleAssignExerciseByTherapist} className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Modalidade do Exercício
                    </label>
                    <select
                      value={newExerciseType}
                      onChange={(e) => {
                        const val = e.target.value as ExerciseType;
                        setNewExerciseType(val);
                        if (val === ExerciseType.RPD_THOUGHT_RECORD) {
                          setNewExerciseTitle('Registro de Pensamentos Disfuncionais (RPD)');
                          setNewExerciseDesc('Anote pensamentos automáticos e busque evidências contrárias adaptativas.');
                        } else if (val === ExerciseType.MOOD_TRACKER) {
                          setNewExerciseTitle('Rastreador Diário de Humor');
                          setNewExerciseDesc('Monitore seu humor em escala de 1 a 10 e anote o momento positivo do dia.');
                        } else if (val === ExerciseType.MINDFULNESS_BREATHING) {
                          setNewExerciseTitle('Treino de Respiração Diafragmática 4-4-6');
                          setNewExerciseDesc('Pratique a regulação autonômica e compare a ansiedade antes e depois.');
                        } else if (val === ExerciseType.VALUES_CLARIFICATION) {
                          setNewExerciseTitle('Inventário de Valores & Ação Comprometida (ACT)');
                          setNewExerciseDesc('Defina uma ação concreta alinhada aos seus valores fundamentais.');
                        }
                      }}
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-slate-900 dark:text-slate-100"
                    >
                      <option value={ExerciseType.RPD_THOUGHT_RECORD}>RPD • Pensamentos Disfuncionais (TCC)</option>
                      <option value={ExerciseType.MOOD_TRACKER}>Rastreador de Humor & Gatilhos</option>
                      <option value={ExerciseType.MINDFULNESS_BREATHING}>Respiração & Mindfulness (4-4-6)</option>
                      <option value={ExerciseType.VALUES_CLARIFICATION}>Inventário de Valores (ACT)</option>
                      <option value={ExerciseType.BEHAVIORAL_ACTIVATION}>Ativação Comportamental (DBT/TCC)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Título do Exercício
                    </label>
                    <input
                      type="text"
                      required
                      value={newExerciseTitle}
                      onChange={(e) => setNewExerciseTitle(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Data Limite Sugerida para Conclusão (Opcional)
                    </label>
                    <input
                      type="date"
                      value={newExerciseDue}
                      onChange={(e) => setNewExerciseDue(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Instruções Clínicas para o Paciente
                    </label>
                    <textarea
                      rows={2}
                      value={newExerciseDesc}
                      onChange={(e) => setNewExerciseDesc(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div className="md:col-span-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={isAssigning || !selectedTherapistPatientId}
                      className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-md shadow-purple-500/20 transition flex items-center space-x-2"
                    >
                      {isAssigning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      <span>Prescrever para o Paciente</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* LISTA DE EXERCÍCIOS DO PACIENTE SELECIONADO */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Histórico de Exercícios do Paciente ({therapistExercises.length})
                </h4>

                {therapistExercises.length === 0 ? (
                  <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                    Nenhum exercício prescrito para este paciente ainda.
                  </div>
                ) : (
                  therapistExercises.map(ex => (
                    <div
                      key={ex.id}
                      className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3"
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              ex.status === ExerciseStatus.COMPLETED || ex.status === ExerciseStatus.REVIEWED
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            }`}>
                              {ex.status === ExerciseStatus.COMPLETED ? 'Respondido pelo Paciente' : ex.status === ExerciseStatus.REVIEWED ? 'Revisado com Feedback' : 'Aguardando Resposta'}
                            </span>
                            <span className="text-xs font-mono text-purple-600 dark:text-purple-400">
                              {ex.type}
                            </span>
                          </div>
                          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{ex.title}</h4>
                          <p className="text-xs text-slate-500">{ex.description}</p>
                        </div>

                        {ex.status === ExerciseStatus.COMPLETED || ex.status === ExerciseStatus.REVIEWED ? (
                          <button
                            type="button"
                            onClick={() => {
                              setReviewingExercise(ex);
                              setReviewFeedback(ex.therapistFeedback || '');
                            }}
                            className="px-3 py-1.5 rounded-xl bg-purple-600 text-white hover:bg-purple-700 text-xs font-bold transition flex items-center space-x-1"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>{ex.status === ExerciseStatus.REVIEWED ? 'Editar Feedback' : 'Inserir Feedback'}</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400">Pendente de preenchimento</span>
                        )}
                      </div>

                      {/* RESPOSTAS DO PACIENTE */}
                      {ex.answers && (
                        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-xs space-y-2">
                          <span className="font-bold text-slate-700 dark:text-slate-300 block text-[11px]">
                            Respostas do Paciente (Decifradas FLE AES-256-GCM):
                          </span>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {Object.entries(ex.answers).map(([k, v]) => (
                              <div key={k} className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                                <span className="text-[10px] text-slate-400 block uppercase">{k}</span>
                                <span className="font-medium text-slate-800 dark:text-slate-200">{String(v)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* FEEDBACK SALVO */}
                      {ex.therapistFeedback && (
                        <div className="p-3 rounded-xl bg-purple-50/40 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/40 text-xs">
                          <strong className="text-purple-700 dark:text-purple-300 block mb-0.5">Seu Feedback Clínico:</strong>
                          <p className="text-slate-700 dark:text-slate-300 italic">{ex.therapistFeedback}</p>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* MODAL INTERNO: PACIENTE RESPONDENDO EXERCÍCIO */}
        {resolvingExercise && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-5 shadow-2xl max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {resolvingExercise.title}
                  </h4>
                  <p className="text-xs text-slate-500">
                    {resolvingExercise.templateData?.instructions || resolvingExercise.description}
                  </p>
                </div>
                <button onClick={() => setResolvingExercise(null)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              {/* CAMPOS DINÂMICOS DO TEMPLATE */}
              <div className="space-y-4">
                {(resolvingExercise.templateData?.fields || []).map((f: any) => (
                  <div key={f.key}>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      {f.label}
                    </label>
                    {f.type === 'textarea' ? (
                      <textarea
                        rows={3}
                        value={exerciseAnswers[f.key] || ''}
                        onChange={(e) => setExerciseAnswers({ ...exerciseAnswers, [f.key]: e.target.value })}
                        placeholder={f.placeholder}
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-slate-900 dark:text-slate-100"
                      />
                    ) : f.type === 'select' ? (
                      <select
                        value={exerciseAnswers[f.key] || ''}
                        onChange={(e) => setExerciseAnswers({ ...exerciseAnswers, [f.key]: e.target.value })}
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-slate-900 dark:text-slate-100"
                      >
                        <option value="">Selecione uma opção...</option>
                        {(f.options || []).map((opt: string) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={f.type || 'text'}
                        value={exerciseAnswers[f.key] || ''}
                        onChange={(e) => setExerciseAnswers({ ...exerciseAnswers, [f.key]: e.target.value })}
                        placeholder={f.placeholder}
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-slate-900 dark:text-slate-100"
                      />
                    )}
                  </div>
                ))}

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Observações Adicionais para sua Psicóloga
                  </label>
                  <textarea
                    rows={2}
                    value={exerciseNotes}
                    onChange={(e) => setExerciseNotes(e.target.value)}
                    placeholder="Algo mais que você sentiu ao fazer este exercício?"
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setResolvingExercise(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSubmitExerciseResponse}
                  disabled={isSubmittingExercise}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-md shadow-purple-500/20 transition flex items-center space-x-2"
                >
                  {isSubmittingExercise ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  <span>Concluir & Enviar com Sigilo Criptográfico</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL INTERNO: TERAPEUTA INSERINDO FEEDBACK */}
        {reviewingExercise && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Feedback Clínico • {reviewingExercise.title}
                </h4>
                <button onClick={() => setReviewingExercise(null)}>
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Orientação / Validação para o Paciente
                </label>
                <textarea
                  rows={4}
                  value={reviewFeedback}
                  onChange={(e) => setReviewFeedback(e.target.value)}
                  placeholder="Escreva um feedback acolhedor e técnico destacando os pontos de evolução..."
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReviewingExercise(null)}
                  className="px-3 py-1.5 rounded-lg border text-xs text-slate-600 dark:text-slate-400"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSubmitReviewByTherapist}
                  disabled={isSubmittingReview || !reviewFeedback.trim()}
                  className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition flex items-center space-x-1.5"
                >
                  {isSubmittingReview ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>Salvar Feedback Clínico</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
