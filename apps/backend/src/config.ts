export const config = {
  port: Number(process.env.PORT) || 3000,
  env: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-jwt-key-2026',
  /** Salt secreto para cômputo determinístico do Blind Index (HMAC-SHA256) */
  blindIndexSalt: process.env.BLIND_INDEX_SALT || 'salt-segredo-clinica-hmac-2026',
  /** Intervalo padrão de buffer entre consultas em minutos (RFC §3.1) */
  defaultBufferMinutes: 10,
  /** Antecedência mínima para cancelamento sem penalidade em horas */
  minCancelNoticeHours: 24
};
