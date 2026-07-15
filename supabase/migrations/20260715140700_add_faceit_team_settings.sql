INSERT INTO public.team_settings (key, value)
VALUES
  ('faceit_team_url', ''),
  ('faceit_team_id', ''),
  ('faceit_championship_id', '')
ON CONFLICT (key) DO NOTHING;
