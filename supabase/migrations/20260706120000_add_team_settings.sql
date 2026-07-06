-- Team settings: stores configurable team-level settings (name, etc.)
CREATE TABLE IF NOT EXISTS public.team_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.team_settings (key, value)
VALUES ('team_name', 'Tactical Chaos')
ON CONFLICT (key) DO NOTHING;

GRANT SELECT ON public.team_settings TO authenticated;
GRANT ALL ON public.team_settings TO service_role;

ALTER TABLE public.team_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view team settings"
  ON public.team_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage team settings"
  ON public.team_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
