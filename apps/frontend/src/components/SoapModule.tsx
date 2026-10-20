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
  FileAudio, 
  Shield, 
  Clock, 
  UserCheck, 
  ChevronDown, 
  ChevronUp, 
  RefreshCw, 
  Sparkle, 
  Loader2,
  Scale,
  BookmarkPlus,
  Tag,
  Trash2,
  ArrowRightCircle,
  FileCheck2
} from 'lucide-react';

import type { 
  SoapNote, 
  TranscriptUtterance,
  ClinicalRecordRectification,
  RectifiedQuadrant,
  ClinicalSessionMarker
} from '@terapiainfoco/shared';
import { AuditResourceType, ClinicalMarkerCategory, ClinicalMarkerRelevance } from '@terapiainfoco/shared';
import { usePrivacy } from '../contexts/PrivacyContext';
import { api } from '../services/api';
import { IcpBatchSigningModal } from './IcpBatchSigningModal';

export function SoapModule() {
  const [recordId, setRecordId] = useState<string | null>(null);
  const [showBatchModal, setShowBatchModal] = useState<boolean>(false);
  
  // Transcrição & Pipeline de Áudio
  const [hasLoadedAudio, setHasLoadedAudio] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [utterances, setUtterances] = useState<TranscriptUtterance[]>([]);
  const [sanitizedUtterances, setSanitizedUtterances] = useState<TranscriptUtterance[]>([]);
  const [showSanitizedView, setShowSanitizedView] = useState(false);
  const [isTranscriptExpanded, setIsTranscriptExpanded] = useState(true);
  const [sanitizationStats, setSanitizationStats] = useState<{ total: number; entities: Array<{ type: string; placeholder: string; count: number }> } | null>(null);
  const [aiGeneratedSuccess, setAiGeneratedSuccess] = useState(false);

  // Eixos SOAP
  const [soap, setSoap] = useState<SoapNote>({
    subjective: 'Paciente relata melhora na modulação de crises de ansiedade após uso da respiração diafragmática durante situação corporativa. Identificou pensamentos automáticos disfuncionais ("vão perceber que não dou conta") e aplicou com êxito a reestruturação cognitiva. Insônia inicial apresentou redução estimada de 40%.',
    objective: 'Apresenta-se orientada globalmente, afeto congruente com o relato, discurso fluente e com boa capacidade reflexiva e insight. Postura corporal relaxada ao longo da videoconferência, com bom engajamento nas intervenções.',
    assessment: 'Evolução favorável do quadro de Ansiedade com aumento consistente da autoeficácia e adesão às técnicas comportamentais e cognitivas da TCC. Boa resposta na redução da resposta simpática em contexto ocupacional.',
    plan: '1. Manter registro no diário de pensamentos disfuncionais (RPD). 2. Implementar higiene do sono estruturada. 3. Próxima sessão focará na flexibilização de crenças intermediárias sobre perfeccionismo.'
  });
  const [privateNotes, setPrivateNotes] = useState('A paciente demonstra necessidade de validação de figuras de autoridade. Explorar na próxima sessão as experiências infantis com exigências paternas.');
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

  const appointmentId = '00000000-0000-0000-0000-000000000010';
  const patientId = '00000000-0000-0000-0000-000000000002';

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
    async function loadMarkers() {
      try {
        const list = await api.getAppointmentMarkers(appointmentId);
        if (list && list.length > 0) {
          setMarkers(list);
        }
      } catch {
        // Inicialização resiliente
      }
    }
    loadMarkers();
  }, [appointmentId]);

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

  // Carrega ou inicializa a transcrição da sessão
  const handleLoadSessionAudio = async () => {
    try {
      setAudioLoading(true);
      setError(null);
      const res = await api.uploadAudio({
        appointmentId,
        audioFileName: 'teleconsulta-sessao-08.m4a',
        durationSeconds: 3120 // 52 min
      });
      setUtterances(res.utterances);
      setHasLoadedAudio(true);
      setSuccessMsg('Áudio da teleconsulta carregado e diarizado com sucesso!');
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar áudio da sessão');
    } finally {
      setAudioLoading(false);
    }
  };

  // Pipeline de IA Assistiva (RFC §3.3)
  const handleGenerateWithAi = async () => {
    try {
      setAiGenerating(true);
      setError(null);

      // Garante que o áudio/transcrição esteja provisionado antes de chamar a IA
      if (!hasLoadedAudio) {
        const transRes = await api.uploadAudio({
          appointmentId,
          audioFileName: 'teleconsulta-sessao-08.m4a',
          durationSeconds: 3120
        });
        setUtterances(transRes.utterances);
        setHasLoadedAudio(true);
      }

      const proposal = await api.generateSoapProposal({
        appointmentId
      });

      // Atualiza eixos SOAP com o rascunho assistido
      setSoap(proposal.soap);
      if (proposal.privateNotesSuggestion) {
        setPrivateNotes(proposal.privateNotesSuggestion);
      }
      if (proposal.sanitizedUtterances && proposal.sanitizedUtterances.length > 0) {
        setSanitizedUtterances(proposal.sanitizedUtterances);
      }
      if (proposal.sanitizationSummary) {
        setSanitizationStats({
          total: proposal.sanitizationSummary.totalEntitiesSanitized,
          entities: proposal.sanitizationSummary.entitiesDetected
        });
      }

      setAiGeneratedSuccess(true);
      setConfirmedReview(false); // Exige revisão humana compulsória (Human-in-the-Loop)
      setSuccessMsg('Minuta SOAP sintetizada por IA com base na transcrição sanitizada!');
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setError(err.message || 'Falha na geração assistida por IA');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleSaveDraft = async () => {
    try {
      setLoading(true);
      setError(null);
      const record = await api.saveSoapDraft({
        appointmentId,
        patientId,
        sessionNumber: 8,
        soap,
        privateNotes
      });
      setRecordId(record.id);
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
    setRectifyReason('Ajuste complementar pós-sessão referente ao relato do paciente sobre técnicas de respiração.');
    setRectifyContent('Aditamento ao quadrante Subjetivo: O paciente esclareceu que utilizou a técnica de respiração 4-7-8 em conjunto com a respiração diafragmática, obtendo alívio mais rápido dos sintomas simpáticos corporais.');
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

  // Renderizador com realce visual dos tokens sanitizados
  const renderDialogueText = (text: string) => {
    const tokens = ['[PACIENTE]', '[TERAPEUTA]', '[TELEFONE]', '[EMAIL]', '[CPF]', '[CEP]', '[RG]', '[NOME_TERCEIRO]', '[NOME]'];
    const parts = text.split(/(\[[A-Z_]+\])/g);
    
    return parts.map((part, idx) => {
      if (tokens.includes(part)) {
        return (
          <span 
            key={idx} 
            className="inline-block px-1.5 py-0.5 mx-0.5 rounded text-[11px] font-mono font-bold bg-amber-500/20 text-amber-900 dark:text-amber-200 border border-amber-500/30"
          >
            {part}
          </span>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            Transcrição, Diarização & SOAP com IA
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Pipeline integrado de teleconsulta com Sanitização LGPD Art. 11 e Human-in-the-Loop compulsório
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-800 dark:text-purple-300 text-xs font-medium flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
            Sessão 08 • Mariana Silva (Teleconsulta)
          </div>

          <button
            onClick={() => setShowBatchModal(true)}
            className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            title="Fechar ciclos clínicos e assinar múltiplos prontuários com Certificado Digital ICP-Brasil (PAdES)"
          >
            <FileCheck2 className="w-4 h-4" />
            <span>Assinatura ICP-Brasil em Lote</span>
          </button>

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
                Assinado digitalmente por <strong className="text-slate-900 dark:text-white">Dra. Vanessa Andrade (CRP 06/142980)</strong> em {signedAt}.
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

      {/* ========================================================= */}
      {/* CARD: PIPELINE DE TRANSCRIÇÃO & DIARIZAÇÃO (RFC §3.3) */}
      {/* ========================================================= */}
      <div className="rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {/* Topo do Card de Transcrição */}
        <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 shrink-0">
              <Headphones className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Transcrição Diarizada da Teleconsulta (sem gravação)
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 flex items-center gap-1">
                  <UserCheck className="w-3 h-3" />
                  TCLE Assinado
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  AES-256 Criptografado
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Canais de fala separados (Terapeuta vs. Paciente) com carimbos de tempo e sanitização LGPD Art. 11
              </p>
            </div>
          </div>

          {/* Botões de Ação do Pipeline */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
            {!hasLoadedAudio ? (
              <button
                onClick={handleLoadSessionAudio}
                disabled={audioLoading || aiGenerating}
                className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {audioLoading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileAudio className="w-3.5 h-3.5 text-purple-500" />
                )}
                Carregar Áudio da Teleconsulta (52 min)
              </button>
            ) : (
              <span className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 text-xs font-medium flex items-center justify-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-500" />
                52:00 min • 8 falas
              </span>
            )}

            <button
              onClick={handleGenerateWithAi}
              disabled={aiGenerating || isSigned}
              className="w-full sm:w-auto px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              {aiGenerating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Processando IA & SOAP...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  Gerar Rascunho SOAP com IA
                </>
              )}
            </button>

            <button
              onClick={() => setIsTranscriptExpanded(!isTranscriptExpanded)}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer self-center"
              title={isTranscriptExpanded ? 'Recolher transcrição' : 'Expandir transcrição'}
            >
              {isTranscriptExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Corpo Expansível da Transcrição */}
        {isTranscriptExpanded && (
          <div className="p-5 space-y-4">
            {/* Barra de Alternância: Diarização Original vs. Visão Sanitizada LGPD */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Modo de Exibição da Transcrição:
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowSanitizedView(false)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    !showSanitizedView
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  Diarização Original
                </button>
                <button
                  onClick={() => setShowSanitizedView(true)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                    showSanitizedView
                      ? 'bg-amber-500/10 text-amber-800 dark:text-amber-200 border border-amber-500/30'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  <Lock className="w-3 h-3 text-amber-500" />
                  Sanitização LGPD Art. 11
                </button>
              </div>
            </div>

            {/* Banner de Estatísticas da Sanitização LGPD (se disponível) */}
            {sanitizationStats && showSanitizedView && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900 dark:text-amber-200">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>
                    <strong>Sanitização Pré-LLM Concluída:</strong> {sanitizationStats.total} identificadores substituídos por pseudônimos genéricos antes do processamento.
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {sanitizationStats.entities.map((e, idx) => (
                    <span 
                      key={idx} 
                      className="px-2 py-0.5 rounded-md bg-white/70 dark:bg-slate-900/60 font-mono text-[10px] font-semibold text-amber-800 dark:text-amber-300 border border-amber-500/20"
                    >
                      {e.placeholder} ({e.count}x)
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Linha do Tempo Diarizada das Falas */}
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {(showSanitizedView && sanitizedUtterances.length > 0 ? sanitizedUtterances : (utterances.length > 0 ? utterances : [
                {
                  speaker: 'TERAPEUTA' as any,
                  time: '00:00:15',
                  text: 'Boa tarde, Mariana. Como você está hoje e como foi a sua semana desde a nossa última sessão?'
                },
                {
                  speaker: 'PACIENTE' as any,
                  time: '00:00:32',
                  text: 'Boa tarde, Dra. Vanessa. Tive uma semana bem desafiadora no trabalho. Tive uma reunião muito tensa com meu chefe Roberto e senti aquele aperto forte no peito, mas consegui usar a técnica de respiração diafragmática que combinamos.'
                },
                {
                  speaker: 'TERAPEUTA' as any,
                  time: '00:01:10',
                  text: 'Que excelente avanço, Mariana! E o que passou pela sua mente no momento em que você sentiu a tensão corporal?'
                },
                {
                  speaker: 'PACIENTE' as any,
                  time: '00:01:45',
                  text: 'O pensamento automático que veio foi: "Eles vão perceber que eu não dou conta e vou falhar". Mas aí eu peguei meu caderno, fiz o Registro de Pensamentos Disfuncionais (RPD) e procurei as evidências objetivas.'
                }
              ])).map((u, index) => {
                const isTherapist = u.speaker === 'TERAPEUTA';
                return (
                  <div
                    key={index}
                    className={`p-3.5 rounded-xl border text-xs leading-relaxed transition-all ${
                      isTherapist
                        ? 'bg-purple-50/60 dark:bg-purple-950/20 border-purple-200/70 dark:border-purple-800/40 ml-0 sm:ml-4'
                        : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/60 mr-0 sm:mr-4'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5 font-semibold">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isTherapist ? 'bg-purple-600 dark:bg-purple-400' : 'bg-emerald-600 dark:bg-emerald-400'
                          }`}
                        />
                        <span className={isTherapist ? 'text-purple-900 dark:text-purple-300' : 'text-slate-900 dark:text-white'}>
                          {isTherapist ? 'Dra. Vanessa Andrade (Terapeuta)' : 'Mariana Silva (Paciente)'}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {u.time}
                      </span>
                    </div>

                    <div className="text-slate-700 dark:text-slate-300">
                      {showSanitizedView ? renderDialogueText(u.text) : u.text}
                    </div>
                  </div>
                );
              })}
            </div>
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

      {/* Alerta de Minuta Gerada por IA com Human-in-the-Loop Obrigatório */}
      {aiGeneratedSuccess && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-transparent border border-purple-500/30 flex items-start gap-3">
          <Sparkle className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <h4 className="font-bold text-purple-900 dark:text-purple-200">
              Minuta Clínica Assistida por IA Gerada com Sucesso
            </h4>
            <p className="text-purple-800/90 dark:text-purple-300/90 leading-relaxed">
              Os 4 quadrantes SOAP foram pré-preenchidos a partir da transcrição sanitizada. O princípio <strong>Human-in-the-Loop</strong> é legalmente obrigatório pelo CFP: revise o texto abaixo, faça os ajustes clínicos pertinentes e confirme antes de assinar.
            </p>
          </div>
        </div>
      )}

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

      {/* Modal de Assinatura Avançada ICP-Brasil em Lote & Fechamento de Ciclos (RFC-001 §3.4, §3.5) */}
      <IcpBatchSigningModal
        isOpen={showBatchModal}
        onClose={() => setShowBatchModal(false)}
        therapistName="Dra. Beatriz Santos"
        therapistCrp="06/142980"
        onBatchSigned={(manifest) => {
          setSuccessMsg(`Lote #${manifest.id.substring(0, 8)} assinado com Certificado ICP-Brasil com sucesso! ${manifest.totalItemsCount} registros selados na trilha WORM.`);
        }}
      />
    </div>
  );
}
