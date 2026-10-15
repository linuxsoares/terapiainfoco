import { describe, expect, it } from 'bun:test';
import {
  canonicalStringify,
  evaluateDeviceViolations,
  calculateDeviceTrustScore,
  determineEnforcementDecision,
  createDevicePostureProofSeal,
  verifyDevicePostureProofSeal,
  evaluateDevicePosture,
  DEVICE_POSTURE_PRESET_SCENARIOS
} from '../src/devicePostureGuard';
import {
  DeviceTrustTier,
  DevicePlatform,
  DeviceViolationCategory,
  DevicePostureEnforcementPolicy,
  DevicePostureDecision
} from '@terapiainfoco/shared';
import type { DevicePostureTelemetry } from '@terapiainfoco/shared';

describe('Zero Trust Device Posture Assessment Engine (NIST SP 800-207 & OWASP MASVS)', () => {
  const baseTelemetry: DevicePostureTelemetry = {
    platform: DevicePlatform.MACOS_DESKTOP,
    osName: 'macOS Sonoma',
    osVersion: '14.5',
    browser: 'Chrome',
    browserVersion: '128.0.0',
    isRootedOrJailbroken: false,
    isDebuggerPresent: false,
    isEmulator: false,
    isDiskEncrypted: true,
    isScreenLockEnabled: true,
    devToolsOpen: false,
    suspiciousHooksDetected: false,
    clockSkewSeconds: 0.5,
    userAgent: 'Mozilla/5.0 macOS',
    clientIp: '189.40.112.55'
  };

  describe('canonicalStringify (RFC 8785 JCS)', () => {
    it('deve produzir o mesmo JSON determinístico independentemente da ordem das propriedades', () => {
      const objA = { z: 1, a: 'teste', m: { b: 2, a: 1 } };
      const objB = { a: 'teste', m: { a: 1, b: 2 }, z: 1 };

      expect(canonicalStringify(objA)).toBe(canonicalStringify(objB));
      expect(canonicalStringify(objA)).toBe('{"a":"teste","m":{"a":1,"b":2},"z":1}');
    });

    it('deve lidar corretamente com arrays, números e strings vazias', () => {
      const payload = { items: [3, 2, 1], flag: false, empty: '' };
      expect(canonicalStringify(payload)).toBe('{"empty":"","flag":false,"items":[3,2,1]}');
    });
  });

  describe('evaluateDeviceViolations', () => {
    it('deve retornar zero violações para terminal totalmente conforme e atualizado', () => {
      const violations = evaluateDeviceViolations(baseTelemetry);
      expect(violations.length).toBe(0);
    });

    it('deve detectar Root/Jailbreak como violação CRITICAL com recomendação oficial de remediação', () => {
      const telemetry: DevicePostureTelemetry = {
        ...baseTelemetry,
        isRootedOrJailbroken: true
      };

      const violations = evaluateDeviceViolations(telemetry);
      const rootViol = violations.find(v => v.category === DeviceViolationCategory.ROOT_JAILBREAK_DETECTED);

      expect(rootViol).toBeDefined();
      expect(rootViol?.severity).toBe('CRITICAL');
      expect(rootViol?.remediation).toContain('restaure o sistema operacional oficial');
    });

    it('deve detectar depurador acoplado e injeção de hooks como violações CRITICAL', () => {
      const telemetry: DevicePostureTelemetry = {
        ...baseTelemetry,
        isDebuggerPresent: true,
        suspiciousHooksDetected: true
      };

      const violations = evaluateDeviceViolations(telemetry);
      expect(violations.length).toBe(2);
      expect(violations.every(v => v.severity === 'CRITICAL')).toBe(true);
      expect(violations.some(v => v.category === DeviceViolationCategory.DEBUGGER_ATTACHED)).toBe(true);
      expect(violations.some(v => v.category === DeviceViolationCategory.SUSPICIOUS_HOOKS_INJECTED)).toBe(true);
    });

    it('deve detectar emulador e disco sem criptografia como violações HIGH', () => {
      const telemetry: DevicePostureTelemetry = {
        ...baseTelemetry,
        isEmulator: true,
        isDiskEncrypted: false
      };

      const violations = evaluateDeviceViolations(telemetry);
      expect(violations.length).toBe(2);
      expect(violations.every(v => v.severity === 'HIGH')).toBe(true);
      expect(violations.some(v => v.category === DeviceViolationCategory.EMULATOR_DETECTED)).toBe(true);
      expect(violations.some(v => v.category === DeviceViolationCategory.DISK_ENCRYPTION_DISABLED)).toBe(true);
    });

    it('deve detectar DevTools abertas e ausência de bloqueio de tela como violações MEDIUM', () => {
      const telemetry: DevicePostureTelemetry = {
        ...baseTelemetry,
        isScreenLockEnabled: false,
        devToolsOpen: true
      };

      const violations = evaluateDeviceViolations(telemetry);
      expect(violations.length).toBe(2);
      expect(violations.every(v => v.severity === 'MEDIUM')).toBe(true);
      expect(violations.some(v => v.category === DeviceViolationCategory.SCREEN_LOCK_MISSING)).toBe(true);
      expect(violations.some(v => v.category === DeviceViolationCategory.DEVTOOLS_TAMPERING)).toBe(true);
    });

    it('deve identificar desvio de relógio (> 30s) como violação LOW e ignorar desvios normais', () => {
      const normalClock = evaluateDeviceViolations({ ...baseTelemetry, clockSkewSeconds: 15.0 });
      expect(normalClock.some(v => v.category === DeviceViolationCategory.CLOCK_SKEW_EXCESSIVE)).toBe(false);

      const skewedClock = evaluateDeviceViolations({ ...baseTelemetry, clockSkewSeconds: 45.0 });
      const clockViol = skewedClock.find(v => v.category === DeviceViolationCategory.CLOCK_SKEW_EXCESSIVE);
      expect(clockViol).toBeDefined();
      expect(clockViol?.severity).toBe('LOW');
    });

    it('deve identificar sistemas operacionais obsoletos com vulnerabilidades conhecidas', () => {
      const win7 = evaluateDeviceViolations({
        ...baseTelemetry,
        osName: 'Windows 7 Professional',
        osVersion: '7.0'
      });
      expect(win7.some(v => v.category === DeviceViolationCategory.OS_OUTDATED_CRITICAL)).toBe(true);

      const macOld = evaluateDeviceViolations({
        ...baseTelemetry,
        osName: 'macOS Mojave',
        osVersion: '10.14'
      });
      expect(macOld.some(v => v.category === DeviceViolationCategory.OS_OUTDATED_CRITICAL)).toBe(true);
    });
  });

  describe('calculateDeviceTrustScore', () => {
    it('deve atribuir score 100 e Tier TRUSTED na ausência de violações', () => {
      const result = calculateDeviceTrustScore([]);
      expect(result.score).toBe(100);
      expect(result.tier).toBe(DeviceTrustTier.TRUSTED);
    });

    it('deve pontuar penalidades acumuladas e classificar em tiers corretos', () => {
      // 100 - 20 (disco) = 80 -> MONITORED (70-84)
      const diskViol = evaluateDeviceViolations({ ...baseTelemetry, isDiskEncrypted: false });
      const resMonitored = calculateDeviceTrustScore(diskViol);
      expect(resMonitored.score).toBe(80);
      expect(resMonitored.tier).toBe(DeviceTrustTier.MONITORED);

      // 100 - 35 (emulador) - 20 (disco) = 45 -> RISKY (40-69)
      const riskyViol = evaluateDeviceViolations({ ...baseTelemetry, isEmulator: true, isDiskEncrypted: false });
      const resRisky = calculateDeviceTrustScore(riskyViol);
      expect(resRisky.score).toBe(45);
      expect(resRisky.tier).toBe(DeviceTrustTier.RISKY);

      // 100 - 50 (root) - 40 (debugger) = 10 -> UNTRUSTED_BLOCKED (< 40)
      const blockedViol = evaluateDeviceViolations({ ...baseTelemetry, isRootedOrJailbroken: true, isDebuggerPresent: true });
      const resBlocked = calculateDeviceTrustScore(blockedViol);
      expect(resBlocked.score).toBe(10);
      expect(resBlocked.tier).toBe(DeviceTrustTier.UNTRUSTED_BLOCKED);
    });

    it('deve realizar clamp do score inferior em zero mesmo com penalidades excessivas', () => {
      const violations = evaluateDeviceViolations({
        ...baseTelemetry,
        isRootedOrJailbroken: true,
        isDebuggerPresent: true,
        suspiciousHooksDetected: true,
        isEmulator: true,
        isDiskEncrypted: false
      });

      const res = calculateDeviceTrustScore(violations);
      expect(res.score).toBe(0);
      expect(res.tier).toBe(DeviceTrustTier.UNTRUSTED_BLOCKED);
    });
  });

  describe('determineEnforcementDecision', () => {
    it('deve bloquear imediatamente com BLOCKED_QUARANTINED sob violação CRITICAL em qualquer política com enforcement', () => {
      const critViol = evaluateDeviceViolations({ ...baseTelemetry, isRootedOrJailbroken: true });

      const decStrict = determineEnforcementDecision(50, critViol, DevicePostureEnforcementPolicy.STRICT_BLOCK);
      expect(decStrict).toBe(DevicePostureDecision.BLOCKED_QUARANTINED);

      const decStepUp = determineEnforcementDecision(50, critViol, DevicePostureEnforcementPolicy.STEP_UP_AUTH);
      expect(decStepUp).toBe(DevicePostureDecision.BLOCKED_QUARANTINED);

      const decAudit = determineEnforcementDecision(50, critViol, DevicePostureEnforcementPolicy.AUDIT_ONLY_MONITOR);
      expect(decAudit).toBe(DevicePostureDecision.ALLOWED);
    });

    it('deve aplicar regras graduadas sob política STRICT_BLOCK', () => {
      expect(determineEnforcementDecision(95, [], DevicePostureEnforcementPolicy.STRICT_BLOCK)).toBe(DevicePostureDecision.ALLOWED);
      expect(determineEnforcementDecision(80, [], DevicePostureEnforcementPolicy.STRICT_BLOCK)).toBe(DevicePostureDecision.STEP_UP_REQUIRED);
      expect(determineEnforcementDecision(65, [], DevicePostureEnforcementPolicy.STRICT_BLOCK)).toBe(DevicePostureDecision.BLOCKED_QUARANTINED);
    });

    it('deve aplicar degradação para somente-leitura sob política READ_ONLY_DEGRADATION', () => {
      expect(determineEnforcementDecision(75, [], DevicePostureEnforcementPolicy.READ_ONLY_DEGRADATION)).toBe(DevicePostureDecision.RESTRICTED_READ_ONLY);
      expect(determineEnforcementDecision(35, [], DevicePostureEnforcementPolicy.READ_ONLY_DEGRADATION)).toBe(DevicePostureDecision.BLOCKED_QUARANTINED);
    });
  });

  describe('createDevicePostureProofSeal e verifyDevicePostureProofSeal', () => {
    const assessmentData = {
      assessmentId: 'eval_unit_test_123',
      deviceId: 'dev_mac_1',
      trustScore: 92,
      trustTier: DeviceTrustTier.TRUSTED,
      decision: DevicePostureDecision.ALLOWED,
      violationsCount: 0,
      assessedAt: '2026-10-15T12:00:00.000Z'
    };

    it('deve emitir um selo WORM no formato posture_proof_v1_<base64url>', () => {
      const seal = createDevicePostureProofSeal(assessmentData);
      expect(seal.token.startsWith('posture_proof_v1_')).toBe(true);
      expect(seal.canonicalDigest).toBeDefined();
      expect(seal.hmacSignature).toBeDefined();
      expect(seal.trustScore).toBe(92);
      expect(seal.trustTier).toBe(DeviceTrustTier.TRUSTED);
    });

    it('deve validar com 100% de sucesso o selo probatório íntegro', () => {
      const seal = createDevicePostureProofSeal(assessmentData);
      const verification = verifyDevicePostureProofSeal(seal, assessmentData);
      expect(verification.isValid).toBe(true);
      expect(verification.reason).toBeUndefined();
    });

    it('deve rejeitar selo caso os dados da avaliação tenham sido alterados retroativamente (adulteração de digest)', () => {
      const seal = createDevicePostureProofSeal(assessmentData);

      // Atacante tenta fingir que o score foi 100 em vez de 92
      const tamperedData = {
        ...assessmentData,
        trustScore: 100
      };

      const verification = verifyDevicePostureProofSeal(seal, tamperedData);
      expect(verification.isValid).toBe(false);
      expect(verification.reason).toContain('Divergência no digest canônico');
    });

    it('deve rejeitar selo caso a assinatura HMAC tenha sido forjada ou chave incorreta', () => {
      const seal = createDevicePostureProofSeal(assessmentData, 'secret_oficial_1');
      const verification = verifyDevicePostureProofSeal(seal, assessmentData, 'secret_forjado_2');

      expect(verification.isValid).toBe(false);
      expect(verification.reason).toContain('Assinatura digital HMAC inválida');
    });
  });

  describe('evaluateDevicePosture (Fluxo Ponta a Ponta)', () => {
    it('deve avaliar dispositivo corporativo e produzir laudo completo com selo notarial verificado', () => {
      const result = evaluateDevicePosture({
        deviceId: 'dev_clinica_01',
        deviceName: 'MacBook Pro Clínica',
        therapistId: 'usr_terapeuta_titular',
        telemetry: baseTelemetry,
        policy: DevicePostureEnforcementPolicy.STRICT_BLOCK
      });

      expect(result.assessmentId).toBeDefined();
      expect(result.trustScore).toBe(100);
      expect(result.trustTier).toBe(DeviceTrustTier.TRUSTED);
      expect(result.decision).toBe(DevicePostureDecision.ALLOWED);
      expect(result.violations.length).toBe(0);
      expect(result.proofSeal.token.startsWith('posture_proof_v1_')).toBe(true);

      const verification = verifyDevicePostureProofSeal(result.proofSeal, {
        assessmentId: result.assessmentId,
        deviceId: result.deviceId,
        trustScore: result.trustScore,
        trustTier: result.trustTier,
        decision: result.decision,
        violationsCount: result.violations.length,
        assessedAt: result.assessedAt
      });
      expect(verification.isValid).toBe(true);
    });
  });

  describe('Cenários Pré-Configurados (Pentest & Demonstração)', () => {
    it('deve avaliar o cenário COMPLIANT_MAC_WORKSTATION como ALLOWED e TRUSTED', () => {
      const scenario = DEVICE_POSTURE_PRESET_SCENARIOS.COMPLIANT_MAC_WORKSTATION;
      const result = evaluateDevicePosture({
        deviceId: 'dev_scenario_1',
        deviceName: scenario.deviceName,
        therapistId: 'usr_titular',
        telemetry: scenario.telemetry,
        policy: DevicePostureEnforcementPolicy.STRICT_BLOCK
      });

      expect(result.trustScore).toBeGreaterThanOrEqual(85);
      expect(result.trustTier).toBe(DeviceTrustTier.TRUSTED);
      expect(result.decision).toBe(DevicePostureDecision.ALLOWED);
    });

    it('deve avaliar o cenário ROOTED_ANDROID_WITH_FRIDA como BLOCKED_QUARANTINED e UNTRUSTED_BLOCKED', () => {
      const scenario = DEVICE_POSTURE_PRESET_SCENARIOS.ROOTED_ANDROID_WITH_FRIDA;
      const result = evaluateDevicePosture({
        deviceId: 'dev_scenario_root',
        deviceName: scenario.deviceName,
        therapistId: 'usr_titular',
        telemetry: scenario.telemetry,
        policy: DevicePostureEnforcementPolicy.STRICT_BLOCK
      });

      expect(result.trustScore).toBeLessThan(40);
      expect(result.trustTier).toBe(DeviceTrustTier.UNTRUSTED_BLOCKED);
      expect(result.decision).toBe(DevicePostureDecision.BLOCKED_QUARANTINED);
      expect(result.violations.some(v => v.category === DeviceViolationCategory.ROOT_JAILBREAK_DETECTED)).toBe(true);
      expect(result.violations.some(v => v.category === DeviceViolationCategory.DEBUGGER_ATTACHED)).toBe(true);
    });

    it('deve avaliar o cenário UNENCRYPTED_DISK_WINDOWS gerando STEP_UP_REQUIRED sob STRICT_BLOCK', () => {
      const scenario = DEVICE_POSTURE_PRESET_SCENARIOS.UNENCRYPTED_DISK_WINDOWS;
      const result = evaluateDevicePosture({
        deviceId: 'dev_scenario_unencrypted',
        deviceName: scenario.deviceName,
        therapistId: 'usr_titular',
        telemetry: scenario.telemetry,
        policy: DevicePostureEnforcementPolicy.STRICT_BLOCK
      });

      expect(result.trustScore).toBe(80);
      expect(result.trustTier).toBe(DeviceTrustTier.MONITORED);
      expect(result.decision).toBe(DevicePostureDecision.STEP_UP_REQUIRED);
      expect(result.violations.some(v => v.category === DeviceViolationCategory.DISK_ENCRYPTION_DISABLED)).toBe(true);
    });
  });
});
