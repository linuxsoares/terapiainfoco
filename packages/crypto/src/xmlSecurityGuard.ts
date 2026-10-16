/**
 * ============================================================================
 * 64. MOTOR CRIPTOGRÁFICO & SANITIZADOR DE SEGURANÇA XML (CWE-611 / CWE-776)
 * ============================================================================
 * 
 * Proteção avançada em profundidade contra:
 * 1. XML External Entity (XXE) Injection (SYSTEM, PUBLIC, Parameter Entities, OOB)
 * 2. XML Entity Expansion Bombs (Billion Laughs / Quadratic Blowup DoS)
 * 3. Inclusões externas XInclude e Schema Redirection maliciosas
 * 4. Sanitização e normalização segura de XML clínico (HL7 CDA, FHIR XML, TISS ANS)
 * 5. Emissão e verificação de Selo Probatório Notarial WORM RFC 8785
 */

import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import {
  XmlThreatType,
  XmlThreatSeverity,
  XmlSanitizationMode,
  XmlClinicalSchemaType,
  type XmlThreatDetection,
  type XmlProofSeal,
  type XmlSanitizationResult,
  type XmlGuardPolicy
} from '@terapiainfoco/shared';

/**
 * Chave mestra padrão para selagem probatória WORM de integridade XML
 */
const DEFAULT_XML_SEAL_SECRET = process.env.XML_GUARD_SECRET || 'terapiainfoco_xml_guard_worm_secret_v1_2026';

/**
 * Política padrão de segurança e limites operacionais de XML
 */
export const DEFAULT_XML_GUARD_POLICY: XmlGuardPolicy = {
  disallowDoctype: true,
  disallowExternalEntities: true,
  disallowXInclude: true,
  maxXmlSizeBytes: 2 * 1024 * 1024, // 2 MB
  maxNestingDepth: 20,
  maxEntityExpansions: 50,
  allowedUriSchemes: ['http', 'https'],
  enableWormSeal: true
};

/**
 * Serialização Canônica Determinística RFC 8785 (JCS)
 */
export function canonicalJsonStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return `[${obj.map(item => canonicalJsonStringify(item)).join(',')}]`;
  }

  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map(key => {
    return `${JSON.stringify(key)}:${canonicalJsonStringify(obj[key])}`;
  });

  return `{${pairs.join(',')}}`;
}

/**
 * Calcula a profundidade máxima de nós (nesting depth) de uma string XML
 */
export function calculateXmlNestingDepth(xml: string): number {
  let currentDepth = 0;
  let maxDepth = 0;

  // Remove comentários e blocos CDATA para não confundir o parser de tags
  const cleanXml = xml
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');

  const tagRegex = /<\/?([a-zA-Z0-9_:-]+)(\s+[^>]*)?(\/?)>/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(cleanXml)) !== null) {
    const fullTag = match[0];
    const isClosing = fullTag.startsWith('</');
    const isSelfClosing = fullTag.endsWith('/>') || fullTag.startsWith('<?') || fullTag.startsWith('<!');

    if (isSelfClosing) {
      continue;
    }

    if (isClosing) {
      currentDepth = Math.max(0, currentDepth - 1);
    } else {
      currentDepth++;
      if (currentDepth > maxDepth) {
        maxDepth = currentDepth;
      }
    }
  }

  return maxDepth;
}

/**
 * Analisa declarações internas de entidade e calcula o fator de expansão recursiva (Billion Laughs / Quadratic Blowup)
 */
