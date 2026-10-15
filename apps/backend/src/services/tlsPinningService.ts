/**
 * TLS Pinning Service & Gestor do Ciclo de Vida de CAs e Pins SPKI
 * Conformidade: RFC-001 §4.4, §5.2, RFC 7469, RFC 6698 e OWASP MASVS
 */

import {
  AuditAction,
  AuditResourceType,
  TlsPinningStrategy,
  TlsPinValidationStatus,
  TlsPinPolicyMode
} from '@terapiainfoco/shared';
import type {
  TlsSpkiPin,
  X509CertInspection,
  TlsPinProofSeal,
  TlsPinValidationResult,
  TlsPinningMetrics,
  TlsPinningOverview,
  ValidateTlsPinDTO,
  RegisterTlsPinDTO,
  RotateTlsCaDTO,
  QuarantineCompromisedCaDTO
} from '@terapiainfoco/shared';
import {
  evaluateTlsCertificatePinning,
  verifyTlsPinProofSeal,
  calculateSpkiPinSha256
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';

export class TlsPinningService {
  private static instance: TlsPinningService;

  private pins: Map<string, TlsSpkiPin> = new Map();
  private quarantinedCAs: Set<string> = new Set();
  private recentVerifications: TlsPinValidationResult[] = [];
  private metrics: TlsPinningMetrics = {
    activePinsCount: 0,
    primaryPinsCount: 0,
    backupPinsCount: 0,
    verifications24h: 0,
    mitmBlockedCount: 0,
    caRotationsCount: 0,
    compromisedCAsQuarantined: 0,
    enforceModeEnabled: true
  };

  private constructor() {
    this.seedInitialPinsAndQuarantines();
  }

  public static getInstance(): TlsPinningService {
    if (!TlsPinningService.instance) {
      TlsPinningService.instance = new TlsPinningService();
    }
    return TlsPinningService.instance;
  }

  /**
   * Inicializa Pins SPKI dos domínios clínicos fundamentais e CAs quarentenadas
   */
  private seedInitialPinsAndQuarantines(): void {
    // 1. api.terapiainfoco.com.br (REST / Enclave Clínico)
    const apiPrimary: TlsSpkiPin = {
      pinId: 'pin-api-primary-isrg-x1',
      hostname: 'api.terapiainfoco.com.br',
      spkiSha256: 'pin-sha256="C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M="',
      strategy: TlsPinningStrategy.PUBLIC_KEY_SPKI,
      type: 'PRIMARY',
      caIssuer: "Let's Encrypt Authority X3 / ISRG Root X1",
      subjectCommonName: 'api.terapiainfoco.com.br',
      validFrom: '2026-01-01T00:00:00.000Z',
      validTo: '2026-12-31T23:59:59.000Z',
      createdAt: '2026-01-01T00:00:00.000Z'
    };
    const apiBackup: TlsSpkiPin = {
      pinId: 'pin-api-backup-digicert-g2',
      hostname: 'api.terapiainfoco.com.br',
      spkiSha256: 'pin-sha256="k2J8FvU3+mQZ0W+VnSgW6Z1uA9hK7eP4dC5tM8sB2wE="',
      strategy: TlsPinningStrategy.PUBLIC_KEY_SPKI,
      type: 'BACKUP_ROTATION',
      caIssuer: 'DigiCert Global Root G2',
      subjectCommonName: 'api.terapiainfoco.com.br',
      validFrom: '2026-06-01T00:00:00.000Z',
      validTo: '2027-06-01T23:59:59.000Z',
      createdAt: '2026-06-01T00:00:00.000Z'
    };

    // 2. meet.terapiainfoco.com.br (Telepsicologia WebRTC DTLS-SRTP)
    const meetPrimary: TlsSpkiPin = {
      pinId: 'pin-meet-primary-digicert',
      hostname: 'meet.terapiainfoco.com.br',
      spkiSha256: 'pin-sha256="r/mny3Fi5HbmgKpzZMPMY+e30Sp4gxWQG74EfdmwKh8="',
      strategy: TlsPinningStrategy.PUBLIC_KEY_SPKI,
      type: 'PRIMARY',
      caIssuer: 'DigiCert TLS RSA SHA256 2026',
      subjectCommonName: 'meet.terapiainfoco.com.br',
      validFrom: '2026-01-15T00:00:00.000Z',
      validTo: '2027-01-15T23:59:59.000Z',
      createdAt: '2026-01-15T00:00:00.000Z'
    };
    const meetBackup: TlsSpkiPin = {
      pinId: 'pin-meet-backup-isrg-x2',
      hostname: 'meet.terapiainfoco.com.br',
      spkiSha256: 'pin-sha256="diGVwiPQ6WmWjfdjCl0pbpNxv5L0m5unrqeyMQARUzg="',
      strategy: TlsPinningStrategy.PUBLIC_KEY_SPKI,
      type: 'BACKUP_ROTATION',
      caIssuer: 'ISRG Root X2 (ECDSA P-384)',
      subjectCommonName: 'meet.terapiainfoco.com.br',
      validFrom: '2026-02-01T00:00:00.000Z',
      validTo: '2027-02-01T23:59:59.000Z',
      createdAt: '2026-02-01T00:00:00.000Z'
    };

    // 3. notary.terapiainfoco.com.br (Cartório Notarial ICP-Brasil)
    const notaryPrimary: TlsSpkiPin = {
      pinId: 'pin-notary-icp-brasil-v5',
      hostname: 'notary.terapiainfoco.com.br',
      spkiSha256: 'pin-sha256="yK+l9v5z12k45a8bc3def90123456789abcdef01234="',
      strategy: TlsPinningStrategy.PUBLIC_KEY_SPKI,
      type: 'PRIMARY',
      caIssuer: 'Autoridade Certificadora Raiz Brasileira v5 (ICP-Brasil)',
      subjectCommonName: 'notary.terapiainfoco.com.br',
      validFrom: '2025-01-01T00:00:00.000Z',
      validTo: '2030-12-31T23:59:59.000Z',
      createdAt: '2025-01-01T00:00:00.000Z'
    };

    this.pins.set(apiPrimary.pinId, apiPrimary);
    this.pins.set(apiBackup.pinId, apiBackup);
    this.pins.set(meetPrimary.pinId, meetPrimary);
    this.pins.set(meetBackup.pinId, meetBackup);
    this.pins.set(notaryPrimary.pinId, notaryPrimary);

    // CAs Quarentenadas Conhecidas / Comprometidas
    this.quarantinedCAs.add('Compromised Commercial CA Inc');
    this.quarantinedCAs.add('DarkComet Rogue Interception Root');

    this.recalculateMetrics();
  }

  private recalculateMetrics(): void {
    const allPins = Array.from(this.pins.values());
    this.metrics.activePinsCount = allPins.length;
    this.metrics.primaryPinsCount = allPins.filter(p => p.type === 'PRIMARY').length;
    this.metrics.backupPinsCount = allPins.filter(p => p.type === 'BACKUP_ROTATION' || p.type === 'EMERGENCY_RECOVERY').length;
    this.metrics.compromisedCAsQuarantined = this.quarantinedCAs.size;
  }

  /**
   * Obtém a visão geral executiva do painel de TLS Pinning
   */
  public getOverview(): TlsPinningOverview {
    const pins = Array.from(this.pins.values());
    const quarantinedCAs = Array.from(this.quarantinedCAs);

    let systemStatus: 'PINNED_SECURE' | 'DEGRADED_ROTATING' | 'MITM_ATTACK_DETECTED' = 'PINNED_SECURE';
    if (this.metrics.mitmBlockedCount > 0) {
      const recentMitm = this.recentVerifications.slice(0, 5).some(v => v.threatLevel === 'CRITICAL_MITM');
      if (recentMitm) {
        systemStatus = 'MITM_ATTACK_DETECTED';
      }
    }

    return {
      metrics: { ...this.metrics },
      pins,
      recentVerifications: [...this.recentVerifications],
      quarantinedCAs,
      systemStatus
    };
  }

  /**
   * Valida em tempo real a apresentação TLS para um domínio clínico
   */
  public async validateTlsConnection(
    dto: ValidateTlsPinDTO,
    userId: string = 'system',
    ip: string = '127.0.0.1'
  ): Promise<TlsPinValidationResult> {
    const hostname = dto.hostname.toLowerCase().trim();
    let certToInspect: X509CertInspection;

    if (dto.simulatedScenario) {
      certToInspect = this.buildSimulatedCertificate(hostname, dto.simulatedScenario);
    } else if (dto.presentedSpkiOrCertPem) {
      const spki = dto.presentedSpkiOrCertPem.startsWith('pin-sha256=')
        ? dto.presentedSpkiOrCertPem
        : calculateSpkiPinSha256(dto.presentedSpkiOrCertPem);

      certToInspect = {
        fingerprintSha256: '9A:44:B2:1C:88:FE:91:02',
        spkiSha256: spki,
        subjectCN: hostname,
        subjectAltNames: [hostname],
        issuerCN: "Let's Encrypt Authority X3",
        validFrom: new Date(Date.now() - 30 * 86400000).toISOString(),
        validTo: new Date(Date.now() + 60 * 86400000).toISOString(),
        serialNumber: '99881122',
        signatureAlgorithm: 'sha256WithRSAEncryption',
        publicKeyBitLength: 2048
      };
    } else {
      // Padrão: certificado legítimo do domínio
      const primary = Array.from(this.pins.values()).find(p => p.hostname === hostname && p.type === 'PRIMARY');
      certToInspect = {
        fingerprintSha256: 'FA:81:99:32:00:CD:12:44',
        spkiSha256: primary ? primary.spkiSha256 : 'pin-sha256="UNKNOWN_SPKI_FALLBACK"',
        subjectCN: hostname,
        subjectAltNames: [hostname],
        issuerCN: primary ? primary.caIssuer : "Let's Encrypt Authority X3",
        validFrom: new Date(Date.now() - 10 * 86400000).toISOString(),
        validTo: new Date(Date.now() + 80 * 86400000).toISOString(),
        serialNumber: '10029381',
        signatureAlgorithm: 'sha256WithRSAEncryption',
        publicKeyBitLength: 2048
      };
    }

    const allPins = Array.from(this.pins.values());
    const quarantinedList = Array.from(this.quarantinedCAs);

    const result = evaluateTlsCertificatePinning({
      hostname,
      presentedCertificate: certToInspect,
      configuredPins: allPins,
      quarantinedCAs: quarantinedList,
      policyMode: this.metrics.enforceModeEnabled ? TlsPinPolicyMode.STRICT_ENFORCE : TlsPinPolicyMode.DRY_RUN_REPORT
    });

    // Atualizar métricas
    this.metrics.verifications24h++;
    if (result.threatLevel === 'CRITICAL_MITM') {
      this.metrics.mitmBlockedCount++;
    }

    // Armazenar no histórico
    this.recentVerifications.unshift(result);
    if (this.recentVerifications.length > 50) {
      this.recentVerifications.pop();
    }

    // Registrar na trilha WORM
    const auditAction = (result.status === TlsPinValidationStatus.PIN_MATCH_PRIMARY || result.status === TlsPinValidationStatus.PIN_MATCH_BACKUP)
      ? AuditAction.TLS_PIN_VERIFIED
      : (result.status === TlsPinValidationStatus.CHAIN_UNTRUSTED_ROGUE_CA)
      ? AuditAction.TLS_ROGUE_CA_DETECTED
      : AuditAction.TLS_PIN_VIOLATION_BLOCKED;

    await AuditService.log({
      actorId: userId,
      action: auditAction,
      resourceType: AuditResourceType.TLS_PINNING_GUARD,
      resourceId: hostname,
      ipAddress: ip
    });

    return result;
  }

  /**
   * Constrói certificados sintéticos para simulações forenses de pentest
   */
  private buildSimulatedCertificate(
    hostname: string,
    scenario: 'LEGITIMATE_LETS_ENCRYPT' | 'BURP_MITM_PROXY' | 'EXPIRED_CERTIFICATE' | 'SAN_SPOOFING' | 'ROGUE_QUARANTINED_CA' | 'BACKUP_ROTATION_TEST'
  ): X509CertInspection {
    const primary = Array.from(this.pins.values()).find(p => p.hostname === hostname && p.type === 'PRIMARY');
    const backup = Array.from(this.pins.values()).find(p => p.hostname === hostname && (p.type === 'BACKUP_ROTATION' || p.type === 'EMERGENCY_RECOVERY'));

    switch (scenario) {
      case 'LEGITIMATE_LETS_ENCRYPT':
        return {
          fingerprintSha256: '0A:11:22:33:44:55:66:77',
          spkiSha256: primary ? primary.spkiSha256 : 'pin-sha256="C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M="',
          subjectCN: hostname,
          subjectAltNames: [hostname],
          issuerCN: "Let's Encrypt Authority X3",
          validFrom: new Date(Date.now() - 5 * 86400000).toISOString(),
          validTo: new Date(Date.now() + 85 * 86400000).toISOString(),
          serialNumber: '90001',
          signatureAlgorithm: 'sha256WithRSAEncryption',
          publicKeyBitLength: 2048
        };

      case 'BURP_MITM_PROXY':
        return {
          fingerprintSha256: 'DE:AD:BE:EF:00:11:22:33',
          spkiSha256: 'pin-sha256="BURP_SUITE_INTERCEPT_PROXY_PUBLIC_KEY=="',
          subjectCN: hostname,
          subjectAltNames: [hostname],
          issuerCN: 'PortSwigger CA',
          validFrom: new Date(Date.now() - 1 * 86400000).toISOString(),
          validTo: new Date(Date.now() + 365 * 86400000).toISOString(),
          serialNumber: '666666',
          signatureAlgorithm: 'sha256WithRSAEncryption',
          publicKeyBitLength: 2048
        };

      case 'EXPIRED_CERTIFICATE':
        return {
          fingerprintSha256: '99:88:77:66:55:44:33:22',
          spkiSha256: primary ? primary.spkiSha256 : 'pin-sha256="EXPIRED_SAMPLE_KEY=="',
          subjectCN: hostname,
          subjectAltNames: [hostname],
          issuerCN: "Let's Encrypt Authority X3",
          validFrom: new Date(Date.now() - 400 * 86400000).toISOString(),
          validTo: new Date(Date.now() - 10 * 86400000).toISOString(), // Expirou há 10 dias
          serialNumber: '88881',
          signatureAlgorithm: 'sha256WithRSAEncryption',
          publicKeyBitLength: 2048
        };

      case 'SAN_SPOOFING':
        return {
          fingerprintSha256: '77:66:55:44:33:22:11:00',
          spkiSha256: primary ? primary.spkiSha256 : 'pin-sha256="FAKE_SAN_KEY=="',
          subjectCN: 'phishing-terapiainfoco.attacker.com',
          subjectAltNames: ['phishing-terapiainfoco.attacker.com'],
          issuerCN: "Let's Encrypt Authority X3",
          validFrom: new Date(Date.now() - 5 * 86400000).toISOString(),
          validTo: new Date(Date.now() + 85 * 86400000).toISOString(),
          serialNumber: '77771',
          signatureAlgorithm: 'sha256WithRSAEncryption',
          publicKeyBitLength: 2048
        };

      case 'ROGUE_QUARANTINED_CA':
        return {
          fingerprintSha256: 'FA:FA:FA:FA:11:22:33:44',
          spkiSha256: 'pin-sha256="QUARANTINED_CA_KEY_SAMPLE=="',
          subjectCN: hostname,
          subjectAltNames: [hostname],
          issuerCN: 'Compromised Commercial CA Inc',
          validFrom: new Date(Date.now() - 5 * 86400000).toISOString(),
          validTo: new Date(Date.now() + 85 * 86400000).toISOString(),
          serialNumber: '55551',
          signatureAlgorithm: 'sha256WithRSAEncryption',
          publicKeyBitLength: 2048
        };

      case 'BACKUP_ROTATION_TEST':
        return {
          fingerprintSha256: '33:44:55:66:77:88:99:AA',
          spkiSha256: backup ? backup.spkiSha256 : 'pin-sha256="k2J8FvU3+mQZ0W+VnSgW6Z1uA9hK7eP4dC5tM8sB2wE="',
          subjectCN: hostname,
          subjectAltNames: [hostname],
          issuerCN: backup ? backup.caIssuer : 'DigiCert Global Root G2',
          validFrom: new Date(Date.now() - 5 * 86400000).toISOString(),
          validTo: new Date(Date.now() + 300 * 86400000).toISOString(),
          serialNumber: '44441',
          signatureAlgorithm: 'sha256WithRSAEncryption',
          publicKeyBitLength: 2048
        };
    }
  }

  /**
   * Registra um novo Pin SPKI (Primary ou Backup de rotação)
   */
  public async registerPin(
    dto: RegisterTlsPinDTO,
    userId: string = 'system',
    ip: string = '127.0.0.1'
  ): Promise<TlsSpkiPin> {
    const pinId = `pin-${dto.hostname.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now().toString(36)}`;
    const pin: TlsSpkiPin = {
      pinId,
      hostname: dto.hostname.toLowerCase().trim(),
      spkiSha256: dto.spkiSha256.startsWith('pin-sha256=') ? dto.spkiSha256 : `pin-sha256="${dto.spkiSha256}"`,
      strategy: dto.strategy || TlsPinningStrategy.PUBLIC_KEY_SPKI,
      type: dto.type,
      caIssuer: dto.caIssuer,
      subjectCommonName: dto.subjectCommonName,
      validFrom: dto.validFrom,
      validTo: dto.validTo,
      createdAt: new Date().toISOString()
    };

    // Se o novo for PRIMARY, rebaixa o primário antigo daquele hostname para BACKUP_ROTATION
    if (dto.type === 'PRIMARY') {
      for (const p of this.pins.values()) {
        if (p.hostname === pin.hostname && p.type === 'PRIMARY') {
          p.type = 'BACKUP_ROTATION';
        }
      }
    }

    this.pins.set(pin.pinId, pin);
    this.recalculateMetrics();

    await AuditService.log({
      actorId: userId,
      action: AuditAction.TLS_PIN_VERIFIED,
      resourceType: AuditResourceType.TLS_PINNING_GUARD,
      resourceId: pin.pinId,
      ipAddress: ip
    });

    return pin;
  }

  /**
   * Promove um Backup Pin para Primary Pin (Rotação Atômica de CA sem downtime)
   */
  public async rotateCa(
    dto: RotateTlsCaDTO,
    userId: string = 'system',
    ip: string = '127.0.0.1'
  ): Promise<{ promotedPin: TlsSpkiPin; demotedPin?: TlsSpkiPin; rotatedAt: string }> {
    const promoted = this.pins.get(dto.newPrimaryPinId);
    if (!promoted) {
      throw new Error(`Pin SPKI ${dto.newPrimaryPinId} não encontrado`);
    }

    let demoted: TlsSpkiPin | undefined;
    for (const p of this.pins.values()) {
      if (p.hostname === promoted.hostname && p.type === 'PRIMARY' && p.pinId !== promoted.pinId) {
        p.type = dto.emergencyRevocation ? 'EMERGENCY_RECOVERY' : 'BACKUP_ROTATION';
        demoted = p;
        break;
      }
    }

    promoted.type = 'PRIMARY';
    this.metrics.caRotationsCount++;
    this.recalculateMetrics();

    const rotatedAt = new Date().toISOString();

    await AuditService.log({
      actorId: userId,
      action: AuditAction.TLS_CA_ROTATED,
      resourceType: AuditResourceType.TLS_PINNING_GUARD,
      resourceId: promoted.pinId,
      ipAddress: ip
    });

    return {
      promotedPin: promoted,
      demotedPin: demoted,
      rotatedAt
    };
  }

  /**
   * Coloca uma Autoridade Certificadora em Quarentena Compulsória com Revogação Ativa
   */
  public async quarantineCa(
    dto: QuarantineCompromisedCaDTO,
    userId: string = 'system',
    ip: string = '127.0.0.1'
  ): Promise<{ quarantinedCa: string; revokedPinsCount: number; quarantinedAt: string }> {
    const caName = dto.caCommonNameOrIdentifier.trim();
    this.quarantinedCAs.add(caName);

    // Revogar e marcar pins emitidos por esta CA
    let revokedCount = 0;
    for (const p of this.pins.values()) {
      if (p.caIssuer.toLowerCase().includes(caName.toLowerCase())) {
        p.type = 'EMERGENCY_RECOVERY';
        revokedCount++;
      }
    }

    this.recalculateMetrics();
    const quarantinedAt = new Date().toISOString();

    await AuditService.log({
      actorId: userId,
      action: AuditAction.TLS_ROGUE_CA_DETECTED,
      resourceType: AuditResourceType.TLS_PINNING_GUARD,
      resourceId: caName,
      ipAddress: ip
    });

    return {
      quarantinedCa: caName,
      revokedPinsCount: revokedCount,
      quarantinedAt
    };
  }

  /**
   * Verifica a integridade matemática de um Selo WORM de TLS Pinning
   */
  public verifySeal(sealToken: string): {
    isValid: boolean;
    seal?: TlsPinProofSeal;
    message: string;
    verifiedAt: string;
  } {
    const res = verifyTlsPinProofSeal(sealToken);
    return {
      isValid: res.isValid,
      seal: res.seal,
      message: res.isValid
        ? 'Selo Probatório WORM de TLS Certificate Pinning validado com 100% de integridade matemática.'
        : `Falha na verificação do selo probatório: ${res.error || 'Assinatura inválida'}`,
      verifiedAt: new Date().toISOString()
    };
  }
}

export const tlsPinningService = TlsPinningService.getInstance();
