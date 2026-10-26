-- =====================================================
-- Patch 2:
-- 1. เพิ่มสถานะ "เข้าแก็งค์" (in_gang)
-- 2. เพิ่มเวลาของรอบ (sessions.session_time)
-- 3. เพิ่มตาราง title_presets (หัวข้อรอบ เช่น Airdrop, Battle Force, Ultra Bolter)
-- รัน: Supabase -> SQL Editor -> วาง -> Run
-- =====================================================

alter table public.sessions drop constraint if exists sessions_status_check;
alter table public.sessions add constraint sessions_status_check
  check (status in ('draft','open','completed','in_gang'));

alter table public.sessions add column if not exists session_time time;

create table if not exists public.title_presets (
  id uuid primary key default gen_random_uuid(),
  gang_id uuid not null references public.gangs(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists title_presets_gang_name_uq
  on public.title_presets (gang_id, lower(name));

alter table public.title_presets enable row level security;

drop policy if exists title_presets_select on public.title_presets;
create policy title_presets_select on public.title_presets for select to authenticated
  using (public.is_gang_member(gang_id));

drop policy if exists title_presets_write on public.title_presets;
create policy title_presets_write on public.title_presets for all to authenticated
  using (public.is_gang_admin(gang_id))
  with check (public.is_gang_admin(gang_id));

insert into public.title_presets (gang_id, name, sort_order)
select g.id, v.name, v.ord
from public.gangs g
cross join (values ('Airdrop', 0), ('Battle Force', 1), ('Ultra Bolter', 2)) as v(name, ord)
on conflict do nothing;
