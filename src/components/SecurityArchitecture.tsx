import React, { useState } from 'react';
import {
  Lock,
  EyeOff,
  Eye,
  FileKey,
  AlertTriangle,
  CheckCircle,
  Hash,
  Terminal,
  Cpu
} from 'lucide-react';
import { SECURITY_ARCHITECTURE_STEPS } from '../data/rfcData';

export const SecurityArchitecture: React.FC = () => {
  const [viewMode, setViewMode] = useState<'hacker' | 'therapist'>('hacker');
  const [sampleCpf, setSampleCpf] = useState('123.456.789-00');

  // Simple simulated HMAC hash for interactive display
  const simulatedHash = 'a4f91b7e6d2c88019fe53bb2' + sampleCpf.replace(/\D/g, '').padEnd(16, '0');

  return (
    <section id="seguranca" className="py-24 bg-slate-950 text-white relative overflow-hidden">
      {/* Glow backgrounds */}
      <div className="absolute top-1/2 left-0 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
            <Lock className="w-3.5 h-3.5" />
            <span>Seção 4 do RFC-001 • Criptografia LGPD & Zero-Trust</span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white">
            Nem Nós Conseguimos Ler as Sessões dos Seus Pacientes
          </h2>

          <p className="text-slate-400 text-base sm:text-lg">
            Adotamos <strong>Envelope Encryption (AES-256-GCM)</strong> com chaves custodiadas em Hardware Security Module (HSM). Em caso de invasão ou vazamento de banco de dados, o invasor encontra apenas lixo ilegível.
          </p>
        </div>

        {/* 5 Architecture Steps Pills */}
        <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {SECURITY_ARCHITECTURE_STEPS.map((step, idx) => (
            <div
              key={idx}
              className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4.5 space-y-2 relative group hover:border-teal-500/50 transition-colors"
            >
              <div className="flex items-center justify-between text-[11px] font-mono text-teal-400">
                <span>{step.step}</span>
                <Cpu className="w-3.5 h-3.5 text-slate-500 group-hover:text-teal-400 transition-colors" />
              </div>
              <h3 className="text-sm font-bold text-white leading-tight">
                {step.title}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {step.desc}
              </p>
              <div className="pt-1">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                  {step.sub}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Interactive Comparison Sandbox: Invasor vs Psicólogo */}
        <div className="mt-14 bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl space-y-8">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
            <div>
              <h4 className="text-xl font-bold text-white flex items-center gap-2">
                <Terminal className="w-5 h-5 text-teal-400" />
                Simulador de Segurança em Repouso
              </h4>
              <p className="text-xs sm:text-sm text-slate-400">
                Alterne entre as perspectivas para entender o poder do Field-Level Encryption e Envelope Encryption.
              </p>
            </div>

            {/* Toggle Switch */}
            <div className="flex items-center bg-slate-950 p-1.5 rounded-xl border border-slate-800 shrink-0">
              <button
                onClick={() => setViewMode('hacker')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'hacker'
                    ? 'bg-red-500/20 text-red-300 border border-red-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <EyeOff className="w-4 h-4 text-red-400" />
                <span>Visão do Invasor / DBA do Banco</span>
              </button>

              <button
                onClick={() => setViewMode('therapist')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'therapist'
                    ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Eye className="w-4 h-4 text-teal-400" />
                <span>Visão do Terapeuta Autenticado</span>
              </button>
            </div>
          </div>

          {/* Perspective Content */}
          {viewMode === 'hacker' ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold text-red-400 bg-red-950/40 border border-red-800/50 p-3 rounded-xl">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  O que um invasor com acesso root ao servidor ou dump SQL do PostgreSQL encontra:
                </span>
              </div>

              <div className="bg-slate-950 rounded-2xl p-5 border border-slate-800 font-mono text-xs space-y-3 overflow-x-auto text-slate-400">
                <div className="text-slate-500">// TABELA: patients (Dados PII com Field-Level Encryption)</div>
                <div className="text-red-400">
                  id: "8b22ca06-6a89-4d96-827a-915843371531"
                  <br />
                  therapist_id: "e4a10f92-5cb0-4288-91df-7b56a12b84cd"
                  <br />
                  <span className="text-yellow-400">encrypted_name:</span> \x7a99b41c0e3a9d8f7e6b5a4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e
                  <br />
                  <span className="text-yellow-400">encrypted_cpf:</span> \xd4e3a2b1c0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1
                  <br />
                  <span className="text-blue-400">cpf_bindex (HMAC):</span> "98b7c4d1e2f0a3b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1"
                </div>

                <div className="pt-2 text-slate-500">// TABELA: clinical_records (Notas SOAP com Envelope Encryption AES-256-GCM)</div>
                <div className="text-red-400">
                  appointment_id: "3a88c11e-9821-4ba2-b2a8-8e6d015c9284"
                  <br />
                  <span className="text-yellow-400">encrypted_soap_subjective:</span> \x0e88a9bf47120de9a84bce12740928ff819c47... [BYTEA ILEGÍVEL]
                  <br />
                  <span className="text-yellow-400">encrypted_soap_assessment:</span> \x44ca9812e9b049fa8172bc948a7b11d8820f12... [BYTEA ILEGÍVEL]
                  <br />
                  <span className="text-purple-400">encrypted_dek (KMS Wrapped):</span> \x99887766554433221100aabbccddeeff...
                  <br />
                  <span className="text-emerald-400">auth_tag_gcm:</span> \x3a2b1c4d5e6f7a8b
                </div>
              </div>

              <p className="text-xs text-slate-400">
                🛡️ Sem acesso à chave KEK custodiada no Hardware Security Module (KMS com MFA), os dados são matematicamente impossíveis de decodificar por força bruta.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold text-teal-400 bg-teal-950/40 border border-teal-800/50 p-3 rounded-xl">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>
                  O que o psicólogo autenticado com token JWT + MFA e DEK em memória volátil visualiza:
                </span>
              </div>

              <div className="bg-slate-950 rounded-2xl p-5 border border-slate-800 text-xs space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-3 border-b border-slate-800">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Paciente Decriptado:</span>
                    <span className="text-white font-bold text-sm">Mariana Silva de Oliveira</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">CPF:</span>
                    <span className="text-white font-mono">***.482.918-** (Decriptado em RAM)</span>
                  </div>
                </div>

                <div className="space-y-2 text-slate-300">
                  <span className="text-teal-400 font-bold block text-xs">
                    Subjetivo (SOAP) Decriptado via AES-256-GCM:
                  </span>
                  <p className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 text-slate-200 leading-relaxed text-xs">
                    "Paciente relata melhora na modulação de crises de ansiedade após uso da respiração diafragmática durante situação ansiogênica corporativa..."
                  </p>
                </div>
              </div>

              <p className="text-xs text-teal-400">
                ✨ A decriptação ocorre exclusivamente na memória volátil da sessão ativa e é descartada (secure wipe) após o término da requisição.
              </p>
            </div>
          )}

          {/* Interactive Blind Index Demo */}
          <div className="pt-6 border-t border-slate-800">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              <div className="lg:col-span-5 space-y-2">
                <h5 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <Hash className="w-4 h-4 text-teal-400" />
                  Blind Indexing: Pesquise sem Expor
                </h5>
                <p className="text-xs text-slate-400">
                  Como buscar um paciente por CPF sem deixar o CPF legível no banco de dados? Usamos HMAC-SHA256 com sal secreto:
                </p>
                <div className="pt-2">
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                    Digite um CPF de Teste:
                  </label>
                  <input
                    type="text"
                    value={sampleCpf}
                    onChange={(e) => setSampleCpf(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-teal-500"
                    placeholder="000.000.000-00"
                  />
                </div>
              </div>

              <div className="lg:col-span-7 bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 font-mono text-xs">
                <span className="text-slate-500 text-[11px]">
                  // Blind Index gerado instantaneamente no banco:
                </span>
                <div className="bg-slate-900 p-2.5 rounded border border-slate-800 text-teal-300 break-all text-[11px]">
                  {simulatedHash}
                </div>
                <p className="text-[11px] text-slate-400 font-sans">
                  A consulta SQL faz <code className="text-teal-400">WHERE cpf_bindex = hash</code>. O invasor vê o hash, mas não consegue reverter para o CPF original do paciente.
                </p>
              </div>
            </div>
          </div>

          {/* CFP 5-Year Legal Retention vs LGPD Art. 18 */}
          <div className="pt-6 border-t border-slate-800 bg-slate-950/60 p-5 rounded-2xl border border-slate-800/80">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h5 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
                  <FileKey className="w-4 h-4" />
                  Harmonização Jurídica: LGPD Art. 16 vs. Resolução CFP nº 001/2009
                </h5>
                <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
                  Se o paciente pedir exclusão total de dados (Direito ao Esquecimento - LGPD Art. 18), a lei ressalva o cumprimento de obrigação legal médica. O TerapiaInFoco anonimiza o cadastro ativo e tranca o prontuário em <strong>cofre criptográfico de quarentena por 5 anos</strong>, protegendo o psicólogo contra processos éticos no Conselho.
                </p>
              </div>
              <span className="px-3 py-1.5 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-800 text-xs font-bold shrink-0">
                100% Blindado
              </span>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
};
