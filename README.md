# Gang Loot Splitter ⚔️

เว็บแอปแบ่งของ/แบ่งเงินแก็ง: ใส่รายชื่อคน + ไอเทมพร้อมราคา ระบบคำนวณราคารวมแล้วหารต่อคนอัตโนมัติ
มีประวัติ (พร้อมวันที่และ audit log), Dashboard และข้อมูลซิงก์ข้ามเครื่องผ่าน Supabase

ตัวอย่าง: BOX CIL 250k + BOX 50k + fairy 150k + ยา 160k + bol 220k = **830k ÷ 4 = 208k ต่อคน**

## วิธีรัน (ครั้งแรก)

ต้องมี Node.js 20+ (แนะนำ 22)

1. **Supabase** (ทำครั้งเดียว)
   - เปิด SQL Editor → วาง `schema.sql` → Run
   - วาง `schema-patch.sql` → Run (ให้ตั้งชื่อที่แสดงของตัวเองได้)
   - Authentication → Providers: เปิด Email
   - Authentication → URL Configuration: Site URL = `http://localhost:3000`
     (ตอนขึ้นเว็บจริงให้เพิ่ม URL ของเว็บใน Site URL / Redirect URLs ด้วย)
2. **ตั้งค่า env**
   ```bash
   cp .env.local.example .env.local
   ```
   แล้วใส่ publishable key (`sb_publishable_...`) ลงใน `.env.local`
   **ห้ามใส่ Secret key / service_role key**
3. **ติดตั้งและรัน**
   ```bash
   npm install
   npm run dev
   ```
   เปิด http://localhost:3000

## วิธีใช้

1. ล็อกอิน (ลิงก์ทางอีเมล หรืออีเมล + รหัสผ่าน)
2. หัวแก็ง: **สร้างแก็ง** → ไปหน้า **ตั้งค่า** สร้างรหัสเชิญ (รองแก็ง/สมาชิก) แล้วส่งลิงก์ให้
3. หน้า **ผู้เล่น**: เพิ่มรายชื่อ (หรือพิมพ์เพิ่มตอนสร้างรอบก็ได้)
4. **+ สร้างรอบ**: เลือกคน ใส่ไอเทม (พิมพ์ราคาแบบ `250k`, `1.5m`, `250000`) ดูยอดคนละที่แถบล่างทันที → บันทึก
5. ติ๊ก ✅ ต่อคนในหน้ารอบ, กด **คัดลอกข้อความ Discord** ไปวางได้เลย
6. **ประวัติ**: กรองตามวันที่/ผู้เล่น/ไอเทม/สถานะ และ Export CSV
7. **Dashboard**: สรุปมูลค่า, กราฟรายวัน, อันดับผู้เล่น, ไอเทมยอดนิยม, ยอดค้างจ่าย

## สิทธิ์

| Role | ทำอะไรได้ |
|---|---|
| หัวแก็ง (owner) | ทุกอย่าง รวมตั้งค่าแก็ง/จัดการสมาชิก |
| รองแก็ง (admin) | สร้าง/แก้/ลบรอบ, จัดการผู้เล่น, ติ๊กจ่าย, สร้างรหัสเชิญ |
| สมาชิก (member) | ดูอย่างเดียว |

สิทธิ์ถูกบังคับที่ฐานข้อมูลด้วย RLS (ไม่ใช่แค่ซ่อนปุ่มในหน้าเว็บ)

## ทดสอบสูตรคำนวณ

```bash
npm run test:money
```

## ข้อควรรู้

- **อีเมลของ Supabase (ค่าเริ่มต้น) ส่งได้จำกัดมาก** (ไม่กี่ฉบับต่อชั่วโมง) ถ้าใช้ลิงก์ทางอีเมลแล้วไม่ได้รับ
  ให้ใช้โหมด "อีเมล + รหัสผ่าน" (และปิด Authentication → Sign In / Providers → Email → *Confirm email*
  ถ้าไม่ต้องการยืนยันอีเมล) หรือตั้ง Custom SMTP
- ยังไม่มี: ไอเทมที่หารไม่ครบทุกคน (FR-14), ล็อกอินด้วย Discord, แจ้งเตือน Discord webhook
  (ตารางรองรับไว้แล้ว เพิ่มทีหลังได้)
- กราฟใน Dashboard ทำด้วย CSS ล้วน ไม่ต้องติดตั้ง library เพิ่ม
- เมื่อแก้ราคา/จำนวนคนของรอบแล้วกดบันทึก ยอดต่อคน (`share_amount`) ของทุกคนในรอบนั้นจะถูกคำนวณใหม่

## ขึ้นเว็บจริง (Vercel)

1. push โปรเจกต์ขึ้น GitHub แล้ว Import ใน Vercel
2. ใส่ Environment Variables 2 ตัวเหมือน `.env.local`
3. เพิ่ม URL ของเว็บใน Supabase → Authentication → URL Configuration

## โครงสร้าง

```
app/
  login/            หน้าล็อกอิน
  join/             ลิงก์เชิญ (?code=...)
  (app)/            หน้าที่ต้องล็อกอิน (ครอบด้วย AppShell)
    page.tsx        Dashboard
    sessions/       ประวัติ + [id] หน้าสร้าง/แก้รอบ
    players/        จัดการผู้เล่น
    activity/       audit log ของแก็ง
    settings/       ตั้งค่าแก็ง สมาชิก รหัสเชิญ
components/AppShell.tsx
lib/                money.ts (คำนวณ), supabase.ts, queries.ts, audit.ts, gang-context.tsx
schema.sql          ตาราง + RLS + Realtime
schema-patch.sql    ฟังก์ชันตั้งชื่อที่แสดง
```
