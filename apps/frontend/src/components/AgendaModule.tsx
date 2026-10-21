import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Clock, 
  Video, 
  Plus, 
  AlertCircle, 
  CheckCircle2, 
  RefreshCw,
  XCircle,
  Play,
  Repeat,
  Bell,
  Send,
  MessageSquare,
  Sparkles,
  Search
} from 'lucide-react';
import { 
  AppointmentStatus, 
  RecurrenceFrequency,
  ReminderChannel,
  ReminderTiming,
  UserRole,
  type DecryptedAppointment,
  type StoredAppointmentReminder
} from '@terapiainfoco/shared';
import type { PatientSearchItem } from '@terapiainfoco/shared';
import { api } from '../services/api';
import { TeleconsultationRoom } from './TeleconsultationRoom';
import { AiTranscriptionSoapModal } from './AiTranscriptionSoapModal';

/** A sala pode ser iniciada a partir de 15 minutos antes do horário (mesma regra do backend) */
const SESSION_EARLY_START_MS = 15 * 60 * 1000;

export function AgendaModule({ role }: { role: UserRole }) {
  // Iniciar e concluir sessão são atos clínicos: a recepção só confirma, reagenda e cancela
  const isClinician = role === UserRole.PSICOLOGO_TITULAR || role === UserRole.SUPERVISOR_CLINICO;
  const [appointments, setAppointments] = useState<DecryptedAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Teleconsulta Nativa WebRTC P2P (RFC-001 §3.2)
  const [selectedTeleconsultationApp, setSelectedTeleconsultationApp] = useState<DecryptedAppointment | null>(null);

  // Transcrição & Síntese SOAP IA (RFC-001 §3.3)
  const [selectedAiSoapApp, setSelectedAiSoapApp] = useState<DecryptedAppointment | null>(null);

  // Form de novo agendamento
  const [showModal, setShowModal] = useState(false);
  // Paciente escolhido pela busca do consultório (nome ou e-mail), nunca por ID digitado
  const [selectedPatient, setSelectedPatient] = useState<PatientSearchItem | null>(null);
  const [patientQuery, setPatientQuery] = useState('');
  const [patientMatches, setPatientMatches] = useState<PatientSearchItem[]>([]);
  const [patientSearchError, setPatientSearchError] = useState<string | null>(null);
  const [searchingPatients, setSearchingPatients] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState('14:00');
  const [bufferMin, setBufferMin] = useState(10);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Recorrência (RFC §3.1)
  const [isRecurrent, setIsRecurrent] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<RecurrenceFrequency>(RecurrenceFrequency.WEEKLY);
  const [recurrenceSessions, setRecurrenceSessions] = useState(4);

  // Modal de Lembretes Multicanal (RFC §3.1 & Res. CFP nº 011/2018)
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [selectedAppointmentForReminder, setSelectedAppointmentForReminder] = useState<DecryptedAppointment | null>(null);
  const [reminderChannel, setReminderChannel] = useState<ReminderChannel>(ReminderChannel.WHATSAPP);
  const [reminderTiming, setReminderTiming] = useState<ReminderTiming>(ReminderTiming.HOURS_24_BEFORE);
  const [reminderRecipientPhone, setReminderRecipientPhone] = useState('11987654321');
  const [reminderRecipientEmail, setReminderRecipientEmail] = useState('mariana.silva@email.com');
  const [reminderPreview, setReminderPreview] = useState<{ message: string; channel: string } | null>(null);
  const [reminderLoading, setReminderLoading] = useState(false);
  const [reminderHistory, setReminderHistory] = useState<StoredAppointmentReminder[]>([]);


  const fetchAppointments = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getAppointments();
      setAppointments(data);
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar agenda');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppointments();
  }, []);

  // Busca com espera curta para não estourar o limite de buscas da rota
  useEffect(() => {
    const query = patientQuery.trim();
    if (selectedPatient || query.length < 2) {
      setPatientMatches([]);
      setPatientSearchError(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        setSearchingPatients(true);
        const matches = await api.searchPatients(query);
        if (cancelled) return;
        setPatientMatches(matches);
        setPatientSearchError(matches.length === 0 ? 'Nenhum paciente encontrado com esse nome ou e-mail.' : null);
      } catch (err: any) {
        if (!cancelled) setPatientSearchError(err.message || 'Falha ao buscar pacientes.');
      } finally {
        if (!cancelled) setSearchingPatients(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [patientQuery, selectedPatient]);

  const openNewAppointmentModal = () => {
    setSelectedPatient(null);
    setPatientQuery('');
    setShowModal(true);
  };

  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;
    const patientId = selectedPatient.id;
    try {
      setIsSubmitting(true);
      setError(null);

      const start = new Date(`${date}T${time}:00`);
      const end = new Date(start.getTime() + 50 * 60 * 1000); // 50 minutos de duração

      if (isRecurrent) {
        const res = await api.createRecurrentAppointments({
          patientId,
          scheduledStart: start.toISOString(),
          scheduledEnd: end.toISOString(),
          bufferMinutes: Number(bufferMin),
          recurrence: {
            frequency: recurrenceFrequency,
            count: Number(recurrenceSessions),
            totalSessions: Number(recurrenceSessions)
          }
        });
        const totalCreated = res.createdAppointments?.length || res.requestedCount || res.count || recurrenceSessions;
        setSuccessMsg(`Série clínica de ${totalCreated} consultas criada com sucesso!`);
      } else {
        await api.createAppointment({
          patientId,
          scheduledStart: start.toISOString(),
          scheduledEnd: end.toISOString(),
          bufferMinutes: Number(bufferMin)
        });
        setSuccessMsg('Consulta agendada com sucesso! A sessão acontece na sala de teleconsulta da plataforma.');
      }

      setShowModal(false);
      await fetchAppointments();
      setTimeout(() => setSuccessMsg(null), 4500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelSeries = async (seriesId: string) => {
    if (!confirm('Deseja cancelar todas as consultas futuras desta série clínica recorrente?')) {
      return;
    }
    try {
      setError(null);
      const res = await api.cancelAppointmentSeries(seriesId);
      setSuccessMsg(`Série cancelada com sucesso (${res.canceledCount} consultas removidas).`);
      await fetchAppointments();
      setTimeout(() => setSuccessMsg(null), 4500);
    } catch (err: any) {
      setError(err.message || 'Falha ao cancelar série de consultas');
    }
  };

  const handleOpenReminderModal = async (app: DecryptedAppointment) => {
    setSelectedAppointmentForReminder(app);
    setShowReminderModal(true);
    setReminderPreview(null);
    try {
      const history = await api.getAppointmentReminders(app.id);
      setReminderHistory(history);
    } catch {
      setReminderHistory([]);
    }
    try {
      const preview = await api.previewAppointmentReminder(app.id, reminderChannel, reminderTiming);
      setReminderPreview(preview);
    } catch {
      // preview pode falhar se não houver conexão, não trava abertura
    }
  };

  const handleGeneratePreview = async (channel = reminderChannel, timing = reminderTiming) => {
    if (!selectedAppointmentForReminder) return;
    try {
      setReminderLoading(true);
      const preview = await api.previewAppointmentReminder(selectedAppointmentForReminder.id, channel, timing);
      setReminderPreview(preview);
    } catch (err: any) {
      setError(err.message || 'Falha ao gerar prévia do lembrete');
    } finally {
      setReminderLoading(false);
    }
  };

  const handleSendReminder = async () => {
    if (!selectedAppointmentForReminder) return;
    try {
      setReminderLoading(true);
      const res = await api.sendAppointmentReminder({
        appointmentId: selectedAppointmentForReminder.id,
        channel: reminderChannel,
        timing: reminderTiming,
        recipientPhone: reminderChannel === ReminderChannel.WHATSAPP ? reminderRecipientPhone : undefined,
        recipientEmail: reminderChannel === ReminderChannel.EMAIL ? reminderRecipientEmail : undefined
      });

      setSuccessMsg(res.message || 'Lembrete de teleconsulta processado e registrado na auditoria WORM.');
      if (res.whatsappDirectUrl && reminderChannel === ReminderChannel.WHATSAPP) {
        window.open(res.whatsappDirectUrl, '_blank');
      }

      const history = await api.getAppointmentReminders(selectedAppointmentForReminder.id);
      setReminderHistory(history);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setError(err.message || 'Falha ao disparar lembrete');
    } finally {
      setReminderLoading(false);
    }
  };

  const handleStatusChange = async (appointmentId: string, status: AppointmentStatus) => {
    try {
      setError(null);
      await api.updateAppointmentStatus(appointmentId, status);
      await fetchAppointments();
      setSuccessMsg(`Status atualizado para: ${status}`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const getStatusBadge = (status: AppointmentStatus) => {
    switch (status) {
      case AppointmentStatus.CONFIRMADA:
        return 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30';
      case AppointmentStatus.EM_ANDAMENTO:
        return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 animate-pulse';
      case AppointmentStatus.CONCLUIDA:
        return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
      case AppointmentStatus.CANCELADA_PELO_PACIENTE:
      case AppointmentStatus.CANCELADA_PELO_TERAPEUTA:
        return 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30';
      default:
        return 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Calendar className="w-6 h-6 text-teal-600 dark:text-teal-400" />
            Agenda Clínica & Teleconsulta
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Gestão de grade horária, buffers automáticos e sala de teleconsulta própria, sem gravação
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            onClick={fetchAppointments}
            className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white shadow-sm dark:shadow-none transition-colors cursor-pointer"
            title="Atualizar grade"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={openNewAppointmentModal}
            className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold flex items-center gap-2 shadow-lg shadow-teal-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Novo Agendamento
          </button>
        </div>
      </div>

      {/* Alertas */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-sm flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
            <span>Buffer Entre Sessões</span>
            <Clock className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">10 min</span>
            <span className="text-xs text-teal-600 dark:text-teal-400 font-semibold">Obrigatório</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
            <span>Teleconsulta Própria</span>
            <Video className="w-4 h-4 text-sky-600 dark:text-sky-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">Sem Gravação</span>
            <span className="text-xs text-sky-600 dark:text-sky-400 font-semibold">Sala de Espera (CFP 011/2018)</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
            <span>Consultas Registradas</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">{appointments.length}</span>
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">Na Base de Dados</span>
          </div>
        </div>
      </div>

      {/* Lista de Consultas */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
          Grade de Atendimento
        </h2>

        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Carregando consultas...</div>
        ) : appointments.length === 0 ? (
          <div className="p-12 rounded-2xl bg-white dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800/80 text-center space-y-3 shadow-sm dark:shadow-none">
            <Calendar className="w-10 h-10 text-slate-400 dark:text-slate-600 mx-auto" />
            <p className="text-slate-500 dark:text-slate-400 text-sm">Nenhuma consulta agendada no momento.</p>
            <button
              onClick={openNewAppointmentModal}
              className="text-xs text-teal-600 dark:text-teal-400 hover:underline font-semibold"
            >
              + Criar primeiro agendamento
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {appointments.map((app) => {
              return (
                <div
                  key={app.id}
                  className="p-5 rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm dark:shadow-none transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/20 flex flex-col items-center justify-center text-teal-700 dark:text-teal-300 shrink-0">
                      <span className="text-sm font-bold">
                        {new Date(app.scheduledStart).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="text-[10px] text-teal-600 dark:text-teal-400/70 font-medium">50 min</span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white text-base">
                          {app.patientName ?? 'Paciente'}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-medium border ${getStatusBadge(app.status)}`}>
                          {app.status}
                        </span>
                        {app.seriesId && (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30 flex items-center gap-1">
                            <Repeat className="w-3 h-3 text-purple-500" />
                            Série #{app.sequenceNumber || 1} ({app.recurrenceFrequency || 'WEEKLY'})
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <span>Data: {new Date(app.scheduledStart).toLocaleDateString('pt-BR')}</span>
                      </p>

                    </div>
                  </div>

                  {/* Ações de Estado */}
                  <div className="flex flex-wrap items-center gap-2 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100 dark:border-slate-800">
                    {/* Recepção agenda e envia lembretes, mas não entra na sala nem acessa conteúdo clínico */}
                    {isClinician && (
                      <>
                      <button
                        onClick={() => setSelectedTeleconsultationApp(app)}
                        className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                        title="Abrir a sala de teleconsulta com sala de espera ética"
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span>Sala de Teleconsulta</span>
                      </button>

                      <button
                        onClick={() => setSelectedAiSoapApp(app)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Transcrição Assistida por IA, Diarização & Síntese SOAP em Tempo Real"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>SOAP IA</span>
                      </button>
                      </>
                    )}

                    <button
                      onClick={() => handleOpenReminderModal(app)}
                      className="px-3 py-1.5 rounded-lg bg-teal-50 dark:bg-teal-500/10 hover:bg-teal-100 dark:hover:bg-teal-500/20 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Enviar lembrete via WhatsApp ou E-mail com link da sala (CFP 011/2018)"
                    >
                      <Bell className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                      Lembrete
                    </button>

                    {isClinician && app.status === AppointmentStatus.CONFIRMADA &&
                     Date.now() >= new Date(app.scheduledStart).getTime() - SESSION_EARLY_START_MS && (
                      <button
                        onClick={() => handleStatusChange(app.id, AppointmentStatus.EM_ANDAMENTO)}
                        className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5" /> Iniciar
                      </button>
                    )}

                    {isClinician && app.status === AppointmentStatus.EM_ANDAMENTO && (
                      <>
                        <button
                          onClick={() => handleStatusChange(app.id, AppointmentStatus.CONCLUIDA)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Concluir
                        </button>
                      </>
                    )}

                    {app.seriesId && 
                     app.status !== AppointmentStatus.CONCLUIDA && 
                     app.status !== AppointmentStatus.CANCELADA_PELO_PACIENTE && (
                      <button
                        onClick={() => handleCancelSeries(app.seriesId!)}
                        className="px-2.5 py-1.5 rounded-lg bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 dark:hover:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                        title="Cancela todas as sessões futuras pertencentes a esta série clínica"
                      >
                        <Repeat className="w-3 h-3" /> Cancelar Série
                      </button>
                    )}

                    {app.status !== AppointmentStatus.CONCLUIDA && 
                     app.status !== AppointmentStatus.CANCELADA_PELO_PACIENTE &&
                     app.status !== AppointmentStatus.CANCELADA_PELO_TERAPEUTA && (
                      <button
                        onClick={() => handleStatusChange(app.id, AppointmentStatus.CANCELADA_PELO_TERAPEUTA)}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 dark:bg-slate-800 dark:hover:bg-rose-950 dark:hover:text-rose-300 dark:text-slate-400 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Cancelar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de Agendamento */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-2xl transition-colors duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                Agendar Nova Consulta
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAppointment} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Paciente</label>
                {selectedPatient ? (
                  <div className="flex items-center justify-between gap-3 bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/30 rounded-xl px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{selectedPatient.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{selectedPatient.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPatient(null);
                        setPatientQuery('');
                      }}
                      className="text-xs font-medium text-teal-700 dark:text-teal-300 hover:underline shrink-0"
                    >
                      Trocar
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="search"
                        value={patientQuery}
                        onChange={(e) => setPatientQuery(e.target.value)}
                        placeholder="Buscar por nome ou e-mail"
                        autoFocus
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                      />
                    </div>
                    {searchingPatients && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">Buscando pacientes...</p>
                    )}
                    {patientSearchError && !searchingPatients && (
                      <p className="text-xs text-rose-600 dark:text-rose-400">{patientSearchError}</p>
                    )}
                    {patientMatches.length > 0 && (
                      <ul className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                        {patientMatches.map((match) => (
                          <li key={match.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedPatient(match)}
                              className="w-full text-left px-3.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            >
                              <p className="text-sm font-medium text-slate-900 dark:text-white">{match.name}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">{match.email}</p>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {patientQuery.trim().length < 2 && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Digite ao menos 2 letras. Paciente novo? Cadastre-o primeiro em Pacientes.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Data</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Horário de Início</label>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Buffer Obrigatório de Respiro (minutos)
                </label>
                <input
                  type="number"
                  min="5"
                  max="30"
                  value={bufferMin}
                  onChange={(e) => setBufferMin(Number(e.target.value))}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                  required
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  A API bloqueará agendamentos conflitantes que invadam esta janela.
                </p>
              </div>

              {/* Recorrência Clínica (RFC §3.1) */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isRecurrent}
                      onChange={(e) => setIsRecurrent(e.target.checked)}
                      className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 w-4 h-4"
                    />
                    <Repeat className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    Agendar como Série Recorrente
                  </label>
                  {isRecurrent && (
                    <span className="text-[11px] font-medium text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-md border border-purple-500/20">
                      Série Clínica Ativa
                    </span>
                  )}
                </div>

                {isRecurrent && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-200 dark:border-slate-700/60">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Periodicidade
                      </label>
                      <select
                        value={recurrenceFrequency}
                        onChange={(e) => setRecurrenceFrequency(e.target.value as RecurrenceFrequency)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                      >
                        <option value={RecurrenceFrequency.WEEKLY}>Semanal (Recomendado)</option>
                        <option value={RecurrenceFrequency.BIWEEKLY}>Quinzenal</option>
                        <option value={RecurrenceFrequency.MONTHLY}>Mensal</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Total de Sessões
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="2"
                          max="24"
                          value={recurrenceSessions}
                          onChange={(e) => setRecurrenceSessions(Number(e.target.value))}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500 font-semibold"
                        />
                        <div className="flex gap-1">
                          {[4, 8, 12].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setRecurrenceSessions(n)}
                              className={`px-2 py-1 text-[10px] rounded-lg border font-mono font-medium transition-colors cursor-pointer ${
                                recurrenceSessions === n
                                  ? 'bg-purple-600 text-white border-purple-600'
                                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 text-sm font-medium transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !selectedPatient}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting 
                    ? (isRecurrent ? 'Gerando Série...' : 'Agendando...') 
                    : (isRecurrent ? `Criar Série (${recurrenceSessions} Sessões)` : 'Confirmar Agendamento')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Notificações & Lembretes Multicanal (RFC §3.1 & Res. CFP nº 011/2018) */}
      {showReminderModal && selectedAppointmentForReminder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-5 sm:p-6 space-y-4 shadow-2xl transition-colors duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    Lembrete de Teleconsulta
                    <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20">
                      CFP nº 011/2018
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Notificação multicanal com sala criptografada e link direto wa.me
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowReminderModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Informações da Consulta */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Paciente:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
                  {selectedAppointmentForReminder.patientId}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Data e Hora:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {new Date(selectedAppointmentForReminder.scheduledStart).toLocaleDateString('pt-BR')} às{' '}
                  {new Date(selectedAppointmentForReminder.scheduledStart).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Link da sala:</span>
                <span className="font-mono text-sky-600 dark:text-sky-400 truncate max-w-[240px]">
                  {selectedAppointmentForReminder.roomUrl}
                </span>
              </div>
            </div>

            {/* Seleção de Canal e Destinatário */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Canal de Notificação
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setReminderChannel(ReminderChannel.WHATSAPP);
                      handleGeneratePreview(ReminderChannel.WHATSAPP, reminderTiming);
                    }}
                    className={`p-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      reminderChannel === ReminderChannel.WHATSAPP
                        ? 'bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300 font-bold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4 text-emerald-500" /> WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReminderChannel(ReminderChannel.EMAIL);
                      handleGeneratePreview(ReminderChannel.EMAIL, reminderTiming);
                    }}
                    className={`p-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      reminderChannel === ReminderChannel.EMAIL
                        ? 'bg-sky-500/15 border-sky-500 text-sky-700 dark:text-sky-300 font-bold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Send className="w-4 h-4 text-sky-500" /> E-mail
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Janela de Envio (Timing)
                </label>
                <select
                  value={reminderTiming}
                  onChange={(e) => {
                    const timing = e.target.value as ReminderTiming;
                    setReminderTiming(timing);
                    handleGeneratePreview(reminderChannel, timing);
                  }}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                >
                  <option value={ReminderTiming.IMMEDIATE}>Imediato (Agendamento Confirmado)</option>
                  <option value={ReminderTiming.HOURS_24_BEFORE}>24 Horas Antes</option>
                  <option value={ReminderTiming.HOURS_2_BEFORE}>2 Horas Antes (Sala de Espera)</option>
                </select>
              </div>
            </div>

            {/* Input de Destinatário */}
            {reminderChannel === ReminderChannel.WHATSAPP ? (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Número de WhatsApp do Paciente (E.164 ou DDD + Telefone)
                </label>
                <input
                  type="text"
                  value={reminderRecipientPhone}
                  onChange={(e) => setReminderRecipientPhone(e.target.value)}
                  placeholder="Ex: 11987654321 ou +5511987654321"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500 font-mono"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  E-mail do Paciente
                </label>
                <input
                  type="email"
                  value={reminderRecipientEmail}
                  onChange={(e) => setReminderRecipientEmail(e.target.value)}
                  placeholder="paciente@exemplo.com"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500 font-mono"
                />
              </div>
            )}

            {/* Preview da Mensagem */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Prévia da Mensagem (Acolhimento Ético & Knocking)
                </label>
                <button
                  type="button"
                  onClick={() => handleGeneratePreview()}
                  disabled={reminderLoading}
                  className="text-[11px] text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
                >
                  Recarregar Prévia
                </button>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 font-mono whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto select-all">
                {reminderPreview?.message || 'Gerando prévia da notificação...'}
              </div>
            </div>

            {/* Histórico de Envios */}
            {reminderHistory.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Envios Anteriores ({reminderHistory.length})
                </span>
                <div className="space-y-1 max-h-24 overflow-y-auto text-[11px]">
                  {reminderHistory.map((rem) => (
                    <div
                      key={rem.id}
                      className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {rem.channel}
                        </span>
                        <span className="text-slate-400">•</span>
                        <span className="text-slate-500">
                          {rem.sentAt ? new Date(rem.sentAt).toLocaleString('pt-BR') : 'Enviado'}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                        {rem.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Botões de Ação */}
            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowReminderModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 text-xs font-medium transition-colors cursor-pointer"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={handleSendReminder}
                disabled={reminderLoading}
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-md shadow-teal-500/20 cursor-pointer"
              >
                {reminderLoading ? (
                  'Disparando...'
                ) : reminderChannel === ReminderChannel.WHATSAPP ? (
                  <>
                    <MessageSquare className="w-4 h-4" />
                    Enviar e Abrir WhatsApp
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Enviar E-mail com Auditoria WORM
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Teleconsulta Nativa WebRTC & Sala de Espera (RFC-001 §3.2, §3.3) */}
      {selectedTeleconsultationApp && (
        <TeleconsultationRoom
          appointmentId={selectedTeleconsultationApp.id}
          role="THERAPIST"
          onClose={() => setSelectedTeleconsultationApp(null)}
          onProceedToSoap={() => {
            const currentApp = selectedTeleconsultationApp;
            setSelectedTeleconsultationApp(null);
            setSelectedAiSoapApp(currentApp);
          }}
        />
      )}

      {/* Modal de Transcrição Assistida por IA, Diarização & Síntese SOAP (RFC-001 §3.3) */}
      {selectedAiSoapApp && (
        <AiTranscriptionSoapModal
          isOpen={!!selectedAiSoapApp}
          appointmentId={selectedAiSoapApp.id}
          patientId={selectedAiSoapApp.patientId}
          patientName="Mariana Silva de Oliveira"
          onClose={() => setSelectedAiSoapApp(null)}
          onEhrRecordSaved={() => {
            setSelectedAiSoapApp(null);
            setSuccessMsg('Prontuário Oficial do Paciente (EHR) selado com sucesso na trilha WORM com respaldo da IA!');
          }}
        />
      )}
    </div>
  );
}
