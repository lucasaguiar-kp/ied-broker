import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  SERVER_PORT: z.coerce.number().int().min(3000).max(6000),
  JWT_SECRET: z.string(),

  DATABASE_URL: z.string().url(),

  FRONT_END_URL: z.string().url(),
});

export const env = envSchema.parse(process.env);
