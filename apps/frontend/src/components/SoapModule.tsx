import { useState, useEffect } from 'react';
import { 
  Sparkles, 
  FileSignature, 
  Lock, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  Headphones, 
  Clock, 
  ChevronDown, 
  ChevronUp, 
  Loader2,
  Scale,
  BookmarkPlus,
  Tag,
  Trash2,
  ArrowRightCircle
} from 'lucide-react';

import type { 
  SoapNote, 
  ClinicalRecordRectification,
  RectifiedQuadrant,
  ClinicalSessionMarker
} from '@terapiainfoco/shared';
import { AppointmentStatus, AuditResourceType, ClinicalMarkerCategory, ClinicalMarkerRelevance, TranscriptionSpeaker } from '@terapiainfoco/shared';
import type { DecryptedAppointment, LiveTranscriptUtterance } from '@terapiainfoco/shared';
import { usePrivacy } from '../contexts/PrivacyContext';
import { api } from '../services/api';
import { AiTranscriptionSoapModal } from './AiTranscriptionSoapModal';

const EMPTY_SOAP: SoapNote = { subjective: '', objective: '', assessment: '', plan: '' };

/** Consultas em que a evolução pode ser registrada: confirmadas, em andamento ou concluídas */
export const RECORDABLE_STATUSES: readonly AppointmentStatus[] = [
  AppointmentStatus.CONFIRMADA,
  AppointmentStatus.EM_ANDAMENTO,
  AppointmentStatus.CONCLUIDA
];

function formatSessionDate(iso: string | Date): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatTranscriptTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

interface SoapModuleProps {
  /** Consulta aberta a partir da Agenda; sem ela, o psicólogo escolhe na lista */
  appointmentId?: string | null;
  onAppointmentChange?: (appointmentId: string | null) => void;
}

