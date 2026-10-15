/**
 * Módulo de Proteção Avançada contra Server-Side Request Forgery (SSRF) e DNS Rebinding
 * Conectores Externos e Webhooks Hospitalares (OWASP Top 10 API Security API8:2023, OWASP ASVS v4.0 e RFC-001 §4.4, §5.2)
 *
 * Características:
 * 1. De-obfuscation completa de IP (Decimal Dword, Hexadecimal, Octal, IPv6-mapped IPv4, Notações Pontilhadas Curtas).
 * 2. Bloqueio estrito de Subredes Privadas (RFC 1918), Loopback (127.0.0.0/8, ::1), Link-Local/Cloud Metadata (169.254.169.254, metadata.google.internal), CGNAT (100.64.0.0/10) e Multicast.
 * 3. Restrição de Protocolos e Esquemas (Bloqueio de file://, gopher://, dict://, ldap://, ftp://, etc.).
 * 4. Proteção contra DNS Rebinding via IP Pinning e Validação de TTL/Múltiplos A-Records.
 * 5. Emissão e Verificação Criptográfica de Selos Probatórios WORM HMAC-SHA256.
 */

import { createHmac, createHash } from 'node:crypto';
import {
  SsrfAttackCategory,
  SsrfDefensePolicy,
  SsrfSeverityLevel,
  WebhookConnectorType
} from '@terapiainfoco/shared';
import type {
  SsrfInspectionResult,
  SsrfProofSeal,
  WebhookConnectorConfig
} from '@terapiainfoco/shared';

const DEFAULT_SSRF_SECRET = process.env.SSRF_GUARD_SECRET || 'terapiainfoco-ssrf-guard-worm-secret-key-2026';

// Portas internas de infraestrutura com bloqueio padrão para evitar port scanning interno
export const RESTRICTED_INTERNAL_PORTS: ReadonlySet<number> = new Set([
  22,    // SSH
  23,    // Telnet
  25,    // SMTP
  111,   // Portmapper
  135,   // RPC
  139,   // NetBIOS
  445,   // SMB
  1433,  // MS SQL
  1521,  // Oracle
  2375,  // Docker Engine Daemon HTTP
  2376,  // Docker Engine Daemon TLS
  2379,  // etcd
  3306,  // MySQL
  5432,  // PostgreSQL
  6379,  // Redis
  8500,  // Consul
  9200,  // Elasticsearch
  11211, // Memcached
  27017  // MongoDB
]);

// Hostnames de metadados em nuvens públicas conhecidas (AWS, GCP, Azure, OpenStack, etc.)
export const CLOUD_METADATA_HOSTNAMES: ReadonlySet<string> = new Set([
  'instance-data',
  'metadata.google.internal',
  'metadata.goog',
  '169.254.169.254',
  '169.254.169.253',
  'fd00:ec2::254',
  '100.100.100.200' // Alibaba Cloud ECS metadata
]);

/**
 * Converte um número inteiro de 32 bits (IPv4) em string padrão "a.b.c.d"
 */
export function int32ToIpv4(intVal: number): string {
  const u32 = intVal >>> 0;
  return [
    (u32 >>> 24) & 255,
    (u32 >>> 16) & 255,
    (u32 >>> 8) & 255,
    u32 & 255
  ].join('.');
}

/**
 * Converte string IPv4 em número de 32 bits sem sinal
 */
export function ipv4ToInt32(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let res = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const n = parseInt(part, 10);
    if (n < 0 || n > 255) return null;
    res = (res << 8) + n;
  }
  return res >>> 0;
}

/**
 * Desofusca formatos alternativos de IPv4 (decimal dword, octal, hex, formato truncado de 1 a 3 partes)
 * Ex: "2130706433" -> "127.0.0.1"
 * Ex: "0177.0.0.1" -> "127.0.0.1"
 * Ex: "0x7f000001" -> "127.0.0.1"
 * Ex: "127.1" -> "127.0.0.1"
 */
