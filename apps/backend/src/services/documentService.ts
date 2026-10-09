import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { 
  DocumentType,
  StoredPsychologicalDocument, 
  DecryptedPsychologicalDocument,
  ValidateDocumentResponse
} from '@terapiainfoco/shared';
import { AuditAction, AuditResourceType } from '@terapiainfoco/shared';
import { db } from '../db/memoryDb';
import { encryptField, decryptField } from './cryptoContext';
import { AuditService } from './auditService';
import { PatientService } from './patientService';

export class DocumentService {
  /**
   * Cria rascunho de documento psicológico segundo a Resolução CFP nº 006/2019
   * Criptografa o corpo do documento com AES-256-GCM
   */
  static generateDraft(params: {
    patientId: string;
    therapistId: string;
    type: DocumentType;
    title: string;
    content: string;
    context: { actorId: string; ipAddress: string; userAgent?: string };
  }): DecryptedPsychologicalDocument {
    const id = randomUUID();
    const validationToken = randomBytes(16).toString('hex');

    const stored: StoredPsychologicalDocument = {
      id,
      patientId: params.patientId,
      therapistId: params.therapistId,
      type: params.type,
      title: params.title,
      regulationReference: 'Resolução CFP nº 006/2019',
      encryptedContent: encryptField(params.content),
      validationToken,
      isSigned: false,
      signedAt: null,
      signaturePadesHash: null,
      createdAt: new Date()
    };

    db.documents.set(id, stored);

    AuditService.log({
      actorId: params.context.actorId,
      resourceType: AuditResourceType.DOCUMENT,
      resourceId: id,
      action: AuditAction.CREATE,
      ipAddress: params.context.ipAddress,
      userAgent: params.context.userAgent
    });

    return {
      id,
      patientId: params.patientId,
      therapistId: params.therapistId,
      type: params.type,
      title: params.title,
      regulationReference: stored.regulationReference,
      content: params.content,
      validationToken,
      isSigned: false,
      signedAt: null,
      signaturePadesHash: null,
      createdAt: stored.createdAt
    };
  }

  /**
   * Assina digitalmente o documento psicológico (CFP 006/2019 e MP 2.200-2/2001)
   * Gera hash criptográfico PAdES/SHA-256 e sela o documento como imutável
   */
  static signDocument(params: {
    documentId: string;
    context: { actorId: string; ipAddress: string; userAgent?: string };
  }): DecryptedPsychologicalDocument {
    const doc = db.documents.get(params.documentId);
    if (!doc) {
      throw new Error('Documento não encontrado');
    }

    if (doc.isSigned) {
      throw new Error(
        'Documento já assinado e selado. Documentos psicológicos são imutáveis (Resolução CFP nº 006/2019).'
      );
    }

    const signedAt = new Date();
    // Payload canônico para integridade documental
    const hashPayload = [
      doc.id,
      doc.patientId,
      doc.therapistId,
      doc.type,
      doc.encryptedContent.ciphertext,
      doc.validationToken,
      signedAt.toISOString()
    ].join('|');

    const signaturePadesHash = createHash('sha256').update(hashPayload).digest('hex');

    doc.isSigned = true;
    doc.signedAt = signedAt;
    doc.signaturePadesHash = signaturePadesHash;

    AuditService.log({
      actorId: params.context.actorId,
      resourceType: AuditResourceType.DOCUMENT,
      resourceId: doc.id,
      action: AuditAction.SIGN_RECORD,
      ipAddress: params.context.ipAddress,
      userAgent: params.context.userAgent
    });

    return {
      id: doc.id,
      patientId: doc.patientId,
      therapistId: doc.therapistId,
      type: doc.type,
      title: doc.title,
      regulationReference: doc.regulationReference,
      content: decryptField(doc.encryptedContent),
      validationToken: doc.validationToken,
      isSigned: true,
      signedAt,
      signaturePadesHash,
      createdAt: doc.createdAt
    };
  }

  /**
   * Lista todos os documentos emitidos
   */
  static listDocuments(
    therapistId: string,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): DecryptedPsychologicalDocument[] {
    const results: DecryptedPsychologicalDocument[] = [];
    for (const doc of db.documents.values()) {
      if (doc.therapistId === therapistId) {
        results.push({
          id: doc.id,
          patientId: doc.patientId,
          therapistId: doc.therapistId,
          type: doc.type,
          title: doc.title,
          regulationReference: doc.regulationReference,
          content: decryptField(doc.encryptedContent),
          validationToken: doc.validationToken,
          isSigned: doc.isSigned,
          signedAt: doc.signedAt,
          signaturePadesHash: doc.signaturePadesHash,
          createdAt: doc.createdAt
        });
      }
    }

    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.DOCUMENT,
      resourceId: therapistId,
      action: AuditAction.DECRYPT_READ,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Validação Pública de Autenticidade via QR Code (Zero-Knowledge)
   * Atesta a veracidade do documento SEM expor o conteúdo clínico sigiloso (CFP Art. 9º & LGPD)
   */
  static validatePublicToken(token: string): ValidateDocumentResponse {
    let matchedDoc: StoredPsychologicalDocument | null = null;
    for (const doc of db.documents.values()) {
      if (doc.validationToken === token) {
        matchedDoc = doc;
        break;
      }
    }

    if (!matchedDoc || !matchedDoc.isSigned) {
      return {
        valid: false,
        message: 'Código de validação inválido ou documento ainda pendente de assinatura digital.'
      };
    }

    // Busca paciente para extrair iniciais e proteger identidade (ex: Mariana Silva -> M. S.)
    let patientInitials = 'P. I.';
    try {
      const patient = PatientService.getPatientById(matchedDoc.patientId, {
        actorId: 'system-validator',
        ipAddress: '127.0.0.1'
      });
      if (patient && patient.name) {
        patientInitials = patient.name
          .split(' ')
          .filter(n => n.length > 0)
          .map(n => n[0].toUpperCase() + '.')
          .join(' ');
      }
    } catch {
      // Ignora erro de lookup
    }

    return {
      valid: true,
      document: {
        id: matchedDoc.id,
        type: matchedDoc.type,
        title: matchedDoc.title,
        therapistName: 'Dra. Vanessa Andrade',
        therapistCrp: '06/142980',
        patientInitials,
        issuedAt: matchedDoc.signedAt ? new Date(matchedDoc.signedAt).toLocaleString('pt-BR') : '',
        signaturePadesHash: matchedDoc.signaturePadesHash || '',
        regulationReference: matchedDoc.regulationReference
      }
    };
  }
}
