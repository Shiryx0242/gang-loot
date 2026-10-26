-- =====================================================
-- Patch: ให้ทุกคนตั้ง "ชื่อที่แสดง" ของตัวเองได้ (ใช้ในหน้ากิจกรรม/ประวัติการแก้ไข)
-- รันหลัง schema.sql: Supabase -> SQL Editor -> วาง -> Run
-- (ถ้าไม่รัน แอปยังใช้งานได้ แต่ช่อง "ชื่อของฉัน" ในหน้าตั้งค่าจะบันทึกไม่ได้)
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
