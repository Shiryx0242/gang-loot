-- =====================================================
-- Gang Loot Splitter : Supabase schema
-- วิธีใช้: Supabase Dashboard -> SQL Editor -> วางทั้งไฟล์ -> Run
-- =====================================================

-- ---------- Tables ----------

create table public.gangs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rounding_mode text not null default 'ceil_1000'
    check (rounding_mode in ('ceil_1000','floor_1000','round_1000','none')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.gang_users (
  gang_id uuid not null references public.gangs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member')),
  display_name text,
  joined_at timestamptz not null default now(),
  primary key (gang_id, user_id)
);

create table public.gang_invites (
  code text primary key default encode(gen_random_bytes(6), 'hex'),
  gang_id uuid not null references public.gangs(id) on delete cascade,
  role text not null default 'member' check (role in ('admin','member')),
  expires_at timestamptz not null default now() + interval '7 days',
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  gang_id uuid not null references public.gangs(id) on delete cascade,
  name text not null,
  game_id text,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  gang_id uuid not null references public.gangs(id) on delete cascade,
  title text,
  session_date date not null default current_date,
  status text not null default 'open' check (status in ('draft','open','completed')),
  note text,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.session_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  name text not null,
  price bigint not null check (price >= 0),
  quantity int not null default 1 check (quantity > 0),
  note text,
  created_at timestamptz not null default now()
);

create table public.session_players (
  session_id uuid not null references public.sessions(id) on delete cascade,
  player_id uuid not null references public.players(id),
  share_amount bigint,
  is_paid boolean not null default false,
  paid_at timestamptz,
  primary key (session_id, player_id)
);

-- ไอเทมที่หารไม่ครบทุกคน (ไม่มีแถว = หารทุกคน)
create table public.session_item_players (
  item_id uuid not null references public.session_items(id) on delete cascade,
  player_id uuid not null references public.players(id),
  primary key (item_id, player_id)
);

create table public.audit_logs (
  id bigserial primary key,
  gang_id uuid not null references public.gangs(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  actor_id uuid default auth.uid() references auth.users(id),
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

create table public.item_presets (
  id uuid primary key default gen_random_uuid(),
  gang_id uuid not null references public.gangs(id) on delete cascade,
  name text not null,
  default_price bigint not null default 0 check (default_price >= 0),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index item_presets_gang_name_uq
  on public.item_presets (gang_id, lower(name));
create index on public.item_presets (gang_id, sort_order);

create index on public.players (gang_id);
create index on public.sessions (gang_id, session_date desc);
create index on public.session_items (session_id);
create index on public.audit_logs (gang_id, created_at desc);

-- ---------- Helper functions ----------

create or replace function public.is_gang_member(p_gang uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from gang_users
                 where gang_id = p_gang and user_id = auth.uid());
$$;

create or replace function public.is_gang_admin(p_gang uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from gang_users
                 where gang_id = p_gang and user_id = auth.uid()
                   and role in ('owner','admin'));
$$;

create or replace function public.is_gang_owner(p_gang uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from gang_users
                 where gang_id = p_gang and user_id = auth.uid()
                   and role = 'owner');
$$;

-- ผู้สร้างแก็งกลายเป็น owner อัตโนมัติ
create or replace function public.handle_new_gang()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into gang_users (gang_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

create trigger on_gang_created
after insert on public.gangs
for each row execute function public.handle_new_gang();

-- อัปเดต updated_at อัตโนมัติ
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger sessions_touch
before update on public.sessions
for each row execute function public.touch_updated_at();

-- เข้าร่วมแก็งด้วยรหัสเชิญ
create or replace function public.join_gang(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  inv gang_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into inv from gang_invites
  where code = p_code and expires_at > now();

  if not found then
    raise exception 'invalid or expired invite code';
  end if;

  insert into gang_users (gang_id, user_id, role)
  values (inv.gang_id, auth.uid(), inv.role)
  on conflict (gang_id, user_id) do nothing;

  return inv.gang_id;
end;
$$;

revoke all on function public.join_gang(text) from public, anon;
grant execute on function public.join_gang(text) to authenticated;

-- ---------- Row Level Security ----------

alter table public.gangs                enable row level security;
alter table public.gang_users           enable row level security;
alter table public.gang_invites         enable row level security;
alter table public.players              enable row level security;
alter table public.sessions             enable row level security;
alter table public.session_items        enable row level security;
alter table public.session_players      enable row level security;
alter table public.session_item_players enable row level security;
alter table public.audit_logs           enable row level security;

-- gangs
create policy gangs_select on public.gangs for select to authenticated
  using (public.is_gang_member(id) or created_by = auth.uid());
create policy gangs_insert on public.gangs for insert to authenticated
  with check (created_by = auth.uid());
create policy gangs_update on public.gangs for update to authenticated
  using (public.is_gang_owner(id)) with check (public.is_gang_owner(id));
create policy gangs_delete on public.gangs for delete to authenticated
  using (public.is_gang_owner(id));

-- gang_users
create policy gu_select on public.gang_users for select to authenticated
  using (public.is_gang_member(gang_id));
create policy gu_update on public.gang_users for update to authenticated
  using (public.is_gang_owner(gang_id)) with check (public.is_gang_owner(gang_id));
create policy gu_delete on public.gang_users for delete to authenticated
  using (public.is_gang_owner(gang_id) or user_id = auth.uid());
-- การ insert ทำผ่าน trigger และ join_gang() เท่านั้น

-- gang_invites
create policy inv_select on public.gang_invites for select to authenticated
  using (public.is_gang_admin(gang_id));
create policy inv_insert on public.gang_invites for insert to authenticated
  with check (public.is_gang_admin(gang_id) and created_by = auth.uid());
create policy inv_delete on public.gang_invites for delete to authenticated
  using (public.is_gang_admin(gang_id));

-- players
create policy players_select on public.players for select to authenticated
  using (public.is_gang_member(gang_id));
create policy players_write on public.players for all to authenticated
  using (public.is_gang_admin(gang_id)) with check (public.is_gang_admin(gang_id));

-- sessions
create policy sessions_select on public.sessions for select to authenticated
  using (public.is_gang_member(gang_id));
create policy sessions_write on public.sessions for all to authenticated
  using (public.is_gang_admin(gang_id)) with check (public.is_gang_admin(gang_id));

-- session_items
create policy items_select on public.session_items for select to authenticated
  using (exists (select 1 from public.sessions s
                 where s.id = session_id and public.is_gang_member(s.gang_id)));
create policy items_write on public.session_items for all to authenticated
  using (exists (select 1 from public.sessions s
                 where s.id = session_id and public.is_gang_admin(s.gang_id)))
  with check (exists (select 1 from public.sessions s
                 where s.id = session_id and public.is_gang_admin(s.gang_id)));

-- session_players
create policy sp_select on public.session_players for select to authenticated
  using (exists (select 1 from public.sessions s
                 where s.id = session_id and public.is_gang_member(s.gang_id)));
create policy sp_write on public.session_players for all to authenticated
  using (exists (select 1 from public.sessions s
                 where s.id = session_id and public.is_gang_admin(s.gang_id)))
  with check (exists (select 1 from public.sessions s
                 where s.id = session_id and public.is_gang_admin(s.gang_id)));

-- session_item_players
create policy sip_select on public.session_item_players for select to authenticated
  using (exists (select 1 from public.session_items i
                 join public.sessions s on s.id = i.session_id
                 where i.id = item_id and public.is_gang_member(s.gang_id)));
create policy sip_write on public.session_item_players for all to authenticated
  using (exists (select 1 from public.session_items i
                 join public.sessions s on s.id = i.session_id
                 where i.id = item_id and public.is_gang_admin(s.gang_id)))
  with check (exists (select 1 from public.session_items i
                 join public.sessions s on s.id = i.session_id
                 where i.id = item_id and public.is_gang_admin(s.gang_id)));

-- audit_logs : อ่านได้ทุกสมาชิก, เพิ่มได้เฉพาะ admin, ห้ามแก้/ลบ
create policy audit_select on public.audit_logs for select to authenticated
  using (public.is_gang_member(gang_id));
create policy audit_insert on public.audit_logs for insert to authenticated
  with check (public.is_gang_admin(gang_id) and actor_id = auth.uid());

-- item_presets
alter table public.item_presets enable row level security;
create policy presets_select on public.item_presets for select to authenticated
  using (public.is_gang_member(gang_id));
create policy presets_write on public.item_presets for all to authenticated
  using (public.is_gang_admin(gang_id))
  with check (public.is_gang_admin(gang_id));

-- ---------- Realtime ----------

alter publication supabase_realtime add table
  public.sessions,
  public.session_items,
  public.session_players,
  public.players,
  public.item_presets;

-- ---------- Dashboard view ----------
-- ยอดรวมต่อรอบ (ใช้ security_invoker เพื่อให้ RLS ของผู้เรียกทำงาน)

create or replace view public.session_totals
with (security_invoker = true) as
select
  s.id as session_id,
  s.gang_id,
  s.session_date,
  s.status,
  coalesce((select sum(i.price * i.quantity) from public.session_items i
            where i.session_id = s.id), 0) as total,
  (select count(*) from public.session_players p
   where p.session_id = s.id) as player_count,
  (select count(*) from public.session_players p
   where p.session_id = s.id and p.is_paid) as paid_count
from public.sessions s
where s.deleted_at is null;
