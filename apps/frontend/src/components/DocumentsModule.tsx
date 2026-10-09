import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  FileCheck2, 
  Plus, 
  Printer, 
  QrCode, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  Lock, 
  RefreshCw, 
  Sparkles 
} from 'lucide-react';
import QRCode from 'qrcode';
import { 
  DocumentType, 
  type DecryptedPsychologicalDocument, 
  type ValidateDocumentResponse 
} from '@terapiainfoco/shared';
import { api } from '../services/api';

const CFP_TEMPLATES: Record<DocumentType, { title: string; defaultContent: string }> = {
  [DocumentType.DECLARACAO]: {
    title: 'Declaração de Comparecimento a Acompanhamento Psicológico',
    defaultContent: `Declaro, para os devidos fins a pedido da pessoa interessada, que Mariana Silva de Oliveira, inscrita no CPF sob nº 123.456.789-00, realiza atendimento psicoterápico sob minha responsabilidade profissional às sextas-feiras, com início às 14:00 e término às 14:50 horas.

Por ser a expressão da verdade e em conformidade com o Artigo 11 da Resolução CFP nº 006/2019, firmo a presente.`
  },
  [DocumentType.ATESTADO]: {
    title: 'Atestado Psicológico',
    defaultContent: `Atesto, para os devidos fins de justificativa e adequação laboral, a pedido da paciente, que Mariana Silva de Oliveira, inscrita no CPF sob nº 123.456.789-00, encontra-se em acompanhamento psicológico regular por motivo de transtorno adaptativo associado a estresse agudo ocupacional.

Com base em avaliação psicológica clínica estruturada, recomendo o afastamento das atividades laborais por um período de 03 (três) dias, a contar desta data, para estabilização do quadro e manejo terapêutico.

Documento emitido em estrito cumprimento dos Artigos 9º a 13 da Resolução CFP nº 006/2019.`
  },
  [DocumentType.RELATORIO]: {
    title: 'Relatório Psicológico Clínico',
    defaultContent: `1. IDENTIFICAÇÃO
Autora: Dra. Vanessa Andrade - CRP 06/142980
Paciente: Mariana Silva de Oliveira, CPF: 123.456.789-00
Finalidade: Encaminhamento para avaliação psiquiátrica complementar e acompanhamento multidisciplinar.

2. DESCRIÇÃO DA DEMANDA
A paciente buscou atendimento queixando-se de episódios recorrentes de ansiedade antecipatória, taquicardia situacional e prejuízos no padrão de sono há cerca de 6 meses.

3. PROCEDIMENTO
Foram realizadas 8 (oito) sessões semanais de psicoterapia baseadas na Terapia Cognitivo-Comportamental (TCC), com aplicação de escalas padronizadas e anamnese clínica.

4. ANÁLISE
Observa-se boa capacidade de insight, humor predominantemente ansioso e resposta inicial favorável às técnicas de reestruturação cognitiva, mantendo-se sintomas residuais de insônia intermediária.

5. CONCLUSÃO
Recomenda-se a continuidade do processo psicoterápico concomitante com avaliação médica especializada.`
  },
  [DocumentType.LAUDO]: {
    title: 'Laudo Pericial Psicológico',
    defaultContent: `1. IDENTIFICAÇÃO
Perita Assistente: Dra. Vanessa Andrade - CRP 06/142980
Examinanda: Mariana Silva de Oliveira, CPF: 123.456.789-00

2. DESCRIÇÃO DA DEMANDA
Avaliação psicológica pericial solicitada para fins de averiguação de aptidão e saúde mental.

3. PROCEDIMENTO E INSTRUMENTOS
Bateria de testes validados pelo SATEPSI, anamnese semiestruturada e observação clínica comportamental em 4 encontros presenciais.

4. ANÁLISE DOS DADOS
Os resultados dos instrumentos psicométricos indicam preservação das funções executivas, atenção concentrada adequada e capacidade crítica preservada.

5. CONCLUSÃO TÉCNICA
Com base nos dados apurados, atesta-se plena aptidão psicológica para o exercício das atividades postuladas.`
  }
};

