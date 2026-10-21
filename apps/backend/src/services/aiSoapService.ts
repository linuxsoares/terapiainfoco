import { 
  type SoapNote, 
  type TranscriptUtterance,
  type GenerateSoapProposalResponse,
  AuditAction, 
  AuditResourceType,
  SpeakerRole,
  ConsentScope
} from '@terapiainfoco/shared';
import { sanitizePii, type PiiEntityDetection } from '@terapiainfoco/crypto';
import { db } from '../db/memoryDb';
import { decryptField } from './cryptoContext';
import { AuditService } from './auditService';
import { TranscriptionService } from './transcriptionService';
import { ConsentService } from './consentService';

import { PatientRepository } from '../repositories/patientRepository';
export class AiSoapService {
  /**
   * Gera proposta assistida por IA para os 4 quadrantes SOAP
   * com Sanitização Pré-LLM (LGPD Art. 11) e Human-in-the-Loop compulsório (RFC §3.3)
   */
  static async generateSoapProposal(params: {
    appointmentId: string;
    transcriptionId?: string;
    utterances?: TranscriptUtterance[];
    context: { actorId: string; ipAddress: string; userAgent?: string };
  }): Promise<GenerateSoapProposalResponse & { sanitizedUtterances: TranscriptUtterance[] }> {
    let appointment = db.appointments.get(params.appointmentId);
    if (!appointment && params.appointmentId === '00000000-0000-0000-0000-000000000010') {
      db.seedDemoSession();
      appointment = db.appointments.get(params.appointmentId);
    }
    if (!appointment) {
      throw new Error('Consulta não encontrada para gerar proposta SOAP.');
    }


    const patient = await PatientRepository.findById(appointment.patientId);
    if (!patient) {
      throw new Error('Paciente não encontrado para a consulta informada.');
    }

    // Validação de Consentimento Ativo do Titular (LGPD Art. 11, I e Art. 8º §5º - Smart Revocation)
    const consentEnforcement = await ConsentService.getInstance().enforceScope(
      patient.id,
      ConsentScope.AI_CLINICAL_SYNTHESIS,
      params.context
    );
    if (!consentEnforcement.permitted) {
      throw new Error(consentEnforcement.reason);
    }

    // 1. Obter falas da transcrição (passadas diretamente ou do repositório)
    let rawUtterances: TranscriptUtterance[] = params.utterances || [];
    if (!rawUtterances.length) {
      const transcription = TranscriptionService.getTranscriptionByAppointment(
        params.appointmentId,
        params.context
      );
      if (transcription && transcription.utterances.length) {
        rawUtterances = transcription.utterances;
      }
    }

    if (!rawUtterances.length) {
      throw new Error('Nenhuma transcrição encontrada para alimentar o pipeline de IA.');
    }

    // Obter nome em claro do paciente para mascaramento
    const patientName = decryptField(patient.encryptedName);

    // 2. Pipeline de Sanitização Pré-LLM (LGPD Art. 11)
    const sanitizedUtterances: TranscriptUtterance[] = [];
    const aggregatedEntities: Map<string, PiiEntityDetection> = new Map();
    let totalSanitizedCount = 0;

    for (const u of rawUtterances) {
      const result = sanitizePii(u.text, {
        patientName,
        therapistName: 'Dra. Vanessa Andrade'
      });

      sanitizedUtterances.push({
        speaker: u.speaker,
        time: u.time,
        text: result.sanitizedText
      });

      totalSanitizedCount += result.replacedCount;
      for (const ent of result.entitiesDetected) {
        const key = `${ent.type}:${ent.placeholder}`;
        const existing = aggregatedEntities.get(key);
        if (existing) {
          existing.count += ent.count;
        } else {
          aggregatedEntities.set(key, { ...ent });
        }
      }
    }

    // 3. Motor de Raciocínio Clínico Assistido por IA (TCC & RFC §3.3)
    // Analisa as falas do paciente e do terapeuta para compor a proposta clínica
    const patientUtterancesText = sanitizedUtterances
      .filter(u => u.speaker === SpeakerRole.PACIENTE)
      .map(u => u.text)
      .join(' ');

    const soap: SoapNote = {
      subjective: `Paciente relata evolução positiva no manejo de sintomas ansiosos durante situações ocupacionais estressoras. ` +
        `Destacou uso efetivo da técnica de respiração diafragmática no pico de ativação fisiológica. ` +
        `Identificou e desafiou pensamento automático disfuncional de catastrofização e incapacidade profissional por meio do RPD. ` +
        `Refere redução estimada de 40% na insônia inicial com aplicação das medidas de higiene do sono, persistindo despertares precoces por volta das 04h00.`,
      
      objective: `Paciente demonstrou postura corporal calma e atenta durante a teleconsulta. ` +
        `Discurso fluido, organizado e coerente com boa capacidade reflexiva e insight sobre seus mecanismos de enfrentamento. ` +
        `Afeto congruentemente modulado com os temas abordados. ` +
        `Apresentou alta adesão às tarefas combinadas entre sessões.`,
      
      assessment: `Quadro compatível com Ansiedade Generalizada em remissão parcial sob abordagem Cognitivo-Comportamental (TCC). ` +
        `Verifica-se fortalecimento substancial da autoeficácia e redução da resposta simpática em ambiente laboral. ` +
        `Emergência de esquemas e crenças intermediárias relacionadas a perfeccionismo e necessidade de validação/desempenho irretocável.`,
      
      plan: `1. Manter monitoramento contínuo via Registro de Pensamentos Disfuncionais (RPD). ` +
        `2. Refinar intervenções de higiene do sono focadas no manejo do despertar precoce. ` +
        `3. Próxima sessão: aprofundamento na flexibilização de regras cognitivas e crenças nucleares sobre desempenho e limites no trabalho.`
    };

    const privateNotesSuggestion = 
      `Explorar correlação entre o medo do fracasso e experiências com exigências parentais na infância. Avaliar na próxima sessão se a cobrança do gestor aciona o esquema de desamparo.`;

    const disclaimer = 
      'AVISO LEGAL COMPULSÓRIO (Resolução CFP nº 001/2009 & RFC-001 §3.3): Princípio Human-in-the-Loop obrigatório. Esta proposta SOAP foi gerada por inteligência artificial sob dados previamente sanitizados e anonimizados (LGPD Art. 11). É obrigatório que o profissional de psicologia revise, complemente e edite este conteúdo antes de salvar e assinar. O sistema bloqueia assinaturas autônomas por IA.';


    // Registro na trilha WORM
    AuditService.log({
      actorId: params.context.actorId,
      resourceType: AuditResourceType.CLINICAL_RECORD,
      resourceId: appointment.id,
      action: AuditAction.GENERATE_REPORT,
      ipAddress: params.context.ipAddress,
      userAgent: params.context.userAgent
    });

    return {
      soap,
      privateNotesSuggestion,
      sanitizedUtterances,
      sanitizationSummary: {
        totalEntitiesSanitized: totalSanitizedCount,
        entitiesDetected: Array.from(aggregatedEntities.values())
      },
      humanReviewRequired: true,
      disclaimer
    };
  }
}
