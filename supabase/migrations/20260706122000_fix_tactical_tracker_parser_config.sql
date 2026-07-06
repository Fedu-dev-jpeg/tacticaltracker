INSERT INTO public.team_settings (key, value)
VALUES ('team_name', 'Tactical Chaos')
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
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
