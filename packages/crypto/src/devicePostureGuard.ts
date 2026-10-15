import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import {
  DeviceTrustTier,
  DevicePlatform,
  DeviceViolationCategory,
  DevicePostureEnforcementPolicy,
  DevicePostureDecision
} from '@terapiainfoco/shared';
import type {
  DevicePostureTelemetry,
  DevicePostureViolation,
  DevicePostureProofSeal,
  DevicePostureAssessmentResult
} from '@terapiainfoco/shared';

const DEFAULT_POSTURE_SECRET = process.env.POSTURE_HMAC_SECRET || 'terapiainfoco_zero_trust_posture_secret_2026';

/**
 * Serialização canônica JSON determinística (RFC 8785 - JSON Canonicalization Scheme)
 */
export function canonicalStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(item => canonicalStringify(item)).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`).join(',') + '}';
}

/**
 * Avaliação heurística e identificação de violações de postura em telemetria de endpoint
 */
export function evaluateDeviceViolations(telemetry: DevicePostureTelemetry): DevicePostureViolation[] {
  const violations: DevicePostureViolation[] = [];
  const now = new Date().toISOString();

  // 1. Verificação de Root / Jailbreak (Acesso Privilegiado não autorizado)
  if (telemetry.isRootedOrJailbroken) {
    violations.push({
      id: `viol_root_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      category: DeviceViolationCategory.ROOT_JAILBREAK_DETECTED,
      severity: 'CRITICAL',
      description: 'Presença de privilégios de superusuário (Root/Jailbreak) detectada no kernel do dispositivo.',
      remediation: 'Remova modificações de firmware e restaure o sistema operacional oficial do fabricante antes de acessar prontuários clínicos.',
      detectedAt: now
    });
  }

  // 2. Verificação de Depurador Acoplado (Debugger / GDB / LLDB / Frida)
  if (telemetry.isDebuggerPresent) {
    violations.push({
      id: `viol_dbg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      category: DeviceViolationCategory.DEBUGGER_ATTACHED,
      severity: 'CRITICAL',
      description: 'Processo de depuração ou inspeção dinâmica de memória acoplado ao runtime.',
      remediation: 'Feche utilitários de engenharia reversa e ferramentas de depuração (Frida, GDB, LLDB, x64dbg) para proteger o enclave criptográfico.',
      detectedAt: now
    });
  }

  // 3. Verificação de Injeção de Hooks em Runtime (Xposed, Cydia Substrate, etc.)
  if (telemetry.suspiciousHooksDetected) {
    violations.push({
      id: `viol_hook_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      category: DeviceViolationCategory.SUSPICIOUS_HOOKS_INJECTED,
      severity: 'CRITICAL',
      description: 'Injeção de hooks em runtime identificada manipulando APIs nativas do navegador ou do aplicativo.',
      remediation: 'Desinstale frameworks de hooking ou extensões de terceiros que modifiquem os protótipos de segurança do cliente.',
      detectedAt: now
    });
  }

  // 4. Verificação de Emulador ou Máquina Virtual Hostil
  if (telemetry.isEmulator) {
    violations.push({
      id: `viol_emu_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      category: DeviceViolationCategory.EMULATOR_DETECTED,
      severity: 'HIGH',
      description: 'Execução em ambiente virtualizado ou emulador não homologado para atendimento de telepsicologia.',
      remediation: 'Utilize um dispositivo físico dedicado homologado para garantir a integridade dos canais de áudio e vídeo da teleconsulta.',
      detectedAt: now
    });
  }

  // 5. Criptografia de Disco em Repouso Desativada (FileVault / BitLocker / LUKS)
  if (!telemetry.isDiskEncrypted) {
    violations.push({
      id: `viol_disk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      category: DeviceViolationCategory.DISK_ENCRYPTION_DISABLED,
      severity: 'HIGH',
      description: 'Criptografia de volume completo de disco em repouso (BitLocker / FileVault / LUKS) desativada.',
      remediation: 'Ative a criptografia de disco completo nas configurações do sistema operacional para cumprir o Art. 46 da LGPD.',
      detectedAt: now
    });
  }

  // 6. Ausência de Bloqueio de Tela / Biometria
  if (!telemetry.isScreenLockEnabled) {
    violations.push({
      id: `viol_lock_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      category: DeviceViolationCategory.SCREEN_LOCK_MISSING,
      severity: 'MEDIUM',
      description: 'Terminal sem senha de bloqueio de tela, PIN ou autenticação biométrica configurada.',
      remediation: 'Configure um bloqueio de tela automático de até 5 minutos com autenticação biométrica ou senha forte.',
      detectedAt: now
    });
  }

  // 7. DevTools Abertas com Possível Manipulação de Console em Produção
  if (telemetry.devToolsOpen) {
    violations.push({
      id: `viol_dt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      category: DeviceViolationCategory.DEVTOOLS_TAMPERING,
      severity: 'MEDIUM',
      description: 'Ferramentas de desenvolvedor (DevTools) ativas durante a sessão clínica com risco de console injection.',
      remediation: 'Feche as ferramentas de desenvolvedor do navegador durante a rotina clínica confidencial.',
      detectedAt: now
    });
  }

  // 8. Desvio Temporal Excessivo de Relógio (Clock Skew Anti-Forense)
  if (Math.abs(telemetry.clockSkewSeconds) > 30) {
    violations.push({
      id: `viol_clk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      category: DeviceViolationCategory.CLOCK_SKEW_EXCESSIVE,
      severity: 'LOW',
      description: `Desvio de relógio detectado (${Math.abs(telemetry.clockSkewSeconds)}s) superior à tolerância admitida para carimbo temporal RFC 3161.`,
      remediation: 'Ative a sincronização automática de data e hora via NTP (Hora Legal Brasileira / Observatório Nacional).',
      detectedAt: now
    });
  }

  // 9. Sistema Operacional Obsoleto com Vulnerabilidades Críticas Conhecidas
  const osLower = (telemetry.osName || '').toLowerCase();
  const ver = parseFloat(telemetry.osVersion || '0');
  let isOutdated = false;

  if (osLower.includes('windows') && ver < 10) {
    isOutdated = true;
  } else if (osLower.includes('mac') && ver < 12) {
    isOutdated = true;
  } else if (osLower.includes('ios') && ver < 15) {
    isOutdated = true;
  } else if (osLower.includes('android') && ver < 11) {
    isOutdated = true;
  }

  if (isOutdated) {
    violations.push({
      id: `viol_os_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      category: DeviceViolationCategory.OS_OUTDATED_CRITICAL,
      severity: 'HIGH',
      description: `Versão legada do sistema operacional (${telemetry.osName} ${telemetry.osVersion}) sem suporte a patches de segurança recentes.`,
      remediation: 'Atualize o sistema operacional para uma versão estável e com suporte ativo do fornecedor.',
      detectedAt: now
    });
  }

  return violations;
}

