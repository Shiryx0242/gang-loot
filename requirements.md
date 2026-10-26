# Requirement: เว็บแอปแบ่งของ/แบ่งเงินแก็ง (Gang Loot Splitter)

## 1. ภาพรวม

เว็บแอปสำหรับบันทึก "รอบแบ่งของ" ของแก็งในเกม เช่น รางวัลจาก Battle Force Reward
ผู้ใช้ใส่รายชื่อสมาชิกที่เข้าร่วม + รายการไอเทมพร้อมราคา ระบบคำนวณราคารวมแล้วหารเป็นต่อคนให้อัตโนมัติ
เก็บประวัติทุกรอบพร้อมวันที่ และมี Dashboard สรุปภาพรวม

ตัวอย่างจากภาพ:

| ไอเทม | ราคา |
|---|---|
| BOX CIL | 250,000 |
| BOX | 50,000 |
| fairy | 150,000 |
| ยา | 160,000 |
| bol | 220,000 |
| **รวม** | **830,000** |

สมาชิก 4 คน (Nanzy, Ichi, Darwin, Omajor) → **คนละ 207,500 ≈ 208k**
และแต่ละคนมีสถานะ ✅ = จ่าย/รับเงินแล้ว

---

## 2. ผู้ใช้งานและสิทธิ์

| Role | สิทธิ์ |
|---|---|
| **หัวแก็ง (Owner)** | ทำได้ทุกอย่าง: สร้าง/แก้/ลบรอบ, จัดการสมาชิกแก็ง, เชิญคนเข้าแก็ง, ตั้งสิทธิ์รองแก็ง |
| **รองแก็ง (Admin)** | สร้าง/แก้/ลบรอบ, เพิ่ม/ลบไอเทมและคน, ติ๊กสถานะจ่ายเงิน |
| **สมาชิก (Member)** | ดูรอบที่ตัวเองอยู่ + ประวัติ (อ่านอย่างเดียว) |

- หัวแก็งและรองแก็งเปิดใช้งานคนละเครื่อง/คนละที่ได้ และเห็นข้อมูลชุดเดียวกันแบบ real-time
- 1 ผู้ใช้เป็นสมาชิกได้หลายแก็ง (ถ้าต้องการ, ระยะหลัง)

---

## 3. ฟีเจอร์หลัก (Functional Requirements)

### 3.1 จัดการแก็ง
- FR-1 สร้างแก็ง (ชื่อแก็ง เช่น "VIPER")
- FR-2 เชิญสมาชิกผ่านลิงก์/รหัสเชิญ
- FR-3 กำหนด/เปลี่ยน role ของสมาชิก (Owner/Admin/Member)

### 3.2 จัดการรายชื่อคน (Members / Players)
- FR-4 เพิ่ม/แก้/ลบ รายชื่อผู้เล่น (ชื่อในเกม เช่น Nanzy, Ichi)
- FR-5 รองรับชื่อภาษาไทยและตัวอักษรพิเศษ (เช่น "Ichi (ตัวเรือน)")
- FR-6 เก็บ ID/โน้ตเพิ่มเติมได้ (เช่น `297189`) แบบ optional
- FR-7 ผู้เล่นคนเดิมใช้ซ้ำข้ามรอบได้ (มีรายชื่อกลาง ไม่ต้องพิมพ์ใหม่ทุกครั้ง)

### 3.3 รอบแบ่งของ (Split Session)
- FR-8 สร้างรอบใหม่: ใส่ชื่อรอบ/หมายเหตุ, วันที่ (default = วันนี้, แก้ได้)
- FR-9 เลือกผู้เข้าร่วมของรอบนั้นจากรายชื่อกลาง (เลือกกี่คนก็ได้ ≥ 1)
- FR-10 เพิ่ม/แก้/ลบ **ไอเทม** ในรอบ โดยมี: ชื่อไอเทม, ราคา, จำนวน (default 1), หมายเหตุ
- FR-11 ช่องใส่ราคารองรับรูปแบบย่อ: `250k` = 250,000, `1.5m` = 1,500,000, `250000`
- FR-12 **คำนวณอัตโนมัติ (real-time ขณะพิมพ์)**
  - ราคารวม = Σ (ราคา × จำนวน)
  - ราคาต่อคน = ราคารวม ÷ จำนวนผู้เข้าร่วม
  - แสดงทั้งค่าเต็ม (207,500) และแบบย่อ (208k)
