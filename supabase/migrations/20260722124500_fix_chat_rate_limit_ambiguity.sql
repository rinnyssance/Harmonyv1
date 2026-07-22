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
  select * into member
  from public.room_members rm
  where rm.room_id = p_room_id and rm.user_id = actor;
  if member.user_id is null then
    raise exception 'Join the room before chatting.' using errcode = '42501';
  end if;
  if (
    select count(*)
    from public.messages recent
    where recent.user_id = actor
      and recent.created_at > now() - interval '10 seconds'
  ) >= 12 then
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
