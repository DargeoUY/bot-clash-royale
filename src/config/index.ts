import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN es requerido'),
  DISCORD_CLIENT_ID: z.string().optional(),
  CR_API_KEY: z.string().min(1, 'CR_API_KEY es requerido'),
  CR_API_BASE_URL: z.string().url().default('https://api.clashroyale.com/v1'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es requerido'),
  DB_USER: z.string().default('clashbot'),
  DB_PASSWORD: z.string().min(1, 'DB_PASSWORD es requerido'),
  CLAN_TAG: z.string().default('#28P8RQUY'),
  INACTIVITY_THRESHOLD_DAYS: z.coerce.number().int().min(1).default(2),
  VACATION_MAX_DAYS: z.coerce.number().int().min(1).default(20),
  HEALTHCHECK_PORT: z.coerce.number().int().default(3000),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  NODE_ENV: z.enum(['development', 'production']).default('development'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Error de configuración:');
  console.error(parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n'));
  process.exit(1);
}

export const config = parsed.data;
