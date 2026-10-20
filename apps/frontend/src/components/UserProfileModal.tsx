import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  ShieldCheck,
  Award,
  HeartHandshake,
  Save,
  CheckCircle2,
  Globe,
  Lock,
  Fingerprint,
  Phone,
  Sparkles,
  FolderLock,
  AlertCircle
} from 'lucide-react';
import { UserRole, SocialAuthProvider } from '@terapiainfoco/shared';
import type { SafeUser } from '@terapiainfoco/shared';
import { api } from '../services/api';

interface UserProfileModalProps {
  isOpen: boolean;
  user: SafeUser;
  onClose: () => void;
  onProfileUpdated: (updated: SafeUser) => void;
  onOpenPatientPortal?: () => void;
  onOpenPortabilityVault?: () => void;
  /** Vincular provedores sociais só existe em DEMO_MODE */
  socialLoginEnabled?: boolean;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  user,
  onClose,
  onProfileUpdated,
  onOpenPatientPortal,
  onOpenPortabilityVault,
  socialLoginEnabled = false
}) => {
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone || '');
  const [crp, setCrp] = useState(user.crp || '');
  const [crpRegion, setCrpRegion] = useState(user.crpRegion || 'SP');
  const [specialty, setSpecialty] = useState(user.specialty || '');
  const [bio, setBio] = useState(user.bio || '');
  const [sessionFee, setSessionFee] = useState(String((user.sessionFeeCents || 25000) / 100));
  const [emergencyContactName, setEmergencyContactName] = useState(user.emergencyContactName || '');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(user.emergencyContactPhone || '');
  const [department, setDepartment] = useState(user.department || '');
  const [dpoCertification, setDpoCertification] = useState(user.dpoCertification || '');

  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [allProfiles, setAllProfiles] = useState<SafeUser[]>([]);

  useEffect(() => {
    setName(user.name);
    setPhone(user.phone || '');
    setCrp(user.crp || '');
    setCrpRegion(user.crpRegion || 'SP');
    setSpecialty(user.specialty || '');
    setBio(user.bio || '');
    setSessionFee(String((user.sessionFeeCents || 25000) / 100));
    setEmergencyContactName(user.emergencyContactName || '');
    setEmergencyContactPhone(user.emergencyContactPhone || '');
    setDepartment(user.department || '');
    setDpoCertification(user.dpoCertification || '');
    setSavedSuccess(false);
    setSaveError(null);

    if (isOpen && user.role === UserRole.ADMIN) {
      api.listProfiles()
        .then(list => setAllProfiles(list))
        .catch(() => {});
    }
  }, [user, isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);
    setSaveError(null);
    try {
      const updated = await api.updateProfile({
        name,
        phone,
        crp: user.role === UserRole.PSICOLOGO_TITULAR ? crp : undefined,
        crpRegion: user.role === UserRole.PSICOLOGO_TITULAR ? crpRegion : undefined,
        specialty: user.role === UserRole.PSICOLOGO_TITULAR ? specialty : undefined,
        bio: user.role === UserRole.PSICOLOGO_TITULAR ? bio : undefined,
        sessionFeeCents: user.role === UserRole.PSICOLOGO_TITULAR ? Math.round(Number(sessionFee || 250) * 100) : undefined,
        emergencyContactName: user.role === UserRole.PACIENTE ? emergencyContactName : undefined,
        emergencyContactPhone: user.role === UserRole.PACIENTE ? emergencyContactPhone : undefined,
        department: user.role === UserRole.ADMIN ? department : undefined,
        dpoCertification: user.role === UserRole.ADMIN ? dpoCertification : undefined
      });
      onProfileUpdated(updated);
      setSavedSuccess(true);
    } catch (err: any) {
      // Nada é alterado localmente: o perfil exibido continua igual ao salvo no servidor
      setSaveError(err?.message || 'Não foi possível salvar o perfil. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const handleLinkSocialProvider = async (provider: SocialAuthProvider) => {
    try {
      const res = await api.socialLoginOrRegister({
        provider,
        email: user.email,
        name: user.name,
        role: user.role
      });
      if (res.user) {
        onProfileUpdated(res.user);
        setSavedSuccess(true);
      }
    } catch {
      // ignore
    }
  };

  const roleBadgeLabel =
    user.role === UserRole.PACIENTE
      ? 'Perfil Paciente (Titular LGPD Art. 18)'
      : user.role === UserRole.ADMIN
      ? 'Perfil Admin TI & Encarregado de Dados (DPO)'
      : user.role === UserRole.PSICOLOGO_TITULAR
      ? 'Perfil Psicólogo(a) Titular (CRP / e-Psi)'
      : user.role;

  const linkedProviders = user.socialProviders || [SocialAuthProvider.EMAIL_PASSWORD];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center font-extrabold text-slate-950 text-base shadow-md">
              {user.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                  Meu Perfil • {user.name}
                </h2>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20">
                  {roleBadgeLabel}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {savedSuccess && (
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Dados do perfil atualizados e selados na trilha de auditoria WORM!</span>
            </div>
          )}

          {saveError && (
            <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          {/* Provedores de Login Social Vinculados (apenas em DEMO_MODE: sem verificação OIDC do token) */}
          {socialLoginEnabled && (
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2.5">
            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Métodos de Login & Identidades Sociais Vinculadas ao Perfil
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { id: SocialAuthProvider.EMAIL_PASSWORD, label: 'E-mail & Senha Argon2id', icon: Lock },
                { id: SocialAuthProvider.GOOGLE, label: 'Google OAuth 2.0', icon: Globe },
                { id: SocialAuthProvider.GOV_BR, label: 'Gov.br (Prata/Ouro)', icon: Award },
                { id: SocialAuthProvider.APPLE, label: 'Apple ID', icon: ShieldCheck },
                { id: SocialAuthProvider.PASSKEY_FIDO2, label: 'Passkey FIDO2', icon: Fingerprint }
              ].map(prov => {
                const IconComp = prov.icon;
                const isLinked = linkedProviders.includes(prov.id);
                return (
                  <button
                    key={prov.id}
                    type="button"
                    onClick={() => !isLinked && handleLinkSocialProvider(prov.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                      isLinked
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-teal-500/50'
                    }`}
                  >
                    <IconComp className="w-3.5 h-3.5" />
                    <span>{prov.label}</span>
                    <span className="text-[10px] opacity-80">{isLinked ? '✓ Ativo' : '+ Vincular'}</span>
                  </button>
                );
              })}
            </div>
          </div>
          )}

          {/* Dados Básicos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Nome Completo
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Telefone / WhatsApp
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
            </div>
          </div>

          {/* Se for PSICÓLOGO */}
          {user.role === UserRole.PSICOLOGO_TITULAR && (
            <div className="p-4 rounded-2xl bg-teal-500/5 border border-teal-500/20 space-y-3">
              <p className="text-xs font-bold text-teal-800 dark:text-teal-300 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                Dados do Perfil de Psicólogo(a) (CFP / e-Psi)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Registro CRP
                  </label>
                  <input
                    type="text"
                    value={crp}
                    onChange={e => setCrp(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Região UF
                  </label>
                  <input
                    type="text"
                    maxLength={2}
                    value={crpRegion}
                    onChange={e => setCrpRegion(e.target.value.toUpperCase())}
                    className="w-full px-3 py-1.5 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Valor da Sessão (R$)
                  </label>
                  <input
                    type="number"
                    value={sessionFee}
                    onChange={e => setSessionFee(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Especialidade & Abordagem Teórica
                </label>
                <input
                  type="text"
                  value={specialty}
                  onChange={e => setSpecialty(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Mini-Biografia Profissional
                </label>
                <textarea
                  rows={2}
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
            </div>
          )}

          {/* Se for PACIENTE */}
          {user.role === UserRole.PACIENTE && (
            <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-1.5">
                  <HeartHandshake className="w-4 h-4" />
                  Dados do Perfil de Paciente & Rede de Apoio
                </p>
                {user.cpfMasked && (
                  <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">
                    CPF Protegido: {user.cpfMasked}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Contato de Emergência (Rede de Apoio TCLE)
                  </label>
                  <input
                    type="text"
                    value={emergencyContactName}
                    onChange={e => setEmergencyContactName(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Telefone de Emergência
                  </label>
                  <input
                    type="text"
                    value={emergencyContactPhone}
                    onChange={e => setEmergencyContactPhone(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {onOpenPatientPortal && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenPatientPortal();
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    <HeartHandshake className="w-3.5 h-3.5" />
                    <span>Abrir Exercícios, Recibos & TCLE</span>
                  </button>
                )}
                {onOpenPortabilityVault && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenPortabilityVault();
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-teal-600 text-white hover:bg-teal-700"
                  >
                    <FolderLock className="w-3.5 h-3.5" />
                    <span>Cofre de Portabilidade Cifrado (.enc)</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Se for ADMIN */}
          {user.role === UserRole.ADMIN && (
            <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-3">
              <p className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                Dados de Governança, TI & DPO (LGPD Art. 41)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Departamento
                  </label>
                  <input
                    type="text"
                    value={department}
                    onChange={e => setDepartment(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Certificação DPO / Segurança
                  </label>
                  <input
                    type="text"
                    value={dpoCertification}
                    onChange={e => setDpoCertification(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
              </div>

              {allProfiles.length > 0 && (
                <div className="pt-2 space-y-1.5">
                  <p className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                    Perfis Registrados na Plataforma ({allProfiles.length}):
                  </p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {allProfiles.map(prof => (
                      <div
                        key={prof.id}
                        className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 text-xs border border-slate-200/70 dark:border-slate-700"
                      >
                        <div>
                          <span className="font-bold text-slate-800 dark:text-slate-200">{prof.name}</span>
                          <span className="text-slate-400 ml-2">{prof.email}</span>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-teal-700 dark:text-teal-300 font-bold">
                          {prof.role}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Fechar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-500 hover:to-emerald-500 shadow-md"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Salvando...' : 'Salvar Alterações do Perfil'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
