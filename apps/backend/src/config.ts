import { MeetAccessType } from '@terapiainfoco/shared';

export const config = {
  port: Number(process.env.PORT) || 3000,
  env: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-jwt-key-2026',
  /** Salt secreto para cômputo determinístico do Blind Index (HMAC-SHA256) */
  blindIndexSalt: process.env.BLIND_INDEX_SALT || 'salt-segredo-clinica-hmac-2026',
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

