-- Applied to mfplugin-staging as migration 20261108164451.
create index if not exists mf_order_messages_sender_idx on public.mf_order_messages(sender_user_id) where sender_user_id is not null;