export function SoapModule({ appointmentId: initialAppointmentId = null, onAppointmentChange }: SoapModuleProps) {
  const [recordId, setRecordId] = useState<string | null>(null);

  // Consulta da evolução: o prontuário é sempre de uma consulta do consultório
  const [appointments, setAppointments] = useState<DecryptedAppointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(true);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(initialAppointmentId);
  const [recordLoading, setRecordLoading] = useState(false);
  const [sessionNumber, setSessionNumber] = useState<number | null>(null);

  // Transcrição feita durante a teleconsulta (sem gravação) e minuta pelo pipeline de IA
  const [liveTranscript, setLiveTranscript] = useState<LiveTranscriptUtterance[]>([]);
  const [isTranscriptExpanded, setIsTranscriptExpanded] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);

  // Eixos SOAP
  const [soap, setSoap] = useState<SoapNote>(EMPTY_SOAP);
  const [privateNotes, setPrivateNotes] = useState('');
  const [showPrivateNotes, setShowPrivateNotes] = useState(false);

  // Human-in-the-Loop & Assinatura
  const [confirmedReview, setConfirmedReview] = useState(false);
  const [isSigned, setIsSigned] = useState(false);
  const [signatureHash, setSignatureHash] = useState<string | null>(null);
  const [signedAt, setSignedAt] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Termo de Retificação Formal (CFP nº 001/2009 & RFC §3.4)
  const [showRectifyModal, setShowRectifyModal] = useState(false);
  const [rectifications, setRectifications] = useState<ClinicalRecordRectification[]>([]);
  const [rectifyQuadrant, setRectifyQuadrant] = useState<RectifiedQuadrant>('SUBJECTIVE');
  const [rectifyReason, setRectifyReason] = useState('');
  const [rectifyContent, setRectifyContent] = useState('');
  const [rectifyConfirmedEthics, setRectifyConfirmedEthics] = useState(false);
  const [rectifyLoading, setRectifyLoading] = useState(false);
  const [rectifyError, setRectifyError] = useState<string | null>(null);
  const [isRectificationsExpanded, setIsRectificationsExpanded] = useState(true);

  const selectedAppointment = appointments.find((a) => a.id === selectedAppointmentId) ?? null;
  const appointmentId = selectedAppointment?.id ?? '';
  const patientName = selectedAppointment?.patientName ?? 'Paciente';

  // Marcadores Clínicos em Tempo Real (RFC-001 §3.3)
  const [markers, setMarkers] = useState<ClinicalSessionMarker[]>([]);
  const [markerCategory, setMarkerCategory] = useState<ClinicalMarkerCategory>(ClinicalMarkerCategory.INSIGHT);
  const [markerRelevance, setMarkerRelevance] = useState<ClinicalMarkerRelevance>(ClinicalMarkerRelevance.HIGH);
  const [markerNote, setMarkerNote] = useState('');
  const [markerTime, setMarkerTime] = useState('01:45');
  const [markerLoading, setMarkerLoading] = useState(false);
  const [exportSoapLoading, setExportSoapLoading] = useState(false);
  const [isMarkersExpanded, setIsMarkersExpanded] = useState(true);

  // Carrega marcadores ao montar
  useEffect(() => {
    setMarkers([]);
    if (!appointmentId) return;
    api.getAppointmentMarkers(appointmentId)
      .then((list) => setMarkers(list ?? []))
      .catch(() => setMarkers([]));
  }, [appointmentId]);

  // Consultas do consultório, mais recentes primeiro
  useEffect(() => {
    api.getAppointments()
      .then((list) => setAppointments(
        list
          .filter((a) => RECORDABLE_STATUSES.includes(a.status))
          .sort((a, b) => new Date(b.scheduledStart).getTime() - new Date(a.scheduledStart).getTime())
      ))
      .catch((err: any) => setError(err.message || 'Falha ao carregar as consultas do consultório.'))
      .finally(() => setAppointmentsLoading(false));
  }, []);

  // Consulta aberta pela Agenda
  useEffect(() => {
    if (initialAppointmentId) setSelectedAppointmentId(initialAppointmentId);
  }, [initialAppointmentId]);

  // Prontuário e transcrição da consulta escolhida
  useEffect(() => {
    if (!selectedAppointmentId) return;
    loadRecord(selectedAppointmentId);
    setLiveTranscript([]);
    api.getLiveTranscript(selectedAppointmentId)
      .then(setLiveTranscript)
      .catch(() => setLiveTranscript([]));
  }, [selectedAppointmentId]);

  const loadRecord = async (id: string) => {
    setRecordLoading(true);
    setError(null);
    setConfirmedReview(false);
    setRectifications([]);
    try {
      const record = await api.getClinicalRecordByAppointment(id);
      setRecordId(record?.id ?? null);
      setSessionNumber(record?.sessionNumber ?? null);
      setSoap(record?.soap ?? EMPTY_SOAP);
      setPrivateNotes(record?.privateNotes ?? '');
      setIsSigned(!!record?.isSigned);
      setSignatureHash(record?.signatureHash ?? null);
      setSignedAt(record?.signedAt ? new Date(record.signedAt).toLocaleString('pt-BR') : null);
      if (record?.isSigned) loadRectifications(record.id);
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar o prontuário da consulta.');
    } finally {
      setRecordLoading(false);
    }
  };

  const handleSelectAppointment = (id: string | null) => {
    setSelectedAppointmentId(id);
    onAppointmentChange?.(id);
  };

  const handleAddMarker = async () => {
    if (!markerNote.trim()) return;
    try {
      setMarkerLoading(true);
      setError(null);
      const [minStr, secStr] = markerTime.split(':');
      const min = parseInt(minStr || '0', 10);
      const sec = parseInt(secStr || '0', 10);
      const timestampMs = (min * 60 + sec) * 1000;

      const created = await api.createClinicalMarker({
        appointmentId,
        timestampMs,
        timeFormatted: markerTime,
        category: markerCategory,
        relevance: markerRelevance,
        note: markerNote.trim()
      });
      setMarkers(prev => [...prev, created]);
      setMarkerNote('');
      setSuccessMsg('Marcador clínico registrado com criptografia ponta a ponta (FLE AES-256-GCM)!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Falha ao registrar marcador clínico.');
    } finally {
      setMarkerLoading(false);
    }
  };

  const handleDeleteMarker = async (id: string) => {
    try {
      await api.deleteClinicalMarker(id);
      setMarkers(prev => prev.filter(m => m.id !== id));
      setSuccessMsg('Marcador clínico removido.');
      setTimeout(() => setSuccessMsg(null), 2500);
    } catch (err: any) {
      setError(err.message || 'Falha ao remover marcador');
    }
  };

  const handleIntegrateMarkersIntoSoap = async () => {
    try {
      setExportSoapLoading(true);
      setError(null);
      const res = await api.exportMarkersToSoapProposal(appointmentId);
      if (res && res.suggestedSoap) {
        setSoap(prev => ({
          subjective: res.suggestedSoap.subjective.length > 0 
            ? `${prev.subjective}\n\n[MARCADORES CLÍNICOS DA SESSÃO]:\n• ${res.suggestedSoap.subjective.join('\n• ')}`
            : prev.subjective,
          objective: res.suggestedSoap.objective.length > 0 
            ? `${prev.objective}\n\n[MARCADORES CLÍNICOS DA SESSÃO]:\n• ${res.suggestedSoap.objective.join('\n• ')}`
            : prev.objective,
          assessment: res.suggestedSoap.assessment.length > 0 
            ? `${prev.assessment}\n\n[MARCADORES CLÍNICOS DA SESSÃO]:\n• ${res.suggestedSoap.assessment.join('\n• ')}`
            : prev.assessment,
          plan: res.suggestedSoap.plan.length > 0 
            ? `${prev.plan}\n\n[MARCADORES CLÍNICOS DA SESSÃO]:\n• ${res.suggestedSoap.plan.join('\n• ')}`
            : prev.plan,
        }));
        setSuccessMsg(`Estrutura SOAP integrada com sucesso a partir de ${res.totalMarkersCount} marcadores da sessão!`);
        setTimeout(() => setSuccessMsg(null), 4000);
      }
    } catch (err: any) {
      setError(err.message || 'Falha ao consolidar marcadores no prontuário SOAP');
    } finally {
      setExportSoapLoading(false);
    }
  };


  // Modo Anti-Shoulder Surfing e DDM Clínico
  const {
    isPrivacyMode,
    unmaskField,
    hideField,
    isFieldRevealed,
    getRemainingSeconds
  } = usePrivacy();
  const [unmaskLoadingField, setUnmaskLoadingField] = useState<string | null>(null);

  const handleToggleSoapReveal = async (fieldName: string) => {
    const effectiveId = recordId || appointmentId;
    if (isFieldRevealed(effectiveId, fieldName)) {
      hideField(effectiveId, fieldName);
      return;
    }
    try {
      setUnmaskLoadingField(fieldName);
      await unmaskField(AuditResourceType.CLINICAL_RECORD, effectiveId, fieldName, 'Visualização clínica do quadrante SOAP');
    } finally {
      setUnmaskLoadingField(null);
    }
  };

  const handleSaveDraft = async () => {
    try {
      setLoading(true);
      setError(null);
      const record = await api.saveSoapDraft({
        appointmentId,
        soap,
        privateNotes
      });
      setRecordId(record.id);
      setSessionNumber(record.sessionNumber);
      setSuccessMsg('Rascunho de nota SOAP salvo com sucesso na base encriptada.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignRecord = async () => {
    if (!recordId) {
      setError('Salve o rascunho antes de assinar o prontuário.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const signedRecord = await api.signClinicalRecord(recordId, confirmedReview);
      setIsSigned(true);
      setSignatureHash(signedRecord.signatureHash || 'sha256-hash-selado');
      setSignedAt(new Date().toLocaleString('pt-BR'));
      setSuccessMsg('Prontuário assinado e selado com sucesso! Registro agora é imutável (CFP nº 001/2009).');
      loadRectifications(recordId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadRectifications = async (recId: string) => {
    try {
      const list = await api.getRecordRectifications(recId);
      setRectifications(list);
    } catch {
      setRectifications([]);
    }
  };

  const handleOpenRectify = () => {
    setRectifyQuadrant('SUBJECTIVE');
    setRectifyReason('');
    setRectifyContent('');
    setRectifyConfirmedEthics(false);
    setRectifyError(null);
    setShowRectifyModal(true);
  };

  const handleAverbarRectification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recordId) {
      setRectifyError('Prontuário precisa estar salvo e assinado antes de averbar retificações.');
      return;
    }
    try {
      setRectifyLoading(true);
      setRectifyError(null);
      const newRect = await api.rectifyClinicalRecord(recordId, {
        rectifiedQuadrant: rectifyQuadrant,
        reason: rectifyReason,
        rectifiedContent: rectifyContent,
        confirmedEthicsReview: rectifyConfirmedEthics
      });
      setRectifications((prev) => [newRect, ...prev]);
      setShowRectifyModal(false);
      setSuccessMsg('Termo de retificação formal averbado com sucesso! Hash SHA-256 canônico gerado e gravado na trilha WORM.');
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setRectifyError(err.message || 'Falha ao averbar termo de retificação');
    } finally {
      setRectifyLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            Evolução SOAP da Sessão
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Registro clínico vinculado à consulta, com minuta opcional por IA a partir da transcrição e revisão humana obrigatória
          </p>
        </div>

        <div className="flex items-center gap-2">
          {selectedAppointment && (
            <div className="px-3 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-800 dark:text-purple-300 text-xs font-medium flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-500" />
              {sessionNumber ? `Sessão ${String(sessionNumber).padStart(2, '0')}` : 'Nova evolução'} • {patientName}
            </div>
          )}

          {isSigned && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
              <Lock className="w-4 h-4" />
              Prontuário Imutável
            </div>
          )}
        </div>
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

      {/* Consulta da evolução */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3">
        <label htmlFor="soap-appointment" className="text-xs font-semibold text-slate-700 dark:text-slate-300 shrink-0">
          Consulta
        </label>
        <select
          id="soap-appointment"
          value={selectedAppointmentId ?? ''}
          onChange={(e) => handleSelectAppointment(e.target.value || null)}
          disabled={appointmentsLoading}
          className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40"
        >
          <option value="">{appointmentsLoading ? 'Carregando consultas...' : 'Selecione a consulta'}</option>
          {appointments.map((a) => (
            <option key={a.id} value={a.id}>
              {formatSessionDate(a.scheduledStart)} • {a.patientName ?? 'Paciente'}
            </option>
          ))}
        </select>
      </div>

      {!selectedAppointment ? (
        <div className="p-10 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-2">
          <FileSignature className="w-8 h-8 mx-auto text-slate-400" />
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {!appointmentsLoading && appointments.length === 0 ? 'Nenhuma consulta para registrar' : 'Escolha a consulta da evolução'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            {!appointmentsLoading && appointments.length === 0
              ? 'A evolução é registrada em consultas confirmadas, em andamento ou concluídas.'
              : 'Selecione acima ou use "Registrar evolução" na Agenda. Cada consulta tem um único prontuário.'}
          </p>
        </div>
      ) : recordLoading ? (
        <div className="p-10 text-center text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Carregando prontuário da consulta...
        </div>
      ) : (
      <>
      {/* Selo Imutável se assinado & Averbação de Termos de Retificação (CFP 001/2009) */}
      {isSigned && signatureHash && (
        <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-50 to-slate-50 dark:from-emerald-950/40 dark:to-slate-900 border border-emerald-500/30 shadow-sm dark:shadow-none space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-sm font-semibold">
                <ShieldCheck className="w-5 h-5 shrink-0" />
                Certificado de Imutabilidade Documental (Resolução CFP nº 001/2009)
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300">
                Assinado digitalmente pelo(a) psicólogo(a) responsável em {signedAt}.
              </p>
            </div>

            <button
              type="button"
              onClick={handleOpenRectify}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer self-start sm:self-auto shrink-0"
            >
              <Scale className="w-4 h-4" />
              Averbar Termo de Retificação (CFP 001/2009)
            </button>
          </div>

          <div className="font-mono text-[11px] text-emerald-800 dark:text-emerald-300/80 bg-emerald-100/60 dark:bg-slate-950 p-2.5 rounded-xl border border-emerald-500/20 break-all">
            SHA-256 Hash do Prontuário Selado: {signatureHash}
          </div>

          {/* Lista de Termos de Retificação Averbados */}
          {rectifications.length > 0 && (
            <div className="pt-2 border-t border-emerald-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider">
                  <Scale className="w-4 h-4 text-amber-600" />
                  Termos de Retificação Averbados ({rectifications.length})
                </div>
                <button
                  type="button"
                  onClick={() => setIsRectificationsExpanded(!isRectificationsExpanded)}
                  className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 cursor-pointer"
                >
                  {isRectificationsExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  {isRectificationsExpanded ? 'Recolher' : 'Exibir'}
                </button>
              </div>

              {isRectificationsExpanded && (
                <div className="space-y-3">
                  {rectifications.map((rect, idx) => {
                    const quadrantLabels: Record<RectifiedQuadrant, string> = {
                      SUBJECTIVE: 'S • Subjetivo',
                      OBJECTIVE: 'O • Objetivo',
                      ASSESSMENT: 'A • Avaliação',
                      PLAN: 'P • Plano',
                      GENERAL: 'Geral • Integral'
                    };
                    return (
                      <div
                        key={rect.id || idx}
                        className="p-3.5 rounded-xl bg-white dark:bg-slate-950/70 border border-amber-300/60 dark:border-amber-800/60 space-y-2 text-xs"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px]">
                          <span className="font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-900 dark:text-amber-200 border border-amber-500/30 inline-block w-fit">
                            Quadrante: {quadrantLabels[rect.rectifiedQuadrant] || rect.rectifiedQuadrant}
                          </span>
                          <span className="text-slate-500 dark:text-slate-400">
                            Averbado em {new Date(rect.signedAt).toLocaleString('pt-BR')}
                          </span>
                        </div>

                        <div>
                          <span className="font-semibold text-slate-700 dark:text-slate-300 block text-[11px]">
                            Justificativa Ética Formal:
                          </span>
                          <p className="text-slate-600 dark:text-slate-400 italic mt-0.5">
                            "{rect.reason}"
                          </p>
                        </div>

                        <div>
                          <span className="font-semibold text-slate-700 dark:text-slate-300 block text-[11px]">
                            Conteúdo Aditivo Retificado:
                          </span>
                          <p className="text-slate-800 dark:text-slate-200 mt-0.5 whitespace-pre-wrap leading-relaxed">
                            {rect.rectifiedContent}
                          </p>
                        </div>

                        <div className="pt-1 border-t border-slate-100 dark:border-slate-900 font-mono text-[10px] text-slate-500 dark:text-slate-400 break-all">
                          Canonical SHA-256 Digest: {rect.signatureHash}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Transcrição da teleconsulta (sem gravação) e minuta SOAP por IA (RFC §3.3) */}
      <div className="rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 shrink-0">
              <Headphones className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Transcrição da Teleconsulta
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {liveTranscript.length > 0
                  ? `${liveTranscript.length} falas transcritas durante a sessão, com consentimento do paciente.`
                  : 'Sem transcrição para esta consulta. Ela é feita durante a teleconsulta, quando o paciente consente.'}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
            <button
              onClick={() => setShowAiModal(true)}
              disabled={isSigned}
              className="w-full sm:w-auto px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
              title={isSigned ? 'Prontuário já assinado' : 'Gerar e revisar a minuta SOAP a partir da transcrição'}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Minuta SOAP com IA
            </button>

            {liveTranscript.length > 0 && (
              <button
                onClick={() => setIsTranscriptExpanded(!isTranscriptExpanded)}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer self-center"
                title={isTranscriptExpanded ? 'Recolher transcrição' : 'Expandir transcrição'}
              >
                {isTranscriptExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>

        {isTranscriptExpanded && liveTranscript.length > 0 && (
          <div className="px-5 pb-5 space-y-3 max-h-80 overflow-y-auto">
            {liveTranscript.map((u) => {
              const isTherapist = u.speaker === TranscriptionSpeaker.THERAPIST;
              return (
                <div
                  key={u.id}
                  className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
                    isTherapist
                      ? 'bg-purple-50/60 dark:bg-purple-950/20 border-purple-200/70 dark:border-purple-800/40 ml-0 sm:ml-4'
                      : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/60 mr-0 sm:mr-4'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className={`font-semibold ${isTherapist ? 'text-purple-900 dark:text-purple-300' : 'text-slate-900 dark:text-white'}`}>
                      {isTherapist ? 'Terapeuta' : patientName}
                    </span>
                    <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatTranscriptTime(u.startTimeMs)}
                    </span>
                  </div>
                  <div className="text-slate-700 dark:text-slate-300">{u.text}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Marcadores Clínicos em Tempo Real (RFC-001 §3.3) */}
      <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <BookmarkPlus className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Marcadores Clínicos em Tempo Real
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  {markers.length} {markers.length === 1 ? 'marcador' : 'marcadores'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sinalização de momentos-chave na teleconsulta com criptografia FLE AES-256-GCM e mapeamento SOAP
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {markers.length > 0 && (
              <button
                type="button"
                onClick={handleIntegrateMarkersIntoSoap}
                disabled={exportSoapLoading}
                className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer disabled:opacity-50"
              >
                {exportSoapLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ArrowRightCircle className="w-3.5 h-3.5" />
                )}
                Integrar ao SOAP ({markers.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsMarkersExpanded(!isMarkersExpanded)}
              className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
            >
              {isMarkersExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {isMarkersExpanded && (
          <div className="space-y-4 pt-1">
            {/* Form de Inserção Rápida de Marcador */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 space-y-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mr-1">
                  Categoria Clínica:
                </span>
                {[
                  { cat: ClinicalMarkerCategory.INSIGHT, label: '💡 Insight', quad: 'A' },
                  { cat: ClinicalMarkerCategory.CRISIS_ALERT, label: '⚠️ Alerta de Crise', quad: 'A' },
                  { cat: ClinicalMarkerCategory.AFFECT_SHIFT, label: '🌊 Mudança de Afeto', quad: 'O' },
                  { cat: ClinicalMarkerCategory.SOMATIC_COMPLAINT, label: '🫀 Queixa Somática', quad: 'S' },
                  { cat: ClinicalMarkerCategory.CORE_BELIEF, label: '🎯 Crença Nuclear', quad: 'A' },
                  { cat: ClinicalMarkerCategory.RESISTANCE, label: '🛑 Resistência', quad: 'A' },
                  { cat: ClinicalMarkerCategory.THERAPEUTIC_CONTRACT, label: '🤝 Contrato', quad: 'P' }
                ].map(({ cat, label, quad }) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setMarkerCategory(cat)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                      markerCategory === cat
                        ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    {label} <span className="opacity-70 text-[10px]">[{quad}]</span>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                    Tempo (mm:ss)
                  </label>
                  <input
                    type="text"
                    value={markerTime}
                    onChange={(e) => setMarkerTime(e.target.value)}
                    placeholder="00:00"
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-mono focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                    Relevância
                  </label>
                  <select
                    value={markerRelevance}
                    onChange={(e) => setMarkerRelevance(e.target.value as ClinicalMarkerRelevance)}
                    className="w-full px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  >
                    <option value={ClinicalMarkerRelevance.LOW}>Baixa</option>
                    <option value={ClinicalMarkerRelevance.MEDIUM}>Média</option>
                    <option value={ClinicalMarkerRelevance.HIGH}>Alta</option>
                    <option value={ClinicalMarkerRelevance.CRITICAL}>Crítica</option>
                  </select>
                </div>

                <div className="sm:col-span-6">
                  <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                    Nota Clínica (Criptografada FLE AES-256-GCM)
                  </label>
                  <input
                    type="text"
                    value={markerNote}
                    onChange={(e) => setMarkerNote(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddMarker()}
                    placeholder="Ex: Identificação espontânea de pensamento automático..."
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2 flex items-end">
                  <button
                    type="button"
                    onClick={handleAddMarker}
                    disabled={markerLoading || !markerNote.trim()}
                    className="w-full px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center justify-center gap-1 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
                  >
                    {markerLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Tag className="w-3.5 h-3.5" />
                    )}
                    Marcar
                  </button>
                </div>
              </div>
            </div>

            {/* Lista de Marcadores Inseridos na Sessão */}
            {markers.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                Nenhum marcador registrado nesta teleconsulta ainda. Use os botões acima para sinalizar momentos-chave.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-64 overflow-y-auto pr-1">
                {markers.map((m) => {
                  const quadColors: Record<string, string> = {
                    SUBJECTIVE: 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border-teal-200 dark:border-teal-800/40',
                    OBJECTIVE: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200 dark:border-sky-800/40',
                    ASSESSMENT: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800/40',
                    PLAN: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40'
                  };
                  const quad = m.suggestedSoapQuadrant || 'ASSESSMENT';

                  return (
                    <div
                      key={m.id}
                      className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs flex items-start justify-between gap-2.5 transition-all hover:border-purple-400 dark:hover:border-purple-600"
                    >
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-[10px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-0.5">
                            <Clock className="w-3 h-3" />
                            {m.timeFormatted}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                            {m.category}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${quadColors[quad] || ''}`}>
                            SOAP: {quad[0]}
                          </span>
                        </div>
                        <p className="text-slate-800 dark:text-slate-200 leading-snug break-words">
                          {m.note}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteMarker(m.id)}
                        className="text-slate-400 hover:text-rose-500 transition-colors p-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 shrink-0 cursor-pointer"
                        title="Remover marcador"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Campos SOAP */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* S - Subjetivo */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none space-y-2 relative">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
              S • Subjetivo
            </span>
            <div className="flex items-center gap-2">
              {isPrivacyMode && (
                <button
                  type="button"
                  onClick={() => handleToggleSoapReveal('soap_subjective')}
                  disabled={unmaskLoadingField === 'soap_subjective'}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 border transition-all ${
                    isFieldRevealed(recordId || appointmentId, 'soap_subjective')
                      ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300'
                      : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                  title="Revelar quadrante subjetivo sob demanda (Auditado na trilha WORM)"
                >
                  {unmaskLoadingField === 'soap_subjective' ? (
                    <Loader2 className="w-3 h-3 animate-spin text-teal-600" />
                  ) : isFieldRevealed(recordId || appointmentId, 'soap_subjective') ? (
                    <>
                      <EyeOff className="w-3 h-3 text-amber-600" />
                      <span>Ocultar ({getRemainingSeconds(recordId || appointmentId, 'soap_subjective')}s)</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3 h-3 text-slate-500" />
                      <span>Revelar (WORM)</span>
                    </>
                  )}
                </button>
              )}
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Relato do Paciente & Sintomas</span>
            </div>
          </div>
          <div className="relative">
            <textarea
              rows={5}
              disabled={isSigned}
              value={soap.subjective}
              onChange={(e) => setSoap({ ...soap, subjective: e.target.value })}
              className={`w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl p-3 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-teal-500 disabled:opacity-75 resize-none leading-relaxed transition-all ${
                isPrivacyMode && !isFieldRevealed(recordId || appointmentId, 'soap_subjective')
                  ? 'blur-[4px] select-none pointer-events-none'
                  : ''
              }`}
            />
            {isPrivacyMode && !isFieldRevealed(recordId || appointmentId, 'soap_subjective') && (
              <div 
                onClick={() => handleToggleSoapReveal('soap_subjective')}
                className="absolute inset-0 bg-slate-100/40 dark:bg-slate-900/40 backdrop-blur-[2px] rounded-xl flex items-center justify-center cursor-pointer transition-opacity hover:bg-slate-100/60"
              >
                <span className="bg-white/90 dark:bg-slate-900/90 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-sm px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-teal-600" />
                  Clique para Revelar (Auditado WORM)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* O - Objetivo */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none space-y-2 relative">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400">
              O • Objetivo
            </span>
            <div className="flex items-center gap-2">
              {isPrivacyMode && (
                <button
                  type="button"
                  onClick={() => handleToggleSoapReveal('soap_objective')}
                  disabled={unmaskLoadingField === 'soap_objective'}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 border transition-all ${
                    isFieldRevealed(recordId || appointmentId, 'soap_objective')
                      ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300'
                      : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                  title="Revelar quadrante objetivo sob demanda (Auditado na trilha WORM)"
                >
                  {unmaskLoadingField === 'soap_objective' ? (
                    <Loader2 className="w-3 h-3 animate-spin text-teal-600" />
                  ) : isFieldRevealed(recordId || appointmentId, 'soap_objective') ? (
                    <>
                      <EyeOff className="w-3 h-3 text-amber-600" />
                      <span>Ocultar ({getRemainingSeconds(recordId || appointmentId, 'soap_objective')}s)</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3 h-3 text-slate-500" />
                      <span>Revelar (WORM)</span>
                    </>
                  )}
                </button>
              )}
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Observações Clínicas & Afeto</span>
            </div>
          </div>
          <div className="relative">
            <textarea
              rows={5}
              disabled={isSigned}
              value={soap.objective}
              onChange={(e) => setSoap({ ...soap, objective: e.target.value })}
              className={`w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl p-3 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-teal-500 disabled:opacity-75 resize-none leading-relaxed transition-all ${
                isPrivacyMode && !isFieldRevealed(recordId || appointmentId, 'soap_objective')
                  ? 'blur-[4px] select-none pointer-events-none'
                  : ''
              }`}
            />
            {isPrivacyMode && !isFieldRevealed(recordId || appointmentId, 'soap_objective') && (
              <div 
                onClick={() => handleToggleSoapReveal('soap_objective')}
                className="absolute inset-0 bg-slate-100/40 dark:bg-slate-900/40 backdrop-blur-[2px] rounded-xl flex items-center justify-center cursor-pointer transition-opacity hover:bg-slate-100/60"
              >
                <span className="bg-white/90 dark:bg-slate-900/90 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-sm px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-teal-600" />
                  Clique para Revelar (Auditado WORM)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* A - Avaliação */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none space-y-2 relative">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400">
              A • Avaliação
            </span>
            <div className="flex items-center gap-2">
              {isPrivacyMode && (
                <button
                  type="button"
                  onClick={() => handleToggleSoapReveal('soap_assessment')}
                  disabled={unmaskLoadingField === 'soap_assessment'}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 border transition-all ${
                    isFieldRevealed(recordId || appointmentId, 'soap_assessment')
                      ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300'
                      : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                  title="Revelar quadrante de avaliação sob demanda (Auditado na trilha WORM)"
                >
                  {unmaskLoadingField === 'soap_assessment' ? (
                    <Loader2 className="w-3 h-3 animate-spin text-teal-600" />
                  ) : isFieldRevealed(recordId || appointmentId, 'soap_assessment') ? (
                    <>
                      <EyeOff className="w-3 h-3 text-amber-600" />
                      <span>Ocultar ({getRemainingSeconds(recordId || appointmentId, 'soap_assessment')}s)</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3 h-3 text-slate-500" />
                      <span>Revelar (WORM)</span>
                    </>
                  )}
                </button>
              )}
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Hipótese Clínica (TCC) & Evolução</span>
            </div>
          </div>
          <div className="relative">
            <textarea
              rows={5}
              disabled={isSigned}
              value={soap.assessment}
              onChange={(e) => setSoap({ ...soap, assessment: e.target.value })}
              className={`w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl p-3 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-teal-500 disabled:opacity-75 resize-none leading-relaxed transition-all ${
                isPrivacyMode && !isFieldRevealed(recordId || appointmentId, 'soap_assessment')
                  ? 'blur-[4px] select-none pointer-events-none'
                  : ''
              }`}
            />
            {isPrivacyMode && !isFieldRevealed(recordId || appointmentId, 'soap_assessment') && (
              <div 
                onClick={() => handleToggleSoapReveal('soap_assessment')}
                className="absolute inset-0 bg-slate-100/40 dark:bg-slate-900/40 backdrop-blur-[2px] rounded-xl flex items-center justify-center cursor-pointer transition-opacity hover:bg-slate-100/60"
              >
                <span className="bg-white/90 dark:bg-slate-900/90 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-sm px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-teal-600" />
                  Clique para Revelar (Auditado WORM)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* P - Plano */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none space-y-2 relative">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              P • Plano
            </span>
            <div className="flex items-center gap-2">
              {isPrivacyMode && (
                <button
                  type="button"
                  onClick={() => handleToggleSoapReveal('soap_plan')}
                  disabled={unmaskLoadingField === 'soap_plan'}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 border transition-all ${
                    isFieldRevealed(recordId || appointmentId, 'soap_plan')
                      ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300'
                      : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                  title="Revelar quadrante de plano sob demanda (Auditado na trilha WORM)"
                >
                  {unmaskLoadingField === 'soap_plan' ? (
                    <Loader2 className="w-3 h-3 animate-spin text-teal-600" />
                  ) : isFieldRevealed(recordId || appointmentId, 'soap_plan') ? (
                    <>
                      <EyeOff className="w-3 h-3 text-amber-600" />
                      <span>Ocultar ({getRemainingSeconds(recordId || appointmentId, 'soap_plan')}s)</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3 h-3 text-slate-500" />
                      <span>Revelar (WORM)</span>
                    </>
                  )}
                </button>
              )}
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Intervenções & Tarefas Entre Sessões</span>
            </div>
          </div>
          <div className="relative">
            <textarea
              rows={5}
              disabled={isSigned}
              value={soap.plan}
              onChange={(e) => setSoap({ ...soap, plan: e.target.value })}
              className={`w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl p-3 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-teal-500 disabled:opacity-75 resize-none leading-relaxed transition-all ${
                isPrivacyMode && !isFieldRevealed(recordId || appointmentId, 'soap_plan')
                  ? 'blur-[4px] select-none pointer-events-none'
                  : ''
              }`}
            />
            {isPrivacyMode && !isFieldRevealed(recordId || appointmentId, 'soap_plan') && (
              <div 
                onClick={() => handleToggleSoapReveal('soap_plan')}
                className="absolute inset-0 bg-slate-100/40 dark:bg-slate-900/40 backdrop-blur-[2px] rounded-xl flex items-center justify-center cursor-pointer transition-opacity hover:bg-slate-100/60"
              >
                <span className="bg-white/90 dark:bg-slate-900/90 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-sm px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-teal-600" />
                  Clique para Revelar (Auditado WORM)
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Notas Reflexivas Privadas Segregadas (§3.4) */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
              Anotações Confidenciais do Terapeuta (§3.4)
            </span>
            <span className="text-[10px] bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20 px-2 py-0.5 rounded-full">
              Segregação Legal • Não integra prontuário do paciente
            </span>
          </div>

          <button
            onClick={() => setShowPrivateNotes(!showPrivateNotes)}
            className="text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white flex items-center gap-1.5 cursor-pointer"
          >
            {showPrivateNotes ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {showPrivateNotes ? 'Ocultar' : 'Exibir'}
          </button>
        </div>

        {showPrivateNotes && (
          <textarea
            rows={3}
            disabled={isSigned}
            value={privateNotes}
            onChange={(e) => setPrivateNotes(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-slate-300 focus:outline-none focus:border-amber-400 resize-none font-mono leading-relaxed"
            placeholder="Anotações reflexivas íntimas do psicólogo..."
          />
        )}
      </div>

      {/* Human-in-the-Loop & Ações de Assinatura */}
      {!isSigned && (
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none space-y-4">
          <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-start gap-3">
            <input
              type="checkbox"
              id="humanLoopCheck"
              checked={confirmedReview}
              onChange={(e) => setConfirmedReview(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 dark:border-slate-700 text-purple-600 focus:ring-purple-500 cursor-pointer"
            />
            <label htmlFor="humanLoopCheck" className="text-xs text-purple-900 dark:text-purple-200 leading-relaxed cursor-pointer font-medium">
              <strong>Human-in-the-Loop Obrigatório (CFP nº 001/2009):</strong> Eu, psicólogo(a) responsável, atesto que revisei integralmente a minuta SOAP acima, confirmo a correspondência dos fatos clínicos com o atendimento realizado e assumo a responsabilidade técnica perante o Conselho Federal de Psicologia.
            </label>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
            <button
              onClick={handleSaveDraft}
              disabled={loading}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer text-center"
            >
              {loading ? 'Salvando...' : 'Salvar Rascunho SOAP'}
            </button>

            <button
              onClick={handleSignRecord}
              disabled={loading || !confirmedReview}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <FileSignature className="w-4 h-4" />
              Assinar & Selar Prontuário Imutável (SHA-256)
            </button>
          </div>
        </div>
      )}

      </>
      )}

      {/* Minuta SOAP pelo pipeline de IA: o prontuário salvo lá é recarregado aqui */}
      {showAiModal && selectedAppointment && (
        <AiTranscriptionSoapModal
          isOpen={showAiModal}
          appointmentId={selectedAppointment.id}
          patientId={selectedAppointment.patientId}
          patientName={patientName}
          onClose={() => setShowAiModal(false)}
          onEhrRecordSaved={() => {
            setShowAiModal(false);
            loadRecord(selectedAppointment.id);
            setSuccessMsg('Evolução revisada a partir da minuta de IA e assinada no prontuário.');
            setTimeout(() => setSuccessMsg(null), 5000);
          }}
        />
      )}

      {/* Modal de Averbação de Termo de Retificação (CFP nº 001/2009 & RFC §3.4) */}
      {showRectifyModal && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100 dark:border-slate-800 gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Scale className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                    Averbar Termo de Retificação Formal
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Resolução CFP nº 001/2009 Art. 4º • Aditamento Imutável com Hash SHA-256
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRectifyModal(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            {/* Aviso Regulatório CFP */}
            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2.5 leading-relaxed">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <strong>Imutabilidade Legal do Prontuário:</strong> O prontuário original selado não pode ser editado nem excluído. Esta operação criará um <em>termo aditivo de retificação averbado</em>, com hash canônico e registro imutável na trilha de auditoria WORM.
              </div>
            </div>

            {rectifyError && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{rectifyError}</span>
              </div>
            )}

            <form onSubmit={handleAverbarRectification} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                  Quadrante Afetado pela Retificação *
                </label>
                <select
                  value={rectifyQuadrant}
                  onChange={(e) => setRectifyQuadrant(e.target.value as RectifiedQuadrant)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                >
                  <option value="SUBJECTIVE">S • Subjetivo (Relato do Paciente)</option>
                  <option value="OBJECTIVE">O • Objetivo (Observação Clínica e Afeto)</option>
                  <option value="ASSESSMENT">A • Avaliação (Hipóteses Diagnósticas e Evolução)</option>
                  <option value="PLAN">P • Plano (Intervenções e Prescrições Terapêuticas)</option>
                  <option value="GENERAL">Geral • Retificação Abrangente do Atendimento</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                  Justificativa Ética e Técnica da Retificação *
                </label>
                <textarea
                  rows={2}
                  required
                  value={rectifyReason}
                  onChange={(e) => setRectifyReason(e.target.value)}
                  placeholder="Explique tecnicamente o motivo do aditamento ou retificação..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                  Conteúdo Retificado / Termo Aditivo *
                </label>
                <textarea
                  rows={4}
                  required
                  value={rectifyContent}
                  onChange={(e) => setRectifyContent(e.target.value)}
                  placeholder="Redija o texto aditivo ou retificado que integrará os autos do prontuário..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-start gap-3">
                <input
                  type="checkbox"
                  id="rectifyEthicsCheck"
                  checked={rectifyConfirmedEthics}
                  onChange={(e) => setRectifyConfirmedEthics(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 dark:border-slate-700 text-amber-600 focus:ring-amber-500 cursor-pointer"
                />
                <label htmlFor="rectifyEthicsCheck" className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed cursor-pointer font-medium">
                  <strong>Revisão Ética Compulsória (CFP nº 001/2009):</strong> Confirmo sob fé pública e responsabilidade profissional perante o CRP que o teor deste termo aditivo corresponde à verdade dos fatos, preserva a integridade histórica dos registros e segue os preceitos éticos da profissão.
                </label>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRectifyModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={rectifyLoading || !rectifyConfirmedEthics || !rectifyReason.trim() || !rectifyContent.trim()}
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {rectifyLoading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Averbando na Trilha WORM...
                    </>
                  ) : (
                    <>
                      <Scale className="w-4 h-4" />
                      Averbar Termo Aditivo com Hash SHA-256
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
