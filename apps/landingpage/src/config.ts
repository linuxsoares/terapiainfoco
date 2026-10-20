// URL pública do painel (VITE_APP_URL no build); localhost só no desenvolvimento
const configuredAppUrl = (import.meta.env.VITE_APP_URL || (import.meta.env.DEV ? 'http://localhost:5174' : ''))
  .trim()
  .replace(/\/+$/, '');

/** Link para o painel com parâmetros de entrada, ou null quando o painel não está configurado */
export function appLink(query: string): string | null {
  return configuredAppUrl ? `${configuredAppUrl}/?${query}` : null;
}

export const PANEL_LINKS = {
  findTherapist: appLink('vitrine=psicologos'),
  login: appLink('entrar'),
  registerPatient: appLink('cadastro=paciente')
};
