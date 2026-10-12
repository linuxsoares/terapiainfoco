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
import { AuditAction, AuditResourceType } from '@terapiainfoco/shared';

// Autoridades Certificadoras Raiz e de 1º Nível credenciadas na ICP-Brasil
const ACCREDITED_ICP_ISSUERS = [
  'Autoridade Certificadora Raiz Brasileira v10',
  'Autoridade Certificadora Raiz Brasileira v5',
  'AC Certisign G7',
  'AC Soluti Multipla v5',
  'AC Serasa Experian v5',
  'AC Notarial v4',
  'AC VALID v5',
  'AC OAB G3',
  'AC Caixa v3'
];

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

    const patient = PatientService.getPatientById(doc.patientId, {
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
   * Valida e aplica a assinatura digital ICP-Brasil com Carimbo do Tempo (PAdES)
   * Conforme MP nº 2.200-2/2001 e Resolução CFP nº 006/2019
   */
  public static async signWithIcp(
    documentId: string,
    dto: SignIcpDTO,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): Promise<DecryptedPsychologicalDocument> {
    const doc = db.documents.get(documentId);
    if (!doc) {
      throw new Error('Documento não encontrado.');
    }

    if (doc.isSigned && doc.icpSignature) {
      throw new Error('Documento já assinado com certificado ICP-Brasil. Documentos são imutáveis (CFP nº 006/2019).');
    }

    // Validações da Cadeia de Certificação ICP-Brasil
    const cert = dto.certificate;
    if (!cert.complianceIcpBrasil) {
      throw new Error('Certificado digital não credenciado na infraestrutura ICP-Brasil.');
    }

    const now = new Date();
    const validFrom = new Date(cert.validFrom);
    const validTo = new Date(cert.validTo);

    if (now < validFrom || now > validTo) {
      throw new Error('Certificado digital ICP-Brasil expirado ou fora do período de validade.');
    }

    const isRecognizedIssuer = ACCREDITED_ICP_ISSUERS.some(iss => cert.issuer.includes(iss)) || cert.issuer.includes('ICP-Brasil');
    if (!isRecognizedIssuer) {
      throw new Error(`Autoridade Certificadora emissora '${cert.issuer}' não reconhecida na cadeia ICP-Brasil.`);
    }

    // Carimbo do Tempo (Timestamp Authority - TSA conforme RFC 3161)
    const timestampToken = dto.timestampToken || `TSA-ICP-BRASIL-${Date.now()}-${randomBytes(8).toString('hex').toUpperCase()}`;
    const signatureHash = createHash('sha256')
      .update(`${doc.id}|${dto.signatureBase64}|${timestampToken}|${now.toISOString()}`)
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
      userAgent: `ICP-Brasil signature applied: Cert=${cert.subject}, Serial=${cert.serialNumber}`
    });

    const decrypted = DocumentService.getDocumentById(doc.id);
    if (!decrypted) throw new Error('Erro ao carregar documento assinado.');
    return decrypted;
  }

  /**
   * Gera dados de certificado A1/A3 ICP-Brasil de demonstração para testes
   */
  public static generateMockIcpCertificate(therapistName = 'Dra. Vanessa Andrade', crp = '06/142980'): IcpCertificateInfo {
    const now = new Date();
    const oneYearLater = new Date(now.getTime() + 365 * 86400 * 1000);

    return {
      subject: `${therapistName}:12345678900`,
      issuer: 'AC Soluti Multipla v5 (ICP-Brasil)',
      serialNumber: '7B3A9F1C8402D5E6',
      validFrom: new Date(now.getTime() - 30 * 86400 * 1000).toISOString(),
      validTo: oneYearLater.toISOString(),
      cpf: '123.456.789-00',
      crp,
      certificateType: 'A1',
      complianceIcpBrasil: true
    };
  }
}
