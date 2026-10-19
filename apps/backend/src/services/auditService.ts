import { createHash, randomUUID } from 'node:crypto';
import type { 
  AuditAction, 
  AuditResourceType, 
  AuditLog,
  AuditFilterParams,
  ChainIntegrityResult,
  ComplianceReportResponse
} from '@terapiainfoco/shared';
import { db } from '../db/memoryDb';

const GENESIS_HASH = '0'.repeat(64);

export class AuditService {
  /**
   * Computa o hash criptográfico SHA-256 canônico de um bloco da trilha WORM
   */
  private static computeBlockHash(params: {
    sequenceNumber: number;
    id: string;
    actorId: string;
    resourceType: string;
    resourceId: string;
    action: string;
    ipAddress: string;
    timestampIso: string;
    previousHash: string;
  }): string {
    const rawPayload = [
      params.sequenceNumber,
      params.id,
      params.actorId,
      params.resourceType,
      params.resourceId,
      params.action,
      params.ipAddress,
      params.timestampIso,
      params.previousHash
    ].join('|');

    return createHash('sha256').update(rawPayload).digest('hex');
  }

  /**
   * Grava um log na trilha de auditoria inviolável (WORM - Write Once, Read Many)
   * Encadeia criptograficamente cada registro (Cryptographic Hash-Chain / Tamper-Evident Ledger)
   */
  static log(params: {
    actorId: string;
    resourceType: AuditResourceType;
    resourceId: string;
    action: AuditAction;
    ipAddress: string;
    userAgent?: string;
  }): AuditLog {
    const sequenceNumber = db.auditLogs.length + 1;
    const previousHash = db.auditLogs.length > 0 
      ? (db.auditLogs[db.auditLogs.length - 1].hash || GENESIS_HASH)
      : GENESIS_HASH;

    const id = randomUUID();
    const timestamp = new Date();
    const timestampIso = timestamp.toISOString();

    const hash = this.computeBlockHash({
      sequenceNumber,
      id,
      actorId: params.actorId,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      action: params.action,
      ipAddress: params.ipAddress,
      timestampIso,
      previousHash
    });

    const logEntry: AuditLog = {
      id,
      actorId: params.actorId,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      action: params.action,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      timestamp,
      sequenceNumber,
      previousHash,
      hash
    };

    // Imutabilidade WORM: append-only estrito e congelado
    db.auditLogs.push(Object.freeze(logEntry));
    return logEntry;
  }

  /**
   * Validador Criptográfico da Cadeia WORM (Cryptographic Hash-Chain Verification)
   * Detecta qualquer modificação retroativa, exclusão ou inserção indevida na trilha
   */
  static verifyChainIntegrity(): ChainIntegrityResult {
    const verifiedAt = new Date().toISOString();
    const logs = db.auditLogs;

    if (logs.length === 0) {
      return {
        isValid: true,
        totalEntries: 0,
        genesisHash: GENESIS_HASH,
        latestHash: GENESIS_HASH,
        message: 'Trilha de auditoria vazia. Bloco gênesis pronto para gravação.',
        verifiedAt
      };
    }

    let expectedPrevHash = GENESIS_HASH;

    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      const expectedSeq = i + 1;

      // 1. Verificação do número de sequência
      if (log.sequenceNumber !== expectedSeq) {
        return {
          isValid: false,
          totalEntries: logs.length,
          genesisHash: GENESIS_HASH,
          latestHash: logs[logs.length - 1].hash || 'UNKNOWN',
          tamperedAtIndex: i,
          tamperedLogId: log.id,
          message: `Falha de integridade: Sequência quebrada no índice ${i}. Esperado #${expectedSeq}, encontrado #${log.sequenceNumber}.`,
          verifiedAt
        };
      }

      // 2. Verificação do elo da corrente (Previous Hash)
      if (log.previousHash !== expectedPrevHash) {
        return {
          isValid: false,
          totalEntries: logs.length,
          genesisHash: GENESIS_HASH,
          latestHash: logs[logs.length - 1].hash || 'UNKNOWN',
          tamperedAtIndex: i,
          tamperedLogId: log.id,
          message: `Adulteração detectada no bloco #${log.sequenceNumber}: previousHash não corresponde ao hash do bloco anterior.`,
          verifiedAt
        };
      }

      // 3. Recalculação canônica do Hash SHA-256
      const timestampIso = new Date(log.timestamp).toISOString();
      const recalculatedHash = this.computeBlockHash({
        sequenceNumber: log.sequenceNumber,
        id: log.id,
        actorId: log.actorId,
        resourceType: log.resourceType,
        resourceId: log.resourceId,
        action: log.action,
        ipAddress: log.ipAddress,
        timestampIso,
        previousHash: log.previousHash
      });

      if (recalculatedHash !== log.hash) {
        return {
          isValid: false,
          totalEntries: logs.length,
          genesisHash: GENESIS_HASH,
          latestHash: logs[logs.length - 1].hash || 'UNKNOWN',
          tamperedAtIndex: i,
          tamperedLogId: log.id,
          message: `Adulteração detectada no payload do bloco #${log.sequenceNumber}: hash divergente da assinatura canônica.`,
          verifiedAt
        };
      }

      expectedPrevHash = log.hash;
    }

