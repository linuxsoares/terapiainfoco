import { randomUUID } from 'node:crypto';
import {
  ConsentScope,
  ConsentStatus,
  ConsentLegalBasis,
  AuditAction,
  AuditResourceType
} from '@terapiainfoco/shared';
import type {
  ConsentReceipt,
  PatientConsentScopePreference,
  PatientConsentLedger,
  ConsentValidationResult,
  ConsentLedgerOverview,
  GrantGranularConsentDTO,
  RevokeGranularConsentDTO,
  GranularConsentResponse,
  ConsentReceiptResponse
} from '@terapiainfoco/shared';
import {
  calculateConsentReceiptHash,
  encodeConsentToken,
  decodeConsentToken,
  verifyConsentReceiptIntegrity,
  evaluateProcessingPermission,
  formatConsentScopeLabel,
  getDefaultLegalBasisForScope
} from '@terapiainfoco/crypto';
import { PatientRepository } from '../repositories/patientRepository';
import { decryptField } from './cryptoContext';
import { AuditService } from './auditService';

export class ConsentService {
  private static instance: ConsentService;

  private ledgers: Map<string, PatientConsentLedger> = new Map();
  private receiptsById: Map<string, ConsentReceipt> = new Map();
  private receiptsByToken: Map<string, ConsentReceipt> = new Map();
  private allReceipts: ConsentReceipt[] = [];

  private totalRevocationsCount = 0;
  private totalEnforcementBlocksCount = 0;
  private currentTermVersion = 'v2.1 (LGPD/CFP-2026)';

  private constructor() {}

  public static getInstance(): ConsentService {
    if (!ConsentService.instance) {
      ConsentService.instance = new ConsentService();
    }
    return ConsentService.instance;
  }

  /**
   * Descarta o ledger e os recibos de um paciente sintético (monitor), apagado junto com o registro
   */
  public discardPatientLedger(patientId: string): void {
    this.ledgers.delete(patientId);
    for (const receipt of this.allReceipts.filter((r) => r.patientId === patientId)) {
      this.receiptsById.delete(receipt.receiptId);
      this.receiptsByToken.delete(receipt.verificationToken);
    }
    this.allReceipts = this.allReceipts.filter((r) => r.patientId !== patientId);
  }

  /**
   * Obtém ou inicializa sob demanda o prontuário de consentimentos do paciente.
   * Na inicialização, todos os escopos seguem o TCLE de transcrição do cadastro
   * (`consentTranscriptionSigned`): concedidos se assinado, recusados se não, ou se o paciente não existir.
   */
  public async getPatientLedger(patientId: string): Promise<PatientConsentLedger> {
    const cached = this.ledgers.get(patientId);
    if (cached) return cached;

    const patient = await PatientRepository.findById(patientId);
    let patientName = 'Paciente';
    if (patient) {
      try {
        patientName = decryptField(patient.encryptedName);
      } catch {
        patientName = 'Paciente ' + patientId.slice(0, 8);
      }
    }

    const initialStatus = patient?.consentTranscriptionSigned ? ConsentStatus.GRANTED : ConsentStatus.REFUSED;
    const action = initialStatus === ConsentStatus.GRANTED ? ('GRANT' as const) : ('REVOKE' as const);
    const initialTimestamp = patient?.consentSignedAt
      ? new Date(patient.consentSignedAt).toISOString()
      : new Date().toISOString();
    const userAgent = 'Termo de Admissão';
    const preferences: Record<ConsentScope, PatientConsentScopePreference> = {} as any;
    const receipts: ConsentReceipt[] = [];

    for (const scope of Object.values(ConsentScope)) {
      const legalBasis = getDefaultLegalBasisForScope(scope);
      const receiptId = randomUUID();
      const receiptHash = calculateConsentReceiptHash({
        receiptId,
        patientId,
        scope,
        action,
        status: initialStatus,
        termVersion: this.currentTermVersion,
        legalBasis,
        timestamp: initialTimestamp,
        ipAddress: '127.0.0.1',
        userAgent
      });

      const verificationToken = encodeConsentToken({
        receiptId,
        patientId,
        scope,
        action,
        receiptHash,
        timestamp: initialTimestamp
      });

      const receipt: ConsentReceipt = {
        receiptId,
        patientId,
        scope,
        action,
        status: initialStatus,
        termVersion: this.currentTermVersion,
        legalBasis,
        receiptHash,
        verificationToken,
        timestamp: initialTimestamp,
        ipAddress: '127.0.0.1',
        userAgent
      };

      this.receiptsById.set(receiptId, receipt);
      this.receiptsByToken.set(verificationToken, receipt);
      this.allReceipts.unshift(receipt);
      receipts.unshift(receipt);

      preferences[scope] = {
        scope,
        status: initialStatus,
        grantedAt: initialStatus === ConsentStatus.GRANTED ? initialTimestamp : undefined,
        termVersion: this.currentTermVersion,
        receiptHash,
        legalBasis,
        ipAddress: '127.0.0.1',
        userAgent
      };
    }

    // Requisições concorrentes podem ter inicializado o mesmo ledger durante a consulta ao banco
    const concurrent = this.ledgers.get(patientId);
    if (concurrent) return concurrent;
    const ledger: PatientConsentLedger = {
      patientId,
      patientName,
      preferences,
      receiptsHistory: receipts,
      lastUpdatedAt: initialTimestamp
    };
    this.ledgers.set(patientId, ledger);
    return ledger;
  }

