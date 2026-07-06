CREATE TABLE IF NOT EXISTS public.team_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  team_name TEXT NOT NULL DEFAULT 'Tactical Chaos',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.team_settings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.team_settings TO authenticated;
GRANT ALL ON public.team_settings TO service_role;

ALTER TABLE public.team_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can view team settings" ON public.team_settings;
CREATE POLICY "Anyone authenticated can view team settings"
  ON public.team_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Only admins can manage team settings" ON public.team_settings;
CREATE POLICY "Only admins can manage team settings"
  ON public.team_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_team_settings_updated_at ON public.team_settings;
CREATE TRIGGER update_team_settings_updated_at
  BEFORE UPDATE ON public.team_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.team_settings (id, team_name)
VALUES (true, 'Tactical Chaos')
ON CONFLICT (id) DO UPDATE
SET team_name = EXCLUDED.team_name,
    updated_at = now();

UPDATE public.team_members
SET is_coach = true,
    updated_at = now()
WHERE steam_id IN (
  '76561199108435769',
  '1148170041',
  '76561198098107455',
  '137841727'
);
