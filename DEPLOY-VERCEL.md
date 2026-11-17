# برنامهٔ استقرار روی Vercel + مدیریت ظرفیت رایگان دیتابیس

> این سند دو کار را انجام می‌دهد: (۱) مسیر دقیق مهاجرت SQLite به یک دیتابیس سازگار با Vercel، و (۲) برنامهٔ کاهش مصرف ظرفیت رایگان تا حد ممکن.

---

## ۱) چرا SQLite فعلی روی Vercel کار نمی‌کند؟

پروژه الان از **Prisma + SQLite** (فایل `db/custom.db`) استفاده می‌کند. روی Vercel:

- توابع Serverless یک **فایل‌سیستم زودگذر (ephemeral)** دارند — هر invocation ممکن است روی یک container جدید اجرا شود.
- فقط مسیر `/tmp` قابل نوشتن است و آن هم بین درخواست‌ها پاک می‌شود.
- نتیجه: هر چیزی در `db/custom.db` بنویسید، **با تمام شدن هر درخواست یا هر deploy از بین می‌رود.**

پس دیتابیس باید به یک سرویس **مدیریت‌شدهٔ بیرونی (Managed DB)** منتقل شود.

---

## ۲) گزینه‌های دیتابیس رایگان — مقایسه

| گزینه | ظرفیت رایگان | سازگاری با کد فعلی | مشکل اصلی |
|---|---|---|---|
| **Turso (libSQL)** ✅ پیشنهادی | ~۵ گیگابایت فضا + ۱ میلیارد خواندن ردیف/ماه + ۲۵ میلیون نوشتن/ماه | **بسیار بالا** — SQLite سازگار؛ فقط درایور عوض می‌شود | نیاز به driver adapter |
| Neon / Vercel Postgres | ~۰٫۵ گیگ فضا + ساعات compute محدود (با autosuspend) | متوسط — باید `provider` به `postgresql` تغییر کند | cold start + مصرف ساعات compute |
| Supabase | ۵۰۰ مگ | متوسط | **پس از ۷ روز غیرفعال، پروژه pause می‌شود** — برای فروشگاه فعال خطرناک |
| PlanetScale | — | — | دیگر پلن رایگان ندارد |

### چرا Turso؟
1. **Turso از libSQL ساخته شده که fork سازگار SQLite است** — اسکیمای Prisma به‌صورت `provider = "sqlite"` باقی می‌ماند و دیتای فعلی تقریباً بدون تغییر منتقل می‌شود.
2. سهمیهٔ رایگان آن **بر اساس میزان مصرف واقعی** است نه ساعت compute — یعنی «بیکار ماندن» سرور چیزی را هدر نمی‌دهد.
3. از نظر اندازه، دیتای این فروشگاه (۱۲ محصول، ~۹۰ فروش) **زیر ۱ مگابایت** است — یعنی از ۵ گیگ سهمیهٔ رایگان حدود ۰٫۰۲٪ استفاده می‌شود.

---

## ۳) مراحل مهاجرت به Turso (گام‌به‌گام)

### گام ۱ — ساخت دیتابیس
```bash
# نصب CLI
curl -sSfL https://get.tur.so/install.sh | bash

turso auth signup          # ثبت‌نام (رایگان)
turso db create shop --location fra   # فرانکفورت؛ نزدیک به region قابلیت اجرای Vercel (fra1)

turso db show shop --url   # ← آدرس libsql://... (DATABASE_URL)
turso db tokens create shop # ← توکن (DATABASE_AUTH_TOKEN)
```

### گام ۲ — نصب درایور
```bash
bun add @prisma/adapter-libsql libsql
```

### گام ۳ — تغییر دو فایل کوچک

`prisma/schema.prisma`:
```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"]
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

`src/lib/db.ts`:
```ts
import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

function makeClient() {
  const libsql = createClient({
    url: process.env.DATABASE_URL!,
    authToken: process.env.DATABASE_AUTH_TOKEN!,
  })
  return new PrismaClient({ adapter: new PrismaLibSQL(libsql), log: ['error'] })
}

export const db = globalForPrisma.prisma ?? makeClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
```

### گام ۴ — انتقال اسکیما و دیتا (یک‌بار)
```bash
# الف) تولید SQL از روی اسکیما
bunx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > schema.sql

