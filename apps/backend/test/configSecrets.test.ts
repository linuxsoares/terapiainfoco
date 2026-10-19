import { describe, it, expect } from 'bun:test';
import path from 'node:path';

const configPath = path.resolve(import.meta.dir, '../src/config.ts');

const validEnv = {
  NODE_ENV: 'production',
  JWT_SECRET: 'jwt-secret-de-teste',
  BLIND_INDEX_SALT: 'salt-de-teste',
  FIELD_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  KMS_MASTER_KEY: 'ab'.repeat(32)
};

function loadConfig(env: Record<string, string>) {
  const proc = Bun.spawnSync(
    ['bun', '-e', `const { config } = await import(${JSON.stringify(configPath)}); console.log(JSON.stringify({ field: config.fieldEncryptionKey?.length, kms: config.kmsMasterKey?.length }));`],
    { env: { PATH: process.env.PATH ?? '', ...env } }
  );
  return { exitCode: proc.exitCode, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

describe('Configuração de segredos e chaves criptográficas', () => {
  it('carrega chaves de 32 bytes em base64 e hex em produção', () => {
    const result = loadConfig(validEnv);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ field: 32, kms: 32 });
  });

  for (const name of ['JWT_SECRET', 'BLIND_INDEX_SALT', 'FIELD_ENCRYPTION_KEY', 'KMS_MASTER_KEY']) {
    it(`recusa iniciar em produção sem ${name}`, () => {
      const env: Record<string, string> = { ...validEnv };
      delete env[name];
      const result = loadConfig(env);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain(name);
    });
  }

  it('recusa chave com tamanho diferente de 32 bytes', () => {
    const result = loadConfig({ ...validEnv, FIELD_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('32 bytes');
  });

  it('permite chaves efêmeras fora de produção', () => {
    const result = loadConfig({ NODE_ENV: 'test' });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({});
  });
});
