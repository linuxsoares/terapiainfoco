import {
  DeviceTrustTier,
  DevicePlatform,
  DevicePostureEnforcementPolicy,
  DevicePostureDecision,
  AuditAction,
  AuditResourceType
} from '@terapiainfoco/shared';
import type {
  DevicePostureTelemetry,
  DevicePostureAssessmentResult,
  DevicePostureRecord,
  DevicePostureMetrics,
  DevicePostureOverview,
  DevicePostureProofSeal
} from '@terapiainfoco/shared';
import {
  evaluateDevicePosture,
  verifyDevicePostureProofSeal,
  DEVICE_POSTURE_PRESET_SCENARIOS
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';

export class DevicePostureService {
  private static instance: DevicePostureService;

  private activePolicy: DevicePostureEnforcementPolicy = DevicePostureEnforcementPolicy.STRICT_BLOCK;
  private registeredDevices: Map<string, DevicePostureRecord> = new Map();
  private recentAssessments: DevicePostureAssessmentResult[] = [];
  private violationsBlocked24hCount = 0;

  private constructor() {
    this.seedDefaultData();
  }

  public static getInstance(): DevicePostureService {
    if (!DevicePostureService.instance) {
      DevicePostureService.instance = new DevicePostureService();
    }
    return DevicePostureService.instance;
  }

  /**
   * Sementes representativas de dispositivos clínicos para auditoria e demonstração
   */
  private seedDefaultData(): void {
    const now = new Date();

    // 1. Estação de Trabalho Principal do Terapeuta (Conforme)
    const macDevice: DevicePostureRecord = {
      deviceId: 'dev_titular_macbook_01',
      deviceName: 'MacBook Pro M3 Max (Consultório 01)',
      therapistId: 'usr_psicologo_titular',
      platform: DevicePlatform.MACOS_DESKTOP,
      isQuarantined: false,
      firstSeenAt: new Date(now.getTime() - 90 * 86400000).toISOString(),
      lastSeenAt: new Date(now.getTime() - 15 * 60000).toISOString(),
      latestTrustScore: 100,
      latestTrustTier: DeviceTrustTier.TRUSTED,
      latestDecision: DevicePostureDecision.ALLOWED
    };

    // 2. Notebook Windows Clínico Secundário (Sem criptografia de disco)
    const winDevice: DevicePostureRecord = {
      deviceId: 'dev_titular_dell_win_02',
      deviceName: 'Dell Latitude 5420 (Notebook Atendimento Remoto)',
      therapistId: 'usr_psicologo_titular',
      platform: DevicePlatform.WINDOWS_DESKTOP,
      isQuarantined: false,
      firstSeenAt: new Date(now.getTime() - 45 * 86400000).toISOString(),
      lastSeenAt: new Date(now.getTime() - 30 * 60000).toISOString(),
      latestTrustScore: 80,
      latestTrustTier: DeviceTrustTier.MONITORED,
      latestDecision: DevicePostureDecision.STEP_UP_REQUIRED
    };

    // 3. Tablet iPad Pro da Clínica (Recepção / Anamnese Biopsicossocial)
    const ipadDevice: DevicePostureRecord = {
      deviceId: 'dev_clinica_ipad_pro_03',
      deviceName: 'iPad Pro 11" (Terminal de Autoatendimento & TCLE)',
      therapistId: 'usr_secretaria_clinica',
      platform: DevicePlatform.IOS_MOBILE,
      isQuarantined: false,
      firstSeenAt: new Date(now.getTime() - 60 * 86400000).toISOString(),
      lastSeenAt: new Date(now.getTime() - 120 * 60000).toISOString(),
      latestTrustScore: 90,
      latestTrustTier: DeviceTrustTier.TRUSTED,
      latestDecision: DevicePostureDecision.ALLOWED
    };

    // 4. Smartphone Android Suspeito com Root & Frida Acoplado (Bloqueado)
    const rogueAndroid: DevicePostureRecord = {
      deviceId: 'dev_suspect_android_root_04',
      deviceName: 'Samsung Galaxy S22 (Terminal Hostil Não Homologado)',
      therapistId: 'usr_desconhecido',
      platform: DevicePlatform.ANDROID_MOBILE,
      isQuarantined: true,
      quarantineReason: 'Presença de privilégios Root, Framework Frida e injeção de hooks em runtime.',
      quarantinedAt: new Date(now.getTime() - 180 * 60000).toISOString(),
      quarantinedBy: 'dpo_compliance_lead',
      firstSeenAt: new Date(now.getTime() - 5 * 86400000).toISOString(),
      lastSeenAt: new Date(now.getTime() - 180 * 60000).toISOString(),
      latestTrustScore: 0,
      latestTrustTier: DeviceTrustTier.UNTRUSTED_BLOCKED,
      latestDecision: DevicePostureDecision.BLOCKED_QUARANTINED
    };

    this.registeredDevices.set(macDevice.deviceId, macDevice);
    this.registeredDevices.set(winDevice.deviceId, winDevice);
    this.registeredDevices.set(ipadDevice.deviceId, ipadDevice);
    this.registeredDevices.set(rogueAndroid.deviceId, rogueAndroid);

    // Avaliações iniciais no histórico
    const macPreset = DEVICE_POSTURE_PRESET_SCENARIOS.COMPLIANT_MAC_WORKSTATION;
    const initialMacEval = evaluateDevicePosture({
      deviceId: macDevice.deviceId,
      deviceName: macDevice.deviceName,
      therapistId: macDevice.therapistId,
      telemetry: macPreset.telemetry,
      policy: this.activePolicy
    });

    const rootPreset = DEVICE_POSTURE_PRESET_SCENARIOS.ROOTED_ANDROID_WITH_FRIDA;
    const initialRootEval = evaluateDevicePosture({
      deviceId: rogueAndroid.deviceId,
      deviceName: rogueAndroid.deviceName,
      therapistId: rogueAndroid.therapistId,
      telemetry: rootPreset.telemetry,
      policy: this.activePolicy
    });

    this.recentAssessments.push(initialMacEval);
    this.recentAssessments.push(initialRootEval);
    this.violationsBlocked24hCount = 1;
  }

  /**
   * Cálculo consolidado de métricas operacionais e de segurança
   */
  public getMetrics(): DevicePostureMetrics {
    const devices = Array.from(this.registeredDevices.values());
    const totalDevicesMonitored = devices.length;

    let trustedCount = 0;
    let monitoredCount = 0;
    let riskyCount = 0;
    let blockedCount = 0;
    let activeQuarantinesCount = 0;
    let scoreSum = 0;

    for (const d of devices) {
      if (d.isQuarantined) {
        activeQuarantinesCount++;
      }
      switch (d.latestTrustTier) {
        case DeviceTrustTier.TRUSTED:
          trustedCount++;
          break;
        case DeviceTrustTier.MONITORED:
          monitoredCount++;
          break;
        case DeviceTrustTier.RISKY:
          riskyCount++;
          break;
        case DeviceTrustTier.UNTRUSTED_BLOCKED:
          blockedCount++;
          break;
      }
      scoreSum += d.latestTrustScore;
    }

    const averageTrustScore = totalDevicesMonitored > 0 ? Math.round(scoreSum / totalDevicesMonitored) : 100;

    return {
      totalDevicesMonitored,
      trustedCount,
      monitoredCount,
      riskyCount,
      blockedCount,
      activeQuarantinesCount,
      averageTrustScore,
      violationsBlocked24h: this.violationsBlocked24hCount
    };
  }

  /**
   * Visão geral de postura de dispositivos para a governança Zero Trust
   */
  public getOverview(): DevicePostureOverview {
    const metrics = this.getMetrics();
    const registeredDevices = Array.from(this.registeredDevices.values());

    let systemHealth: 'COMPLIANT' | 'DEGRADED' | 'THREAT_CONTAINMENT' = 'COMPLIANT';
    if (metrics.activeQuarantinesCount > 0 || metrics.blockedCount > 0) {
      systemHealth = 'THREAT_CONTAINMENT';
    } else if (metrics.riskyCount > 0 || metrics.averageTrustScore < 85) {
      systemHealth = 'DEGRADED';
    }

    return {
      metrics,
      activePolicy: this.activePolicy,
      registeredDevices,
      recentAssessments: [...this.recentAssessments].reverse(),
      systemHealth
    };
  }

  /**
   * Avaliação de postura de dispositivo em tempo real
   */
  public async assessDevice(
    dto: {
      deviceId?: string;
      deviceName?: string;
      therapistId?: string;
      telemetry?: Partial<DevicePostureTelemetry>;
      simulatedScenario?: keyof typeof DEVICE_POSTURE_PRESET_SCENARIOS;
    },
    operatorId: string
  ): Promise<DevicePostureAssessmentResult> {
    let telemetry: DevicePostureTelemetry;
    let deviceName = dto.deviceName || 'Terminal Clínico';
    let deviceId = dto.deviceId || `dev_${Math.random().toString(36).substring(2, 8)}`;
    const therapistId = dto.therapistId || operatorId || 'usr_terapeuta';

    if (dto.simulatedScenario && DEVICE_POSTURE_PRESET_SCENARIOS[dto.simulatedScenario]) {
      const preset = DEVICE_POSTURE_PRESET_SCENARIOS[dto.simulatedScenario];
      telemetry = preset.telemetry;
      deviceName = dto.deviceName || preset.deviceName;
    } else {
      telemetry = {
        platform: dto.telemetry?.platform || DevicePlatform.WEB_CHROME,
        osName: dto.telemetry?.osName || 'macOS',
        osVersion: dto.telemetry?.osVersion || '14.5',
        browser: dto.telemetry?.browser || 'Chrome',
        browserVersion: dto.telemetry?.browserVersion || '128.0',
        isRootedOrJailbroken: dto.telemetry?.isRootedOrJailbroken ?? false,
        isDebuggerPresent: dto.telemetry?.isDebuggerPresent ?? false,
        isEmulator: dto.telemetry?.isEmulator ?? false,
        isDiskEncrypted: dto.telemetry?.isDiskEncrypted ?? true,
        isScreenLockEnabled: dto.telemetry?.isScreenLockEnabled ?? true,
        devToolsOpen: dto.telemetry?.devToolsOpen ?? false,
        suspiciousHooksDetected: dto.telemetry?.suspiciousHooksDetected ?? false,
        clockSkewSeconds: dto.telemetry?.clockSkewSeconds ?? 0.5,
        userAgent: dto.telemetry?.userAgent || 'TerapiaInFoco-Secure-Client/2.0',
        clientIp: dto.telemetry?.clientIp || '189.40.112.55'
      };
    }

    // Executa avaliação central
    const assessment = evaluateDevicePosture({
      deviceId,
      deviceName,
      therapistId,
      telemetry,
      policy: this.activePolicy
    });

    // Se o dispositivo já estiver quarentenado administrativamente, mantém bloqueio
    const existingDevice = this.registeredDevices.get(deviceId);
    if (existingDevice?.isQuarantined) {
      assessment.decision = DevicePostureDecision.BLOCKED_QUARANTINED;
    }

    // Atualiza ou cadastra o dispositivo no inventário
    const nowIso = new Date().toISOString();
    const updatedRecord: DevicePostureRecord = {
      deviceId,
      deviceName,
      therapistId,
      platform: telemetry.platform,
      isQuarantined: existingDevice?.isQuarantined ?? (assessment.decision === DevicePostureDecision.BLOCKED_QUARANTINED && assessment.trustScore < 40),
      quarantineReason: existingDevice?.quarantineReason || (assessment.decision === DevicePostureDecision.BLOCKED_QUARANTINED ? 'Violação crítica de postura de segurança Zero Trust detectada.' : undefined),
      quarantinedAt: existingDevice?.quarantinedAt || (assessment.decision === DevicePostureDecision.BLOCKED_QUARANTINED ? nowIso : undefined),
      quarantinedBy: existingDevice?.quarantinedBy || (assessment.decision === DevicePostureDecision.BLOCKED_QUARANTINED ? 'ZERO_TRUST_ENGINE' : undefined),
      firstSeenAt: existingDevice?.firstSeenAt || nowIso,
      lastSeenAt: nowIso,
      latestTrustScore: assessment.trustScore,
      latestTrustTier: assessment.trustTier,
      latestDecision: assessment.decision
    };

    this.registeredDevices.set(deviceId, updatedRecord);

    // Registra no histórico (mantendo os últimos 50)
    this.recentAssessments.push(assessment);
    if (this.recentAssessments.length > 50) {
      this.recentAssessments.shift();
    }

    if (assessment.decision === DevicePostureDecision.BLOCKED_QUARANTINED) {
      this.violationsBlocked24hCount++;
    }

    // Auditoria WORM inalterável
    const auditAction = assessment.decision === DevicePostureDecision.BLOCKED_QUARANTINED
      ? AuditAction.DEVICE_POSTURE_VIOLATION_BLOCKED
      : AuditAction.DEVICE_POSTURE_ASSESSED;

    await AuditService.log({
      action: auditAction,
      resourceType: AuditResourceType.DEVICE_POSTURE_ENGINE,
      resourceId: deviceId,
      userId: therapistId,
      details: {
        assessmentId: assessment.assessmentId,
        trustScore: assessment.trustScore,
        trustTier: assessment.trustTier,
        decision: assessment.decision,
        violationsCount: assessment.violations.length,
        policy: this.activePolicy,
        proofSeal: assessment.proofSeal.token
      }
    });

    return assessment;
  }

  /**
   * Quarentena manual de dispositivo comprometido (DPO / Administrador)
   */
  public async quarantineDevice(deviceId: string, reason: string, operatorId: string): Promise<DevicePostureRecord> {
    const device = this.registeredDevices.get(deviceId);
    if (!device) {
      throw new Error(`Dispositivo ${deviceId} não encontrado no inventário.`);
    }

    const nowIso = new Date().toISOString();
    device.isQuarantined = true;
    device.quarantineReason = reason;
    device.quarantinedAt = nowIso;
    device.quarantinedBy = operatorId;
    device.latestDecision = DevicePostureDecision.BLOCKED_QUARANTINED;
    device.latestTrustTier = DeviceTrustTier.UNTRUSTED_BLOCKED;

    this.registeredDevices.set(deviceId, device);
    this.violationsBlocked24hCount++;

    await AuditService.log({
      action: AuditAction.DEVICE_QUARANTINED,
      resourceType: AuditResourceType.DEVICE_POSTURE_ENGINE,
      resourceId: deviceId,
      userId: operatorId,
      details: {
        reason,
        quarantinedAt: nowIso,
        quarantinedBy: operatorId
      }
    });

    return device;
  }

  /**
   * Liberação auditada de dispositivo em quarentena pelo DPO
   */
  public async releaseDeviceQuarantine(deviceId: string, dpoNotes: string, operatorId: string): Promise<DevicePostureRecord> {
    const device = this.registeredDevices.get(deviceId);
    if (!device) {
      throw new Error(`Dispositivo ${deviceId} não encontrado no inventário.`);
    }

    device.isQuarantined = false;
    device.quarantineReason = undefined;
    device.quarantinedAt = undefined;
    device.quarantinedBy = undefined;
    device.latestDecision = device.latestTrustScore >= 85 ? DevicePostureDecision.ALLOWED : DevicePostureDecision.STEP_UP_REQUIRED;
    device.latestTrustTier = device.latestTrustScore >= 85 ? DeviceTrustTier.TRUSTED : DeviceTrustTier.MONITORED;

    this.registeredDevices.set(deviceId, device);

    await AuditService.log({
      action: AuditAction.DEVICE_QUARANTINE_RELEASED,
      resourceType: AuditResourceType.DEVICE_POSTURE_ENGINE,
      resourceId: deviceId,
      userId: operatorId,
      details: {
        dpoNotes,
        releasedAt: new Date().toISOString(),
        releasedBy: operatorId
      }
    });

    return device;
  }

  /**
   * Atualização dinâmica da política de conformidade Zero Trust
   */
  public async updatePolicy(
    policy: DevicePostureEnforcementPolicy,
    operatorId: string,
    reason?: string
  ): Promise<DevicePostureEnforcementPolicy> {
    const oldPolicy = this.activePolicy;
    this.activePolicy = policy;

    await AuditService.log({
      action: AuditAction.DEVICE_POSTURE_POLICY_UPDATED,
      resourceType: AuditResourceType.DEVICE_POSTURE_ENGINE,
      resourceId: 'policy_config',
      userId: operatorId,
      details: {
        oldPolicy,
        newPolicy: policy,
        reason: reason || 'Ajuste de governança Zero Trust para conformidade clínica NIST SP 800-207'
      }
    });

    return this.activePolicy;
  }

  /**
   * Verificação forense independente do selo WORM de postura
   */
  public async verifySeal(sealToken: string): Promise<{
    isValid: boolean;
    seal?: DevicePostureProofSeal;
    message: string;
    verifiedAt: string;
  }> {
    const nowIso = new Date().toISOString();

    const assessment = this.recentAssessments.find(a => a.proofSeal.token === sealToken);
    if (!assessment) {
      return {
        isValid: false,
        message: 'Selo probatório não encontrado no registro histórico de avaliações.',
        verifiedAt: nowIso
      };
    }

    const verification = verifyDevicePostureProofSeal(assessment.proofSeal, {
      assessmentId: assessment.assessmentId,
      deviceId: assessment.deviceId,
      trustScore: assessment.trustScore,
      trustTier: assessment.trustTier,
      decision: assessment.decision,
      violationsCount: assessment.violations.length,
      assessedAt: assessment.assessedAt
    });

    await AuditService.log({
      action: AuditAction.DEVICE_POSTURE_SEAL_VERIFIED,
      resourceType: AuditResourceType.DEVICE_POSTURE_ENGINE,
      resourceId: assessment.deviceId,
      userId: 'SYSTEM_VERIFIER',
      details: {
        sealToken,
        assessmentId: assessment.assessmentId,
        isValid: verification.isValid,
        reason: verification.reason
      }
    });

    return {
      isValid: verification.isValid,
      seal: assessment.proofSeal,
      message: verification.isValid
        ? 'Selo probatório WORM autêntico: integridade de telemetria e assinatura HMAC-SHA256 confirmadas com fé pública.'
        : `Falha na verificação pericial: ${verification.reason}`,
      verifiedAt: nowIso
    };
  }
}
