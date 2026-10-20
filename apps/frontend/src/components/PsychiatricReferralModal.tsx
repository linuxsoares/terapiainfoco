import React, { useState, useEffect } from 'react';
import {
  Pill,
  AlertTriangle,
  FileText,
  Plus,
  Trash2,
  CheckCircle2,
  Copy,
  Clock,
  X,
  RefreshCw,
  Lock
} from 'lucide-react';
import {
  DiagnosticUrgencyLevel,
  DrugInteractionSeverity
} from '@terapiainfoco/shared';
import type {
  Psychopharmaceutical,
  DrugInteractionRecord,
  PatientCurrentMedication,
  PsychiatricReferralGuide,
  CreatePsychiatricReferralDTO
} from '@terapiainfoco/shared';
import { api } from '../services/api';

interface PsychiatricReferralModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  patientName?: string;
}

export const PsychiatricReferralModal: React.FC<PsychiatricReferralModalProps> = ({
  isOpen,
  onClose,
  patientId,
  patientName = 'Paciente Selecionado'
}) => {
  // Abas
  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');

  // Catálogo de Psicofármacos
  const [catalog, setCatalog] = useState<Psychopharmaceutical[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState<boolean>(false);

  // Form de Encaminhamento
  const [urgencyLevel, setUrgencyLevel] = useState<DiagnosticUrgencyLevel>(DiagnosticUrgencyLevel.MODERATE);
  const [reasonForReferral, setReasonForReferral] = useState<string>('');
  const [clinicalHypotheses, setClinicalHypotheses] = useState<string[]>([]);
  const [customCidInput, setCustomCidInput] = useState<string>('');
  const [confidentialNotes, setConfidentialNotes] = useState<string>('');

  // Resumo psicométrico opcional
  const [scaleName, setScaleName] = useState<string>('PHQ-9');
  const [scaleScore, setScaleScore] = useState<string>('15');
  const [scaleSeverity, setScaleSeverity] = useState<string>('Moderadamente Grave');
  const [includePsychometrics, setIncludePsychometrics] = useState<boolean>(true);

  // Medicações Atuais Relatadas
  const [currentMedications, setCurrentMedications] = useState<PatientCurrentMedication[]>([]);
  const [selectedDrugId, setSelectedDrugId] = useState<string>('');
  const [customDosage, setCustomDosage] = useState<string>('');
  const [customFrequency, setCustomFrequency] = useState<string>('1x ao dia pela manhã');
  const [adherence, setAdherence] = useState<'FULL' | 'PARTIAL' | 'NON_ADHERENT'>('FULL');

  // Interações medicamentosas avaliadas
  const [detectedInteractions, setDetectedInteractions] = useState<DrugInteractionRecord[]>([]);
  const [maxSeverity, setMaxSeverity] = useState<DrugInteractionSeverity | 'NONE'>('NONE');
  const [isCheckingInteractions, setIsCheckingInteractions] = useState<boolean>(false);

  // Emissão & Sucesso
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [createdReferral, setCreatedReferral] = useState<PsychiatricReferralGuide | null>(null);
  const [copiedToken, setCopiedToken] = useState<boolean>(false);

  // Histórico
  const [historyReferrals, setHistoryReferrals] = useState<PsychiatricReferralGuide[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  // Carrega catálogo e histórico ao abrir
  useEffect(() => {
    if (isOpen) {
      loadCatalog();
      loadHistory();
      setCreatedReferral(null);
    }
  }, [isOpen, patientId]);

  // Recalcula interações sempre que os medicamentos mudarem
  useEffect(() => {
    if (currentMedications.length >= 2) {
      evaluateInteractions(currentMedications.map(m => m.drugId));
    } else {
      setDetectedInteractions([]);
      setMaxSeverity('NONE');
    }
  }, [currentMedications]);

  const loadCatalog = async () => {
    setIsLoadingCatalog(true);
    try {
      const drugs = await api.getPsychopharmaceuticalsCatalog();
      setCatalog(drugs);
      if (drugs.length > 0 && !selectedDrugId) {
        setSelectedDrugId(drugs[0].id);
        setCustomDosage(drugs[0].commonDosages[0] || '20mg');
      }
    } catch (err) {
      console.error('Erro ao carregar catálogo farmacológico:', err);
    } finally {
      setIsLoadingCatalog(false);
    }
  };

  const loadHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const refs = await api.getPatientPsychiatricReferrals(patientId);
      setHistoryReferrals(refs);
    } catch (err) {
      console.error('Erro ao carregar histórico de encaminhamentos:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const evaluateInteractions = async (drugIds: string[]) => {
    setIsCheckingInteractions(true);
    try {
      const res = await api.checkDrugInteractions(drugIds);
      setDetectedInteractions(res.interactions);
      setMaxSeverity(res.maxSeverity);
    } catch (err) {
      console.error('Erro ao checar interações farmacológicas:', err);
    } finally {
      setIsCheckingInteractions(false);
    }
  };

  const handleAddMedication = () => {
    if (!selectedDrugId) return;
    const drug = catalog.find(d => d.id === selectedDrugId);
    if (!drug) return;

    if (currentMedications.some(m => m.drugId === selectedDrugId)) {
      alert('Este medicamento já foi adicionado à lista do paciente.');
      return;
    }

    const newMed: PatientCurrentMedication = {
      drugId: drug.id,
      drugName: `${drug.tradeName} (${drug.genericName})`,
      dosage: customDosage || drug.commonDosages[0] || 'Dose padrão',
      frequency: customFrequency || '1x ao dia',
      patientReportedAdherence: adherence
    };

    setCurrentMedications([...currentMedications, newMed]);
  };

  const handleRemoveMedication = (index: number) => {
    setCurrentMedications(currentMedications.filter((_, i) => i !== index));
  };

  const handleToggleHypothesis = (cid: string) => {
    if (clinicalHypotheses.includes(cid)) {
      setClinicalHypotheses(clinicalHypotheses.filter(h => h !== cid));
    } else {
      setClinicalHypotheses([...clinicalHypotheses, cid]);
    }
  };

  const handleAddCustomCid = () => {
    if (customCidInput.trim() && !clinicalHypotheses.includes(customCidInput.trim())) {
      setClinicalHypotheses([...clinicalHypotheses, customCidInput.trim()]);
      setCustomCidInput('');
    }
  };

  const handleSubmitReferral = async () => {
    if (!reasonForReferral.trim()) {
      alert('Por favor, informe o motivo clínico do encaminhamento.');
      return;
    }

    if (clinicalHypotheses.length === 0) {
      alert('Selecione ou informe ao menos uma hipótese diagnóstica (CID-11).');
      return;
    }

    setIsSubmitting(true);
    try {
      const dto: CreatePsychiatricReferralDTO = {
        patientId,
        urgencyLevel,
        reasonForReferral: reasonForReferral.trim(),
        clinicalHypothesesCid11: clinicalHypotheses,
        currentMedications,
        psychometricSummary: includePsychometrics
          ? {
              scale: scaleName,
              score: Number(scaleScore) || 0,
              severity: scaleSeverity
            }
          : undefined,
        confidentialNotes: confidentialNotes.trim() || undefined
      };

      const res = await api.createPsychiatricReferral(dto);
      setCreatedReferral(res.referral);
      await loadHistory();
    } catch (err: any) {
      console.error('Erro ao emitir encaminhamento psiquiátrico:', err);
      alert(`Falha ao emitir encaminhamento: ${err.message || 'Erro desconhecido'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2500);
  };

  if (!isOpen) return null;

  const quickCidOptions = [
    '6A70 - Transtorno Depressivo de Episódio Único',
    '6A71 - Transtorno Depressivo Recorrente',
    '6A60 - Transtorno Bipolar Tipo I',
    '6A61 - Transtorno Bipolar Tipo II',
    '6B00 - Transtorno de Ansiedade Generalizada (TAG)',
    '6B01 - Transtorno de Pânico',
    '6B20 - Transtorno Obsessivo-Compulsivo (TOC)',
    '6B40 - Transtorno de Estresse Pós-Traumático (TEPT)',
    '6A05 - Transtorno de Déficit de Atenção e Hiperatividade (TDAH)',
    '7A00 - Transtorno de Insônia Crônica'
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden transition-colors">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400">
              <Pill className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Prescrição & Encaminhamento Psiquiátrico
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Paciente: <strong className="text-slate-700 dark:text-slate-200">{patientName}</strong> • Avaliação Farmacológica & Emissão Notarial
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-6 bg-slate-100/50 dark:bg-slate-900">
          <button
            onClick={() => {
              setActiveTab('create');
              setCreatedReferral(null);
            }}
            className={`py-3 px-4 font-semibold text-sm border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'create'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <FileText className="w-4 h-4" />
            Novo Encaminhamento & Checagem
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`py-3 px-4 font-semibold text-sm border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'history'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Clock className="w-4 h-4" />
            Histórico de Guias ({historyReferrals.length})
          </button>
        </div>

        {/* Conteúdo Principal */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'create' && !createdReferral && (
            <>
              {/* Nível de Urgência */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">
                  Nível de Urgência do Encaminhamento
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { id: DiagnosticUrgencyLevel.ROUTINE, label: 'Rotina Eletiva', desc: 'Avaliação ambulatorial padrão', color: 'border-emerald-500 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30' },
                    { id: DiagnosticUrgencyLevel.MODERATE, label: 'Prioritário / Moderado', desc: 'Sintomas refratários ou disfuncionais', color: 'border-amber-500 text-amber-700 bg-amber-50 dark:bg-amber-950/30' },
                    { id: DiagnosticUrgencyLevel.CRITICAL_RED_FLAG, label: 'Emergência / Red Flag', desc: 'Ideação iminente, psicose ou risco vital', color: 'border-rose-500 text-rose-700 bg-rose-50 dark:bg-rose-950/30' }
                  ].map(u => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setUrgencyLevel(u.id)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        urgencyLevel === u.id
                          ? `${u.color} ring-2 ring-purple-500 font-bold shadow-sm`
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="text-sm">{u.label}</div>
                      <div className="text-xs opacity-80 mt-0.5">{u.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Hipóteses Diagnósticas CID-11 */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
                  Hipóteses Diagnósticas Levantadas (CID-11 / DSM-5-TR)
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                  Selecione as categorias correspondentes às evidências clínicas observadas na psicoterapia:
                </p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {quickCidOptions.map(cid => {
                    const isSelected = clinicalHypotheses.includes(cid);
                    return (
                      <button
                        key={cid}
                        type="button"
                        onClick={() => handleToggleHypothesis(cid)}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-purple-600 border-purple-600 text-white font-semibold shadow-sm'
                            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        {cid}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customCidInput}
                    onChange={e => setCustomCidInput(e.target.value)}
                    placeholder="Adicionar outro código CID-11 ou hipótese personalizada..."
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomCid();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomCid}
                    className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    Adicionar
                  </button>
                </div>
              </div>

              {/* Motivo do Encaminhamento */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
                  Motivo Clínico & Justificativa do Encaminhamento (Resolução CFP nº 006/2019)
                </label>
                <textarea
                  value={reasonForReferral}
                  onChange={e => setReasonForReferral(e.target.value)}
                  rows={3}
                  placeholder="Ex: Paciente em atendimento psicoterapêutico semanal apresentando humor deprimido acentuado há 12 semanas, anedonia, hipersonia e ideação suicida passiva sem plano estruturado. Solicita-se avaliação médica psiquiátrica quanto à pertinência de intervenção psicofarmacológica adjuvante..."
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Farmacoterapia Relatada & Avaliação Cruzada */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-800/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Pill className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    <h3 className="font-semibold text-slate-900 dark:text-white text-base">
                      Farmacoterapia Relatada pelo Paciente & Checagem de Interações
                    </h3>
                    {isCheckingInteractions && <RefreshCw className="w-4 h-4 text-purple-500 animate-spin" />}
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    {currentMedications.length} medicamento(s) registrado(s)
                  </span>
                </div>

                {/* Seletor de Medicamento */}
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 mb-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                      {isLoadingCatalog ? 'Carregando catálogo...' : 'Medicamento do Catálogo'}
                    </label>
                    <select
                      value={selectedDrugId}
                      onChange={e => {
                        setSelectedDrugId(e.target.value);
                        const drug = catalog.find(d => d.id === e.target.value);
                        if (drug && drug.commonDosages.length > 0) {
                          setCustomDosage(drug.commonDosages[0]);
                        }
                      }}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      {catalog.map(d => (
                        <option key={d.id} value={d.id}>
                          {d.genericName} — {d.tradeName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Dosagem</label>
                    <input
                      type="text"
                      value={customDosage}
                      onChange={e => setCustomDosage(e.target.value)}
                      placeholder="Ex: 50mg"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Posologia / Frequência</label>
                    <input
                      type="text"
                      value={customFrequency}
                      onChange={e => setCustomFrequency(e.target.value)}
                      placeholder="Ex: 1x pela manhã"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Adesão Relatada</label>
                    <select
                      value={adherence}
                      onChange={e => setAdherence(e.target.value as any)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="FULL">Adesão Total / Regular</option>
                      <option value="PARTIAL">Adesão Parcial</option>
                      <option value="NON_ADHERENT">Não Aderente / Suspenso</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end mb-3">
                  <button
                    type="button"
                    onClick={handleAddMedication}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm rounded-lg flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Adicionar Medicamento
                  </button>
                </div>

                {/* Lista de Medicamentos Cadastrados */}
                {currentMedications.length > 0 ? (
                  <div className="space-y-2 mb-4">
                    {currentMedications.map((med, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                      >
                        <div>
                          <div className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                            {med.drugName}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            Dose: <span className="font-medium text-slate-700 dark:text-slate-300">{med.dosage}</span> • Posologia: {med.frequency} • Adesão: {med.patientReportedAdherence === 'FULL' ? 'Regular' : med.patientReportedAdherence === 'PARTIAL' ? 'Parcial' : 'Não Aderente'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveMedication(idx)}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                          title="Remover medicamento"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
                    Nenhum medicamento informado até o momento. Selecione acima para verificar interações cruzadas.
                  </div>
                )}

                {/* Painel de Interações Detectadas */}
                {currentMedications.length >= 2 && (
                  <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className={`w-5 h-5 ${
                          maxSeverity === DrugInteractionSeverity.CONTRAINDICATED
                            ? 'text-rose-600 animate-pulse'
                            : maxSeverity === DrugInteractionSeverity.MAJOR
                            ? 'text-amber-600'
                            : maxSeverity === DrugInteractionSeverity.MODERATE
                            ? 'text-yellow-600'
                            : 'text-emerald-600'
                        }`} />
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          Resultado da Checagem Farmacológica Cruzada
                        </span>
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase ${
                        maxSeverity === DrugInteractionSeverity.CONTRAINDICATED
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                          : maxSeverity === DrugInteractionSeverity.MAJOR
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                          : maxSeverity === DrugInteractionSeverity.MODERATE
                          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300 border border-yellow-300 dark:border-yellow-800'
                          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                      }`}>
                        {maxSeverity === 'NONE' ? 'Sem Interações Conhecidas' : `Risco: ${maxSeverity}`}
                      </span>
                    </div>

                    {detectedInteractions.length > 0 ? (
                      <div className="space-y-3">
                        {detectedInteractions.map((inter, i) => (
                          <div
                            key={i}
                            className={`p-3.5 rounded-xl border text-sm ${
                              inter.severity === DrugInteractionSeverity.CONTRAINDICATED
                                ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-300 dark:border-rose-900 text-rose-900 dark:text-rose-200'
                                : inter.severity === DrugInteractionSeverity.MAJOR
                                ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-900 text-amber-900 dark:text-amber-200'
                                : 'bg-yellow-50/70 dark:bg-yellow-950/30 border-yellow-300 dark:border-yellow-900 text-yellow-900 dark:text-yellow-200'
                            }`}
                          >
                            <div className="flex items-center justify-between font-bold mb-1">
                              <span>{inter.drugNames[0]} ↔ {inter.drugNames[1]}</span>
                              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-white/60 dark:bg-black/30">
                                {inter.severity}
                              </span>
                            </div>
                            <p className="text-xs font-medium mb-1.5 opacity-90">
                              <strong>Risco Clínico:</strong> {inter.clinicalRisk}
                            </p>
                            <div className="text-xs p-2 rounded bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                              <strong className="text-purple-600 dark:text-purple-400">💡 Manejo do Psicólogo:</strong> {inter.psychologistManagementTip}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 p-3 rounded-lg flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        Não foram detectadas interações farmacológicas adversas ou contraindicações graves entre os medicamentos selecionados.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Resumo Psicométrico Opcional */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-800/30">
                <div className="flex items-center justify-between mb-3">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-sm text-slate-800 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={includePsychometrics}
                      onChange={e => setIncludePsychometrics(e.target.checked)}
                      className="rounded text-purple-600 focus:ring-purple-500"
                    />
                    Anexar Resumo de Escala Psicométrica Recente
                  </label>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Validação Objetiva</span>
                </div>
                {includePsychometrics && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Escala Utilizada</label>
                      <input
                        type="text"
                        value={scaleName}
                        onChange={e => setScaleName(e.target.value)}
                        placeholder="Ex: PHQ-9, BAI, BDI-II"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Pontuação Obtida</label>
                      <input
                        type="number"
                        value={scaleScore}
                        onChange={e => setScaleScore(e.target.value)}
                        placeholder="Ex: 16"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Classificação de Severidade</label>
                      <input
                        type="text"
                        value={scaleSeverity}
                        onChange={e => setScaleSeverity(e.target.value)}
                        placeholder="Ex: Moderadamente Grave"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Anotações Confidenciais (FLE) */}
              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
                  <Lock className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  Anotações Confidenciais do Terapeuta (Criptografadas AES-256-GCM / Art. 9º CFP)
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                  Estas anotações são salvas com Field-Level Encryption e NÃO são compartilhadas na validação pública do médico externo.
                </p>
                <textarea
                  value={confidentialNotes}
                  onChange={e => setConfidentialNotes(e.target.value)}
                  rows={2}
                  placeholder="Anotações internas sobre dinâmicas familiares, estressores específicos ou hipóteses sigilosas..."
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Botão de Envio */}
              <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={handleSubmitReferral}
                  disabled={isSubmitting}
                  className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-sm rounded-xl flex items-center gap-2 shadow-lg hover:shadow-purple-500/25 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Assinando e Criptografando Guia...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Emitir & Assinar Guia de Encaminhamento
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {/* Tela de Sucesso após Emissão */}
          {activeTab === 'create' && createdReferral && (
            <div className="space-y-6">
              <div className="p-6 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-600 dark:text-emerald-400 mx-auto mb-3" />
                <h3 className="text-xl font-bold text-emerald-900 dark:text-emerald-100 mb-1">
                  Guia de Encaminhamento Psiquiátrico Emitida com Sucesso!
                </h3>
                <p className="text-sm text-emerald-700 dark:text-emerald-300 max-w-xl mx-auto mb-4">
                  O documento foi assinado digitalmente, protegido com Field-Level Encryption e registrado na cadeia de auditoria WORM em conformidade com as Resoluções CFP nº 006/2019 e LGPD.
                </p>

                {/* Token e Link Notarial */}
                <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-emerald-300 dark:border-emerald-800 max-w-2xl mx-auto text-left shadow-sm">
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                    TOKEN NOTARIAL DE VALIDAÇÃO PÚBLICA (MÉDICO PSIQUIATRA):
                  </div>
                  <div className="flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 font-mono text-xs">
                    <span className="truncate text-slate-800 dark:text-slate-200 font-bold">
                      {createdReferral.validationToken}
                    </span>
                    <button
                      onClick={() => copyToClipboard(createdReferral.validationToken)}
                      className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded font-sans text-xs flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      {copiedToken ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedToken ? 'Copiado!' : 'Copiar Token'}
                    </button>
                  </div>
                  <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Checksum SHA-256: <code className="text-xs font-mono">{createdReferral.integrityChecksumSha256.slice(0, 24)}...</code>
                  </div>
                </div>
              </div>

              {/* Pré-visualização da Guia Timbrada */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-6 bg-white dark:bg-slate-900 shadow-sm space-y-4">
                <div className="border-b border-slate-200 dark:border-slate-800 pb-3 flex justify-between items-start">
                  <div>
                    <h4 className="font-serif font-bold text-lg text-slate-900 dark:text-white uppercase tracking-wide">
                      Guia de Encaminhamento Psiquiátrico Interoperável
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      TerapiaInFoco Clínica Digital • Registro Notarial de Intercâmbio Clínico
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                      Urgência: {createdReferral.urgencyLevel}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs text-slate-600 dark:text-slate-400">
                  <div>
                    <strong>Terapeuta Responsável:</strong> {createdReferral.therapistName} ({createdReferral.therapistCrp})
                  </div>
                  <div>
                    <strong>Data de Emissão:</strong> {new Date(createdReferral.createdAt).toLocaleString('pt-BR')}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Hipóteses Diagnósticas Principais (CID-11):
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {createdReferral.clinicalHypothesesCid11.map((h, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium border border-slate-200 dark:border-slate-700">
                        {h}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Justificativa Clínica do Encaminhamento:
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700 leading-relaxed">
                    {createdReferral.reasonForReferral}
                  </p>
                </div>

                {createdReferral.currentMedications.length > 0 && (
                  <div>
                    <div className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                      Medicações em Uso e Interações Avaliadas:
                    </div>
                    <ul className="text-xs text-slate-700 dark:text-slate-300 list-disc list-inside space-y-1">
                      {createdReferral.currentMedications.map((m, i) => (
                        <li key={i}>
                          <strong>{m.drugName}</strong> — {m.dosage} ({m.frequency})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="flex justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setCreatedReferral(null);
                    setReasonForReferral('');
                    setClinicalHypotheses([]);
                    setCurrentMedications([]);
                  }}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Novo Encaminhamento
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Concluir
                </button>
              </div>
            </div>
          )}

          {/* Aba de Histórico */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              {isLoadingHistory ? (
                <div className="py-12 text-center text-slate-500 flex items-center justify-center gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Carregando guias de encaminhamento...
                </div>
              ) : historyReferrals.length > 0 ? (
                historyReferrals.map(ref => (
                  <div
                    key={ref.id}
                    className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                          {ref.urgencyLevel}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          Emitida em {new Date(ref.createdAt).toLocaleDateString('pt-BR')} por {ref.therapistName}
                        </span>
                      </div>
                      <span className="text-xs font-mono text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 rounded border border-purple-200 dark:border-purple-800">
                        {ref.validationToken}
                      </span>
                    </div>

                    <p className="text-sm text-slate-800 dark:text-slate-200 line-clamp-2">
                      {ref.reasonForReferral}
                    </p>

                    <div className="flex flex-wrap gap-1.5">
                      {ref.clinicalHypothesesCid11.map((h, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {h}
                        </span>
                      ))}
                    </div>

                    {ref.confidentialNotes && (
                      <div className="text-xs p-2.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 flex items-start gap-1.5">
                        <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span><strong>Nota Sigilosa (FLE):</strong> {ref.confidentialNotes}</span>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="py-16 text-center text-slate-400 space-y-2">
                  <Pill className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
                  <p className="text-sm font-medium">Nenhum encaminhamento psiquiátrico emitido para este paciente.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