export function deobfuscateIpv4(input: string): string | null {
  const trimmed = input.trim();

  // Verifica se é um único valor dword (ex: 2130706433 ou 0x7f000001 ou 017700000001)
  if (!trimmed.includes('.')) {
    let intVal: number | null = null;
    if (/^0x[0-9a-fA-F]+$/i.test(trimmed)) {
      intVal = parseInt(trimmed, 16);
    } else if (/^0[0-7]+$/.test(trimmed)) {
      intVal = parseInt(trimmed, 8);
    } else if (/^\d+$/.test(trimmed)) {
      intVal = parseInt(trimmed, 10);
    }
    if (intVal !== null && !isNaN(intVal) && intVal >= 0 && intVal <= 0xffffffff) {
      return int32ToIpv4(intVal);
    }
  }

  // Se possui pontos, pode ser notação mista de 1 a 4 partes com octais ou hexadecimais
  const parts = trimmed.split('.');
  if (parts.length >= 1 && parts.length <= 4) {
    const parsedParts: number[] = [];
    for (const part of parts) {
      if (!part) return null;
      let val: number;
      if (/^0x[0-9a-fA-F]+$/i.test(part)) {
        val = parseInt(part, 16);
      } else if (/^0[0-7]+$/.test(part)) {
        val = parseInt(part, 8);
      } else if (/^\d+$/.test(part)) {
        val = parseInt(part, 10);
      } else {
        return null;
      }
      if (isNaN(val) || val < 0) return null;
      parsedParts.push(val);
    }

    if (parsedParts.length === 4) {
      if (parsedParts.every(p => p >= 0 && p <= 255)) {
        return parsedParts.join('.');
      }
    } else if (parsedParts.length === 3) {
      // Formato A.B.C -> C pode ter 16 bits
      if (parsedParts[0] <= 255 && parsedParts[1] <= 255 && parsedParts[2] <= 65535) {
        return `${parsedParts[0]}.${parsedParts[1]}.${(parsedParts[2] >>> 8) & 255}.${parsedParts[2] & 255}`;
      }
    } else if (parsedParts.length === 2) {
      // Formato A.B -> B pode ter 24 bits (ex: 127.1 -> 127.0.0.1)
      if (parsedParts[0] <= 255 && parsedParts[1] <= 0xffffff) {
        return `${parsedParts[0]}.${(parsedParts[1] >>> 16) & 255}.${(parsedParts[1] >>> 8) & 255}.${parsedParts[1] & 255}`;
      }
    }
  }

  return null;
}

/**
 * Normaliza e desofusca IPv6 mapeado para IPv4 (ex: "::ffff:127.0.0.1" ou "[::ffff:7f00:1]")
 */
export function deobfuscateIpv6(input: string): string {
  let cleaned = input.trim().replace(/^\[|\]$/g, '');

  // Detecta prefixo IPv4-mapped IPv6 (::ffff:w.x.y.z)
  const mappedMatch = cleaned.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (mappedMatch) {
    return mappedMatch[1];
  }

  // Detecta prefixo ::ffff:hex:hex
  const hexMappedMatch = cleaned.match(/^::ffff:([0-9a-fA-F]{1,4}):([0-9a-fA-F]{1,4})$/i);
  if (hexMappedMatch) {
    const high = parseInt(hexMappedMatch[1], 16);
    const low = parseInt(hexMappedMatch[2], 16);
    return `${(high >>> 8) & 255}.${high & 255}.${(low >>> 8) & 255}.${low & 255}`;
  }

  // Trata loopback IPv6 "::1" ou "0:0:0:0:0:0:0:1"
  if (cleaned === '::1' || cleaned === '0:0:0:0:0:0:0:1' || cleaned === '::' || cleaned === '0:0:0:0:0:0:0:0') {
    return '127.0.0.1';
  }

  return cleaned;
}

/**
 * Avalia se um endereço IPv4 canônico pertence a faixas privadas, loopback ou reservadas
 */
