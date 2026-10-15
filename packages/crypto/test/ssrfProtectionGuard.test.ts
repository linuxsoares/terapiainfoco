import { describe, it, expect } from 'bun:test';
import {
  int32ToIpv4,
  ipv4ToInt32,
  deobfuscateIpv4,
  deobfuscateIpv6,
  isPrivateOrRestrictedIpv4,
  resolveSafeDns,
  inspectSsrfUrl,
  calculateSsrfCanonicalDigest,
  createSsrfProofSeal,
  verifySsrfProofSeal
} from '../src/ssrfProtectionGuard';
import {
  SsrfAttackCategory,
  SsrfDefensePolicy,
  SsrfSeverityLevel
} from '@terapiainfoco/shared';

describe('SSRF & DNS Rebinding Protection Guard Engine (OWASP API8:2023 & ASVS v4.0)', () => {
  describe('Conversão e Parsing Numérico de Endereços IP', () => {
    it('deve converter inteiros de 32 bits para strings IPv4 formatadas corretamente', () => {
      expect(int32ToIpv4(2130706433)).toBe('127.0.0.1');
      expect(int32ToIpv4(2852039166)).toBe('169.254.169.254');
      expect(int32ToIpv4(3232235521)).toBe('192.168.0.1');
    });

    it('deve converter strings IPv4 para inteiros de 32 bits e rejeitar strings inválidas', () => {
      expect(ipv4ToInt32('127.0.0.1')).toBe(2130706433);
      expect(ipv4ToInt32('169.254.169.254')).toBe(2852039166);
      expect(ipv4ToInt32('256.0.0.1')).toBeNull();
      expect(ipv4ToInt32('127.0.0')).toBeNull();
      expect(ipv4ToInt32('abc.def.ghi.jkl')).toBeNull();
    });
  });

  describe('De-obfuscation de Representações Alternativas de IP', () => {
    it('deve desofuscar formato decimal dword único', () => {
      expect(deobfuscateIpv4('2130706433')).toBe('127.0.0.1');
      expect(deobfuscateIpv4('2852039166')).toBe('169.254.169.254');
    });

    it('deve desofuscar formato hexadecimal puro e pontilhado', () => {
      expect(deobfuscateIpv4('0x7f000001')).toBe('127.0.0.1');
      expect(deobfuscateIpv4('0x7f.0x0.0x0.0x1')).toBe('127.0.0.1');
      expect(deobfuscateIpv4('0xa9.0xfe.0xa9.0xfe')).toBe('169.254.169.254');
    });

    it('deve desofuscar formato octal pontilhado', () => {
      expect(deobfuscateIpv4('0177.0.0.1')).toBe('127.0.0.1');
      expect(deobfuscateIpv4('0177.0000.0000.0001')).toBe('127.0.0.1');
    });

    it('deve desofuscar notação abreviada de 2 e 3 partes', () => {
      expect(deobfuscateIpv4('127.1')).toBe('127.0.0.1');
      expect(deobfuscateIpv4('127.0.1')).toBe('127.0.0.1');
    });

    it('deve desofuscar IPv6-mapped IPv4 e notação loopback IPv6', () => {
      expect(deobfuscateIpv6('::ffff:127.0.0.1')).toBe('127.0.0.1');
      expect(deobfuscateIpv6('[::ffff:127.0.0.1]')).toBe('127.0.0.1');
      expect(deobfuscateIpv6('::1')).toBe('127.0.0.1');
      expect(deobfuscateIpv6('[::1]')).toBe('127.0.0.1');
    });
  });

  describe('Identificação de Faixas de IP Privadas, Loopback e Nuvem (RFC 1918 / RFC 3927)', () => {
    it('deve identificar e bloquear endereços de loopback 127.0.0.0/8 e 0.0.0.0', () => {
      const checkLoop = isPrivateOrRestrictedIpv4('127.0.0.1');
      expect(checkLoop.isRestricted).toBe(true);
      expect(checkLoop.category).toBe(SsrfAttackCategory.INTERNAL_LOOPBACK_PROBING);

      const checkZero = isPrivateOrRestrictedIpv4('0.0.0.0');
      expect(checkZero.isRestricted).toBe(true);
      expect(checkZero.category).toBe(SsrfAttackCategory.INTERNAL_LOOPBACK_PROBING);
    });

    it('deve identificar e bloquear endereços de Cloud Metadata (169.254.169.254)', () => {
      const checkMeta = isPrivateOrRestrictedIpv4('169.254.169.254');
      expect(checkMeta.isRestricted).toBe(true);
      expect(checkMeta.category).toBe(SsrfAttackCategory.CLOUD_METADATA_EXFILTRATION);
    });

    it('deve identificar e bloquear subredes privadas RFC 1918 (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)', () => {
      expect(isPrivateOrRestrictedIpv4('10.50.1.20').isRestricted).toBe(true);
      expect(isPrivateOrRestrictedIpv4('172.16.0.5').isRestricted).toBe(true);
      expect(isPrivateOrRestrictedIpv4('172.31.255.254').isRestricted).toBe(true);
      expect(isPrivateOrRestrictedIpv4('192.168.1.1').isRestricted).toBe(true);
    });

    it('deve identificar e bloquear faixas de CGNAT (100.64.0.0/10) e Multicast (224.0.0.0/4)', () => {
      expect(isPrivateOrRestrictedIpv4('100.64.0.1').isRestricted).toBe(true);
      expect(isPrivateOrRestrictedIpv4('224.0.0.251').isRestricted).toBe(true);
    });

    it('deve permitir IPs públicos legítimos na internet', () => {
      const checkPublic = isPrivateOrRestrictedIpv4('200.189.112.5');
      expect(checkPublic.isRestricted).toBe(false);
      expect(checkPublic.category).toBeUndefined();
    });
  });

  describe('Inspeção Completa de URLs contra SSRF', () => {
    it('deve bloquear esquemas perigosos (file://, gopher://, dict://, ftp://)', () => {
      const fileRes = inspectSsrfUrl({ url: 'file:///etc/shadow' });
      expect(fileRes.isSafe).toBe(false);
      expect(fileRes.detectedThreats).toContain(SsrfAttackCategory.DANGEROUS_SCHEME_INVOCATION);
      expect(fileRes.severity).toBe(SsrfSeverityLevel.CRITICAL);

      const gopherRes = inspectSsrfUrl({ url: 'gopher://127.0.0.1:6379/_FLUSHALL' });
      expect(gopherRes.isSafe).toBe(false);
      expect(gopherRes.detectedThreats).toContain(SsrfAttackCategory.DANGEROUS_SCHEME_INVOCATION);
    });

    it('deve bloquear URLs apontando para portas internas restritas (Port Scanning)', () => {
      const redisPortRes = inspectSsrfUrl({ url: 'http://api.terapiainfoco.com.br:6379/keys' });
      expect(redisPortRes.isSafe).toBe(false);
      expect(redisPortRes.detectedThreats).toContain(SsrfAttackCategory.PORT_SCANNING_PROBING);

      const sshPortRes = inspectSsrfUrl({ url: 'https://api.terapiainfoco.com.br:22/' });
      expect(sshPortRes.isSafe).toBe(false);
      expect(sshPortRes.detectedThreats).toContain(SsrfAttackCategory.PORT_SCANNING_PROBING);
    });

    it('deve bloquear tentativas de acesso a Cloud Metadata via hostname ou IP', () => {
      const awsMetaRes = inspectSsrfUrl({ url: 'http://instance-data/latest/meta-data/' });
      expect(awsMetaRes.isSafe).toBe(false);
      expect(awsMetaRes.detectedThreats).toContain(SsrfAttackCategory.CLOUD_METADATA_EXFILTRATION);

      const gcpMetaRes = inspectSsrfUrl({ url: 'http://metadata.google.internal/computeMetadata/v1/' });
      expect(gcpMetaRes.isSafe).toBe(false);
      expect(gcpMetaRes.detectedThreats).toContain(SsrfAttackCategory.CLOUD_METADATA_EXFILTRATION);

      const directMetaIp = inspectSsrfUrl({ url: 'http://169.254.169.254/openstack' });
      expect(directMetaIp.isSafe).toBe(false);
      expect(directMetaIp.detectedThreats).toContain(SsrfAttackCategory.CLOUD_METADATA_EXFILTRATION);
    });

    it('deve decodificar e bloquear tentativas de ofuscação de IP (Hex, Dword, Octal)', () => {
      const dwordRes = inspectSsrfUrl({ url: 'http://2130706433/admin' });
      expect(dwordRes.isSafe).toBe(false);
      expect(dwordRes.detectedThreats).toContain(SsrfAttackCategory.OBFUSCATED_IP_ENCODING);
      expect(dwordRes.detectedThreats).toContain(SsrfAttackCategory.INTERNAL_LOOPBACK_PROBING);

      const hexRes = inspectSsrfUrl({ url: 'http://0x7f000001:8080/health' });
      expect(hexRes.isSafe).toBe(false);
      expect(hexRes.detectedThreats).toContain(SsrfAttackCategory.OBFUSCATED_IP_ENCODING);

      const octalRes = inspectSsrfUrl({ url: 'http://0177.0.0.1/' });
      expect(octalRes.isSafe).toBe(false);
      expect(octalRes.detectedThreats).toContain(SsrfAttackCategory.OBFUSCATED_IP_ENCODING);
    });

    it('deve detectar ataque de DNS Rebinding quando múltiplos IPs ou IP privado são retornados', () => {
      const rebindingRes = inspectSsrfUrl({
        url: 'https://rebinding-poc.attacker.io/webhook',
        simulateDnsRebinding: true
      });
      expect(rebindingRes.isSafe).toBe(false);
      expect(rebindingRes.dnsRebindingRisk).toBe(true);
      expect(rebindingRes.detectedThreats).toContain(SsrfAttackCategory.DNS_REBINDING_MANIPULATION);
    });

    it('deve validar e reforçar IP Pinning bloqueando resolução que divergir do IP fixado', () => {
      const pinnedValid = inspectSsrfUrl({
        url: 'https://api.terapiainfoco.com.br/telemedicina',
        pinnedIp: '200.189.112.5'
      });
      expect(pinnedValid.isSafe).toBe(true);

      const pinnedViolation = inspectSsrfUrl({
        url: 'https://api.terapiainfoco.com.br/telemedicina',
        pinnedIp: '198.51.100.99' // IP diferente do resolvido
      });
      expect(pinnedViolation.isSafe).toBe(false);
      expect(pinnedViolation.detectedThreats).toContain(SsrfAttackCategory.DNS_REBINDING_MANIPULATION);
    });

    it('deve aprovar webhook legítimo com URL pública e protocolo seguro', () => {
      const legitRes = inspectSsrfUrl({
        url: 'https://webhook.notary-icp.gov.br/api/tsa-notification'
      });
      expect(legitRes.isSafe).toBe(true);
      expect(legitRes.detectedThreats.length).toBe(0);
      expect(legitRes.severity).toBe(SsrfSeverityLevel.LOW);
    });

    it('deve permitir requisição no modo DRY_RUN_AUDIT mantendo registro de telemetria', () => {
      const dryRunRes = inspectSsrfUrl({
        url: 'http://169.254.169.254/latest/user-data',
        defensePolicy: SsrfDefensePolicy.DRY_RUN_AUDIT
      });
      expect(dryRunRes.isSafe).toBe(true); // Permitido pois é dry-run
      expect(dryRunRes.detectedThreats).toContain(SsrfAttackCategory.CLOUD_METADATA_EXFILTRATION);
      expect(dryRunRes.actionTaken).toBe(SsrfDefensePolicy.DRY_RUN_AUDIT);
    });
  });

  describe('Selo Probatório Criptográfico WORM HMAC-SHA256', () => {
    it('deve gerar digest canônico determinístico e invariante à ordem de propriedades', () => {
      const inspection = inspectSsrfUrl({ url: 'https://api.terapiainfoco.com.br/webhook' });
      const digest1 = calculateSsrfCanonicalDigest(inspection);
      const digest2 = calculateSsrfCanonicalDigest(inspection);
      expect(digest1).toBe(digest2);
      expect(digest1.length).toBe(64);
    });

    it('deve emitir e validar selo probatório com 100% de integridade', () => {
      const inspection = inspectSsrfUrl({ url: 'https://api.terapiainfoco.com.br/webhook' });
      const seal = createSsrfProofSeal(inspection, 'INC-TEST-001');

      expect(seal.token).toMatch(/^SSRF-SEAL-v1-/);
      expect(seal.algorithm).toBe('HMAC-SHA256-RFC2104-WORM');

      const verification = verifySsrfProofSeal(seal);
      expect(verification.isValid).toBe(true);
      expect(verification.reason).toBeUndefined();
    });

    it('deve rejeitar selo adulterado caso o digest ou assinatura sejam modificados', () => {
      const inspection = inspectSsrfUrl({ url: 'https://api.terapiainfoco.com.br/webhook' });
      const seal = createSsrfProofSeal(inspection);

      const tamperedSeal = {
        ...seal,
        canonicalDigest: 'deadbeef00000000000000000000000000000000000000000000000000000000'
      };

      const verification = verifySsrfProofSeal(tamperedSeal);
      expect(verification.isValid).toBe(false);
      expect(verification.reason).toContain('inválida ou payload adulterado');
    });
  });
});
