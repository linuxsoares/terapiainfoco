import { describe, it, expect, beforeAll } from 'bun:test';
import { app } from '../src/index';
import { authService } from '../src/services/authService';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { UserRole } from '@terapiainfoco/shared';
import { resetDb, listUsers, seedDemoSession } from './helpers/db';

/**
 * Matriz de acesso real (RFC-001 §4.5): toda rota GET da API chamada sem login e por cada perfil,
 * com os recursos do consultório demo. Qualquer mudança de acesso altera o snapshot e aparece
 * no diff do PR; atualize com `bun test test/accessMatrix.test.ts --update-snapshots`.
 */

const DEMO_PATIENT_ID = '00000000-0000-0000-0000-000000000002';
const DEMO_APPOINTMENT_ID = '00000000-0000-0000-0000-000000000010';

const ROLES = [
  UserRole.PSICOLOGO_TITULAR,
  UserRole.SUPERVISOR_CLINICO,
  UserRole.RECEPCAO_SECRETARIA,
  UserRole.PACIENTE,
  UserRole.ADMIN
] as const;

type Outcome = 'OK' | 'NEGA' | string;

/** Rotas abertas sem login: vitrine, horários livres, busca de psicólogos e validações públicas */
const PUBLIC_ROUTES = new Set([
  '/api/auth/public-config',
  '/api/auth/public-showcase',
  '/api/appointments/available-slots',
  '/api/therapists/search',
  '/api/therapists/:slug',
  '/api/documents/validate/:token',
  '/api/consent/verify/:token',
  '/api/referrals/validate/:token',
  '/api/billing/receipts/validate/:token',
  '/api/psychiatric-referrals/validate/:token'
]);

/** O tarpit atrasa de propósito (e escala o atraso com o estado de outros testes) */
const SKIPPED_ROUTES = new Set(['/api/anti-automation/trap/:token']);

/** Conteúdo clínico: só psicólogo titular e supervisor (Admin/DPO e recepção nunca leem) */
const CLINICAL_ROUTE = /^\/api\/(clinical-records|clinical-markers|transcriptions?|psychometrics|goals|reports\/consolidated|referrals\/(?!validate)|diagnostic-tree|psychiatric-referrals\/(?!validate)|analytics\/(patient|clinical-overview)|documents(?!\/validate)|patients\/:id\/(timeline|anamnesis)|teleconsultation\/session\/transcription\/:appointmentId)/;

function concretePath(path: string): string {
  return path.replace(/:([A-Za-z]+)\??/g, (_, name: string) => {
    if (/appoint|session|room/i.test(name)) return DEMO_APPOINTMENT_ID;
    if (name === 'therapistId') return 'therapist-001';
    return DEMO_PATIENT_ID;
  });
}

function outcome(status: number): Outcome {
  if (status < 300) return 'OK';
  if (status === 401 || status === 403) return 'NEGA';
  return String(status);
}

describe('Matriz de acesso por perfil (todas as rotas GET)', () => {
  const matrix: Record<string, Record<string, Outcome>> = {};

  beforeAll(async () => {
    await resetDb();
    await seedDemoSession();
    const users = await listUsers();
    const tokens = new Map<UserRole, string>();
    for (const role of ROLES) {
      const user = users.find((u) => u.role === role)!;
      tokens.set(role, (await authService.issueTokens(user, '127.0.0.1')).accessToken);
    }

    const paths = [...new Set(
      app.routes
        .filter((r) => r.method === 'GET' && r.path.startsWith('/api/') && !r.path.includes('*') && !SKIPPED_ROUTES.has(r.path))
        .map((r) => r.path)
    )].sort();

    for (const path of paths) {
      const row: Record<string, Outcome> = {};
      for (const role of [null, ...ROLES]) {
        await globalRateLimitStore.reset();
        const headers: Record<string, string> = role ? { Authorization: `Bearer ${tokens.get(role)}` } : {};
        row[role ?? 'ANONIMO'] = outcome((await app.request(concretePath(path), { headers })).status);
      }
      matrix[path] = row;
    }
  }, 300_000);

  it('só as rotas públicas respondem sem login', () => {
    const openWithoutLogin = Object.keys(matrix).filter((path) => matrix[path].ANONIMO !== 'NEGA' && !PUBLIC_ROUTES.has(path));
    expect(openWithoutLogin).toEqual([]);
  });

  it('Admin/DPO e recepção nunca recebem conteúdo clínico', () => {
    const clinical = Object.keys(matrix).filter((path) => CLINICAL_ROUTE.test(path));
    expect(clinical.length).toBeGreaterThan(15);
    const leaks = clinical.flatMap((path) =>
      [UserRole.ADMIN, UserRole.RECEPCAO_SECRETARIA, UserRole.PACIENTE]
        .filter((role) => matrix[path][role] === 'OK')
        .map((role) => `${role} ${path}`)
    );
    expect(leaks).toEqual([]);
  });

  it('matriz completa confere com o snapshot revisado', () => {
    const rendered = Object.fromEntries(
      Object.entries(matrix).map(([path, row]) => [path, ['ANONIMO', ...ROLES].map((k) => `${k}=${row[k]}`).join(' ')])
    );
    expect(rendered).toMatchSnapshot();
  });
});
