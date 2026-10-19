import { useEffect, useState } from 'react';
import { HeartHandshake, FolderLock, User, ShieldCheck, Search, Video, CalendarDays } from 'lucide-react';
import type { PatientAppointmentView, SafeUser } from '@terapiainfoco/shared';
import { api } from '../services/api';

const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

interface PatientHomeModuleProps {
  currentUser: SafeUser;
  onOpenPortal: () => void;
  onOpenPortabilityVault: () => void;
  onOpenProfile: () => void;
  onFindTherapist: () => void;
  onJoinRoom: (appointmentId: string) => void;
}

/**
 * Espaço do paciente (titular LGPD Art. 18): ponto de entrada para exercícios,
 * recibos, termos TCLE, cofre de portabilidade e dados cadastrais.
 */
export function PatientHomeModule({ currentUser, onOpenPortal, onOpenPortabilityVault, onOpenProfile, onFindTherapist, onJoinRoom }: PatientHomeModuleProps) {
  const [appointments, setAppointments] = useState<PatientAppointmentView[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState(true);

  useEffect(() => {
    api.getMyPatientAppointments()
      .then(setAppointments)
      .catch(() => setAppointments([]))
      .finally(() => setLoadingAppointments(false));
  }, []);

  const upcoming = appointments.filter((a) => new Date(a.scheduledEnd).getTime() > Date.now());
  // Portal e cofre dependem de um prontuário, que nasce no primeiro agendamento
  const hasRecord = !!currentUser.patientId;

  const allActions = [
    {
      title: 'Exercícios, Recibos & TCLE',
      description: 'Exercícios terapêuticos (TCC/ACT/DBT) indicados pelo seu psicólogo, recibos para reembolso e termos de consentimento.',
      icon: HeartHandshake,
      accent: 'bg-indigo-600 hover:bg-indigo-700',
      onClick: onOpenPortal
    },
    {
      title: 'Cofre de Portabilidade (.enc)',
      description: 'Exporte seu histórico clínico em um pacote cifrado com a sua senha (LGPD Art. 18).',
      icon: FolderLock,
      accent: 'bg-teal-600 hover:bg-teal-700',
      onClick: onOpenPortabilityVault
    },
    {
      title: 'Meu Perfil',
      description: 'Dados de contato, rede de apoio para emergências e métodos de login.',
      icon: User,
      accent: 'bg-slate-700 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600',
      onClick: onOpenProfile
    }
  ];
  const actions = hasRecord ? allActions : allActions.filter((action) => action.onClick === onOpenProfile);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="rounded-3xl border border-indigo-500/20 bg-gradient-to-r from-indigo-600/10 via-teal-500/10 to-emerald-500/10 p-6">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Olá, {currentUser.name}!</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Este é o seu espaço. Aqui você acompanha o que o seu psicólogo compartilhou com você e exerce seus direitos de titular dos dados.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
            <CalendarDays className="w-5 h-5 text-teal-600 dark:text-teal-400" /> Minhas consultas
          </h2>
          <button onClick={onFindTherapist}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white">
            <Search className="w-3.5 h-3.5" /> Encontrar psicólogo
          </button>
        </div>
        {loadingAppointments ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Carregando...</p>
        ) : upcoming.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Nenhuma consulta agendada. Encontre um psicólogo com CRP verificado e agende sua teleconsulta.
          </p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {upcoming.map((a) => (
              <li key={a.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">{a.therapistName}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">{dateTimeFormat.format(new Date(a.scheduledStart))}</p>
                </div>
                <button onClick={() => onJoinRoom(a.id)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300 underline">
                  <Video className="w-3.5 h-3.5" /> Entrar na teleconsulta
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {actions.map(({ title, description, icon: Icon, accent, onClick }) => (
          <button
            key={title}
            onClick={onClick}
            className="text-left rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm hover:shadow-md transition-all flex flex-col gap-3"
          >
            <span className={`w-10 h-10 rounded-xl text-white flex items-center justify-center ${accent}`}>
              <Icon className="w-5 h-5" />
            </span>
            <span className="font-semibold text-slate-900 dark:text-white">{title}</span>
            <span className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{description}</span>
          </button>
        ))}
      </div>

      <p className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
        Seus dados clínicos são cifrados (AES-256-GCM) e só o seu psicólogo responsável tem acesso ao prontuário (CFP nº 001/2009).
      </p>
    </div>
  );
}