export function analyzeEntityExpansionFactor(xml: string): {
  detectedEntitiesCount: number;
  expansionMultiplier: number;
  isBillionLaughs: boolean;
  isQuadraticBlowup: boolean;
  suspiciousEntities: string[];
} {
  const entityDeclRegex = /<!ENTITY\s+(?:%\s+)?([a-zA-Z0-9_:-]+)\s+["']([^"']*)["']\s*>/gi;
  const entitiesMap = new Map<string, string>();
  let match: RegExpExecArray | null;

  while ((match = entityDeclRegex.exec(xml)) !== null) {
    const name = match[1];
    const val = match[2];
    entitiesMap.set(name, val);
  }

  const detectedEntitiesCount = entitiesMap.size;
  if (detectedEntitiesCount === 0) {
    return {
      detectedEntitiesCount: 0,
      expansionMultiplier: 1,
      isBillionLaughs: false,
      isQuadraticBlowup: false,
      suspiciousEntities: []
    };
  }

  // Verifica dependências recursivas entre entidades
  let maxExpansions = 1;
  let isBillionLaughs = false;
  const suspiciousEntities: string[] = [];

  for (const [name, value] of entitiesMap.entries()) {
    let referencesCount = 0;
    const refRegex = /&([a-zA-Z0-9_:-]+);/g;
    let refMatch: RegExpExecArray | null;

    while ((refMatch = refRegex.exec(value)) !== null) {
      const referenced = refMatch[1];
      if (entitiesMap.has(referenced)) {
        referencesCount++;
      }
    }

    if (referencesCount >= 2) {
      suspiciousEntities.push(name);
      maxExpansions *= referencesCount;
      if (maxExpansions > 100 || suspiciousEntities.length >= 3) {
        isBillionLaughs = true;
      }
    }
  }

  // Verifica Quadratic Blowup: contagem de referências no corpo do XML
  let totalBodyReferences = 0;
  for (const name of entitiesMap.keys()) {
    const bodyRefRegex = new RegExp(`&${name};`, 'g');
    const matches = xml.match(bodyRefRegex);
    if (matches) {
      totalBodyReferences += matches.length;
    }
  }

  const isQuadraticBlowup = totalBodyReferences > 80;

  return {
    detectedEntitiesCount,
    expansionMultiplier: maxExpansions,
    isBillionLaughs,
    isQuadraticBlowup,
    suspiciousEntities
  };
}

/**
 * Detecta vetores de ameaça em XML conforme OWASP ASVS V5.5, CWE-611 e CWE-776
 */