  /**
   * Concede ou atualiza de forma granular os consentimentos do paciente
   */
  public async grantGranularConsent(
    dto: GrantGranularConsentDTO,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): Promise<GranularConsentResponse> {
    const ledger = await this.getPatientLedger(dto.patientId);
    const now = new Date().toISOString();
    const termVersion = dto.termVersion || this.currentTermVersion;
    const newReceipts: ConsentReceipt[] = [];

    for (const item of dto.scopes) {
      const legalBasis = getDefaultLegalBasisForScope(item.scope);
      const action = item.granted ? ('GRANT' as const) : ('REVOKE' as const);
      const status = item.granted ? ConsentStatus.GRANTED : ConsentStatus.REVOKED;
      const receiptId = randomUUID();

      const receiptHash = calculateConsentReceiptHash({
        receiptId,
        patientId: dto.patientId,
        scope: item.scope,
        action,
        status,
        termVersion,
        legalBasis,
        timestamp: now,
        revocationReason: item.revocationReason,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      });

      const verificationToken = encodeConsentToken({
        receiptId,
        patientId: dto.patientId,
        scope: item.scope,
        action,
        receiptHash,
        timestamp: now
      });

      const receipt: ConsentReceipt = {
        receiptId,
        patientId: dto.patientId,
        scope: item.scope,
        action,
        status,
        termVersion,
        legalBasis,
        receiptHash,
        verificationToken,
        timestamp: now,
        revocationReason: item.revocationReason,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      };

      this.receiptsById.set(receiptId, receipt);
      this.receiptsByToken.set(verificationToken, receipt);
      this.allReceipts.unshift(receipt);
      newReceipts.push(receipt);

      if (!item.granted) {
        this.totalRevocationsCount++;
      }

      // Atualiza a preferência no ledger
      ledger.preferences[item.scope] = {
        scope: item.scope,
        status,
        grantedAt: item.granted ? now : ledger.preferences[item.scope]?.grantedAt,
        revokedAt: !item.granted ? now : undefined,
        termVersion,
        receiptHash,
        revocationReason: item.revocationReason,
        legalBasis,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      };

      // Auditoria WORM inalterável
      AuditService.log({
        actorId: context.actorId,
        action: item.granted ? AuditAction.CONSENT_GRANTED : AuditAction.CONSENT_REVOKED,
        resourceType: AuditResourceType.CONSENT_RECORD,
        resourceId: receiptId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      });
    }

    ledger.receiptsHistory.unshift(...newReceipts);
    ledger.lastUpdatedAt = now;
    this.ledgers.set(dto.patientId, ledger);

    // Se o consentimento para gravação de teleconsulta tiver sido alterado, sincroniza com paciente
    const audioScope = dto.scopes.find(s => s.scope === ConsentScope.TELECONSULTATION_AUDIO_RECORDING);
    if (audioScope !== undefined) {
      const patient = await PatientRepository.findById(dto.patientId);
      if (patient) {
        patient.consentTranscriptionSigned = audioScope.granted;
        if (audioScope.granted) {
          // Novo aceite substitui a revogação anterior (senão a transcrição seguiria bloqueada)
          patient.consentSignedAt = now;
          patient.consentRevokedAt = undefined;
          patient.consentRevokeReason = undefined;
        }
        await PatientRepository.save(patient);
      }
    }

    return {
      success: true,
      ledger,
      newReceipts,
      message: 'Consentimento granular registrado com recibos canônicos WORM emitidos com sucesso.'
    };
  }

  /**
   * Executa Smart Revocation de um escopo específico com justificativa regulatória
   */
  public revokeConsent(
    dto: RevokeGranularConsentDTO,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): Promise<GranularConsentResponse> {
    return this.grantGranularConsent(
      {
        patientId: dto.patientId,
        scopes: [
          {
            scope: dto.scope,
            granted: false,
            revocationReason: dto.reason
          }
        ]
      },
      context
    );
  }

