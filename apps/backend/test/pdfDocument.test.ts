import { describe, expect, it, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { IcpBrasilService } from '../src/services/icpBrasilService';
import { DocumentType, UserRole } from '@terapiainfoco/shared';

describe('Geração Server-Side de PDF & Assinatura Digital ICP-Brasil (Opção D - RFC-001 & CFP nº 006/2019)', () => {
  let authToken = '';

  beforeEach(async () => {
    db.clear();
    globalRateLimitStore.reset();

    // Obtém token de autenticação como Psicóloga Titular
    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'psicologo@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    const loginData = await loginRes.json();
    authToken = loginData.accessToken;
  });

  async function createTestPatientAndDocument(type: DocumentType = DocumentType.ATESTADO) {
    // 1. Cadastra paciente
    const patientRes = await app.request('/api/patients', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        therapistId: 'therapist-001',
        name: 'Mariana Silva de Oliveira',
        email: 'mariana.silva@email.com',
        phone: '11987654321',
        cpf: '123.456.789-00',
        consentTranscriptionSigned: true
      })
    });
    const patientData = await patientRes.json();
    const patientId = patientData.patient.id;

    // 2. Emite minuta de documento
    const titles: Record<DocumentType, string> = {
      [DocumentType.ATESTADO]: 'Atestado Psicológico para Fins de Afastamento',
      [DocumentType.RELATORIO]: 'Relatório Psicológico Multidisciplinar',
      [DocumentType.LAUDO]: 'Laudo Pericial Psicológico Avaliativo',
      [DocumentType.DECLARACAO]: 'Declaração de Acompanhamento Psicoterápico'
    };

    const docRes = await app.request('/api/documents/draft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        patientId,
        therapistId: 'therapist-001',
        type,
        title: titles[type],
        content: `Atesto para os devidos fins que o(a) paciente Mariana Silva de Oliveira encontra-se sob acompanhamento clínico contínuo conforme diretrizes da Resolução CFP nº 006/2019.`
      })
    });

    const docData = await docRes.json();
    return { patientId, doc: docData.document };
  }

  it('deve gerar e realizar streaming de PDF timbrado A4 com QR Code dinâmico para os 4 modelos CFP', async () => {
    const types = [
      DocumentType.ATESTADO,
      DocumentType.RELATORIO,
      DocumentType.LAUDO,
      DocumentType.DECLARACAO
    ];

    for (const type of types) {
      const { doc } = await createTestPatientAndDocument(type);

      const pdfRes = await app.request(`/api/documents/${doc.id}/pdf`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      expect(pdfRes.status).toBe(200);
      expect(pdfRes.headers.get('Content-Type')).toBe('application/pdf');
      expect(pdfRes.headers.get('Content-Disposition')).toContain(`documento-cfp-${doc.id.slice(0, 8)}.pdf`);

      const buffer = await pdfRes.arrayBuffer();
      expect(buffer.byteLength).toBeGreaterThan(1000);

      // Valida assinatura binária do cabeçalho PDF (%PDF-)
      const headerStr = new TextDecoder().decode(new Uint8Array(buffer.slice(0, 5)));
      expect(headerStr).toBe('%PDF-');
    }
  });

  it('deve preparar documento para assinatura ICP-Brasil calculando o digest canônico SHA-256', async () => {
    const { doc } = await createTestPatientAndDocument(DocumentType.LAUDO);

    const prepRes = await app.request(`/api/documents/${doc.id}/prepare-icp-signature`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` }
    });

    expect(prepRes.status).toBe(200);
    const body = await prepRes.json();

    expect(body.success).toBe(true);
    expect(body.documentId).toBe(doc.id);
    expect(body.sha256Digest).toBeDefined();
    expect(body.sha256Digest.length).toBe(64); // SHA-256 hex string
    expect(body.validationToken).toBe(doc.validationToken);
    expect(body.validationUrl).toContain(doc.validationToken);
  });

  it('deve assinar documento com Certificado Digital ICP-Brasil e carimbo do tempo TSA RFC 3161', async () => {
    const { doc } = await createTestPatientAndDocument(DocumentType.ATESTADO);

    // Certificado A1 mock credenciado na AC Soluti / ICP-Brasil
    const mockCert = IcpBrasilService.generateMockIcpCertificate('Dra. Vanessa Andrade', '06/142980');

    const signRes = await app.request(`/api/documents/${doc.id}/sign-icp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        signatureBase64: 'MEYCIQCc9d1k2L4k7z5...mock-signature-der-base64...',
        certificate: mockCert
      })
    });

    expect(signRes.status).toBe(200);
    const signData = await signRes.json();
    expect(signData.success).toBe(true);

    const signedDoc = signData.document;
    expect(signedDoc.isSigned).toBe(true);
    expect(signedDoc.signaturePadesHash).toBeDefined();
    expect(signedDoc.icpSignature).toBeDefined();
    expect(signedDoc.icpSignature.certificate.complianceIcpBrasil).toBe(true);
    expect(signedDoc.icpSignature.certificate.issuer).toContain('ICP-Brasil');
    expect(signedDoc.icpSignature.timestampToken).toContain('TSA-ICP-BRASIL');
    expect(signedDoc.icpSignature.padesSubFilter).toBe('ETSI.CAdES.detached');

    // Validação Pública via QR Code Zero-Knowledge deve retornar metadados ICP-Brasil
    const publicValRes = await app.request(`/api/documents/validate/${doc.validationToken}`);
    expect(publicValRes.status).toBe(200);
    const publicData = await publicValRes.json();
    expect(publicData.valid).toBe(true);
    expect(publicData.document.icpSignature).toBeDefined();
    expect(publicData.document.icpSignature.certificate.issuer).toContain('ICP-Brasil');
    expect(publicData.document.therapistName).toBe('Dra. Vanessa Andrade');

    // PDF gerado pós-assinatura deve ser renderizado com êxito
    const pdfRes = await app.request(`/api/documents/${doc.id}/pdf`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    expect(pdfRes.status).toBe(200);
    const pdfBuffer = await pdfRes.arrayBuffer();
    expect(pdfBuffer.byteLength).toBeGreaterThan(1500);
  });

  it('deve rejeitar assinatura com certificado não credenciado na ICP-Brasil', async () => {
    const { doc } = await createTestPatientAndDocument(DocumentType.ATESTADO);

    const invalidCert = {
      ...IcpBrasilService.generateMockIcpCertificate(),
      complianceIcpBrasil: false
    };

    const signRes = await app.request(`/api/documents/${doc.id}/sign-icp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        signatureBase64: 'mock-sig-base64',
        certificate: invalidCert
      })
    });

    expect(signRes.status).toBe(400);
    const body = await signRes.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('ICP-Brasil');
  });

  it('deve rejeitar certificado expirado', async () => {
    const { doc } = await createTestPatientAndDocument(DocumentType.ATESTADO);

    const expiredCert = {
      ...IcpBrasilService.generateMockIcpCertificate(),
      validFrom: '2020-01-01T00:00:00.000Z',
      validTo: '2021-01-01T00:00:00.000Z'
    };

    const signRes = await app.request(`/api/documents/${doc.id}/sign-icp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        signatureBase64: 'mock-sig-base64',
        certificate: expiredCert
      })
    });

    expect(signRes.status).toBe(400);
    const body = await signRes.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('expirado');
  });

  it('deve garantir imutabilidade: rejeitar tentativa de re-assinar documento com ICP-Brasil', async () => {
    const { doc } = await createTestPatientAndDocument(DocumentType.DECLARACAO);
    const cert = IcpBrasilService.generateMockIcpCertificate();

    // Primeira assinatura
    const firstSign = await app.request(`/api/documents/${doc.id}/sign-icp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        signatureBase64: 'mock-sig-base64',
        certificate: cert
      })
    });
    expect(firstSign.status).toBe(200);

    // Segunda assinatura deve falhar por imutabilidade ética
    const secondSign = await app.request(`/api/documents/${doc.id}/sign-icp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        signatureBase64: 'mock-sig-base64',
        certificate: cert
      })
    });
    expect(secondSign.status).toBe(400);
    const body = await secondSign.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('já assinado');
  });

  it('deve bloquear acesso a endpoints protegidos sem token JWT válido (401)', async () => {
    const { doc } = await createTestPatientAndDocument(DocumentType.ATESTADO);

    const unauthorizedPdf = await app.request(`/api/documents/${doc.id}/pdf`);
    expect(unauthorizedPdf.status).toBe(401);

    const unauthorizedPrep = await app.request(`/api/documents/${doc.id}/prepare-icp-signature`, {
      method: 'POST'
    });
    expect(unauthorizedPrep.status).toBe(401);

    const unauthorizedSign = await app.request(`/api/documents/${doc.id}/sign-icp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signatureBase64: 'sig',
        certificate: IcpBrasilService.generateMockIcpCertificate()
      })
    });
    expect(unauthorizedSign.status).toBe(401);
  });
});
