import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { config } from './config';
import { patientsRoute } from './routes/patients';
import { appointmentsRoute } from './routes/appointments';
import { clinicalRecordsRoute } from './routes/clinicalRecords';
import { auditRoute } from './routes/audit';
import { documentsRoute } from './routes/documents';
import { transcriptionsRoute } from './routes/transcriptions';
import { authRoute } from './routes/auth';
import { analyticsRoute } from './routes/analytics';
import { backupsRoute } from './routes/backups';
import { systemRoute } from './routes/system';
import { webhookRoute } from './routes/webhooks';

export const app = new Hono();




// Middlewares globais
app.use('*', logger());
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization']
}));

// Health Check
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'terapiainfoco-backend',
    version: '1.0.0',
    rfc: 'RFC-001',
    compliance: {
      cfp: ['001/2009', '011/2018', '006/2019', '004/2020'],
      lgpd: ['Art. 5 II', 'Art. 11', 'Art. 16']
    },
    timestamp: new Date().toISOString()
  });
});

// Rotas de domínios RFC-001
app.route('/api/auth', authRoute);
app.route('/api/patients', patientsRoute);
app.route('/api/appointments', appointmentsRoute);
app.route('/api/clinical-records', clinicalRecordsRoute);
app.route('/api/documents', documentsRoute);
app.route('/api/transcriptions', transcriptionsRoute);
app.route('/api/audit', auditRoute);
app.route('/api/analytics', analyticsRoute);
app.route('/api/backups', backupsRoute);
app.route('/api/system', systemRoute);
app.route('/api/webhooks', webhookRoute);



console.log(`🚀 TerapiaInFoco Backend rodando na porta ${config.port}`);

export default {
  port: config.port,
  reusePort: true,
  fetch: app.fetch
};
