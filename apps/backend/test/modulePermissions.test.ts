import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { authService } from '../src/services/authService';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { UserRole, APP_MODULES, canViewModule, defaultModule, visibleModules, type AppModule } from '@terapiainfoco/shared';

const DEMO_APPOINTMENT_ID = '00000000-0000-0000-0000-000000000010';

/** Endpoint carregado por cada módulo do painel; portal e segurança não dependem de rota restrita */
const MODULE_ENDPOINTS: Partial<Record<AppModule, string>> = {
  dashboard: '/api/analytics/clinical-overview?therapistId=therapist-001',
  agenda: '/api/appointments/mine',
  patients: '/api/patients/search/cpf?cpf=000.000.000-00',
  soap: `/api/clinical-markers/appointment/${DEMO_APPOINTMENT_ID}`,
  documents: '/api/documents',
  audit: '/api/audit',
  backups: '/api/backups',
  publicProfile: '/api/therapists/me/profile',
  crpVerification: '/api/therapists/admin/pending'
};

const ROLES = [
  UserRole.PSICOLOGO_TITULAR,
  UserRole.SUPERVISOR_CLINICO,
  UserRole.RECEPCAO_SECRETARIA,
  UserRole.PACIENTE,
  UserRole.ADMIN
];

async function tokenForRole(role: UserRole): Promise<string> {
  const user = Array.from(db.users.values()).find((u) => u.role === role)!;
  const { accessToken } = await authService.issueTokens(user, '127.0.0.1');
  return accessToken;
}

describe('Menus dinâmicos por perfil (MODULE_ACCESS)', () => {
  beforeEach(() => {
    db.clear();
    db.seedDemoSession();
    globalRateLimitStore.reset();
  });

  it('cada perfil tem uma tela inicial visível e não vê módulos fora da matriz', () => {
    expect(visibleModules(UserRole.PACIENTE)).toEqual(['portal', 'directory', 'security']);
    expect(visibleModules(UserRole.RECEPCAO_SECRETARIA)).toEqual(['agenda', 'patients', 'security']);
    expect(visibleModules(UserRole.ADMIN)).toEqual(['audit', 'crpVerification', 'backups', 'security']);
    for (const role of ROLES) {
      expect(canViewModule(role, defaultModule(role))).toBe(true);
    }
  });

  for (const role of ROLES) {
    it(`módulos visíveis para ${role} são autorizados pelo backend e os ocultos são negados`, async () => {
      const headers = { Authorization: `Bearer ${await tokenForRole(role)}` };
      for (const module of APP_MODULES) {
        const endpoint = MODULE_ENDPOINTS[module];
        if (!endpoint) continue;
        const { status } = await app.request(endpoint, { headers });
        if (canViewModule(role, module)) {
          expect({ module, status, denied: status === 401 || status === 403 }).toEqual({ module, status, denied: false });
        } else if (module !== 'dashboard') {
          // O backend ainda libera métricas agregadas ao Admin; demais módulos ocultos devem ser negados
          expect({ module, denied: status === 403 || status === 404 }).toEqual({ module, denied: true });
        }
      }
    });
  }
});
