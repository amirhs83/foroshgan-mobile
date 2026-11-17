import { PrismaClient } from '@prisma/client'

// Resilient env resolution: Prisma schema expects PRISMA_DATABASE_URL.
// If it is missing (e.g. sandbox env rewrite), derive it from the Neon-injected
// POSTGRES_URL, adding pgbouncer=true (required for serverless/long-lived pooled connections).
if (!process.env.PRISMA_DATABASE_URL) {
  const pg = process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL || ''
  if (pg && !pg.startsWith('file:')) {
    const sep = pg.includes('?') ? '&' : '?'
    process.env.PRISMA_DATABASE_URL = pg.includes('pgbouncer=true') ? pg : `${pg}${sep}pgbouncer=true`
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db