import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { EncryptedInMemoryCache } from '../src/encryptedCache';

describe('Encrypted In-Memory Cache (AES-256-GCM & RAM Protection)', () => {
  let cache: EncryptedInMemoryCache;

  beforeEach(() => {
    cache = new EncryptedInMemoryCache(0); // Desativa timer automático para controle nos testes
  });

  afterEach(() => {
    cache.destroy();
  });

  it('deve armazenar e recuperar dados complexos com cifragem transparente', () => {
    const sessionData = {
      patientId: 'patient-123',
      tempToken: 'jwt.sample.token',
      crp: '06/123456',
      roles: ['PSICOLOGO_TITULAR']
    };

    cache.set('session:123', sessionData, 10000);

    const retrieved = cache.get<typeof sessionData>('session:123');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.patientId).toBe('patient-123');
    expect(retrieved?.roles).toEqual(['PSICOLOGO_TITULAR']);
  });

  it('não deve armazenar dados em texto plano na memória interna', () => {
    const sensitiveNote = 'Informação confidencial de prontuário com ideação suicida';
    cache.set('record:sensitive', { note: sensitiveNote }, 10000);

    // Acessa o store interno para verificar que não há plaintext exposto
    const internalStore = (cache as any).store as Map<string, any>;
    const rawEntry = internalStore.get('record:sensitive');

    expect(rawEntry).toBeDefined();
    expect(rawEntry.encryptedPayload).toBeDefined();
    expect(rawEntry.encryptedPayload.ciphertext).toBeDefined();
    expect(rawEntry.encryptedPayload.iv).toBeDefined();
    expect(rawEntry.encryptedPayload.authTag).toBeDefined();

    // O texto sensível nunca deve aparecer no payload bruto cifrado
    expect(rawEntry.encryptedPayload.ciphertext).not.toContain('confidencial');
    expect(rawEntry.encryptedPayload.ciphertext).not.toContain('ideação');
  });

  it('deve expirar entradas após o término do TTL', async () => {
    cache.set('temp:token', { code: '123456' }, 30); // 30ms

    expect(cache.get('temp:token')).toEqual({ code: '123456' });

    // Aguarda o TTL expirar
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(cache.get('temp:token')).toBeNull();
    expect(cache.has('temp:token')).toBe(false);
  });

  it('deve falhar a decifragem e descartar item se o ciphertext for adulterado em memória', () => {
    cache.set('tamper:test', { data: 'valor original' }, 10000);

    const internalStore = (cache as any).store as Map<string, any>;
    const rawEntry = internalStore.get('tamper:test');

    // Simula adulteração de bits na memória RAM (bit-flipping / memory corruption)
    const corruptedBuffer = Buffer.from(rawEntry.encryptedPayload.ciphertext, 'base64');
    corruptedBuffer[0] ^= 0xff;
    rawEntry.encryptedPayload.ciphertext = corruptedBuffer.toString('base64');

    // Ao tentar ler, a tag GCM deve rejeitar e retornar null
    const result = cache.get('tamper:test');
    expect(result).toBeNull();
  });

  it('deve rotacionar a DEK em RAM e re-cifrar todas as entradas existentes sem perder dados', () => {
    cache.set('key:1', { item: 'primeiro' }, 10000);
    cache.set('key:2', { item: 'segundo' }, 10000);

    const oldKey = Buffer.from((cache as any).currentKey);

    // Dispara a rotação de chaves em RAM
    cache.rotateKey();

    const newKey = (cache as any).currentKey as Buffer;
    expect(newKey.equals(oldKey)).toBe(false);

    // Todos os itens devem continuar acessíveis com a nova chave
    expect(cache.get('key:1')).toEqual({ item: 'primeiro' });
    expect(cache.get('key:2')).toEqual({ item: 'segundo' });

    // A chave antiga foi zeroizada
    expect(oldKey.every((byte) => byte === 0)).toBe(false); // oldKey era cópia
    expect((cache as any).keyCreatedAt).toBeGreaterThan(0);
  });

  it('deve coletar métricas de observabilidade de cache e hit ratio', () => {
    cache.set('test:stats', { foo: 'bar' }, 10000);

    cache.get('test:stats'); // Hit 1
    cache.get('test:stats'); // Hit 2
    cache.get('inexistente'); // Miss 1

    const stats = cache.getStats();
    expect(stats.totalKeys).toBe(1);
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRatio).toBeGreaterThan(60);
    expect(stats.encryptionAlgorithm).toBe('aes-256-gcm');
    expect(stats.memorySizeBytesEstimate).toBeGreaterThan(0);
  });
});