/**
 * Cálculo ponderado do Score de Confiança do Dispositivo (0 a 100)
 */
export function calculateDeviceTrustScore(violations: DevicePostureViolation[]): {
  score: number;
  tier: DeviceTrustTier;
} {
  let score = 100;

  for (const v of violations) {
    switch (v.category) {
      case DeviceViolationCategory.ROOT_JAILBREAK_DETECTED:
        score -= 50;
        break;
      case DeviceViolationCategory.DEBUGGER_ATTACHED:
        score -= 40;
        break;
      case DeviceViolationCategory.SUSPICIOUS_HOOKS_INJECTED:
        score -= 40;
        break;
      case DeviceViolationCategory.EMULATOR_DETECTED:
        score -= 35;
        break;
      case DeviceViolationCategory.OS_OUTDATED_CRITICAL:
        score -= 25;
        break;
      case DeviceViolationCategory.DISK_ENCRYPTION_DISABLED:
        score -= 20;
        break;
      case DeviceViolationCategory.SCREEN_LOCK_MISSING:
        score -= 15;
        break;
      case DeviceViolationCategory.DEVTOOLS_TAMPERING:
        score -= 15;
        break;
      case DeviceViolationCategory.CLOCK_SKEW_EXCESSIVE:
        score -= 10;
        break;
      default:
        score -= 10;
        break;
    }
  }

  score = Math.max(0, Math.min(100, score));

  let tier: DeviceTrustTier;
  if (score >= 85) {
    tier = DeviceTrustTier.TRUSTED;
  } else if (score >= 70) {
    tier = DeviceTrustTier.MONITORED;
  } else if (score >= 40) {
    tier = DeviceTrustTier.RISKY;
  } else {
    tier = DeviceTrustTier.UNTRUSTED_BLOCKED;
  }

  return { score, tier };
}