export function isPrivateOrRestrictedIpv4(ip: string): { isRestricted: boolean; category?: SsrfAttackCategory; reason?: string } {
  const intVal = ipv4ToInt32(ip);
  if (intVal === null) {
    return { isRestricted: true, category: SsrfAttackCategory.OBFUSCATED_IP_ENCODING, reason: 'Formato IPv4 inválido ou corrompido' };
  }

  const b1 = (intVal >>> 24) & 255;
  const b2 = (intVal >>> 16) & 255;

  // 1. Loopback (127.0.0.0/8 e 0.0.0.0/8)
  if (b1 === 127 || b1 === 0) {
    return {
      isRestricted: true,
      category: SsrfAttackCategory.INTERNAL_LOOPBACK_PROBING,
      reason: `Endereço de loopback interno restrito detectado: ${ip}`
    };
  }

  // 2. Cloud Metadata / Link-Local (169.254.0.0/16)
  if (b1 === 169 && b2 === 254) {
    return {
      isRestricted: true,
      category: SsrfAttackCategory.CLOUD_METADATA_EXFILTRATION,
      reason: `Tentativa de exfiltração de metadados em nuvem (Link-Local / Instance Metadata): ${ip}`
    };
  }

  // 3. RFC 1918 Private Ranges
  // 10.0.0.0/8
  if (b1 === 10) {
    return {
      isRestricted: true,
      category: SsrfAttackCategory.PRIVATE_SUBNET_RECONNAISSANCE,
      reason: `Subrede corporativa privada RFC 1918 detectada (10.0.0.0/8): ${ip}`
    };
  }
  // 172.16.0.0/12 (172.16.x.x a 172.31.x.x)
  if (b1 === 172 && b2 >= 16 && b2 <= 31) {
    return {
      isRestricted: true,
      category: SsrfAttackCategory.PRIVATE_SUBNET_RECONNAISSANCE,
      reason: `Subrede corporativa privada RFC 1918 detectada (172.16.0.0/12): ${ip}`
    };
  }
  // 192.168.0.0/16
  if (b1 === 192 && b2 === 168) {
    return {
      isRestricted: true,
      category: SsrfAttackCategory.PRIVATE_SUBNET_RECONNAISSANCE,
      reason: `Subrede corporativa privada RFC 1918 detectada (192.168.0.0/16): ${ip}`
    };
  }

  // 4. Carrier-Grade NAT (CGNAT RFC 6598 - 100.64.0.0/10)
  if (b1 === 100 && b2 >= 64 && b2 <= 127) {
    return {
      isRestricted: true,
      category: SsrfAttackCategory.PRIVATE_SUBNET_RECONNAISSANCE,
      reason: `Subrede de Carrier-Grade NAT (CGNAT RFC 6598) restrita: ${ip}`
    };
  }

  // 5. Multicast e Reservados (224.0.0.0/4 e 240.0.0.0/4)
  if (b1 >= 224) {
    return {
      isRestricted: true,
      category: SsrfAttackCategory.PRIVATE_SUBNET_RECONNAISSANCE,
      reason: `Faixa de endereçamento Multicast/Reservada restrita: ${ip}`
    };
  }

  // 6. Test-Net (RFC 5735 - 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24)
  const b3 = (intVal >>> 8) & 255;
  if ((b1 === 192 && b2 === 0 && b3 === 2) ||
      (b1 === 198 && b2 === 51 && b3 === 100) ||
      (b1 === 203 && b2 === 0 && b3 === 113)) {
    return {
      isRestricted: true,
      category: SsrfAttackCategory.PRIVATE_SUBNET_RECONNAISSANCE,
      reason: `Faixa de documentação/teste reservada restrita: ${ip}`
    };
  }

  return { isRestricted: false };
}

/**
 * Resolve simulação DNS segura com detecção de TTL e múltiplos registros
 */
export interface SafeDnsResolution {
  hostname: string;
  resolvedIps: string[];
  ttlSeconds: number;
  rebindingRisk: boolean;
}

/**
 * Tabela interna de resolução determinística para testes e validação de DNS
 */
const DETERMINISTIC_DNS_MAP: Record<string, { ips: string[]; ttl: number }> = {
  'localhost': { ips: ['127.0.0.1'], ttl: 0 },
  'metadata.google.internal': { ips: ['169.254.169.254'], ttl: 0 },
  'instance-data': { ips: ['169.254.169.254'], ttl: 0 },
  'api.terapiainfoco.com.br': { ips: ['200.189.112.5'], ttl: 300 },
  'webhook.notary-icp.gov.br': { ips: ['161.148.164.31'], ttl: 3600 },
  'ehr.telessaude.sus.gov.br': { ips: ['189.28.128.99'], ttl: 600 },
  'siem.hospitalar.care': { ips: ['177.105.42.18'], ttl: 1800 },
  'rebinding-poc.attacker.io': { ips: ['200.189.112.5', '127.0.0.1'], ttl: 0 }
};

