import app from './app';
import { pool, verificarConexion } from './config/database';
import { env } from './config/env';
import { detenerJobs, iniciarJobs } from './jobs';

async function main() {
  await verificarConexion();
  console.log(`MySQL conectado (${env.db.host}:${env.db.port}/${env.db.database})`);

  const server = app.listen(env.port, () => {
    console.log(`EnerFácil API escuchando en http://localhost:${env.port}/api`);
  });

  // Tareas programadas (node-cron): recalcular consumo, evaluar alertas y notificar
  iniciarJobs();

  const apagar = () => {
    server.close(async () => {
      await detenerJobs();
      await pool.end();
      process.exit(0);
    });
  };
  process.on('SIGINT', apagar);
  process.on('SIGTERM', apagar);
}

main().catch((err) => {
  console.error('No se pudo iniciar el servidor:', err);
  process.exit(1);
});