- FR-13 ตัวเลือกการปัดเศษ: ปัดขึ้น / ปัดลง / ใกล้สุด / ไม่ปัด (ตั้งค่าได้ต่อแก็ง, default = ปัดขึ้นเป็นหลักพัน)
- FR-14 (ทางเลือก) ตัวเลือก "ไอเทมที่ไม่หารทุกคน" เช่น เลือกว่าไอเทมนี้หารเฉพาะ 3 คนจาก 4 คน
- FR-15 ติ๊กสถานะต่อคน ✅ (จ่ายแล้ว/ได้รับแล้ว) พร้อมบันทึกเวลาที่ติ๊ก
- FR-16 สถานะรอบ: `Draft` → `Open` (รอเก็บ/จ่าย) → `Completed` (ครบทุกคน)
- FR-17 ปุ่ม **Copy ข้อความสรุป** สำหรับวางใน Discord ในรูปแบบเดียวกับภาพ เช่น

```
@Nanzy ✅ @Ichi ✅ @Darwin ✅ @Omajor ✅
BOX CIL 250K
BOX 50k
fairy 150K
ยา 160K
bol 220K
รวม 830 คนละ 208k
```

- FR-18 ทำสำเนารอบเก่า (Duplicate) เพื่อสร้างรอบใหม่เร็วขึ้น
- FR-19 ลบรอบแบบ soft delete (กู้คืนได้)

### 3.4 ประวัติ (History)
- FR-20 หน้ารายการรอบทั้งหมด เรียงตามวันที่ล่าสุด
- FR-21 ค้นหา/กรอง: ช่วงวันที่, ชื่อผู้เล่น, ชื่อไอเทม, สถานะ
- FR-22 เปิดดูรายละเอียดรอบเก่าได้ครบ (ไอเทม/ราคา/คน/สถานะ)
- FR-23 **Audit log**: บันทึกว่าใคร (หัว/รอง) แก้อะไร เมื่อไหร่ (เช่น "รองแก็ง เพิ่ม fairy 150k เวลา 18:20")
- FR-24 Export เป็น CSV

### 3.5 Dashboard
- FR-25 การ์ดสรุป: จำนวนรอบทั้งหมด, มูลค่ารวมที่แบ่งไปทั้งหมด, เฉลี่ยต่อรอบ, ยอดที่ยังค้างจ่าย
- FR-26 กราฟมูลค่ารวมรายวัน/สัปดาห์/เดือน (line/bar)
- FR-27 อันดับผู้เล่น: ได้รับรวมสะสมต่อคน, จำนวนรอบที่เข้าร่วม
- FR-28 ไอเทมยอดนิยม/มูลค่าสูงสุด (Top items)
- FR-29 รายการค้างจ่าย: ใครยังไม่ได้ติ๊ก ✅ ในรอบไหน
- FR-30 ตัวกรองช่วงวันที่ (วันนี้ / 7 วัน / 30 วัน / กำหนดเอง)

---

## 4. การเชื่อม Supabase (คำตอบ: ควรเชื่อม)

**ควรเชื่อม Supabase** เพราะตอบโจทย์ที่ถามมาโดยตรง:

| ความต้องการ | Supabase ช่วยอย่างไร |
|---|---|
| หัวแก็ง/รองแก็งเปิดกันคนละที่ ข้อมูลตรงกัน | ข้อมูลอยู่บน Postgres กลาง ไม่ใช่ในเครื่อง |
| เห็นการแก้ไขของอีกคนทันที | Realtime subscription |
| ดูประวัติ + วันที่ | ทุกตารางมี `created_at` / `updated_at` + ตาราง audit log |
| แยกสิทธิ์หัว/รอง/สมาชิก | Supabase Auth + Row Level Security (RLS) |
| ใช้ฟรีได้สำหรับขนาดนี้ | Free tier เพียงพอ |

> ถ้าไม่ใช้ Supabase (เก็บใน localStorage) จะ **เห็นประวัติข้ามเครื่องไม่ได้** และข้อมูลหายถ้าล้าง browser

### 4.1 Authentication
- Login ด้วย Email magic link หรือ Discord OAuth (เหมาะกับกลุ่มเกม)
- Session จัดการโดย Supabase Auth

### 4.2 Realtime
- Subscribe ตาราง `sessions`, `session_items`, `session_members` ของแก็งตัวเอง
- เมื่อรองแก็งแก้ไอเทม หน้าจอหัวแก็งอัปเดตเอง ไม่ต้องรีเฟรช

### 4.3 Row Level Security
- ผู้ใช้เห็นเฉพาะข้อมูลของแก็งที่ตนเป็นสมาชิก
- เขียน/แก้/ลบได้เฉพาะ role `owner` และ `admin`
- `audit_logs` เป็น insert-only (ห้ามแก้/ลบ)

