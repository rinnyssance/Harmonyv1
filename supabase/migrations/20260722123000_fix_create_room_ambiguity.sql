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
  if (
    select count(*)
    from public.rooms r
    where r.host_id = actor
      and r.created_at > now() - interval '1 minute'
  ) >= 5 then
    raise exception 'Please wait a moment before creating another room.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.rooms r where not r.is_system) >= 100 then
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
