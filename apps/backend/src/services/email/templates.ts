/**
 * Textos dos e-mails transacionais (texto puro + HTML simples, sem dados clínicos).
 */
export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function layout(paragraphs: string[], action?: { label: string; href: string }): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${p}</p>`).join('');
  const button = action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(action.href)}" style="background:#0d9488;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">${escapeHtml(action.label)}</a></p>`
    : '';
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#0f172a;max-width:520px">${body}${button}<p style="margin:24px 0 0;font-size:12px;color:#64748b">TerapiaInFoco · Gestão clínica e teleconsulta</p></div>`;
}

export function passwordResetEmail(name: string, link: string): EmailContent {
  const first = name.split(' ')[0] || name;
  return {
    subject: 'Redefinição de senha no TerapiaInFoco',
    text: `Olá, ${first}.\n\nRecebemos um pedido para redefinir a senha da sua conta. Use o link abaixo em até 30 minutos:\n${link}\n\nSe não foi você, ignore este e-mail: sua senha continua a mesma.`,
    html: layout(
      [
        `Olá, ${escapeHtml(first)}.`,
        'Recebemos um pedido para redefinir a senha da sua conta. O link vale por 30 minutos e só pode ser usado uma vez.',
        'Se não foi você, ignore este e-mail: sua senha continua a mesma.'
      ],
      { label: 'Redefinir senha', href: link }
    )
  };
}

export function emailVerificationEmail(name: string, link: string): EmailContent {
  const first = name.split(' ')[0] || name;
  return {
    subject: 'Confirme seu e-mail no TerapiaInFoco',
    text: `Olá, ${first}.\n\nConfirme o e-mail da sua conta pelo link abaixo (válido por 48 horas):\n${link}\n\nSe você não criou uma conta no TerapiaInFoco, ignore este e-mail.`,
    html: layout(
      [
        `Olá, ${escapeHtml(first)}.`,
        'Confirme o e-mail da sua conta para receber avisos de agendamento e recuperar a senha quando precisar. O link vale por 48 horas.',
        'Se você não criou uma conta no TerapiaInFoco, ignore este e-mail.'
      ],
      { label: 'Confirmar e-mail', href: link }
    )
  };
}