export function detectXmlThreats(
  xml: string,
  policy: XmlGuardPolicy = DEFAULT_XML_GUARD_POLICY
): {
  threats: XmlThreatDetection[];
  detectedEntitiesCount: number;
  maxNestingDepth: number;
  expansionMultiplier: number;
} {
  const threats: XmlThreatDetection[] = [];

  // 1. Verificação de Limite de Tamanho (DoS Prevention)
  if (Buffer.byteLength(xml, 'utf-8') > policy.maxXmlSizeBytes) {
    threats.push({
      threatType: XmlThreatType.EXCESSIVE_NESTING_DEPTH,
      severity: XmlThreatSeverity.HIGH,
      description: `Documento XML excede o tamanho máximo configurado (${xml.length} bytes > ${policy.maxXmlSizeBytes} bytes).`,
      triggerSnippet: `Tamanho: ${xml.length} bytes`,
      evidence: 'Tentativa potencial de esgotamento de memória por payload XML volumoso.',
      mitigationAction: 'REJECT_PAYLOAD'
    });
  }

  // 2. Verificação de Profundidade de Aninhamento (Nesting Depth Bomb)
  const maxNestingDepth = calculateXmlNestingDepth(xml);
  if (maxNestingDepth > policy.maxNestingDepth) {
    threats.push({
      threatType: XmlThreatType.EXCESSIVE_NESTING_DEPTH,
      severity: XmlThreatSeverity.HIGH,
      description: `Profundidade de nós XML excede o limite permitido (${maxNestingDepth} > ${policy.maxNestingDepth}).`,
      triggerSnippet: `Profundidade detectada: ${maxNestingDepth}`,
      evidence: 'Estrutura XML com aninhamento profundo propensa a estouro de pilha (Stack Overflow DoS).',
      mitigationAction: 'REJECT_PAYLOAD'
    });
  }

  // 3. Verificação de Entidades Externas: SYSTEM (XXE Direto / SSRF / Exfiltração Local)
  const systemEntityRegex = /<!ENTITY\s+(?:%\s+)?([a-zA-Z0-9_:-]+)\s+SYSTEM\s+["']([^"']+)["']/gi;
  let systemMatch: RegExpExecArray | null;
  while ((systemMatch = systemEntityRegex.exec(xml)) !== null) {
    const entityName = systemMatch[1];
    const systemUri = systemMatch[2];

    const isLocalFile = /^file:/i.test(systemUri) || systemUri.startsWith('/') || systemUri.startsWith('\\');
    const isRemoteUri = /^https?:/i.test(systemUri) || /^(ftp|gopher|dict|expect|php|data):/i.test(systemUri);

    threats.push({
      threatType: XmlThreatType.EXTERNAL_ENTITY_SYSTEM,
      severity: isLocalFile || isRemoteUri ? XmlThreatSeverity.CRITICAL : XmlThreatSeverity.HIGH,
      description: `Injeção de Entidade Externa XML (XXE) detectada via cláusula SYSTEM '${systemUri}'.`,
      triggerSnippet: systemMatch[0],
      evidence: `Entidade '${entityName}' tenta resolver recurso externo/local: ${systemUri}.`,
      mitigationAction: 'STRIP_AND_DISALLOW_DTD'
    });
  }

  // 4. Verificação de Entidades Externas: PUBLIC
  const publicEntityRegex = /<!ENTITY\s+(?:%\s+)?([a-zA-Z0-9_:-]+)\s+PUBLIC\s+["']([^"']*)["']\s+["']([^"']+)["']/gi;
  let publicMatch: RegExpExecArray | null;
  while ((publicMatch = publicEntityRegex.exec(xml)) !== null) {
    threats.push({
      threatType: XmlThreatType.EXTERNAL_ENTITY_PUBLIC,
      severity: XmlThreatSeverity.HIGH,
      description: `Injeção de Entidade Externa XML detectada via cláusula PUBLIC '${publicMatch[3]}'.`,
      triggerSnippet: publicMatch[0],
      evidence: `Entidade '${publicMatch[1]}' tenta resolver DTD externa pública.`,
      mitigationAction: 'STRIP_AND_DISALLOW_DTD'
    });
  }

  // 5. Verificação de Parameter Entities (Blind XXE / OOB Exfiltration)
  const paramEntityRegex = /<!ENTITY\s+%\s+([a-zA-Z0-9_:-]+)\s+(?:SYSTEM|PUBLIC)\s+["']([^"']+)["']/gi;
  let paramMatch: RegExpExecArray | null;
  while ((paramMatch = paramEntityRegex.exec(xml)) !== null) {
    threats.push({
      threatType: XmlThreatType.PARAMETER_ENTITY_INJECTION,
      severity: XmlThreatSeverity.CRITICAL,
      description: 'Tentativa de Injeção de Parameter Entity (Blind / Out-of-Band XXE) detectada.',
      triggerSnippet: paramMatch[0],
      evidence: `Parameter Entity '%${paramMatch[1]}' tenta exfiltração remota ou resolução dinâmica.`,
      mitigationAction: 'REJECT_OR_STRIP'
    });
  }

  // 6. Verificação de Expansão de Entidades (Billion Laughs & Quadratic Blowup)
  const expansionAnalysis = analyzeEntityExpansionFactor(xml);
  if (expansionAnalysis.isBillionLaughs || expansionAnalysis.expansionMultiplier > policy.maxEntityExpansions) {
    threats.push({
      threatType: XmlThreatType.BILLION_LAUGHS_BOMB,
      severity: XmlThreatSeverity.CRITICAL,
      description: `Ataque de Expansão Exponencial de Entidades (XML Bomb / Billion Laughs) detectado. Multiplicador: ${expansionAnalysis.expansionMultiplier}x.`,
      triggerSnippet: `Entidades suspeitas: ${expansionAnalysis.suspiciousEntities.join(', ')}`,
      evidence: 'Cadeia de entidades referenciadas recursivamente visando esgotamento catastrófico de memória.',
      mitigationAction: 'NEUTRALIZE_ENTITY_EXPANSION'
    });
  }

  if (expansionAnalysis.isQuadraticBlowup) {
    threats.push({
      threatType: XmlThreatType.QUADRATIC_BLOWUP,
      severity: XmlThreatSeverity.HIGH,
      description: 'Ataque de Expansão Quadrática (Quadratic Blowup XML DoS) detectado no corpo do documento.',
      triggerSnippet: 'Mais de 80 referências repetitivas à mesma entidade.',
      evidence: 'Multiplicação de entidade de tamanho moderado para esgotar recursos de parsing.',
      mitigationAction: 'STRIP_ENTITIES'
    });
  }

  // 7. Verificação de Inclusões XInclude
  const xincludeRegex = /<([a-zA-Z0-9_:-]*:)?include\s+[^>]*href=["']([^"']+)["'][^>]*\/?>/gi;
  let xincludeMatch: RegExpExecArray | null;
  while ((xincludeMatch = xincludeRegex.exec(xml)) !== null) {
    threats.push({
      threatType: XmlThreatType.XINCLUDE_ATTACK,
      severity: XmlThreatSeverity.HIGH,
      description: `Inclusão externa não autorizada via tag XInclude '${xincludeMatch[0]}'.`,
      triggerSnippet: xincludeMatch[0],
      evidence: `Tag de inclusão tenta carregar arquivo externo: ${xincludeMatch[2]}`,
      mitigationAction: 'STRIP_XINCLUDE_TAGS'
    });
  }

  // 8. Verificação de Redirecionamento de Schemas Externos
  const schemaLocRegex = /xsi:(?:noNamespaceSchemaLocation|schemaLocation)\s*=\s*["']([^"']+)["']/gi;
  let schemaMatch: RegExpExecArray | null;
  while ((schemaMatch = schemaLocRegex.exec(xml)) !== null) {
    const loc = schemaMatch[1];
    const tokens = loc.split(/\s+/);
    const hasExternalUrl = tokens.some(token => 
      /^https?:/i.test(token) && 
      !token.includes('terapiainfoco.com.br') && 
      !token.includes('w3.org') && 
      !token.includes('hl7.org')
    );

    if (hasExternalUrl) {
      threats.push({
        threatType: XmlThreatType.EXTERNAL_SCHEMA_REDIRECTION,
        severity: XmlThreatSeverity.MEDIUM,
        description: `Esquema XML externo não reconhecido em schemaLocation: ${loc}.`,
        triggerSnippet: schemaMatch[0],
        evidence: 'Possível tentativa de schema poisoning ou SSRF via validação XSD remota.',
        mitigationAction: 'STRIP_EXTERNAL_SCHEMA_LOC'
      });
    }
  }

  return {
    threats,
    detectedEntitiesCount: expansionAnalysis.detectedEntitiesCount,
    maxNestingDepth,
    expansionMultiplier: expansionAnalysis.expansionMultiplier
  };
}

