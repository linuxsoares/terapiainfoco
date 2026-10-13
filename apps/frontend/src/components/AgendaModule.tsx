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
  Link2
} from 'lucide-react';
import { 
  AppointmentStatus, 
  MeetAccessType, 
  MeetProvider, 
  type DecryptedAppointment,
  type GoogleMeetStatusResponse,
  type GoogleMeetTestResponse 
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

      await api.createAppointment({
        patientId,
        scheduledStart: start.toISOString(),
        scheduledEnd: end.toISOString(),
        bufferMinutes: Number(bufferMin),
        meetUrl: customMeetUrl.trim() || undefined,
        accessType
      });

      setSuccessMsg('Consulta agendada com sucesso! Link seguro do Google Meet gerado.');
      setShowModal(false);
      await fetchAppointments();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
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
                  {isSubmitting ? 'Gerando Sala...' : 'Confirmar & Gerar Meet'}
                </button>
              </div>
            </form>
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
