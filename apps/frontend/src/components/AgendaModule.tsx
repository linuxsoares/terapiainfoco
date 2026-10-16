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
  Shield,
  PhoneOff,
  ExternalLink,
  Link2,
  Repeat,
  Bell,
  Send,
  MessageSquare
} from 'lucide-react';
import { 
  AppointmentStatus, 
  MeetAccessType, 
  MeetProvider, 
  RecurrenceFrequency,
  ReminderChannel,
  ReminderTiming,
  type DecryptedAppointment,
  type GoogleMeetStatusResponse,
  type GoogleMeetTestResponse,
  type StoredAppointmentReminder
} from '@terapiainfoco/shared';
import { api } from '../services/api';

export function AgendaModule() {
  const [appointments, setAppointments] = useState<DecryptedAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form de novo agendamento
  const [showModal, setShowModal] = useState(false);
  const [patientId, setPatientId] = useState('pat-001');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState('14:00');
  const [bufferMin, setBufferMin] = useState(10);
  const [customMeetUrl, setCustomMeetUrl] = useState('');
  const [accessType, setAccessType] = useState<MeetAccessType>(MeetAccessType.TRUSTED);
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

  // Modal de diagnóstico / teste Google Meet REST API v2
  const [showMeetModal, setShowMeetModal] = useState(false);
  const [meetStatus, setMeetStatus] = useState<GoogleMeetStatusResponse | null>(null);
  const [meetTestResult, setMeetTestResult] = useState<GoogleMeetTestResponse | null>(null);
  const [testingMeet, setTestingMeet] = useState(false);
  const [connectingOAuth, setConnectingOAuth] = useState(false);

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

    const handleAuthMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_MEET_AUTH_SUCCESS') {
        setSuccessMsg(`Google Meet conectado com sucesso${event.data.email ? ` (${event.data.email})` : ''}!`);
        api.getGoogleMeetStatus().then(setMeetStatus).catch(() => {});
        setTimeout(() => setSuccessMsg(null), 5000);
      }
    };
    window.addEventListener('message', handleAuthMessage);
    return () => window.removeEventListener('message', handleAuthMessage);
  }, []);

  const handleConnectGoogle = async () => {
    try {
      setConnectingOAuth(true);
      const res = await api.getGoogleOAuthUrl();
      if (res?.url) {
        const width = 600;
        const height = 700;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;
        window.open(
          res.url,
          'google-oauth',
          `toolbar=no, location=no, directories=no, status=no, menubar=no, scrollbars=yes, resizable=yes, copyhistory=no, width=${width}, height=${height}, top=${top}, left=${left}`
        );
      }
    } catch (err: any) {
      setError(err.message || 'Falha ao iniciar autenticação Google');
    } finally {
      setConnectingOAuth(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    try {
      setConnectingOAuth(true);
      await api.disconnectGoogleMeet();
      const status = await api.getGoogleMeetStatus();
      setMeetStatus(status);
      setSuccessMsg('Google Meet desconectado desta sessão.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Falha ao desconectar Google Meet');
    } finally {
      setConnectingOAuth(false);
    }
  };

  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
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
          meetUrl: customMeetUrl.trim() || undefined,
          accessType,
          recurrence: {
            frequency: recurrenceFrequency,
            count: Number(recurrenceSessions),
            totalSessions: Number(recurrenceSessions)
          }
        });
        const totalCreated = res.createdAppointments?.length || res.requestedCount || res.count || recurrenceSessions;
        setSuccessMsg(`Série clínica de ${totalCreated} consultas criada com sucesso (RFC §3.1)!`);
      } else {
        await api.createAppointment({
          patientId,
          scheduledStart: start.toISOString(),
          scheduledEnd: end.toISOString(),
          bufferMinutes: Number(bufferMin),
          meetUrl: customMeetUrl.trim() || undefined,
          accessType
        });
        setSuccessMsg('Consulta agendada com sucesso! Link seguro do Google Meet gerado.');
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

  const handleEndMeet = async (appointmentId: string) => {
    try {
      setError(null);
      const res = await api.endMeetConference(appointmentId);
      setSuccessMsg(res.message);
      await fetchAppointments();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Falha ao encerrar conferência no Google Meet');
    }
  };

  const handleOpenMeetDiagnostics = async () => {
    setShowMeetModal(true);
    setMeetTestResult(null);
    try {
      setTestingMeet(true);
      const status = await api.getGoogleMeetStatus();
      setMeetStatus(status);
    } catch (err: any) {
      setError(err.message || 'Falha ao obter status do Google Meet');
    } finally {
      setTestingMeet(false);
    }
  };

  const handleTestCreateMeetSpace = async () => {
    try {
      setTestingMeet(true);
      const res = await api.testGoogleMeet(MeetAccessType.TRUSTED);
      setMeetTestResult(res);
      setSuccessMsg(res.message || 'Teste concluído com sucesso!');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Falha ao testar Google Meet');
    } finally {
      setTestingMeet(false);
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

  const getProviderBadge = (provider?: MeetProvider) => {
    switch (provider) {
      case MeetProvider.GOOGLE_MEET_V2:
        return {
          label: 'Google Meet v2 API',
          classes: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30'
        };
      case MeetProvider.GOOGLE_CALENDAR:
        return {
          label: 'Google Calendar API',
          classes: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30'
        };
      case MeetProvider.CUSTOM:
        return {
          label: 'Sala Fixa Informada',
          classes: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30'
        };
      case MeetProvider.SIMULATED:
      default:
        return {
          label: 'Contingência Simutada',
          classes: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Calendar className="w-6 h-6 text-teal-600 dark:text-teal-400" />
            Módulo 1: Agenda Clínica & Google Meet REST API v2
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Gestão de grade horária, buffers automáticos e links cifrados de videochamada (RFC §3.1, §3.2)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            onClick={handleOpenMeetDiagnostics}
            className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 shadow-sm dark:shadow-none transition-colors cursor-pointer"
            title="Diagnóstico da API do Google Meet"
          >
            <Video className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            <span>API Google Meet</span>
          </button>
          <button
            onClick={fetchAppointments}
            className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white shadow-sm dark:shadow-none transition-colors cursor-pointer"
            title="Atualizar grade"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowModal(true)}
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
            <span className="text-xs text-teal-600 dark:text-teal-400 font-semibold">Obrigatório (RFC §3.1)</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
            <span>Google Meet REST API v2</span>
            <Video className="w-4 h-4 text-sky-600 dark:text-sky-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">Knocking Ativo</span>
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
              onClick={() => setShowModal(true)}
              className="text-xs text-teal-600 dark:text-teal-400 hover:underline font-semibold"
            >
              + Criar primeiro agendamento
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {appointments.map((app) => {
              const provBadge = getProviderBadge(app.meetProvider);
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
                          Paciente ID: {app.patientId.slice(0, 8)}...
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-medium border ${getStatusBadge(app.status)}`}>
                          {app.status}
                        </span>
                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-mono border ${provBadge.classes}`}>
                          {provBadge.label}
                        </span>
                        {app.meetAccessType && (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 flex items-center gap-1">
                            <Shield className="w-3 h-3 text-teal-500" />
                            {app.meetAccessType === MeetAccessType.TRUSTED ? 'Sala de Espera (Knocking)' : app.meetAccessType}
                          </span>
                        )}
                        {app.recurrenceSeriesId && (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30 flex items-center gap-1">
                            <Repeat className="w-3 h-3 text-purple-500" />
                            Série #{app.recurrenceSequence || 1} ({app.recurrenceFrequency || 'WEEKLY'})
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <span>Data: {new Date(app.scheduledStart).toLocaleDateString('pt-BR')}</span>
                        <span>•</span>
                        <span className="font-mono text-slate-700 dark:text-slate-300">Sala: {app.meetAccessCode || 'Padrão'}</span>
                        {app.meetSpaceName && (
                          <>
                            <span>•</span>
                            <span className="font-mono text-slate-500 text-[11px]">{app.meetSpaceName}</span>
                          </>
                        )}
                      </p>

                      <div className="pt-1 max-w-full overflow-hidden">
                        <a
                          href={app.meetUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-sky-700 dark:text-sky-400 hover:underline font-mono bg-sky-50 dark:bg-sky-500/10 px-2.5 py-1 rounded-lg border border-sky-200 dark:border-sky-500/20 transition-colors max-w-full truncate"
                        >
                          <Video className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{app.meetUrl}</span>
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Ações de Estado */}
                  <div className="flex flex-wrap items-center gap-2 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100 dark:border-slate-800">
                    <button
                      onClick={() => handleOpenReminderModal(app)}
                      className="px-3 py-1.5 rounded-lg bg-teal-50 dark:bg-teal-500/10 hover:bg-teal-100 dark:hover:bg-teal-500/20 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Enviar lembrete via WhatsApp ou E-mail com link da sala (CFP 011/2018)"
                    >
                      <Bell className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                      Lembrete
                    </button>

                    {app.status === AppointmentStatus.CONFIRMADA && (
                      <button
                        onClick={() => handleStatusChange(app.id, AppointmentStatus.EM_ANDAMENTO)}
                        className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5" /> Iniciar
                      </button>
                    )}

                    {app.status === AppointmentStatus.EM_ANDAMENTO && (
                      <>
                        <button
                          onClick={() => handleEndMeet(app.id)}
                          className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="Encerra a chamada ativa no Google Meet REST API v2 (:endActiveConference)"
                        >
                          <PhoneOff className="w-3.5 h-3.5" /> Encerrar Meet
                        </button>
                        <button
                          onClick={() => handleStatusChange(app.id, AppointmentStatus.CONCLUIDA)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Concluir
                        </button>
                      </>
                    )}

                    {app.recurrenceSeriesId && 
                     app.status !== AppointmentStatus.CONCLUIDA && 
                     app.status !== AppointmentStatus.CANCELADA_PELO_PACIENTE && (
                      <button
                        onClick={() => handleCancelSeries(app.recurrenceSeriesId!)}
                        className="px-2.5 py-1.5 rounded-lg bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 dark:hover:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                        title="Cancela todas as sessões futuras pertencentes a esta série clínica"
                      >
                        <Repeat className="w-3 h-3" /> Cancelar Série
                      </button>
                    )}

                    {app.status !== AppointmentStatus.CONCLUIDA && 
                     app.status !== AppointmentStatus.CANCELADA_PELO_PACIENTE && (
                      <button
                        onClick={() => handleStatusChange(app.id, AppointmentStatus.CANCELADA_PELO_PACIENTE)}
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
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">ID do Paciente</label>
                <input
                  type="text"
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                  required
                />
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
                  A API bloqueará agendamentos conflitantes que invadam esta janela (RFC §3.1).
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Política de Admissão Google Meet (Knocking)
                </label>
                <select
                  value={accessType}
                  onChange={(e) => setAccessType(e.target.value as MeetAccessType)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                >
                  <option value={MeetAccessType.TRUSTED}>TRUSTED (Recomendado CFP — Com Sala de Espera / Knocking)</option>
                  <option value={MeetAccessType.OPEN}>OPEN (Acesso Aberto — Sem knocking)</option>
                  <option value={MeetAccessType.RESTRICTED}>RESTRICTED (Apenas Convidados)</option>
                </select>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  No modo <strong>TRUSTED</strong>, pacientes aguardam na sala de espera até a admissão pelo terapeuta, prevenindo intrusão acidental.
                </p>
              </div>

              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Link Opcional Personalizado (Sala Fixa)
                  </label>
                  <a
                    href="https://meet.google.com/new"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-teal-600 dark:text-teal-400 hover:underline font-semibold flex items-center gap-1"
                    title="Abre o Google Meet para criar uma reunião avulsa"
                  >
                    <span>+ Abrir Google Meet</span>
                  </a>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    placeholder="Deixe em branco para emissão automática via API"
                    value={customMeetUrl}
                    onChange={(e) => setCustomMeetUrl(e.target.value)}
                    className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-teal-500 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setCustomMeetUrl('https://meet.google.com/new')}
                    className="px-3 py-2 rounded-xl bg-sky-50 dark:bg-sky-500/10 hover:bg-sky-100 dark:hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-500/30 text-xs font-medium transition-colors shrink-0 cursor-pointer"
                    title="Preenche com link de sala instantânea"
                  >
                    ⚡ Sala Nova
                  </button>
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                  💡 Deixe em branco para emissão automática através da <strong>Google Meet REST API v2</strong> (`spaces.create`), com salas isoladas por sessão.
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
                    Agendar como Série Recorrente (RFC §3.1)
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
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting 
                    ? (isRecurrent ? 'Gerando Série...' : 'Gerando Sala...') 
                    : (isRecurrent ? `Criar Série (${recurrenceSessions} Sessões)` : 'Confirmar & Gerar Meet')}
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
                <span className="text-slate-500">Link Meet:</span>
                <span className="font-mono text-sky-600 dark:text-sky-400 truncate max-w-[240px]">
                  {selectedAppointmentForReminder.meetUrl}
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

      {/* Modal de Diagnóstico da Google Meet REST API v2 */}
      {showMeetModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-5 sm:p-6 space-y-5 shadow-2xl transition-colors duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Video className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                Diagnóstico Google Meet REST API v2
              </h3>
              <button
                onClick={() => setShowMeetModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-2xl bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sky-900 dark:text-sky-200">Status da Integração:</span>
                  <span className={`px-2.5 py-0.5 rounded-full font-mono font-medium ${
                    meetStatus?.configured 
                      ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30' 
                      : 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                  }`}>
                    {meetStatus?.configured ? 'Workspace Conectado' : 'Contingência Simulada Ativa'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                  <span>Provedor Ativo:</span>
                  <span className="font-mono text-slate-900 dark:text-white font-medium">{meetStatus?.activeProvider || 'simulated'}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                  <span>Política Padrão (Knocking):</span>
                  <span className="font-mono text-slate-900 dark:text-white font-medium">{meetStatus?.defaultAccessType || 'TRUSTED'}</span>
                </div>

                {/* Seção OAuth 2.0 Account */}
                <div className="pt-2.5 border-t border-sky-200/60 dark:border-sky-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div>
                    <span className="font-medium text-slate-700 dark:text-slate-300 block">Conta Google Vinculada:</span>
                    {meetStatus?.oauth?.connectedEmail ? (
                      <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">{meetStatus.oauth.connectedEmail}</span>
                    ) : meetStatus?.oauth?.hasRefreshToken ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">Refresh Token ativo no ambiente</span>
                    ) : meetStatus?.oauth?.hasClientId ? (
                      <span className="text-amber-600 dark:text-amber-400">Credenciais detectadas no servidor — Clique em Conectar</span>
                    ) : (
                      <span className="text-slate-500 italic">GOOGLE_CLIENT_ID não detectado nas variáveis de ambiente</span>
                    )}
                  </div>
                  <div>
                    {meetStatus?.configured ? (
                      <button
                        type="button"
                        onClick={handleDisconnectGoogle}
                        disabled={connectingOAuth}
                        className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 font-medium text-xs transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {connectingOAuth ? 'Desconectando...' : 'Desconectar'}
                      </button>
                    ) : meetStatus?.oauth?.hasClientId ? (
                      <button
                        type="button"
                        onClick={handleConnectGoogle}
                        disabled={connectingOAuth}
                        className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs transition-colors shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        {connectingOAuth ? 'Abrindo Google...' : 'Conectar Google Meet'}
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Dica de Redirect URI para Google Cloud Console */}
                {meetStatus?.oauth?.hasClientId && !meetStatus?.configured && (
                  <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-slate-700 dark:text-slate-300 space-y-1.5">
                    <div className="flex items-center justify-between font-semibold text-[11px] text-amber-900 dark:text-amber-200">
                      <span>URI de Redirecionamento (Google Cloud Console):</span>
                      <button
                        type="button"
                        onClick={() => {
                          const uriToCopy = meetStatus?.oauth?.redirectUri || (typeof window !== 'undefined' ? `${window.location.origin.replace(':5174', ':3000')}/api/auth/google/callback` : '');
                          if (uriToCopy) {
                            navigator.clipboard.writeText(uriToCopy);
                            setSuccessMsg('URI de redirecionamento copiada com sucesso!');
                            setTimeout(() => setSuccessMsg(null), 3000);
                          }
                        }}
                        className="text-sky-600 dark:text-sky-400 hover:underline text-[10px] font-semibold cursor-pointer"
                      >
                        Copiar URI
                      </button>
                    </div>
                    <p className="font-mono text-[11px] text-slate-900 dark:text-white bg-white dark:bg-slate-900 p-2 rounded-xl border border-amber-300 dark:border-amber-500/30 break-all select-all font-medium">
                      {meetStatus?.oauth?.redirectUri || (typeof window !== 'undefined' ? `${window.location.origin.replace(':5174', ':3000')}/api/auth/google/callback` : '')}
                    </p>
                    <p className="text-[10px] text-slate-600 dark:text-slate-400">
                      ⚠️ Se aparecer o erro <code>redirect_uri_mismatch</code> no Google, certifique-se de adicionar a URL acima exatamente em <strong>URIs de redirecionamento autorizados</strong> nas Credenciais do seu Google Cloud.
                    </p>
                  </div>
                )}
              </div>

              <div>
                <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Escopos OAuth Necessários (RFC §3.2):</h4>
                <ul className="space-y-1 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                  {meetStatus?.scopes.map((s, idx) => (
                    <li key={idx} className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 truncate">
                      {s}
                    </li>
                  ))}
                </ul>
              </div>

              {meetTestResult && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between font-semibold text-slate-900 dark:text-white">
                    <span>Resultado do Teste:</span>
                    <span className="text-teal-600 dark:text-teal-400">{meetTestResult.latencyMs} ms</span>
                  </div>
                  <div className="space-y-1 text-slate-600 dark:text-slate-300">
                    <p><strong>Provedor:</strong> <span className="font-mono">{meetTestResult.provider}</span></p>
                    <p><strong>Código da Sala:</strong> <span className="font-mono">{meetTestResult.meetingCode}</span></p>
                    <p><strong>Link do Meet:</strong> <a href={meetTestResult.meetingUri} target="_blank" rel="noreferrer" className="text-sky-600 dark:text-sky-400 hover:underline font-mono">{meetTestResult.meetingUri}</a></p>
                    <p><strong>Admissão:</strong> <span className="font-mono">{meetTestResult.accessType}</span></p>
                    {meetTestResult.spaceName && (
                      <p><strong>Recurso Google Meet:</strong> <span className="font-mono">{meetTestResult.spaceName}</span></p>
                    )}
                  </div>
                </div>
              )}

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Doc Oficial: <a href="https://developers.google.com/workspace/meet/api/guides/overview?hl=pt-br" target="_blank" rel="noreferrer" className="text-teal-600 dark:text-teal-400 hover:underline inline-flex items-center gap-0.5">Google Meet API <ExternalLink className="w-3 h-3" /></a>
                </p>
                <button
                  type="button"
                  onClick={handleTestCreateMeetSpace}
                  disabled={testingMeet}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <Video className="w-4 h-4" />
                  {testingMeet ? 'Criando Espaço...' : 'Testar Criação de Espaço'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