/**
 * Higieniza o documento XML removendo DTDs, declarações de entidade e inclusões externas
 */
export function sanitizeXmlString(xml: string): string {
  let cleaned = xml;

  // 1. Remove declarações DOCTYPE completas (incluindo DTD interna entre colchetes)
  cleaned = cleaned.replace(/<!DOCTYPE[\s\S]*?\]\s*>/gi, '');
  cleaned = cleaned.replace(/<!DOCTYPE[\s\S]*?>/gi, '');

  // 2. Remove declarações soltas de <!ENTITY ...>
  cleaned = cleaned.replace(/<!ENTITY[\s\S]*?>/gi, '');

  // 3. Remove tags XInclude (<xi:include ... />)
  cleaned = cleaned.replace(/<([a-zA-Z0-9_:-]*:)?include[\s\S]*?\/>/gi, '');
  cleaned = cleaned.replace(/<([a-zA-Z0-9_:-]*:)?include[\s\S]*?>[\s\S]*?<\/([a-zA-Z0-9_:-]*:)?include>/gi, '');

  // 4. Remove referências a entidades não padronizadas (mantém apenas as 5 entidades pré-definidas XML: &lt;, &gt;, &amp;, &quot;, &apos;)
  cleaned = cleaned.replace(/&(?!(lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);)[a-zA-Z0-9_:-]+;/g, '');

  return cleaned.trim();
}

/**
 * Parser seguro de XML clínico que extrai campos estruturados sem executar código ou resolver DTDs
 */
export function parseSafeClinicalXml(sanitizedXml: string): Record<string, any> {
  const result: Record<string, any> = {
    rootElement: 'ClinicalDocument',
    extractedAt: new Date().toISOString()
  };

  // Extrai elementos XML simples chave-valor (<tag>conteudo</tag>)
  const elementRegex = /<([a-zA-Z0-9_:-]+)(?:\s+[^>]*)?>([^<]+)<\/\1>/g;
  let match: RegExpExecArray | null;

  while ((match = elementRegex.exec(sanitizedXml)) !== null) {
    const rawTag = match[1];
    const val = match[2].trim();
    // Normaliza nome da tag removendo prefixo de namespace (ex: hl7:title -> title)
    const cleanTag = rawTag.includes(':') ? rawTag.split(':')[1] : rawTag;
    result[cleanTag] = val;
  }

  // Detecta se é documento HL7 CDA, FHIR Bundle ou Guia TISS
  if (sanitizedXml.includes('ClinicalDocument') || sanitizedXml.includes('hl7:ClinicalDocument')) {
    result.detectedFormat = XmlClinicalSchemaType.HL7_CDA_R2;
  } else if (sanitizedXml.includes('Bundle') || sanitizedXml.includes('Patient') || sanitizedXml.includes('Observation')) {
    result.detectedFormat = XmlClinicalSchemaType.FHIR_XML_R4;
  } else if (sanitizedXml.includes('guiaConsulta') || sanitizedXml.includes('ans:guia')) {
    result.detectedFormat = XmlClinicalSchemaType.TISS_CLINICAL_GUIDE;
  } else {
    result.detectedFormat = XmlClinicalSchemaType.CUSTOM_EMR_EXPORT;
  }

  return result;
}

/**
 * Emite o Selo Probatório Notarial WORM RFC 8785 de Higienização XML
 */