export function DocumentsModule() {
  const [documents, setDocuments] = useState<DecryptedPsychologicalDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal de Criação
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedType, setSelectedType] = useState<DocumentType>(DocumentType.ATESTADO);
  const [title, setTitle] = useState(CFP_TEMPLATES[DocumentType.ATESTADO].title);
  const [content, setContent] = useState(CFP_TEMPLATES[DocumentType.ATESTADO].defaultContent);
  const [patientId] = useState('00000000-0000-0000-0000-000000000002');
  const [createLoading, setCreateLoading] = useState(false);

  // Documento selecionado para visualização / impressão / assinatura
  const [selectedDoc, setSelectedDoc] = useState<DecryptedPsychologicalDocument | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [signLoading, setSignLoading] = useState(false);

  // Validador Público
  const [showValidatorModal, setShowValidatorModal] = useState(false);
  const [inputToken, setInputToken] = useState('');
  const [validationResult, setValidationResult] = useState<ValidateDocumentResponse | null>(null);
  const [validating, setValidating] = useState(false);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getDocuments();
      setDocuments(data);
      if (data.length > 0 && !selectedDoc) {
        selectDocument(data[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Falha ao listar documentos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const selectDocument = async (doc: DecryptedPsychologicalDocument) => {
    setSelectedDoc(doc);
    // Gera QR Code da URL de validação pública
    try {
      const validationUrl = `${window.location.origin}/validar/${doc.validationToken}`;
      const dataUrl = await QRCode.toDataURL(validationUrl, {
        width: 160,
        margin: 1,
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      });
      setQrCodeDataUrl(dataUrl);
    } catch {
      setQrCodeDataUrl(null);
    }
  };

  const handleTypeChange = (type: DocumentType) => {
    setSelectedType(type);
    setTitle(CFP_TEMPLATES[type].title);
    setContent(CFP_TEMPLATES[type].defaultContent);
  };

  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreateLoading(true);
      setError(null);
      const newDoc = await api.createDocumentDraft({
        patientId,
        type: selectedType,
        title,
        content
      });
      setSuccessMsg('Rascunho de documento criado com sucesso! Criptografado com AES-256.');
      setShowCreateModal(false);
      await fetchDocuments();
      selectDocument(newDoc);
    } catch (err: any) {
      setError(err.message || 'Erro ao criar documento');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleSignDocument = async () => {
    if (!selectedDoc) return;
    try {
      setSignLoading(true);
      setError(null);
      const signed = await api.signDocument(selectedDoc.id);
      setSelectedDoc(signed);
      setSuccessMsg('Documento assinado digitalmente com sucesso! Selo imutável SHA-256 gerado.');
      await fetchDocuments();
      selectDocument(signed);
    } catch (err: any) {
      setError(err.message || 'Erro ao assinar documento');
    } finally {
      setSignLoading(false);
    }
  };

  const handleValidateToken = async (tokenToTest: string) => {
    if (!tokenToTest.trim()) return;
    try {
      setValidating(true);
      setValidationResult(null);
      const result = await api.validateDocumentToken(tokenToTest.trim());
      setValidationResult(result);
    } catch (err: any) {
      setValidationResult({
        valid: false,
        message: err.message || 'Documento não localizado ou inválido.'
      });
    } finally {
      setValidating(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <FileCheck2 className="w-6 h-6 text-teal-600 dark:text-teal-400" />
            Módulo 5: Documentos CFP 006/2019 & QR Code
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Emissão de Atestados, Declarações e Relatórios com Assinatura Digital e Validação Pública (RFC §5)
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              setShowValidatorModal(true);
              if (selectedDoc?.isSigned) {
                setInputToken(selectedDoc.validationToken);
                handleValidateToken(selectedDoc.validationToken);
              }
            }}
            className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-semibold flex items-center gap-2 shadow-sm dark:shadow-none transition-all cursor-pointer"
          >
            <QrCode className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span>Validador Público</span>
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-teal-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Documento</span>
          </button>
        </div>
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

      {/* Grid: Lista de Documentos + Visualizador Formal */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Painel Esquerdo: Lista de Documentos */}
        <div className="lg:col-span-4 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
            <span>Documentos Emitidos ({documents.length})</span>
            <button onClick={fetchDocuments} title="Atualizar" className="hover:text-teal-600 dark:hover:text-teal-400 cursor-pointer">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {documents.length === 0 ? (
              <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 space-y-2">
                <FileText className="w-8 h-8 text-slate-400 mx-auto" />
                <p>Nenhum documento emitido ainda.</p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="text-teal-600 dark:text-teal-400 font-semibold underline cursor-pointer"
                >
                  Emitir primeiro documento
                </button>
              </div>
            ) : (
              documents.map((doc) => {
                const isSelected = selectedDoc?.id === doc.id;
                return (
                  <div
                    key={doc.id}
                    onClick={() => selectDocument(doc)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-teal-50 dark:bg-teal-950/20 border-teal-500/40 shadow-sm'
                        : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {doc.type}
                      </span>
                      {doc.isSigned ? (
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                          <ShieldCheck className="w-3 h-3" />
                          Assinado
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                          Rascunho
                        </span>
                      )}
                    </div>

                    <h4 className="text-xs font-bold text-slate-900 dark:text-white mt-2 line-clamp-1">
                      {doc.title}
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {new Date(doc.createdAt).toLocaleDateString('pt-BR')} • {doc.regulationReference}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Painel Direito: Papel Timbrado & Emissão com QR Code */}
        <div className="lg:col-span-8 space-y-4">
          {selectedDoc ? (
            <div className="space-y-4">
              {/* Barra de Ações Superior */}
              <div className="flex items-center justify-between bg-white dark:bg-slate-900/80 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Status:
                  </span>
                  {selectedDoc.isSigned ? (
                    <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                      <ShieldCheck className="w-4 h-4" />
                      Assinado Digitalmente (Imutável)
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <Lock className="w-4 h-4" />
                      Rascunho Pendente de Assinatura
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {!selectedDoc.isSigned && (
                    <button
                      onClick={handleSignDocument}
                      disabled={signLoading}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>{signLoading ? 'Assinando...' : 'Assinar Digitalmente (SHA-256)'}</span>
                    </button>
                  )}

                  <button
                    onClick={handlePrint}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Imprimir / PDF</span>
                  </button>
                </div>
              </div>

              {/* Folha Formal Clínica (Visualização A4 / Papel Timbrado) */}
              <div className="bg-white text-slate-900 p-8 sm:p-12 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-8 font-serif min-h-[650px] flex flex-col justify-between">
                {/* Cabeçalho Profissional */}
                <div className="border-b-2 border-slate-800 pb-6 text-center space-y-1">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-2xl font-bold font-sans text-teal-800">Ψ</span>
                    <h2 className="text-lg font-bold tracking-wider text-slate-900 uppercase font-sans">
                      Dra. Vanessa Andrade
                    </h2>
                  </div>
                  <p className="text-xs font-sans text-slate-600 font-semibold tracking-wide">
                    Psicóloga Clínica • CRP 06/142980 • Cadastro e-Psi Ativo
                  </p>
                  <p className="text-[11px] font-sans text-slate-500">
                    Terapia Cognitivo-Comportamental • Telepsicologia & Avaliação Clínica
                  </p>
                </div>

                {/* Conteúdo Central do Documento */}
                <div className="space-y-6 flex-1 py-4">
                  <div className="text-center space-y-1">
                    <h3 className="text-base font-bold uppercase tracking-wider text-slate-900 font-sans">
                      {selectedDoc.title}
                    </h3>
                    <span className="inline-block text-[11px] font-sans uppercase font-semibold text-slate-500 border border-slate-300 px-2 py-0.5 rounded">
                      {selectedDoc.regulationReference}
                    </span>
                  </div>

                  <div className="text-xs sm:text-sm text-slate-800 leading-relaxed whitespace-pre-wrap text-justify px-2">
                    {selectedDoc.content}
                  </div>
                </div>

                {/* Rodapé e Autenticação Criptográfica com QR Code */}
                <div className="pt-6 border-t border-slate-300 font-sans space-y-6">
                  <div className="flex flex-col sm:flex-row items-end justify-between gap-6">
                    {/* Validação Pública via QR Code */}
                    <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-200 w-full sm:w-auto">
                      {qrCodeDataUrl ? (
                        <img 
                          src={qrCodeDataUrl} 
                          alt="QR Code de Validação" 
                          className="w-20 h-20 rounded-lg border border-slate-200 bg-white p-1"
                        />
                      ) : (
                        <div className="w-20 h-20 rounded-lg bg-slate-200 flex items-center justify-center text-slate-400">
                          <QrCode className="w-8 h-8" />
                        </div>
                      )}
                      <div className="space-y-1 text-left">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-teal-800 flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Autenticidade Verificável
                        </span>
                        <p className="text-[10px] text-slate-600 max-w-[220px] leading-tight">
                          Aponte a câmera para verificar a assinatura e autoria no Conselho Federal de Psicologia.
                        </p>
                        <p className="text-[10px] font-mono text-slate-500 break-all">
                          Token: {selectedDoc.validationToken.slice(0, 16)}...
                        </p>
                      </div>
                    </div>

                    {/* Assinatura do Profissional */}
                    <div className="text-center sm:text-right space-y-1 w-full sm:w-auto">
                      <div className="w-48 sm:ml-auto border-b border-slate-800 pt-8 pb-1">
                        <span className="font-serif italic text-sm text-slate-800">Vanessa Andrade</span>
                      </div>
                      <p className="text-xs font-bold text-slate-900">Dra. Vanessa Andrade</p>
                      <p className="text-[10px] text-slate-600">Psicóloga — CRP 06/142980</p>
                      <p className="text-[10px] text-slate-500">
                        {selectedDoc.signedAt 
                          ? `Assinado em ${new Date(selectedDoc.signedAt).toLocaleString('pt-BR')}`
                          : 'Rascunho não assinado'}
                      </p>
                    </div>
                  </div>

                  {/* Hash Criptográfico PAdES / SHA-256 */}
                  {selectedDoc.signaturePadesHash && (
                    <div className="text-[10px] text-slate-500 font-mono bg-slate-100 p-2 rounded-lg text-center break-all border border-slate-200">
                      Selo de Imutabilidade Documental SHA-256: {selectedDoc.signaturePadesHash}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 rounded-3xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center text-slate-500">
              Selecione um documento ao lado ou crie um novo para visualizar.
            </div>
          )}
        </div>
      </div>

      {/* Modal de Criação de Documento */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                Emitir Documento Psicológico (CFP nº 006/2019)
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleCreateDocument} className="space-y-4">
              {/* Seletor de Tipo de Documento */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Modalidade do Documento (Resolução CFP nº 006/2019)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[DocumentType.ATESTADO, DocumentType.DECLARACAO, DocumentType.RELATORIO, DocumentType.LAUDO].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleTypeChange(type)}
                      className={`p-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer text-center ${
                        selectedType === type
                          ? 'bg-teal-600 text-white border-teal-600 shadow-md shadow-teal-500/20'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Título */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Título do Documento
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                  required
                />
              </div>

              {/* Conteúdo Clínico */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Texto Oficial do Documento
                  </label>
                  <span className="text-[11px] text-teal-600 dark:text-teal-400 flex items-center gap-1 font-medium">
                    <Sparkles className="w-3 h-3" />
                    Modelo CFP Carregado
                  </span>
                </div>
                <textarea
                  rows={9}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500 resize-none leading-relaxed font-sans"
                  required
                />
              </div>

              {/* Botões */}
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer shadow-lg shadow-teal-500/20"
                >
                  {createLoading ? 'Salvando...' : 'Salvar Rascunho com AES-256'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Validador Público de QR Code (Simulador do Terceiro / Validador) */}
      {showValidatorModal && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <QrCode className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                Portal de Validação Pública de Autenticidade
              </h3>
              <button onClick={() => setShowValidatorModal(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer">✕</button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Este validador simula a página pública acessada por terceiros (RH, empresas ou convênios) ao escanear o QR Code de um documento impresso ou digital.
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Insira o Token de Validação..."
                value={inputToken}
                onChange={(e) => setInputToken(e.target.value)}
                className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:border-purple-500"
              />
              <button
                type="button"
                onClick={() => handleValidateToken(inputToken)}
                disabled={validating}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              >
                {validating ? 'Verificando...' : 'Verificar'}
              </button>
            </div>

            {/* Resultado da Validação */}
            {validationResult && (
              <div className={`p-4 rounded-2xl border space-y-3 ${
                validationResult.valid
                  ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-500/30'
                  : 'bg-rose-50 dark:bg-rose-950/20 border-rose-500/30'
              }`}>
                {validationResult.valid && validationResult.document ? (
                  <>
                    <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-xs font-bold uppercase tracking-wider">
                      <ShieldCheck className="w-4 h-4" />
                      Documento Válido & Autêntico no CFP
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-500">Profissional Emissor:</span>
                        <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                          {validationResult.document.therapistName}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500">Registro Profissional:</span>
                        <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                          CRP {validationResult.document.therapistCrp}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500">Iniciais do Paciente (LGPD):</span>
                        <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                          {validationResult.document.patientInitials}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500">Tipo de Documento:</span>
                        <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                          {validationResult.document.type}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <span className="text-slate-500">Data de Emissão:</span>
                        <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                          {validationResult.document.issuedAt}
                        </p>
                      </div>
                    </div>

                    <div className="text-[10px] font-mono text-emerald-800 dark:text-emerald-300/80 bg-white dark:bg-slate-950 p-2 rounded-xl border border-emerald-500/20 break-all">
                      Hash PAdES/SHA-256: {validationResult.document.signaturePadesHash}
                    </div>

                    <p className="text-[11px] text-slate-600 dark:text-slate-400 italic">
                      * O conteúdo clínico integral permanece confidencial nos termos do Código de Ética do Psicólogo e LGPD Art. 11.
                    </p>
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 text-xs font-semibold">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{validationResult.message || 'Código de validação inválido.'}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
