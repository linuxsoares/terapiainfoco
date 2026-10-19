import { useEffect, useState } from 'react';
import { CalendarCheck, Loader2, Video } from 'lucide-react';
import type { AvailableSlot, PatientAppointmentView, TherapistPublicProfile } from '@terapiainfoco/shared';
import { api } from '../services/api';

interface BookingPanelProps {
  profile: TherapistPublicProfile;
  onBooked?: (appointment: PatientAppointmentView) => void;
}

/** Data (AAAA-MM-DD) no fuso de Brasília, deslocada em `days` */
function clinicDate(days: number): string {
  return new Date(Date.now() - 3 * 3600000 + days * 86400000).toISOString().slice(0, 10);
}

const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

/** Escolha de horário, aceite do TCLE e confirmação da teleconsulta pelo paciente */
export function BookingPanel({ profile, onBooked }: BookingPanelProps) {
  const [date, setDate] = useState(clinicDate(1));
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [selected, setSelected] = useState<AvailableSlot | null>(null);
  const [consent, setConsent] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<PatientAppointmentView | null>(null);

  useEffect(() => {
    setSelected(null);
    setLoadingSlots(true);
    setError(null);
    api.getAvailableSlots(profile.therapistId, date)
      .then((res) => setSlots(res.slots))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingSlots(false));
  }, [profile.therapistId, date]);

  const confirm = async () => {
    if (!selected) return;
    setBooking(true);
    setError(null);
    try {
      const appointment = await api.bookAppointmentAsPatient({
        therapistId: profile.therapistId,
        scheduledStart: selected.start,
        scheduledEnd: selected.end,
        consentTeleconsultationSigned: consent
      });
      setConfirmed(appointment);
      onBooked?.(appointment);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBooking(false);
    }
  };

  if (confirmed) {
    return (
      <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 p-5 space-y-2">
        <p className="flex items-center gap-2 font-semibold text-emerald-900 dark:text-emerald-200">
          <CalendarCheck className="w-5 h-5" /> Consulta agendada com {confirmed.therapistName}
        </p>
        <p className="text-sm text-emerald-900/80 dark:text-emerald-200/80">{dateTimeFormat.format(new Date(confirmed.scheduledStart))}</p>
        <a href={confirmed.meetUrl} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 dark:text-teal-300 underline">
          <Video className="w-4 h-4" /> Link da teleconsulta
        </a>
        <p className="text-xs text-emerald-900/70 dark:text-emerald-200/70">Ela também aparece em "Minhas consultas", no Meu Espaço.</p>
      </div>
    );
  }

  const openSlots = slots.filter((slot) => slot.available);

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-5 space-y-4">
      <h3 className="font-semibold text-slate-900 dark:text-white">Agendar teleconsulta</h3>
      <div>
        <label htmlFor="booking-date" className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Data</label>
        <input id="booking-date" type="date" min={clinicDate(0)} max={clinicDate(90)} value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-100" />
      </div>

      {loadingSlots ? (
        <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Carregando horários...</p>
      ) : openSlots.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">Sem horários livres nesta data. Escolha outro dia.</p>
      ) : (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Horários disponíveis (horário de Brasília)">
          {openSlots.map((slot) => (
            <button key={slot.start} type="button" role="radio" aria-checked={selected?.start === slot.start}
              onClick={() => setSelected(slot)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                selected?.start === slot.start
                  ? 'bg-teal-600 border-teal-600 text-white'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-teal-400'
              }`}>
              {slot.formattedTime.split(' - ')[0]}
            </button>
          ))}
        </div>
      )}

      <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
        <input type="checkbox" className="mt-0.5 w-4 h-4 accent-teal-600" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        Li e aceito o Termo de Consentimento Livre e Esclarecido para atendimento psicológico on-line (Res. CFP nº 011/2018 e LGPD Art. 11).
        A gravação ou transcrição da sessão depende de um consentimento separado.
      </label>

      {error && <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}

      <button type="button" onClick={confirm} disabled={!selected || !consent || booking}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-slate-950 bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-500 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed">
        {booking && <Loader2 className="w-4 h-4 animate-spin" />} Confirmar agendamento
      </button>
    </div>
  );
}
