// Idempotent seed guard — runs before dev server start.
// If the database is empty (no users), it seeds demo data.
// If data already exists, it does NOTHING (never wipes real data).
import { PrismaClient } from '@prisma/client'
import { spawnSync } from 'child_process'

async function main() {
  const db = new PrismaClient()
  const userCount = await db.user.count()
  await db.$disconnect()

  if (userCount > 0) {
    console.log(`[ensure-seed] DB already has ${userCount} users — skipping seed.`)
    return
  }

  console.log('[ensure-seed] DB is empty — seeding demo data...')
  const res = spawnSync('bun', ['scripts/seed.ts'], { stdio: 'inherit' })
  if (res.status !== 0) {
    console.warn('[ensure-seed] Seed failed, continuing without demo data.')
  }
}

main().catch((e) => {
  console.warn('[ensure-seed] Skipped:', e instanceof Error ? e.message : e)
  process.exit(0) // never block dev server startup
})
