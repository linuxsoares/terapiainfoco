export interface TherapyCase {
  id: string;
  name: string;
  avatar: string;
  modality: string;
  approach: string;
  sessionNumber: number;
  duration: string;
  date: string;
  transcript: {
    speaker: 'TERAPEUTA' | 'PACIENTE';
    time: string;
    text: string;
  }[];
  soap: {
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  };
  privateNotes: string;
}

export const THERAPY_CASES: TherapyCase[] = [
  {
    id: 'case-1',
    name: 'Mariana S. (32 anos)',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    modality: 'Teleconsulta (Google Meet Seguro)',
    approach: 'Terapia Cognitivo-Comportamental (TCC)',
    sessionNumber: 8,
    duration: '50 min',
    date: 'Hoje, 14:00',
    transcript: [
      {
        speaker: 'TERAPEUTA',
        time: '00:02',
        text: 'Boa tarde, Mariana. Como você passou a semana desde o nosso último encontro onde combinamos as técnicas de respiração diafragmática para momentos de pico no trabalho?'
      },
      {
        speaker: 'PACIENTE',
        time: '00:24',
        text: 'Olá, doutor(a). Foi uma semana desafiadora, mas senti uma diferença real. Na quarta-feira tive uma reunião muito tensa de fechamento de metas e meu coração começou a disparar. Consegui parar por 3 minutos antes de entrar na sala, apliquei a respiração 4-7-8 e a sensação de desmaio não veio. Ainda fiquei com aperto no peito, mas não tive a crise de pânico que costumava ter.'
      },
      {
        speaker: 'TERAPEUTA',
        time: '01:05',
        text: 'Isso é um avanço crucial na autorregulação fisiológica. E quais pensamentos automáticos surgiram naquele momento de pré-reunião?'
      },
      {
        speaker: 'PACIENTE',
        time: '01:28',
        text: 'Veio aquele clássico: "Eles vão perceber que não dou conta e serei demitida". Mas me lembrei da nossa tabela de distorções cognitivas de catastrofização e tentei pensar: "Eu me preparei para essa apresentação e estou nervosa porque me importo, não porque sou incapaz". Consegui concluir a apresentação sem travar.'
      },
      {
        speaker: 'TERAPEUTA',
        time: '02:10',
        text: 'Excelente reestruturação cognitiva in vivo. Como ficou o seu padrão de sono após esses episódios?'
      },
      {
        speaker: 'PACIENTE',
        time: '02:30',
        text: 'Dormi em média 6 horas por noite. Acordo ainda cansada na sexta-feira, mas a insônia inicial diminuiu cerca de 40%.'
      }
    ],
    soap: {
      subjective: 'Paciente relata melhora na modulação de crises de ansiedade após uso da respiração diafragmática durante situação ansiogênica corporativa. Identificou pensamentos automáticos disfuncionais ("vão perceber que não dou conta") e aplicou com êxito o questionamento socrático e reestruturação de catastrofização. Insônia inicial apresentou redução estimada de 40%.',
      objective: 'Apresenta-se orientada globalmente, afeto congruente com o relato, discurso fluente e com boa capacidade reflexiva e insight. Postura corporal relaxada ao longo da videoconferência, com bom engajamento nas intervenções propostas.',
      assessment: 'Evolução favorável do quadro de Transtorno de Ansiedade Generalizada (TAG) com aumento consistente da autoeficácia e adesão às técnicas de manejo comportamental e cognitivo da TCC. Boa resposta na redução da resposta fisiológica simpática em contexto ocupacional.',
      plan: '1. Manter registro no diário de pensamentos disfuncionais (RPD) com foco em situações de avaliação de desempenho. 2. Implementar higiene do sono estruturada para atenuar o cansaço residual. 3. Próxima sessão focará na flexibilização de crenças intermediárias sobre perfeccionismo.'
    },
    privateNotes: 'A paciente demonstra forte dependência de validação de figuras de autoridade na empresa. Explorar na próxima sessão as experiências infantis com exigências paternas sobre notas escolares.'
  },
  {
    id: 'case-2',
    name: 'Carlos E. (45 anos)',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    modality: 'Teleconsulta (Google Meet Seguro)',
    approach: 'Psicologia Humanista / Fenomenológica',
    sessionNumber: 14,
    duration: '50 min',
    date: 'Ontem, 16:00',
    transcript: [
      {
        speaker: 'TERAPEUTA',
        time: '00:03',
        text: 'Carlos, na sessão passada tocamos no silêncio que você sentiu após o falecimento do seu irmão. O que ecoou em você nesses dias?'
      },
      {
        speaker: 'PACIENTE',
        time: '00:25',
        text: 'Eu passei a semana tentando evitar mexer nas coisas dele no quarto de visitas. Mas ontem abri a porta e vi uma jaqueta dele. Chorei muito, coisa que não fazia há quase quatro meses. Parecia que uma represa havia se rompido. Foi doloroso, mas depois tive uma sensação de alívio que não sentia há muito tempo.'
      },
      {
        speaker: 'TERAPEUTA',
        time: '01:10',
        text: 'Permitir-se entrar em contato com a dor sem julgar o choro como fraqueza é parte fundamental desse processo de luto.'
      },
      {
        speaker: 'PACIENTE',
        time: '01:32',
        text: 'Sim. Antes eu achava que chorar significava que eu estava regredindo ou sendo fraco diante da minha família. Agora começo a entender que estou apenas sentindo a falta de alguém que foi insubstituível.'
      }
    ],
    soap: {
      subjective: 'Paciente relata episódio significativo de catarse e elaboração do luto vicário após meses de contenção afetiva. Rompeu o padrão de evitação experiencial ao confrontar pertences do irmão falecido, vivenciando alívio e menor culpa pelo sofrimento expresso.',
      objective: 'Expressão facial compungida nos primeiros 20 minutos, evoluindo para semblante mais sereno e receptivo. Contato ocular mantido, sem sinais de desorganização psicomotora ou ideação de autoextermínio.',
      assessment: 'Transição da fase de entorpecimento/negação emocional para fase de elaboração e acolhimento da perda. Redução do mecanismo de defesa rígido (intelectualização do luto). Prognóstico favorável.',
      plan: '1. Manter escuta fenomenológica acolhedora. 2. Estimular expressão de rituais de despedida simbólica sem pressões de prazo. 3. Monitorar rede de apoio familiar.'
    },
    privateNotes: 'Acompanhar a relação conjugal, pois Carlos mencionou que a esposa se incomoda quando ele demonstra vulnerabilidade.'
  }
];

