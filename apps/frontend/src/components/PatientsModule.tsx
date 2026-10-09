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
  FileCheck2
} from 'lucide-react';
import type { DecryptedPatient, CreatePatientDTO } from '@terapiainfoco/shared';
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-teal-400" />
            Gestão de Pacientes & Blind Indexing
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Cadastro com Field-Level Encryption (AES-256-GCM) e busca por HMAC-SHA256 (RFC §4.1, §4.3)
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold flex items-center gap-2 shadow-lg shadow-teal-500/20 transition-all self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          Cadastrar Paciente
        </button>
      </div>

      {statusMessage && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Explicação Didática da Criptografia */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-900/60 border border-slate-800 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center shrink-0">
          <Lock className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-white">Como Funciona a Busca Segura (Blind Index)</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            O CPF nunca é armazenado ou buscado em texto claro no PostgreSQL. Quando você busca por CPF, a aplicação gera um hash criptográfico <code className="text-teal-300 font-mono">HMAC-SHA256(cpf, salt_secret)</code> e busca o índice cego correspondente.
          </p>
        </div>
      </div>

      {/* Caixa de Busca por CPF */}
      <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-teal-400" />
          Localizar Paciente via Blind Index
        </h2>

        <form onSubmit={handleSearch} className="flex gap-3 max-w-xl">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Digite o CPF (ex: 123.456.789-00)..."
              value={searchCpf}
              onChange={(e) => setSearchCpf(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-teal-500 font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={searchLoading}
            className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {searchLoading ? 'Buscando...' : 'Pesquisar'}
          </button>
        </form>

        {searchError && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2 max-w-xl">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{searchError}</span>
          </div>
        )}

        {/* Resultado Encontrado */}
        {searchResult && (
          <div className="mt-4 p-5 rounded-2xl bg-slate-950 border border-teal-500/30 space-y-4 max-w-2xl animate-fade-in">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-widest text-teal-400 bg-teal-500/10 border border-teal-500/20 px-2 py-0.5 rounded-full">
                  Blind Index Match • Decriptado em RAM
                </span>
                <h3 className="text-lg font-bold text-white mt-1.5">{searchResult.name}</h3>
                <p className="text-xs text-slate-400">ID: {searchResult.id}</p>
              </div>

              {searchResult.consentTranscriptionSigned && (
                <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full font-medium">
                  <FileCheck2 className="w-3.5 h-3.5" />
                  Consentimento Ativo
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
              <div>
                <span className="text-slate-500">E-mail:</span>
                <p className="font-mono text-slate-200 mt-0.5">{searchResult.email}</p>
              </div>
              <div>
                <span className="text-slate-500">Telefone:</span>
                <p className="font-mono text-slate-200 mt-0.5">{searchResult.phone}</p>
              </div>
              <div>
                <span className="text-slate-500">CPF:</span>
                <p className="font-mono text-slate-200 mt-0.5">{searchResult.cpf || 'Não informado'}</p>
              </div>
              <div>
                <span className="text-slate-500">Hash Blind Index:</span>
                <p className="font-mono text-teal-400/80 truncate mt-0.5">{searchResult.cpfBindex || searchResult.emailBindex}</p>
              </div>
            </div>

            {/* Ações de Conformidade LGPD */}
            <div className="pt-2 flex justify-end">
              <button
                onClick={() => handleQuarantine(searchResult.id)}
                className="px-3.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                Quarentena LGPD Art. 18 (Retenção 5 Anos CFP)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Cadastro */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-teal-400" />
                Cadastrar Novo Paciente
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreatePatient} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nome Completo</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">E-mail</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Telefone / WhatsApp</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">CPF</label>
                <input
                  type="text"
                  value={formData.cpf}
                  onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-teal-500 font-mono"
                  required
                />
              </div>

              <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700 flex items-start gap-3">
                <input
                  type="checkbox"
                  id="consentCheck"
                  checked={formData.consentTranscriptionSigned}
                  onChange={(e) => setFormData({ ...formData, consentTranscriptionSigned: e.target.checked })}
                  className="mt-0.5 rounded border-slate-700 text-teal-600 focus:ring-teal-500"
                />
                <label htmlFor="consentCheck" className="text-xs text-slate-300 leading-relaxed cursor-pointer">
                  Termo de Consentimento Livre e Esclarecido (TCLE) assinado pelo paciente para transcrição assistida e telepsicologia (CFP 011/2018 & LGPD Art. 11).
                </label>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {createLoading ? 'Criptografando...' : 'Salvar com AES-256'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
