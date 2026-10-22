import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client.ts'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Copy .env.example to .env and configure PostgreSQL.')

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
export const prisma = new PrismaClient({ adapter })
