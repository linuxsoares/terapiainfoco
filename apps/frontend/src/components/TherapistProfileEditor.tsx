import React, { useEffect, useState } from 'react';
import { BadgeCheck, Hourglass, Loader2, Save, Globe } from 'lucide-react';
import {
  THERAPEUTIC_APPROACHES,
  CLINICAL_SPECIALTIES,
  type TherapistOwnProfile,
  type UpdateTherapistProfileDTO
} from '@terapiainfoco/shared';
import { api } from '../services/api';

const inputClass = 'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/40';
const labelClass = 'block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5';

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function ChipPicker({ options, selected, onChange, max }: { options: readonly string[]; selected: string[]; onChange: (next: string[]) => void; max: number }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = selected.includes(option);
        const disabled = !active && selected.length >= max;
        return (
          <button
            key={option}
            type="button"
            disabled={disabled}
            onClick={() => onChange(toggle(selected, option))}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all disabled:opacity-40 ${
              active
                ? 'bg-teal-600 border-teal-600 text-white'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-teal-400'
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

/** Edição do perfil público exibido na busca de psicólogos */
export function TherapistProfileEditor() {
  const [profile, setProfile] = useState<TherapistOwnProfile | null>(null);
  const [form, setForm] = useState({
    headline: '',
    bio: '',
    approaches: [] as string[],
    specialties: [] as string[],
    languages: 'Português',
    fee: '',
    duration: '50',
    published: false
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const fillForm = (p: TherapistOwnProfile) => {
    setProfile(p);
    setForm({
      headline: p.headline ?? '',
      bio: p.bio ?? '',
      approaches: p.approaches,
      specialties: p.specialties,
      languages: p.languages.join(', '),
      fee: p.sessionFeeCents !== null ? String(p.sessionFeeCents / 100) : '',
      duration: String(p.sessionDurationMinutes),
      published: p.published
    });
  };

  useEffect(() => {
    api.getMyTherapistProfile()
      .then((p) => { if (p) fillForm(p); })
      .catch((err) => setMessage({ kind: 'error', text: err.message }))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const dto: UpdateTherapistProfileDTO = {
      headline: form.headline,
      bio: form.bio,
      approaches: form.approaches,
      specialties: form.specialties,
      languages: form.languages.split(',').map((l) => l.trim()).filter(Boolean),
      sessionFeeCents: form.fee ? Math.round(Number(form.fee.replace(',', '.')) * 100) : null,
      sessionDurationMinutes: Number(form.duration),
      published: form.published
    };
    try {
      fillForm(await api.updateMyTherapistProfile(dto));
      setMessage({ kind: 'ok', text: 'Perfil público salvo.' });
    } catch (err: any) {
      setMessage({ kind: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Carregando perfil...</p>;
  }

  const visibleInSearch = !!profile?.published && !!profile?.crpVerified;

  return (
    <form onSubmit={handleSave} className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Meu Perfil Público</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">Como pacientes encontram você na busca de psicólogos.</p>
      </div>

      <div className={`rounded-2xl border p-4 flex items-start gap-3 text-sm ${
        visibleInSearch
          ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200'
          : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200'
      }`}>
        {profile?.crpVerified ? <BadgeCheck className="w-5 h-5 shrink-0" /> : <Hourglass className="w-5 h-5 shrink-0" />}
        <div>
          {!profile && <p>Preencha e salve seu perfil para enviá-lo à verificação de CRP.</p>}
          {profile && !profile.crpVerified && <p>CRP {profile.crp} aguardando verificação pela equipe. Seu perfil só aparece na busca após a verificação.</p>}
          {profile?.crpVerified && !profile.published && <p>CRP verificado. Ative "Publicar na busca" para aparecer para pacientes.</p>}
          {visibleInSearch && (
            <p className="flex items-center gap-1.5"><Globe className="w-4 h-4" /> Visível na busca como <strong>/{profile!.slug}</strong>.</p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
        <div>
          <label className={labelClass} htmlFor="headline">Título</label>
          <input id="headline" className={inputClass} maxLength={200} value={form.headline}
            onChange={(e) => setForm({ ...form, headline: e.target.value })}
            placeholder="Ex.: Psicóloga clínica — ansiedade, luto e relacionamentos" />
        </div>
        <div>
          <label className={labelClass} htmlFor="bio">Apresentação</label>
          <textarea id="bio" rows={5} className={inputClass} maxLength={2000} value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
            placeholder="Conte sua formação, como conduz o atendimento e para quem ele é indicado." />
        </div>
        <div>
          <span className={labelClass}>Abordagens (até 5)</span>
          <ChipPicker options={THERAPEUTIC_APPROACHES} selected={form.approaches} max={5}
            onChange={(approaches) => setForm({ ...form, approaches })} />
        </div>
        <div>
          <span className={labelClass}>Especialidades (até 10)</span>
          <ChipPicker options={CLINICAL_SPECIALTIES} selected={form.specialties} max={10}
            onChange={(specialties) => setForm({ ...form, specialties })} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelClass} htmlFor="fee">Valor da sessão (R$)</label>
            <input id="fee" inputMode="decimal" className={inputClass} value={form.fee}
              onChange={(e) => setForm({ ...form, fee: e.target.value })} placeholder="250" />
          </div>
          <div>
            <label className={labelClass} htmlFor="duration">Duração (min)</label>
            <input id="duration" type="number" min={20} max={180} className={inputClass} value={form.duration}
              onChange={(e) => setForm({ ...form, duration: e.target.value })} />
          </div>
          <div>
            <label className={labelClass} htmlFor="languages">Idiomas</label>
            <input id="languages" className={inputClass} value={form.languages}
              onChange={(e) => setForm({ ...form, languages: e.target.value })} placeholder="Português, Inglês" />
          </div>
        </div>
        <label className="flex items-center gap-3 text-sm text-slate-800 dark:text-slate-200">
          <input type="checkbox" className="w-4 h-4 accent-teal-600" checked={form.published}
            onChange={(e) => setForm({ ...form, published: e.target.checked })} />
          Publicar na busca de psicólogos
        </label>
      </div>

      {message && (
        <p className={`text-sm ${message.kind === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>{message.text}</p>
      )}

      <button type="submit" disabled={saving}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-60">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar perfil
      </button>
    </form>
  );
}