/**
 * Determinação da Decisão de Acesso Zero Trust conforme a política ativa
 */
export function determineEnforcementDecision(
  trustScore: number,
  violations: DevicePostureViolation[],
  policy: DevicePostureEnforcementPolicy
): DevicePostureDecision {
  const hasCritical = violations.some(v => v.severity === 'CRITICAL');

  // Violações críticas (Root/Debugger/Hooks) bloqueiam em qualquer modo, exceto auditoria pura
  if (hasCritical && policy !== DevicePostureEnforcementPolicy.AUDIT_ONLY_MONITOR) {
    return DevicePostureDecision.BLOCKED_QUARANTINED;
  }

  switch (policy) {
    case DevicePostureEnforcementPolicy.STRICT_BLOCK:
      if (trustScore < 70) {
        return DevicePostureDecision.BLOCKED_QUARANTINED;
      }
      if (trustScore < 85) {
        return DevicePostureDecision.STEP_UP_REQUIRED;
      }
      return DevicePostureDecision.ALLOWED;

    case DevicePostureEnforcementPolicy.STEP_UP_AUTH:
      if (trustScore < 50) {
        return DevicePostureDecision.BLOCKED_QUARANTINED;
      }
      if (trustScore < 85) {
        return DevicePostureDecision.STEP_UP_REQUIRED;
      }
      return DevicePostureDecision.ALLOWED;

    case DevicePostureEnforcementPolicy.READ_ONLY_DEGRADATION:
      if (trustScore < 40) {
        return DevicePostureDecision.BLOCKED_QUARANTINED;
      }
      if (trustScore < 85) {
        return DevicePostureDecision.RESTRICTED_READ_ONLY;
      }
      return DevicePostureDecision.ALLOWED;

    case DevicePostureEnforcementPolicy.AUDIT_ONLY_MONITOR:
    default:
      return DevicePostureDecision.ALLOWED;
  }
}

/**
 * Emissão de Selo Notarial Probatório WORM HMAC-SHA256 para Avaliação de Postura
 */
export function createDevicePostureProofSeal(
  assessmentData: {
    assessmentId: string;
    deviceId: string;
    trustScore: number;
    trustTier: DeviceTrustTier;
    decision: DevicePostureDecision;
    violationsCount: number;
    assessedAt: string;
  },
  secret: string = DEFAULT_POSTURE_SECRET
): DevicePostureProofSeal {
  const canonicalPayload = canonicalStringify(assessmentData);
  const canonicalDigest = createHash('sha256').update(canonicalPayload, 'utf8').digest('hex');
  const hmacSignature = createHmac('sha256', secret).update(canonicalDigest, 'utf8').digest('hex');
  const sealId = `posture_seal_${assessmentData.assessmentId}`;
  const token = `posture_proof_v1_${Buffer.from(`${sealId}:${canonicalDigest.substring(0, 32)}:${hmacSignature.substring(0, 32)}`).toString('base64url')}`;

  return {
    sealId,
    token,
    canonicalDigest,
    hmacSignature,
    issuedAt: new Date().toISOString(),
    assessmentId: assessmentData.assessmentId,
    deviceId: assessmentData.deviceId,
    trustScore: assessmentData.trustScore,
    trustTier: assessmentData.trustTier
  };
}

