import { MeetAccessType } from '@terapiainfoco/shared';

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
  /** Configurações da API do Google Workspace & Google Meet (RFC §3.2) */
  google: {
    /** ID do cliente OAuth 2.0 (Google Cloud Console) */
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    /** Chave secreta do cliente OAuth 2.0 (Google Cloud Console) */
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    /** URI de redirecionamento configurada no console (se vazia, inferida dinamicamente do proxy/Host) */
    redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
    /** Refresh token persistente para renovação automática sem expiração */
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN || '',
    /** Token OAuth Bearer com escopo https://www.googleapis.com/auth/meetings.space.created */
    meetAccessToken: process.env.GOOGLE_MEET_ACCESS_TOKEN || process.env.GOOGLE_WORKSPACE_ACCESS_TOKEN || '',
    /** Token OAuth legado para Google Calendar com conferenceData */
    calendarAccessToken: process.env.GOOGLE_CALENDAR_ACCESS_TOKEN || '',
    /** Tipo de controle de admissão (sala de espera / knocking): TRUSTED (padrão CFP), OPEN ou RESTRICTED */
    defaultAccessType: (process.env.GOOGLE_MEET_ACCESS_TYPE as MeetAccessType) || MeetAccessType.TRUSTED
  }
};

