import { AppointmentStatus } from './enums';
import type { DecryptedAppointment } from './models';

/** Recorte de período da grade de atendimento (dias no fuso de Brasília) */
export type AgendaPeriod = 'today' | 'next7' | 'month' | 'past' | 'all';
export type AgendaOrder = 'newest' | 'oldest';

export const AGENDA_PERIODS: { key: AgendaPeriod; label: string }[] = [
  { key: 'today', label: 'Hoje' },
  { key: 'next7', label: 'Próximos 7 dias' },
  { key: 'month', label: 'Este mês' },
  { key: 'past', label: 'Anteriores' },
  { key: 'all', label: 'Todas' }
];

/** Filtros de status da grade: as duas formas de cancelamento ficam juntas */
export const AGENDA_STATUS_GROUPS: { key: string; label: string; statuses: AppointmentStatus[] }[] = [
  { key: 'SOLICITADA', label: 'Solicitadas', statuses: [AppointmentStatus.SOLICITADA] },
  { key: 'CONFIRMADA', label: 'Confirmadas', statuses: [AppointmentStatus.CONFIRMADA] },
  { key: 'EM_ANDAMENTO', label: 'Em andamento', statuses: [AppointmentStatus.EM_ANDAMENTO] },
  { key: 'CONCLUIDA', label: 'Concluídas', statuses: [AppointmentStatus.CONCLUIDA] },
  { key: 'NAO_COMPARECEU', label: 'Faltas', statuses: [AppointmentStatus.NAO_COMPARECEU] },
  { key: 'REAGENDADA', label: 'Reagendadas', statuses: [AppointmentStatus.REAGENDADA] },
  { key: 'CANCELADA', label: 'Canceladas', statuses: [AppointmentStatus.CANCELADA_PELO_PACIENTE, AppointmentStatus.CANCELADA_PELO_TERAPEUTA] }
];

/** Consultas por página na grade */
export const AGENDA_PAGE_SIZE = 20;

export interface AgendaQuery {
  period?: AgendaPeriod;
  /** Chave de AGENDA_STATUS_GROUPS; ausente = todos */
  status?: string;
  order?: AgendaOrder;
  /** Busca pelo nome do paciente (sem diferenciar acentos e maiúsculas) */
  q?: string;
  limit?: number;
  offset?: number;
}

export interface AgendaPageResponse {
  appointments: DecryptedAppointment[];
  /** Total com período, status e busca aplicados */
  total: number;
  /** Contagem por grupo de status no período e busca (sem o filtro de status) */
  statusCounts: Record<string, number>;
  /** Total do período e busca, todos os status */
  periodTotal: number;
  hasMore: boolean;
}