  /**
   * Consent-Led Enforcement: Avalia se o tratamento para o escopo é permitido
   * Bloqueia tempestivamente em caso de revogação (LGPD Art. 8º §5º)
   */
  public async enforceScope(
    patientId: string,
    requestedScope: ConsentScope,
    context?: { actorId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<ConsentValidationResult> {
    const ledger = await this.getPatientLedger(patientId);
    const preference = ledger.preferences[requestedScope];

    const evaluation = evaluateProcessingPermission(preference, requestedScope);

    if (!evaluation.permitted) {
      this.totalEnforcementBlocksCount++;

      if (context) {
        AuditService.log({
          actorId: context.actorId || 'SYSTEM_ENFORCEMENT',
          action: AuditAction.CONSENT_ENFORCEMENT_BLOCKED,
          resourceType: AuditResourceType.CONSENT_RECORD,
          resourceId: `${patientId}:${requestedScope}`,
          ipAddress: context.ipAddress || '127.0.0.1',
          userAgent: context.userAgent
        });
      }
    }

    return evaluation;
  }

  /**
   * Valida publicamente a autenticidade e integridade do recibo via token `tcle_v1_`
   */
  public async verifyReceiptByToken(
    token: string,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<ConsentReceiptResponse> {
    try {
      const decoded = decodeConsentToken(token);
      let receipt = this.receiptsByToken.get(token);

      if (!receipt) {
        receipt = this.receiptsById.get(decoded.receiptId);
      }

      if (!receipt) {
        return {
          success: false,
          valid: false,
          message: 'Recibo de consentimento não encontrado na base de dados.'
        };
      }

      const isValid = verifyConsentReceiptIntegrity(receipt);

      const patient = await PatientRepository.findById(receipt.patientId);
      let patientNameMasked = 'Paciente';
      if (patient) {
        try {
          const rawName = decryptField(patient.encryptedName);
          const parts = rawName.split(' ');
          patientNameMasked = parts.map((p, idx) => (idx === 0 ? p : p[0] + '***')).join(' ');
        } catch {
          patientNameMasked = 'Paciente Mascarado';
        }
      }

      if (context) {
        AuditService.log({
          actorId: 'ANONYMOUS_VERIFIER',
          action: AuditAction.CONSENT_RECEIPT_VERIFIED,
          resourceType: AuditResourceType.CONSENT_RECORD,
          resourceId: receipt.receiptId,
          ipAddress: context.ipAddress || '127.0.0.1',
          userAgent: context.userAgent
        });
      }

      return {
        success: true,
        valid: isValid,
        receipt,
        patientNameMasked,
        message: isValid 
          ? `Recibo de consentimento válido e matematicamente íntegro (${formatConsentScopeLabel(receipt.scope)}).`
          : 'Violação detectada: O hash do recibo não coincide com os dados originais.'
      };
    } catch (err: any) {
      return {
        success: false,
        valid: false,
        message: `Falha na verificação do token: ${err.message || 'Token malformatado'}`
      };
    }
  }

  /**
   * Retorna métricas globais de conformidade com LGPD e extrato consolidado
   */
  public async getOverview(patientId?: string): Promise<{
    overview: ConsentLedgerOverview;
    recentReceipts: ConsentReceipt[];
    patientLedger?: PatientConsentLedger;
  }> {
    const totalPatients = this.ledgers.size;
    const activeConsentsByScope: Record<ConsentScope, number> = {
      [ConsentScope.TELECONSULTATION_AUDIO_RECORDING]: 0,
      [ConsentScope.AI_CLINICAL_SYNTHESIS]: 0,
      [ConsentScope.ANONYMIZED_RESEARCH]: 0,
      [ConsentScope.INTERPROFESSIONAL_SHARING]: 0,
      [ConsentScope.COMMUNICATION_REMINDERS]: 0
    };

    for (const ledger of this.ledgers.values()) {
      for (const scope of Object.values(ConsentScope)) {
        if (ledger.preferences[scope]?.status === ConsentStatus.GRANTED) {
          activeConsentsByScope[scope]++;
        }
      }
    }

    const totalPossiblePreferences = Math.max(1, totalPatients * Object.keys(ConsentScope).length);
    const totalActive = Object.values(activeConsentsByScope).reduce((a, b) => a + b, 0);
    const complianceRatePercent = Math.min(100, Math.round((totalActive / totalPossiblePreferences) * 100));

    const overview: ConsentLedgerOverview = {
      totalPatientsWithConsent: totalPatients,
      activeConsentsByScope,
      revocationsCount: this.totalRevocationsCount,
      blockedProcessingsCount: this.totalEnforcementBlocksCount,
      complianceRatePercent,
      termVersionActive: this.currentTermVersion,
      lastRevocationAt: this.allReceipts.find(r => r.action === 'REVOKE')?.timestamp
    };

    let patientLedger: PatientConsentLedger | undefined;
    if (patientId) {
      patientLedger = await this.getPatientLedger(patientId);
    }

    return {
      overview,
      recentReceipts: this.allReceipts.slice(0, 15),
      patientLedger
    };
  }
}
