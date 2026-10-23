import { describe, it, expect } from 'bun:test';
import { describeDatabaseUrl } from '../src/db';

describe('Log da conexão com o banco', () => {
  it('mostra só host, porta e banco, mesmo com "@" e ":" na senha', () => {
    const cases: [string, string][] = [
      ['postgresql://postgres.abc:s3gr3d0@G1l@aws-0-us-east-1.pooler.supabase.com:6543/postgres', 'aws-0-us-east-1.pooler.supabase.com:6543/postgres'],
      ['postgres://user:pa:ss@word@localhost:5432/app?sslmode=require', 'localhost:5432/app'],
      ['postgresql://localhost/terapia', 'localhost/terapia']
    ];
    for (const [url, expected] of cases) {
      const described = describeDatabaseUrl(url);
      expect(described).toBe(expected);
      expect(described).not.toMatch(/s3gr3d0|G1l|word|user|postgres\.abc/);
    }
  });
});
