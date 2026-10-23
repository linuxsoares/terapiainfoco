import { useCallback, useEffect, useState } from 'react';
import { Copy, Check, Download, AlertTriangle, AlertCircle, FileCheck2 } from 'lucide-react';
import type { ReceitaSaudeItem, ReceitaSaudeReportResponse } from '@terapiainfoco/shared';
import { api } from '../services/api';
import { formatBrl } from './SessionPaymentModal';

const formatPaidAt = (ymd: string) => ymd.split('-').reverse().join('/');
const amountText = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

/** CSV com ";" e BOM (abre direto no Excel em português) */
function toCsv(items: ReceitaSaudeItem[]): string {
  const escape = (value: string) => (/[;"\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const header = ['Data do pagamento', 'Valor (R$)', 'CPF do pagador', 'Nome do pagador', 'CPF do beneficiário', 'Nome do beneficiário', 'Descrição', 'Lançado no Receita Saúde'];
  const rows = items.map((i) => [
    formatPaidAt(i.paidAt), amountText(i.amountCents), i.payerCpf ?? '', i.payerName, i.beneficiaryCpf ?? '', i.beneficiaryName, i.description, i.issued ? 'sim' : 'não'
  ]);
  return '﻿' + [header, ...rows].map((row) => row.map(escape).join(';')).join('\r\n');
}

function CopyField({ label, value }: { label: string; value: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!value) {
    return (
      <span className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1">
        <AlertTriangle className="w-3 h-3" /> {label}: não cadastrado
      </span>
    );
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Sem permissão de área de transferência: o valor continua visível para copiar à mão
    }
  };
  return (
    <button onClick={copy} title={`Copiar ${label}`} className="group text-left text-sm text-slate-800 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer">
      <span className="text-[11px] text-slate-500 dark:text-slate-400">{label}:</span>
      <span className="font-mono">{value}</span>
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-500" />}
    </button>
  );
}

/** Pagamentos do mês prontos para lançar no Receita Saúde (a emissão é feita pelo psicólogo no gov.br) */
export function ReceitaSaudePanel({ month }: { month: string }) {
  const [report, setReport] = useState<ReceitaSaudeReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await api.getReceitaSaudeReport(month));
    } catch (err: any) {
      setError(err.message || 'Não foi possível carregar o relatório.');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { void load(); }, [load]);

  const toggleIssued = async (item: ReceitaSaudeItem) => {
    try {
      await api.markReceitaSaudeIssued(item.appointmentId, !item.issued);
      setReport((current) => current && {
        ...current,
        items: current.items.map((i) => (i.appointmentId === item.appointmentId ? { ...i, issued: !item.issued } : i))
      });
    } catch (err: any) {
      setError(err.message || 'Não foi possível atualizar.');
    }
  };

  const downloadCsv = () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([toCsv(report.items)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `receita-saude-${month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const card = 'p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800';
  const pendingCount = report?.items.filter((i) => !i.issued).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-xs text-sky-800 dark:text-sky-300">
        Desde 2025, o recibo de psicólogo pessoa física para dedução no Imposto de Renda é emitido no <strong>Receita Saúde</strong> (aplicativo ou e-CAC, com a sua conta gov.br).
        Aqui estão os dados de cada pagamento para copiar; depois de lançar, marque como lançado. O total do mês é a base do Carnê-Leão.
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-sm text-rose-700 dark:text-rose-300 flex items-center gap-2" role="alert">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}
      {loading && <p className="text-sm text-slate-500 dark:text-slate-400" role="status">Carregando...</p>}

      {report && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className={card}>
              <p className="text-xs text-slate-500 dark:text-slate-400">Total recebido no mês (Carnê-Leão)</p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatBrl(report.totalCents)}</p>
            </div>
            <div className={card}>
              <p className="text-xs text-slate-500 dark:text-slate-400">Recibos a lançar</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{pendingCount} de {report.items.length}</p>
            </div>
            <div className={card}>
              <p className="text-xs text-slate-500 dark:text-slate-400">Pagamentos sem CPF</p>
              <p className={`text-2xl font-bold ${report.missingCpf ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'}`}>{report.missingCpf}</p>
              {report.missingCpf > 0 && <p className="text-xs text-slate-500 dark:text-slate-400">Complete o CPF no cadastro do paciente</p>}
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={downloadCsv} disabled={report.items.length === 0} className="px-3 py-2 rounded-xl text-xs font-bold text-teal-700 dark:text-teal-300 bg-teal-500/10 border border-teal-500/30 hover:bg-teal-500/20 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer">
              <Download className="w-3.5 h-3.5" /> Exportar CSV
            </button>
          </div>

          {report.items.length === 0 ? (
            <p className={`${card} text-sm text-slate-500 dark:text-slate-400`}>Nenhum pagamento registrado neste mês.</p>
          ) : (
            <ul className="space-y-3">
              {report.items.map((item) => (
                <li key={item.appointmentId} className={`${card} space-y-2 ${item.issued ? 'opacity-70' : ''}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">{item.beneficiaryName}</span>
                    <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input type="checkbox" checked={item.issued} onChange={() => toggleIssued(item)} />
                      <FileCheck2 className="w-3.5 h-3.5 text-emerald-500" /> Lançado no Receita Saúde
                    </label>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1.5">
                    <CopyField label="Data do pagamento" value={formatPaidAt(item.paidAt)} />
                    <CopyField label="Valor" value={amountText(item.amountCents)} />
                    <CopyField label="CPF do pagador" value={item.payerCpf} />
                    <CopyField label="Pagador" value={item.payerName} />
                    <CopyField label="CPF do beneficiário" value={item.beneficiaryCpf} />
                    <CopyField label="Beneficiário" value={item.beneficiaryName} />
                  </div>
                  <CopyField label="Descrição" value={item.description} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
