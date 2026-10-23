import { config } from '../../config';

/**
 * Envio de e-mail transacional (recuperação de senha, verificação, agendamentos).
 * O conteúdo nunca traz dados clínicos: só nome, links e dados da consulta.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailSender {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

/** Resend (https://resend.com) via API HTTP, sem dependências */
class ResendEmailSender implements EmailSender {
  readonly name = 'resend';

  async send(message: EmailMessage): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.email.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.email.from, to: [message.to], subject: message.subject, text: message.text, html: message.html })
    });
    if (!res.ok) {
      const detail = await res.json().then((b: any) => b?.message as string | undefined).catch(() => undefined);
      throw new Error(`Provedor de e-mail recusou a mensagem (HTTP ${res.status}${detail ? `: ${detail}` : ''}).`);
    }
  }
}

/** Desenvolvimento: escreve a mensagem no log em vez de enviar. Bloqueado em produção. */
class LogEmailSender implements EmailSender {
  readonly name = 'log';

  async send(message: EmailMessage): Promise<void> {
    console.log(`✉️  [e-mail não enviado: EMAIL_PROVIDER=log] Para: ${message.to} | ${message.subject}\n${message.text}`);
  }
}

function createSender(): EmailSender | null {
  switch (config.email.provider) {
    case 'resend':
      return config.email.resendApiKey ? new ResendEmailSender() : null;
    case 'log':
      return config.isProduction ? null : new LogEmailSender();
    default:
      return null;
  }
}

let sender: EmailSender | null | undefined;

/** null quando não há provedor configurado: o envio é registrado como indisponível */
export function getEmailSender(): EmailSender | null {
  if (sender === undefined) sender = createSender();
  return sender;
}

/** Testes: injeta um remetente falso (ou null para desligar) */
export function setEmailSenderForTests(next: EmailSender | null | undefined): void {
  sender = next;
}

/** Envia sem derrubar o fluxo de quem chama; falhas e ausência de provedor vão para o log */
export async function sendEmailSafely(message: EmailMessage): Promise<boolean> {
  const current = getEmailSender();
  if (!current) {
    console.warn(`⚠️ E-mail "${message.subject}" não enviado: nenhum provedor configurado (EMAIL_PROVIDER/RESEND_API_KEY).`);
    return false;
  }
  try {
    await current.send(message);
    return true;
  } catch (err: any) {
    console.warn(`⚠️ Falha ao enviar e-mail "${message.subject}": ${err.message}`);
    return false;
  }
}
