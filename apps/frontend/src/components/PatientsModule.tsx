import React, { useState } from 'react';
import { 
  Users, 
  Search, 
  UserPlus, 
  ShieldAlert, 
  CheckCircle2, 
  AlertCircle, 
  Lock, 
  KeyRound, 
  FileCheck2, 
  DownloadCloud, 
  UserX, 
  FileText, 
  Copy, 
  Check, 
  Download, 
  ShieldCheck, 
  Hash, 
  Info,
  ClipboardList,
  HeartPulse,
  History
} from 'lucide-react';
import type { 
  DecryptedPatient, 
  CreatePatientDTO, 
  ExportPatientDataResponse,
  DecryptedAnamnesisRecord,
  SaveAnamnesisDTO
} from '@terapiainfoco/shared';
import { AuditResourceType } from '@terapiainfoco/shared';
import { MaskedField } from './MaskedField';
import { api } from '../services/api';

export function PatientsModule() {
  const [searchCpf, setSearchCpf] = useState('');
  const [searchResult, setSearchResult] = useState<DecryptedPatient | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Form de cadastro
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<CreatePatientDTO>({
    name: 'Mariana Silva de Oliveira',
    email: 'mariana.silva@email.com',
    phone: '11987654321',
    cpf: '123.456.789-00',
    consentTranscriptionSigned: true
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Modal de Portabilidade / Exportação LGPD Art. 18
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'json' | 'encrypted_package'>('json');
  const [exportPassphrase, setExportPassphrase] = useState('');
  const [exportReason, setExportReason] = useState('Solicitação de portabilidade de prontuário (LGPD Art. 18)');
  const [exportLoading, setExportLoading] = useState(false);
  const [exportResult, setExportResult] = useState<ExportPatientDataResponse | null>(null);
  const [copiedChecksum, setCopiedChecksum] = useState(false);

  // Modal de Revogação de Consentimento
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [revokeReason, setRevokeReason] = useState('Solicitação de cancelamento da transcrição e atendimento assistido por IA');
  const [revokeQuarantine, setRevokeQuarantine] = useState(false);
  const [revokeLoading, setRevokeLoading] = useState(false);

  // Modal de Anamnese Biopsicossocial (CFP nº 001/2009 & RFC §3.4)
  const [showAnamnesisModal, setShowAnamnesisModal] = useState(false);
  const [anamnesisLoading, setAnamnesisLoading] = useState(false);
  const [anamnesisSaving, setAnamnesisSaving] = useState(false);
  const [currentAnamnesisRecord, setCurrentAnamnesisRecord] = useState<DecryptedAnamnesisRecord | null>(null);
  const [anamnesisStatusMessage, setAnamnesisStatusMessage] = useState<string | null>(null);
  const [anamnesisTab, setAnamnesisTab] = useState<'complaint' | 'biopsychosocial' | 'medical' | 'goals'>('complaint');
  const [anamnesisData, setAnamnesisData] = useState<SaveAnamnesisDTO>({
    chiefComplaint: '',
    historyOfComplaint: '',
    biopsychosocialHistory: {
      personalDevelopment: '',
      familyDynamics: '',
      socialSupportNetwork: '',
      routineSleepNutrition: ''
    },
    medicalAndPsychiatricHistory: {
      currentMedications: '',
      previousTreatments: '',
      familyPsychiatricHistory: '',
      allergiesOrMedicalConditions: ''
    },
    therapeuticGoals: '',
    emergencyContact: {
      name: '',
      relationship: '',
      phone: ''
    }
  });

  const handleOpenAnamnesis = async (patientId: string) => {
    setShowAnamnesisModal(true);
    setAnamnesisLoading(true);
    setAnamnesisStatusMessage(null);
    setAnamnesisTab('complaint');
    try {
      const existing = await api.getAnamnesis(patientId);
      if (existing) {
        setCurrentAnamnesisRecord(existing);
        setAnamnesisData({
          chiefComplaint: existing.chiefComplaint || '',
          historyOfComplaint: existing.historyOfComplaint || '',
          biopsychosocialHistory: {
            personalDevelopment: existing.biopsychosocialHistory?.personalDevelopment || '',
            familyDynamics: existing.biopsychosocialHistory?.familyDynamics || '',
            socialSupportNetwork: existing.biopsychosocialHistory?.socialSupportNetwork || '',
            routineSleepNutrition: existing.biopsychosocialHistory?.routineSleepNutrition || ''
          },
          medicalAndPsychiatricHistory: {
            currentMedications: existing.medicalAndPsychiatricHistory?.currentMedications || '',
            previousTreatments: existing.medicalAndPsychiatricHistory?.previousTreatments || '',
            familyPsychiatricHistory: existing.medicalAndPsychiatricHistory?.familyPsychiatricHistory || '',
            allergiesOrMedicalConditions: existing.medicalAndPsychiatricHistory?.allergiesOrMedicalConditions || ''
          },
          therapeuticGoals: existing.therapeuticGoals || '',
          emergencyContact: existing.emergencyContact ? {
            name: existing.emergencyContact.name || '',
            relationship: existing.emergencyContact.relationship || '',
            phone: existing.emergencyContact.phone || ''
          } : { name: '', relationship: '', phone: '' }
        });
      } else {
        setCurrentAnamnesisRecord(null);
        setAnamnesisData({
          chiefComplaint: 'Ansiedade acentuada com picos de taquicardia em situações de pressão no trabalho e prejuízo no sono.',
          historyOfComplaint: 'Sintomas iniciados há aproximadamente 6 meses após assunção de nova coordenação de equipe. Piora progressiva com pensamentos catastróficos.',
          biopsychosocialHistory: {
            personalDevelopment: 'Desenvolvimento infantil e escolaridade sem intercorrências; perfil perfeccionista desde a adolescência.',
            familyDynamics: 'Família de origem coesa, pais idosos com boa convivência; união estável de 5 anos com suporte mútuo.',
            socialSupportNetwork: 'Círculo de amigos próximos e prática semanal de atividades sociais.',
            routineSleepNutrition: 'Sono não-reparador de 5h a 6h por noite com despertares noturnos; alimentação balanceada mas com refeições apressadas.'
          },
          medicalAndPsychiatricHistory: {
            currentMedications: 'Nenhum medicamento psicotrópico em uso contínuo no momento.',
            previousTreatments: 'Acompanhamento psicológico pontual há 3 anos para luto familiar.',
            familyPsychiatricHistory: 'Histórico materno de transtorno depressivo recorrente.',
            allergiesOrMedicalConditions: 'Gastrite nervosa diagnosticada clinicamente; sem alergias medicamentosas conhecidas.'
          },
          therapeuticGoals: '1. Psicoeducação e manejo de crises ansiosas através de técnicas cognitivo-comportamentais.\n2. Reestruturação cognitiva de crenças centrais de incapacidade e perfeccionismo.\n3. Estabelecimento de limites e equilíbrio entre exigências corporativas e autocuidado.',
          emergencyContact: {
            name: 'Carlos Oliveira',
            relationship: 'Cônjuge',
            phone: '11987654322'
          }
        });
      }
    } catch (err: any) {
      setAnamnesisStatusMessage(`Erro ao buscar ficha de anamnese: ${err.message}`);
    } finally {
      setAnamnesisLoading(false);
    }
  };

  const handleSaveAnamnesis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchResult) return;
    try {
      setAnamnesisSaving(true);
      setAnamnesisStatusMessage(null);
      const saved = await api.saveAnamnesis(searchResult.id, anamnesisData);
      setCurrentAnamnesisRecord(saved);
      setAnamnesisStatusMessage(`Ficha de Anamnese v${saved.version} salva com sucesso! Dados criptografados ponta-a-ponta (AES-256-GCM) e auditados na trilha WORM.`);
    } catch (err: any) {
      setAnamnesisStatusMessage(`Erro ao salvar anamnese: ${err.message}`);
    } finally {
      setAnamnesisSaving(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchCpf.trim()) return;

    try {
      setSearchLoading(true);
      setSearchError(null);
      setSearchResult(null);
      const patient = await api.searchPatientByCpf(searchCpf);
      setSearchResult(patient);
    } catch (err: any) {
      setSearchError(err.message || 'Paciente não localizado pelo Blind Index.');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleCreatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreateLoading(true);
      setStatusMessage(null);
      const newPatient = await api.createPatient(formData);
      setStatusMessage(`Paciente ${newPatient.name} cadastrado com sucesso! PII cifrado no banco.`);
      setSearchResult(newPatient);
      setShowCreateModal(false);
    } catch (err: any) {
      setStatusMessage(`Erro: ${err.message}`);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleQuarantine = async (patientId: string) => {
    if (!confirm('Deseja iniciar a Quarentena Criptográfica LGPD? Os dados ativos serão anonimizados e o prontuário trancado por 5 anos (CFP nº 001/2009).')) {
      return;
    }

    try {
      const msg = await api.quarantinePatient(patientId);
      setStatusMessage(msg);
      setSearchResult(null);
    } catch (err: any) {
      setStatusMessage(`Erro: ${err.message}`);
    }
  };

  const handleExportData = async () => {
    if (!searchResult) return;
    try {
      setExportLoading(true);
      setStatusMessage(null);
      const res = await api.exportPatientData(searchResult.id, {
        format: exportFormat,
        passphrase: exportFormat === 'encrypted_package' ? exportPassphrase : undefined,
        requestReason: exportReason
      });
      setExportResult(res);
      setStatusMessage('Pacote de portabilidade gerado com sucesso com integridade SHA-256 e selo CFP!');
    } catch (err: any) {
      alert(`Falha ao exportar dados: ${err.message}`);
    } finally {
      setExportLoading(false);
    }
  };

  const handleDownloadFile = () => {
    if (!exportResult) return;
    const isEncrypted = exportResult.format === 'encrypted_package';
    const contentToDownload = isEncrypted 
      ? JSON.stringify(exportResult.encryptedPackage, null, 2)
      : JSON.stringify(exportResult.package, null, 2);

    const fileName = isEncrypted
      ? `prontuario-criptografado-${searchResult?.id.slice(0, 8)}.json`
      : `prontuario-portabilidade-lgpd-${searchResult?.id.slice(0, 8)}.json`;

    const blob = new Blob([contentToDownload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyChecksum = () => {
    if (!exportResult?.checksumSha256) return;
    navigator.clipboard.writeText(exportResult.checksumSha256);
    setCopiedChecksum(true);
    setTimeout(() => setCopiedChecksum(false), 2000);
  };

  const handleRevokeConsent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchResult) return;
    try {
      setRevokeLoading(true);
      const res = await api.revokeConsent(searchResult.id, {
        reason: revokeReason,
        revokeTranscriptionConsent: true,
        requestDataQuarantine: revokeQuarantine
      });

      setStatusMessage(res.message);
      setShowRevokeModal(false);

      // Atualiza o estado visual do paciente
      if (revokeQuarantine) {
        setSearchResult({
          ...searchResult,
          name: '[PACIENTE EM QUARENTENA LGPD]',
          consentTranscriptionSigned: false,
          consentRevokedAt: res.revokedAt,
          consentRevokeReason: revokeReason
        });
      } else {
        setSearchResult({
          ...searchResult,
          consentTranscriptionSigned: false,
          consentRevokedAt: res.revokedAt,
          consentRevokeReason: revokeReason
        });
      }
    } catch (err: any) {
      alert(`Erro ao revogar consentimento: ${err.message}`);
    } finally {
      setRevokeLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-teal-600 dark:text-teal-400" />
            Gestão de Pacientes, Blind Index & Portabilidade LGPD
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Criptografia de ponta a ponta (AES-256-GCM), busca cega HMAC-SHA256 e portabilidade Art. 18
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold flex items-center gap-2 shadow-lg shadow-teal-500/20 transition-all self-start sm:self-auto cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          Cadastrar Paciente
        </button>
      </div>

      {statusMessage && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-sm flex items-center gap-3 animate-fade-in">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Explicação Didática da Criptografia & Portabilidade */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-5 rounded-2xl bg-gradient-to-r from-teal-50/50 to-slate-50 dark:from-slate-900 dark:to-slate-900/60 border border-teal-100 dark:border-slate-800 shadow-sm dark:shadow-none flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Busca Segura (Blind Index)</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              O CPF nunca é armazenado ou buscado em texto claro. A plataforma computa <code className="text-teal-700 dark:text-teal-300 font-mono bg-teal-100/50 dark:bg-slate-800 px-1 py-0.5 rounded">HMAC-SHA256(cpf)</code> com salt secreto para indexação determinística sem vazamento.
            </p>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-gradient-to-r from-cyan-50/50 to-slate-50 dark:from-slate-900 dark:to-slate-900/60 border border-cyan-100 dark:border-slate-800 shadow-sm dark:shadow-none flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
            <DownloadCloud className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Portabilidade & Guarda Ética (CFP)</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Exportação do prontuário em formato aberto interoperável (Art. 18 LGPD) ou pacote cifrado por senha. Em caso de revogação, o original permanece sob guarda por 5 anos (Res. CFP nº 001/2009).
            </p>
          </div>
        </div>
      </div>

      {/* Caixa de Busca por CPF */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none space-y-4">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          Localizar Paciente via Blind Index
        </h2>

        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2 sm:gap-3 max-w-xl">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Digite o CPF (ex: 123.456.789-00)..."
              value={searchCpf}
              onChange={(e) => setSearchCpf(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-teal-500 font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={searchLoading}
            className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
          >
            {searchLoading ? 'Buscando...' : 'Pesquisar'}
          </button>
        </form>

        {searchError && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2 max-w-xl">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{searchError}</span>
          </div>
        )}

        {/* Resultado Encontrado */}
        {searchResult && (
          <div className="mt-4 p-5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-teal-500/30 space-y-4 max-w-3xl animate-fade-in shadow-sm dark:shadow-none">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-widest text-teal-700 dark:text-teal-400 bg-teal-500/10 border border-teal-500/20 px-2 py-0.5 rounded-full">
                  Blind Index Match • Decriptado em RAM
                </span>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-1.5">
                  <MaskedField
                    type="name"
                    value={searchResult.name}
                    resourceType={AuditResourceType.PATIENT}
                    resourceId={searchResult.id}
                    fieldName="name"
                  />
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">ID: {searchResult.id}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {searchResult.consentTranscriptionSigned ? (
                  <span className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full font-medium">
                    <FileCheck2 className="w-3.5 h-3.5" />
                    Consentimento Ativo
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full font-medium">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {searchResult.consentRevokedAt ? 'Consentimento Revogado' : 'Sem Consentimento'}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-white dark:bg-slate-900/80 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
              <div>
                <span className="text-slate-500 block mb-0.5">E-mail:</span>
                <MaskedField
                  type="email"
                  value={searchResult.email}
                  resourceType={AuditResourceType.PATIENT}
                  resourceId={searchResult.id}
                  fieldName="email"
                />
              </div>
              <div>
                <span className="text-slate-500 block mb-0.5">Telefone:</span>
                <MaskedField
                  type="phone"
                  value={searchResult.phone}
                  resourceType={AuditResourceType.PATIENT}
                  resourceId={searchResult.id}
                  fieldName="phone"
                />
              </div>
              <div>
                <span className="text-slate-500 block mb-0.5">CPF:</span>
                <MaskedField
                  type="cpf"
                  value={searchResult.cpf}
                  resourceType={AuditResourceType.PATIENT}
                  resourceId={searchResult.id}
                  fieldName="cpf"
                />
              </div>
              <div>
                <span className="text-slate-500 block mb-0.5">Hash Blind Index:</span>
                <p className="font-mono text-teal-700 dark:text-teal-400/80 truncate mt-0.5">{searchResult.cpfBindex || searchResult.emailBindex}</p>
              </div>
              {searchResult.consentRevokedAt && (
                <div className="sm:col-span-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-300">
                  <span className="font-semibold">Revogação registrada em:</span> {new Date(searchResult.consentRevokedAt).toLocaleString('pt-BR')}
                  {searchResult.consentRevokeReason && (
                    <p className="text-[11px] mt-0.5 italic">Motivo: "{searchResult.consentRevokeReason}"</p>
                  )}
                </div>
              )}
            </div>

            {/* Painel de Ações: Anamnese, Portabilidade, Revogação & Quarentena */}
            <div className="pt-2 flex flex-wrap items-center justify-end gap-2.5">
              <button
                onClick={() => handleOpenAnamnesis(searchResult.id)}
                className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
              >
                <ClipboardList className="w-3.5 h-3.5" />
                Ficha de Anamnese Biopsicossocial
              </button>

              <button
                onClick={() => {
                  setExportResult(null);
                  setShowExportModal(true);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
              >
                <DownloadCloud className="w-3.5 h-3.5" />
                Portabilidade LGPD (Art. 18)
              </button>

              <button
                onClick={() => setShowRevokeModal(true)}
                className="px-3.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <UserX className="w-3.5 h-3.5" />
                Revogar Consentimento
              </button>

              <button
                onClick={() => handleQuarantine(searchResult.id)}
                className="px-3.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                Quarentena (5 Anos CFP)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Portabilidade / Exportação LGPD Art. 18 */}
      {showExportModal && searchResult && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-xl w-full p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                  <DownloadCloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Portabilidade de Prontuário (LGPD Art. 18)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Exportação integral com integridade SHA-256 e salvaguarda do CFP
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowExportModal(false)} 
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            {!exportResult ? (
              <div className="space-y-4">
                {/* Formato de Exportação */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Formato de Exportação
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setExportFormat('json')}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        exportFormat === 'json'
                          ? 'border-teal-500 bg-teal-50/50 dark:bg-teal-950/20 text-teal-900 dark:text-teal-200'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-semibold text-xs mb-1">
                        <FileText className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                        JSON Estruturado
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Padrão aberto interoperável para migração de consultório.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setExportFormat('encrypted_package')}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        exportFormat === 'encrypted_package'
                          ? 'border-teal-500 bg-teal-50/50 dark:bg-teal-950/20 text-teal-900 dark:text-teal-200'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-semibold text-xs mb-1">
                        <Lock className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                        Pacote Criptografado
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Cifrado por senha via AES-256-GCM + PBKDF2 (100k rounds).
                      </p>
                    </button>
                  </div>
                </div>

                {exportFormat === 'encrypted_package' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Frase Secreta de Criptografia (Passphrase)
                    </label>
                    <input
                      type="password"
                      placeholder="Mínimo de 6 caracteres (ex: SenhaForte#2026)..."
                      value={exportPassphrase}
                      onChange={(e) => setExportPassphrase(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-teal-500"
                    />
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      O titular necessitará desta senha para abrir e decifrar o arquivo.
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Motivo / Protocolo da Solicitação
                  </label>
                  <input
                    type="text"
                    value={exportReason}
                    onChange={(e) => setExportReason(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-teal-500"
                  />
                </div>

                {/* Resumo dos Dados Incluídos no Pacote */}
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                  <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    Conteúdo Incluído no Pacote de Portabilidade:
                  </div>
                  <ul className="space-y-1 text-slate-600 dark:text-slate-300 list-disc list-inside text-[11px]">
                    <li>Dados cadastrais decifrados e registros de consentimento (TCLE)</li>
                    <li>Histórico completo de atendimentos com links e horários</li>
                    <li>Prontuários e evoluções SOAP assinados (Human-in-the-Loop)</li>
                    <li>Documentos oficiais CFP emitidos (Atestados, Relatórios, etc.)</li>
                    <li>Transcrições e diarizações de sessões telepresenciais</li>
                    <li>Resumo da trilha de auditoria WORM para o titular</li>
                  </ul>
                </div>

                {/* Aviso Jurídico CFP nº 001/2009 */}
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2.5">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-relaxed">
                    <strong>Salvaguarda Ética:</strong> A disponibilização do prontuário ao paciente não exclui o dever ético e legal do psicólogo titular de manter a via original em arquivo sigiloso pelo prazo mínimo de 5 anos (Res. CFP nº 001/2009 Art. 4º e LGPD Art. 16, I).
                  </p>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowExportModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleExportData}
                    disabled={exportLoading || (exportFormat === 'encrypted_package' && exportPassphrase.length < 6)}
                    className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-lg shadow-teal-500/20"
                  >
                    {exportLoading ? (
                      'Consolidando Prontuário...'
                    ) : (
                      <>
                        <DownloadCloud className="w-4 h-4" />
                        Gerar Pacote de Portabilidade
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* Resultado Pronto com Download e Checksum */
              <div className="space-y-4 animate-fade-in">
                <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/30 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-sm">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    Pacote de Prontuário Gerado com Sucesso!
                  </div>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">
                    {exportResult.message}
                  </p>
                </div>

                {/* Checksum SHA-256 */}
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 font-semibold">
                    <span className="flex items-center gap-1.5">
                      <Hash className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                      Checksum SHA-256 de Integridade:
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyChecksum}
                      className="text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1 text-[11px] cursor-pointer"
                    >
                      {copiedChecksum ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      {copiedChecksum ? 'Copiado!' : 'Copiar Hash'}
                    </button>
                  </div>
                  <div className="font-mono text-[11px] text-slate-800 dark:text-slate-200 break-all bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                    {exportResult.checksumSha256}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setExportResult(null)}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium cursor-pointer"
                  >
                    Gerar Novo Formato
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadFile}
                    className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-teal-500/20 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    Baixar Arquivo JSON ({exportResult.format === 'encrypted_package' ? 'Criptografado' : 'Estruturado'})
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de Revogação Formal de Consentimento */}
      {showRevokeModal && searchResult && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <UserX className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Revogação de Consentimento
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    LGPD Art. 18, IX & Resolução CFP nº 001/2009
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowRevokeModal(false)} 
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRevokeConsent} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Justificativa da Revogação
                </label>
                <textarea
                  rows={3}
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-teal-500"
                  required
                />
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-start gap-3">
                <input
                  type="checkbox"
                  id="revokeQuarantineCheck"
                  checked={revokeQuarantine}
                  onChange={(e) => setRevokeQuarantine(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 dark:border-slate-700 text-rose-600 focus:ring-rose-500 cursor-pointer"
                />
                <label htmlFor="revokeQuarantineCheck" className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed cursor-pointer">
                  <strong>Anonimizar Dados de Contato (Quarentena LGPD):</strong> Pseudonimiza e-mail, telefone e CPF ativos enquanto mantém os registros clínicos históricos selados pela guarda legal obrigatória de 5 anos.
                </label>
              </div>

              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-300 text-xs">
                A revogação cancela imediatamente a permissão para novas gravações ou transcrições por IA, sem prejudicar a validade dos atos clínicos praticados sob a vigência do consentimento prévio.
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRevokeModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={revokeLoading || revokeReason.length < 5}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {revokeLoading ? 'Gravando Trilha WORM...' : 'Confirmar Revogação'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Cadastro */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                Cadastrar Novo Paciente
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleCreatePatient} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Nome Completo</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-teal-500"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">E-mail</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-teal-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Telefone / WhatsApp</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-teal-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">CPF</label>
                <input
                  type="text"
                  value={formData.cpf}
                  onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-teal-500 font-mono"
                  required
                />
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-start gap-3">
                <input
                  type="checkbox"
                  id="consentCheck"
                  checked={formData.consentTranscriptionSigned}
                  onChange={(e) => setFormData({ ...formData, consentTranscriptionSigned: e.target.checked })}
                  className="mt-0.5 rounded border-slate-300 dark:border-slate-700 text-teal-600 focus:ring-teal-500 cursor-pointer"
                />
                <label htmlFor="consentCheck" className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed cursor-pointer">
                  Termo de Consentimento Livre e Esclarecido (TCLE) assinado pelo paciente para transcrição assistida e telepsicologia (CFP 011/2018 & LGPD Art. 11).
                </label>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {createLoading ? 'Criptografando...' : 'Salvar com AES-256'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Anamnese Biopsicossocial (CFP nº 001/2009 & 004/2020) */}
      {showAnamnesisModal && searchResult && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-3xl w-full p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100 dark:border-slate-800 gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <ClipboardList className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                      Ficha de Admissão & Anamnese Biopsicossocial
                    </h3>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                      {currentAnamnesisRecord ? `Versão v${currentAnamnesisRecord.version}` : 'Nova Ficha (v1)'}
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20">
                      AES-256-GCM (FLE)
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Paciente: <strong className="text-slate-700 dark:text-slate-300">{searchResult.name}</strong> • Resoluções CFP nº 001/2009 e 004/2020
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAnamnesisModal(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            {anamnesisStatusMessage && (
              <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-900 dark:text-indigo-200 text-xs flex items-center gap-2.5 animate-fade-in">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                <span>{anamnesisStatusMessage}</span>
              </div>
            )}

            {anamnesisLoading ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 gap-2">
                <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs">Carregando e decifrando anamnese em RAM...</span>
              </div>
            ) : (
              <form onSubmit={handleSaveAnamnesis} className="space-y-4">
                {/* Abas de Navegação */}
                <div className="flex border-b border-slate-200 dark:border-slate-800 gap-1 overflow-x-auto pb-1 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setAnamnesisTab('complaint')}
                    className={`px-3 py-2 rounded-t-xl transition-all cursor-pointer whitespace-nowrap ${
                      anamnesisTab === 'complaint'
                        ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-b-2 border-indigo-600 font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    1. Queixa & Demanda
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnamnesisTab('biopsychosocial')}
                    className={`px-3 py-2 rounded-t-xl transition-all cursor-pointer whitespace-nowrap ${
                      anamnesisTab === 'biopsychosocial'
                        ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-b-2 border-indigo-600 font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    2. Histórico Biopsicossocial
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnamnesisTab('medical')}
                    className={`px-3 py-2 rounded-t-xl transition-all cursor-pointer whitespace-nowrap ${
                      anamnesisTab === 'medical'
                        ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-b-2 border-indigo-600 font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    3. Histórico Médico/Psiquiátrico
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnamnesisTab('goals')}
                    className={`px-3 py-2 rounded-t-xl transition-all cursor-pointer whitespace-nowrap ${
                      anamnesisTab === 'goals'
                        ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-b-2 border-indigo-600 font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    4. Metas & Emergência
                  </button>
                </div>

                {/* Conteúdo Aba 1: Queixa e Demanda */}
                {anamnesisTab === 'complaint' && (
                  <div className="space-y-4 animate-fade-in">
                    <div>
                      <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                        Queixa Principal (Demanda Expressa pelo Paciente) *
                      </label>
                      <textarea
                        rows={3}
                        required
                        value={anamnesisData.chiefComplaint}
                        onChange={(e) => setAnamnesisData({ ...anamnesisData, chiefComplaint: e.target.value })}
                        placeholder="Descreva o motivo principal da busca pelo atendimento psicológico..."
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                        Histórico da Demanda (Início, Frequência, Intensidade e Fatores Precipitantes) *
                      </label>
                      <textarea
                        rows={4}
                        required
                        value={anamnesisData.historyOfComplaint}
                        onChange={(e) => setAnamnesisData({ ...anamnesisData, historyOfComplaint: e.target.value })}
                        placeholder="Contexto de surgimento dos sintomas, evolução temporal e tentativas prévias de manejo..."
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                )}

                {/* Conteúdo Aba 2: Histórico Biopsicossocial */}
                {anamnesisTab === 'biopsychosocial' && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                          Desenvolvimento Biopsicossocial
                        </label>
                        <textarea
                          rows={3}
                          value={anamnesisData.biopsychosocialHistory.personalDevelopment || ''}
                          onChange={(e) => setAnamnesisData({
                            ...anamnesisData,
                            biopsychosocialHistory: {
                              ...anamnesisData.biopsychosocialHistory,
                              personalDevelopment: e.target.value
                            }
                          })}
                          placeholder="Marcos do desenvolvimento, infância, trajetória escolar e profissional..."
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                          Dinâmica Familiar e Vínculos
                        </label>
                        <textarea
                          rows={3}
                          value={anamnesisData.biopsychosocialHistory.familyDynamics || ''}
                          onChange={(e) => setAnamnesisData({
                            ...anamnesisData,
                            biopsychosocialHistory: {
                              ...anamnesisData.biopsychosocialHistory,
                              familyDynamics: e.target.value
                            }
                          })}
                          placeholder="Configuração familiar de origem e atual, padrões de apego e conflitos..."
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                          Rede de Apoio Social
                        </label>
                        <textarea
                          rows={3}
                          value={anamnesisData.biopsychosocialHistory.socialSupportNetwork || ''}
                          onChange={(e) => setAnamnesisData({
                            ...anamnesisData,
                            biopsychosocialHistory: {
                              ...anamnesisData.biopsychosocialHistory,
                              socialSupportNetwork: e.target.value
                            }
                          })}
                          placeholder="Amizades, comunidade, espiritualidade ou grupos de convivência..."
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                          Rotina, Sono & Alimentação
                        </label>
                        <textarea
                          rows={3}
                          value={anamnesisData.biopsychosocialHistory.routineSleepNutrition || ''}
                          onChange={(e) => setAnamnesisData({
                            ...anamnesisData,
                            biopsychosocialHistory: {
                              ...anamnesisData.biopsychosocialHistory,
                              routineSleepNutrition: e.target.value
                            }
                          })}
                          placeholder="Padrão de sono (horas, insônia), nutrição, lazer e atividade física..."
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Conteúdo Aba 3: Histórico Médico e Psiquiátrico */}
                {anamnesisTab === 'medical' && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                          Medicamentos em Uso
                        </label>
                        <textarea
                          rows={3}
                          value={anamnesisData.medicalAndPsychiatricHistory.currentMedications || ''}
                          onChange={(e) => setAnamnesisData({
                            ...anamnesisData,
                            medicalAndPsychiatricHistory: {
                              ...anamnesisData.medicalAndPsychiatricHistory,
                              currentMedications: e.target.value
                            }
                          })}
                          placeholder="Psicotrópicos, dosagens ou outras medicações contínuas..."
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                          Tratamentos Prévios
                        </label>
                        <textarea
                          rows={3}
                          value={anamnesisData.medicalAndPsychiatricHistory.previousTreatments || ''}
                          onChange={(e) => setAnamnesisData({
                            ...anamnesisData,
                            medicalAndPsychiatricHistory: {
                              ...anamnesisData.medicalAndPsychiatricHistory,
                              previousTreatments: e.target.value
                            }
                          })}
                          placeholder="Psicoterapias anteriores, consultas psiquiátricas ou internações..."
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                          Histórico Familiar de Saúde Mental
                        </label>
                        <textarea
                          rows={3}
                          value={anamnesisData.medicalAndPsychiatricHistory.familyPsychiatricHistory || ''}
                          onChange={(e) => setAnamnesisData({
                            ...anamnesisData,
                            medicalAndPsychiatricHistory: {
                              ...anamnesisData.medicalAndPsychiatricHistory,
                              familyPsychiatricHistory: e.target.value
                            }
                          })}
                          placeholder="Casos familiares de depressão, ansiedade, dependência química, etc..."
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                          Condições Clínicas / Alergias
                        </label>
                        <textarea
                          rows={3}
                          value={anamnesisData.medicalAndPsychiatricHistory.allergiesOrMedicalConditions || ''}
                          onChange={(e) => setAnamnesisData({
                            ...anamnesisData,
                            medicalAndPsychiatricHistory: {
                              ...anamnesisData.medicalAndPsychiatricHistory,
                              allergiesOrMedicalConditions: e.target.value
                            }
                          })}
                          placeholder="Doenças crônicas, cirurgias, alergias medicamentosas ou restrições..."
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Conteúdo Aba 4: Metas e Contato de Emergência */}
                {anamnesisTab === 'goals' && (
                  <div className="space-y-4 animate-fade-in">
                    <div>
                      <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                        Objetivos e Metas do Processo Terapêutico *
                      </label>
                      <textarea
                        rows={3}
                        required
                        value={anamnesisData.therapeuticGoals}
                        onChange={(e) => setAnamnesisData({ ...anamnesisData, therapeuticGoals: e.target.value })}
                        placeholder="Metas pactuadas com o paciente para o processo clínico..."
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                        <HeartPulse className="w-4 h-4 text-rose-500" />
                        Contato de Emergência (Em caso de crise ou urgência médica)
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                            Nome Completo
                          </label>
                          <input
                            type="text"
                            value={anamnesisData.emergencyContact?.name || ''}
                            onChange={(e) => setAnamnesisData({
                              ...anamnesisData,
                              emergencyContact: {
                                name: e.target.value,
                                relationship: anamnesisData.emergencyContact?.relationship || '',
                                phone: anamnesisData.emergencyContact?.phone || ''
                              }
                            })}
                            placeholder="Nome do contato..."
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                            Grau de Parentesco / Vínculo
                          </label>
                          <input
                            type="text"
                            value={anamnesisData.emergencyContact?.relationship || ''}
                            onChange={(e) => setAnamnesisData({
                              ...anamnesisData,
                              emergencyContact: {
                                name: anamnesisData.emergencyContact?.name || '',
                                relationship: e.target.value,
                                phone: anamnesisData.emergencyContact?.phone || ''
                              }
                            })}
                            placeholder="Ex: Cônjuge, Mãe, Irmão..."
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                            Telefone / WhatsApp
                          </label>
                          <input
                            type="tel"
                            value={anamnesisData.emergencyContact?.phone || ''}
                            onChange={(e) => setAnamnesisData({
                              ...anamnesisData,
                              emergencyContact: {
                                name: anamnesisData.emergencyContact?.name || '',
                                relationship: anamnesisData.emergencyContact?.relationship || '',
                                phone: e.target.value
                              }
                            })}
                            placeholder="Ex: 11987654321..."
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Footer do Modal */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-indigo-500" />
                    <span>
                      {currentAnamnesisRecord?.updatedAt 
                        ? `Última atualização: ${new Date(currentAnamnesisRecord.updatedAt).toLocaleString('pt-BR')}`
                        : 'Registro inicial pendente de gravação'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <button
                      type="button"
                      onClick={() => setShowAnamnesisModal(false)}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium cursor-pointer transition-colors"
                    >
                      Fechar
                    </button>
                    <button
                      type="submit"
                      disabled={anamnesisSaving || !anamnesisData.chiefComplaint.trim()}
                      className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {anamnesisSaving ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Gravando Cifrado (WORM)...
                        </>
                      ) : (
                        <>
                          <ClipboardList className="w-3.5 h-3.5" />
                          Salvar Ficha de Anamnese (v{currentAnamnesisRecord ? currentAnamnesisRecord.version + 1 : 1})
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
