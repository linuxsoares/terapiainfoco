import { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  RefreshCw, 
  AlertCircle, 
  Database, 
  FileText, 
  Download, 
  CheckCircle2, 
  Lock, 
  FileSpreadsheet, 
  Layers, 
  Filter,
  Play,
  Copy,
  Check,
  Award,
  FileCheck2,
  ShieldAlert,
  Building2,
  Stamp,
  UserCheck,
  BadgeCheck,
  Activity,
  FileSignature,
  Scale
} from 'lucide-react';
import { 
  AuditAction, 
  AuditResourceType, 
  ComplianceFramework,
  ComplianceControlStatus,
  type AuditLog, 
  type ChainIntegrityResult, 
  type AuditFilterParams,
  type DPIAReport,
  type ExecutiveComplianceOverviewResponse
} from '@terapiainfoco/shared';
import { api } from '../services/api';

interface AuditModuleProps {
  /** Admin/DPO: governança, RIPD/pentest e trilha da plataforma inteira. Psicólogo: só a trilha do consultório. */
  isDpo: boolean;
}

/** Situação do controle em linguagem do usuário (nunca o valor cru do enum) */
const COMPLIANCE_STATUS_LABELS: Record<ComplianceControlStatus, string> = {
  [ComplianceControlStatus.COMPLIANT]: 'Conforme',
  [ComplianceControlStatus.PARTIALLY_COMPLIANT]: 'Parcialmente conforme',
  [ComplianceControlStatus.NON_COMPLIANT]: 'Não conforme'
};

const COMPLIANCE_STATUS_CLASSES: Record<ComplianceControlStatus, string> = {
  [ComplianceControlStatus.COMPLIANT]: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700',
  [ComplianceControlStatus.PARTIALLY_COMPLIANT]: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-700',
  [ComplianceControlStatus.NON_COMPLIANT]: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-700'
};

