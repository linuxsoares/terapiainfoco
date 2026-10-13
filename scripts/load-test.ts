#!/usr/bin/env bun
/**
 * Script Executável de Teste de Carga & Stress Concorrente (RFC §5.1, §5.2)
 * Executa simulação de concorrência massiva e avalia os SLOs RED (Rate, Errors, Duration).
 * Uso: bun scripts/load-test.ts [--requests=200] [--concurrency=20]
 */

import { stressTestService } from '../apps/backend/src/services/stressTestService';
import { StressScenario, SloStatus } from '../packages/shared/src';

// Argumentos da linha de comando
const args = process.argv.slice(2);
const totalReqsArg = args.find(a => a.startsWith('--requests='));
const concurrencyArg = args.find(a => a.startsWith('--concurrency='));

const totalRequests = totalReqsArg ? parseInt(totalReqsArg.split('=')[1], 10) : 150;
const concurrency = concurrencyArg ? parseInt(concurrencyArg.split('=')[1], 10) : 15;

console.log('='.repeat(70));
console.log('🚀 TerapiaInFoco — Teste de Carga, Concorrência & Auditoria de SLOs RED');
console.log('   Especificação: RFC-001 §5.1 & §5.2 (NIST SP 800-57 / LGPD Art. 46)');
console.log('='.repeat(70));
console.log(`\n⚙️  Configuração:`);
console.log(`   • Requisições Totais: ${totalRequests}`);
console.log(`   • Concorrência (VUs / Workers): ${concurrency}`);
console.log(`   • Cenário: ${StressScenario.FULL_SYSTEM_MIXED}`);
console.log('\n⏳ Executando disparo concorrente...');

const startTime = performance.now();
const report = await stressTestService.runStressTest(
  {
    scenario: StressScenario.FULL_SYSTEM_MIXED,
    totalRequests,
    concurrency
  },
  'cli-runner',
  '127.0.0.1'
);

const elapsed = (performance.now() - startTime).toFixed(2);
console.log(`✅ Concluído em ${elapsed}ms!\n`);

console.log('📊 Métricas de Performance & Vazão (RED Metrics):');
console.log(`   • Vazão Efetiva (Throughput): ${report.rps} req/segundo`);
console.log(`   • Requisições Bem-Sucedidas: ${report.successfulRequests}/${report.totalRequests}`);
console.log(`   • Taxa de Erro: ${report.errorRate}%`);
console.log(`   • Delta de Memória RSS: +${report.memoryDeltaMb.rss} MB`);

console.log('\n⏱️  Percentis de Latência (ms):');
console.log(`   • Mínima:  ${report.percentiles.min} ms`);
console.log(`   • Média:   ${report.percentiles.avg} ms`);
console.log(`   • P50 (Mediana): ${report.percentiles.p50} ms`);
console.log(`   • P90:     ${report.percentiles.p90} ms`);
console.log(`   • P95:     ${report.percentiles.p95} ms`);
console.log(`   • P99:     ${report.percentiles.p99} ms`);
console.log(`   • Máxima:  ${report.percentiles.max} ms`);

console.log('\n🎯 Auditoria de SLOs (Service Level Objectives - RFC §5.1 / §5.2):');
for (const slo of report.slos) {
  const icon = slo.status === SloStatus.MET ? '✅' : slo.status === SloStatus.WARNING ? '⚠️ ' : '❌';
  console.log(`   ${icon} [${slo.id}] ${slo.name}`);
  console.log(`      Meta: ${slo.targetDescription}`);
  console.log(`      Valor Medido: ${slo.actualValue} ${slo.unit} | Status: ${slo.status}`);
}

console.log('\n' + '='.repeat(70));
if (report.allSlosMet) {
  console.log('🏆 RESULTADO: 100% DOS SLOs CONTRATUAIS FORAM CUMPRIDOS COM SUCESSO!');
} else {
  console.log(`⚠️  RESULTADO: ${report.slosPassedCount}/${report.slosTotalCount} SLOs CUMPRIDOS.`);
}
console.log('='.repeat(70) + '\n');