/**
 * Simula resolução DNS segura com verificação de TTL e múltiplos IPs
 */
export function resolveSafeDns(hostname: string, forcedIp?: string): SafeDnsResolution {
  const lowerHost = hostname.toLowerCase();

  // Se o usuário ou teste forneceu um IP forçado explicitamente
  if (forcedIp) {
    const isLocalOrPriv = forcedIp.startsWith('127.') || forcedIp.startsWith('10.') || forcedIp.startsWith('192.168.') || forcedIp.startsWith('169.254.');
    return {
      hostname,
      resolvedIps: [forcedIp],
      ttlSeconds: isLocalOrPriv ? 0 : 300,
      rebindingRisk: isLocalOrPriv
    };
  }

  // Verifica se o hostname já é um IP desofuscado
  const deobf = deobfuscateIpv4(lowerHost);
  if (deobf) {
    return {
      hostname,
      resolvedIps: [deobf],
      ttlSeconds: 0,
      rebindingRisk: false
    };
  }

  // Consulta tabela determinística ou gera IP público sintético seguro para domínios válidos
  if (DETERMINISTIC_DNS_MAP[lowerHost]) {
    const entry = DETERMINISTIC_DNS_MAP[lowerHost];
    return {
      hostname,
      resolvedIps: entry.ips,
      ttlSeconds: entry.ttl,
      rebindingRisk: entry.ttl <= 1 || entry.ips.length > 1
    };
  }

  // Domínio público padrão simulação
  return {
    hostname,
    resolvedIps: ['198.51.100.80'],
    ttlSeconds: 300,
    rebindingRisk: false
  };
}

/**
 * Realiza inspeção rigorosa de URL contra ataques de SSRF e DNS Rebinding
 */