export const COMPLIANCE_PILLARS = [
  {
    title: 'Resolução CFP nº 011/2018',
    subtitle: 'Telepsicologia & e-Psi',
    description: 'Ambiente tecnológico auditado e criptografado que atende estritamente às exigências do Conselho Federal de Psicologia para atendimento online.',
    icon: 'ShieldCheck'
  },
  {
    title: 'Resolução CFP nº 006/2019',
    subtitle: 'Documentos Psicológicos',
    description: 'Emissão parametrizada de Atestados, Declarações, Relatórios e Laudos com estrutura formal obrigatória, assinatura ICP-Brasil e validação pública via QR Code.',
    icon: 'FileText'
  },
  {
    title: 'Resolução CFP nº 001/2009',
    subtitle: 'Guarda Obrigatória de 5 Anos',
    description: 'Armazenamento imutável (append-only) e cofre criptográfico que assegura a retenção legal mínima de 5 anos mesmo em caso de cancelamento da conta.',
    icon: 'Lock'
  },
  {
    title: 'LGPD Art. 5º, 11 e 16',
    subtitle: 'Proteção a Dados de Saúde Sensíveis',
    description: 'Envelope Encryption com DEK única por paciente, blind indexing para anonimização em buscas e quarentena criptográfica em solicitações de esquecimento.',
    icon: 'Key'
  }
];

