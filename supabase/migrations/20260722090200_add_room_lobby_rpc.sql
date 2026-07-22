create or replace function harmony_private.list_rooms_impl()
returns table (
  id uuid,
  name text,
  is_private boolean,
  note_count integer,
  active_user_count bigint
)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select r.id, r.name, r.is_private, r.note_count,
    count(rm.user_id) filter (where rm.last_seen_at >= now() - interval '60 seconds') as active_user_count
  from public.rooms r
  left join public.room_members rm on rm.room_id = r.id
  where not r.is_private
    or r.host_id = auth.uid()
    or exists (
      select 1 from public.room_members mine
      where mine.room_id = r.id and mine.user_id = auth.uid()
    )
  group by r.id
  order by r.is_system desc, r.created_at asc;
$$;

create or replace function public.list_rooms()
returns table (id uuid, name text, is_private boolean, note_count integer, active_user_count bigint)
language sql security invoker set search_path = pg_catalog
as $$ select * from harmony_private.list_rooms_impl() $$;

revoke all on function harmony_private.list_rooms_impl() from public, anon;
revoke all on function public.list_rooms() from public, anon;
grant execute on function harmony_private.list_rooms_impl() to authenticated;
grant execute on function public.list_rooms() to authenticated;
