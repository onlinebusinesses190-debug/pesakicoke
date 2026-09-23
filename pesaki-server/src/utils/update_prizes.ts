import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const newPrizes = [
    { id: 1, name: 'Loss', value: 0, weight: 35, image: null },
    { id: 2, name: '0.5', value: 0.5, weight: 25, image: null },
    { id: 3, name: 'Loss', value: 0, weight: 15, image: null },
    { id: 4, name: '1.5', value: 1.5, weight: 10, image: null },
    { id: 5, name: 'Loss', value: 0, weight: 10, image: null },
    { id: 6, name: '1', value: 1.0, weight: 4, image: null },
    { id: 7, name: '5', value: 5.0, weight: 1, image: null }
  ];

  console.log('Updating prizes...');
  for (const prize of newPrizes) {
    let { error: updateErr } = await supabase.from('spin_prizes').update({
        name: prize.name,
        value: prize.value,
        weight: prize.weight,
        image: prize.image
    }).eq('id', prize.id);
    
    if (updateErr) {
        console.error(`Update error for id ${prize.id}:`, updateErr);
    } else {
        console.log(`Updated id ${prize.id} successfully.`);
    }
  }

  console.log('Successfully updated spin_prizes in Supabase!');

  // Now clear Redis
  const RedisUrl = process.env.UPSTASH_REDIS_URL || '';
  const RedisToken = process.env.UPSTASH_REDIS_TOKEN || '';
  
  console.log('Clearing Redis spin:prizes...');
  try {
    const res = await fetch(`${RedisUrl}/DEL/spin:prizes`, {
        headers: {
            Authorization: `Bearer ${RedisToken}`
        }
    });
    const text = await res.text();
    console.log('Redis response:', text);
  } catch (err) {
    console.error('Redis delete error:', err);
  }
}

run();
