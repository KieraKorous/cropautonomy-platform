-- 0014_devices_auto_live.sql
--
-- Per-device "auto go-live" switch.
--
-- Normally a paired phone asks to go live and a watcher must accept (the
-- live_requests gate in 0012). When auto_live_enabled is true, the API grants the
-- request immediately — the device streams without waiting for approval. Default
-- false keeps the safe "ask first" behavior; only managers+ can flip it (gated on
-- devices.update in the API).
--
-- Idempotent: safe to re-run.
--
-- Apply via: psql "$DATABASE_URL" -f packages/db/migrations/0014_devices_auto_live.sql
-- (or paste into the Supabase SQL editor).
------------------------------------------------------------------------------

alter table public.devices
  add column if not exists auto_live_enabled boolean not null default false;
