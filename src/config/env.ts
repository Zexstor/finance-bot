import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, 'TELEGRAM_BOT_TOKEN is required'),
  SUPABASE_URL: z.string().min(1, 'SUPABASE_URL is required'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  ALLOWED_USER_IDS: z
    .string()
    .min(1, 'ALLOWED_USER_IDS is required')
    .transform((value) => value.split(',').map((id) => Number(id.trim())))
    .refine(
      (ids) => ids.every((id) => Number.isInteger(id)),
      'ALLOWED_USER_IDS must be a comma-separated list of Telegram user IDs',
    ),
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  OPENAI_MODEL: z.string().min(1).default('gpt-4o-mini'),
  OPENAI_RECEIPT_MODEL: z.string().min(1).default('gpt-4o'),
});

export const env = envSchema.parse(process.env);