---

## 5. โครงสร้างฐานข้อมูล (Data Model)

```sql
-- แก็ง
create table gangs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rounding_mode text not null default 'ceil_1000', -- ceil_1000 | floor | round | none
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- สมาชิกที่ล็อกอิน (ผูก user กับแก็ง + role)
create table gang_users (
  gang_id uuid references gangs(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  primary key (gang_id, user_id)
);

-- รายชื่อผู้เล่นในเกม (รายชื่อกลาง)
create table players (
  id uuid primary key default gen_random_uuid(),
  gang_id uuid not null references gangs(id) on delete cascade,
  name text not null,
  game_id text,                 -- เช่น 297189 (optional)
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- รอบแบ่งของ
create table sessions (
  id uuid primary key default gen_random_uuid(),
  gang_id uuid not null references gangs(id) on delete cascade,
  title text,
  session_date date not null default current_date,
  status text not null default 'open' check (status in ('draft','open','completed')),
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz         -- soft delete
);

-- ไอเทมในรอบ
create table session_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  name text not null,
  price bigint not null check (price >= 0),
  quantity int not null default 1 check (quantity > 0),
  note text,
  created_at timestamptz not null default now()
);

-- ผู้เข้าร่วมในรอบ + สถานะจ่าย
create table session_players (
  session_id uuid references sessions(id) on delete cascade,
  player_id uuid references players(id),
  share_amount bigint,           -- ยอดที่ต้องได้/จ่าย ณ ตอนนั้น (snapshot)
  is_paid boolean not null default false,
  paid_at timestamptz,
  primary key (session_id, player_id)
);

-- (ทางเลือก) ไอเทมที่หารไม่ครบทุกคน
create table session_item_players (
  item_id uuid references session_items(id) on delete cascade,
  player_id uuid references players(id),
  primary key (item_id, player_id)
);

-- ประวัติการแก้ไข
create table audit_logs (
  id bigserial primary key,
  gang_id uuid not null references gangs(id) on delete cascade,
  session_id uuid references sessions(id) on delete set null,
  actor_id uuid references auth.users(id),
  action text not null,          -- item.add, item.update, item.delete, player.add, paid.toggle, ...
  detail jsonb,
  created_at timestamptz not null default now()
);

create index on sessions (gang_id, session_date desc);
create index on audit_logs (gang_id, created_at desc);
```

> หมายเหตุ: เก็บ `share_amount` เป็น snapshot ตอนปิดรอบ เพื่อให้ประวัติไม่เพี้ยน แม้ภายหลังแก้ราคาไอเทมหรือปัดเศษต่างไป

---

## 6. กติกาการคำนวณ

```
total      = Σ (item.price × item.quantity)
perPerson  = total / playerCount
display    = apply rounding_mode(perPerson)
```

ตัวอย่าง: 830,000 ÷ 4 = 207,500 → ปัดขึ้นหลักพัน = **208,000 (208k)**

- ถ้าปัดขึ้น ยอดรวมที่เก็บจะเกินเล็กน้อย (208k × 4 = 832k) ให้แสดง "ส่วนเกิน 2,000" ให้เห็นชัดเจน
- กรณีไม่มีผู้เข้าร่วม (0 คน) ห้ามหาร ให้แสดง "-" แทน
- ใช้ integer (bigint) ทั้งหมด หลีกเลี่ยง float
- ฟอร์แมตตัวเลข: `250,000` และแบบย่อ `250k` / `1.2m`

---

## 7. หน้าจอ (UI/Pages)

1. **Login**
2. **Dashboard** (หน้าแรก) — การ์ดสรุป + กราฟ + รายการค้างจ่าย
3. **สร้าง/แก้รอบ** — ฟอร์มเลือกคน + ตารางไอเทม (เพิ่ม/ลบแถวได้) + แถบสรุป "รวม / ÷ N = คนละ X" ติดด้านล่างตลอด
4. **รายละเอียดรอบ** — รายชื่อคนพร้อมปุ่มติ๊ก ✅, ปุ่ม Copy ข้อความ Discord, ดู audit log ของรอบ
5. **ประวัติ** — ตาราง + ตัวกรอง + Export CSV
6. **จัดการผู้เล่น** — เพิ่ม/แก้/ปิดการใช้งาน
7. **ตั้งค่าแก็ง** — ชื่อแก็ง, การปัดเศษ, จัดการสมาชิก/สิทธิ์, รหัสเชิญ