    return {
      isValid: true,
      totalEntries: logs.length,
      genesisHash: GENESIS_HASH,
      latestHash: logs[logs.length - 1].hash || GENESIS_HASH,
      message: `Cadeia de blocos WORM 100% íntegra. Todos os ${logs.length} registros foram criptograficamente validados.`,
      verifiedAt
    };
  }

  /**
   * Filtra registros de auditoria por múltiplos critérios
   */
  /**
   * Registro pertence ao consultório quando o ator é da equipe dele ou o recurso
   * (paciente, consulta, prontuário, documento) é do consultório.
   */
  static belongsToPractice(log: AuditLog, therapistId: string): boolean {
    if (db.users.get(log.actorId)?.therapistId === therapistId) return true;
    const owner =
      db.patients.get(log.resourceId)?.therapistId ??
      db.appointments.get(log.resourceId)?.therapistId ??
      db.clinicalRecords.get(log.resourceId)?.therapistId ??
      db.documents.get(log.resourceId)?.therapistId;
    return owner === therapistId;
  }

  static getFilteredLogs(filters: AuditFilterParams = {}): AuditLog[] {
    let result = [...db.auditLogs];

    if (filters.therapistId) {
      const therapistId = filters.therapistId;
      result = result.filter(l => this.belongsToPractice(l, therapistId));
    }

    if (filters.resourceType) {
      result = result.filter(l => l.resourceType === filters.resourceType);
    }

    if (filters.action) {
      result = result.filter(l => l.action === filters.action);
    }

    if (filters.actorId) {
      result = result.filter(l => l.actorId === filters.actorId);
    }

    if (filters.startDate) {
      const start = new Date(filters.startDate).getTime();
      result = result.filter(l => new Date(l.timestamp).getTime() >= start);
    }

    if (filters.endDate) {
      const end = new Date(filters.endDate).getTime();
      result = result.filter(l => new Date(l.timestamp).getTime() <= end);
    }

    if (filters.limit && filters.limit > 0) {
      result = result.slice(-filters.limit);
    }

    return result;
  }

  /**
   * Gera relatório de conformidade formal para fiscalização do CFP e DPO (LGPD Art. 37/38)
   */
  static generateComplianceReport(filters: AuditFilterParams = {}): ComplianceReportResponse {
    const chainIntegrity = this.verifyChainIntegrity();
    const filteredLogs = this.getFilteredLogs(filters);

    const reportId = randomUUID();
    const generatedAt = new Date().toISOString();

    const eventsByAction: Record<string, number> = {};
    const eventsByResourceType: Record<string, number> = {};

    let decryptReadsCount = 0;
    let signaturesAppliedCount = 0;
    let quarantineActionsCount = 0;
    let backupActionsCount = 0;
    let securityAlertsCount = 0;

    for (const log of filteredLogs) {
      eventsByAction[log.action] = (eventsByAction[log.action] || 0) + 1;
      eventsByResourceType[log.resourceType] = (eventsByResourceType[log.resourceType] || 0) + 1;

      if (log.action === 'DECRYPT_READ') decryptReadsCount++;
      if (log.action === 'SIGN_RECORD') signaturesAppliedCount++;
      if (log.action === 'QUARANTINE') quarantineActionsCount++;
      if (log.action.startsWith('BACKUP_')) backupActionsCount++;
      if (log.action === 'AUTH_LOGIN_FAILED' || log.action === 'RATE_LIMIT_EXCEEDED') securityAlertsCount++;
    }

    const reportCore = {
      reportId,
      generatedAt,
      regulationBasis: {
        lgpdArticles: [
          'Art. 37 (Registro das operações de tratamento)',
          'Art. 38 (Relatório de impacto à proteção de dados pessoais)',
          'Art. 50 (Boas práticas e governança em privacidade)'
        ],
        cfpResolutions: [
          'Resolução CFP nº 001/2009 (Guarda do prontuário psicológico por 5 anos)',
          'Resolução CFP nº 011/2018 (Prestação de serviços psicológicos por TICs)',
          'Resolução CFP nº 006/2019 (Elaboração de documentos escritos)'
        ],
        statement: 'Atestamos que os registros abaixo são imutáveis e protegidos pelo protocolo WORM com encadeamento criptográfico SHA-256.'
      },
      controller: {
        clinicName: 'TerapiaInFoco Clínica Psicológica',
        dpoEmail: 'dpo@terapiainfoco.com.br',
        technicalResponsibleCrp: '06/142980'
      },
      chainIntegrity,
      summary: {
        totalEvents: filteredLogs.length,
        decryptReadsCount,
        signaturesAppliedCount,
        quarantineActionsCount,
        backupActionsCount,
        securityAlertsCount,
        eventsByAction,
        eventsByResourceType
      },
      filteredPeriod: {
        startDate: filters.startDate || null,
        endDate: filters.endDate || null
      },
      logs: filteredLogs
    };

    const checksumSha256 = createHash('sha256').update(JSON.stringify(reportCore)).digest('hex');

    return {
      success: true,
      ...reportCore,
      checksumSha256
    };
  }

  /**
   * Converte a trilha de auditoria para formato CSV padronizado (para SIEM e perícia forense)
   */
  static exportLogsToCsv(filters: AuditFilterParams = {}): string {
    const logs = this.getFilteredLogs(filters);

    const headers = [
      'sequenceNumber',
      'id',
      'timestamp',
      'action',
      'resourceType',
      'resourceId',
      'actorId',
      'ipAddress',
      'hash',
      'previousHash'
    ];

    const escapeCsv = (val: any) => {
      if (val === undefined || val === null) return '';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = logs.map(l => [
      l.sequenceNumber || '',
      escapeCsv(l.id),
      escapeCsv(new Date(l.timestamp).toISOString()),
      escapeCsv(l.action),
      escapeCsv(l.resourceType),
      escapeCsv(l.resourceId),
      escapeCsv(l.actorId),
      escapeCsv(l.ipAddress),
      escapeCsv(l.hash || ''),
      escapeCsv(l.previousHash || '')
    ].join(','));

    return [headers.join(','), ...rows].join('\n');
  }

  static getLogsForResource(resourceId: string): AuditLog[] {
    return db.auditLogs.filter(l => l.resourceId === resourceId);
  }

  static getAllLogs(): AuditLog[] {
    return [...db.auditLogs];
  }

  static async logAccess(params: {
    actorId: string;
    resourceType: AuditResourceType;
    resourceId: string;
    action: AuditAction;
    ipAddress: string;
    userAgent?: string;
  }): Promise<AuditLog> {
    return this.log(params);
  }
}

export const auditService = {
  logAccess: (params: Parameters<typeof AuditService.log>[0]) => Promise.resolve(AuditService.log(params))
};