export const RFC_MODULES = [
  {
    id: 'modulo-1',
    badge: 'Módulo 1 • RFC-001 §3.1',
    title: 'Agenda Inteligente & Redução de Faltas',
    description: 'Controle completo da sua grade clínica com buffers entre sessões, agendamento recorrente e notificações multicanal que diminuem faltas em até 45%.',
    highlights: [
      'Lembretes automáticos via WhatsApp oficial e E-mail (48h e 2h antes)',
      'Políticas configuráveis de cancelamento prévio (ex: mínimo 24h)',
      'Intervalo inteligente de respiro (buffer de 10-15 min) entre atendimentos',
      'Fluxo de estados da sessão: Solicitada, Confirmada, Em Andamento e Concluída'
    ],
    tag: 'Redução de No-show'
  },
  {
    id: 'modulo-2',
    badge: 'Módulo 2 • RFC-001 §3.2',
    title: 'Teleconsulta Integrada ao Google Meet',
    description: 'Elimine links manuais e servidores WebRTC instáveis. Crie salas corporativas do Google Meet com proteção de acesso direto na sua agenda.',
    highlights: [
      'Geração de link dinâmico associado ao Google Calendar do profissional',
      'Sala de espera (Knocking) mandatória: nenhum paciente entra na sessão anterior',
      'Zero custo de infraestrutura própria de vídeo com a máxima confiabilidade global do Google',
      'Acesso seguro e sem necessidade de instalação de aplicativos pesados pelo paciente'
    ],
    tag: 'Google Workspace Partner API'
  },
  {
    id: 'modulo-3',
    badge: 'Módulo 3 • RFC-001 §3.3',
    title: 'Transcrição, Diarização & SOAP com IA',
    description: 'Capture as falas com consentimento verificado, separe com precisão quem é psicólogo e quem é paciente, e receba um rascunho de nota SOAP em segundos.',
    highlights: [
      'Diarização clínica precisa: segrega [TERAPEUTA] de [PACIENTE]',
      'Estruturação automática nos 4 eixos clínicos: Subjetivo, Objetivo, Avaliação e Plano',
      'Human-in-the-Loop Obrigatório: o psicólogo sempre revisa, edita e assina',
      'Política Zero Data Retention: seus dados de sessão NUNCA são usados para treinar modelos'
    ],
    tag: 'Human-in-the-Loop'
  },
  {
    id: 'modulo-4',
    badge: 'Módulo 4 • RFC-001 §3.4',
    title: 'Prontuário Imutável & Notas Confidenciais',
    description: 'Registro cronológico inviolável com separação legal entre o prontuário oficial (direito do paciente) e as impressões reflexivas privadas do terapeuta.',
    highlights: [
      'Registros "append-only": correções feitas via termos de retificação averbados',
      'Segregação lógica entre notas de trabalho reflexivas e prontuário documental',
      'Ficha de admissão e anamnese biopsicossocial completa',
      'Trilha de auditoria (Audit Trail) com registro WORM de qualquer visualização ou edição'
    ],
    tag: 'CFP Compliance'
  },
  {
    id: 'modulo-5',
    badge: 'Módulo 5 • RFC-001 §3.5',
    title: 'Emissão de Laudos & Validação Pública QR Code',
    description: 'Crie documentos oficiais conforme a Resolução CFP nº 006/2019 com assinatura digital ICP-Brasil e token público para terceiros validarem autenticidade.',
    highlights: [
      'Templates estruturados: Declaração, Atestado, Relatório e Laudo Psicológico',
      'Assinatura digital PAdES / ICP-Brasil compatível com Lei nº 14.063/2020',
      'Geração em PDF/A para preservação e integridade a longo prazo',
      'QR Code com verificação pública de integridade sem expor o prontuário sigiloso'
    ],
    tag: 'Resolução CFP 006/2019'
  }
];

