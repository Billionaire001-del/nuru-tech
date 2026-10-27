const { z } = require('zod');
require('dotenv').config();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: z.string().default('false'),
  META_APP_SECRET: z.string().min(1),
  META_VERIFY_TOKEN: z.string().min(1),
  WHATSAPP_ACCESS_TOKEN: z.string().min(1),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1),
  WHATSAPP_GRAPH_API_VERSION: z.string().default('v22.0'),
  BUSINESS_NAME: z.string().default('Nuru Tech Executive Group'),
  BUSINESS_INDUSTRY: z.string().default('Tech and Automations'),
  BUSINESS_LANGUAGES: z.string().default('Python'),
  BUSINESS_TIMEZONE: z.string().default('UTC'),
  AI_API_KEY: z.string().default(''),
  AI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  AI_MODEL: z.string().default(''),
  BUSINESS_KNOWLEDGE: z.string().default(''),
  ADMIN_API_KEY: z.string().min(32),
  RETENTION_DAYS: z.coerce.number().int().positive().default(365),
  OUTBOX_POLL_MS: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.string().default('info')
});
const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}
module.exports = { ...parsed.data, DATABASE_SSL: parsed.data.DATABASE_SSL === 'true' };
