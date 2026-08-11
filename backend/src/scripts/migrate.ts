/**
 * Migration runner.
 *
 * Order matters: the postgis extension must exist before `prisma db push`
 * can create geography() columns, and the GIST indexes/triggers must be
 * (re)applied after push because Prisma cannot express them.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import { env } from '../config/env';

async function sql(statements: string) {
  const client = new Client({ connectionString: env.databaseUrl });
  await client.connect();
  try {
    await client.query(statements);
  } finally {
    await client.end();
  }
}

async function main() {
  console.log('▸ ensuring postgis extension');
  await sql('CREATE EXTENSION IF NOT EXISTS postgis;');

  console.log('▸ prisma db push');
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '../..'),
  });

  console.log('▸ applying postgis.sql (indexes + geom triggers)');
  const script = fs.readFileSync(
    path.resolve(__dirname, '../../prisma/postgis.sql'),
    'utf8'
  );
  await sql(script);

  console.log('▸ prisma generate');
  execSync('npx prisma generate', {
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '../..'),
  });

  console.log('✓ migration complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
