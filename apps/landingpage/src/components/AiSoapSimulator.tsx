import React, { useState } from 'react';
import {
  Sparkles,
  Play,
  Pause,
  CheckCircle2,
  FileCheck,
  Edit3,
  Lock,
  ShieldAlert,
  Info,
  Activity,
  Award
} from 'lucide-react';
import { THERAPY_CASES, type TherapyCase } from '../data/rfcData';

export const AiSoapSimulator: React.FC = () => {
  const [selectedCaseId, setSelectedCaseId] = useState<string>('case-1');
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processStep, setProcessStep] = useState<number>(0);
  const [isSigned, setIsSigned] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'soap' | 'private'>('soap');

  const currentCase = THERAPY_CASES.find((c) => c.id === selectedCaseId) || THERAPY_CASES[0];

  // Editable SOAP state
  const [soapData, setSoapData] = useState({
    subjective: currentCase.soap.subjective,
    objective: currentCase.soap.objective,
    assessment: currentCase.soap.assessment,
    plan: currentCase.soap.plan,
    privateNotes: currentCase.privateNotes
  });

  const handleSelectCase = (caseItem: TherapyCase) => {
    setSelectedCaseId(caseItem.id);
    setIsSigned(false);
    setIsPlayingAudio(false);
    setSoapData({
      subjective: caseItem.soap.subjective,
      objective: caseItem.soap.objective,
      assessment: caseItem.soap.assessment,
      plan: caseItem.soap.plan,
      privateNotes: caseItem.privateNotes
    });
  };

  const handleRunAi = () => {
    setIsProcessing(true);
    setProcessStep(1);
    setIsSigned(false);

    setTimeout(() => setProcessStep(2), 700);
    setTimeout(() => setProcessStep(3), 1400);
    setTimeout(() => {
      setProcessStep(4);
      setIsProcessing(false);
    }, 2100);
  };

  return (
    <section id="simulador-ia" className="py-24 bg-slate-900 text-white relative overflow-hidden">
      {/* Decorative gradient backdrops */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-10 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-950/80 border border-teal-500/30 text-teal-400 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Módulo 3 • Pipeline de Transcrição & Diarização Clínica</span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white">
            Experimente a IA Clínica em Ação
          </h2>

          <p className="text-slate-400 text-base sm:text-lg">
            Veja como a plataforma captura a sessão do Google Meet, separa as vozes com diarização e gera um rascunho SOAP rigoroso para sua validação humana imediata.
          </p>
        </div>

        {/* Case Selector Pills */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-2">
            Escolha um Caso Clínico:
          </span>
          {THERAPY_CASES.map((item) => (
            <button
              key={item.id}
              onClick={() => handleSelectCase(item)}
              className={`flex items-center gap-2.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                selectedCaseId === item.id
                  ? 'bg-teal-500 text-slate-950 shadow-lg shadow-teal-500/20 ring-2 ring-teal-400'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700/80 border border-slate-700'
              }`}
            >
              <img
                src={item.avatar}
                alt={item.name}
                className="w-6 h-6 rounded-full object-cover"
              />
              <span>{item.name}</span>
              <span className="text-xs opacity-75 hidden sm:inline">({item.approach})</span>
            </button>
          ))}
        </div>

        {/* Interactive Workspace Grid */}
        <div className="mt-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column (5 cols): Audio Diarization & Transcript */}
          <div className="lg:col-span-5 bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 sm:p-6 backdrop-blur-sm space-y-5">
            
            {/* Case Info Bar */}
            <div className="flex items-center justify-between border-b border-slate-700 pb-4">
              <div className="flex items-center gap-3">
                <img
                  src={currentCase.avatar}
                  alt={currentCase.name}
                  className="w-12 h-12 rounded-xl object-cover ring-1 ring-slate-600"
                />
                <div>
                  <h3 className="font-bold text-white text-base leading-tight">
                    {currentCase.name}
                  </h3>
                  <p className="text-xs text-teal-400 font-medium">{currentCase.approach}</p>
                  <p className="text-[11px] text-slate-400">
                    Sessão #{currentCase.sessionNumber} • {currentCase.duration} • {currentCase.date}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                  <Lock className="w-3 h-3" />
                  Consentimento Ativo
                </span>
              </div>
            </div>

            {/* Audio Waveform Player Simulation */}
            <div className="bg-slate-900/90 rounded-xl p-4 border border-slate-700/60 space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                    className="w-8 h-8 rounded-full bg-teal-500 text-slate-950 flex items-center justify-center hover:bg-teal-400 transition-colors cursor-pointer"
                  >
                    {isPlayingAudio ? (
                      <Pause className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4 ml-0.5" />
                    )}
                  </button>
                  <span className="font-mono text-slate-300">
                    {isPlayingAudio ? '01:24 / 50:00' : '00:00 / 50:00'}
                  </span>
                </div>
                <span className="text-[11px] text-teal-400 flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${isPlayingAudio ? 'bg-emerald-400 animate-ping' : 'bg-slate-600'}`}></span>
                  Google Meet Audio Stream
                </span>
              </div>

              {/* Animated Waveform Bars */}
              <div className="h-10 flex items-center justify-between gap-1 px-1">
                {[40, 65, 30, 85, 95, 45, 20, 70, 80, 50, 90, 60, 35, 75, 88, 40, 60, 95, 30, 70, 50, 85, 40, 90, 30, 60, 45].map((h, i) => (
                  <div
                    key={i}
                    className={`w-1 rounded-full transition-all duration-300 ${
                      isPlayingAudio
                        ? 'bg-gradient-to-t from-teal-500 to-emerald-300'
                        : 'bg-slate-700'
                    }`}
                    style={{
                      height: isPlayingAudio ? `${Math.max(15, (h * ((i % 3) + 1)) % 100)}%` : `${h * 0.4}%`
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Diarized Transcript Stream */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-teal-400" />
                  Transcrição com Diarização de Voz
                </h4>
                <span className="text-[10px] text-slate-400 font-mono">TLS 1.3 • AES-256</span>
              </div>

              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1 text-xs">
                {currentCase.transcript.map((item, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl border ${
                      item.speaker === 'TERAPEUTA'
                        ? 'bg-teal-950/40 border-teal-800/40 text-teal-100'
                        : 'bg-slate-900/60 border-slate-700/50 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${
                          item.speaker === 'TERAPEUTA'
                            ? 'bg-teal-800 text-teal-200'
                            : 'bg-indigo-900 text-indigo-200'
                        }`}
                      >
                        {item.speaker === 'TERAPEUTA' ? 'DRA. VANESSA (TERAPEUTA)' : 'PACIENTE'}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">{item.time}</span>
                    </div>
                    <p className="leading-relaxed text-[12px] opacity-90">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Run AI Button */}
            <button
              onClick={handleRunAi}
              disabled={isProcessing}
              className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg ${
                isProcessing
                  ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-teal-500 to-emerald-400 hover:from-teal-400 hover:to-emerald-300 text-slate-950 shadow-teal-500/20 hover:scale-[1.01]'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>{isProcessing ? 'Processando com IA Clínica...' : 'Re-analisar e Gerar SOAP com IA'}</span>
            </button>

            {/* Stepper info during processing */}
            {isProcessing && (
              <div className="bg-slate-950/80 rounded-xl p-3 border border-slate-800 space-y-1.5 text-xs text-slate-300">
                <div className={`flex items-center gap-2 ${processStep >= 1 ? 'text-teal-400' : 'text-slate-500'}`}>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>1. Validando termo de consentimento LGPD Art. 11</span>
                </div>
                <div className={`flex items-center gap-2 ${processStep >= 2 ? 'text-teal-400' : 'text-slate-500'}`}>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>2. Diarização e Criptografia com DEK única (AES-256)</span>
                </div>
                <div className={`flex items-center gap-2 ${processStep >= 3 ? 'text-teal-400' : 'text-slate-500'}`}>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>3. Extração dos eixos SOAP via Vertex AI (Zero Data Retention)</span>
                </div>
                <div className={`flex items-center gap-2 ${processStep >= 4 ? 'text-teal-400' : 'text-slate-500'}`}>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>4. Rascunho formatado pronto para revisão do terapeuta</span>
                </div>
              </div>
            )}

          </div>

          {/* Right Column (7 cols): Generated SOAP Note & Human-in-the-Loop Review */}
          <div className="lg:col-span-7 bg-slate-800/90 border border-slate-700 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
            
            {/* Tabs & Human in the Loop Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700 pb-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab('soap')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    activeTab === 'soap'
                      ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Evolução SOAP (Prontuário)
                </button>
                <button
                  onClick={() => setActiveTab('private')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    activeTab === 'private'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Notas Privadas (§3.4)
                </button>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-teal-400 bg-teal-950/80 px-2.5 py-1 rounded-md border border-teal-800/80">
                <ShieldAlert className="w-3.5 h-3.5 text-teal-400" />
                <span className="font-semibold">Human-in-the-Loop Obrigatório</span>
              </div>
            </div>

            {/* Tab: SOAP Notes */}
            {activeTab === 'soap' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Edite livremente antes de assinar. A IA nunca assina pelo psicólogo.</span>
                  <span className="flex items-center gap-1 text-slate-300 font-mono text-[11px]">
                    <Edit3 className="w-3 h-3 text-teal-400" />
                    Campos Editáveis
                  </span>
                </div>

                {/* S - Subjetivo */}
                <div className="bg-slate-900/80 border border-slate-700/80 rounded-xl p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-teal-400 uppercase tracking-wider">
                      S — Subjetivo (Relato e Sentimentos do Paciente)
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">CFP Res. 001/2009</span>
                  </div>
                  <textarea
                    rows={3}
                    value={soapData.subjective}
                    onChange={(e) => setSoapData({ ...soapData, subjective: e.target.value })}
                    className="w-full bg-transparent text-slate-200 text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-teal-500 rounded p-1 resize-y"
                  />
                </div>

                {/* O - Objetivo */}
                <div className="bg-slate-900/80 border border-slate-700/80 rounded-xl p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-indigo-400 uppercase tracking-wider">
                      O — Objetivo (Observações Comportamentais & Afeto)
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">Linguagem Descritiva</span>
                  </div>
                  <textarea
                    rows={2}
                    value={soapData.objective}
                    onChange={(e) => setSoapData({ ...soapData, objective: e.target.value })}
                    className="w-full bg-transparent text-slate-200 text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded p-1 resize-y"
                  />
                </div>

                {/* A - Avaliação */}
                <div className="bg-slate-900/80 border border-slate-700/80 rounded-xl p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-amber-400 uppercase tracking-wider">
                      A — Avaliação (Hipóteses Clínicas & Evolução Teórica)
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">{currentCase.approach}</span>
                  </div>
                  <textarea
                    rows={2}
                    value={soapData.assessment}
                    onChange={(e) => setSoapData({ ...soapData, assessment: e.target.value })}
                    className="w-full bg-transparent text-slate-200 text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-amber-500 rounded p-1 resize-y"
                  />
                </div>

                {/* P - Plano */}
                <div className="bg-slate-900/80 border border-slate-700/80 rounded-xl p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-emerald-400 uppercase tracking-wider">
                      P — Plano (Intervenções & Tarefas para a Próxima Sessão)
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">Encaminhamentos</span>
                  </div>
                  <textarea
                    rows={2}
                    value={soapData.plan}
                    onChange={(e) => setSoapData({ ...soapData, plan: e.target.value })}
                    className="w-full bg-transparent text-slate-200 text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-emerald-500 rounded p-1 resize-y"
                  />
                </div>
              </div>
            )}

            {/* Tab: Private Notes (§3.4) */}
            {activeTab === 'private' && (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/50 text-xs text-amber-200 space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    Segregação Legal: Anotações Reflexivas do Terapeuta (§3.4)
                  </p>
                  <p className="text-amber-300/80">
                    Estas anotações <strong>NÃO integram o prontuário oficial</strong>. O paciente tem direito legal de acesso ao prontuário (SOAP), mas suas hipóteses íntimas e impressões reflexivas permanecem estritamente no seu cofre pessoal.
                  </p>
                </div>

                <div className="bg-slate-900/90 border border-slate-700 rounded-xl p-4 space-y-2">
                  <label className="text-xs font-bold text-slate-300">
                    Anotações Reflexivas Privadas:
                  </label>
                  <textarea
                    rows={6}
                    value={soapData.privateNotes}
                    onChange={(e) => setSoapData({ ...soapData, privateNotes: e.target.value })}
                    className="w-full bg-slate-950 text-slate-200 text-xs p-3 rounded-lg border border-slate-800 focus:outline-none focus:border-amber-500 leading-relaxed"
                  />
                </div>
              </div>
            )}

            {/* Signature & Seal Footer */}
            <div className="pt-4 border-t border-slate-700/80 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-slate-400">
                {isSigned ? (
                  <div className="space-y-0.5">
                    <p className="text-emerald-400 font-bold flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-emerald-400" />
                      Prontuário Imutável Selado com Certificado ICP-Brasil
                    </p>
                    <p className="text-[11px] text-slate-400 font-mono">
                      SHA256: 7f8a9b22...c41e • Timestamp: {new Date().toLocaleTimeString()} • CRP 06/142980
                    </p>
                  </div>
                ) : (
                  <p className="flex items-center gap-1 text-[11px]">
                    <Info className="w-3.5 h-3.5 text-slate-400" />
                    Ao selar, o registro torna-se somente-leitura (append-only) com guarda de 5 anos.
                  </p>
                )}
              </div>

              {!isSigned ? (
                <button
                  onClick={() => setIsSigned(true)}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-teal-500/20"
                >
                  <FileCheck className="w-4 h-4" />
                  <span>Aprovar & Assinar Prontuário</span>
                </button>
              ) : (
                <button
                  onClick={() => setIsSigned(false)}
                  className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 text-[11px] underline cursor-pointer"
                >
                  Simular nova edição
                </button>
              )}
            </div>

          </div>

        </div>

      </div>
    </section>
  );
};
