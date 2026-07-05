
-- 1) book column on strategies
ALTER TABLE public.strategies ADD COLUMN IF NOT EXISTS book TEXT NOT NULL DEFAULT 'estrategias';

-- 2) integrations table (per-user)
CREATE TABLE IF NOT EXISTS public.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  teamup_calendar_key TEXT,
  teamup_api_key TEXT,
  teamup_last_sync TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.integrations TO authenticated;
GRANT ALL ON public.integrations TO service_role;

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own integrations"
  ON public.integrations FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_integrations_updated_at
  BEFORE UPDATE ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) teamup metadata on agenda_events for round-trip sync
ALTER TABLE public.agenda_events ADD COLUMN IF NOT EXISTS teamup_event_id TEXT;
CREATE INDEX IF NOT EXISTS idx_agenda_events_teamup ON public.agenda_events(teamup_event_id);
