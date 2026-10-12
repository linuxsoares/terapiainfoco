import path from 'node:path';
import fs from 'node:fs';

const port = Number(process.env.PORT) || 3000;
const distDir = path.resolve(__dirname, 'dist');

console.log(`🚀 Iniciando servidor estático do Frontend TerapiaInFoco na porta ${port}...`);

const server = Bun.serve({
  port,
  hostname: '0.0.0.0',
  fetch(req) {
    const url = new URL(req.url);

    // Healthcheck para probes do Railway e Docker
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'terapiainfoco-frontend' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Tenta servir o arquivo estático requisitado se existir
    const filePath = path.join(distDir, decodeURIComponent(url.pathname));
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return new Response(Bun.file(filePath));
    }

    // SPA fallback para index.html (React Router / HTML5 History API)
    const indexHtml = path.join(distDir, 'index.html');
    if (fs.existsSync(indexHtml)) {
      return new Response(Bun.file(indexHtml));
    }

    return new Response('404 Not Found', { status: 404 });
  }
});

console.log(`✅ Frontend TerapiaInFoco ouvindo em http://${server.hostname}:${server.port}`);
