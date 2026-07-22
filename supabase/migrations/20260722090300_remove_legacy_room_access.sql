drop policy if exists "visible rooms" on public.rooms;
drop policy if exists "members view memberships" on public.room_members;
drop policy if exists "members view messages" on public.messages;
drop policy if exists "members send messages" on public.messages;

drop function if exists public.get_room_connection(uuid);
drop index if exists public.messages_room_id_created_at_idx;
