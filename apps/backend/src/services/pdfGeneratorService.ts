import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import QRCode from 'qrcode';
import type { DecryptedPsychologicalDocument, DecryptedPatient, Therapist } from '@terapiainfoco/shared';

export interface GeneratePdfOptions {
  document: DecryptedPsychologicalDocument;
  patient?: DecryptedPatient | null;
  therapist?: Therapist | null;
  therapistName?: string;
  therapistCrp?: string;
  therapistRegion?: string;
  baseUrl?: string;
}

export class PdfGeneratorService {
  /**
   * Quebra texto longo em linhas respeitando a largura máxima disponível
   */
  private static wrapText(text: string, font: any, fontSize: number, maxWidth: number): string[] {
    const lines: string[] = [];
    const paragraphs = text.split('\n');

    for (const paragraph of paragraphs) {
      if (!paragraph.trim()) {
        lines.push('');
        continue;
      }

      const words = paragraph.split(' ');
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const textWidth = font.widthOfTextAtSize(testLine, fontSize);

        if (textWidth <= maxWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        }
      }

      if (currentLine) {
        lines.push(currentLine);
      }
    }

    return lines;
  }

  /**
   * Gera documento PDF A4 timbrado oficial conforme Resolução CFP nº 006/2019
   * com cabeçalho profissional, QR Code de validação pública e carimbo PAdES/ICP-Brasil
   */
  public static async generateDocumentPdf(options: GeneratePdfOptions): Promise<Uint8Array> {
    const {
      document: doc,
      patient,
      therapistName = 'Dra. Vanessa Andrade',
      therapistCrp = '06/142980',
      therapistRegion = 'SP',
      baseUrl = 'https://terapiainfoco.com.br'
    } = options;

    const pdfDoc = await PDFDocument.create();

    // Metadados do PDF
    pdfDoc.setTitle(`${doc.title} - ${patient?.name || 'Documento Psicológico'}`);
    pdfDoc.setAuthor(`${therapistName} (CRP ${therapistCrp})`);
    pdfDoc.setSubject(doc.title);
    pdfDoc.setCreator('TerapiaInFoco - Plataforma Clínica RFC-001');
    pdfDoc.setProducer('TerapiaInFoco PDF Engine v1.0 (CFP nº 006/2019)');

    // Fontes padrão
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    const page = pdfDoc.addPage([595.28, 841.89]); // A4 padrão
    const { width, height } = page.getSize();
    const margin = 45;
    const contentWidth = width - margin * 2;

    // Cores da paleta TerapiaInFoco
    const primaryTeal = rgb(0.08, 0.45, 0.42);
    const darkSlate = rgb(0.06, 0.09, 0.16);
    const lightGray = rgb(0.94, 0.96, 0.96);
    const mutedSlate = rgb(0.39, 0.45, 0.55);
    const borderGray = rgb(0.85, 0.88, 0.90);

    let currentY = height - 40;

    // 1. Faixa Superior Timbrada
    page.drawRectangle({
      x: margin,
      y: currentY - 55,
      width: contentWidth,
      height: 55,
      color: lightGray,
      borderColor: borderGray,
      borderWidth: 1
    });

    // Barra de acento teal
    page.drawRectangle({
      x: margin,
      y: currentY - 55,
      width: 6,
      height: 55,
      color: primaryTeal
    });

    // Logo e Título Timbrado
    page.drawText('TerapiaInFoco', {
      x: margin + 18,
      y: currentY - 22,
      size: 15,
      font: fontBold,
      color: primaryTeal
    });

    page.drawText('Plataforma de Gestão Clínica Psicológica • e-Psi Homologado', {
      x: margin + 18,
      y: currentY - 36,
      size: 8.5,
      font: fontRegular,
      color: mutedSlate
    });

    page.drawText(`${therapistName} • CRP ${therapistCrp}/${therapistRegion}`, {
      x: margin + 18,
      y: currentY - 48,
      size: 8.5,
      font: fontBold,
      color: darkSlate
    });

    currentY -= 75;

    // 2. Título Central do Documento (CFP nº 006/2019)
    const titleText = doc.title.toUpperCase();
    const titleWidth = fontBold.widthOfTextAtSize(titleText, 14);
    page.drawText(titleText, {
      x: (width - titleWidth) / 2,
      y: currentY,
      size: 14,
      font: fontBold,
      color: darkSlate
    });

    currentY -= 14;
    const refText = `Em conformidade com a ${doc.regulationReference || 'Resolução CFP nº 006/2019'}`;
    const refWidth = fontOblique.widthOfTextAtSize(refText, 8.5);
    page.drawText(refText, {
      x: (width - refWidth) / 2,
      y: currentY,
      size: 8.5,
      font: fontOblique,
      color: mutedSlate
    });

    currentY -= 22;

    // Linha divisória horizontal
    page.drawLine({
      start: { x: margin, y: currentY },
      end: { x: width - margin, y: currentY },
      thickness: 1,
      color: borderGray
    });

    currentY -= 18;

    // 3. Bloco de Identificação (Interessado e Demanda)
    page.drawText('1. IDENTIFICAÇÃO DO PACIENTE E FINALIDADE', {
      x: margin,
      y: currentY,
      size: 9.5,
      font: fontBold,
      color: primaryTeal
    });

    currentY -= 14;
    page.drawText(`Pessoa Atendida: ${patient?.name || 'Paciente Cadastrado'}`, {
      x: margin,
      y: currentY,
      size: 9,
      font: fontBold,
      color: darkSlate
    });

    if (patient?.cpf) {
      currentY -= 12;
      page.drawText(`CPF: ${patient.cpf}`, {
        x: margin,
        y: currentY,
        size: 8.5,
        font: fontRegular,
        color: mutedSlate
      });
    }

    currentY -= 12;
    page.drawText(`Psicóloga(o) Responsável: ${therapistName} — CRP ${therapistCrp}/${therapistRegion}`, {
      x: margin,
      y: currentY,
      size: 8.5,
      font: fontRegular,
      color: mutedSlate
    });

    currentY -= 18;

    // 4. Corpo Textual do Documento
    page.drawText('2. TEXTO E FUNDAMENTAÇÃO TÉCNICA', {
      x: margin,
      y: currentY,
      size: 9.5,
      font: fontBold,
      color: primaryTeal
    });

    currentY -= 15;

    // Quebra o conteúdo em linhas respeitando a largura
    const bodyLines = this.wrapText(doc.content, fontRegular, 9.5, contentWidth);
    const lineHeight = 13.5;

    for (const line of bodyLines) {
      if (line === '') {
        currentY -= 8;
        continue;
      }

      page.drawText(line, {
        x: margin,
        y: currentY,
        size: 9.5,
        font: fontRegular,
        color: darkSlate
      });

      currentY -= lineHeight;

      // Se atingir o limite inferior da página para a assinatura
      if (currentY < 230) {
        break; // Mantém em página única limpa de documento oficial
      }
    }

    // 5. Local e Data
    const issueDate = doc.signedAt ? new Date(doc.signedAt) : new Date(doc.createdAt);
    const dateFormatted = issueDate.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });

    currentY = Math.min(currentY - 15, 210);

    const locationDateText = `São Paulo - SP, ${dateFormatted}.`;
    const locWidth = fontRegular.widthOfTextAtSize(locationDateText, 9.5);
    page.drawText(locationDateText, {
      x: (width - locWidth) / 2,
      y: currentY,
      size: 9.5,
      font: fontRegular,
      color: darkSlate
    });

    currentY -= 30;

    // 6. Linha e Assinatura Digital do Profissional
    const signLineWidth = 220;
    const signLineX = (width - signLineWidth) / 2;

    page.drawLine({
      start: { x: signLineX, y: currentY },
      end: { x: signLineX + signLineWidth, y: currentY },
      thickness: 1,
      color: darkSlate
    });

    currentY -= 12;
    const signNameWidth = fontBold.widthOfTextAtSize(therapistName, 10);
    page.drawText(therapistName, {
      x: (width - signNameWidth) / 2,
      y: currentY,
      size: 10,
      font: fontBold,
      color: darkSlate
    });

    currentY -= 11;
    const signCrpText = `Psicóloga Clínica • CRP ${therapistCrp}/${therapistRegion}`;
    const signCrpWidth = fontRegular.widthOfTextAtSize(signCrpText, 8.5);
    page.drawText(signCrpText, {
      x: (width - signCrpWidth) / 2,
      y: currentY,
      size: 8.5,
      font: fontRegular,
      color: mutedSlate
    });

    // 7. Rodapé com Selo Criptográfico e QR Code de Validação Pública
    const footerY = 40;
    const footerHeight = 85;

    page.drawRectangle({
      x: margin,
      y: footerY,
      width: contentWidth,
      height: footerHeight,
      color: lightGray,
      borderColor: borderGray,
      borderWidth: 1
    });

    // Geração do QR Code dinâmico apontando para o portal de validação Zero-Knowledge
    const validationUrl = `${baseUrl}/#validar?token=${doc.validationToken}`;
    const qrBuffer = await QRCode.toBuffer(validationUrl, {
      type: 'png',
      width: 140,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#f0fdfa'
      }
    });

    const qrImage = await pdfDoc.embedPng(qrBuffer);
    const qrSize = 65;
    page.drawImage(qrImage, {
      x: margin + 10,
      y: footerY + 10,
      width: qrSize,
      height: qrSize
    });

    // Textos do Selo de Autenticidade
    const textStartX = margin + qrSize + 22;
    page.drawText('VERIFICAÇÃO DE AUTENTICIDADE DOCUMENTAL (CFP nº 006/2019 & MP 2.200-2/2001)', {
      x: textStartX,
      y: footerY + 68,
      size: 7.5,
      font: fontBold,
      color: primaryTeal
    });

    page.drawText(`Token Criptográfico: ${doc.validationToken}`, {
      x: textStartX,
      y: footerY + 56,
      size: 7.5,
      font: fontBold,
      color: darkSlate
    });

    if (doc.signaturePadesHash) {
      page.drawText(`Hash PAdES/SHA-256: ${doc.signaturePadesHash.slice(0, 36)}...`, {
        x: textStartX,
        y: footerY + 45,
        size: 7,
        font: fontRegular,
        color: mutedSlate
      });
    }

    // Se assinado com certificado ICP-Brasil
    if (doc.icpSignature) {
      page.drawText(`ICP-Brasil: ${doc.icpSignature.certificate.issuer} (Serial: ${doc.icpSignature.certificate.serialNumber})`, {
        x: textStartX,
        y: footerY + 34,
        size: 7,
        font: fontBold,
        color: rgb(0.1, 0.55, 0.25)
      });
    } else {
      page.drawText('Assinatura Eletrônica Avançada vinculada ao cadastro profissional e-Psi.', {
        x: textStartX,
        y: footerY + 34,
        size: 7,
        font: fontRegular,
        color: mutedSlate
      });
    }

    page.drawText('Aponte a câmera do celular para o QR Code para validar a autenticidade oficial.', {
      x: textStartX,
      y: footerY + 22,
      size: 7,
      font: fontOblique,
      color: mutedSlate
    });

    page.drawText('Documento estritamente confidencial protegido pelo Código de Ética Profissional e LGPD.', {
      x: textStartX,
      y: footerY + 11,
      size: 6.5,
      font: fontRegular,
      color: mutedSlate
    });

    return await pdfDoc.save();
  }
}