export const SECURITY_ARCHITECTURE_STEPS = [
  {
    step: '1. Ingestão Segura',
    title: 'Canal Criptografado TLS 1.3',
    desc: 'O tráfego de dados entre terapeuta, paciente e servidores viaja sob criptografia TLS 1.3 com Perfect Forward Secrecy.',
    sub: 'Camada de Trânsito'
  },
  {
    step: '2. Envelope Encryption',
    title: 'KEK em HSM + DEK por Paciente',
    desc: 'A KEK mestre reside no Hardware Security Module (KMS). Para cada paciente é criada uma Data Encryption Key (DEK) única em AES-256-GCM.',
    sub: 'Camada Criptográfica'
  },
  {
    step: '3. Field-Level Encryption',
    title: 'Colunas de PII e Prontuários Encriptadas',
    desc: 'Nem invasores nem DBAs com acesso direto ao banco PostgreSQL conseguem ler nomes, CPFs, áudios ou notas SOAP.',
    sub: 'Camada de Banco'
  },
  {
    step: '4. Blind Indexing',
    title: 'Buscas por HMAC-SHA256',
    desc: 'Pesquise pacientes por CPF ou e-mail com segurança matemática absoluta, sem jamais armazenar ou indexar dados em texto claro.',
    sub: 'Anonimização Matemática'
  },
  {
    step: '5. Trilha WORM',
    title: 'Auditoria Inviolável de Acesso',
    desc: 'Cada leitura, descriptografia ou exportação é gravada em armazenamento Write-Once-Read-Many com bloqueio temporal contra exclusão.',
    sub: 'Compliance & Auditoria'
  }
];

export const DOCUMENT_TEMPLATES = [
  {
    id: 'atestado',
    name: 'Atestado Psicológico',
    regulation: 'Resolução CFP nº 006/2019 (Art. 10)',
    purpose: 'Atestar condições psicológicas para finalidades específicas (afastamento, aptidão, etc.).',
    structure: 'Identificação • Descrição Justificada • Conclusão Fundamentada',
    previewContent: {
      title: 'ATESTADO PSICOLÓGICO',
      lawReference: 'Emitido nos termos da Resolução CFP nº 006/2019',
      therapist: 'Dra. Vanessa Andrade — CRP 06/142980',
      patient: 'Mariana Silva de Oliveira — CPF ***.482.918-**',
      body: 'Atesto, para os devidos fins de saúde ocupacional, que a paciente supra-identificada encontra-se em acompanhamento psicológico clínico sob meus cuidados profissionais desde 12/03/2026. A paciente apresenta sintomatologia compatível com sobrecarga adaptativa ocupacional, sendo recomendada a redução temporária de viagens a trabalho e concessão de 3 (três) dias de repouso para restauração psicossomática e continuidade das intervenções de manejo do estresse.',
      date: 'São Paulo, 26 de Setembro de 2026',
      signature: 'Documento assinado digitalmente com Certificado ICP-Brasil (PAdES) • Token de Autenticidade: 8b22-c0a1-94d9'
    }
  },
  {
    id: 'declaracao',
    name: 'Declaração de Comparecimento',
    regulation: 'Resolução CFP nº 006/2019 (Art. 9)',
    purpose: 'Comprovar presença, dia e horário do paciente ou responsável em sessão.',
    structure: 'Identificação • Texto Declaratório com Horários • Encerramento',
    previewContent: {
      title: 'DECLARAÇÃO DE COMPARECIMENTO',
      lawReference: 'Emitido nos termos da Resolução CFP nº 006/2019',
      therapist: 'Dra. Vanessa Andrade — CRP 06/142980',
      patient: 'Mariana Silva de Oliveira — CPF ***.482.918-**',
      body: 'Declaro, a pedido da parte interessada, que a sra. Mariana Silva de Oliveira compareceu à sessão de telepsicologia no dia 26/09/2026, no intervalo compreendido entre 14:00 e 14:50 horas, para atendimento clínico individualizado.',
      date: 'São Paulo, 26 de Setembro de 2026',
      signature: 'Documento assinado digitalmente com Certificado ICP-Brasil (PAdES) • Token de Autenticidade: 4df1-e89a-77bc'
    }
  },
  {
    id: 'relatorio',
    name: 'Relatório Psicológico',
    regulation: 'Resolução CFP nº 006/2019 (Art. 11)',
    purpose: 'Exposição técnica e fundamentada da evolução do processo terapêutico.',
    structure: 'Identificação • Demanda • Procedimento • Análise • Conclusão',
    previewContent: {
      title: 'RELATÓRIO PSICOLÓGICO',
      lawReference: 'Emitido nos termos da Resolução CFP nº 006/2019',
      therapist: 'Dra. Vanessa Andrade — CRP 06/142980',
      patient: 'Mariana Silva de Oliveira — CPF ***.482.918-**',
      body: '1. IDENTIFICAÇÃO DO PROCESSO: Avaliação de acompanhamento em psicoterapia breve. 2. DESCRIÇÃO DA DEMANDA: Queixa de episódios de taquicardia situacional e pensamentos intrusivos em reuniões corporativas. 3. PROCEDIMENTO: Realizadas 8 sessões estruturadas baseadas na TCC, com treino de respiração e diário de pensamentos. 4. ANÁLISE: Observou-se recuperação significativa da estabilidade emocional e remissão dos sintomas de despersonalização. 5. CONCLUSÃO: Encaminhamento satisfatório com alta parcial prevista para mais 4 sessões.',
      date: 'São Paulo, 26 de Setembro de 2026',
      signature: 'Documento assinado digitalmente com Certificado ICP-Brasil (PAdES) • Token de Autenticidade: 91fa-22bb-65de'
    }
  }
];

