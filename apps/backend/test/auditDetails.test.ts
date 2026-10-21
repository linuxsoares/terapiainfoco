import { describe, it, expect, beforeEach } from 'bun:test';
import { db } from '../src/db/memoryDb';
import { AuditService } from '../src/services/auditService';
import { AuditAction, AuditResourceType } from '@terapiainfoco/shared';
import { resetDb } from './helpers/db';

describe('Detalhes na trilha de auditoria', () => {
  beforeEach(async () => {
    await resetDb();
  });

  const base = {
    actorId: 'admin-1',
    resourceType: AuditResourceType.COMPLIANCE,
    resourceId: 'pkg-1',
    action: AuditAction.EXECUTIVE_COMPLIANCE_GENERATED,
    ipAddress: '127.0.0.1'
  };

  it('grava os detalhes, que entram no hash da cadeia', () => {
    const entry = AuditService.log({ ...base, details: { digest: 'abc', score: 87, at: new Date('2026-10-20T10:00:00Z') } });
    expect(entry.details).toEqual({ at: '2026-10-20T10:00:00.000Z', digest: 'abc', score: 87 });
    expect(AuditService.verifyChainIntegrity().isValid).toBe(true);

    // Adulterar os detalhes depois de gravados quebra a verificação
    const tampered = { ...db.auditLogs[0], details: { digest: 'outro', score: 87, at: '2026-10-20T10:00:00.000Z' } };
    db.auditLogs[0] = tampered;
    expect(AuditService.verifyChainIntegrity().isValid).toBe(false);
  });

  it('registros sem detalhes mantêm o formato de hash anterior', () => {
    const entry = AuditService.log(base);
    expect(entry.details).toBeUndefined();
    expect(AuditService.verifyChainIntegrity().isValid).toBe(true);
  });

  it('alterar o objeto original depois não invalida o registro; severidade vai para os detalhes', () => {
    const details: Record<string, unknown> = { reason: 'teste' };
    const entry = AuditService.log({ ...base, details, severity: 'HIGH' });
    details.reason = 'alterado';
    expect(entry.details).toEqual({ reason: 'teste', severity: 'HIGH' });
    expect(AuditService.verifyChainIntegrity().isValid).toBe(true);
  });

  it('estrutura circular não impede o registro', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const entry = AuditService.log({ ...base, details: { circular } });
    expect(entry.details).toEqual({ detailsUnserializable: true });
  });
});
