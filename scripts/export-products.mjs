import { PrismaClient } from '@prisma/client'
import { writeFileSync } from 'fs'

const db = new PrismaClient()

const products = await db.product.findMany({
  where: { deletedAt: null },
  include: { category: { select: { name: true } } },
  orderBy: { createdAt: 'asc' },
})

const exportData = {
  exportedAt: new Date().toISOString(),
  note: 'بکاپ محصولات فروشگاه — خروجی از دیتابیس پنل (بدون اطلاعات حساس)',
  count: products.length,
  products: products.map((p) => ({
    name: p.name,
    slug: p.slug,
    sku: p.sku,
    category: p.category?.name || null,
    brand: p.brand,
    model: p.model,
    salePrice: p.salePrice,
    discountPrice: p.discountPrice,
    costPrice: p.costPrice,
    stock: p.stock,
    status: p.status,
    attributes: JSON.parse(p.attributes || '[]'),
    images: JSON.parse(p.images || '[]'),
    shortDesc: p.shortDesc,
    longDesc: p.longDesc,
    metaTitle: p.metaTitle,
    metaDesc: p.metaDesc,
  })),
}

writeFileSync('data/products-export.json', JSON.stringify(exportData, null, 2), 'utf8')
console.log(`✅ ${products.length} محصول در data/products-export.json ذخیره شد`)
await db.$disconnect()
