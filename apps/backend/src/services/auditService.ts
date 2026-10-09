import { randomUUID } from 'node:crypto';
import type { AuditAction, AuditResourceType, AuditLog } from '@terapiainfoco/shared';
import { db } from '../db/memoryDb';

export class AuditService {
  /**
   * Grava um log na trilha de auditoria inviolável (WORM - Write Once, Read Many)
   * Conforme RFC-001 §4.4 (Trilha de Auditoria Imutável LGPD & CFP)
   */
  static log(params: {
    actorId: string;
    resourceType: AuditResourceType;
    resourceId: string;
    action: AuditAction;
    ipAddress: string;
    userAgent?: string;
  }): AuditLog {
    const logEntry: AuditLog = {
      id: randomUUID(),
      actorId: params.actorId,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      action: params.action,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      timestamp: new Date()
    };

    // Imutabilidade WORM: apenas append
    db.auditLogs.push(Object.freeze(logEntry));
    return logEntry;
  }

  static getLogsForResource(resourceId: string): AuditLog[] {
    return db.auditLogs.filter(l => l.resourceId === resourceId);
  }

  static getAllLogs(): AuditLog[] {
    return [...db.auditLogs];
  }
}
