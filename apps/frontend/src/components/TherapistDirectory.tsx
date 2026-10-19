import React, { useEffect, useState } from 'react';
import { Search, BadgeCheck, Clock, Languages, ArrowLeft, Loader2, UserSearch } from 'lucide-react';
import {
  THERAPEUTIC_APPROACHES,
  CLINICAL_SPECIALTIES,
  type TherapistPublicProfile,
  type TherapistSearchParams
} from '@terapiainfoco/shared';
import { api } from '../services/api';

interface TherapistDirectoryProps {
  /** Ação principal no perfil (ex.: criar conta para agendar). Sem ela, o botão não aparece. */
  scheduleAction?: { label: string; onClick: (profile: TherapistPublicProfile) => void };
  /** Conteúdo exibido abaixo do perfil selecionado (ex.: painel de agendamento do paciente) */
  renderBooking?: (profile: TherapistPublicProfile) => React.ReactNode;
}

const FEE_OPTIONS = [
  { label: 'Qualquer valor', value: '' },
  { label: 'Até R$ 150', value: '15000' },
  { label: 'Até R$ 200', value: '20000' },
  { label: 'Até R$ 300', value: '30000' }
];

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function formatFee(profile: TherapistPublicProfile): string {
  if (profile.sessionFeeCents === null) return 'Valor sob consulta';
  return `${currency.format(profile.sessionFeeCents / 100)} / ${profile.sessionDurationMinutes} min`;
}

function initials(name: string): string {
  return name.replace(/^(Dra?\.|Psic\.)\s*/i, '').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

const selectClass = 'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/40';

function Chip({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'teal' }) {
  const toneClass = tone === 'teal'
    ? 'bg-teal-500/10 text-teal-800 dark:text-teal-300 border-teal-500/20'
    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${toneClass}`}>{children}</span>;
}

export function TherapistDirectory({ scheduleAction, renderBooking }: TherapistDirectoryProps) {
  const [query, setQuery] = useState('');
  const [approach, setApproach] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [maxFee, setMaxFee] = useState('');
  const [results, setResults] = useState<TherapistPublicProfile[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TherapistPublicProfile | null>(null);

  const runSearch = async (nextPage = 1) => {
    const params: TherapistSearchParams = {
      q: query.trim() || undefined,
      approach: approach || undefined,
      specialty: specialty || undefined,
      maxFeeCents: maxFee ? Number(maxFee) : undefined,
      page: nextPage
    };
    setLoading(true);
    setError(null);
    try {
      const res = await api.searchTherapists(params);
      setResults((prev) => (nextPage === 1 ? res.results : [...prev, ...res.results]));
      setTotal(res.total);
      setPage(nextPage);
    } catch (err: any) {
      setError(err.message || 'Não foi possível buscar psicólogos agora.');
    } finally {
      setLoading(false);
    }
  };

  // Filtros de seleção disparam a busca imediatamente; o texto, ao enviar o formulário
  useEffect(() => {
    runSearch(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approach, specialty, maxFee]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(1);
  };

  if (selected) {
    return (
      <div className="space-y-5 animate-fade-in">
        <button
          onClick={() => setSelected(null)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 dark:text-teal-300 hover:underline"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar aos resultados
        </button>
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 space-y-5">
          <div className="flex flex-wrap items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-teal-500 to-emerald-400 text-slate-950 font-bold text-xl flex items-center justify-center shrink-0">
              {initials(selected.displayName)}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">{selected.displayName}</h2>
              {selected.headline && <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">{selected.headline}</p>}
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                <BadgeCheck className="w-4 h-4" /> CRP {selected.crp} ({selected.crpRegion}) verificado
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-slate-900 dark:text-white">{formatFee(selected)}</p>
              {scheduleAction && (
                <button
                  onClick={() => scheduleAction.onClick(selected)}
                  className="mt-2 px-4 py-2 rounded-xl text-sm font-bold text-slate-950 bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-500 hover:to-emerald-500 shadow-md shadow-teal-500/20 transition-all"
                >
                  {scheduleAction.label}
                </button>
              )}
            </div>
          </div>
          {selected.bio && <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-line">{selected.bio}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Abordagens</h3>
              <div className="flex flex-wrap gap-1.5">{selected.approaches.map((a) => <Chip key={a} tone="teal">{a}</Chip>)}</div>
            </div>
            <div className="space-y-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Atende</h3>
              <div className="flex flex-wrap gap-1.5">{selected.specialties.map((s) => <Chip key={s}>{s}</Chip>)}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-slate-600 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5"><Clock className="w-4 h-4" /> Sessões de {selected.sessionDurationMinutes} minutos, online</span>
            {selected.languages.length > 0 && (
              <span className="inline-flex items-center gap-1.5"><Languages className="w-4 h-4" /> {selected.languages.join(', ')}</span>
            )}
          </div>
        </div>
        {renderBooking?.(selected)}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Busque por nome, abordagem ou o que você está sentindo (ex.: ansiedade, luto, TCC)"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 pl-9 pr-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
              aria-label="Buscar psicólogos"
            />
          </div>
          <button type="submit" className="px-4 py-2.5 rounded-xl text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white transition-all">
            Buscar
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select value={approach} onChange={(e) => setApproach(e.target.value)} className={selectClass} aria-label="Abordagem">
            <option value="">Todas as abordagens</option>
            {THERAPEUTIC_APPROACHES.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={specialty} onChange={(e) => setSpecialty(e.target.value)} className={selectClass} aria-label="Especialidade">
            <option value="">Todas as especialidades</option>
            {CLINICAL_SPECIALTIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={maxFee} onChange={(e) => setMaxFee(e.target.value)} className={selectClass} aria-label="Valor máximo da sessão">
            {FEE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </form>

      {error && (
        <p className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>
      )}

      <p className="text-xs text-slate-500 dark:text-slate-400">
        {loading && results.length === 0 ? 'Buscando...' : `${total} psicólogo(s) com CRP verificado`}
      </p>

      {!loading && results.length === 0 && !error ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center space-y-2">
          <UserSearch className="w-8 h-8 mx-auto text-slate-400" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Nenhum psicólogo encontrado</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Tente outros termos ou remova alguns filtros.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {results.map((profile) => (
            <button
              key={profile.therapistId}
              onClick={() => setSelected(profile)}
              className="text-left rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-teal-400 dark:hover:border-teal-600 hover:shadow-md transition-all space-y-3"
            >
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 text-slate-950 font-bold flex items-center justify-center shrink-0">
                  {initials(profile.displayName)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 dark:text-white truncate">{profile.displayName}</p>
                  <p className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                    <BadgeCheck className="w-3.5 h-3.5" /> CRP {profile.crp} verificado
                  </p>
                </div>
                <p className="text-sm font-bold text-slate-900 dark:text-white whitespace-nowrap">{formatFee(profile)}</p>
              </div>
              {profile.headline && <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">{profile.headline}</p>}
              <div className="flex flex-wrap gap-1.5">
                {profile.approaches.slice(0, 2).map((a) => <Chip key={a} tone="teal">{a}</Chip>)}
                {profile.specialties.slice(0, 3).map((s) => <Chip key={s}>{s}</Chip>)}
              </div>
            </button>
          ))}
        </div>
      )}

      {results.length < total && (
        <div className="text-center">
          <button
            onClick={() => runSearch(page + 1)}
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />} Carregar mais
          </button>
        </div>
      )}
    </div>
  );
}
