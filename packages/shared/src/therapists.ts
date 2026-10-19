/**
 * Perfis públicos de psicólogos e busca (RFC-001 §3.1).
 * Catálogos controlados mantêm os filtros consistentes entre perfis.
 */
export const THERAPEUTIC_APPROACHES = [
  'Terapia Cognitivo-Comportamental (TCC)',
  'Terapia de Aceitação e Compromisso (ACT)',
  'Terapia Comportamental Dialética (DBT)',
  'Terapia do Esquema',
  'Análise do Comportamento',
  'Psicanálise',
  'Psicologia Analítica (Junguiana)',
  'Gestalt-terapia',
  'Abordagem Centrada na Pessoa',
  'Terapia Sistêmica',
  'Psicodrama',
  'EMDR',
  'Neuropsicologia'
] as const;

export const CLINICAL_SPECIALTIES = [
  'Ansiedade',
  'Depressão',
  'Pânico',
  'TOC',
  'Luto',
  'Trauma e TEPT',
  'Burnout',
  'Autoestima',
  'Relacionamentos',
  'Terapia de casal',
  'Sexualidade e gênero',
  'TDAH',
  'Autismo (TEA)',
  'Transtornos alimentares',
  'Dependência química',
  'Carreira e trabalho',
  'Infância e adolescência'
] as const;

export type TherapeuticApproach = (typeof THERAPEUTIC_APPROACHES)[number];
export type ClinicalSpecialty = (typeof CLINICAL_SPECIALTIES)[number];

/** Perfil exibido publicamente (busca e página do psicólogo) */
export interface TherapistPublicProfile {
  therapistId: string;
  slug: string;
  displayName: string;
  crp: string;
  crpRegion: string;
  crpVerified: boolean;
  headline: string | null;
  bio: string | null;
  approaches: string[];
  specialties: string[];
  languages: string[];
  sessionFeeCents: number | null;
  sessionDurationMinutes: number;
}

/** Perfil completo para o próprio psicólogo editar */
export interface TherapistOwnProfile extends TherapistPublicProfile {
  published: boolean;
  crpVerifiedAt: string | null;
}

export interface TherapistSearchParams {
  q?: string;
  approach?: string;
  specialty?: string;
  maxFeeCents?: number;
  page?: number;
  pageSize?: number;
}

export interface TherapistSearchResponse {
  success: boolean;
  results: TherapistPublicProfile[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UpdateTherapistProfileDTO {
  displayName?: string;
  headline?: string | null;
  bio?: string | null;
  approaches?: string[];
  specialties?: string[];
  languages?: string[];
  sessionFeeCents?: number | null;
  sessionDurationMinutes?: number;
  published?: boolean;
}

export interface VerifyTherapistCrpDTO {
  approved: boolean;
}
