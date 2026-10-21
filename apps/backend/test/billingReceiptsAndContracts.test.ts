import { describe, it, expect, beforeEach } from 'bun:test';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { 
  ReceiptPurpose,
  BillingModality,
  PaymentMethod,
  PaymentStatus,
  UserRole
} from '@terapiainfoco/shared';
import { db } from '../src/db/memoryDb';
import { encryptField } from '../src/services/cryptoContext';
import { BillingReceiptService } from '../src/services/billingReceiptService';
import { app } from '../src/index';
import { resetDb, upsertPatient } from './helpers/db';

describe('Evolução de Produto RFC-001: Faturamento Clínico, Recibos de Honorários & Termos de Serviços (§3.6)', () => {
  const mockContext = {
    actorId: 'therapist-001',
    ipAddress: '127.0.0.1',
    userAgent: 'Bun-Test-Suite'
  };

  const patientId = 'pat-billing-001';
  const therapistId = 'therapist-001';

  beforeEach(async () => {
    await resetDb();

    await upsertPatient({
      id: patientId,
      therapistId,
      encryptedName: encryptField('Mariana Fernandes Souza'),
      encryptedEmail: encryptField('mariana.souza@exemplo.com'),
      encryptedPhone: encryptField('(11) 97777-8888'),
      encryptedCpf: encryptField('321.654.987-11'),
      cpfBindex: 'bindex-cpf-mariana',
      emailBindex: 'bindex-email-mariana',
      consentTranscriptionSigned: true,
      consentSignedAt: new Date(),
      createdAt: new Date('2026-01-10T10:00:00Z')
    });
  });

  describe('1. Conversor Numérico Monetário para Extenso', () => {
    it('deve converter valores monetários em centavos para texto por extenso formal', () => {
      expect(BillingReceiptService.numberToCurrencyWords(25000)).toBe('Duzentos e cinquenta reais');
      expect(BillingReceiptService.numberToCurrencyWords(15000)).toBe('Cento e cinquenta reais');
      expect(BillingReceiptService.numberToCurrencyWords(10000)).toBe('Cem reais');
      expect(BillingReceiptService.numberToCurrencyWords(100000)).toBe('Mil reais');
      expect(BillingReceiptService.numberToCurrencyWords(150000)).toBe('Mil e quinhentos reais');
      expect(BillingReceiptService.numberToCurrencyWords(25050)).toBe('Duzentos e cinquenta reais e cinquenta centavos');
    });
  });

  describe('2. Emissão de Recibo de Honorários Psicológicos (Receita / DMED / Convênio)', () => {
    it('deve emitir recibo oficial com número sequencial, valor por extenso, sessões e selo WORM', async () => {
      const receipt = await BillingReceiptService.generateReceipt({
        therapistId,
        dto: {
          patientId,
          purpose: ReceiptPurpose.CONVENIO_REIMBURSO,
          modality: BillingModality.PER_SESSION,
          sessionsCovered: [
            { data: '2026-02-01', horario: '14:00', modalidade: 'ONLINE' },
            { data: '2026-02-08', horario: '14:00', modalidade: 'ONLINE' }
          ],
          amountCents: 50000, // R$ 500,00
          paymentMethod: PaymentMethod.PIX,
          paymentDate: '2026-02-08',
          notes: 'Referente a 02 (duas) sessões de psicoterapia individual realizadas online.'
        },
        context: mockContext
      });

      expect(receipt.id).toBeDefined();
      expect(receipt.receiptNumber).toContain('REC-');
      expect(receipt.patientName).toBe('Mariana Fernandes Souza');
      expect(receipt.patientCpf).toBe('***.654.***-**');
      expect(receipt.amountCents).toBe(50000);
      expect(receipt.amountFormatted).toBe('R$ 500,00');
      expect(receipt.amountInWords).toBe('Quinhentos reais');
      expect(receipt.paymentMethod).toBe(PaymentMethod.PIX);
      expect(receipt.paymentStatus).toBe(PaymentStatus.PAID);
      expect(receipt.therapistCrp).toContain('CRP');
      expect(receipt.validationToken).toContain('rcb_');
      expect(receipt.validationUrl).toContain('/verify/receipt/');
      expect(receipt.wormAuditId).toContain('worm_');
      expect(receipt.documentHashSha256.length).toBe(64);

      // Validação de encriptação no banco
      const stored = db.receipts.get(receipt.id);
      expect(stored).toBeDefined();
      expect(stored?.encryptedPatientName.ciphertext).toBeDefined();
    });

    it('deve suportar responsável financeiro para pacientes menores ou dependentes', async () => {
      const receipt = await BillingReceiptService.generateReceipt({
        therapistId,
        dto: {
          patientId,
          financialResponsible: {
            nome: 'Carlos Eduardo Souza',
            cpf: '999.888.777-66',
            parentesco: 'Pai'
          },
          purpose: ReceiptPurpose.IRPF_CARNE_LEAO,
          modality: BillingModality.MONTHLY_PACKAGE,
          sessionsCovered: [
            { data: '2026-02-01', modalidade: 'ONLINE' },
            { data: '2026-02-08', modalidade: 'ONLINE' },
            { data: '2026-02-15', modalidade: 'ONLINE' },
            { data: '2026-02-22', modalidade: 'ONLINE' }
          ],
          amountCents: 100000,
          paymentMethod: PaymentMethod.BANK_TRANSFER,
          paymentDate: '2026-02-25'
        },
        context: mockContext
      });

      expect(receipt.financialResponsible).toBeDefined();
      expect(receipt.financialResponsible?.nome).toBe('Carlos Eduardo Souza');
      expect(receipt.amountFormatted).toBe('R$ 1.000,00');
      expect(receipt.amountInWords).toBe('Mil reais');
    });

    it('deve cancelar recibo registrando motivo e data', async () => {
      const receipt = await BillingReceiptService.generateReceipt({
        therapistId,
        dto: {
          patientId,
          purpose: ReceiptPurpose.SIMPLES_QUITACAO,
          modality: BillingModality.PER_SESSION,
          sessionsCovered: [{ data: '2026-02-01', modalidade: 'ONLINE' }],
          amountCents: 25000,
          paymentMethod: PaymentMethod.PIX
        },
        context: mockContext
      });

      const cancelled = BillingReceiptService.cancelReceipt({
        receiptId: receipt.id,
        cancelReason: 'Erro na data do atendimento informada pelo paciente.',
        context: mockContext
      });

      expect(cancelled.paymentStatus).toBe(PaymentStatus.CANCELLED);
      expect(cancelled.cancelReason).toBe('Erro na data do atendimento informada pelo paciente.');
      expect(cancelled.cancelledAt).toBeDefined();
    });

    it('deve validar recibo em portal público sem login resguardando LGPD com iniciais', async () => {
      const receipt = await BillingReceiptService.generateReceipt({
        therapistId,
        dto: {
          patientId,
          purpose: ReceiptPurpose.CONVENIO_REIMBURSO,
          modality: BillingModality.PER_SESSION,
          sessionsCovered: [{ data: '2026-02-10', modalidade: 'ONLINE' }],
          amountCents: 30000,
          paymentMethod: PaymentMethod.CREDIT_CARD
        },
        context: mockContext
      });

      const validation = BillingReceiptService.validatePublicReceipt(receipt.validationToken);

      expect(validation.success).toBe(true);
      expect(validation.valid).toBe(true);
      expect(validation.receipt).toBeDefined();
      expect(validation.receipt?.receiptNumber).toBe(receipt.receiptNumber);
      // Privacidade estrita: apenas iniciais
      expect(validation.receipt?.patientInitials).toBe('M. F. S.');
      expect(validation.receipt?.amountFormatted).toBe('R$ 300,00');
      expect(validation.receipt?.wormAuditId).toBe(receipt.wormAuditId);

      // Token inválido
      const invalid = BillingReceiptService.validatePublicReceipt('rcb_token_falso');
      expect(invalid.valid).toBe(false);
      expect(invalid.success).toBe(false);
    });

    it('deve listar recibos consolidando total faturado', async () => {
      await BillingReceiptService.generateReceipt({
        therapistId,
        dto: {
          patientId,
          purpose: ReceiptPurpose.SIMPLES_QUITACAO,
          modality: BillingModality.PER_SESSION,
          sessionsCovered: [{ data: '2026-02-01', modalidade: 'ONLINE' }],
          amountCents: 20000,
          paymentMethod: PaymentMethod.PIX
        },
        context: mockContext
      });

      await BillingReceiptService.generateReceipt({
        therapistId,
        dto: {
          patientId,
          purpose: ReceiptPurpose.SIMPLES_QUITACAO,
          modality: BillingModality.PER_SESSION,
          sessionsCovered: [{ data: '2026-02-08', modalidade: 'ONLINE' }],
          amountCents: 30000,
          paymentMethod: PaymentMethod.PIX
        },
        context: mockContext
      });

      const list = BillingReceiptService.listReceipts({ patientId, context: mockContext });
      expect(list.total).toBe(2);
      expect(list.totalAmountCents).toBe(50000);
      expect(list.totalFormatted).toBe('R$ 500,00');
    });
  });

  describe('3. Termo / Contrato de Honorários Clínicos (CFP)', () => {
    it('deve gerar termo de honorários com política de cancelamento, regras de pagamento e sigilo Art. 9º', async () => {
      const contract = await BillingReceiptService.createFeeContract({
        therapistId,
        dto: {
          patientId,
          sessionPriceCents: 25000,
          cancellationPolicyHours: 24,
          paymentDueDateRule: 'Ao final de cada atendimento via chave PIX profissional.',
          reajustRule: 'Anualmente com base no IPCA acumulado.'
        },
        context: mockContext
      });

      expect(contract.id).toBeDefined();
      expect(contract.patientName).toBe('Mariana Fernandes Souza');
      expect(contract.sessionPriceFormatted).toBe('R$ 250,00');
      expect(contract.cancellationPolicyHours).toBe(24);
      expect(contract.confidentialityTerms).toContain('Código de Ética Profissional do Psicólogo');
      expect(contract.status).toBe('ACTIVE');
      expect(contract.signedByPatient).toBe(true);
      expect(contract.contractHashSha256.length).toBe(64);
    });
  });

  describe('4. Rotas HTTP REST (/api/billing/receipts e /api/billing/fee-contracts)', () => {
    let authToken: string;

    beforeEach(async () => {
      // Login por HTTP: o limite de autenticação é compartilhado entre os arquivos da suíte
      await globalRateLimitStore.reset();
      const loginRes = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'psicologo@terapiainfoco.com.br',
          password: 'Senha@123456'
        })
      });
      const loginData = await loginRes.json() as any;
      authToken = loginData.accessToken;
    });

    it('Fluxo Completo de Faturamento via HTTP: POST /receipts -> GET público /receipts/validate/:token -> POST /receipts/cancel', async () => {
      // 1. Emissão de Recibo
      const resCreate = await app.request('/api/billing/receipts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          patientId,
          purpose: ReceiptPurpose.CONVENIO_REIMBURSO,
          modality: BillingModality.PER_SESSION,
          sessionsCovered: [{ data: '2026-02-12', horario: '15:00', modalidade: 'ONLINE' }],
          amountCents: 28000,
          paymentMethod: PaymentMethod.PIX
        })
      });

      expect(resCreate.status).toBe(201);
      const jsonCreate = await resCreate.json() as any;
      expect(jsonCreate.success).toBe(true);
      const receipt = jsonCreate.receipt;
      expect(receipt.amountFormatted).toBe('R$ 280,00');
      expect(receipt.validationToken).toBeDefined();

      // 2. Validação PÚBLICA do recibo por convênio (SEM token de login)
      const resVal = await app.request(`/api/billing/receipts/validate/${receipt.validationToken}`);
      expect(resVal.status).toBe(200);
      const jsonVal = await resVal.json() as any;
      expect(jsonVal.valid).toBe(true);
      expect(jsonVal.receipt.patientInitials).toBe('M. F. S.');
      expect(jsonVal.receipt.paymentStatus).toBe(PaymentStatus.PAID);

      // 3. Listagem de recibos
      const resList = await app.request(`/api/billing/receipts?patientId=${patientId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      expect(resList.status).toBe(200);
      const jsonList = await resList.json() as any;
      expect(jsonList.total).toBe(1);
      expect(jsonList.totalAmountCents).toBe(28000);

      // 4. Cancelamento de recibo
      const resCancel = await app.request('/api/billing/receipts/cancel', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          receiptId: receipt.id,
          cancelReason: 'Substituição por recibo com responsável financeiro.'
        })
      });
      expect(resCancel.status).toBe(200);
      const jsonCancel = await resCancel.json() as any;
      expect(jsonCancel.receipt.paymentStatus).toBe(PaymentStatus.CANCELLED);
    });

    it('POST /api/billing/fee-contracts via HTTP', async () => {
      const res = await app.request('/api/billing/fee-contracts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          patientId,
          sessionPriceCents: 22000,
          cancellationPolicyHours: 48
        })
      });

      expect(res.status).toBe(201);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.contract.sessionPriceFormatted).toBe('R$ 220,00');
      expect(json.contract.cancellationPolicyHours).toBe(48);
    });
  });
});
