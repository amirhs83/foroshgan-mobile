// Reset statistics — run with: bun scripts/reset-stats.ts
// Deletes: sales, price checks/history, stock logs, audit & login logs.
// Keeps: users, settings, categories, products (incl. stock levels), notes.
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  console.log('Resetting statistics...')

  const [sales, priceChecks, priceHistory, stockLogs, auditLogs, loginLogs] = await db.$transaction([
    db.sale.deleteMany(),
    db.priceCheck.deleteMany(),
    db.priceHistory.deleteMany(),
    db.stockLog.deleteMany(),
    db.auditLog.deleteMany(),
    db.loginLog.deleteMany(),
  ])

  console.log({
    salesDeleted: sales.count,
    priceChecksDeleted: priceChecks.count,
    priceHistoryDeleted: priceHistory.count,
    stockLogsDeleted: stockLogs.count,
    auditLogsDeleted: auditLogs.count,
    loginLogsDeleted: loginLogs.count,
  })

  console.log({
    kept: {
      users: await db.user.count(),
      categories: await db.category.count(),
      products: await db.product.count(),
      notes: await db.note.count(),
      settings: await db.setting.count(),
    },
  })

  console.log('Stats reset complete. Products & categories untouched.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
