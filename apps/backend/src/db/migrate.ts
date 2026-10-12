import { getDb } from './index';

console.log('🚀 Disparando rotina de migração e sincronização do banco de dados...');

getDb()
  .then(() => {
    console.log('🎉 Migrações aplicadas com sucesso!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Falha na execução da migração:', err);
    process.exit(1);
  });
