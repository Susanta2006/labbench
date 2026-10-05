CREATE TABLE public.shared_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  files jsonb NOT NULL,
  output text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);
GRANT ALL ON public.shared_workspaces TO service_role;
ALTER TABLE public.shared_workspaces ENABLE ROW LEVEL SECURITY;
CREATE INDEX shared_workspaces_expires_at_idx ON public.shared_workspaces (expires_at);
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('purge-expired-labbench-shares', '0 * * * *', $$DELETE FROM public.shared_workspaces WHERE expires_at <= now()$$);