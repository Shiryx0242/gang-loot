-- =====================================================
-- Patch:
-- 1. ให้ทุกคนตั้ง "ชื่อที่แสดง" ของตัวเองได้ (ใช้ในหน้ากิจกรรม/ประวัติการแก้ไข)
-- 2. เพิ่มตาราง item_presets สำหรับเก็บรายการไอเทมสำเร็จรูปของแก็ง
-- รันหลัง schema.sql: Supabase -> SQL Editor -> วาง -> Run
-- =====================================================

create or replace function public.set_my_display_name(p_gang uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update gang_users
     set display_name = nullif(trim(p_name), '')
   where gang_id = p_gang and user_id = auth.uid();
end;
$$;

revoke all on function public.set_my_display_name(uuid, text) from public, anon;
grant execute on function public.set_my_display_name(uuid, text) to authenticated;

-- ---------- Item Presets (ไอเทมสำเร็จรูป) ----------

create table if not exists public.item_presets (
  id uuid primary key default gen_random_uuid(),
  gang_id uuid not null references public.gangs(id) on delete cascade,
  name text not null,
  default_price bigint not null default 0 check (default_price >= 0),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists item_presets_gang_name_uq
  on public.item_presets (gang_id, lower(name));
create index if not exists item_presets_gang_sort_idx
  on public.item_presets (gang_id, sort_order);

alter table public.item_presets enable row level security;

drop policy if exists presets_select on public.item_presets;
create policy presets_select on public.item_presets for select to authenticated
  using (public.is_gang_member(gang_id));

drop policy if exists presets_write on public.item_presets;
create policy presets_write on public.item_presets for all to authenticated
  using (public.is_gang_admin(gang_id))
  with check (public.is_gang_admin(gang_id));

do $$
begin
  alter publication supabase_realtime add table public.item_presets;
exception
  when duplicate_object then null;
end;
$$;
