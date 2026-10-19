/**
 * Link da sala de teleconsulta no próprio painel. Usa o endereço em que o usuário já está,
 * em vez do link absoluto gerado pelo backend (pensado para lembretes enviados por fora).
 */
export function teleconsultationLink(appointmentId: string): string {
  return `${window.location.origin}/?sala=${encodeURIComponent(appointmentId)}`;
}
