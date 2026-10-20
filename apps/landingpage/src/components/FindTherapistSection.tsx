import { Search, BadgeCheck, CalendarCheck, Video, ArrowRight } from 'lucide-react';
import { PANEL_LINKS } from '../config';

const STEPS = [
  {
    icon: Search,
    title: 'Busque',
    text: 'Filtre por abordagem, especialidade e valor da sessão.'
  },
  {
    icon: BadgeCheck,
    title: 'Escolha',
    text: 'Todos os perfis publicados têm o registro no CRP verificado.'
  },
  {
    icon: CalendarCheck,
    title: 'Agende',
    text: 'Com sua conta de paciente, escolha o horário e aceite o termo de consentimento.'
  },
  {
    icon: Video,
    title: 'Atenda',
    text: 'A sessão acontece na sala de teleconsulta da plataforma, sem gravação.'
  }
];

/** Entrada do paciente: a busca e o agendamento acontecem no painel, com login */
export function FindTherapistSection() {
  return (
    <section id="agendamento-online" className="py-20 bg-slate-50 border-t border-slate-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Encontre seu psicólogo
          </h2>
          <p className="mt-3 text-base text-slate-600 leading-relaxed">
            Procura atendimento? Busque profissionais com CRP verificado e agende sua sessão on-line.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STEPS.map(({ icon: Icon, title, text }) => (
            <div key={title} className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center mb-3">
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">{title}</h3>
              <p className="text-sm text-slate-600 mt-1 leading-relaxed">{text}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          {PANEL_LINKS.findTherapist ? (
            <>
              <a
                href={PANEL_LINKS.findTherapist}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-base shadow-md transition-colors"
              >
                <Search className="w-4 h-4" />
                Buscar psicólogo
              </a>
              {PANEL_LINKS.registerPatient && (
                <a
                  href={PANEL_LINKS.registerPatient}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 font-semibold text-base border border-slate-200 transition-colors"
                >
                  Criar conta de paciente
                  <ArrowRight className="w-4 h-4" />
                </a>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-500">A busca de psicólogos estará disponível em breve.</p>
          )}
        </div>
      </div>
    </section>
  );
}
