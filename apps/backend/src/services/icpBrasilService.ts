import { createHash, randomBytes } from 'node:crypto';
import { db } from '../db/memoryDb';
import { DocumentService } from './documentService';
import { PdfGeneratorService } from './pdfGeneratorService';
import { PatientService } from './patientService';
import { auditService } from './auditService';
import type { 
  PrepareIcpSignatureResponse, 
  SignIcpDTO, 
  DecryptedPsychologicalDocument, 
  IcpCertificateInfo,
  IcpSignatureData 
} from '@terapiainfoco/shared';
import { AuditAction, AuditResourceType, PLATFORM_SIGNATURE_ISSUER } from '@terapiainfoco/shared';
import { UserRepository } from '../repositories/userRepository';
import { practiceProfessional } from './practiceProfessional';

export class IcpBrasilService {
  /**
   * Prepara o documento para assinatura digital qualificada ICP-Brasil
   * Gera o PDF e calcula o hash/digest canônico SHA-256
   */
  public static async prepareSignature(documentId: string): Promise<PrepareIcpSignatureResponse> {
    const doc = DocumentService.getDocumentById(documentId);
    if (!doc) {
      throw new Error('Documento não encontrado.');
    }

    const patient = await PatientService.getPatientById(doc.patientId, {
      actorId: 'icp-signer',
      ipAddress: '127.0.0.1'
    });

    const pdfBytes = await PdfGeneratorService.generateDocumentPdf({
      document: doc,
      patient
    });

    const sha256Digest = createHash('sha256').update(pdfBytes).digest('hex');

    return {
      documentId: doc.id,
      title: doc.title,
      sha256Digest,
      pdfHash: sha256Digest,
      validationToken: doc.validationToken,
      validationUrl: `https://terapiainfoco.com.br/#validar?token=${doc.validationToken}`
    };
  }

  /**
   * Assina o documento com a assinatura eletrônica da plataforma (quem assinou, quando e o hash
   * do conteúdo). Não é assinatura qualificada ICP-Brasil: para isso, o PDF deve ser assinado
   * pelo profissional com o próprio certificado ou no assinador do gov.br.
   */
  public static async signWithIcp(
    documentId: string,
    _dto: SignIcpDTO,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): Promise<DecryptedPsychologicalDocument> {
    const doc = db.documents.get(documentId);
    if (!doc) {
      throw new Error('Documento não encontrado.');
    }

    if (doc.isSigned && doc.icpSignature) {
      throw new Error('Documento já assinado. Documentos são imutáveis (CFP nº 006/2019).');
    }

    // Sem provedor ICP-Brasil integrado: o certificado enviado pelo navegador não é confiável e é
    // ignorado. Registra-se uma assinatura eletrônica da plataforma, com horário do servidor (sem TSA).
    const signer = await UserRepository.findById(context.actorId);
    const professional = await practiceProfessional(doc.therapistId);
    const cert = IcpBrasilService.platformSignatureCertificate(signer?.name ?? professional.name, signer?.crp || professional.crp);
    const now = new Date();
    const timestampToken = `PLATAFORMA-${now.toISOString()}-${randomBytes(8).toString('hex').toUpperCase()}`;
    const signatureHash = createHash('sha256')
      .update(`${doc.id}|${JSON.stringify(doc.encryptedContent)}|${cert.subject}|${timestampToken}`)
      .digest('hex');

    const icpSignature: IcpSignatureData = {
      certificate: cert,
      signatureHash,
      timestampToken,
      signedAt: now.toISOString(),
      padesSubFilter: 'ETSI.CAdES.detached'
    };

    doc.isSigned = true;
    doc.signedAt = now;
    doc.signaturePadesHash = signatureHash;
    doc.icpSignature = icpSignature;

    await auditService.logAccess({
      actorId: context.actorId,
      resourceType: AuditResourceType.DOCUMENT,
      resourceId: doc.id,
      action: AuditAction.SIGN_RECORD,
      ipAddress: context.ipAddress,
      userAgent: `Assinatura eletrônica da plataforma: ${cert.subject}, Serial=${cert.serialNumber}`
    });

    const decrypted = DocumentService.getDocumentById(doc.id);
    if (!decrypted) throw new Error('Erro ao carregar documento assinado.');
    return decrypted;
  }

  /**
   * Identificação da assinatura eletrônica da plataforma: nome e CRP de quem assinou, sem CPF
   * nem certificado (não é assinatura qualificada ICP-Brasil).
   */
  public static platformSignatureCertificate(signerName: string, crp: string): IcpCertificateInfo {
    const now = new Date().toISOString();
    return {
      subject: signerName,
      issuer: PLATFORM_SIGNATURE_ISSUER,
      serialNumber: randomBytes(8).toString('hex').toUpperCase(),
      validFrom: now,
      validTo: now,
      cpf: '',
      crp,
      certificateType: 'NONE',
      complianceIcpBrasil: false
    };
  }
}