/**
 * Validação Forense Independente do Selo Probatório de Postura Zero Trust
 */
export function verifyDevicePostureProofSeal(
  seal: DevicePostureProofSeal,
  expectedAssessmentData: {
    assessmentId: string;
    deviceId: string;
    trustScore: number;
    trustTier: DeviceTrustTier;
    decision: DevicePostureDecision;
    violationsCount: number;
    assessedAt: string;
  },
  secret: string = DEFAULT_POSTURE_SECRET
): { isValid: boolean; reason?: string } {
  if (!seal || !seal.token || !seal.canonicalDigest || !seal.hmacSignature) {
    return { isValid: false, reason: 'Estrutura do selo probatório incompleta ou malformada.' };
  }

  // 1. Recomputa o digest canônico dos dados esperados
  const recomputedCanonical = canonicalStringify(expectedAssessmentData);
  const recomputedDigest = createHash('sha256').update(recomputedCanonical, 'utf8').digest('hex');

  if (recomputedDigest !== seal.canonicalDigest) {
    return { isValid: false, reason: 'Divergência no digest canônico: dados da avaliação foram adulterados retroativamente.' };
  }

  // 2. Recomputa a assinatura HMAC
  const expectedHmac = createHmac('sha256', secret).update(recomputedDigest, 'utf8').digest('hex');

  const hmacA = Buffer.from(seal.hmacSignature, 'hex');
  const hmacB = Buffer.from(expectedHmac, 'hex');

  if (hmacA.length !== hmacB.length || !timingSafeEqual(hmacA, hmacB)) {
    return { isValid: false, reason: 'Assinatura digital HMAC inválida ou forjada.' };
  }

  return { isValid: true };
}

/**
 * Executa a avaliação completa de postura com emissão do laudo e selo probatório
 */
