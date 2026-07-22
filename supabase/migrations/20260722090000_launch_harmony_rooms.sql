create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

alter table public.rooms alter column host_id drop not null;
alter table public.rooms add column if not exists is_system boolean not null default false;
alter table public.rooms add column if not exists note_count integer not null default 0 check (note_count >= 0);
alter table public.room_members add column if not exists last_seen_at timestamptz not null default now();

alter table public.messages drop constraint if exists messages_text_check;
alter table public.messages add constraint messages_text_check check (char_length(btrim(text)) between 1 and 280);

create index if not exists rooms_host_id_idx on public.rooms(host_id);
create index if not exists rooms_created_at_idx on public.rooms(created_at desc);
create unique index if not exists rooms_system_name_idx on public.rooms(lower(name)) where is_system;
create index if not exists room_members_user_id_idx on public.room_members(user_id);
create index if not exists room_members_last_seen_at_idx on public.room_members(last_seen_at);
create index if not exists messages_user_id_created_at_idx on public.messages(user_id, created_at desc);
create index if not exists messages_room_id_created_at_idx on public.messages(room_id, created_at desc);

drop policy if exists "Rooms are visible to members or public" on public.rooms;
drop policy if exists "Members can view room members" on public.room_members;
drop policy if exists "Members can view room messages" on public.messages;
drop policy if exists "Members can insert room messages" on public.messages;
drop policy if exists rooms_select on public.rooms;
drop policy if exists room_members_select on public.room_members;
drop policy if exists messages_select on public.messages;

create policy rooms_select on public.rooms
for select to authenticated
using (
  not is_private
  or host_id = (select auth.uid())
  or exists (
    select 1 from public.room_members rm
    where rm.room_id = rooms.id and rm.user_id = (select auth.uid())
  )
);

create policy room_members_select on public.room_members
for select to authenticated
using (user_id = (select auth.uid()));

create policy messages_select on public.messages
for select to authenticated
using (
  exists (
    select 1 from public.room_members rm
    where rm.room_id = messages.room_id and rm.user_id = (select auth.uid())
  )
);

revoke all on public.rooms, public.room_members, public.messages from public, anon, authenticated;
grant select on public.rooms, public.room_members, public.messages to authenticated;

drop function if exists public.create_room(text, boolean, text, text);
drop function if exists public.create_room(text, boolean, text, text, text);
drop function if exists public.join_room(uuid, text, text, text);
drop function if exists public.leave_room(uuid);
drop function if exists public.delete_room(uuid);
drop function if exists public.clear_room_messages(uuid);
drop function if exists public.get_room_connection(uuid, text);
drop function if exists public.update_room_scale(uuid, text, text);

create schema if not exists harmony_private;
revoke all on schema harmony_private from public, anon;

create or replace function harmony_private.assert_user()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  return actor;
end;
$$;

create or replace function harmony_private.valid_profile(p_username text, p_color text)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if char_length(btrim(p_username)) not between 1 and 24 then
    raise exception 'Musician names must be between 1 and 24 characters.' using errcode = '22023';
  end if;
  if p_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Choose a valid aura color.' using errcode = '22023';
  end if;
end;
$$;

