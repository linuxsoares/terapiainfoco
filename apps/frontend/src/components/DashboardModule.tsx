import { useState, useEffect } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Calendar, 
  ShieldCheck, 
  RefreshCw, 
  FileCheck2, 
  Activity, 
  AlertTriangle, 
  Clock, 
  Sparkles,
  Award
} from 'lucide-react';
import { api } from '../services/api';
import type { 
  ClinicalOverviewMetrics, 
  SecurityMetrics, 
  PatientClinicalMetrics
} from '@terapiainfoco/shared';
import { AppointmentStatus, DocumentType } from '@terapiainfoco/shared';

export function DashboardModule() {
  const [viewMode, setViewMode] = useState<'clinical' | 'security'>('clinical');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dados consolidados
  const [clinicalOverview, setClinicalOverview] = useState<ClinicalOverviewMetrics | null>(null);
  const [securityMetrics, setSecurityMetrics] = useState<SecurityMetrics | null>(null);

  // Análise longitudinal de paciente
  const [patients, setPatients] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [patientMetrics, setPatientMetrics] = useState<PatientClinicalMetrics | null>(null);
  const [loadingPatient, setLoadingPatient] = useState(false);

  const loadData = async () => {
    try {
      setError(null);
      const [clinical, security] = await Promise.all([
        api.getClinicalOverview(),
        api.getSecurityMetrics()
      ]);
      setClinicalOverview(clinical);
      setSecurityMetrics(security);

      // Carrega lista de pacientes únicos a partir das sessões
      if (clinical.recentSessions.length > 0) {
        const uniquePatients: Array<{ id: string; name: string }> = [];
        const seen = new Set<string>();
        for (const s of clinical.recentSessions) {
          if (!seen.has(s.patientId)) {
            seen.add(s.patientId);
            uniquePatients.push({
              id: s.patientId,
              name: s.patientName
            });
          }
        }
        setPatients(uniquePatients);
        if (uniquePatients.length > 0 && !selectedPatientId) {
          setSelectedPatientId(uniquePatients[0].id);
          loadPatientEvolution(uniquePatients[0].id);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar métricas.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadPatientEvolution = async (patientId: string) => {
    if (!patientId) return;
    try {
      setLoadingPatient(true);
      const metrics = await api.getPatientClinicalMetrics(patientId);
      setPatientMetrics(metrics);
    } catch {
      setPatientMetrics(null);
    } finally {
      setLoadingPatient(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handlePatientSelect = (pId: string) => {
    setSelectedPatientId(pId);
    loadPatientEvolution(pId);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-3">
        <RefreshCw className="w-8 h-8 text-teal-600 dark:text-teal-400 animate-spin" />
        <p className="text-sm text-slate-500 dark:text-slate-400">Calculando indicadores clínicos e observabilidade WORM...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header com alternador de visão */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-teal-600 dark:text-teal-400" />
            Dashboard Clínico & Observabilidade
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Métricas longitudinais de pacientes, assiduidade e integridade da trilha WORM (RFC-001 §5)
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Seletor de Modo: Clínico vs Segurança */}
          <div className="bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl flex items-center border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setViewMode('clinical')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'clinical'
                  ? 'bg-white dark:bg-slate-900 text-teal-800 dark:text-teal-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Visão Clínica
            </button>
            <button
              onClick={() => setViewMode('security')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'security'
                  ? 'bg-white dark:bg-slate-900 text-teal-800 dark:text-teal-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Segurança & WORM
            </button>
          </div>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white shadow-sm transition-all cursor-pointer disabled:opacity-50"
            title="Atualizar Indicadores"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. VISÃO CLÍNICA                                                          */}
      {/* ========================================================================= */}
      {viewMode === 'clinical' && clinicalOverview && (
        <div className="space-y-6">
          {/* Grade de 4 KPIs Clínicos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1: Pacientes */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Pacientes Ativos</span>
                <div className="p-2 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {clinicalOverview.activePatients}
                </span>
                <span className="text-[11px] text-slate-500">
                  / {clinicalOverview.totalPatients} cadastrados
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-teal-600" />
                Protegidos por Field-Level Encryption
              </p>
            </div>

            {/* KPI 2: Sessões & Assiduidade */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Taxa de Assiduidade</span>
                <div className="p-2 rounded-xl bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {clinicalOverview.attendanceRate}%
                </span>
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                  {clinicalOverview.completedSessions} concluídas
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {clinicalOverview.scheduledSessions} agendadas • {clinicalOverview.cancelledSessions} faltas/cancelamentos
              </p>
            </div>

            {/* KPI 3: Prontuários SOAP com Human-in-the-Loop */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Human-in-the-Loop</span>
                <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
                  <Sparkles className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {clinicalOverview.humanReviewComplianceRate}%
                </span>
                <span className="text-[11px] text-purple-600 dark:text-purple-400 font-semibold">
                  {clinicalOverview.signedSoapRecords} assinados
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Conformidade estrita com Resolução CFP nº 001/2009
              </p>
            </div>

            {/* KPI 4: Documentos Oficiais CFP */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Documentos CFP</span>
                <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                  <Award className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {clinicalOverview.totalDocuments}
                </span>
                <span className="text-[11px] text-teal-600 dark:text-teal-400 font-semibold">
                  {clinicalOverview.icpSignedDocuments} com ICP-Brasil
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {clinicalOverview.signedDocuments} assinados com QR Code Zero-Knowledge
              </p>
            </div>
          </div>

          {/* Gráfico de Volume Mensal e Distribuição dos 4 Modelos CFP */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Gráfico de Sessões Mensais */}
            <div className="lg:col-span-2 p-6 rounded-3xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    Volume Mensal de Atendimentos Psicológicos
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Frequência de teleconsultas realizadas e agendadas
                  </p>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300 border border-teal-500/20 self-start sm:self-auto">
                  Total: {clinicalOverview.totalSessions} sessões
                </span>
              </div>

              {/* Barras do Gráfico Mensal */}
              <div className="pt-6 pb-2">
                <div className="flex items-end justify-between gap-3 h-40 border-b border-slate-200 dark:border-slate-800 px-2">
                  {clinicalOverview.sessionsByMonth.map((item, index) => {
                    const maxVal = Math.max(...clinicalOverview.sessionsByMonth.map(m => m.count), 5);
                    const heightPercent = Math.max(12, Math.round((item.count / maxVal) * 100));

                    return (
                      <div key={index} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                        <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">
                          {item.count}
                        </span>
                        <div 
                          style={{ height: `${heightPercent}%` }}
                          className="w-full max-w-[48px] rounded-t-xl bg-gradient-to-t from-teal-600 to-teal-400 dark:from-teal-700 dark:to-teal-500 transition-all group-hover:from-teal-500 group-hover:to-teal-300 shadow-sm"
                        />
                        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-2">
                          {item.month}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Distribuição dos 4 Modelos CFP nº 006/2019 */}
            <div className="p-6 rounded-3xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <FileCheck2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Modelos Oficiais CFP nº 006/2019
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Distribuição de documentos emitidos
                </p>
              </div>

              <div className="space-y-3 pt-2">
                {[
                  { type: DocumentType.ATESTADO, label: 'Atestados', color: 'bg-emerald-500' },
                  { type: DocumentType.RELATORIO, label: 'Relatórios', color: 'bg-teal-500' },
                  { type: DocumentType.LAUDO, label: 'Laudos Periciais', color: 'bg-sky-500' },
                  { type: DocumentType.DECLARACAO, label: 'Declarações', color: 'bg-indigo-500' }
                ].map(({ type, label, color }) => {
                  const count = clinicalOverview.documentsByType[type] || 0;
                  const total = clinicalOverview.totalDocuments || 1;
                  const pct = Math.round((count / total) * 100);

                  return (
                    <div key={type} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{label}</span>
                        <span className="font-bold text-slate-900 dark:text-white">{count} ({pct}%)</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div 
                          className={`h-full ${color} rounded-full transition-all duration-500`}
                          style={{ width: `${Math.max(count > 0 ? 8 : 0, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
                <span>Todos com QR Code Zero-Knowledge e Carimbo PAdES</span>
              </div>
            </div>
          </div>

          {/* Análise Longitudinal do Paciente (Jornada Terapêutica) */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                  Evolução Clínica Longitudinal & Prontuário SOAP
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Linha do tempo terapêutica e acompanhamento de adesão por paciente
                </p>
              </div>

              {/* Seletor de Paciente */}
              {patients.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Paciente:</span>
                  <select
                    value={selectedPatientId}
                    onChange={(e) => handlePatientSelect(e.target.value)}
                    className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                  >
                    {patients.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {loadingPatient ? (
              <div className="p-8 text-center text-xs text-slate-500">Carregando evolução do paciente...</div>
            ) : patientMetrics ? (
              <div className="space-y-4">
                {/* Indicadores Resumidos do Paciente */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 text-xs">
                  <div>
                    <span className="text-slate-500">Pessoa Atendida:</span>
                    <p className="font-bold text-slate-900 dark:text-white mt-0.5">{patientMetrics.patientName}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Total de Consultas:</span>
                    <p className="font-bold text-slate-900 dark:text-white mt-0.5">{patientMetrics.totalAppointments} sessões</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Taxa de Presença:</span>
                    <p className="font-bold text-teal-700 dark:text-teal-400 mt-0.5">{patientMetrics.attendanceRate}%</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Evoluções SOAP:</span>
                    <p className="font-bold text-slate-900 dark:text-white mt-0.5">{patientMetrics.totalSoapNotes} registradas</p>
                  </div>
                </div>

                {/* Linha do Tempo das Sessões */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Histórico de Sessões & Evolução SOAP
                  </h4>

                  {patientMetrics.evolutionTimeline.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">Nenhuma sessão registrada para este paciente.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {patientMetrics.evolutionTimeline.map((item) => (
                        <div 
                          key={item.sessionId}
                          className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-start justify-between gap-3 shadow-xs"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-900 dark:text-white">
                                Sessão #{item.sessionNumber}
                              </span>
                              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                {new Date(item.date).toLocaleDateString('pt-BR')} às {new Date(item.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                item.status === AppointmentStatus.CONCLUIDA || (item.status as any) === 'COMPLETED'
                                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                                  : 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20'
                              }`}>
                                {item.status}
                              </span>
                            </div>

                            {item.soapSubjectiveSummary && (
                              <p className="text-xs text-slate-700 dark:text-slate-300 mt-1">
                                <strong className="text-slate-900 dark:text-white font-semibold">Subjetivo:</strong> {item.soapSubjectiveSummary}
                              </p>
                            )}

                            {item.soapAssessmentSummary && (
                              <p className="text-xs text-slate-600 dark:text-slate-400">
                                <strong className="text-slate-800 dark:text-slate-200 font-semibold">Avaliação:</strong> {item.soapAssessmentSummary}
                              </p>
                            )}
                          </div>

                          <div className="shrink-0 flex items-center gap-2">
                            {item.hasSoap && item.isSigned ? (
                              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-full flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3" />
                                SOAP Assinado (Imutável)
                              </span>
                            ) : item.hasSoap ? (
                              <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-full flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                SOAP Rascunho
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">Sem anotação SOAP</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Selecione um paciente para carregar os dados longitudinais.</p>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. VISÃO DE SEGURANÇA & WORM                                             */}
      {/* ========================================================================= */}
      {viewMode === 'security' && securityMetrics && (
        <div className="space-y-6">
          {/* Card Master de Integridade WORM */}
          <div className="p-6 rounded-3xl bg-gradient-to-r from-emerald-950/80 to-teal-950/80 border border-emerald-500/30 text-white shadow-xl relative overflow-hidden">
            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Trilha de Auditoria WORM (RFC-001 §4.4)
                </span>
                <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  Status de Integridade: {securityMetrics.wormIntegrityStatus === 'INTACT' ? 'INVIOLÁVEL & INTACTA' : 'ALERTA'}
                </h2>
                <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
                  Todos os registros são gravados em modelo *Write Once, Read Many* com congelamento de objetos em memória e persistência imutável. Zero adulterações detectadas.
                </p>
              </div>

              <div className="text-right sm:border-l sm:border-emerald-500/30 sm:pl-6 shrink-0">
                <span className="text-3xl font-black text-white">{securityMetrics.totalAuditLogs}</span>
                <p className="text-[11px] text-emerald-300 font-semibold mt-0.5">Logs Auditados</p>
              </div>
            </div>
          </div>

          {/* Grade de 4 KPIs de Segurança */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Leituras FLE Decifradas</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {securityMetrics.totalDecryptReads}
                </span>
                <span className="text-[11px] text-teal-600 dark:text-teal-400 font-semibold">DEK verificada</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Acessos a dados clínicos em repouso</p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Assinaturas Registradas</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {securityMetrics.totalSignatures}
                </span>
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">SHA-256</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Prontuários e laudos com selo de imutabilidade</p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Rate Limit Bloqueios</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {securityMetrics.rateLimitBlocksCount}
                </span>
                <span className="text-[11px] text-sky-600 dark:text-sky-400 font-semibold">HTTP 429</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Tentativas de força bruta interceptadas</p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Adoção de 2FA / MFA</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {securityMetrics.twoFactorAdoptionRate}%
                </span>
                <span className="text-[11px] text-purple-600 dark:text-purple-400 font-semibold">TOTP RFC 6238</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Contas protegidas com segundo fator</p>
            </div>
          </div>

          {/* Distribuição de Eventos por Ação & Feed de Alertas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Eventos por Ação */}
            <div className="p-6 rounded-3xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                Eventos de Auditoria por Ação
              </h3>

              <div className="space-y-2.5 pt-2">
                {Object.entries(securityMetrics.auditEventsByAction).map(([action, count]) => (
                  <div key={action} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs">
                    <span className="font-mono text-slate-700 dark:text-slate-300 font-semibold">{action}</span>
                    <span className="font-bold text-slate-900 dark:text-white px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                      {count} eventos
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Feed de Alertas e Eventos de Segurança Recentes */}
            <div className="p-6 rounded-3xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Feed de Observabilidade de Segurança
              </h3>

              <div className="space-y-2 pt-2 max-h-[350px] overflow-y-auto pr-1">
                {securityMetrics.recentSecurityAlerts.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">Nenhum evento registrado ainda.</p>
                ) : (
                  securityMetrics.recentSecurityAlerts.map(alert => (
                    <div 
                      key={alert.id}
                      className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 text-xs space-y-1 bg-slate-50/50 dark:bg-slate-800/30"
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          alert.severity === 'ALERT'
                            ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20'
                            : alert.severity === 'WARN'
                            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                            : 'bg-teal-500/10 text-teal-700 dark:text-teal-400 border border-teal-500/20'
                        }`}>
                          {alert.severity}: {alert.action}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(alert.timestamp).toLocaleTimeString('pt-BR')}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-700 dark:text-slate-300">{alert.detail}</p>
                      <p className="text-[10px] text-slate-400 font-mono">IP: {alert.ipAddress}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
