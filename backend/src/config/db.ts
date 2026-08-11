import { PrismaClient } from '@prisma/client';
import { env } from './env';

export const prisma = new PrismaClient({
  log: env.isProd ? ['error', 'warn'] : ['error', 'warn'],
});

export async function connectDb() {
  await prisma.$connect();
  const [{ postgis }] = await prisma.$queryRaw<{ postgis: string }[]>`
    SELECT PostGIS_Lib_Version() AS postgis
  `;
  console.log(`✓ postgres connected (postgis ${postgis})`);
}

export async function disconnectDb() {
  await prisma.$disconnect();
}
