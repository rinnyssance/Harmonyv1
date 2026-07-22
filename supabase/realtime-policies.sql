
-- Run through Supabase Studio so the realtime.messages owner applies the policies.
drop policy if exists harmony_realtime_read on realtime.messages;
drop policy if exists harmony_realtime_send on realtime.messages;

create policy harmony_realtime_read on realtime.messages
for select to authenticated
using (
  ((select realtime.topic()) = 'harmony:lobby' and extension in ('broadcast', 'presence'))
  or (
    extension in ('broadcast', 'presence')
    and exists (
      select 1 from public.rooms r
      join public.room_members rm on rm.room_id = r.id
      where 'room:' || r.realtime_key::text = (select realtime.topic())
        and rm.user_id = (select auth.uid())
    )
  )
);

create policy harmony_realtime_send on realtime.messages
for insert to authenticated
with check (
  ((select realtime.topic()) = 'harmony:lobby' and extension in ('broadcast', 'presence'))
  or (
    extension in ('broadcast', 'presence')
    and exists (
      select 1 from public.rooms r
      join public.room_members rm on rm.room_id = r.id
      where 'room:' || r.realtime_key::text = (select realtime.topic())
        and rm.user_id = (select auth.uid())
    )
  )
);


