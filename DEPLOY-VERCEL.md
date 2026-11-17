# برنامهٔ استقرار روی Vercel + مدیریت ظرفیت رایگان دیتابیس

> ✅ **وضعیت فعلی: دیپلوی production انجام شده است** — https://foroshgan-mobile.vercel.app
> دیتابیس: Neon Postgres (پلن رایگان marketplace ورسل) — اسکیما push و دیتای دمو seed شده.

---

## ۱) چرا SQLite قبلی روی Vercel کار نمی‌کند؟

پروژه قبلاً از **Prisma + SQLite** (فایل `db/custom.db`) استفاده می‌کرد. روی Vercel:

- توابع Serverless یک **فایل‌سیستم زودگذر (ephemeral)** دارند — هر invocation ممکن است روی container جدید اجرا شود.
- نتیجه: هر چیزی در فایل SQLite بنویسید، **با تمام شدن هر درخواست یا هر deploy از بین می‌رود.**

## ۲) آنچه انجام شد (راه‌اندازی نهایی)

| قدم | وضعیت |
|---|---|
| ساخت پروژهٔ `foroshgan-mobile` روی ورسل (region `fra1`) | ✅ |
| نصب اِینتگریشن Neon از Marketplace (`vercel integration accept-terms neon --yes`) | ✅ |
| ساخت دیتابیس `foroshgan-db` (Neon free) و اتصال به پروژه + تزریق envها | ✅ |
| تغییر Prisma به `postgresql` + متغیر `PRISMA_DATABASE_URL` (host پول‌شده + `pgbouncer=true`) | ✅ |
| `prisma db push` روی Neon + seed دیتای دمو + تنظیم `aiProvider = gemini` | ✅ |
| `postinstall: prisma generate` در package.json برای بیلد ورسل | ✅ |
| متغیرهای `PRISMA_DATABASE_URL` و `AUTH_SECRET` روی هر سه محیط (production/preview/development) | ✅ |
| اتصال گیت: هر push به `main` → deploy خودکار | ✅ |
| تست زندهٔ production: ورود، محصولات، داشبورد | ✅ |

### معماری فعلی
- **تولید (Production):** Neon Postgres — اتصال از طریق pooler ورسل/نئون با `pgbouncer=true` (مخصوص serverless).
- **محلی (Local):** همان دیتابیس Neon (به‌دلیل حجم کم دیتا، مشکلی ایجاد نمی‌کند و سینک می‌ماند).
- `schema.prisma`: `provider = "postgresql"` و `url = env("PRISMA_DATABASE_URL")`.

## ۳) کنترل مصرف پلن رایگان Neon

پلن رایگان Neon: **~۰٫۵ گیگ استوریج + ساعات compute محدود با autosuspend** (بعد از ۵ دقیقه بی‌کاری، compute خاموش می‌شود و هزینه‌ای ندارد).

نکات مهم برای جلوگیری از هدررفت سهمیه:

1. **Seed فقط یک‌بار** — `scripts/seed.ts` اول جدول‌ها را خالی می‌کند؛ روی دیتای واقعی اجرا نکنید. محافظ `scripts/ensure-seed.ts` فقط وقتی دیتابیس کاملاً خالی باشد seed می‌کند.
2. **Polling یادآور قیمت** — مرورگر هر ۶۰ ثانیه `/api/price-check` را صدا می‌زند (هر تب باز). در production بهتر است interval به ۵ دقیقه افزایش یابد → ~۸۰٪ کاهش ساعات compute. [قابل پیاده‌سازی]
3. **کش خواندن‌های تکراری** — `/api/settings` و `/api/categories` و `/api/dashboard` با کش ۳۰–۶۰ ثانیه‌ای تا ۸۰٪ کوئری‌های تکراری حذف می‌شوند. [قابل پیاده‌سازی]
4. **خانه‌تکانی لاگ‌ها** — جدول‌های `LoginLog`، `AuditLog`، `StockLog`، `PriceHistory` بی‌نهایت بزرگ می‌شوند؛ پاک‌سازی دوره‌ای (>۹۰ روز) با Vercel Cron. [قابل پیاده‌سازی]
5. **آپلود تصاویر** — `public/uploads` روی ورسل بین deployها پاک می‌شود → **Cloudflare R2** (۱۰ گیگ رایگان) یا **Vercel Blob**، یا URL خارجی (فرم محصول از قبل URL را قبول می‌کند).
6. **دیتای فعلی** (۳ کاربر، ۱۲ محصول، ~۹۰ فروش) زیر ۱ مگابایت است — نگرانی فضا وجود ندارد.

## ۴) کارهای باقی‌مانده برای صفر کردن خطاهای production

- [ ] **کلید Gemini**: در پنل → تنظیمات، کلید Gemini را وارد کنید (یا `GEMINI_API_KEY` را در ورسل set کنید). دستیار AI بدون کلید پیام خطای واضح نشان می‌دهد ولی سایر بخش‌ها مستقل‌اند.
- [ ] ذخیره‌ساز تصاویر (R2 یا Blob) اگر می‌خواهید عکس آپلود کنید.
- [ ] (پیشنهادی) بهینه‌سازی‌های بند ۳-۲ تا ۳-۴.

## ۵) دستورهای پرکاربرد

```bash
# deploy دستی از محلی
bunx vercel deploy --prod --token <TOKEN>

# دیدن لاگ‌های production
bunx vercel logs foroshgan-mobile.vercel.app --token <TOKEN>

# تغییر اسکیما → push به Neon و سپس deploy
bunx prisma db push
bunx vercel deploy --prod --token <TOKEN>

# مشاهده متغیرها
bunx vercel env ls --token <TOKEN>
```

> ⚠️ امنیت: هر توکنی (ورسل یا گیت‌هاب) که در چت فرستاده شود باید بعد از استفاده **rotate** شود.
> یادآوری: پلن Hobby ورسل برای «استفادهٔ غیرتجاری» است؛ برای فروشگاه واقعی طبق شرایط ورسل پلن Pro لازم می‌شود.