# ب) اجرای آن روی Turso
turso db shell shop < schema.sql

# ج) انتقال دیتای فعلی (اختیاری — خروجی SQLite و درج)
sqlite3 db/custom.db .dump | turso db shell shop
#   (اگر فایل sqlite3 ندارید: bunx dbmate یا خروجی CSV با اسکریپت‌های موجود در scripts/)
```

> نکته: نسخه‌های جدید Prisma ممکن است `db push` را مستقیماً با URL `libsql://` هم قبول کنند؛ اگر خطا داد، از روش `migrate diff + turso db shell` بالا استفاده کنید (همیشه کار می‌کند).

### گام ۵ — تنظیم متغیرهای محیطی در Vercel
در بخش Project → Settings → Environment Variables:

| متغیر | مقدار | توضیح |
|---|---|---|
| `DATABASE_URL` | `libsql://shop-....turso.io` | آدرس دیتابیس |
| `DATABASE_AUTH_TOKEN` | توکن ساخت‌شده در گام ۱ | احراز هویت |
| `AUTH_SECRET` | رشتهٔ تصادفی طولانی | امضای کوکی نشست (`openssl rand -hex 32`) |
| `GEMINI_API_KEY` | کلید Gemini | برای دستیار AI (بند ۶) |

### گام ۶ — هوش مصنوعی
SDK فعلی (`z-ai-web-dev-sdk`) فقط در محیط سندباکس کار می‌کند. در تنظیمات پنل، `aiProvider` را روی **`gemini`** بگذارید و `GEMINI_API_KEY` را وارد کنید — این قابلیت از قبل در کد پیاده‌سازی شده است (پشتیبانی از Gemini + پروکسی اختیاری).

### گام ۷ — تست نهایی روی Vercel
1. ورود با حساب مدیر (باید کار کند — کوکی و هش scrypt مستقل از فایل‌سیستم‌اند).
2. ثبت یک فروش → باید موجودی کم شود و بعد از deploy مجدد **دیتا باقی بماند**.
3. آپلود تصویر → **کار نخواهد کرد** (بند ۵-د پایین).

---

## ۴) برنامهٔ صرفه‌جویی در ظرفیت رایگان دیتابیس

هدف: هیچ کوئری یا نوشتنی «الکی» انجام نشود. بر اساس کد فعلی این پنل:

### الف) Seed فقط یک‌بار — هرگز پاک‌سازی نکن
- اسکریپت `scripts/seed.ts` اول **همهٔ جدول‌ها را deleteMany می‌کند** بعد دیتای دمو می‌ریزد — روی دیتابیس واقعی **اجرا نکنید**.
- محافظ جدید `scripts/ensure-seed.ts` اضافه شده: اگر دیتابیس خالی باشد seed می‌کند، اگر دیتا باشد **هیچ کاری نمی‌کند**. اسکریپت `dev` هم به آن متصل شده تا راه‌اندازی مجدد محیط دیتا را نجات دهد.
- روی Turso فقط یک‌بار seed یا مهاجرت دیتا (گام ۴) لازم است.

### ب) کش در حافظه برای خواندن‌های تکراری
- کوئری‌های `GET /api/settings`، `/api/categories` و `/api/dashboard` در هر بار باز کردن صفحه دوباره اجرا می‌شوند.
- یک کش ۳۰–۶۰ ثانیه‌ای در حافظه (per lambda instance) تا ~۸۰٪ این کوئری‌ها را حذف می‌کند. دیتای این پنل کم‌تغییر است؛ TTL کوتاه هیچ ریسکی ندارد.
- [قابل پیاده‌سازی توسط من — بگویید تا انجام شود]

### ج) کاهش Polling یادآور قیمت
- مرورگر الان **هر ۶۰ ثانیه** `/api/price-check` را صدا می‌زند → هر تبِ باز = ۴۳٬۰۰۰ درخواست/ماه (هر کدام یک کوئری دیتابیس).
- این interval باید قابل تنظیم شود و در محیط production به ۵ دقیقه افزایش یابد → ~۸۳٪ کاهش.
- [قابل پیاده‌سازی توسط من — بگویید تا انجام شود]

### د) جدول‌های لاگ — رشد بی‌نهایت + خانه‌تکانی دوره‌ای
این ۴ جدول مدام بزرگ می‌شوند و در گزارش‌ها فقط نگاه اخیر لازم است:
`LoginLog`، `AuditLog`، `StockLog`، `PriceHistory`

