import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { guard, jsonError } from '@/lib/api-helpers'

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

export async function POST(req: NextRequest) {
  const g = await guard('product.create')
  if ('resp' in g) return g.resp

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return jsonError('فایلی ارسال نشده است')
  if (!ALLOWED.includes(file.type)) return jsonError('فقط JPG، PNG و WebP مجاز است')
  if (file.size > MAX_SIZE) return jsonError('حجم فایل باید کمتر از ۵ مگابایت باشد')

  // verify real file signature (magic bytes), not just the content type
  const buf = Buffer.from(await file.arrayBuffer())
  const isPng = buf[0] === 0x89 && buf[1] === 0x50
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8
  const isWebp = buf.toString('ascii', 8, 12) === 'WEBP'
  if (!isPng && !isJpg && !isWebp) return jsonError('فایل تصویری معتبر نیست')

  const ext = isPng ? '.png' : isJpg ? '.jpg' : '.webp'
  const name = `${crypto.randomUUID()}${ext}`
  const dir = path.join(process.cwd(), 'public', 'uploads')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, name), buf)

  return NextResponse.json({ url: `/uploads/${name}` }, { status: 201 })
}