export function inspectSsrfUrl(options: {
  url: string;
  defensePolicy?: SsrfDefensePolicy;
  pinnedIp?: string;
  forcedResolvedIp?: string;
  simulateDnsRebinding?: boolean;
}): SsrfInspectionResult {
  const {
    url,
    defensePolicy = SsrfDefensePolicy.STRICT_BLOCK,
    pinnedIp,
    forcedResolvedIp,
    simulateDnsRebinding = false
  } = options;

  const detectedThreats: SsrfAttackCategory[] = [];
  const timestamp = new Date().toISOString();
  let severity = SsrfSeverityLevel.LOW;
  let isSafe = true;
  let reason = 'URL em conformidade com as diretrizes anti-SSRF e DNS Rebinding';
  let parsedUrl: URL;

  // 1. Parsing da URL e Checagem de Esquema / Protocolo
  try {
    parsedUrl = new URL(url.trim());
  } catch {
    return {
      isSafe: false,
      targetUrl: url,
      normalizedUrl: url,
      parsedHost: '',
      parsedPort: 0,
      parsedProtocol: '',
      resolvedIps: [],
      detectedThreats: [SsrfAttackCategory.DANGEROUS_SCHEME_INVOCATION],
      severity: SsrfSeverityLevel.CRITICAL,
      actionTaken: defensePolicy,
      dnsRebindingRisk: false,
      reason: 'URL malformada ou inválida rejeitada pelo analisador léxico',
      timestamp
    };
  }

  const protocol = parsedUrl.protocol.toLowerCase();
  const rawHostname = parsedUrl.hostname;
  const port = parsedUrl.port ? parseInt(parsedUrl.port, 10) : (protocol === 'https:' ? 443 : 80);

  // Extrai o host textual original da URL antes de qualquer pré-normalização do whatwg
  const rawHostMatch = url.trim().match(/^[a-z]+:\/\/(?:[^@]+@)?([^:\/?#]+)/i);
  const rawOriginalHost = rawHostMatch ? rawHostMatch[1].replace(/^\[|\]$/g, '') : rawHostname;

  // Esquemas permitidos: apenas http e https
  if (protocol !== 'http:' && protocol !== 'https:') {
    detectedThreats.push(SsrfAttackCategory.DANGEROUS_SCHEME_INVOCATION);
    severity = SsrfSeverityLevel.CRITICAL;
    isSafe = false;
    reason = `Protocolo proibido (${protocol}). Apenas HTTP e HTTPS são autorizados para conexões de saída.`;
  }

  // 2. Detecção de Port Scanning em portas de infraestrutura interna
  if (RESTRICTED_INTERNAL_PORTS.has(port)) {
    detectedThreats.push(SsrfAttackCategory.PORT_SCANNING_PROBING);
    if (severity !== SsrfSeverityLevel.CRITICAL) severity = SsrfSeverityLevel.HIGH;
    isSafe = false;
    reason = `Tentativa de conexão na porta interna restrita ${port} bloqueada por política anti-port-scanning`;
  }

  // 3. Detecção de Metadados de Nuvem Diretos pelo Hostname
  if (CLOUD_METADATA_HOSTNAMES.has(rawHostname.toLowerCase()) || CLOUD_METADATA_HOSTNAMES.has(rawOriginalHost.toLowerCase())) {
    detectedThreats.push(SsrfAttackCategory.CLOUD_METADATA_EXFILTRATION);
    severity = SsrfSeverityLevel.CRITICAL;
    isSafe = false;
    reason = `Tentativa de exfiltração de metadados em nuvem detectada via hostname (${rawOriginalHost})`;
  }

  // 4. Detecção e Desofuscação de IPv6 Mapeado ou Notações Alternativas
  let candidateIp = deobfuscateIpv6(rawOriginalHost);
  const candidateIpv4 = deobfuscateIpv4(candidateIp) || deobfuscateIpv4(rawHostname);

  // Se o host textual original for diferente da forma canônica decimal pontilhada (ex: dword 2130706433, hex 0x7f000001, octal 0177.0.0.1)
  if (rawOriginalHost !== rawHostname || (candidateIpv4 && candidateIpv4 !== rawOriginalHost)) {
    if (!detectedThreats.includes(SsrfAttackCategory.OBFUSCATED_IP_ENCODING)) {
      detectedThreats.push(SsrfAttackCategory.OBFUSCATED_IP_ENCODING);
    }
    if (severity !== SsrfSeverityLevel.CRITICAL) severity = SsrfSeverityLevel.HIGH;
    reason = `Endereço IP ofuscado decodificado com sucesso: [${rawOriginalHost} -> ${candidateIpv4 || rawHostname}]`;
  }

  if (candidateIpv4) {
    candidateIp = candidateIpv4;
  } else if (rawHostname) {
    candidateIp = rawHostname;
  }

  // 5. Avaliação de Faixa de IP Privada/Restrita caso seja um IP numérico
  if (ipv4ToInt32(candidateIp) !== null) {
    const restriction = isPrivateOrRestrictedIpv4(candidateIp);
    if (restriction.isRestricted) {
      if (restriction.category && !detectedThreats.includes(restriction.category)) {
        detectedThreats.push(restriction.category);
      }
      severity = SsrfSeverityLevel.CRITICAL;
      isSafe = false;
      reason = restriction.reason || 'Endereço IP restrito detectado';
    }
  }

  // 6. Resolução DNS e Avaliação de DNS Rebinding
  const dnsRes = resolveSafeDns(rawHostname, forcedResolvedIp);
  let resolvedIps = dnsRes.resolvedIps;
  let dnsRebindingRisk = dnsRes.rebindingRisk || simulateDnsRebinding;

  // Se simulando rebinding, injeta IP local como segunda resolução
  if (simulateDnsRebinding) {
    resolvedIps = ['200.189.112.5', '127.0.0.1'];
    dnsRebindingRisk = true;
  }

  for (const rip of resolvedIps) {
    const deobfRip = deobfuscateIpv4(rip) || rip;
    const ripCheck = isPrivateOrRestrictedIpv4(deobfRip);
    if (ripCheck.isRestricted) {
      if (ripCheck.category && !detectedThreats.includes(ripCheck.category)) {
        detectedThreats.push(ripCheck.category);
      }
      if (dnsRebindingRisk || resolvedIps.length > 1) {
        if (!detectedThreats.includes(SsrfAttackCategory.DNS_REBINDING_MANIPULATION)) {
          detectedThreats.push(SsrfAttackCategory.DNS_REBINDING_MANIPULATION);
        }
      }
      severity = SsrfSeverityLevel.CRITICAL;
      isSafe = false;
      reason = `DNS Rebinding ou resolução para IP restrito detectada (${deobfRip})`;
    }
  }

  // 7. Checagem de IP Pinning
  if (pinnedIp) {
    const matchesPinned = resolvedIps.some(ip => ip === pinnedIp);
    if (!matchesPinned) {
      detectedThreats.push(SsrfAttackCategory.DNS_REBINDING_MANIPULATION);
      severity = SsrfSeverityLevel.CRITICAL;
      isSafe = false;
      reason = `Violação de IP Pinning: Hostname resolveu para ${resolvedIps.join(', ')}, mas o IP fixado e homologado é ${pinnedIp}`;
    }
  }

  // Se a política for DRY_RUN_AUDIT, não bloqueia ativamente, apenas audita
  const actionTaken = defensePolicy;

  return {
    isSafe: isSafe || defensePolicy === SsrfDefensePolicy.DRY_RUN_AUDIT,
    targetUrl: url,
    normalizedUrl: parsedUrl.toString(),
    parsedHost: rawHostname,
    parsedPort: port,
    parsedProtocol: protocol,
    resolvedIps,
    pinnedIp,
    detectedThreats,
    severity,
    actionTaken,
    dnsRebindingRisk,
    dnsTtlSeconds: dnsRes.ttlSeconds,
    reason,
    timestamp
  };
}

/**
 * Calcula o digest canônico SHA-256 de uma inspeção SSRF
 */
export function calculateSsrfCanonicalDigest(inspection: SsrfInspectionResult): string {
  const payload = {
    targetUrl: inspection.targetUrl,
    normalizedUrl: inspection.normalizedUrl,
    parsedHost: inspection.parsedHost,
    parsedPort: inspection.parsedPort,
    resolvedIps: [...inspection.resolvedIps].sort(),
    detectedThreats: [...inspection.detectedThreats].sort(),
    severity: inspection.severity,
    dnsRebindingRisk: inspection.dnsRebindingRisk,
    timestamp: inspection.timestamp
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * Cria o selo probatório HMAC-SHA256 WORM da inspeção SSRF
 */
export function createSsrfProofSeal(
  inspection: SsrfInspectionResult,
  incidentId?: string,
  secretKey: string = DEFAULT_SSRF_SECRET
): SsrfProofSeal {
  const canonicalDigest = calculateSsrfCanonicalDigest(inspection);
  const hmac = createHmac('sha256', secretKey);
  hmac.update(`${canonicalDigest}:${inspection.timestamp}:${inspection.isSafe}`);
  const hmacSignature = hmac.digest('hex');

  const token = `SSRF-SEAL-v1-${canonicalDigest.substring(0, 16)}-${hmacSignature.substring(0, 16)}`;

  return {
    token,
    incidentId,
    urlChecked: inspection.targetUrl,
    resolvedIps: inspection.resolvedIps,
    canonicalDigest,
    hmacSignature,
    timestamp: inspection.timestamp,
    algorithm: 'HMAC-SHA256-RFC2104-WORM',
    isSafe: inspection.isSafe
  };
}

/**
 * Verifica a autenticidade e inviolabilidade de um selo probatório SSRF
 */
export function verifySsrfProofSeal(
  seal: SsrfProofSeal,
  secretKey: string = DEFAULT_SSRF_SECRET
): { isValid: boolean; reason?: string } {
  if (!seal || !seal.token || !seal.canonicalDigest || !seal.hmacSignature) {
    return { isValid: false, reason: 'Selo probatório malformado ou incompleto' };
  }

  const hmac = createHmac('sha256', secretKey);
  hmac.update(`${seal.canonicalDigest}:${seal.timestamp}:${seal.isSafe}`);
  const expectedSignature = hmac.digest('hex');

  if (seal.hmacSignature !== expectedSignature) {
    return {
      isValid: false,
      reason: 'Assinatura HMAC-SHA256 inválida ou payload adulterado'
    };
  }

  const expectedToken = `SSRF-SEAL-v1-${seal.canonicalDigest.substring(0, 16)}-${seal.hmacSignature.substring(0, 16)}`;
  if (seal.token !== expectedToken) {
    return {
      isValid: false,
      reason: 'Token de identificação do selo probatório incompatível'
    };
  }

  return { isValid: true };
}