export const COMPARISON_DATA = [
  {
    feature: 'Conformidade com Resolução CFP 011/2018 (e-Psi)',
    terapiaInFoco: true,
    whatsappZoom: false,
    prontuarioGenerico: 'Parcial',
    iaGenerica: false
  },
  {
    feature: 'Envelope Encryption (AES-256-GCM + KMS) para Saúde',
    terapiaInFoco: true,
    whatsappZoom: false,
    prontuarioGenerico: false,
    iaGenerica: false
  },
  {
    feature: 'Diarização Clínica Automática ([Terapeuta] vs [Paciente])',
    terapiaInFoco: true,
    whatsappZoom: false,
    prontuarioGenerico: false,
    iaGenerica: 'Genérica'
  },
  {
    feature: 'Rascunho SOAP com Human-in-the-Loop Obrigatório',
    terapiaInFoco: true,
    whatsappZoom: false,
    prontuarioGenerico: false,
    iaGenerica: false
  },
  {
    feature: 'Google Meet sem atrito com Sala de Espera Automática',
    terapiaInFoco: true,
    whatsappZoom: false,
    prontuarioGenerico: false,
    iaGenerica: false
  },
  {
    feature: 'Guarda Legal de 5 Anos CFP vs Quarentena LGPD Art. 16',
    terapiaInFoco: true,
    whatsappZoom: false,
    prontuarioGenerico: false,
    iaGenerica: false
  },
  {
    feature: 'Emissão de Laudos com QR Code e Validação Pública',
    terapiaInFoco: true,
    whatsappZoom: false,
    prontuarioGenerico: 'Manual',
    iaGenerica: false
  },
  {
    feature: 'Garantia de Não-Treinamento de IA com Dados Clínicos',
    terapiaInFoco: true,
    whatsappZoom: false,
    prontuarioGenerico: false,
    iaGenerica: 'Risco Alto'
  }
];