برنامه:
- یک endpoint محافظت‌شدهٔ `POST /api/cron/cleanup` با هدر `x-cron-secret` (مقدار `CRON_SECRET` در env) که لاگ‌های قدیمی‌تر از **۹۰ روز** را حذف می‌کند.
- اتصال با **Vercel Cron** (پلن Hobby: ۲ کرون روزانه مجاز):
```json
// vercel.json
{ "crons": [{ "path": "/api/cron/cleanup", "schedule": "0 3 * * *" }] }
```
- [قابل پیاده‌سازی توسط من — بگویید تا انجام شود]

### هـ) تصاویر — بزرگ‌ترین تلهٔ فایل‌سیستم
- آپلودها الان در `public/uploads` نوشته می‌شوند → روی Vercel **با deploy بعدی پاک می‌شوند**.
- گزینه‌ها به ترتیب توصیه:
  1. **Cloudflare R2** — ۱۰ گیگ رایگان، خروجی (egress) رایگان؛ تغییر کوچک در `src/app/api/uploads/route.ts`.
  2. **Vercel Blob** — ساده‌ترین انتگراسیون (~۲۵۰ مگ رایگان روی Hobby؛ برای ۱۰۰+ عکس محصول کافی است).
  3. یا فقط از **URL تصویر خارجی** استفاده کنید — فرم محصول از قبل URL را قبول می‌کند و هیچ کد اضافه‌ای لازم نیست.
- عکس‌های موجود در `public/products` استاتیک‌اند و در build باندل می‌شوند — مشکلی ندارند.

### و) ریز-بهینه‌سازی‌های دیگر
- صفحه‌بندی و `select` فیلدهای لازم **از قبل در کد پیاده‌سازی شده** — حفظ کنید.
- Region دیتابیس و توابع Vercel هر دو `fra` باشند → تأخیر کمتر، timeout کمتر.
- در `vercel.json` حداکثر مدت تابع را محدود کنید (پلن Hobby سقف دارد؛ این پنل به بیش از ۳۰ ثانیه نیاز ندارد).
- فروش/لغو فروش/ویرایش قیمت = چند نوشتن ضروری و منطقی — نیازی به تغییر نیست؛ حجمشان ناچیز است.

### ز) برآورد مصرف واقعی بعد از این برنامه
| منبع | مصرف ماهانهٔ تخمینی | سهمیهٔ رایگان Turso |
|---|---|---|
| فضا | < ۵ مگ (بدون لاگ‌های قدیمی) | ۵ گیگ |
| خواندن ردیف | چند صد هزار (با کش) | ۱ میلیارد |
| نوشتن | چند هزار | ۲۵ میلیون |

نتیجه: با این برنامه، مصرف رایگان عملاً **در حد نویز** می‌ماند و برای سال‌ها نگرانی سهمیه وجود ندارد.

---

## ۵) چک‌لیست نهایی deploy

- [ ] ساخت Turso و انتقال اسکیما/دیتا (گام‌های ۱ و ۴)
- [ ] تغییر `schema.prisma` + `src/lib/db.ts` + نصب adapter (گام‌های ۲ و ۳)
- [ ] چهار متغیر محیطی در Vercel: `DATABASE_URL`، `DATABASE_AUTH_TOKEN`، `AUTH_SECRET`، `GEMINI_API_KEY`
- [ ] `aiProvider = gemini` در تنظیمات پنل
- [ ] حذف seed از پروسهٔ deploy / استفاده از ensure-seed
- [ ] (پیشنهادی) کش خواندن‌ها + interval یادآور ۵ دقیقه + cron لاگ‌ها
- [ ] (پیشنهادی) انتقال آپلود به R2 یا Vercel Blob
- [ ] تست: فروش ثبت کن → deploy مجدد → دیتا باید بماند

> یادآوری: پلن Hobby ورسل برای «استفادهٔ غیرتجاری» است؛ اگر این پنل برای فروشگاه واقعی فعال می‌شود، طبق شرایط Vercel بهتر است پلن Pro (۲۰$/ماه) گرفته شود یا از میزبان جایگزین (Railway / Cloudflare Pages + Turso) استفاده شود. خود دیتابیس Turso با همین سهمیهٔ رایگان می‌ماند.
