import { describe, expect, it, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { DocumentType, UserRole, PLATFORM_SIGNATURE_ISSUER } from '@terapiainfoco/shared';
import { resetDb } from './helpers/db';

describe('Geração Server-Side de PDF & Assinatura Digital ICP-Brasil (Opção D - RFC-001 & CFP nº 006/2019)', () => {
  let authToken = '';

  beforeEach(async () => {
    await resetDb();
    await globalRateLimitStore.reset();

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

  const sign = (docId: string, body: unknown = {}) =>
    app.request(`/api/documents/${docId}/sign-icp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify(body)
    });

  it('assina com a assinatura eletrônica da plataforma, sem se apresentar como ICP-Brasil', async () => {
    const { doc } = await createTestPatientAndDocument(DocumentType.ATESTADO);

    const signRes = await sign(doc.id);
    expect(signRes.status).toBe(200);
    const signedDoc = (await signRes.json()).document;
    expect(signedDoc.isSigned).toBe(true);
    expect(signedDoc.signaturePadesHash).toHaveLength(64);
    expect(signedDoc.icpSignature.certificate).toMatchObject({
      issuer: PLATFORM_SIGNATURE_ISSUER,
      certificateType: 'NONE',
      complianceIcpBrasil: false,
      cpf: ''
    });
    expect(signedDoc.icpSignature.timestampToken).toStartWith('PLATAFORMA-');

    // Validação pública mostra a mesma natureza da assinatura
    const publicData = await (await app.request(`/api/documents/validate/${doc.validationToken}`)).json();
    expect(publicData.valid).toBe(true);
    expect(publicData.document.icpSignature.certificate.issuer).toBe(PLATFORM_SIGNATURE_ISSUER);
    expect(publicData.document.therapistName).toBe('Dra. Beatriz Santos'); // titular do consultório do documento

    const pdfRes = await app.request(`/api/documents/${doc.id}/pdf`, { headers: { Authorization: `Bearer ${authToken}` } });
    expect(pdfRes.status).toBe(200);
    expect((await pdfRes.arrayBuffer()).byteLength).toBeGreaterThan(1500);
  });

  it('ignora certificado "ICP-Brasil" enviado pelo navegador', async () => {
    const { doc } = await createTestPatientAndDocument(DocumentType.ATESTADO);
    const forged = {
      subject: 'Fulano:00000000000',
      issuer: 'AC Soluti Multipla v5 (ICP-Brasil)',
      serialNumber: 'ABC',
      validFrom: '2020-01-01T00:00:00.000Z',
      validTo: '2099-01-01T00:00:00.000Z',
      cpf: '000.000.000-00',
      certificateType: 'A1',
      complianceIcpBrasil: true
    };
    const signedDoc = (await (await sign(doc.id, { certificate: forged, signatureBase64: 'x' })).json()).document;
    expect(signedDoc.icpSignature.certificate.complianceIcpBrasil).toBe(false);
    expect(signedDoc.icpSignature.certificate.issuer).toBe(PLATFORM_SIGNATURE_ISSUER);
    expect(signedDoc.icpSignature.certificate.subject).not.toContain('Fulano');
  });

  it('deve garantir imutabilidade: rejeitar tentativa de re-assinar documento', async () => {
    const { doc } = await createTestPatientAndDocument(DocumentType.DECLARACAO);
    expect((await sign(doc.id)).status).toBe(200);
    const secondSign = await sign(doc.id);
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
      body: JSON.stringify({})
    });
    expect(unauthorizedSign.status).toBe(401);
  });
});
