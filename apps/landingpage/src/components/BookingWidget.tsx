import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Clock, 
  Video, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  Copy, 
  ExternalLink, 
  User, 
  Mail, 
  Phone, 
  Lock,
  Sparkles,
  Info
} from 'lucide-react';
import type { AvailableSlot, PublicBookingResponse } from '@terapiainfoco/shared';
import { landingApi } from '../services/api';

export const BookingWidget: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Formulário do paciente
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [cpf, setCpf] = useState('');
  const [tcleConsent, setTcleConsent] = useState(false);

  // Estados de submissão
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingConfirmation, setBookingConfirmation] = useState<PublicBookingResponse | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Gera lista dos próximos 5 dias úteis para agendamento
  const [datesList, setDatesList] = useState<Array<{ label: string; dateStr: string }>>([]);

  useEffect(() => {
    const list: Array<{ label: string; dateStr: string }> = [];
    const today = new Date();
    
    for (let i = 0; i < 6; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      // Pula domingo (0)
      if (d.getDay() === 0) continue;

      const dateStr = d.toISOString().split('T')[0];
      let label = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
      if (i === 0) label = `Hoje (${d.getDate()}/${d.getMonth() + 1})`;
      if (i === 1) label = `Amanhã (${d.getDate()}/${d.getMonth() + 1})`;

      list.push({ label, dateStr });
      if (list.length >= 4) break;
    }

    setDatesList(list);
    if (list.length > 0) {
      setSelectedDate(list[0].dateStr);
    }
  }, []);

  // Busca horários ao mudar a data selecionada
  useEffect(() => {
    if (!selectedDate) return;

    let isMounted = true;
    setLoadingSlots(true);
    setSelectedSlot(null);

    landingApi.getAvailableSlots(selectedDate)
      .then(res => {
        if (isMounted) {
          setAvailableSlots(res.slots);
          // Pré-seleciona o primeiro horário disponível
          const firstOpen = res.slots.find(s => s.available);
          if (firstOpen) setSelectedSlot(firstOpen);
        }
      })
      .catch(() => {
        if (isMounted) {
          setAvailableSlots([]);
        }
      })
      .finally(() => {
        if (isMounted) setLoadingSlots(false);
      });

    return () => { isMounted = false; };
  }, [selectedDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot) {
      setError('Por favor, selecione um horário para a consulta.');
      return;
    }
    if (!tcleConsent) {
      setError('O aceite do Termo de Consentimento Livre e Esclarecido (TCLE) é obrigatório.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const booking = await landingApi.bookPublicAppointment({
        patientName: name,
        patientEmail: email,
        patientPhone: phone,
        patientCpf: cpf.trim() || undefined,
        scheduledStart: selectedSlot.start,
        scheduledEnd: selectedSlot.end,
        consentTeleconsultationSigned: tcleConsent
      });

      setBookingConfirmation(booking);
    } catch (err: any) {
      setError(err.message || 'Falha ao realizar agendamento.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyLink = () => {
    if (!bookingConfirmation?.meetUrl) return;
    navigator.clipboard.writeText(bookingConfirmation.meetUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  return (
    <section id="agendamento-online" className="py-20 bg-slate-50 relative overflow-hidden border-t border-slate-200">
      {/* Detalhe de fundo */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-teal-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Cabeçalho da Seção */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 border border-teal-200/80 text-teal-800 text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5 text-teal-600" />
            Experiência do Paciente • RFC-001 §3.1
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Agendamento Online de Teleconsulta
          </h2>
          <p className="mt-3 text-base text-slate-600 leading-relaxed">
            Consulte horários em tempo real, confirme sua sessão em menos de 2 minutos e receba o link direto do Google Meet com criptografia de ponta a ponta.
          </p>
        </div>

        {/* Modal de Confirmação Concluída */}
        {bookingConfirmation ? (
          <div className="max-w-2xl mx-auto bg-white rounded-3xl p-8 shadow-xl border border-emerald-500/30 space-y-6 animate-fade-in">
            <div className="flex items-center gap-3 text-emerald-700">
              <div className="p-3 rounded-2xl bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">
                  Teleconsulta Agendada com Sucesso!
                </h3>
                <p className="text-xs text-slate-500">
                  Um e-mail de confirmação foi encaminhado para <strong>{email}</strong>
                </p>
              </div>
            </div>

            {/* Dados da Sala Google Meet */}
            <div className="p-5 rounded-2xl bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-teal-800 flex items-center gap-1.5">
                  <Video className="w-4 h-4 text-teal-600" />
                  Sala Virtual Google Meet
                </span>
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                  Teleconsulta Criptografada
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-xl border border-teal-200/80">
                <span className="font-mono text-sm text-slate-800 font-medium truncate">
                  {bookingConfirmation.meetUrl}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={handleCopyLink}
                    className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                    title="Copiar link"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copiedLink ? 'Copiado!' : 'Copiar'}
                  </button>
                  <a
                    href={bookingConfirmation.meetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center gap-1 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Abrir Sala
                  </a>
                </div>
              </div>
            </div>

            {/* Resumo do Atendimento */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-slate-500 font-medium">Profissional Responsável:</span>
                <p className="font-semibold text-slate-900">{bookingConfirmation.therapistName}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-slate-500 font-medium">Paciente Atendido:</span>
                <p className="font-semibold text-slate-900">{bookingConfirmation.patientName}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-slate-500 font-medium">Horário da Sessão:</span>
                <p className="font-semibold text-slate-900">
                  {new Date(bookingConfirmation.scheduledStart).toLocaleDateString('pt-BR')} às{' '}
                  {new Date(bookingConfirmation.scheduledStart).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-slate-500 font-medium">Buffer Entre Sessões:</span>
                <p className="font-semibold text-teal-700">10 minutos de intervalo garantido</p>
              </div>
            </div>

            {/* Orientações */}
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 space-y-2">
              <div className="font-semibold flex items-center gap-1.5 text-amber-800">
                <Info className="w-4 h-4 text-amber-600 shrink-0" />
                Orientações para o seu Teleatendimento:
              </div>
              <ul className="list-disc list-inside space-y-1 text-amber-950 pl-1 leading-relaxed">
                {bookingConfirmation.instructions.map((inst, i) => (
                  <li key={i}>{inst}</li>
                ))}
              </ul>
            </div>

            <button
              onClick={() => {
                setBookingConfirmation(null);
                setName('');
                setEmail('');
                setPhone('');
                setCpf('');
                setTcleConsent(false);
              }}
              className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              Realizar Novo Agendamento
            </button>
          </div>
        ) : (
          /* Formulário Principal de Agendamento */
          <div className="max-w-4xl mx-auto bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden grid grid-cols-1 md:grid-cols-12">
            {/* Coluna Esquerda: Informações da Profissional & Seleção de Horário */}
            <div className="md:col-span-5 bg-gradient-to-b from-slate-900 to-slate-950 p-6 sm:p-8 text-white flex flex-col justify-between space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                    Atendimento Online Ativo
                  </span>
                </div>

                <h3 className="text-xl font-bold text-white mb-1">
                  Dra. Vanessa Andrade
                </h3>
                <p className="text-xs text-teal-400 font-medium mb-3">
                  Psicóloga Clínica • CRP 06/142980
                </p>
                <p className="text-xs text-slate-300 leading-relaxed mb-6">
                  Especialista em Terapia Cognitivo-Comportamental (TCC) e manejo de ansiedade. Atendimento online seguro conforme Resolução CFP nº 011/2018.
                </p>

                {/* Seleção de Data */}
                <div className="space-y-2 mb-5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-teal-400" />
                    Selecione o Dia:
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {datesList.map((item, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedDate(item.dateStr)}
                        className={`p-2.5 rounded-xl text-xs font-semibold transition-all text-center cursor-pointer ${
                          selectedDate === item.dateStr
                            ? 'bg-teal-600 text-white shadow-md shadow-teal-600/30'
                            : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700/60'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Grade de Horários */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-teal-400" />
                      Horários Disponíveis (50 min):
                    </label>
                    <span className="text-[10px] text-teal-400 font-mono">
                      Buffer 10m
                    </span>
                  </div>

                  {loadingSlots ? (
                    <div className="py-6 text-center text-xs text-slate-400 animate-pulse">
                      Carregando horários...
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                      {availableSlots.map((slot, index) => (
                        <button
                          key={index}
                          type="button"
                          disabled={!slot.available}
                          onClick={() => setSelectedSlot(slot)}
                          className={`p-2 rounded-xl text-xs font-medium text-center transition-all cursor-pointer ${
                            !slot.available
                              ? 'bg-slate-800/40 text-slate-600 border border-slate-800 cursor-not-allowed line-through'
                              : selectedSlot?.start === slot.start
                              ? 'bg-emerald-500 text-white font-bold shadow-md shadow-emerald-500/30'
                              : 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700/80'
                          }`}
                        >
                          {slot.formattedTime.split(' - ')[0]}
                          {slot.available ? '' : ' (Ocupado)'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Selo de Criptografia */}
              <div className="pt-4 border-t border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                <span>Dados protegidos por Field-Level Encryption & Blind Indexing.</span>
              </div>
            </div>

            {/* Coluna Direita: Formulário de Confirmação & TCLE */}
            <div className="md:col-span-7 p-6 sm:p-8 flex flex-col justify-between space-y-6">
              <div>
                <h4 className="text-lg font-bold text-slate-900 mb-1">
                  Seus Dados para o Atendimento
                </h4>
                <p className="text-xs text-slate-500 mb-6">
                  Preencha os campos para emissão do link Google Meet e registro de consentimento.
                </p>

                {error && (
                  <div className="p-3.5 mb-5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nome Completo *
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Ex: Mariana Silva de Oliveira"
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-teal-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        E-mail *
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="seu.email@exemplo.com"
                          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-teal-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Celular / WhatsApp *
                      </label>
                      <div className="relative">
                        <Phone className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                        <input
                          type="tel"
                          required
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="(11) 98765-4321"
                          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-teal-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      CPF (Opcional — para declaração ou recibo)
                    </label>
                    <input
                      type="text"
                      value={cpf}
                      onChange={(e) => setCpf(e.target.value)}
                      placeholder="000.000.000-00"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-teal-500"
                    />
                  </div>

                  {/* Termo de Consentimento Livre e Esclarecido (TCLE) */}
                  <div className="p-4 rounded-2xl bg-teal-500/5 border border-teal-500/20 space-y-2">
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        id="tcleCheck"
                        required
                        checked={tcleConsent}
                        onChange={(e) => setTcleConsent(e.target.checked)}
                        className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                      />
                      <label htmlFor="tcleCheck" className="text-xs text-slate-700 leading-relaxed cursor-pointer">
                        <strong>Termo de Consentimento Livre e Esclarecido (TCLE):</strong> Concordo em realizar o teleatendimento psicológico por videoconferência segura, ciente de que as sessões são protegidas por sigilo profissional (Código de Ética do Psicólogo) e pela LGPD.
                      </label>
                    </div>
                  </div>

                  {/* Resumo do Horário Selecionado */}
                  {selectedSlot && (
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                      <span className="text-slate-600">Sessão Selecionada:</span>
                      <strong className="text-slate-900 font-mono">
                        {selectedSlot.formattedTime} ({new Date(selectedSlot.start).toLocaleDateString('pt-BR')})
                      </strong>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting || !selectedSlot}
                    className="w-full py-3.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold tracking-wide uppercase shadow-lg shadow-teal-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    {submitting ? 'Agendando Consulta...' : 'Confirmar & Receber Link do Google Meet'}
                  </button>
                </form>
              </div>

              <div className="text-[11px] text-slate-400 text-center">
                Atendimento prestado em conformidade com as Resoluções CFP nº 011/2018 e 004/2020.
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