export const FAQS = [
  {
    category: 'Ética & CFP',
    question: 'O Conselho Federal de Psicologia permite o uso de IA e transcrição em sessões?',
    answer: 'Sim, desde que observadas as Resoluções CFP nº 011/2018 (Telepsicologia) e o Código de Ética Profissional (Art. 9º sobre sigilo). O TerapiaInFoco foi concebido estritamente dentro da lei: 1) O paciente assina termo de consentimento livre e esclarecido explícito; 2) A IA atua unicamente como assistente de transcrição e formatação SOAP; 3) O princípio de "Human-in-the-Loop" é compulsório — nenhuma nota clínica é registrada ou assinada sem a conferência, edição e validação manual do psicólogo.'
  },
  {
    category: 'Segurança & LGPD',
    question: 'A inteligência artificial retém ou utiliza os dados dos meus pacientes para treinamento?',
    answer: 'Absolutamente não. Utilizamos provedores com certificação HIPAA / ISO 27001 e acordos contratuais de Zero Data Retention (como Vertex AI e Azure OpenAI Gov). O áudio e a transcrição bruta são criptografados com a chave única do paciente (DEK) e descartados da memória volátil imediatamente após o processamento. Nenhuma informação de paciente alimenta modelos globais de linguagem.'
  },
  {
    category: 'Segurança & LGPD',
    question: 'O que ocorre se o paciente solicitar exclusão de dados com base na LGPD (Art. 18)?',
    answer: 'O TerapiaInFoco implementa o fluxo de Quarentena e Harmonização Legal previsto no RFC-001: o direito ao esquecimento da LGPD encontra limite no cumprimento de obrigação legal do CFP (Resolução nº 001/2009 exige guarda de 5 anos). Quando o paciente solicita exclusão, o sistema anonimiza/pseudonimiza os dados de contato ativos e coloca o prontuário em cofre criptográfico trancado até o cumprimento do prazo de 5 anos, garantindo a proteção jurídica do psicólogo.'
  },
  {
    category: 'Google Meet & Prática',
    question: 'Por que usar o Google Meet em vez de salas de videoconferência próprias?',
    answer: 'Conforme detalhado no ADR-001 do nosso RFC, o Google Meet possui a maior estabilidade de banda do mundo, funciona perfeitamente no celular do paciente sem exigir instalações complexas e conta com infraestrutura nativa de transcrição. Além disso, nossas salas geradas configuram regras de knocking (sala de espera), impedindo que um paciente entre por acidente no atendimento de outro.'
  },
  {
    category: 'Prontuário & Documentos',
    question: 'Os documentos emitidos (atestados, declarações e laudos) são aceitos legalmente?',
    answer: 'Sim. Todos os documentos seguem rigorosamente a estrutura prevista na Resolução CFP nº 006/2019 e possuem suporte a assinatura digital ICP-Brasil (PAdES) e assinatura avançada (Lei nº 14.063/2020). Cada documento gerado acompanha um QR Code criptográfico que permite a empresas, escolas ou juízos validarem a autenticidade e integridade do atestado sem expor os dados sigilosos do prontuário.'
  }
];

export const PRICING_PLANS = [
  {
    id: 'starter',
    name: 'Autônomo',
    tagline: 'Ideal para quem está iniciando a prática clínica privada',
    monthlyPrice: 119,
    annualPrice: 95,
    popular: false,
    features: [
      'Até 40 sessões por mês',
      'Integração Google Meet com link automático',
      'Transcrição & Diarização com IA (20 horas/mês)',
      'Geração de notas SOAP com Human-in-the-Loop',
      'Prontuário eletrônico imutável (CFP nº 001/2009)',
      'Lembretes por E-mail e WhatsApp',
      'Criptografia AES-256-GCM ponta a ponta',
      'Suporte via chat prioritário'
    ],
    cta: 'Começar Teste de 14 Dias'
  },
  {
    id: 'pro',
    name: 'Pro Clínico',
    tagline: 'O mais escolhido por psicólogos com agenda ativa e foco em produtividade',
    monthlyPrice: 199,
    annualPrice: 159,
    popular: true,
    badge: 'Mais Popular',
    features: [
      'Sessões ilimitadas',
      'Google Meet ilimitado com sala de espera',
      'Transcrição & Diarização com IA ilimitada',
      'Geração avançada SOAP com comparação de sessões',
      'Emissão de Atestados, Laudos e Declarações (CFP 006/2019)',
      'Assinatura digital ICP-Brasil integrada com QR Code',
      'Cofre de guarda legal de 5 anos & Quarentena LGPD',
      'Blind Indexing & Trilha de Auditoria WORM',
      'Suporte VIP via WhatsApp dedicado'
    ],
    cta: 'Garantir Desconto de Lançamento'
  },
  {
    id: 'clinic',
    name: 'Clínicas & Espaços',
    tagline: 'Para consultórios compartilhados, clínicas multidisciplinares e equipes',
    monthlyPrice: 389,
    annualPrice: 310,
    popular: false,
    features: [
      'Múltiplos terapeutas com isolamento criptográfico por CRP',
      'Gestão unificada de agenda e secretária virtual',
      'Rateio e controle de salas do Google Meet',
      'Painel de compliance e DPO com logs de auditoria',
      'Relatórios gerenciais e exportação fiscal padronizada',
      'Backup de chaves multi-região (KMS redundancy)',
      'Treinamento de equipe e onboarding assistido',
      'SLA garantido de 99.9% com gerente de conta'
    ],
    cta: 'Falar com Consultor de Clínicas'
  }
];
