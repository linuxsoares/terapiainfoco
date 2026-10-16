import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Sparkles,
  Lock,
  Calendar,
  Video,
  FileText,
  Brain,
  HeartHandshake,
  Activity,
  KeyRound,
  LogIn,
  UserPlus,
  CheckCircle2,
  ArrowRight,
  Award,
  Database,
  Scale,
  Pill,
  Receipt,
  FolderLock,
  Globe,
  Fingerprint,
  Layers,
  UserCheck,
  Eye
} from 'lucide-react';
import { UserRole } from '@terapiainfoco/shared';
import type { PublicPlatformShowcaseOverview } from '@terapiainfoco/shared';
import { api } from '../services/api';
import { ThemeToggle } from './ThemeToggle';

interface PublicShowcasePageProps {
  onOpenAuth: (mode: 'login' | 'register', preselectedRole?: UserRole) => void;
  onQuickDemoLogin: (role: UserRole) => void;
}

export const PublicShowcasePage: React.FC<PublicShowcasePageProps> = ({
  onOpenAuth,
  onQuickDemoLogin
}) => {
  const [showcase, setShowcase] = useState<PublicPlatformShowcaseOverview | null>(null);
  const [selectedPersona, setSelectedPersona] = useState<UserRole>(UserRole.PSICOLOGO_TITULAR);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<'ALL' | 'CLINICAL' | 'PATIENT' | 'SECURITY'>('ALL');

  useEffect(() => {
    api.getPublicShowcase()
      .then(data => setShowcase(data))
      .catch(() => {
        // Fallback estático caso o backend ainda esteja iniciando
      });
  }, []);

  const personaDetails: Record<
    string,
    {
      role: UserRole;
      badge: string;
      title: string;
      subtitle: string;
      description: string;
      demoLabel: string;
      demoName: string;
      features: Array<{ title: string; desc: string; norm: string }>;
    }
  > = {
    [UserRole.PSICOLOGO_TITULAR]: {
      role: UserRole.PSICOLOGO_TITULAR,
      badge: 'Profissional da Psicologia • CRP & e-Psi',
      title: 'Para Psicólogos(as) Clínicos(as) & Neuropsicólogos',
      subtitle: 'Automação ética do consultório, teleconsulta P2P/Meet, síntese SOAP assistida por IA e fé pública ICP-Brasil.',
      description:
        'Gerencie toda a jornada clínica sem abrir mão do sigilo profissional (Art. 9º do Código de Ética do Psicólogo). Seus prontuários são cifrados com uma chave DEK exclusiva sua (Envelope Encryption KMS).',
      demoLabel: 'Entrar como Psicóloga (Dra. Beatriz Santos)',
      demoName: 'Dra. Beatriz Santos • CRP 06/142980',
      features: [
        {
          title: 'Agenda Inteligente, Séries Recorrentes & Lembretes WhatsApp',
          desc: 'Crie séries semanais ou quinzenais de até 24 sessões com detecção de conflitos, buffers de respiro e disparo de lembretes éticos via WhatsApp/E-mail.',
          norm: 'RFC-001 §3.1 & CFP nº 011/2018'
        },
        {
          title: 'Teleconsulta WebRTC P2P + Google Meet API v2 & Sala de Espera Ética',
          desc: 'Salas criptografadas com knocking obrigatório, monitoramento de qualidade MOS ITU-T G.107, marcadores clínicos em tempo real e reconexão automática.',
          norm: 'RFC-001 §3.2 & CFP nº 011/2018'
        },
        {
          title: 'Transcrição com Diarização IA & Síntese SOAP Human-in-the-Loop',
          desc: 'Particionamento de fala Terapeuta/Paciente, cálculo de escuta ativa (Talk-to-Listen Ratio), sanitização prévia de PII e proposta estruturada nos 4 quadrantes SOAP.',
          norm: 'RFC-001 §3.3 & LGPD Art. 11'
        },
        {
          title: 'Anamnese com Árvore de Decisão CID-11, Escalas PHQ-9/GAD-7 & Planos SMART',
          desc: '5 trilhas diagnósticas ramificadas com alerta imediato de Red Flags de crise, escalas psicométricas padronizadas e metas terapêuticas mensuráveis.',
          norm: 'RFC-001 §3.4 & CFP nº 001/2009'
        },
        {
          title: 'Documentos CFP nº 006/2019, Encaminhamento Psiquiátrico & ICP-Brasil em Lote',
          desc: 'Laudos periciais nas 5 seções canônicas, validação cruzada de 18 psicofármacos (alerta de Síndrome Serotoninérgica) e fechamento em lote via Árvore de Merkle.',
          norm: 'RFC-001 §3.5 & MP 2.200-2/2001'
        },
        {
          title: 'Faturamento Clínico, Recibos DMED/Reembolso & Termo de Honorários',
          desc: 'Conversão automática de valores por extenso, QR Code de validação pública anônima para operadoras de saúde e contratos formais de prestação de serviços.',
          norm: 'RFC-001 §3.6 & Receita Federal DMED'
        }
      ]
    },
    [UserRole.PACIENTE]: {
      role: UserRole.PACIENTE,
      badge: 'Titular dos Dados • Autonomia & Acolhimento',
      title: 'Para Pacientes em Psicoterapia',
      subtitle: 'Portal do Paciente autenticado, exercícios terapêuticos interativos entre sessões, recibos de reembolso e cofre de portabilidade .enc.',
      description:
        'Acompanhe suas atividades terapêuticas com privacidade ponta a ponta, baixe seus recibos para reembolso no plano de saúde e exerça seus direitos da LGPD (Art. 18) com transparência.',
      demoLabel: 'Entrar como Paciente (Mariana Silva)',
      demoName: 'Mariana Silva de Oliveira • Titular LGPD',
      features: [
        {
          title: 'Exercícios Terapêuticos Interativos (TCC, ACT, DBT & Mindfulness)',
          desc: 'Responda entre as sessões ao Registro de Pensamentos Disfuncionais (RPD), Diário de Humor, Respiração 4-4-6, Inventário de Valores ACT e Ativação Comportamental com feedback do seu psicólogo.',
          norm: 'RFC-001 §3.7 & Práticas Baseadas em Evidências'
        },
        {
          title: 'Central de Recibos para Reembolso de Convênio & IRPF',
          desc: 'Acesse todos os recibos quitados com assinatura digital, valor por extenso e token de verificação pública para envio direto à operadora de saúde.',
          norm: 'RFC-001 §3.6 & ANS / DMED'
        },
        {
          title: 'Gestão Transparente de Consentimento (TCLE & Smart Revocation)',
          desc: 'Visualize e gerencie seus termos de consentimento para telepsicologia e transcrição assistida, podendo revogar escopos granulares a qualquer momento.',
          norm: 'LGPD Art. 7º, 8º, 11 e 18'
        },
        {
          title: 'Cofre Cifrado de Portabilidade do Prontuário (.enc Argon2id + AES-256-GCM)',
          desc: 'Exporte e decifre a integralidade do seu histórico clínico em um pacote criptografado protegido exclusivamente pela sua senha pessoal, com prova de integridade Merkle Tree.',
          norm: 'LGPD Art. 18, V & RFC-001 §4.4'
        }
      ]
    },
    [UserRole.ADMIN]: {
      role: UserRole.ADMIN,
      badge: 'Governança, Segurança & DPO / CISO',
      title: 'Para Administradores de TI, Clínicas & Encarregados de Dados (DPO)',
      subtitle: '74 camadas de blindagem criptográfica, gestão de chaves KMS, auditoria WORM em Hash-Chain, SIEM e conformidade multi-normativa.',
      description:
        'Monitore a postura de segurança em tempo real sem violar o sigilo clínico: graças à arquitetura Zero-Knowledge, o Admin/DPO audita metadados e integridade criptográfica sem ler o texto claro dos prontuários.',
      demoLabel: 'Entrar como Admin / DPO',
      demoName: 'Administrador do Sistema • CDPO/BR',
      features: [
        {
          title: 'Dashboard Executivo Multi-Normativo (LGPD, CFP, ICP-Brasil, SOC2/ISO 27001)',
          desc: 'Emissão de pacotes forenses de conformidade, Relatório de Impacto à Proteção de Dados (RIPD/DPIA Art. 38) e assinatura formal DPO Sign-Off.',
          norm: 'LGPD Art. 38/50 & ISO/IEC 27701'
        },
        {
          title: 'Ciclo de Vida KMS (NIST SP 800-57) & Disaster Recovery Cifrado',
          desc: 'Rotação contínua de chaves mestras (KEKs), re-wrapping atômico de DEKs sem re-encriptar prontuários e snapshots de backup verificados com SHA-256.',
          norm: 'RFC-001 §4.2 & NIST SP 800-57'
        },
        {
          title: '56 Painéis Ativos de Defesa Cibernética & Criptografia Pós-Quântica',
          desc: 'WAF SQLi/XSS, ZKP Schnorr, PQC Híbrida (Kyber/ML-KEM + Dilithium/ML-DSA), Shamir Secret Sharing (Ordem Judicial t-of-n), DLP Esteganográfico e WebSocket Guard CWE-502.',
          norm: 'NIST FIPS 203/204 & OWASP ASVS v4.0'
        },
        {
          title: 'Trilha de Auditoria WORM Hash-Chain & Observabilidade OpenTelemetry / SIEM',
          desc: 'Logs imutáveis encadeados criptograficamente com detecção instantânea de adulteração (Tamper-Evidence) e exportação OTLP para Datadog, Splunk e Prometheus.',
          norm: 'RFC-001 §4.4, §5.2 & Resolução CD/ANPD nº 15/2024'
        }
      ]
    }
  };

  const completeModulesGrid = [
    {
      num: '01',
      category: 'CLINICAL',
      title: 'Agenda & Séries Recorrentes',
      desc: 'Agendamentos semanais/quinzenais/mensais com detecção de conflito e buffer ético entre sessões.',
      badge: 'RFC §3.1',
      icon: Calendar
    },
    {
      num: '02',
      category: 'CLINICAL',
      title: 'Lembretes Multicanal WhatsApp & E-mail',
      desc: 'Notificações acolhedoras 48h/24h/2h antes com link direto wa.me e sala de espera segura.',
      badge: 'CFP 011/2018',
      icon: Globe
    },
    {
      num: '03',
      category: 'CLINICAL',
      title: 'Teleconsulta WebRTC P2P & Google Meet v2',
      desc: 'Vídeo criptografado DTLS-SRTP, sala de espera com knocking manual e telemetria MOS ITU-T G.107.',
      badge: 'RFC §3.2',
      icon: Video
    },
    {
      num: '04',
      category: 'CLINICAL',
      title: 'Transcrição IA, Diarização & Síntese SOAP',
      desc: 'Separação de voz Terapeuta/Paciente, taxa de escuta ativa e rascunho SOAP Human-in-the-Loop.',
      badge: 'RFC §3.3',
      icon: Sparkles
    },
    {
      num: '05',
      category: 'CLINICAL',
      title: 'Marcadores Clínicos em Tempo Real',
      desc: 'Marcação de Insight, Alerta de Crise, Mudança Afetiva e Queixa Somática durante a teleconsulta.',
      badge: 'FLE AES-GCM',
      icon: Activity
    },
    {
      num: '06',
      category: 'CLINICAL',
      title: 'Anamnese Interativa & Árvore CID-11',
      desc: '5 trilhas diagnósticas ramificadas com detecção imediata de Red Flags e escalas PHQ-4, PSS-10 e ASRS.',
      badge: 'RFC §3.4',
      icon: Brain
    },
    {
      num: '07',
      category: 'CLINICAL',
      title: 'Planos SMART & Escalas PHQ-9 / GAD-7',
      desc: 'Metas terapêuticas mensuráveis (0-100%) e monitoramento psicométrico longitudinal com alerta no Item 9.',
      badge: 'CFP 001/2009',
      icon: Scale
    },
    {
      num: '08',
      category: 'CLINICAL',
      title: 'Linha do Tempo Clínica Longitudinal',
      desc: 'Visão unificada de consultas, evoluções SOAP seladas, anamneses, documentos CFP e taxa de assiduidade.',
      badge: 'RFC §3.4',
      icon: Layers
    },
    {
      num: '09',
      category: 'CLINICAL',
      title: 'Laudos Periciais & Documentos CFP 006/2019',
      desc: 'Declarações, Atestados, Relatórios, Laudos Multi-Sessões (5 seções canônicas) e Pareceres com QR Code.',
      badge: 'CFP 006/2019',
      icon: FileText
    },
    {
      num: '10',
      category: 'CLINICAL',
      title: 'Encaminhamento Psiquiátrico & Interações',
      desc: 'Catálogo de 18 psicofármacos e motor cruzado de interações (Síndrome Serotoninérgica / Litiemia).',
      badge: 'RFC §3.5',
      icon: Pill
    },
    {
      num: '11',
      category: 'CLINICAL',
      title: 'Assinatura ICP-Brasil em Lote (Merkle Tree)',
      desc: 'Fechamento de ciclos de prontuário com certificado A1/A3/Nuvem PSC e Carimbo do Tempo TSA ITI.',
      badge: 'DOC-ICP-11',
      icon: Award
    },
    {
      num: '12',
      category: 'PATIENT',
      title: 'Faturamento, Recibos DMED & Honorários',
      desc: 'Emissão de recibos com valor por extenso, validador público anônimo para convênios e contrato de honorários.',
      badge: 'RFC §3.6',
      icon: Receipt
    },
    {
      num: '13',
      category: 'PATIENT',
      title: 'Portal do Paciente & Exercícios TCC/ACT/DBT',
      desc: 'Acesso passwordless do paciente a exercícios prescritos, histórico de recibos e termos TCLE ativos.',
      badge: 'RFC §3.7',
      icon: HeartHandshake
    },
    {
      num: '14',
      category: 'PATIENT',
      title: 'Cofre de Portabilidade Cifrado (.enc)',
      desc: 'Pacote .enc protegido por Argon2id + AES-256-GCM com AAD, Árvore de Merkle em 11 seções e selo WORM.',
      badge: 'LGPD Art. 18',
      icon: FolderLock
    },
    {
      num: '15',
      category: 'SECURITY',
      title: 'Envelope Encryption KMS & Blind Indexing',
      desc: 'Cada terapeuta possui DEK exclusiva envelopada por KEK mestre; buscas por CPF/E-mail via HMAC-SHA256.',
      badge: 'NIST 800-57',
      icon: KeyRound
    },
    {
      num: '16',
      category: 'SECURITY',
      title: 'Criptografia Pós-Quântica (Kyber & Dilithium)',
      desc: 'Blindagem híbrida ML-KEM-768 + ML-DSA-65 contra ataques Harvest Now, Decrypt Later em prontuários.',
      badge: 'FIPS 203/204',
      icon: ShieldCheck
    },
    {
      num: '17',
      category: 'SECURITY',
      title: 'Provas ZKP Schnorr & Shamir Secret Sharing',
      desc: 'Auditoria forense Zero-Knowledge sem revelar texto claro e liberação colegiada sob ordem judicial (t-of-n).',
      badge: 'CFP Art. 9º',
      icon: Fingerprint
    },
    {
      num: '18',
      category: 'SECURITY',
      title: 'WAF, DLP Esteganográfico & WebSocket Guard',
      desc: '74 guardiões ativos contra SQLi/XSS, SSRF, XXE, ReDoS, SSTI, Supply Chain e Desserialização CWE-502.',
      badge: 'OWASP ASVS',
      icon: Database
    }
  ];

  const filteredModules = completeModulesGrid.filter(
    m => activeCategoryFilter === 'ALL' || m.category === activeCategoryFilter
  );

  const activePersona = personaDetails[selectedPersona] || personaDetails[UserRole.PSICOLOGO_TITULAR];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      {/* Top Public Navbar */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/85 backdrop-blur-md px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center font-bold text-slate-950 text-xl shadow-lg shadow-teal-500/20">
            Ψ
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 dark:text-white text-base sm:text-lg tracking-tight">
                {showcase?.platformName || 'TerapiaInFoco'}
              </span>
              <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-700 dark:text-teal-400 border border-teal-500/20">
                Vitrine da Plataforma • Sem Login
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
              Gestão Clínica Psicológica, Teleconsulta WebRTC, IA Ética & Criptografia Zero-Knowledge
            </p>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="hidden lg:flex items-center gap-6 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <a href="#perfis" className="hover:text-teal-600 dark:hover:text-teal-400 transition-colors">
            Perfis (Paciente, Psicólogo, Admin)
          </a>
          <a href="#modulos" className="hover:text-teal-600 dark:hover:text-teal-400 transition-colors">
            18 Módulos Clínicos
          </a>
          <a href="#seguranca" className="hover:text-teal-600 dark:hover:text-teal-400 transition-colors">
            74 Camadas de Segurança
          </a>
          <a href="#normas" className="hover:text-teal-600 dark:hover:text-teal-400 transition-colors">
            Conformidade CFP & LGPD
          </a>
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <button
            onClick={() => onOpenAuth('login')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-all"
          >
            <LogIn className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span>Entrar</span>
          </button>
          <button
            onClick={() => onOpenAuth('register', UserRole.PSICOLOGO_TITULAR)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-500 hover:to-emerald-500 shadow-md shadow-teal-500/20 transition-all"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Criar Perfil</span>
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-12 sm:py-16 px-4 sm:px-8 border-b border-slate-200 dark:border-slate-800/80 bg-gradient-to-b from-white via-teal-50/30 to-slate-50 dark:from-slate-950 dark:via-slate-900/60 dark:to-slate-950">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20">
              <ShieldCheck className="w-3.5 h-3.5" />
              CFP nº 011/2018, 006/2019 & 001/2009
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
              <Lock className="w-3.5 h-3.5" />
              LGPD Art. 11, 18 & 46 (Zero-Knowledge FLE)
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
              <Award className="w-3.5 h-3.5" />
              ICP-Brasil PAdES & Carimbo do Tempo TSA
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 space-y-5">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
                Conheça tudo o que o{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-emerald-500 dark:from-teal-400 dark:to-emerald-300">
                  TerapiaInFoco
                </span>{' '}
                oferece para Psicólogos, Pacientes e Clínicas.
              </h1>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                Explore livremente todas as funcionalidades da plataforma antes de fazer login: prontuário SOAP com criptografia em nível de campo, teleconsulta ética WebRTC/Google Meet, anamnese com árvore de decisão CID-11, interações medicamentosas, Portal do Paciente e 74 camadas de defesa cibernética.
              </p>

              {/* Main CTA Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  onClick={() => onOpenAuth('register', UserRole.PSICOLOGO_TITULAR)}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-slate-950 bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-500 hover:to-emerald-500 shadow-lg shadow-teal-500/20 transition-all"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Criar Perfil (Com ou Sem Login Social)</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onOpenAuth('login')}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-slate-800 dark:text-white bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 shadow-sm transition-all"
                >
                  <LogIn className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  <span>Fazer Login na Minha Conta</span>
                </button>
              </div>

              {/* 1-Click Demo Bar */}
              <div className="pt-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                  ⚡ Acesso Rápido de Demonstração (1-Clique sem digitar senha):
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => onQuickDemoLogin(UserRole.PSICOLOGO_TITULAR)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-teal-500/10 hover:bg-teal-500/20 text-teal-800 dark:text-teal-300 border border-teal-500/30 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Demo Psicóloga (Dra. Beatriz)</span>
                  </button>
                  <button
                    onClick={() => onQuickDemoLogin(UserRole.PACIENTE)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-800 dark:text-indigo-300 border border-indigo-500/30 transition-colors"
                  >
                    <HeartHandshake className="w-3.5 h-3.5" />
                    <span>Demo Paciente (Mariana Silva)</span>
                  </button>
                  <button
                    onClick={() => onQuickDemoLogin(UserRole.ADMIN)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30 transition-colors"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Demo Admin / DPO</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right KPI & Architecture Summary Card */}
            <div className="lg:col-span-5">
              <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">
                      Arquitetura Homologada RFC-001
                    </span>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Raio-X da Ferramenta em Tempo Real
                    </h3>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    ● 100% Operacional
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                    <p className="text-2xl font-extrabold text-teal-600 dark:text-teal-400">
                      {showcase?.totalClinicalModules ?? 18}
                    </p>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Módulos Clínicos</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">Agenda, WebRTC, IA SOAP, CFP, ICP</p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                    <p className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400">
                      {showcase?.totalSecurityLayers ?? 74}
                    </p>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Camadas de Segurança</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">KMS, WORM, ZKP, PQC, WAF, DLP</p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                    <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">3 Perfis</p>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Paciente, Psicólogo, Admin</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">RBAC + Login Social ou E-mail</p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                    <p className="text-2xl font-extrabold text-amber-600 dark:text-amber-400">
                      {showcase?.totalAutomatedTests ?? 1381}
                    </p>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Testes Automatizados</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">100% de cobertura criptográfica</p>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-teal-500/5 border border-teal-500/20 space-y-2">
                  <p className="text-xs font-bold text-teal-800 dark:text-teal-300 flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4" />
                    Criação de Perfil Flexível (Com ou Sem Login Social)
                  </p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                    Crie sua conta usando <strong>Google OAuth 2.0</strong>, <strong>Gov.br (Nível Prata/Ouro)</strong>, <strong>Apple ID</strong>, <strong>Passkey FIDO2</strong> ou <strong>E-mail e Senha tradicional</strong> com Argon2id.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 1: Interactive Persona Explorer (Paciente, Psicólogo, Admin) */}
      <section id="perfis" className="py-12 sm:py-16 px-4 sm:px-8 max-w-7xl mx-auto w-full space-y-8">
        <div className="text-center max-w-3xl mx-auto space-y-2">
          <span className="text-xs font-bold uppercase tracking-widest text-teal-600 dark:text-teal-400">
            Experiência Dedicada por Perfil (RBAC)
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
            Três Perfis Integrados: Paciente, Psicólogo e Administrador
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Selecione um perfil abaixo para visualizar o que cada papel encontra dentro da ferramenta, criar uma conta nesse perfil ou testar a demonstração em 1 clique.
          </p>
        </div>

        {/* Persona Selector Tabs */}
        <div className="flex flex-wrap justify-center gap-3">
          {[
            { role: UserRole.PSICOLOGO_TITULAR, label: '👩‍⚕️ Perfil Psicólogo(a)', sub: 'Clínica, SOAP, IA & CFP' },
            { role: UserRole.PACIENTE, label: '🌿 Perfil Paciente', sub: 'Exercícios, Recibos & Cofre .enc' },
            { role: UserRole.ADMIN, label: '🛡️ Perfil Admin / DPO', sub: 'Segurança, KMS, WORM & LGPD' }
          ].map(tab => {
            const isSelected = selectedPersona === tab.role;
            return (
              <button
                key={tab.role}
                onClick={() => setSelectedPersona(tab.role)}
                className={`px-5 py-3 rounded-2xl text-left border transition-all ${
                  isSelected
                    ? 'bg-teal-600 text-white border-teal-500 shadow-lg shadow-teal-500/20 scale-[1.02]'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-teal-500/40'
                }`}
              >
                <p className="text-sm font-bold">{tab.label}</p>
                <p className={`text-[11px] ${isSelected ? 'text-teal-100' : 'text-slate-400'}`}>{tab.sub}</p>
              </button>
            );
          })}
        </div>

        {/* Active Persona Showcase Card */}
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg p-6 sm:p-8 space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-6">
            <div className="space-y-1.5 max-w-2xl">
              <span className="inline-block px-3 py-1 rounded-full text-[11px] font-bold bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20">
                {activePersona.badge}
              </span>
              <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
                {activePersona.title}
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                {activePersona.description}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                onClick={() => onOpenAuth('register', activePersona.role)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-500 hover:to-emerald-500 shadow-md transition-all"
              >
                <UserPlus className="w-4 h-4" />
                <span>Criar Perfil de {activePersona.role === UserRole.PACIENTE ? 'Paciente' : activePersona.role === UserRole.ADMIN ? 'Admin / DPO' : 'Psicólogo(a)'}</span>
              </button>
              <button
                onClick={() => onQuickDemoLogin(activePersona.role)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-teal-700 dark:text-teal-300 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 transition-all"
              >
                <LogIn className="w-4 h-4" />
                <span>{activePersona.demoLabel}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activePersona.features.map((feat, idx) => (
              <div
                key={idx}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 space-y-2 hover:border-teal-500/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-500 shrink-0" />
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">{feat.title}</h4>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-300 shrink-0">
                    {feat.norm}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed pl-6">
                  {feat.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 2: Complete 18 Modules Catalog */}
      <section id="modulos" className="py-12 sm:py-16 px-4 sm:px-8 bg-white dark:bg-slate-900/50 border-y border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-widest text-teal-600 dark:text-teal-400">
                Catálogo Funcional Completo • Sem Necessidade de Login
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                Todos os 18 Módulos da Plataforma TerapiaInFoco
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Filtre por categoria para inspecionar os recursos clínicos, ferramentas do paciente e motores criptográficos.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                { id: 'ALL', label: 'Todos (18)' },
                { id: 'CLINICAL', label: 'Clínica & Prontuário (11)' },
                { id: 'PATIENT', label: 'Jornada do Paciente (3)' },
                { id: 'SECURITY', label: 'Segurança & Criptografia (4)' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setActiveCategoryFilter(f.id as any)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                    activeCategoryFilter === f.id
                      ? 'bg-teal-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredModules.map(mod => {
              const IconComp = mod.icon;
              return (
                <div
                  key={mod.num}
                  className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-teal-500/50 transition-all flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-600 dark:text-teal-400">
                        <IconComp className="w-4 h-4" />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-teal-500/10 text-teal-700 dark:text-teal-300">
                          {mod.badge}
                        </span>
                        <span className="text-xs font-mono font-bold text-slate-400">#{mod.num}</span>
                      </div>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">{mod.title}</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{mod.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Section 3: Normative Compliance & Security */}
      <section id="normas" className="py-12 sm:py-16 px-4 sm:px-8 max-w-7xl mx-auto w-full space-y-8">
        <div className="text-center max-w-3xl mx-auto space-y-2">
          <span className="text-xs font-bold uppercase tracking-widest text-teal-600 dark:text-teal-400">
            Respaldo Normativo, Ético & Criptográfico
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
            Conformidade Nativa com CFP, LGPD, ICP-Brasil e NIST
          </h2>
        </div>

        <div id="seguranca" className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(showcase?.normativeCompliance || []).map((norm, i) => (
            <div
              key={i}
              className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2"
            >
              <span className="inline-block text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20">
                {norm.code}
              </span>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">{norm.title}</h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{norm.description}</p>
            </div>
          ))}
        </div>

        {/* Bottom Call to Action Banner */}
        <div className="rounded-3xl bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 text-white p-8 sm:p-10 flex flex-col lg:flex-row items-center justify-between gap-6 shadow-xl">
          <div className="space-y-2 max-w-2xl text-center lg:text-left">
            <h3 className="text-xl sm:text-2xl font-extrabold">
              Pronto para acessar ou criar seu perfil no TerapiaInFoco?
            </h3>
            <p className="text-xs sm:text-sm text-slate-300">
              Escolha seu perfil (<strong>Paciente</strong>, <strong>Psicólogo</strong> ou <strong>Admin</strong>) e cadastre-se com <strong>Login Social (Google, Gov.br, Apple)</strong> ou com <strong>E-mail e Senha</strong>.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3 shrink-0">
            <button
              onClick={() => onOpenAuth('register', UserRole.PSICOLOGO_TITULAR)}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-xs sm:text-sm font-bold text-slate-950 bg-teal-400 hover:bg-teal-300 transition-all"
            >
              <UserPlus className="w-4 h-4" />
              <span>Criar Meu Perfil Agora</span>
            </button>
            <button
              onClick={() => onOpenAuth('login')}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-xs sm:text-sm font-bold text-white bg-white/10 hover:bg-white/20 border border-white/20 transition-all"
            >
              <LogIn className="w-4 h-4" />
              <span>Já tenho conta (Entrar)</span>
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 dark:border-slate-800 py-6 px-4 sm:px-8 text-center text-xs text-slate-500 dark:text-slate-400">
        TerapiaInFoco • Plataforma Clínica Psicológica RFC-001 • Conformidade CFP nº 011/2018, 006/2019, 001/2009 & LGPD Art. 11/18
      </footer>
    </div>
  );
};
