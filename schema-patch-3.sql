-- =====================================================
-- Patch 3: เบอร์รับเงินของแก็ง (ใช้ในหน้าใบสรุปรอบ)
-- รัน: Supabase -> SQL Editor -> วาง -> Run
-- =====================================================

alter table public.gangs add column if not exists pay_number text;

update public.gangs set pay_number = '180772' where pay_number is null;

-- หัวแก็งและรองแก็งแก้เบอร์ได้ (policy gangs_update เดิมอนุญาตเฉพาะ owner)
create or replace function public.set_gang_pay_number(p_gang uuid, p_number text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_gang_admin(p_gang) then
    raise exception 'not allowed';
  end if;
  update public.gangs set pay_number = nullif(trim(p_number), '') where id = p_gang;
end;
$$;

revoke all on function public.set_gang_pay_number(uuid, text) from public, anon;
grant execute on function public.set_gang_pay_number(uuid, text) to authenticated;
