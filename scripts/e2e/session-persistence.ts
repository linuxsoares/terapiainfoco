/**
 * E2E da sessão: o login sobrevive ao recarregamento da página, o access token expirado é
 * renovado com o refresh token e o logout encerra a sessão de verdade.
 *
 * Pré-requisitos: backend (DEMO_MODE) e frontend rodando (`make dev`) e Google Chrome instalado.
 * Uso: bun run e2e:sessao   (FRONTEND_URL e CHROME_PATH opcionais)
 */
import { chromium } from 'playwright-core';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5174';
const CHROME_PATH = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Falhou: ${message}`);
}

const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
try {
  const page = await browser.newPage();
  await page.goto(FRONTEND_URL);
  await page.getByText('Demo Psicóloga (Dra. Beatriz)').first().click();
  await page.getByRole('button', { name: 'Meu Perfil Público' }).first().click();
  await page.getByRole('heading', { name: 'Meu Perfil Público' }).waitFor();

  // 1. Recarregar mantém o login e a tela aberta
  await page.reload();
  await page.getByRole('heading', { name: 'Meu Perfil Público' }).waitFor({ timeout: 15_000 });
  console.log('✓ Recarregar mantém o login e volta para a mesma tela');

  // 2. Access token inválido/expirado é renovado com o refresh token
  const refreshBefore = await page.evaluate(() => localStorage.getItem('terapiainfoco_refresh_token'));
  await page.evaluate(() => localStorage.setItem('terapiainfoco_access_token', 'token-expirado'));
  await page.reload();
  await page.getByRole('heading', { name: 'Meu Perfil Público' }).waitFor({ timeout: 15_000 });
  const tokens = await page.evaluate(() => ({
    access: localStorage.getItem('terapiainfoco_access_token'),
    refresh: localStorage.getItem('terapiainfoco_refresh_token')
  }));
  assert(tokens.access && tokens.access !== 'token-expirado', 'access token renovado');
  assert(tokens.refresh && tokens.refresh !== refreshBefore, 'refresh token rotacionado');
  console.log('✓ Access token expirado renovado automaticamente (refresh rotacionado)');

  // 3. Refresh token revogado: volta para a vitrine sem quebrar
  await page.evaluate(() => {
    localStorage.setItem('terapiainfoco_access_token', 'token-expirado');
    localStorage.setItem('terapiainfoco_refresh_token', 'refresh-invalido');
  });
  await page.reload();
  await page.getByText('Encontrar um Psicólogo').first().waitFor({ timeout: 15_000 });
  assert(!(await page.evaluate(() => localStorage.getItem('terapiainfoco_refresh_token'))), 'sessão inválida limpa');
  console.log('✓ Sessão inválida leva à vitrine e é limpa');

  // 4. Logout seguido de recarregamento continua deslogado
  await page.getByText('Demo Psicóloga (Dra. Beatriz)').first().click();
  await page.getByRole('button', { name: 'Meu Perfil Público' }).first().waitFor();
  await page.getByRole('button', { name: /Dra\. Beatriz Santos/ }).first().click();
  await page.getByRole('button', { name: /Sair/ }).first().click();
  await page.reload();
  await page.getByText('Encontrar um Psicólogo').first().waitFor({ timeout: 15_000 });
  console.log('✓ Logout persiste após recarregar');
  console.log('E2E da sessão: OK');
} finally {
  await browser.close();
}