แนวทาง UI:
- ธีมมืด โทนน้ำเงิน/ม่วง ใกล้เคียงหน้าเกมในภาพ (ปรับได้)
- Responsive ใช้บนมือถือได้ดี (คนส่วนใหญ่เปิดระหว่างเล่นเกม)
- ภาษาไทยเป็นหลัก

---

## 8. Non-Functional Requirements

- NFR-1 โหลดหน้าแรก < 2 วินาที บนเครือข่ายมือถือทั่วไป
- NFR-2 คำนวณผลทันทีที่พิมพ์ (client-side) ไม่ต้องรอ server
- NFR-3 ข้อมูลตรงกันทุกอุปกรณ์ภายใน ~1-2 วินาที (Realtime)
- NFR-4 ปลอดภัย: บังคับ RLS ทุกตาราง, ไม่เก็บ secret ฝั่ง client (ใช้เฉพาะ anon key)
- NFR-5 ป้องกันการแก้ไขชนกัน: ใช้ `updated_at` ตรวจ (optimistic locking) แล้วแจ้งเตือนถ้ามีคนแก้ก่อน
- NFR-6 รองรับ Unicode / ภาษาไทยเต็มรูปแบบ
- NFR-7 สำรองข้อมูล: ใช้ backup ของ Supabase + ปุ่ม Export CSV

---

## 9. Tech Stack ที่แนะนำ

| ส่วน | เทคโนโลยี |
|---|---|
| Frontend | Next.js (App Router) + TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| Charts | Recharts |
| State/Data | TanStack Query + Supabase JS client |
| Backend/DB/Auth/Realtime | Supabase (Postgres, Auth, RLS, Realtime) |
| Hosting | Vercel |

---

## 10. แผนพัฒนา (Milestones)

| Phase | เนื้อหา | ผลลัพธ์ |
|---|---|---|
| **MVP (1)** | ตั้งค่า Supabase + Auth, ผู้เล่น, สร้างรอบ, ไอเทม, คำนวณหารต่อคน, ติ๊ก ✅, Copy ข้อความ | ใช้แทนการพิมพ์ใน Discord ได้ |
| **Phase 2** | ประวัติ + ตัวกรอง, Role หัว/รอง, Realtime, Audit log | หัว/รองใช้คนละที่ได้ |
| **Phase 3** | Dashboard + กราฟ + อันดับ + ค้างจ่าย, Export CSV | ภาพรวมครบ |
| **Phase 4** | ไอเทมหารไม่ครบทุกคน, หลายแก็ง, แจ้งเตือน Discord webhook | ส่วนเสริม |

---

## 11. Acceptance Criteria (เกณฑ์ตรวจรับ MVP)

- [ ] ใส่ 4 คน + 5 ไอเทมตามภาพ แล้วระบบแสดงรวม **830,000** และคนละ **208k** ถูกต้อง
- [ ] เพิ่ม/ลบ ไอเทมหรือคนแล้วตัวเลขอัปเดตทันทีโดยไม่ต้องกดบันทึก
- [ ] พิมพ์ราคา `250k` ระบบแปลงเป็น 250,000 ได้
- [ ] ติ๊ก ✅ ต่อคนแล้วบันทึกเวลา และรีเฟรชแล้วสถานะยังอยู่
- [ ] เปิดจาก 2 เครื่อง (หัวแก็ง + รองแก็ง) เห็นข้อมูลเดียวกัน และแก้ไขฝั่งหนึ่งอีกฝั่งเห็นอัตโนมัติ
- [ ] หน้าประวัติเห็นรอบเก่าพร้อมวันที่ และเปิดดูรายละเอียดได้
- [ ] สมาชิกทั่วไปแก้ไขข้อมูลไม่ได้
- [ ] ปุ่ม Copy ให้ข้อความรูปแบบเดียวกับตัวอย่างใน FR-17

---

## 12. คำถามที่ต้องยืนยันเพิ่ม (Open Questions)

1. การหาร "คนละ 208k" ต้องการปัดขึ้นเป็นหลักพัน หรือใช้ 207,500 ตามจริง?
2. ✅ หมายถึง "จ่ายเงินแล้ว" หรือ "รับของ/เงินแล้ว"? (กระทบชื่อ field และข้อความในหน้าจอ)
3. มีไอเทมที่ไม่ได้หารทุกคนบ่อยไหม (เปิดใช้ FR-14 ตั้งแต่ MVP หรือไม่)?
4. ต้องการ login ด้วย Discord หรือ Email?
5. มีหลายแก็งในระบบเดียวหรือแก็งเดียวพอ?
6. สกุลเงินในเกมมีหน่วยอื่นนอกจากตัวเลขล้วนหรือไม่ (เช่น zeny, adena)?