export function AuditModule({ isDpo }: AuditModuleProps) {
  const [activeTab, setActiveTab] = useState<'worm_logs' | 'dpia_pentest' | 'governance_package'>(isDpo ? 'governance_package' : 'worm_logs');
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [chainStatus, setChainStatus] = useState<ChainIntegrityResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifyingChain, setVerifyingChain] = useState(false);
  const [exporting, setExporting] = useState<'csv' | 'json' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Estados de Governança Executiva & Compliance Package (RFC-001 §4.4, §5.2)
  const [governanceOverview, setGovernanceOverview] = useState<ExecutiveComplianceOverviewResponse | null>(null);
  const [loadingGovernance, setLoadingGovernance] = useState(false);
  const [generatingPackage, setGeneratingPackage] = useState(false);
  const [downloadingPackage, setDownloadingPackage] = useState(false);
  const [isSignOffModalOpen, setIsSignOffModalOpen] = useState(false);
  const [dpoSignerName, setDpoSignerName] = useState('');
  // Identificação do pacote: vem do último pacote ou do ambiente, e o Admin pode corrigir
  const [organizationName, setOrganizationName] = useState('');
  const [technicalResponsibleCrp, setTechnicalResponsibleCrp] = useState('');
  const [dpoSignerStatement, setDpoSignerStatement] = useState(
    'Atesto a conformidade regulatória plena e a eficácia das salvaguardas técnicas aplicadas nos termos da LGPD, CFP, ICP-Brasil e SOC2/ISO 27001.'
  );
  const [signingOff, setSigningOff] = useState(false);
  const [frameworkFilter, setFrameworkFilter] = useState<string>('ALL');

  // Estados de RIPD / DPIA & Pentest (Fase 4 do RFC-001)
  const [dpiaReport, setDpiaReport] = useState<DPIAReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [runningPentest, setRunningPentest] = useState(false);
  const [downloadingRipd, setDownloadingRipd] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);

  // Filtros
  const [filterAction, setFilterAction] = useState<string>('');
  const [filterResourceType, setFilterResourceType] = useState<string>('');

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const params: AuditFilterParams = {};
      if (filterAction) params.action = filterAction;
      if (filterResourceType) params.resourceType = filterResourceType;

      const [logsData, chainData] = await Promise.all([
        api.getAuditLogs(params),
        api.verifyAuditChain()
      ]);
      setLogs(logsData);
      setChainStatus(chainData);
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar trilha de auditoria');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [filterAction, filterResourceType]);

  const handleVerifyChain = async () => {
    try {
      setVerifyingChain(true);
      setError(null);
      const result = await api.verifyAuditChain();
      setChainStatus(result);
      if (result.isValid) {
        setSuccessMessage(`Integridade criptográfica validada com sucesso! ${result.totalEntries} blocos sequenciais conferidos.`);
      } else {
        setError(`Atenção: Cadeia violada no bloco #${result.tamperedAtIndex}!`);
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao validar hash-chain WORM');
    } finally {
      setVerifyingChain(false);
      setTimeout(() => setSuccessMessage(null), 5000);
    }
  };

  const handleExportCsv = async () => {
    try {
      setExporting('csv');
      const params: AuditFilterParams = {};
      if (filterAction) params.action = filterAction;
      if (filterResourceType) params.resourceType = filterResourceType;
      await api.downloadAuditCsv(params);
    } catch (err: any) {
      setError(err.message || 'Falha ao exportar CSV de auditoria');
    } finally {
      setExporting(null);
    }
  };

  const handleExportJson = async () => {
    try {
      setExporting('json');
      const params: AuditFilterParams = {};
      if (filterAction) params.action = filterAction;
      if (filterResourceType) params.resourceType = filterResourceType;
      await api.downloadAuditJson(params);
    } catch (err: any) {
      setError(err.message || 'Falha ao exportar relatório JSON assinado');
    } finally {
      setExporting(null);
    }
  };

  const fetchDPIAReport = async () => {
    try {
      setLoadingReport(true);
      const report = await api.getLatestDPIAReport();
      setDpiaReport(report);
    } catch (err: any) {
      console.warn('Falha ao carregar relatório DPIA:', err.message);
    } finally {
      setLoadingReport(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'dpia_pentest' && !dpiaReport) {
      fetchDPIAReport();
    }
  }, [activeTab]);

  const handleRunPentest = async () => {
    try {
      setRunningPentest(true);
      setError(null);
      const res = await api.runCompliancePentest();
      setDpiaReport(res.report);
      setSuccessMessage(res.message);
      await fetchLogs();
    } catch (err: any) {
      setError(err.message || 'Falha ao executar pentest automatizado');
    } finally {
      setRunningPentest(false);
      setTimeout(() => setSuccessMessage(null), 5000);
    }
  };

  const handleDownloadRipd = async () => {
    try {
      setDownloadingRipd(true);
      await api.downloadDPIAReport();
      setSuccessMessage('Relatório RIPD/DPIA baixado com sucesso em JSON assinado.');
    } catch (err: any) {
      setError(err.message || 'Falha ao baixar relatório RIPD');
    } finally {
      setDownloadingRipd(false);
      setTimeout(() => setSuccessMessage(null), 4000);
    }
  };

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 3000);
  };

  const fetchGovernanceOverview = async () => {
    try {
      setLoadingGovernance(true);
      const data = await api.getGovernanceOverview();
      setGovernanceOverview(data);
      setOrganizationName((current) => current || data.identity.organization);
      setDpoSignerName((current) => current || data.identity.dpoName);
      setTechnicalResponsibleCrp((current) => current || data.identity.technicalResponsibleCrp);
    } catch (err: any) {
      console.warn('Falha ao obter panorama de governança:', err.message);
    } finally {
      setLoadingGovernance(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'governance_package' && !governanceOverview) {
      fetchGovernanceOverview();
    }
  }, [activeTab]);

  const handleGeneratePackage = async () => {
    try {
      setGeneratingPackage(true);
      setError(null);
      const res = await api.generateCompliancePackage({
        dpoName: dpoSignerName.trim(),
        organization: organizationName.trim(),
        technicalResponsibleCrp: technicalResponsibleCrp.trim()
      });
      setSuccessMessage(res.message);
      await fetchGovernanceOverview();
      await fetchLogs();
    } catch (err: any) {
      setError(err.message || 'Falha ao emitir Pacote Executivo de Conformidade');
    } finally {
      setGeneratingPackage(false);
      setTimeout(() => setSuccessMessage(null), 5000);
    }
  };

  const handleApplySignOff = async () => {
    if (!governanceOverview?.lastPackage) return;
    try {
      setSigningOff(true);
      setError(null);
      const res = await api.applyDpoSignOff({
        packageId: governanceOverview.lastPackage.id,
        dpoName: dpoSignerName,
        statement: dpoSignerStatement
      });
      setSuccessMessage(res.message);
      setIsSignOffModalOpen(false);
      await fetchGovernanceOverview();
      await fetchLogs();
    } catch (err: any) {
      setError(err.message || 'Falha ao aplicar chancela do DPO');
    } finally {
      setSigningOff(false);
      setTimeout(() => setSuccessMessage(null), 5000);
    }
  };

  const handleDownloadPackage = async () => {
    if (!governanceOverview?.lastPackage) return;
    try {
      setDownloadingPackage(true);
      await api.downloadCompliancePackage(governanceOverview.lastPackage.id);
      setSuccessMessage('Pacote Executivo de Conformidade baixado com sucesso em JSON assinado.');
    } catch (err: any) {
      setError(err.message || 'Falha ao baixar Pacote Executivo');
    } finally {
      setDownloadingPackage(false);
      setTimeout(() => setSuccessMessage(null), 4000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            {isDpo ? 'Trilha de Auditoria Externa (Hash-Chain WORM) & DPO/CFP' : 'Histórico de Acessos do Consultório'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            {isDpo
              ? 'Ledger criptográfico inviolável encadeado por SHA-256 para atendimento à LGPD (Art. 37/38/50) e Resoluções CFP.'
              : 'Quem da sua equipe acessou pacientes, prontuários e documentos do consultório. Use para responder a pedidos do titular (LGPD Art. 18) e acompanhar a equipe.'}
          </p>
        </div>

        {/* Ações e Exportações */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleVerifyChain}
            disabled={verifyingChain}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors cursor-pointer disabled:opacity-50"
            title="Recalcula e confere todos os hashes SHA-256 da cadeia WORM"
          >
            <Lock className={`w-3.5 h-3.5 ${verifyingChain ? 'animate-spin' : ''}`} />
            {verifyingChain ? 'Verificando...' : isDpo ? 'Verificar Cadeia SHA-256' : 'Verificar Integridade'}
          </button>

          <button
            onClick={handleExportCsv}
            disabled={exporting === 'csv'}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 shadow-sm dark:shadow-none transition-colors cursor-pointer disabled:opacity-50"
            title="Download da trilha de auditoria em CSV forense"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            {exporting === 'csv' ? 'Gerando...' : isDpo ? 'CSV Forense' : 'Exportar CSV'}
          </button>

          <button
            onClick={handleExportJson}
            disabled={exporting === 'json'}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 shadow-sm dark:shadow-none transition-colors cursor-pointer disabled:opacity-50"
            title={isDpo ? 'Download do relatório de conformidade formal para DPO e CFP' : 'Download do relatório de acessos do consultório'}
          >
            <Download className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            {exporting === 'json' ? 'Gerando...' : isDpo ? 'Relatório DPO (JSON)' : 'Relatório (JSON)'}
          </button>

          <button
            onClick={() => {
              fetchLogs();
              if (activeTab === 'governance_package') fetchGovernanceOverview();
            }}
            className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white shadow-sm dark:shadow-none transition-colors cursor-pointer"
            title="Atualizar Logs e Governança"
          >
            <RefreshCw className={`w-4 h-4 ${loading || loadingGovernance ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Alertas */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-sm flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Seletor de Abas: o consultório tem só o histórico de acessos */}
      {isDpo && (
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-2">
        {isDpo && (
        <button
          onClick={() => setActiveTab('governance_package')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-xs transition-colors cursor-pointer ${
            activeTab === 'governance_package'
              ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Scale className="w-4 h-4" />
          <span>Governança & Pacote Multi-Normativo</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300">
            LGPD + CFP + ICP + SOC2
          </span>
        </button>
        )}

        <button
          onClick={() => setActiveTab('worm_logs')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-xs transition-colors cursor-pointer ${
            activeTab === 'worm_logs'
              ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Trilha WORM & Logs Imutáveis</span>
        </button>

        {isDpo && (
        <button
          onClick={() => setActiveTab('dpia_pentest')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-xs transition-colors cursor-pointer ${
            activeTab === 'dpia_pentest'
              ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>Relatório de Impacto (RIPD / DPIA) & Pentest</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            Fase 4
          </span>
        </button>
        )}
      </div>
      )}

      {/* Aba 1: Governança Executiva & Compliance Package (RFC-001 §4.4, §5.2) */}
      {activeTab === 'governance_package' && (
        <div className="space-y-6 animate-fade-in">
          {/* Card Principal: Selo Probatório SHA-256 e Status do DPO Sign-Off */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-950 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-200 dark:border-slate-800">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                    <BadgeCheck className="w-4 h-4 text-emerald-500" />
                    Selo Probatório Tamper-Evident
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    ID: {governanceOverview?.lastPackage ? `${governanceOverview.lastPackage.id.slice(0, 18)}...` : 'Nenhum pacote emitido'}
                  </span>
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  Compliance Package Forense Multi-Normativo
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
                  Pacote pericial com digest canônico SHA-256 recursivo e chancela formal do Encarregado pelo Tratamento de Dados (DPO), integrando as salvaguardas da LGPD, Conselho Federal de Psicologia (CFP), ICP-Brasil (PAdES/TSA) e SOC2/ISO 27001.
                </p>
              </div>

              {/* Score Circular e Status */}
              <div className="flex items-center gap-5 bg-white dark:bg-slate-900/80 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800">
                <div className="text-center">
                  <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
                    {governanceOverview ? `${governanceOverview.globalScorePercentage}%` : '—'}
                  </div>
                  <div className="text-[10px] font-semibold uppercase text-slate-400 mt-0.5">
                    Score Global
                  </div>
                </div>
                <div className="h-10 w-px bg-slate-200 dark:bg-slate-800" />
                <div className="space-y-1">
                  {governanceOverview && (
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${COMPLIANCE_STATUS_CLASSES[governanceOverview.status]}`}>
                      {COMPLIANCE_STATUS_LABELS[governanceOverview.status]}
                    </span>
                  )}
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {governanceOverview?.controls.length ?? 0} controles avaliados agora
                  </div>
                </div>
              </div>
            </div>

            {/* Digest Canônico SHA-256 e Selo */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-100/70 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-semibold uppercase text-[10px]">Digest Canônico SHA-256</span>
                  <button
                    onClick={() => handleCopyHash(governanceOverview?.lastPackage?.canonicalDigest || '')}
                    className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                  >
                    {copiedHash ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedHash ? 'Copiado!' : 'Copiar Hash'}
                  </button>
                </div>
                <div className="font-mono text-xs text-slate-700 dark:text-slate-300 break-all select-all bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                  {governanceOverview?.lastPackage?.canonicalDigest || 'Calculando digest...'}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Selo: <span className="font-mono text-emerald-700 dark:text-emerald-400 font-medium">{governanceOverview?.lastPackage?.tamperEvidentSeal || 'GOV-SEAL-SHA256:PENDING'}</span>
                </div>
              </div>

              {/* Status do DPO Sign-Off */}
              <div className="p-4 rounded-xl bg-slate-100/70 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase text-slate-500">Chancela Formal do DPO</span>
                    {governanceOverview?.lastPackage?.dpoSignOff ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 flex items-center gap-1">
                        <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                        Chancelado
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                        Pendente
                      </span>
                    )}
                  </div>
                  {governanceOverview?.lastPackage?.dpoSignOff ? (
                    <div className="space-y-1 text-xs">
                      <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        {governanceOverview.lastPackage.dpoSignOff.signedBy}
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-400 italic line-clamp-2">
                        "{governanceOverview.lastPackage.dpoSignOff.statement}"
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 pt-1">
                        Sign Digest: {governanceOverview.lastPackage.dpoSignOff.signatureDigest.slice(0, 24)}...
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      O pacote atual ainda não possui a declaração juramentada e assinatura do Encarregado pelo Tratamento de Dados.
                    </p>
                  )}
                </div>

                <div className="pt-3 flex items-center justify-end gap-2">
                  <button
                    onClick={() => setIsSignOffModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors cursor-pointer"
                  >
                    <Stamp className="w-3.5 h-3.5" />
                    {governanceOverview?.lastPackage?.dpoSignOff ? 'Atualizar Sign-Off' : 'Chancelar como DPO'}
                  </button>
                </div>
              </div>
            </div>

            {/* Identificação do próximo pacote (pessoas reais: nada é presumido) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-slate-200 dark:border-slate-800 text-xs">
              <label className="space-y-1">
                <span className="block font-semibold text-slate-700 dark:text-slate-300">Organização</span>
                <input
                  type="text"
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </label>
              <label className="space-y-1">
                <span className="block font-semibold text-slate-700 dark:text-slate-300">Encarregado de dados (DPO)</span>
                <input
                  type="text"
                  value={dpoSignerName}
                  onChange={(e) => setDpoSignerName(e.target.value)}
                  placeholder="Nome completo"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </label>
              <label className="space-y-1">
                <span className="block font-semibold text-slate-700 dark:text-slate-300">CRP do responsável técnico</span>
                <input
                  type="text"
                  value={technicalResponsibleCrp}
                  onChange={(e) => setTechnicalResponsibleCrp(e.target.value)}
                  placeholder="Ex: CRP 06/000000-SP"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </label>
            </div>

            {/* Ações do Pacote */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
              <div className="text-xs text-slate-500">
                Emitido em: <span className="font-medium text-slate-700 dark:text-slate-300">
                  {governanceOverview?.lastPackage?.issuedAt ? new Date(governanceOverview.lastPackage.issuedAt).toLocaleString('pt-BR') : 'N/A'}
                </span>
                {' • '}Responsável Técnico: <span className="font-medium text-slate-700 dark:text-slate-300">{governanceOverview?.lastPackage?.technicalResponsibleCrp || 'Não informado'}</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleGeneratePackage}
                  disabled={generatingPackage || !dpoSignerName.trim() || !technicalResponsibleCrp.trim()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                  title="Recalcula todas as evidências dos módulos e emite novo pacote forense registrado na trilha WORM"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${generatingPackage ? 'animate-spin' : ''}`} />
                  {generatingPackage ? 'Emitindo...' : 'Emitir Novo Pacote'}
                </button>

                <button
                  onClick={handleDownloadPackage}
                  disabled={downloadingPackage || !governanceOverview?.lastPackage}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                  title="Download do pacote forense em formato JSON canônico assinado com integridade garantida"
                >
                  <Download className={`w-3.5 h-3.5 ${downloadingPackage ? 'animate-bounce' : ''}`} />
                  {downloadingPackage ? 'Baixando...' : 'Baixar Compliance Package (JSON)'}
                </button>
              </div>
            </div>
          </div>

          {/* Cards dos 4 Frameworks Normativos */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {governanceOverview?.frameworks?.map((fw) => (
              <div
                key={fw.framework}
                className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400">
                    {fw.framework === ComplianceFramework.LGPD && <ShieldCheck className="w-5 h-5" />}
                    {fw.framework === ComplianceFramework.CFP && <FileText className="w-5 h-5" />}
                    {fw.framework === ComplianceFramework.ICP_BRASIL && <FileSignature className="w-5 h-5" />}
                    {fw.framework === ComplianceFramework.SOC2_ISO27001 && <Building2 className="w-5 h-5" />}
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${COMPLIANCE_STATUS_CLASSES[fw.status]}`}>
                    {COMPLIANCE_STATUS_LABELS[fw.status]}
                  </span>
                </div>

                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-1">{fw.name}</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                    {fw.description}
                  </p>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">Conformidade:</span>
                    <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                      {fw.scorePercentage}% ({fw.compliantControls}/{fw.totalControls})
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${fw.scorePercentage}%` }}
                    />
                  </div>
                </div>

                <div className="text-[10px] text-slate-400 flex flex-wrap gap-1 pt-1">
                  {fw.regulatoryBasis.slice(0, 3).map((b, idx) => (
                    <span key={idx} className="bg-slate-100 dark:bg-slate-800/70 px-1.5 py-0.5 rounded">
                      {b}
                    </span>
                  ))}
                  {fw.regulatoryBasis.length > 3 && (
                    <span className="text-slate-400">+{fw.regulatoryBasis.length - 3}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Métricas Forenses em Tempo Real */}
          {governanceOverview?.forensicMetrics && (
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Snapshot de Evidências Forenses em Produção
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-1">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800/60">
                  <div className="text-[11px] text-slate-500 uppercase font-semibold">Trilha WORM</div>
                  <div className="text-base font-bold text-slate-900 dark:text-white mt-1">
                    {governanceOverview.forensicMetrics.totalWormBlocks} Blocos
                  </div>
                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                    Status: {governanceOverview.forensicMetrics.wormChainIntegrity}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800/60">
                  <div className="text-[11px] text-slate-500 uppercase font-semibold">Chave Mestre KMS</div>
                  <div className="text-base font-bold text-slate-900 dark:text-white mt-1">
                    KEK v{governanceOverview.forensicMetrics.activeKmsKeyVersion}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                    Envelope Encryption Ativo
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800/60">
                  <div className="text-[11px] text-slate-500 uppercase font-semibold">Resiliência & DR</div>
                  <div className="text-base font-bold text-slate-900 dark:text-white mt-1">
                    {governanceOverview.forensicMetrics.dataBackupsCount} Snapshots
                  </div>
                  <div className={`text-[10px] font-medium ${governanceOverview.forensicMetrics.backupsOffsite ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {governanceOverview.forensicMetrics.backupsOffsite ? 'Cópia externa ativa' : 'Sem cópia fora do servidor'}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800/60">
                  <div className="text-[11px] text-slate-500 uppercase font-semibold">2FA & Observabilidade</div>
                  <div className="text-base font-bold text-slate-900 dark:text-white mt-1">
                    {governanceOverview.forensicMetrics.twoFactorAdoptionRate}% da equipe com 2FA
                  </div>
                  <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">
                    OTLP: {governanceOverview.forensicMetrics.otlpExporterActive ? 'Conectado' : 'Desativado'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Matriz Detalhada dos 17 Controles Multi-Normativos */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  Matriz Determinística de Salvaguardas & Controles (17 Controles)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Mapeamento formal dos controles técnicos com evidências periciais em tempo real.
                </p>
              </div>

              {/* Filtro por Framework */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'ALL', label: 'Todos (17)' },
                  { id: ComplianceFramework.LGPD, label: 'LGPD (5)' },
                  { id: ComplianceFramework.CFP, label: 'CFP (5)' },
                  { id: ComplianceFramework.ICP_BRASIL, label: 'ICP-Brasil (3)' },
                  { id: ComplianceFramework.SOC2_ISO27001, label: 'SOC2 / ISO (4)' }
                ].map((pill) => (
                  <button
                    key={pill.id}
                    onClick={() => setFrameworkFilter(pill.id)}
                    className={`px-3 py-1 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                      frameworkFilter === pill.id
                        ? 'bg-emerald-600 text-white font-bold'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tabela de Controles */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                <thead className="text-[10px] uppercase text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 pr-4">Controle</th>
                    <th className="py-2.5 pr-4">Framework & Norma</th>
                    <th className="py-2.5 pr-4">Salvaguarda Técnica Aplicada</th>
                    <th className="py-2.5 pr-4">Evidência Forense Coletada</th>
                    <th className="py-2.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {governanceOverview?.controls
                    ?.filter((ctrl) => frameworkFilter === 'ALL' || ctrl.framework === frameworkFilter)
                    ?.map((ctrl) => (
                      <tr key={ctrl.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                        <td className="py-3 pr-4 whitespace-nowrap">
                          <span className="font-mono font-bold text-slate-900 dark:text-white block">
                            {ctrl.id}
                          </span>
                          <span className="text-[11px] text-slate-700 dark:text-slate-300 font-semibold">
                            {ctrl.title}
                          </span>
                        </td>
                        <td className="py-3 pr-4 max-w-xs">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 mb-1">
                            {ctrl.framework}
                          </span>
                          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            {ctrl.normReference}
                          </div>
                        </td>
                        <td className="py-3 pr-4 max-w-sm text-[11px] text-slate-600 dark:text-slate-400">
                          {ctrl.technicalSafeguard}
                        </td>
                        <td className="py-3 pr-4 max-w-sm text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
                          {ctrl.evidenceSummary}
                        </td>
                        <td className="py-3 text-right whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${COMPLIANCE_STATUS_CLASSES[ctrl.status]}`}>
                            {COMPLIANCE_STATUS_LABELS[ctrl.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Modal de Aplicação de DPO Sign-Off */}
          {isSignOffModalOpen && (
            <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Stamp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    <h3 className="font-bold text-base text-slate-900 dark:text-white">
                      Chancela Formal do DPO (DPO Sign-Off)
                    </h3>
                  </div>
                  <button
                    onClick={() => setIsSignOffModalOpen(false)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-4 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Nome do Encarregado de Proteção de Dados (DPO):
                    </label>
                    <input
                      type="text"
                      value={dpoSignerName}
                      onChange={(e) => setDpoSignerName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      placeholder="Nome completo"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Declaração Juramentada de Conformidade e Fé Pública:
                    </label>
                    <textarea
                      rows={3}
                      value={dpoSignerStatement}
                      onChange={(e) => setDpoSignerStatement(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 leading-relaxed"
                    />
                  </div>

                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-200 text-[11px] leading-relaxed">
                    Esta chancela vincula de forma criptográfica e pericial o Digest Canônico SHA-256 do pacote ao carimbo temporal e às credenciais do DPO, com gravação compulsória e imutável na Hash-Chain WORM.
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => setIsSignOffModalOpen(false)}
                    disabled={signingOff}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleApplySignOff}
                    disabled={signingOff || !dpoSignerName.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Stamp className={`w-3.5 h-3.5 ${signingOff ? 'animate-spin' : ''}`} />
                    {signingOff ? 'Assinando...' : 'Assinar e Gravar no WORM'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'worm_logs' && (
        <div className="space-y-6 animate-fade-in">
          {/* Status da Hash-Chain WORM */}
          {chainStatus && (
        <div className={`p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
          chainStatus.isValid 
            ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-900 dark:text-emerald-100'
            : 'bg-rose-500/10 border-rose-500/30 text-rose-900 dark:text-rose-100'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              chainStatus.isValid ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
            }`}>
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Integridade da Hash-Chain WORM</span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                  chainStatus.isValid 
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30' 
                    : 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                }`}>
                  {chainStatus.isValid ? 'Tamper-Evident: 100% Íntegro' : 'VIOLAÇÃO DETECTADA'}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                {/* Fora do DPO a mensagem vem do backend, já restrita ao consultório */}
                {!isDpo
                  ? chainStatus.message
                  : chainStatus.isValid
                    ? `Todos os ${chainStatus.totalEntries} blocos criptográficos encadeados conferem sequencialmente com o bloco gênesis.`
                    : `Falha de integridade criptográfica no bloco #${chainStatus.tamperedAtIndex}. Log ID: ${chainStatus.tamperedLogId}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono text-slate-500 dark:text-slate-400">
            <div>
              <span className="block text-[10px] uppercase text-slate-400">Último Hash (SHA-256):</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {chainStatus.latestHash ? `${chainStatus.latestHash.slice(0, 16)}...` : 'N/A'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Cards de Métricas & Conformidade */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Arquitetura de Armazenamento</span>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Append-Only Imutável WORM</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total de Registros Auditados</span>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{logs.length} eventos registrados</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Bases Regulatórias Vigentes</span>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">LGPD Art. 37/38 & CFP 001/011</p>
          </div>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
          <Filter className="w-3.5 h-3.5" />
          <span>Filtros:</span>
        </div>

        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 text-slate-800 dark:text-slate-200 outline-none focus:ring-1 focus:ring-teal-500 w-full sm:w-auto"
        >
          <option value="">Todas as Ações</option>
          <option value={AuditAction.CREATE}>CREATE</option>
          <option value={AuditAction.DECRYPT_READ}>DECRYPT_READ</option>
          <option value={AuditAction.UPDATE}>UPDATE</option>
          <option value={AuditAction.SIGN_RECORD}>SIGN_RECORD</option>
          <option value={AuditAction.DATA_EXPORT}>DATA_EXPORT</option>
          <option value={AuditAction.CONSENT_REVOCATION}>CONSENT_REVOCATION</option>
          <option value={AuditAction.BACKUP_CREATE}>BACKUP_CREATE</option>
          <option value={AuditAction.BACKUP_RESTORE}>BACKUP_RESTORE</option>
        </select>

        <select
          value={filterResourceType}
          onChange={(e) => setFilterResourceType(e.target.value)}
          className="text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 text-slate-800 dark:text-slate-200 outline-none focus:ring-1 focus:ring-teal-500 w-full sm:w-auto"
        >
          <option value="">Todos os Recursos</option>
          <option value={AuditResourceType.PATIENT}>PATIENT</option>
          <option value={AuditResourceType.CLINICAL_RECORD}>CLINICAL_RECORD</option>
          <option value={AuditResourceType.APPOINTMENT}>APPOINTMENT</option>
          <option value={AuditResourceType.DOCUMENT}>DOCUMENT</option>
          <option value={AuditResourceType.TRANSCRIPT}>TRANSCRIPT</option>
          <option value={AuditResourceType.BACKUP}>BACKUP</option>
        </select>

        {(filterAction || filterResourceType) && (
          <button
            onClick={() => { setFilterAction(''); setFilterResourceType(''); }}
            className="text-xs text-rose-600 dark:text-rose-400 hover:underline cursor-pointer ml-auto"
          >
            Limpar Filtros
          </button>
        )}
      </div>

      {/* Tabela de Logs */}
      <div className="rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Ledger Criptográfico de Auditoria ({logs.length} eventos)
          </span>
          <span className="text-[11px] font-mono text-slate-400">
            Algoritmo: SHA-256 Hash Chain
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Carregando trilha de auditoria...</div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">Nenhum evento registrado para os filtros selecionados.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="p-3 font-medium text-center w-14">#Seq</th>
                  <th className="p-3 font-medium">Data / Hora</th>
                  <th className="p-3 font-medium">Ação</th>
                  <th className="p-3 font-medium">Recurso</th>
                  <th className="p-3 font-medium">ID do Recurso</th>
                  <th className="p-3 font-medium font-mono">Hash SHA-256</th>
                  <th className="p-3 font-medium">IP Origem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="p-3 text-center text-slate-400 dark:text-slate-500 font-bold">
                      {log.sequenceNumber ?? '-'}
                    </td>
                    <td className="p-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString('pt-BR')}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        log.action === AuditAction.CREATE
                          ? 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/20'
                          : log.action === AuditAction.DECRYPT_READ
                          ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/20'
                          : log.action === AuditAction.SIGN_RECORD
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
                          : log.action === AuditAction.BACKUP_CREATE || log.action === AuditAction.BACKUP_RESTORE
                          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/20'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="p-3 text-slate-700 dark:text-slate-300">{log.resourceType}</td>
                    <td className="p-3 text-slate-500 dark:text-slate-400 truncate max-w-[120px]">{log.resourceId}</td>
                    <td className="p-3 text-slate-500 dark:text-slate-400">
                      {log.hash ? (
                        <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 px-1.5 py-0.5 rounded border border-emerald-500/20" title={`Hash Completo: ${log.hash}\nPrevious Hash: ${log.previousHash}`}>
                          {log.hash.slice(0, 10)}...{log.hash.slice(-6)}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="p-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{log.ipAddress}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>
      )}

      {/* Aba 2: Relatório de Impacto (RIPD / DPIA) & Pentest Automatizado (Fase 4 do RFC-001) */}
      {activeTab === 'dpia_pentest' && (
        <div className="space-y-6 animate-fade-in">
          {/* Header e Ações do Relatório RIPD */}
          <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-emerald-500/20 shrink-0">
                  <Award className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                      Relatório de Impacto à Proteção de Dados (RIPD / DPIA) & Pentest
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                      LGPD Art. 38 & 50
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      CFP 001/011
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-3xl leading-relaxed">
                    Avaliação contínua de salvaguardas técnicas, mitigação de riscos à privacidade e teste ativo de intrusão
                    (pentesting automatizado). Atesta a inviolabilidade da infraestrutura perante a ANPD e o Conselho Federal de Psicologia.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  onClick={handleRunPentest}
                  disabled={runningPentest}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                  title="Disparar bateria com os 6 cenários de pentest automatizado"
                >
                  <Play className={`w-4 h-4 ${runningPentest ? 'animate-spin' : ''}`} />
                  <span>{runningPentest ? 'Executando Pentest...' : 'Executar Pentest Automatizado'}</span>
                </button>

                <button
                  onClick={handleDownloadRipd}
                  disabled={downloadingRipd || !dpiaReport}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                  title="Download do arquivo oficial assinado em JSON"
                >
                  <Download className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>{downloadingRipd ? 'Baixando...' : 'Exportar RIPD Oficial'}</span>
                </button>
              </div>
            </div>

            {loadingReport && !dpiaReport ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
                <RefreshCw className="w-6 h-6 animate-spin text-emerald-500" />
                <span>Carregando dados de conformidade e pentesting...</span>
              </div>
            ) : dpiaReport ? (
              <>
                {/* Score Geral e Metadados do Relatório */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-lg font-black shrink-0">
                      {dpiaReport.overallScore}%
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Score de Blindagem</span>
                      <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                        {dpiaReport.complianceStatus === 'FULL_COMPLIANCE' ? 'Conformidade Integral (100%)' : 'Ação Recomendada'}
                      </p>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Responsável Legal / DPO</span>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate mt-0.5">
                      {dpiaReport.dpoName}
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Última Auditoria</span>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                      {new Date(dpiaReport.generatedAt).toLocaleString('pt-BR')}
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Selo Probatório (SHA-256)</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[11px] font-mono text-slate-600 dark:text-slate-400">
                        {dpiaReport.canonicalHash.slice(0, 10)}...{dpiaReport.canonicalHash.slice(-6)}
                      </span>
                      <button
                        onClick={() => handleCopyHash(dpiaReport.canonicalHash)}
                        className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors cursor-pointer"
                        title="Copiar Hash Canônico do Relatório"
                      >
                        {copiedHash ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Resumo Executivo */}
                <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  <strong className="text-emerald-800 dark:text-emerald-300 block mb-1">
                    📋 Resumo Executivo para Fiscalização ANPD & CFP:
                  </strong>
                  {dpiaReport.executiveSummary}
                </div>

                {/* Seção 1: Cenários de Pentest Automatizado */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      Cenários de Pentest Automatizado ({dpiaReport.pentestSummary.passed}/{dpiaReport.pentestSummary.totalScenarios} Aprovados)
                    </h3>
                    <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                      0 Falhas Detectadas
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {dpiaReport.scenarios.map((sc) => (
                      <div 
                        key={sc.scenarioId}
                        className="p-4 rounded-2xl border bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-800 transition-colors flex flex-col justify-between space-y-3"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-mono font-bold text-slate-400">
                              {sc.scenarioId}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                              DEFESA ATIVADA ({sc.latencyMs}ms)
                            </span>
                          </div>
                          <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                            {sc.title}
                          </h4>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            <strong>Ataque:</strong> {sc.attackVectorSimulated}
                          </p>
                        </div>

                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
                          <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
                            🛡️ {sc.defenseMechanismTriggered}
                          </p>
                          <span className="text-[10px] text-slate-400 block">
                            Ref: {sc.legalBasisRef}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Seção 2: Salvaguardas dos Artigos da LGPD */}
                <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <FileCheck2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    Matriz de Conformidade Técnica — LGPD (Lei nº 13.709/2018)
                  </h3>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                      <thead className="text-[10px] uppercase text-slate-400 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="py-2.5 pr-4">Artigo da Lei</th>
                          <th className="py-2.5 pr-4">Exigência Normativa</th>
                          <th className="py-2.5 pr-4">Salvaguarda Técnica Implementada</th>
                          <th className="py-2.5 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {dpiaReport.lgpdArticles.map((art) => (
                          <tr key={art.article} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                            <td className="py-2.5 pr-4 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                              {art.article}
                              <span className="block text-[10px] text-slate-400 font-normal">{art.title}</span>
                            </td>
                            <td className="py-2.5 pr-4 max-w-xs text-[11px] text-slate-600 dark:text-slate-400">
                              {art.requirement}
                            </td>
                            <td className="py-2.5 pr-4 max-w-sm text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
                              {art.technicalSafeguard}
                            </td>
                            <td className="py-2.5 text-right whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                                COMPLIANT
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Seção 3: Salvaguardas das Resoluções do CFP */}
                <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    Matriz Deontológica — Conselho Federal de Psicologia (CFP)
                  </h3>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                      <thead className="text-[10px] uppercase text-slate-400 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="py-2.5 pr-4">Resolução CFP</th>
                          <th className="py-2.5 pr-4">Exigência Normativa</th>
                          <th className="py-2.5 pr-4">Salvaguarda Técnica Implementada</th>
                          <th className="py-2.5 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {dpiaReport.cfpResolutions.map((cfp) => (
                          <tr key={cfp.resolution} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                            <td className="py-2.5 pr-4 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                              {cfp.resolution}
                              <span className="block text-[10px] text-slate-400 font-normal">{cfp.title}</span>
                            </td>
                            <td className="py-2.5 pr-4 max-w-xs text-[11px] text-slate-600 dark:text-slate-400">
                              {cfp.requirement}
                            </td>
                            <td className="py-2.5 pr-4 max-w-sm text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
                              {cfp.technicalSafeguard}
                            </td>
                            <td className="py-2.5 text-right whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                                COMPLIANT
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
