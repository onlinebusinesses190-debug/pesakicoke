import { z } from 'zod';

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string(),
  UPSTASH_REDIS_URL: z.string().url(),
  UPSTASH_REDIS_TOKEN: z.string(),
  PORT: z.string().default('4000').transform(Number),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  MPESA_CONSUMER_KEY: z.string().optional(),
  MPESA_CONSUMER_SECRET: z.string().optional(),
  MPESA_SHORTCODE: z.string().optional(),
  MPESA_TILL_NUMBER: z.string().optional(),
  MPESA_PASSKEY: z.string().optional(),
  MPESA_ENV: z.string().optional(),
  MPESA_CALLBACK_URL: z.string().url().optional(),
  PALPLUSS_API_KEY: z.string().optional(),
  PALPLUSS_API_URL: z.string().url().optional(),

  FINOQ_API_KEY: z.string().optional(),
  FINOQ_BASE_URL: z.string().url().optional(),
  FINOQ_WITHDRAW_ENDPOINT: z.string().optional(),
  FINOQ_TOPUP_ENDPOINT: z.string().optional(),
  FINOQ_CALLBACK_URL: z.string().url().optional(),

  USE_FINOQ_FOR_WITHDRAWALS: z.string().optional().transform((val) => val !== 'false'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Ã¢ÂÅ’ Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
