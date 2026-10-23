import { UserRepository } from '../repositories/userRepository';
import { db } from '../db/memoryDb';

/** Psicólogo(a) responsável pelo consultório, usado em documentos, recibos e relatórios */
export interface PracticeProfessional {
  name: string;
  /** CRP como cadastrado (ex.: "06/123456"), vazio se não informado */
  crp: string;
  crpRegion: string;
}

/** Nome exibido quando o consultório ainda não tem titular cadastrado (nunca um nome fictício) */
export const UNKNOWN_PROFESSIONAL_NAME = 'Psicólogo(a) responsável';

/** "06/123456" -> "CRP 06/123456"; vazio continua vazio */
export function formatCrp(raw: string | undefined | null): string {
  const crp = raw?.trim() ?? '';
  return !crp || crp.toUpperCase().startsWith('CRP') ? crp : `CRP ${crp}`;
}

/** Titular do consultório (mesmo quando a recepção ou o supervisor executam a ação) */
export async function practiceProfessional(therapistId: string): Promise<PracticeProfessional> {
  const owner = await UserRepository.findPracticeOwner(therapistId);
  const legacy = db.therapists.get(therapistId);
  return {
    name: owner?.name ?? UNKNOWN_PROFESSIONAL_NAME,
    crp: owner?.crp || legacy?.crp || '',
    crpRegion: owner?.crpRegion || legacy?.crpRegion || ''
  };
}
