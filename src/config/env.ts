import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  JWT_SECRET: z.string().min(16).default('super-secret-jwt-key-replace-in-production-min-32-chars'),

  DATABASE_URL: z.string().default('postgresql://fairlance:fairlance123@localhost:5432/gig_escrow_db?schema=public'),

  STELLAR_NETWORK: z.enum(['testnet', 'public', 'futurenet', 'standalone']).default('testnet'),
  STELLAR_NETWORK_PASSPHRASE: z.string().default('Test SDF Network ; September 2015'),
  SOROBAN_RPC_URL: z.string().url().default('https://soroban-testnet.stellar.org'),
  HORIZON_URL: z.string().url().default('https://horizon-testnet.stellar.org'),
  ESCROW_CONTRACT_ID: z.string().default('CDG3CB5IEATXZPTL3SQGCBVJM2A4HUX4J5TTFGMA7NPGFQBMQBYFXZCB'),
  NATIVE_ASSET_ID: z.string().default('CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'),
  SERVER_SIGNING_KEY: z.string().default('SCLRUT6PNJ6ZAB6XNS4NCWGI42B5H4PMYFG6Z62V4GIM6FQUXYCKNMGV'),
  SERVER_ACCOUNT_ID: z.string().default('GB6CML3GZYGJ4BLR2PK5QTKQIF6KTT56ZXXTIHXTWG4JAPB3RKDVQTU4'),

  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY_ID: z.string().default('minioadmin'),
  S3_SECRET_ACCESS_KEY: z.string().default('minioadmin'),
  S3_BUCKET_NAME: z.string().default('fairlance-deliverables'),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  STORAGE_ENCRYPTION_KEY: z.string().default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
  LOCAL_STORAGE_DIR: z.string().default('./uploads'),

  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().default('mock'),
  SMTP_PASS: z.string().default('mock'),
  SMTP_FROM: z.string().default('Escrow-FairLance <notifications@fairlance.io>'),
  WEBHOOK_TIMEOUT_MS: z.coerce.number().default(5000),
});

export type Config = z.infer<typeof envSchema>;

function loadConfig(): Config {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Environment configuration validation errors:', result.error.format());
    throw new Error('Invalid environment variables for Gig-escrow-service');
  }
  return result.data;
}

export const config = loadConfig();
