import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'node prisma/seed.js' },
  datasource: { url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/orion_shop' },
})
