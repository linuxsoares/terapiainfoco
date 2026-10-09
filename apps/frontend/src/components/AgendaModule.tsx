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
  Play
} from 'lucide-react';
import { AppointmentStatus, type DecryptedAppointment } from '@terapiainfoco/shared';
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
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        bufferMinutes: Number(bufferMin)
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

  const getStatusBadge = (status: AppointmentStatus) => {
    switch (status) {
      case AppointmentStatus.CONFIRMADA:
        return 'bg-teal-500/15 text-teal-300 border-teal-500/30';
      case AppointmentStatus.EM_ANDAMENTO:
        return 'bg-amber-500/15 text-amber-300 border-amber-500/30 animate-pulse';
      case AppointmentStatus.CONCLUIDA:
        return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
      case AppointmentStatus.CANCELADA_PELO_PACIENTE:
      case AppointmentStatus.CANCELADA_PELO_TERAPEUTA:
        return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Calendar className="w-6 h-6 text-teal-400" />
            Módulo 1: Agenda Clínica & Google Meet
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Gestão de grade horária, buffers automáticos e links cifrados de videochamada (RFC §3.1, §3.2)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchAppointments}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
            title="Atualizar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold flex items-center gap-2 shadow-lg shadow-teal-500/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            Novo Agendamento
          </button>
        </div>
      </div>

      {/* Alertas */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Buffer Entre Sessões</span>
            <Clock className="w-4 h-4 text-teal-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">10 min</span>
            <span className="text-xs text-teal-400 font-medium">Obrigatório (RFC §3.1)</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Teleconsulta Google Meet</span>
            <Video className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">Knocking Ativo</span>
            <span className="text-xs text-sky-400 font-medium">Sala de Espera (ADR-001)</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Consultas Registradas</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{appointments.length}</span>
            <span className="text-xs text-emerald-400 font-medium">Na Base de Dados</span>
          </div>
        </div>
      </div>

      {/* Lista de Consultas */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
          Grade de Atendimento
        </h2>

        {loading ? (
          <div className="p-12 text-center text-slate-500">Carregando consultas...</div>
        ) : appointments.length === 0 ? (
          <div className="p-12 rounded-2xl bg-slate-900/30 border border-slate-800/80 text-center space-y-3">
            <Calendar className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-slate-400 text-sm">Nenhuma consulta agendada no momento.</p>
            <button
              onClick={() => setShowModal(true)}
              className="text-xs text-teal-400 hover:text-teal-300 font-medium"
            >
              + Criar primeiro agendamento
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {appointments.map((app) => (
              <div
                key={app.id}
                className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-slate-700 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex flex-col items-center justify-center text-teal-300 shrink-0">
                    <span className="text-sm font-bold">
                      {new Date(app.scheduledStart).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-[10px] text-teal-400/70">50 min</span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white text-base">
                        Paciente ID: {app.patientId.slice(0, 8)}...
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-medium border ${getStatusBadge(app.status)}`}>
                        {app.status}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 flex items-center gap-2">
                      <span>Data: {new Date(app.scheduledStart).toLocaleDateString('pt-BR')}</span>
                      <span>•</span>
                      <span className="font-mono text-slate-300">Sala: {app.meetAccessCode || 'Padrão'}</span>
                    </p>

                    <div className="pt-1">
                      <a
                        href={app.meetUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 font-mono bg-sky-500/10 px-2.5 py-1 rounded-lg border border-sky-500/20 hover:border-sky-500/40 transition-colors"
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span>{app.meetUrl}</span>
                      </a>
                    </div>
                  </div>
                </div>

                {/* Ações de Estado */}
                <div className="flex flex-wrap items-center gap-2 border-t md:border-t-0 pt-3 md:pt-0 border-slate-800">
                  {app.status === AppointmentStatus.CONFIRMADA && (
                    <button
                      onClick={() => handleStatusChange(app.id, AppointmentStatus.EM_ANDAMENTO)}
                      className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
                    >
                      <Play className="w-3.5 h-3.5" /> Iniciar
                    </button>
                  )}

                  {app.status === AppointmentStatus.EM_ANDAMENTO && (
                    <button
                      onClick={() => handleStatusChange(app.id, AppointmentStatus.CONCLUIDA)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Concluir
                    </button>
                  )}

                  {app.status !== AppointmentStatus.CONCLUIDA && 
                   app.status !== AppointmentStatus.CANCELADA_PELO_PACIENTE && (
                    <button
                      onClick={() => handleStatusChange(app.id, AppointmentStatus.CANCELADA_PELO_PACIENTE)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 hover:text-rose-300 text-slate-400 text-xs font-medium flex items-center gap-1.5 transition-colors"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Cancelar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de Agendamento */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-teal-400" />
                Agendar Nova Consulta
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAppointment} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">ID do Paciente</label>
                <input
                  type="text"
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-teal-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Data</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Horário de Início</label>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Buffer Obrigatório de Respiro (minutos)
                </label>
                <input
                  type="number"
                  min="5"
                  max="30"
                  value={bufferMin}
                  onChange={(e) => setBufferMin(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  A API bloqueará agendamentos conflitantes que invadam esta janela (RFC §3.1).
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Gerando Sala...' : 'Confirmar & Gerar Meet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