export function evaluateDevicePosture(
  params: {
    deviceId: string;
    deviceName: string;
    therapistId: string;
    telemetry: DevicePostureTelemetry;
    policy: DevicePostureEnforcementPolicy;
    secret?: string;
  }
): DevicePostureAssessmentResult {
  const assessmentId = `posture_eval_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const violations = evaluateDeviceViolations(params.telemetry);
  const { score: trustScore, tier: trustTier } = calculateDeviceTrustScore(violations);
  const decision = determineEnforcementDecision(trustScore, violations, params.policy);
  const assessedAt = new Date().toISOString();

  const sealData = {
    assessmentId,
    deviceId: params.deviceId,
    trustScore,
    trustTier,
    decision,
    violationsCount: violations.length,
    assessedAt
  };

  const proofSeal = createDevicePostureProofSeal(sealData, params.secret);

  return {
    assessmentId,
    deviceId: params.deviceId,
    deviceName: params.deviceName,
    therapistId: params.therapistId,
    trustScore,
    trustTier,
    decision,
    activePolicy: params.policy,
    violations,
    telemetry: params.telemetry,
    proofSeal,
    assessedAt
  };
}

/**
 * Cenários representativos para simulação de pentest e demonstração
 */
export const DEVICE_POSTURE_PRESET_SCENARIOS: Record<string, { label: string; telemetry: DevicePostureTelemetry; deviceName: string }> = {
  COMPLIANT_MAC_WORKSTATION: {
    label: 'Workstation macOS Conforme (Estação Principal)',
    deviceName: 'MacBook Pro M3 (Consultório Titular)',
    telemetry: {
      platform: DevicePlatform.MACOS_DESKTOP,
      osName: 'macOS Sonoma',
      osVersion: '14.5',
      browser: 'Google Chrome',
      browserVersion: '128.0.6613.120',
      isRootedOrJailbroken: false,
      isDebuggerPresent: false,
      isEmulator: false,
      isDiskEncrypted: true,
      isScreenLockEnabled: true,
      devToolsOpen: false,
      suspiciousHooksDetected: false,
      clockSkewSeconds: 0.8,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      clientIp: '189.40.112.55'
    }
  },
  UNENCRYPTED_DISK_WINDOWS: {
    label: 'Notebook Windows com Disco Descriptografado',
    deviceName: 'Dell Latitude 5420 (Notebook Clínico Secundário)',
    telemetry: {
      platform: DevicePlatform.WINDOWS_DESKTOP,
      osName: 'Windows 11 Pro',
      osVersion: '23H2',
      browser: 'Microsoft Edge',
      browserVersion: '127.0.2651.86',
      isRootedOrJailbroken: false,
      isDebuggerPresent: false,
      isEmulator: false,
      isDiskEncrypted: false, // Violação HIGH
      isScreenLockEnabled: true,
      devToolsOpen: false,
      suspiciousHooksDetected: false,
      clockSkewSeconds: 2.1,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 Edg/127.0.0.0',
      clientIp: '177.18.99.102'
    }
  },
  ROOTED_ANDROID_WITH_FRIDA: {
    label: 'Terminal Móvel com Root & Depurador Frida Ativo',
    deviceName: 'Samsung Galaxy S22 (Terminal Remoto)',
    telemetry: {
      platform: DevicePlatform.ANDROID_MOBILE,
      osName: 'Android',
      osVersion: '13.0',
      browser: 'Chrome Mobile',
      browserVersion: '126.0.6478.122',
      isRootedOrJailbroken: true, // Violação CRITICAL
      isDebuggerPresent: true,    // Violação CRITICAL
      isEmulator: false,
      isDiskEncrypted: true,
      isScreenLockEnabled: true,
      devToolsOpen: false,
      suspiciousHooksDetected: true, // Violação CRITICAL
      clockSkewSeconds: 1.4,
      userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.122 Mobile Safari/537.36',
      clientIp: '179.185.20.14'
    }
  },
  EMULATOR_DEVTOOLS_OPEN: {
    label: 'Emulador Android com DevTools e Console Aberto',
    deviceName: 'Genymotion Cloud VM',
    telemetry: {
      platform: DevicePlatform.ANDROID_MOBILE,
      osName: 'Android Virtual Device',
      osVersion: '12.0',
      browser: 'Chromium',
      browserVersion: '120.0.0.0',
      isRootedOrJailbroken: false,
      isDebuggerPresent: false,
      isEmulator: true, // Violação HIGH
      isDiskEncrypted: false, // Violação HIGH
      isScreenLockEnabled: false, // Violação MEDIUM
      devToolsOpen: true, // Violação MEDIUM
      suspiciousHooksDetected: false,
      clockSkewSeconds: 42.0, // Violação LOW (> 30s)
      userAgent: 'Mozilla/5.0 (Linux; Android 12; sdk_gphone64_arm64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      clientIp: '104.28.19.44'
    }
  },
  OUTDATED_OS_VULNERABLE: {
    label: 'Notebook com Sistema Operacional Obsoleto',
    deviceName: 'Lenovo ThinkPad X230 (Terminal Antigo)',
    telemetry: {
      platform: DevicePlatform.WINDOWS_DESKTOP,
      osName: 'Windows',
      osVersion: '7.0', // Violação HIGH (obsoleto)
      browser: 'Google Chrome',
      browserVersion: '109.0.5414.120',
      isRootedOrJailbroken: false,
      isDebuggerPresent: false,
      isEmulator: false,
      isDiskEncrypted: false,
      isScreenLockEnabled: true,
      devToolsOpen: false,
      suspiciousHooksDetected: false,
      clockSkewSeconds: 15.0,
      userAgent: 'Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
      clientIp: '201.86.14.77'
    }
  }
};
