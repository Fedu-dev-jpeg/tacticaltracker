INSERT INTO public.team_settings (key, value)
VALUES
  ('faceit_team_url', 'https://www.faceit.com/es/teams/6a56e77c-52aa-4f9f-aa30-7cc4a1519919'),
  ('faceit_team_id', '6a56e77c-52aa-4f9f-aa30-7cc4a1519919'),
  ('faceit_league_url', 'https://www.faceit.com/es/cs2/league/esea%20league/a14b8616-45b9-4581-8637-4dfd0b5f6af8/ec187700-30e2-4245-b5e2-daa762db12fc/overview'),
  ('faceit_league_id', 'a14b8616-45b9-4581-8637-4dfd0b5f6af8'),
  ('faceit_season_id', 'ec187700-30e2-4245-b5e2-daa762db12fc'),
  ('faceit_championship_id', '')
ON CONFLICT (key) DO NOTHING;
