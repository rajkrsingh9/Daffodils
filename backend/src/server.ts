import http from 'http';
import { createApp } from './app';
import { connectDb, disconnectDb } from './config/db';
import { env } from './config/env';
import { connectRedis, disconnectRedis } from './config/redis';
import { startJobs } from './jobs';
import { initChatGateway } from './modules/chat/chat.gateway';

async function main() {
  await connectDb();
  await connectRedis();

  const app = createApp();
  const server = http.createServer(app);

  initChatGateway(server);
  startJobs();

  server.listen(env.port, () => {
    console.log(`✓ daffodils api listening on :${env.port} (${env.nodeEnv})`);
    console.log(`  REST  http://localhost:${env.port}/api/v1`);
    console.log(`  WS    ws://localhost:${env.port}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down`);
    server.close();
    await Promise.allSettled([disconnectDb(), disconnectRedis()]);
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('failed to start:', err);
  process.exit(1);
});
