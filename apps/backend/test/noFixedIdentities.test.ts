import { describe, it, expect } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { practiceProfessional, formatCrp, UNKNOWN_PROFESSIONAL_NAME } from '../src/services/practiceProfessional';

/** Nomes, CRP e CPF fictícios que já apareceram em documentos, recibos e mensagens reais */
const FIXED_IDENTITY = /Vanessa Andrade|Beatriz Santos|06\/142980|123\.456\.789-00/;

/**
 * Únicos arquivos que podem conter esses dados: contas e perfil da demonstração (DEMO_MODE),
 * o texto de PII da sondagem sintética (testa a sanitização) e os módulos simulados ainda
 * pendentes do item 4 do V0 (ICP-Brasil e serviços de segurança demonstrativos).
 */
const ALLOWED = new Set([
  'db/demoUsers.ts',
  'db/memoryDb.ts',
  'repositories/therapistProfileRepository.ts',
  'services/syntheticService.ts',
  'services/icpBrasilService.ts',
  'services/clinicalNotaryService.ts',
  'services/courtOrderThresholdService.ts'
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
  });
}

describe('Sem identidades fixas em documentos e mensagens', () => {
  it('o código do backend não usa nome, CRP ou CPF fictícios fora da demonstração', () => {
    const root = join(import.meta.dir, '../src');
    const offenders = sourceFiles(root)
      .map((path) => relative(root, path))
      .filter((path) => !ALLOWED.has(path) && FIXED_IDENTITY.test(readFileSync(join(root, path), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('consultório sem titular cadastrado não ganha nome nem CRP inventados', async () => {
    const professional = await practiceProfessional('consultorio-inexistente');
    expect(professional).toEqual({ name: UNKNOWN_PROFESSIONAL_NAME, crp: '', crpRegion: '' });
    expect(formatCrp('')).toBe('');
    expect(formatCrp('06/123456')).toBe('CRP 06/123456');
    expect(formatCrp('CRP 06/123456')).toBe('CRP 06/123456');
  });
});