create or replace function harmony_private.create_room_impl(
  p_name text,
  p_is_private boolean,
  p_username text,
  p_color text,
  p_access_code text default null
)
returns table (
  id uuid, name text, is_private boolean, host_id uuid,
  realtime_topic text, creator_access_code text
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  actor uuid := harmony_private.assert_user();
  clean_name text := btrim(p_name);
  clean_username text := btrim(p_username);
  created public.rooms;
begin
  perform harmony_private.valid_profile(clean_username, p_color);
  if char_length(clean_name) not between 2 and 40 then
    raise exception 'Room names must be between 2 and 40 characters.' using errcode = '22023';
  end if;
  if coalesce(p_is_private, false) and coalesce(p_access_code, '') !~ '^[0-9]{4,6}$' then
    raise exception 'Private room codes must be 4 to 6 digits.' using errcode = '22023';
  end if;
  if (select count(*) from public.rooms where host_id = actor and created_at > now() - interval '1 minute') >= 5 then
    raise exception 'Please wait a moment before creating another room.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.rooms where not is_system) >= 100 then
    raise exception 'Harmony is full right now. Please join an existing room.' using errcode = 'P0001';
  end if;

  insert into public.rooms(name, is_private, access_code_hash, host_id)
  values (
    clean_name,
    coalesce(p_is_private, false),
    case when coalesce(p_is_private, false) then crypt(p_access_code, gen_salt('bf')) else null end,
    actor
  ) returning * into created;

  insert into public.room_members(room_id, user_id, username, color, last_seen_at)
  values (created.id, actor, clean_username, p_color, now());

  return query select created.id, created.name, created.is_private, created.host_id,
    'room:' || created.realtime_key::text,
    case when created.is_private then p_access_code else null end;
end;
$$;

create or replace function harmony_private.join_room_impl(
  p_room_id uuid,
  p_username text,
  p_color text,
  p_access_code text default null
)
returns table (
  id uuid, name text, is_private boolean, host_id uuid,
  realtime_topic text, creator_access_code text
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  actor uuid := harmony_private.assert_user();
  clean_username text := btrim(p_username);
  target public.rooms;
begin
  perform harmony_private.valid_profile(clean_username, p_color);
  select * into target from public.rooms where rooms.id = p_room_id for update;
  if target.id is null then
    raise exception 'That room is no longer available.' using errcode = 'P0002';
  end if;
  if target.is_private and (p_access_code is null or target.access_code_hash <> crypt(p_access_code, target.access_code_hash)) then
    raise exception 'That private room code is not correct.' using errcode = '22023';
  end if;

  insert into public.room_members(room_id, user_id, username, color, joined_at, last_seen_at)
  values (target.id, actor, clean_username, p_color, now(), now())
  on conflict (room_id, user_id) do update
    set username = excluded.username, color = excluded.color, last_seen_at = now();

  return query select target.id, target.name, target.is_private, target.host_id,
    'room:' || target.realtime_key::text, null::text;
end;
$$;

create or replace function harmony_private.leave_room_impl(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor uuid := harmony_private.assert_user();
begin
  delete from public.room_members where room_id = p_room_id and user_id = actor;
  delete from public.rooms r
  where r.id = p_room_id and not r.is_system
    and not exists (select 1 from public.room_members rm where rm.room_id = r.id);
end;
$$;

create or replace function harmony_private.heartbeat_room_impl(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor uuid := harmony_private.assert_user();
begin
  update public.room_members set last_seen_at = now()
  where room_id = p_room_id and user_id = actor;
  if not found then
    raise exception 'You are no longer a member of this room.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function harmony_private.send_room_message_impl(p_room_id uuid, p_text text)
returns table (
  id uuid, room_id uuid, user_id uuid, username text,
  color text, text text, created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor uuid := harmony_private.assert_user();
  clean_text text := btrim(p_text);
  member public.room_members;
  created public.messages;
begin
  if char_length(clean_text) not between 1 and 280 then
    raise exception 'Messages must be between 1 and 280 characters.' using errcode = '22023';
  end if;
  select * into member from public.room_members
  where room_members.room_id = p_room_id and room_members.user_id = actor;
  if member.user_id is null then
    raise exception 'Join the room before chatting.' using errcode = '42501';
  end if;
  if (select count(*) from public.messages where messages.user_id = actor and created_at > now() - interval '10 seconds') >= 12 then
    raise exception 'You are sending messages too quickly.' using errcode = 'P0001';
  end if;

  insert into public.messages(room_id, user_id, username, color, text)
  values (p_room_id, actor, member.username, member.color, clean_text)
  returning * into created;

  delete from public.messages old
  where old.room_id = p_room_id and old.id in (
    select prunable.id from public.messages prunable
    where prunable.room_id = p_room_id
    order by prunable.created_at desc
    offset 100
  );

  return query select created.id, created.room_id, created.user_id,
    created.username, created.color, created.text, created.created_at;
end;
$$;

create or replace function harmony_private.record_room_notes_impl(p_room_id uuid, p_amount integer)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor uuid := harmony_private.assert_user();
begin
  if p_amount not between 1 and 32 then
    raise exception 'Invalid note count.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.room_members where room_id = p_room_id and user_id = actor) then
    raise exception 'Join the room before playing.' using errcode = '42501';
  end if;
  update public.rooms set note_count = note_count + p_amount, updated_at = now() where id = p_room_id;
end;
$$;

create or replace function harmony_private.cleanup_empty_rooms()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  delete from public.room_members where last_seen_at < now() - interval '60 seconds';
  delete from public.rooms r
  where not r.is_system
    and not exists (select 1 from public.room_members rm where rm.room_id = r.id);
end;
$$;

create or replace function public.create_room(p_name text, p_is_private boolean, p_username text, p_color text, p_access_code text default null)
returns table (id uuid, name text, is_private boolean, host_id uuid, realtime_topic text, creator_access_code text)
language sql security invoker set search_path = pg_catalog
as $$ select * from harmony_private.create_room_impl(p_name, p_is_private, p_username, p_color, p_access_code) $$;

create or replace function public.join_room(p_room_id uuid, p_username text, p_color text, p_access_code text default null)
returns table (id uuid, name text, is_private boolean, host_id uuid, realtime_topic text, creator_access_code text)
language sql security invoker set search_path = pg_catalog
as $$ select * from harmony_private.join_room_impl(p_room_id, p_username, p_color, p_access_code) $$;

create or replace function public.leave_room(p_room_id uuid)
returns void language sql security invoker set search_path = pg_catalog
as $$ select harmony_private.leave_room_impl(p_room_id) $$;

create or replace function public.heartbeat_room(p_room_id uuid)
returns void language sql security invoker set search_path = pg_catalog
as $$ select harmony_private.heartbeat_room_impl(p_room_id) $$;

create or replace function public.send_room_message(p_room_id uuid, p_text text)
returns table (id uuid, room_id uuid, user_id uuid, username text, color text, text text, created_at timestamptz)
language sql security invoker set search_path = pg_catalog
as $$ select * from harmony_private.send_room_message_impl(p_room_id, p_text) $$;

create or replace function public.record_room_notes(p_room_id uuid, p_amount integer)
returns void language sql security invoker set search_path = pg_catalog
as $$ select harmony_private.record_room_notes_impl(p_room_id, p_amount) $$;

revoke all on all functions in schema public from public, anon;
revoke all on all functions in schema harmony_private from public, anon;
grant usage on schema harmony_private to authenticated;
grant execute on function harmony_private.assert_user() to authenticated;
grant execute on function harmony_private.valid_profile(text, text) to authenticated;
grant execute on function harmony_private.create_room_impl(text, boolean, text, text, text) to authenticated;
grant execute on function harmony_private.join_room_impl(uuid, text, text, text) to authenticated;
grant execute on function harmony_private.leave_room_impl(uuid) to authenticated;
grant execute on function harmony_private.heartbeat_room_impl(uuid) to authenticated;
grant execute on function harmony_private.send_room_message_impl(uuid, text) to authenticated;
grant execute on function harmony_private.record_room_notes_impl(uuid, integer) to authenticated;
grant execute on function public.create_room(text, boolean, text, text, text) to authenticated;
grant execute on function public.join_room(uuid, text, text, text) to authenticated;
grant execute on function public.leave_room(uuid) to authenticated;
grant execute on function public.heartbeat_room(uuid) to authenticated;
grant execute on function public.send_room_message(uuid, text) to authenticated;
grant execute on function public.record_room_notes(uuid, integer) to authenticated;

insert into public.rooms(name, is_private, host_id, is_system)
select seed.name, false, null, true
from (values ('Sunset Lounge'), ('Lavender Clouds'), ('Golden Hour')) as seed(name)
where not exists (select 1 from public.rooms r where r.is_system and lower(r.name) = lower(seed.name));

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'harmony-clean-empty-rooms';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule('harmony-clean-empty-rooms', '30 seconds', 'select harmony_private.cleanup_empty_rooms();');
end $$;
