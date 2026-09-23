import { readFile } from 'fs/promises';
import { readdir } from 'fs/promises';
import path from 'path';
import { Client } from 'pg';

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Set DATABASE_URL environment variable (Postgres connection)');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const migrationsDir = path.resolve(process.cwd(), 'supabase', 'migrations');
  const files = (await readdir(migrationsDir)).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const full = path.join(migrationsDir, file);
    console.log('Applying', file);
    const sql = await readFile(full, 'utf8');
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
      console.log('Applied', file);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Failed to apply', file, err.message);
      await client.end();
      process.exit(1);
    }
  }

  await client.end();
  console.log('All migrations applied');
}

run().catch(err => {
  console.error('Migration runner error:', err);
  process.exit(1);
});