export function createXmlProofSeal(
  canonicalXmlHash: string,
  cleanDigest: string,
  threatsCount: number,
  schemaType: XmlClinicalSchemaType,
  secretKey: string = DEFAULT_XML_SEAL_SECRET
): XmlProofSeal {
  const timestamp = new Date().toISOString();

  const sealPayload = {
    version: '1.0.0' as const,
    canonicalXmlHash,
    cleanDigest,
    threatsCount,
    schemaType,
    timestamp
  };

  const canonicalString = canonicalJsonStringify(sealPayload);
  const hmacSignature = createHmac('sha256', secretKey).update(canonicalString).digest('base64url');
  const sealId = `xml_guard_v1_${hmacSignature.substring(0, 32)}`;

  return {
    version: '1.0.0',
    sealId,
    timestamp,
    canonicalXmlHash,
    cleanDigest,
    threatsCount,
    schemaType,
    hmacSignature
  };
}

/**
 * Valida a autenticidade e a não-adulteração de um Selo Probatório WORM de XML
 */
export function verifyXmlProofSeal(
  seal: XmlProofSeal | string,
  secretKey: string = DEFAULT_XML_SEAL_SECRET
): { isValid: boolean; parsedSeal?: XmlProofSeal; reason?: string } {
  try {
    let parsed: XmlProofSeal;

    if (typeof seal === 'string') {
      const decoded = Buffer.from(seal, 'base64url').toString('utf-8');
      parsed = JSON.parse(decoded);
    } else {
      parsed = seal;
    }

    if (!parsed || parsed.version !== '1.0.0' || !parsed.hmacSignature || !parsed.sealId) {
      return { isValid: false, reason: 'Formato estrutural do selo de segurança XML inválido.' };
    }

    const verificationPayload = {
      version: parsed.version,
      canonicalXmlHash: parsed.canonicalXmlHash,
      cleanDigest: parsed.cleanDigest,
      threatsCount: parsed.threatsCount,
      schemaType: parsed.schemaType,
      timestamp: parsed.timestamp
    };

    const canonicalString = canonicalJsonStringify(verificationPayload);
    const expectedSignature = createHmac('sha256', secretKey).update(canonicalString).digest('base64url');

    const expectedBuf = Buffer.from(expectedSignature, 'utf-8');
    const actualBuf = Buffer.from(parsed.hmacSignature, 'utf-8');

    if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
      return { isValid: false, reason: 'Assinatura HMAC do selo XML inválida ou chave corrompida.' };
    }

    return { isValid: true, parsedSeal: parsed };
  } catch (err: any) {
    return { isValid: false, reason: `Falha na verificação criptográfica: ${err.message}` };
  }
}

/**
 * Executa a varredura, mitigação e selagem ponta a ponta de um documento XML clínico
 */
export function scanAndSanitizeXml(
  xmlPayload: string,
  schemaType: XmlClinicalSchemaType = XmlClinicalSchemaType.HL7_CDA_R2,
  mode: XmlSanitizationMode = XmlSanitizationMode.STRIP_DTD_AND_PARSE,
  policy: XmlGuardPolicy = DEFAULT_XML_GUARD_POLICY,
  secretKey: string = DEFAULT_XML_SEAL_SECRET
): XmlSanitizationResult {
  // 1. Calcula hash do XML original
  const canonicalXmlHash = createHash('sha256').update(xmlPayload.trim()).digest('hex');

  // 2. Detecta vetores de ameaça léxica e estrutural
  const { threats, detectedEntitiesCount, maxNestingDepth, expansionMultiplier } = detectXmlThreats(xmlPayload, policy);
  const isSafe = threats.length === 0;

  // 3. Sanitização conforme modo operacional
  let sanitizedXml = xmlPayload;
  let parsedData: Record<string, any> | null = null;

  if (mode === XmlSanitizationMode.STRICT_REJECT && !isSafe) {
    sanitizedXml = '';
    parsedData = null;
  } else {
    sanitizedXml = sanitizeXmlString(xmlPayload);
    parsedData = parseSafeClinicalXml(sanitizedXml);
  }

  const cleanDigest = createHash('sha256').update(sanitizedXml).digest('hex');

  // 4. Emissão do Selo Probatório WORM RFC 8785
  const seal = createXmlProofSeal(
    canonicalXmlHash,
    cleanDigest,
    threats.length,
    schemaType,
    secretKey
  );

  return {
    isSafe,
    sanitizedXml,
    parsedData,
    threats,
    detectedEntitiesCount,
    maxNestingDepth,
    expansionMultiplier,
    seal
  };
}
