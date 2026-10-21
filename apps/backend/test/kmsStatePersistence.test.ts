import { describe, it, expect } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { authService } from '../src/services/authService';
import { kmsProvider } from '../src/services/cryptoContext';
import { requireUser } from './helpers/db';

describe('Persistência do estado do KMS local', () => {
  it('rotação via console administrativo registra versão ativa no entity_store', async () => {
    const admin = (await requireUser('00000000-0000-0000-0000-000000000004'));
    const { accessToken } = await authService.issueTokens(admin, '127.0.0.1');
    const before = kmsProvider.getActiveKeyVersion();

    const res = await app.request('/api/kms/rotate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Teste de persistência do estado do KMS' })
    });
    expect(res.status).toBe(200);

    const state = db.kmsState.get('local')!;
    expect(state.activeVersion).toBe(before + 1);
    expect(state.keys.map((k) => k.version)).toContain(before + 1);
  });
});
