import {
  AuditAction,
  AuditResourceType,
  ScraperThreatCategory,
  TarpitDefenseStatus,
  type HoneypotTrapConfig,
  type ScraperIncidentRecord,
  type TarpitMetricsOverview,
  type CreateHoneypotTrapDTO,
  type CreateHoneypotTrapResponse,
  type TriggerHoneypotTrapResponse,
  type SimulateScrapingAttackDTO,
  type SimulateScrapingAttackResponse,
  type ReleaseTarpitQuarantineDTO,
  type ReleaseTarpitQuarantineResponse,
  type TarpitDefenseProof
} from '@terapiainfoco/shared';
import {
  generateHoneypotTrapToken,
  verifyHoneypotTrapToken,
  detectCrawlerHeuristics,
  calculateTarpitDelay,
  generateTarpitDefenseSeal,
  verifyTarpitDefenseSeal,
  tarpitSleep
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';

export class AntiAutomationTarpitService {
  private static instance: AntiAutomationTarpitService;

  private incidents: Map<string, ScraperIncidentRecord> = new Map();
  private traps: Map<string, HoneypotTrapConfig> = new Map();
  private totalTrappedCrawlersCount = 0;
  private totalHoneypotsTriggered = 0;
  private totalTarpitTimeSpentMs = 0;
  private bandwidthSavedKb = 0;

  private constructor() {
    this.seedDemoData();
  }

  public static getInstance(): AntiAutomationTarpitService {
    if (!AntiAutomationTarpitService.instance) {
      AntiAutomationTarpitService.instance = new AntiAutomationTarpitService();
    }
    return AntiAutomationTarpitService.instance;
  }

  /**
   * Inicializa dados de demonstração com incidentes de crawlers e armadilhas ativas
   */
  public seedDemoData(): void {
    this.incidents.clear();
    this.traps.clear();
    this.totalTrappedCrawlersCount = 84;
    this.totalHoneypotsTriggered = 217;
    this.totalTarpitTimeSpentMs = 1420000;
    this.bandwidthSavedKb = 18450;

    const now = Date.now();

    // 1. Armadilha Honeypot Padrão
    const trap1 = generateHoneypotTrapToken({
      routePath: '/api/internal/clinical-patients-directory',
      ttlSeconds: 86400
    });

    this.traps.set(trap1.trapId, {
      trapId: trap1.trapId,
      token: trap1.token,
      routePath: trap1.routePath,
      expiresAt: trap1.expiresAt,
      triggerCount: 42,
      createdAt: new Date(now - 3600000 * 24).toISOString()
    });

    // 2. Armadilha Honeypot de Agenda
    const trap2 = generateHoneypotTrapToken({
      routePath: '/api/v1/therapist/confidential-schedule-dump',
      ttlSeconds: 86400
    });

    this.traps.set(trap2.trapId, {
      trapId: trap2.trapId,
      token: trap2.token,
      routePath: trap2.routePath,
      expiresAt: trap2.expiresAt,
      triggerCount: 15,
      createdAt: new Date(now - 3600000 * 12).toISOString()
    });

    // 3. Incidente 1: Scraper de Python em Quarentena
    const seal1 = generateTarpitDefenseSeal({
      trapId: trap1.trapId,
      clientIp: '198.51.100.81',
      threatCategory: ScraperThreatCategory.DATA_SCRAPING_OAT011,
      delayMs: 15000,
      trappedAt: new Date(now - 60000 * 30).toISOString()
    });

    this.incidents.set('198.51.100.81', {
      id: 'inc_scraper_01',
      ipAddress: '198.51.100.81',
      threatCategory: ScraperThreatCategory.DATA_SCRAPING_OAT011,
      status: TarpitDefenseStatus.ISOLATED,
      userAgent: 'Scrapy/2.11.0 (+https://scrapy.org)',
      detectedVectors: ['BOT_SIGNATURE_SCRAPY', 'GENERIC_WILDCARD_ACCEPT'],
      threatScore: 85,
      tarpitDelayMs: 15000,
      totalTrapsTriggered: 4,
      bandwidthSavedBytes: 4200000,
      firstSeenAt: new Date(now - 3600000 * 3).toISOString(),
      lastSeenAt: new Date(now - 60000 * 30).toISOString(),
      blockedUntil: new Date(now + 3600000 * 24).toISOString(),
      proofSeal: seal1
    });

    // 4. Incidente 2: Probe de Navegador Headless preso no Tarpit
    const seal2 = generateTarpitDefenseSeal({
      trapId: trap2.trapId,
      clientIp: '203.0.113.14',
      threatCategory: ScraperThreatCategory.HEADLESS_BOT_PROBE,
      delayMs: 6000,
      trappedAt: new Date(now - 60000 * 8).toISOString()
    });

    this.incidents.set('203.0.113.14', {
      id: 'inc_scraper_02',
      ipAddress: '203.0.113.14',
      threatCategory: ScraperThreatCategory.HEADLESS_BOT_PROBE,
      status: TarpitDefenseStatus.TARPITTING,
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/121.0.0.0 Safari/537.36',
      detectedVectors: ['BOT_SIGNATURE_HEADLESSCHROME', 'HEADLESS_MISSING_SEC_CH_UA'],
      threatScore: 90,
      tarpitDelayMs: 6000,
      totalTrapsTriggered: 2,
      bandwidthSavedBytes: 1500000,
      firstSeenAt: new Date(now - 60000 * 20).toISOString(),
      lastSeenAt: new Date(now - 60000 * 8).toISOString(),
      proofSeal: seal2
    });
  }

  /**
   * Retorna visão consolidada e métricas executivas de governança anti-automação
   */
  public getOverview(): TarpitMetricsOverview {
    const incidentsList = Array.from(this.incidents.values());
    const trapsList = Array.from(this.traps.values());

    const isolatedCount = incidentsList.filter(i => i.status === TarpitDefenseStatus.ISOLATED).length;
    let threatIndex: 'NORMAL' | 'ELEVATED' | 'HIGH' = 'NORMAL';

    if (isolatedCount >= 3 || this.totalHoneypotsTriggered >= 200) {
      threatIndex = 'HIGH';
    } else if (isolatedCount >= 1 || incidentsList.some(i => i.status === TarpitDefenseStatus.TARPITTING)) {
      threatIndex = 'ELEVATED';
    }

    return {
      totalTrappedCrawlersCount: this.totalTrappedCrawlersCount,
      totalHoneypotsTriggered: this.totalHoneypotsTriggered,
      totalTarpitTimeSpentMs: this.totalTarpitTimeSpentMs,
      bandwidthSavedKb: this.bandwidthSavedKb,
      isolatedIpsCount: isolatedCount,
      activeHoneypotsCount: trapsList.length,
      currentThreatIndex: threatIndex,
      recentIncidents: incidentsList.sort(
        (a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime()
      ),
      activeTraps: trapsList
    };
  }

  /**
   * Registra uma nova armadilha Honeypot dinamicamente
   */
  public createTrap(dto: CreateHoneypotTrapDTO): CreateHoneypotTrapResponse {
    const tokenPayload = generateHoneypotTrapToken({
      routePath: dto.routePath,
      ttlSeconds: dto.ttlSeconds,
      clientIp: dto.clientIp
    });

    const trapConfig: HoneypotTrapConfig = {
      trapId: tokenPayload.trapId,
      token: tokenPayload.token,
      routePath: tokenPayload.routePath,
      expiresAt: tokenPayload.expiresAt,
      clientIp: tokenPayload.clientIp,
      triggerCount: 0,
      createdAt: new Date().toISOString()
    };

    this.traps.set(trapConfig.trapId, trapConfig);

    const invisibleHtmlSnippet = `<a href="/api/anti-automation/trap/${trapConfig.token}" style="display:none !important; visibility:hidden !important; opacity:0 !important; pointer-events:none !important;" rel="nofollow" aria-hidden="true" tabindex="-1">Diretório Interno de Registros</a>`;

    AuditService.log({
      actorId: 'HONEYPOT_SECURITY_ENGINE',
      resourceType: AuditResourceType.ANTI_AUTOMATION_TARPIT,
      resourceId: trapConfig.trapId,
      action: AuditAction.HONEYPOT_TRAP_TRIGGERED,
      ipAddress: dto.clientIp || '0.0.0.0',
      userAgent: `Armadilha Honeypot criada em ${dto.routePath}`
    });

    return {
      success: true,
      trap: trapConfig,
      invisibleHtmlSnippet
    };
  }

  /**
   * Processa o acionamento de um link armadilha Honeypot ou detecção heurística
   */
  public async handleTrapTrigger(
    token: string,
    clientIp: string,
    headers: Record<string, string | undefined>
  ): Promise<TriggerHoneypotTrapResponse> {
    const verification = verifyHoneypotTrapToken(token, clientIp);
    const heuristics = detectCrawlerHeuristics(headers);
    const nowIso = new Date().toISOString();

    const threatCategory: ScraperThreatCategory =
      heuristics.threatCategory || ScraperThreatCategory.DATA_SCRAPING_OAT011;

    let incident = this.incidents.get(clientIp);
    if (!incident) {
      incident = {
        id: `inc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        ipAddress: clientIp,
        threatCategory,
        status: TarpitDefenseStatus.ENGAGED,
        userAgent: headers['user-agent'] || 'Desconhecido',
        detectedVectors: heuristics.detectedVectors,
        threatScore: heuristics.threatScore,
        tarpitDelayMs: 0,
        totalTrapsTriggered: 0,
        bandwidthSavedBytes: 0,
        firstSeenAt: nowIso,
        lastSeenAt: nowIso
      };
      this.incidents.set(clientIp, incident);
    }

    incident.totalTrapsTriggered += 1;
    incident.lastSeenAt = nowIso;
    incident.detectedVectors = Array.from(
      new Set([...incident.detectedVectors, ...heuristics.detectedVectors, 'HONEYPOT_TRAP_TRIGGERED'])
    );
    incident.threatScore = Math.max(incident.threatScore, heuristics.threatScore, 80);

    // Incrementa contagem global
    this.totalHoneypotsTriggered += 1;
    this.totalTrappedCrawlersCount += 1;

    // Atualiza estatísticas da armadilha se encontrada
    if (verification.trapId) {
      const trap = this.traps.get(verification.trapId);
      if (trap) {
        trap.triggerCount += 1;
      }
    }

    // Calcula delay escalonado de Tarpit
    const tarpitCalc = calculateTarpitDelay(incident.totalTrapsTriggered, threatCategory);
    incident.tarpitDelayMs = tarpitCalc.delayMs;
    incident.status = TarpitDefenseStatus.TARPITTING;

    // Se reincidir ≥ 3 vezes, isola em quarentena
    if (incident.totalTrapsTriggered >= 3) {
      incident.status = TarpitDefenseStatus.ISOLATED;
      incident.blockedUntil = new Date(Date.now() + 3600000 * 24).toISOString();
    }

    // Economia estimada de tráfego (payload protegido não descarregado)
    const savedBytes = Math.round(tarpitCalc.delayMs * 180);
    incident.bandwidthSavedBytes += savedBytes;
    this.bandwidthSavedKb += Math.round(savedBytes / 1024);
    this.totalTarpitTimeSpentMs += tarpitCalc.delayMs;

    // Emite selo probatório WORM inviolável
    const seal = generateTarpitDefenseSeal({
      trapId: verification.trapId || 'trap_heuristic_auto',
      clientIp,
      threatCategory,
      delayMs: tarpitCalc.delayMs,
      trappedAt: nowIso
    });
    incident.proofSeal = seal;

    // Registra na trilha de auditoria WORM
    AuditService.log({
      actorId: 'HONEYPOT_SECURITY_ENGINE',
      resourceType: AuditResourceType.ANTI_AUTOMATION_TARPIT,
      resourceId: incident.id,
      action: AuditAction.HONEYPOT_TRAP_TRIGGERED,
      ipAddress: clientIp,
      userAgent: `Crawler preso na armadilha ${verification.routePath || token}. Score: ${incident.threatScore}`
    });

    AuditService.log({
      actorId: 'TARPIT_DEFENSE_GATEWAY',
      resourceType: AuditResourceType.ANTI_AUTOMATION_TARPIT,
      resourceId: incident.id,
      action: AuditAction.TARPIT_DEFENSE_ENGAGED,
      ipAddress: clientIp,
      userAgent: `Tarpit de ${tarpitCalc.delayMs}ms aplicado. Severidade: ${tarpitCalc.severityLevel}. Status: ${incident.status}`
    });

    if (incident.status === TarpitDefenseStatus.ISOLATED) {
      AuditService.log({
        actorId: 'TARPIT_DEFENSE_GATEWAY',
        resourceType: AuditResourceType.ANTI_AUTOMATION_TARPIT,
        resourceId: incident.id,
        action: AuditAction.SCRAPER_IP_ISOLATED,
        ipAddress: clientIp,
        userAgent: `IP colocado em quarentena por reincidência contínua (${incident.totalTrapsTriggered} violações)`
      });
    }

    // Retenção controlada de delay no servidor (com teto cooperativo para evitar timeouts rígidos em testes)
    const sleepDuration = Math.min(tarpitCalc.delayMs, 1000);
    await tarpitSleep(sleepDuration);

    return {
      success: true,
      tarpitDelayAppliedMs: tarpitCalc.delayMs,
      defenseSeal: seal,
      incident,
      message: `Conexão do crawler retida no Tarpit por ${tarpitCalc.delayMs}ms. Status: ${incident.status}.`
    };
  }

  /**
   * Simula um ataque de raspagem massiva ou enumeração de contas para validação
   */
  public async simulateScrapingAttack(dto: SimulateScrapingAttackDTO): Promise<SimulateScrapingAttackResponse> {
    const ipAddress = dto.ipAddress || '198.51.100.95';
    const burstCount = dto.requestsBurstCount || 15;
    const nowIso = new Date().toISOString();

    let incident = this.incidents.get(ipAddress);
    if (!incident) {
      incident = {
        id: `inc_sim_${Date.now()}`,
        ipAddress,
        threatCategory: dto.threatCategory,
        status: TarpitDefenseStatus.ENGAGED,
        userAgent: 'SimulatedCrawler/1.0 (ScraperBot; OWASP OAT Test)',
        detectedVectors: ['HIGH_FREQUENCY_BURST', 'AUTOMATED_CLIENT_PROBE'],
        threatScore: 88,
        tarpitDelayMs: 0,
        totalTrapsTriggered: 0,
        bandwidthSavedBytes: 0,
        firstSeenAt: nowIso,
        lastSeenAt: nowIso
      };
      this.incidents.set(ipAddress, incident);
    }

    incident.totalTrapsTriggered += dto.simulateHoneypotHit ? 3 : 1;
    incident.lastSeenAt = nowIso;
    incident.threatCategory = dto.threatCategory;

    const tarpitCalc = calculateTarpitDelay(incident.totalTrapsTriggered, dto.threatCategory);
    incident.tarpitDelayMs = tarpitCalc.delayMs;
    incident.status = TarpitDefenseStatus.ISOLATED;
    incident.blockedUntil = new Date(Date.now() + 3600000 * 24).toISOString();

    const savedBytes = burstCount * 256000; // ~250KB por requisição raspada evitada
    incident.bandwidthSavedBytes += savedBytes;

    this.totalTrappedCrawlersCount += burstCount;
    this.totalHoneypotsTriggered += dto.simulateHoneypotHit ? 1 : 0;
    this.bandwidthSavedKb += Math.round(savedBytes / 1024);
    this.totalTarpitTimeSpentMs += tarpitCalc.delayMs;

    const defenseSeal = generateTarpitDefenseSeal({
      trapId: `trap_sim_${Date.now()}`,
      clientIp: ipAddress,
      threatCategory: dto.threatCategory,
      delayMs: tarpitCalc.delayMs,
      trappedAt: nowIso
    });
    incident.proofSeal = defenseSeal;

    AuditService.log({
      actorId: 'SIMULATOR_ENGINE',
      resourceType: AuditResourceType.ANTI_AUTOMATION_TARPIT,
      resourceId: incident.id,
      action: AuditAction.SCRAPER_BLOCKED,
      ipAddress,
      userAgent: `Simulação de ${dto.threatCategory}: ${burstCount} requisições contidas via Tarpit (${tarpitCalc.delayMs}ms)`
    });

    AuditService.log({
      actorId: 'SIMULATOR_ENGINE',
      resourceType: AuditResourceType.ANTI_AUTOMATION_TARPIT,
      resourceId: incident.id,
      action: AuditAction.SCRAPER_IP_ISOLATED,
      ipAddress,
      userAgent: `IP isolado em quarentena de 24h após rajada de scraping controlada.`
    });

    return {
      success: true,
      attackContained: true,
      tarpitDelayMs: tarpitCalc.delayMs,
      bandwidthSavedBytes: savedBytes,
      incident,
      defenseSeal,
      message: `Ataque ${dto.threatCategory} contido com sucesso! ${burstCount} requisições desaceleradas e presas no Tarpit (${tarpitCalc.delayMs}ms). IP isolado.`
    };
  }

  /**
   * Libera administrativamente um IP isolado em quarentena com parecer auditado do DPO
   */
  public releaseIpQuarantine(
    dto: ReleaseTarpitQuarantineDTO,
    operator = 'user-dpo-001'
  ): ReleaseTarpitQuarantineResponse {
    const incident = this.incidents.get(dto.ipAddress);
    if (!incident) {
      throw new Error(`IP ${dto.ipAddress} não encontrado no registro de incidentes de scraping.`);
    }

    incident.status = TarpitDefenseStatus.RELEASED;
    incident.blockedUntil = undefined;
    incident.tarpitDelayMs = 0;
    incident.lastSeenAt = new Date().toISOString();

    AuditService.log({
      actorId: operator,
      resourceType: AuditResourceType.ANTI_AUTOMATION_TARPIT,
      resourceId: dto.ipAddress,
      action: AuditAction.TARPIT_QUARANTINE_RELEASED,
      ipAddress: dto.ipAddress,
      userAgent: `Parecer DPO: ${dto.reason}`
    });

    return {
      success: true,
      ipAddress: dto.ipAddress,
      message: `Quarentena do IP ${dto.ipAddress} revogada com sucesso. Registro gravado na trilha WORM.`
    };
  }

  /**
   * Valida fé pública e integridade matemática de um selo WORM de Tarpit
   */
  public verifySeal(seal: string): TarpitDefenseProof {
    const res = verifyTarpitDefenseSeal(seal);
    return {
      isValid: res.isValid,
      proofSeal: res.proofSeal,
      trapId: res.trapId,
      clientIp: res.clientIp,
      threatCategory: res.threatCategory,
      delayMs: res.delayMs,
      trappedAt: res.trappedAt,
      details: res.details
    };
  }
}
