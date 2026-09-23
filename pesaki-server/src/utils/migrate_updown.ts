import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function migrate() {
  console.log('Running Up/Down migration...');

  // add round_id column to predictions
  const { error: colErr } = await supabase.rpc('exec_sql' as any, {
    sql: `ALTER TABLE public.predictions ADD COLUMN IF NOT EXISTS round_id uuid;`
  });
  if (colErr) {
    // Supabase doesn't expose exec_sql — use the REST API workaround via insert
    console.log('Note: exec_sql not available — please run this SQL manually in Supabase:');
    console.log('');
    console.log('ALTER TABLE public.predictions ADD COLUMN IF NOT EXISTS round_id uuid;');
    console.log('CREATE INDEX IF NOT EXISTS idx_predictions_round ON public.predictions (round_id, status);');
    console.log('');
    console.log('Go to: https://supabase.com/dashboard → SQL Editor');
    return;
  }

  console.log('Migration complete!');
}

migrate();
