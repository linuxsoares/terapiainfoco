/**
 * E2E da teleconsulta própria: psicólogo e paciente em dois contextos do Chrome, com câmera e
 * microfone simulados, conectando uma chamada WebRTC real pela sinalização do backend.
 *
 * Pré-requisitos: backend (DEMO_MODE) e frontend rodando (`make dev`) e Google Chrome instalado.
 * Uso: bun run e2e:teleconsulta   (FRONTEND_URL, CHROME_PATH e SCREENSHOT_DIR opcionais)
 * Para validar a transcrição sem custo, suba o backend com STT_PROVIDER=simulated.
 * Cada execução faz 2 logins: o limite anti-força-bruta (5/min por IP) permite 2 execuções por minuto.
 */
import { chromium, type Page } from 'playwright-core';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5174';
const CHROME_PATH = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR;
const API_URL = process.env.API_URL ?? 'http://localhost:3000/api';
const DEMO_PATIENT_ID = '00000000-0000-0000-0000-000000000002';

/** Cria uma consulta nova (cada execução usa a própria sala) com o token da sessão da psicóloga */
async function createAppointment(page: Page): Promise<string> {
  return page.evaluate(async ({ apiUrl, patientId }) => {
    const token = localStorage.getItem('terapiainfoco_access_token');
    for (let attempt = 0; attempt < 5; attempt++) {
      const start = new Date(Date.now() + (30 + Math.floor(Math.random() * 300)) * 86_400_000);
      start.setUTCHours(10 + Math.floor(Math.random() * 8), 0, 0, 0);
      const res = await fetch(`${apiUrl}/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ patientId, scheduledStart: start.toISOString(), scheduledEnd: new Date(start.getTime() + 50 * 60_000).toISOString() })
      });
      if (res.ok) return (await res.json()).appointment.id as string;
    }
    throw new Error('Não foi possível criar a consulta de teste');
  }, { apiUrl: API_URL, patientId: DEMO_PATIENT_ID });
}

async function remoteVideoPlaying(page: Page): Promise<boolean> {
  return page.$eval('[data-testid="remote-video"]', (el) => {
    const video = el as HTMLVideoElement;
    return video.videoWidth > 0 && !video.paused && video.readyState >= 2;
  }).catch(() => false);
}

async function waitFor(check: () => Promise<boolean>, label: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Tempo esgotado aguardando: ${label}`);
}

const browser = await chromium.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
});

try {
  const therapistContext = await browser.newContext({ permissions: ['camera', 'microphone'], viewport: { width: 1280, height: 860 } });
  const patientContext = await browser.newContext({ permissions: ['camera', 'microphone'], viewport: { width: 1280, height: 860 } });
  const therapist = await therapistContext.newPage();
  const patient = await patientContext.newPage();

  // Psicóloga demo entra, agenda uma consulta nova e abre a sala pelo link (?sala=)
  await therapist.goto(FRONTEND_URL);
  await therapist.getByText('Demo Psicóloga (Dra. Beatriz)').first().click();
  await therapist.getByRole('button', { name: /Agenda & Teleconsulta/ }).first().waitFor();
  const appointmentId = await createAppointment(therapist);
  await therapist.goto(`${FRONTEND_URL}/?sala=${appointmentId}`);
  await therapist.getByTestId('stage-message').waitFor();
  console.log(`✓ Psicóloga na sala da consulta ${appointmentId}`);

  // Paciente demo entra pelo link da sala, faz login e bate à porta
  await patient.goto(`${FRONTEND_URL}/?sala=${appointmentId}`);
  // Atalho demo do modal de login, aberto automaticamente pelo link da sala
  await patient.getByRole('button', { name: '🌿 Paciente (Mariana Silva)' }).click();
  await patient.getByRole('button', { name: /Entrar na sala de espera/ }).click();
  await patient.getByText(/Você está na sala de espera/).waitFor();
  console.log('✓ Paciente na sala de espera');

  await therapist.getByRole('button', { name: /Admitir/ }).click({ timeout: 15_000 });
  console.log('✓ Paciente admitida');

  await waitFor(() => remoteVideoPlaying(therapist), 'vídeo da paciente na tela da psicóloga');
  await waitFor(() => remoteVideoPlaying(patient), 'vídeo da psicóloga na tela da paciente');
  console.log('✓ Chamada conectada nos dois sentidos');

  // Transcrição ao vivo (quando o backend tem STT configurado, ex.: STT_PROVIDER=simulated)
  const indicator = await therapist.getByTestId('transcription-indicator').innerText().catch(() => '');
  if (/Transcrevendo/.test(indicator)) {
    await therapist.getByRole('button', { name: 'Ver transcrição da sessão' }).click();
    await waitFor(async () => {
      // Falha do provedor de STT aparece na sala: reporta em vez de só esgotar o tempo
      const providerError = await therapist.getByText(/^Transcrição: /).first().innerText({ timeout: 200 }).catch(() => null);
      if (providerError) throw new Error(`Transcrição falhou na sala: ${providerError}`);
      const lines = await therapist.getByTestId('transcript-panel').locator('li').allInnerTexts();
      return lines.some((l) => l.startsWith('Você')) && lines.some((l) => !l.startsWith('Você'));
    }, 'falas dos dois participantes na transcrição', 40_000);
    console.log('✓ Transcrição recebida dos dois participantes (sem gravação)');
  } else {
    console.log(`• Transcrição não verificada: ${indicator || 'indicador ausente'}`);
  }

  if (SCREENSHOT_DIR) {
    await therapist.screenshot({ path: `${SCREENSHOT_DIR}/sala-psicologa.png` });
    await patient.screenshot({ path: `${SCREENSHOT_DIR}/sala-paciente.png` });
  }

  await therapist.getByRole('button', { name: /Encerrar sessão/ }).click();
  await patient.getByText('Sessão encerrada.').waitFor({ timeout: 15_000 });
  console.log('✓ Encerramento refletido para a paciente');
  console.log('E2E da teleconsulta: OK');
} finally {
  await browser.close();
}
