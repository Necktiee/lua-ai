# เลขา — Personal LINE AI Secretary

เลขาส่วนตัวบน LINE สไตล์ [abdul-ai.com](https://abdul-ai.com/) — จด ค้น เตือน จัดการ to-do และปฏิทิน ในแชทเดียว สำหรับคนขี้ลืม.

## ฟีเจอร์

| ฟีเจอร์ | ตัวอย่างคำสั่ง |
|---|---|
| จด | พิมพ์/ส่งอะไรก็ได้ → เก็บอัตโนมัติ (ข้อความ รูป เสียง ไฟล์ ลิงก์) |
| ค้น | "เคยบอกอะไรเรื่อง X ไหม", "เบอร์แม่เท่าไหร่นะ" |
| เตือนเวลา | "เตือนโทรหาแม่พรุ่งนี้ 9 โมง", "เตือนส่งรายงานศุกร์ 5 โมงเย็น" |
| To-do | "จดงาน: ...", "มีงานค้างไหม", "ทำ X เสร็จแล้ว" |
| ปฏิทิน | "นัดหมอพรุ่งนี้ 2 โมงเย็น", "พรุ่งนี้มีนัดไหม" |
| คุย | ถามอะไรก็ได้ |

## Stack

- **Next.js 16** (App Router, Route Handlers) + TypeScript
- **Supabase** (Postgres + pgvector) — local docker ตอน dev, cloud ตอน deploy
- **Upstash QStash** สำหรับ scheduled reminders (+ poll fallback กรณีไม่มี QStash)
- **LLM pool**: round-robin per-provider + cross-provider fallback
  - chat: `gemini-2.5-flash` → `mistral-small-latest`
  - embedding: `baai/bge-m3` (1024 dim) ผ่าน OpenRouter
- **Google Calendar API** (OAuth)
- **LINE Messaging API** webhook
- **cloudflared** tunnel ตอน dev

## เริ่มต้น

### ข้อกำหนด

- Node 22+
- Docker (สำหรับ Supabase local)
- Supabase CLI, cloudflared

```bash
npm install
cp .env.example .env.local
# แก้ .env.local ใส่ keys
```

### 1) รัน Supabase local

```bash
supabase start
supabase db reset
```

CLI จะพิมพ์ publishable/secret keys → ใส่ใน `.env.local` ที่ `SUPABASE_*`.

### 2) ลง tunnel

```bash
cloudflared tunnel --url http://localhost:3000
# จะได้ URL เช่น https://xxx.trycloudflare.com
```

ใส่ URL นี้ที่ `APP_BASE_URL` ใน `.env.local`.

### 3) สร้าง LINE bot

1. ไป https://developers.line.biz/console → สร้าง Provider + Channel (Messaging API)
2. ตั้งค่า:
   - Webhook URL = `${APP_BASE_URL}/api/line`
   - Use webhook = ON
   - Auto-reply messages = OFF, Greeting messages = OFF
3. คัดลอก:
   - `Channel access token` → `LINE_CHANNEL_ACCESS_TOKEN`
   - `Channel secret` → `LINE_CHANNEL_SECRET`
4. เพิ่ม bot เป็นเพื่อน LINE → ทักอะไรก็ได้ → ดู userId ใน LOG หรือหน้า status (`/`)
5. ใส่ userId ที่ `LINE_USER_WHITELIST` (เพื่อจำกัดเฉพาะตัวเอง)

### 4) (optional) Upstash QStash — สำหรับเตือนแม่นเวลา

สมัคร https://upstash.com → สร้าง QStash → คัดลอก Token + 2 signing keys ใส่ใน `.env.local`.
ถ้าไม่ตั้ง QStash ใช้ `/api/cron/poll` ผ่าน external cron ทุกนาที.

### 5) (optional) Google Calendar

1. https://console.cloud.google.com → สร้าง OAuth credential (type: Web)
2. Authorized redirect URI = `${APP_BASE_URL}/api/cal/callback`
3. ใส่ client id/secret ใน `.env.local`
4. ใน LINE พิมพ์ `เชื่อม calendar` → เปิดลิงก์ → consent

### 6) รัน

```bash
npm run dev
```

เปิด http://localhost:3000 ดู status → ทัก bot ใน LINE.

## ทดสอบ (ไม่ต้องผ่าน LINE)

```bash
npx tsx scripts/smoke-llm.ts     # LLM keys ใช้ได้ไหม
npx tsx scripts/smoke-memory.ts  # store + recall
npx tsx scripts/smoke-agent.ts   # ไล่ intent ครบ
```

## Deploy

แนะนำ Vercel:

1. Push repo ไป GitHub
2. Vercel import project → env vars ทั้งหมดใส่
3. สร้าง Supabase cloud project → run migrations (`supabase db push`)
4. เปลี่ยน `APP_BASE_URL` เป็น domain Vercel
5. อัปเดต LINE webhook URL + Google redirect URI ให้ตรง

## โครงสร้างโค้ด

```
src/
  app/
    api/
      line/route.ts          # LINE webhook
      cron/remind/route.ts   # QStash callback
      cron/poll/route.ts     # poll fallback
      cal/connect/route.ts   # start OAuth
      cal/callback/route.ts  # OAuth callback
    page.tsx                 # status page
  lib/
    env.ts                   # validated env
    line.ts                  # LINE helpers
    types.ts                 # shared types
    db/client.ts             # supabase + touchUser
    llm/
      types.ts providers.ts pool.ts embed.ts parse.ts rate.ts
    intent/
      router.ts              # classify
      time.ts                # parse thai time → ISO
    memory/
      store.ts conversation.ts
    todo/repo.ts
    remind/schedule.ts
    calendar/events.ts
    agent/handle.ts          # orchestrator
supabase/
  migrations/                # 0001_init + match_memory_rpc
scripts/
  smoke-*.ts                 # manual tests
```

## ข้อจำกัด / TODO

- attachment content (รูป/เสียง/ไฟล์) ตอนนี้เก็บ metadata เท่านั้น (TODO: upload ไป Supabase Storage)
- audio ยังไม่ transcribe (TODO: whisper)
- ThaiLLM ไม่ OpenAI-compatible โดยตรง ต้อง proxy ผ่าน LiteLLM ถ้าจะใช้
- ไม่มีหน้า admin — ใช้ Supabase Studio ดู/แก้ข้อมูลตรงๆ

## Privacy

- ข้อมูลเก็บใน Supabase ของคุณเอง ไม่ส่งที่ไหนนอกจาก LLM provider
- `LINE_USER_WHITELIST` จำกัดเฉพาะ line userId ที่อนุญาต
- service role key bypass RLS — อย่า leak
