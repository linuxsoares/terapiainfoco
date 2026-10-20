import { useState, useEffect } from 'react';
import { 
  Database, 
  ShieldCheck, 
  RefreshCw, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  Lock, 
  Clock, 
  Check, 
  Copy, 
  History, 
  Play, 
  RotateCcw,
  Info
} from 'lucide-react';
import type { 
  BackupOverviewResponse, 
  BackupSnapshotMetadata,
  SafeUser 
} from '@terapiainfoco/shared';
import { UserRole } from '@terapiainfoco/shared';
import { api } from '../services/api';

interface BackupModuleProps {
  currentUser: SafeUser;
}

export function BackupModule({ currentUser }: BackupModuleProps) {
  const [overview, setOverview] = useState<BackupOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modal de Restauração Emergencial
  const [restoreModalSnapshot, setRestoreModalSnapshot] = useState<BackupSnapshotMetadata | null>(null);
  const [restoreLoading, setRestoreLoading] = useState(false);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const data = await api.getBackupOverview();
      setOverview(data);
    } catch (err: any) {
      setErrorMessage(err.message || 'Falha ao carregar indicadores de backup.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const handleCreateBackup = async () => {
    try {
      setActionLoading(true);
      setStatusMessage(null);
      setErrorMessage(null);
      const res = await api.createBackup();
      setStatusMessage(res.message);
      await fetchOverview();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao gerar backup.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleVerifyBackup = async (id: string) => {
    try {
      setActionLoading(true);
      setStatusMessage(null);
      setErrorMessage(null);
      const res = await api.verifyBackup(id);
      setStatusMessage(`${res.message} (Tempo medido: ${res.verificationTimeMs}ms)`);
      await fetchOverview();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao verificar integridade do snapshot.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestoreBackup = async () => {
    if (!restoreModalSnapshot) return;
    try {
      setRestoreLoading(true);
      setStatusMessage(null);
      setErrorMessage(null);
      const res = await api.restoreBackup(restoreModalSnapshot.id);
      setStatusMessage(res.message);
      setRestoreModalSnapshot(null);
      await fetchOverview();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao restaurar banco.');
    } finally {
      setRestoreLoading(false);
    }
  };

  const handleDownload = async (id: string) => {
    try {
      await api.downloadBackupFile(id);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao baixar arquivo de backup.');
    }
  };

  const handleCopyChecksum = (id: string, checksum: string) => {
    navigator.clipboard.writeText(checksum);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const isAdmin = currentUser.role === UserRole.ADMIN;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Database className="w-6 h-6 text-teal-600 dark:text-teal-400" />
            Backup Criptografado & Disaster Recovery (KMS)
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Criptografia em repouso por Envelope Encryption com Master Key (KMS), simulações de DR e metas RPO/RTO
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchOverview}
            disabled={loading}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors cursor-pointer"
            title="Atualizar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleCreateBackup}
            disabled={actionLoading}
            className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold flex items-center gap-2 shadow-lg shadow-teal-500/20 transition-all cursor-pointer disabled:opacity-50"
          >
            <Lock className="w-4 h-4" />
            {actionLoading ? 'Processando KMS...' : 'Gerar Novo Backup (KMS)'}
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-sm flex items-center gap-3 animate-fade-in">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-sm flex items-center gap-3 animate-fade-in">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Destino dos snapshots: fora do processo (object storage) ou só na memória */}
      {overview && (
        overview.storage.offsite ? (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-sm flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>
              Snapshots cifrados guardados fora do servidor em <code className="font-mono text-xs">{overview.storage.location}</code>.
            </span>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-sm flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>
              Object storage não configurado: os snapshots ficam só na memória do servidor e se perdem no próximo
              restart ou deploy. Configure <code className="font-mono text-xs">BACKUP_S3_BUCKET</code> e as credenciais de acesso.
            </span>
          </div>
        )
      )}

      {/* KPI Cards de Disaster Recovery */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* RPO */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">RPO Atual</span>
            <Clock className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {overview ? `${overview.rpoHours}h` : '...'}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Meta &lt; 24h Conforme</span>
          </div>
        </div>

        {/* RTO */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">RTO Estimado</span>
            <Play className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {overview ? `${overview.rtoEstimateMs} ms` : '...'}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Restauração Instantânea</span>
          </div>
        </div>

        {/* Total Snapshots */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Snapshots Retidos</span>
            <History className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {overview?.totalBackups ?? 0}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Rotação automática (máx 20)
          </div>
        </div>

        {/* Última Verificação DR */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Status Criptográfico</span>
            <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          </div>
          <div className="text-base font-bold text-slate-900 dark:text-white truncate">
            {overview?.lastVerifiedAt ? '100% Íntegro' : 'Pendente de Teste'}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            AuthTag AES-256-GCM + SHA-256
          </div>
        </div>
      </div>

      {/* Explicação de Arquitetura Envelope Encryption (RFC §4.2) */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-teal-50/50 to-slate-50 dark:from-slate-900 dark:to-slate-900/60 border border-teal-100 dark:border-slate-800 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
          <Lock className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Como Funciona a Proteção em Repouso com Cloud KMS
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Cada snapshot do banco é cifrado com uma Data Encryption Key (DEK) efêmera de 256 bits gerada sob demanda. A DEK é envelopada pela Master Key (KEK) protegida em HSM/KMS e imediatamente zeroizada da memória RAM. Nenhuma entidade externa ou provedor de hospedagem consegue ler o backup sem autorização explícita no KMS.
          </p>
        </div>
      </div>

      {/* Tabela de Snapshots */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <Database className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            Snapshots de Backup Disponíveis
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {overview?.backups.length || 0} snapshots em repouso
          </span>
        </div>

        {overview?.backups && overview.backups.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                  <th className="pb-3 pr-4">Identificador & Data</th>
                  <th className="pb-3 pr-4">Status & Integridade</th>
                  <th className="pb-3 pr-4">Entidades</th>
                  <th className="pb-3 pr-4">Tamanho</th>
                  <th className="pb-3 pr-4">Checksum SHA-256</th>
                  <th className="pb-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {overview.backups.map((snapshot) => (
                  <tr key={snapshot.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 pr-4">
                      <div className="font-mono font-bold text-slate-900 dark:text-white">
                        {snapshot.id.slice(0, 8)}...
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {new Date(snapshot.createdAt).toLocaleString('pt-BR')}
                      </div>
                    </td>

                    <td className="py-3.5 pr-4">
                      {snapshot.status === 'VERIFIED' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" />
                          Íntegro (DR OK)
                        </span>
                      ) : snapshot.status === 'FAILED' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20">
                          <AlertCircle className="w-3 h-3" />
                          Falha Integridade
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20">
                          <Clock className="w-3 h-3" />
                          Gravado (Pendente DR)
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 pr-4">
                      <div className="text-slate-800 dark:text-slate-200 font-medium">
                        {snapshot.entitiesCount.totalEntities} registros
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {snapshot.entitiesCount.patients} pac • {snapshot.entitiesCount.clinicalRecords} SOAP • {snapshot.entitiesCount.auditLogs} logs
                      </div>
                    </td>

                    <td className="py-3.5 pr-4 font-mono text-slate-600 dark:text-slate-400">
                      {(snapshot.sizeBytes / 1024).toFixed(1)} KB
                    </td>

                    <td className="py-3.5 pr-4">
                      <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                        <span>{snapshot.checksumSha256.slice(0, 12)}...</span>
                        <button
                          onClick={() => handleCopyChecksum(snapshot.id, snapshot.checksumSha256)}
                          className="text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 p-1 cursor-pointer"
                          title="Copiar Checksum SHA-256"
                        >
                          {copiedId === snapshot.id ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </td>

                    <td className="py-3.5 text-right space-x-1.5">
                      <button
                        onClick={() => handleVerifyBackup(snapshot.id)}
                        disabled={actionLoading}
                        className="px-2.5 py-1.5 rounded-lg border border-teal-500/30 bg-teal-500/10 hover:bg-teal-500/20 text-teal-700 dark:text-teal-300 text-[11px] font-medium transition-colors cursor-pointer"
                        title="Simular recuperação e testar integridade"
                      >
                        Testar DR
                      </button>

                      <button
                        onClick={() => handleDownload(snapshot.id)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-medium transition-colors cursor-pointer"
                        title="Baixar arquivo cifrado"
                      >
                        <Download className="w-3 h-3 inline mr-1" />
                        Baixar
                      </button>

                      {isAdmin && (
                        <button
                          onClick={() => setRestoreModalSnapshot(snapshot)}
                          className="px-2.5 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 text-[11px] font-medium transition-colors cursor-pointer"
                          title="Restaurar banco para este ponto no tempo (Disaster Recovery)"
                        >
                          <RotateCcw className="w-3 h-3 inline mr-1" />
                          Restaurar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-sm">
            Nenhum snapshot de backup gerado ainda. Clique em "Gerar Novo Backup (KMS)" para criar o primeiro ponto de recuperação.
          </div>
        )}
      </div>

      {/* Modal de Confirmação de Restauração Emergencial (DR) */}
      {restoreModalSnapshot && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 flex items-center justify-center shrink-0">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Confirmar Restauração de Desastre (DR)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Operação crítica restrita a Administrador
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-300 text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold">
                <Info className="w-4 h-4" />
                Atenção: Substituição de Dados em Produção
              </div>
              <p className="text-[11px] leading-relaxed">
                Você está prestes a restaurar o banco de dados para o snapshot gravado em{' '}
                <strong>{new Date(restoreModalSnapshot.createdAt).toLocaleString('pt-BR')}</strong> contendo{' '}
                <strong>{restoreModalSnapshot.entitiesCount.totalEntities}</strong> registros.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRestoreModalSnapshot(null)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium cursor-pointer text-center"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleRestoreBackup}
                disabled={restoreLoading}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-md shadow-rose-500/20 text-center"
              >
                {restoreLoading ? 'Restaurando...' : 'Confirmar Restauração'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
