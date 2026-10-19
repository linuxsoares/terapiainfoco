const env = process.env.NODE_ENV || 'development';
const isProduction = env === 'production';

/**
 * Segredos com fallback apenas para desenvolvimento/testes.
 * Em produção a ausência é fatal: um fallback silencioso tornaria tokens forjáveis
 * ou dados cifrados irrecuperáveis após um redeploy.
 */
function secret(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value) return value;
  if (isProduction) {
    throw new Error(`Variável de ambiente obrigatória em produção ausente: ${name}`);
  }
  return devFallback;
}

/**
 * Chave simétrica de 256 bits informada em base64 (openssl rand -base64 32) ou hex (64 caracteres).
 * Retorna undefined fora de produção quando ausente, permitindo chave efêmera em dev/testes.
 */
function symmetricKey(name: string): Buffer | undefined {
  const value = process.env[name]?.trim();
  if (!value) {
    if (isProduction) {
      throw new Error(`Variável de ambiente obrigatória em produção ausente: ${name} (gere com: openssl rand -base64 32)`);
    }
    return undefined;
  }
  const key = /^[0-9a-fA-F]{64}$/.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64');
  if (key.length !== 32) {
    throw new Error(`${name} deve conter exatamente 32 bytes (base64 ou hex); recebidos ${key.length} bytes.`);
  }
  return key;
}

/** "a, b" -> ["a", "b"] */
function list(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

export const config = {
  port: Number(process.env.PORT) || 3000,
  env,
  isProduction,
  jwtSecret: secret('JWT_SECRET', 'dev-secret-jwt-key-2026'),
  /** Salt secreto para cômputo determinístico do Blind Index (HMAC-SHA256) */
  blindIndexSalt: secret('BLIND_INDEX_SALT', 'salt-segredo-clinica-hmac-2026'),
  /** Chave AES-256 da criptografia Field-Level (FLE). Precisa ser estável entre deploys. */
  fieldEncryptionKey: symmetricKey('FIELD_ENCRYPTION_KEY'),
  /** KEK mestre v1 do KMS local (Envelope Encryption). Precisa ser estável entre deploys. */
  kmsMasterKey: symmetricKey('KMS_MASTER_KEY'),
  /**
   * Modo demonstração: cria contas e paciente fictícios com senha conhecida (Senha@123456).
   * Padrão ligado em dev/testes e desligado em produção; nunca habilite com dados reais.
   */
  demoMode: process.env.DEMO_MODE ? process.env.DEMO_MODE === 'true' : !isProduction,
  /** Permite subir produção sem DATABASE_URL (PGlite em memória, dados perdidos no restart) */
  allowEphemeralDatabase: process.env.ALLOW_EPHEMERAL_DATABASE === 'true',
  /** Diretório para persistir o PGlite em disco no desenvolvimento local (ex: ./.data/pglite) */
  pgliteDataDir: process.env.PGLITE_DATA_DIR || '',
  /** Offset UTC da agenda da clínica (Brasília não tem horário de verão desde 2019) */
  clinicUtcOffset: process.env.CLINIC_UTC_OFFSET || '-03:00',
  /** Intervalo padrão de buffer entre consultas em minutos (RFC §3.1) */
  defaultBufferMinutes: 10,
  /** Antecedência mínima para cancelamento sem penalidade em horas */
  minCancelNoticeHours: 24,
  /** Configurações de integração com Supabase */
  supabase: {
    url: process.env.SUPABASE_URL || '',
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || '',
    secretKey: process.env.SUPABASE_SECRET_KEY || '',
    jwksUrl: process.env.SUPABASE_JWKS_URL || ''
  },
  /** Servidores ICE da teleconsulta: STUN descobre a rota; TURN retransmite em redes restritivas (NAT simétrico, firewalls) */
  webrtc: {
    stunUrls: list(process.env.STUN_URLS ?? 'stun:stun.l.google.com:19302'),
    turnUrls: list(process.env.TURN_URLS ?? ''),
    turnUsername: process.env.TURN_USERNAME || '',
    turnCredential: process.env.TURN_CREDENTIAL || ''
  },
  /** URL pública do painel (frontend): base do link da sala de teleconsulta própria */
  publicAppUrl: (process.env.PUBLIC_APP_URL || 'http://localhost:5174').replace(/\/+$/, '')
};

