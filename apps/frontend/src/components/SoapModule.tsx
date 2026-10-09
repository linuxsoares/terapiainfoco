import { useState } from 'react';
import { 
  Sparkles, 
  FileSignature, 
  Lock, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  Eye, 
  EyeOff
} from 'lucide-react';
import type { SoapNote } from '@terapiainfoco/shared';
import { api } from '../services/api';

export function SoapModule() {
  const [recordId, setRecordId] = useState<string | null>(null);
  const [soap, setSoap] = useState<SoapNote>({
    subjective: 'Paciente relata melhora na modulação de crises de ansiedade após uso da respiração diafragmática durante situação corporativa. Identificou pensamentos automáticos disfuncionais ("vão perceber que não dou conta") e aplicou com êxito a reestruturação cognitiva. Insônia inicial apresentou redução estimada de 40%.',
    objective: 'Apresenta-se orientada globalmente, afeto congruente com o relato, discurso fluente e com boa capacidade reflexiva e insight. Postura corporal relaxada ao longo da videoconferência, com bom engajamento nas intervenções.',
    assessment: 'Evolução favorável do quadro de Ansiedade com aumento consistente da autoeficácia e adesão às técnicas comportamentais e cognitivas da TCC. Boa resposta na redução da resposta simpática em contexto ocupacional.',
    plan: '1. Manter registro no diário de pensamentos disfuncionais (RPD). 2. Implementar higiene do sono estruturada. 3. Próxima sessão focará na flexibilização de crenças intermediárias sobre perfeccionismo.'
  });
  const [privateNotes, setPrivateNotes] = useState('A paciente demonstra necessidade de validação de figuras de autoridade. Explorar na próxima sessão as experiências infantis com exigências paternas.');
  const [showPrivateNotes, setShowPrivateNotes] = useState(false);

  // Human-in-the-Loop & Assinatura
  const [confirmedReview, setConfirmedReview] = useState(false);
  const [isSigned, setIsSigned] = useState(false);
  const [signatureHash, setSignatureHash] = useState<string | null>(null);
  const [signedAt, setSignedAt] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSaveDraft = async () => {
    try {
      setLoading(true);
      setError(null);
      const record = await api.saveSoapDraft({
        appointmentId: '00000000-0000-0000-0000-000000000010',
        patientId: '00000000-0000-0000-0000-000000000002',
        sessionNumber: 8,
        soap,
        privateNotes
      });
      setRecordId(record.id);
      setSuccessMsg('Rascunho de nota SOAP salvo com sucesso na base encriptada.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignRecord = async () => {
    if (!recordId) {
      setError('Salve o rascunho antes de assinar o prontuário.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const signedRecord = await api.signClinicalRecord(recordId, confirmedReview);
      setIsSigned(true);
      setSignatureHash(signedRecord.signatureHash || 'sha256-hash-selado');
      setSignedAt(new Date().toLocaleString('pt-BR'));
      setSuccessMsg('Prontuário assinado e selado com sucesso! Registro agora é imutável (CFP nº 001/2009).');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            Módulo 3 & 4: Transcrição, SOAP & Prontuário Imutável
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Evolução assistida por IA nos 4 eixos clínicos com Human-in-the-Loop compulsório (RFC §3.3, §3.4)
          </p>
        </div>

        {isSigned && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
            <Lock className="w-4 h-4" />
            Prontuário Imutável Selado
          </div>
        )}
      </div>

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

      {/* Selo Imutável se assinado */}
      {isSigned && signatureHash && (
        <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-50 to-slate-50 dark:from-emerald-950/40 dark:to-slate-900 border border-emerald-500/30 shadow-sm dark:shadow-none space-y-2">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-sm font-semibold">
            <ShieldCheck className="w-5 h-5" />
            Certificado de Imutabilidade Documental (Resolução CFP nº 001/2009)
          </div>
          <p className="text-xs text-slate-700 dark:text-slate-300">
            Assinado digitalmente por <strong className="text-slate-900 dark:text-white">Dra. Vanessa Andrade (CRP 06/142980)</strong> em {signedAt}.
          </p>
          <div className="font-mono text-[11px] text-emerald-800 dark:text-emerald-300/80 bg-emerald-100/60 dark:bg-slate-950 p-2.5 rounded-xl border border-emerald-500/20 break-all">
            SHA-256 Hash: {signatureHash}
          </div>
        </div>
      )}

      {/* Campos SOAP */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* S - Subjetivo */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
              S • Subjetivo
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Relato do Paciente</span>
          </div>
          <textarea
            rows={4}
            disabled={isSigned}
            value={soap.subjective}
            onChange={(e) => setSoap({ ...soap, subjective: e.target.value })}
            className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl p-3 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-teal-500 disabled:opacity-75 resize-none leading-relaxed"
          />
        </div>

        {/* O - Objetivo */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400">
              O • Objetivo
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Observações Clínicas & Afeto</span>
          </div>
          <textarea
            rows={4}
            disabled={isSigned}
            value={soap.objective}
            onChange={(e) => setSoap({ ...soap, objective: e.target.value })}
            className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl p-3 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-teal-500 disabled:opacity-75 resize-none leading-relaxed"
          />
        </div>

        {/* A - Avaliação */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400">
              A • Avaliação
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Hipótese Clínica & Evolução</span>
          </div>
          <textarea
            rows={4}
            disabled={isSigned}
            value={soap.assessment}
            onChange={(e) => setSoap({ ...soap, assessment: e.target.value })}
            className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl p-3 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-teal-500 disabled:opacity-75 resize-none leading-relaxed"
          />
        </div>

        {/* P - Plano */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              P • Plano
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Intervenções & Próxima Sessão</span>
          </div>
          <textarea
            rows={4}
            disabled={isSigned}
            value={soap.plan}
            onChange={(e) => setSoap({ ...soap, plan: e.target.value })}
            className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl p-3 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-teal-500 disabled:opacity-75 resize-none leading-relaxed"
          />
        </div>
      </div>

      {/* Notas Reflexivas Privadas Segregadas (§3.4) */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
              Anotações Confidenciais do Terapeuta (§3.4)
            </span>
            <span className="text-[10px] bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20 px-2 py-0.5 rounded-full">
              Segregação Legal • Não integra prontuário do paciente
            </span>
          </div>

          <button
            onClick={() => setShowPrivateNotes(!showPrivateNotes)}
            className="text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white flex items-center gap-1.5 cursor-pointer"
          >
            {showPrivateNotes ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {showPrivateNotes ? 'Ocultar' : 'Exibir'}
          </button>
        </div>

        {showPrivateNotes && (
          <textarea
            rows={2}
            disabled={isSigned}
            value={privateNotes}
            onChange={(e) => setPrivateNotes(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-slate-300 focus:outline-none focus:border-amber-400 resize-none font-mono"
            placeholder="Anotações reflexivas íntimas do psicólogo..."
          />
        )}
      </div>

      {/* Human-in-the-Loop & Ações de Assinatura */}
      {!isSigned && (
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none space-y-4">
          <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-start gap-3">
            <input
              type="checkbox"
              id="humanLoopCheck"
              checked={confirmedReview}
              onChange={(e) => setConfirmedReview(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 dark:border-slate-700 text-purple-600 focus:ring-purple-500 cursor-pointer"
            />
            <label htmlFor="humanLoopCheck" className="text-xs text-purple-900 dark:text-purple-200 leading-relaxed cursor-pointer font-medium">
              <strong>Human-in-the-Loop Obrigatório (RFC §3.3):</strong> Eu, psicólogo(a) responsável, revisei e editei integralmente o rascunho estruturado acima, atestando sua fidelidade com o atendimento e assumindo a responsabilidade técnica perante o CFP.
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <button
              onClick={handleSaveDraft}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Salvando...' : 'Salvar Rascunho SOAP'}
            </button>

            <button
              onClick={handleSignRecord}
              disabled={loading || !confirmedReview}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <FileSignature className="w-4 h-4" />
              Assinar & Selar Prontuário Imutável (SHA-256)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
